import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, userMessage, conversationHistory = [] } = await req.json();

    if (!caseId || !userMessage) {
      return new Response(
        JSON.stringify({ error: 'caseId e userMessage são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CHAT ASSISTANT] Processando mensagem para caso ${caseId}`);

    // Conectar ao Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError) {
      console.error('[CHAT ASSISTANT] Erro ao buscar caso:', caseError);
      return new Response(
        JSON.stringify({ error: 'Caso não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar documentos do caso
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    // Buscar extrações do caso
    const { data: extractions, error: extractionsError } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1);

    // Buscar validação do caso
    const { data: validation, error: validationError } = await supabase
      .from('document_validation')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1);

    // Montar contexto do caso
    const caseContext = {
      tipo_caso: caseData.tipo_caso || 'Salário-Maternidade',
      status: caseData.status || 'Novo',
      documentos: documents?.map(d => ({
        nome: d.file_name,
        tipo: d.document_type,
        status: d.status
      })) || [],
      dados_extraidos: extractions?.[0]?.entities || null,
      validacao: validation?.[0] || null
    };

    // Montar prompt do sistema
    const systemPrompt = `Você é um assistente jurídico especializado em casos de salário-maternidade para seguradas especiais rurais.

**CONTEXTO DO CASO ATUAL:**
- Tipo: ${caseContext.tipo_caso}
- Status: ${caseContext.status}
- Documentos enviados: ${caseContext.documentos.length}
- Dados extraídos: ${caseContext.dados_extraidos ? 'Sim' : 'Não'}

${caseContext.dados_extraidos ? `**DADOS DA CLIENTE:**
${JSON.stringify(caseContext.dados_extraidos, null, 2)}` : ''}

${caseContext.validacao ? `**STATUS DA VALIDAÇÃO:**
- Score: ${caseContext.validacao.score}/100
- Documentação suficiente: ${caseContext.validacao.is_sufficient ? 'Sim' : 'Não'}
- Documentos faltantes: ${caseContext.validacao.missing_docs?.length || 0}` : ''}

**SUAS RESPONSABILIDADES:**
1. Responder perguntas sobre o caso de forma clara e profissional
2. Sugerir próximos passos quando apropriado
3. Alertar sobre documentos faltantes ou problemas
4. Explicar requisitos legais quando necessário
5. Ser proativo em identificar possíveis problemas

**REGRAS:**
- Seja conciso mas completo
- Use linguagem profissional mas acessível
- Cite requisitos legais quando relevante
- Sempre baseie suas respostas nos dados do caso
- Se não tiver informação suficiente, peça mais detalhes

Responda de forma natural e útil.`;

    // Montar mensagens para OpenAI
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    // Chamar OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[CHAT ASSISTANT] OPENAI_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Serviço de IA não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CHAT ASSISTANT] Chamando OpenAI...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: messages,
        max_completion_tokens: 1000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[CHAT ASSISTANT] Erro OpenAI:', errorText);
      return new Response(
        JSON.stringify({ error: 'Erro ao processar resposta da IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices[0].message.content;

    console.log('[CHAT ASSISTANT] Resposta gerada com sucesso');

    // Salvar conversa no banco (opcional - para histórico)
    try {
      await supabase.from('chat_history').insert({
        case_id: caseId,
        user_message: userMessage,
        assistant_message: assistantMessage,
        context_snapshot: caseContext
      });
    } catch (historyError) {
      console.error('[CHAT ASSISTANT] Erro ao salvar histórico (não crítico):', historyError);
      // Não falhar a função se não conseguir salvar o histórico
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        context: caseContext
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CHAT ASSISTANT] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
