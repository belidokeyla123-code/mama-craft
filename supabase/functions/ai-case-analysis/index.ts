import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Buscando casos ganhos para análise...');

    // Buscar casos com sentença procedente ou acordos
    const { data: wonCases, error: casesError } = await supabase
      .from('cases')
      .select(`
        *,
        case_financial(*),
        documents(document_type, file_name),
        extractions(entities, periodos_rurais, observations),
        document_validation(score, checklist)
      `)
      .or('status.eq.acordo,status.eq.sentenca')
      .order('created_at', { ascending: false })
      .limit(20);

    if (casesError) throw casesError;

    if (!wonCases || wonCases.length === 0) {
      return new Response(
        JSON.stringify({ 
          analysis: 'Ainda não há casos ganhos suficientes para análise. Continue protocolando e aguarde os primeiros resultados positivos!' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analisando ${wonCases.length} casos ganhos...`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    // Preparar dados estruturados dos casos
    const casesData = wonCases.map(caso => ({
      autora: caso.author_name,
      perfil: caso.profile,
      tipo_evento: caso.event_type,
      resultado: caso.status === 'acordo' ? 'Acordo' : 'Sentença Procedente',
      valor_recebido: caso.case_financial?.[0]?.valor_recebido || 0,
      documentos_apresentados: caso.documents?.map((d: any) => d.document_type) || [],
      score_documental: caso.document_validation?.[0]?.score || 0,
      checklist_cumprido: caso.document_validation?.[0]?.checklist || [],
      periodos_rurais: caso.extractions?.[0]?.periodos_rurais || [],
      observacoes: caso.extractions?.[0]?.observations || []
    }));

    const prompt = `
Você é um especialista em direito previdenciário especializado em análise de padrões de sucesso em processos de auxílio-maternidade.

Analise os casos GANHOS abaixo (acordos + sentenças procedentes) e identifique os padrões de sucesso:

**CASOS GANHOS:**
${JSON.stringify(casesData, null, 2)}

Forneça uma análise detalhada incluindo:

1. **PADRÕES DE SUCESSO IDENTIFICADOS:**
   - Quais documentos são mais comuns nos casos ganhos?
   - Qual perfil de segurada tem maior taxa de sucesso?
   - Qual score documental médio dos casos ganhos?
   - Quais checklist items são essenciais?

2. **ANÁLISE CRITERIOSA:**
   - O que está sendo feito CERTO nesses casos?
   - Quais documentações foram decisivas?
   - Quantos requisitos em média foram cumpridos?

3. **FÓRMULA DO SUCESSO:**
   - Liste os elementos essenciais presentes nos casos ganhos
   - Qual é o "template" de sucesso identificado?

4. **RECOMENDAÇÕES PRÁTICAS:**
   - Para atingir 100% de procedência, quais documentos SEMPRE incluir?
   - Quais cuidados tomar na coleta de documentação?
   - Checklist de requisitos essenciais para próximos casos

5. **META: 100% DE SUCESSO**
   - Roadmap para replicar o sucesso em todos os casos futuros
   - Protocolo de documentação recomendado

Seja específico, prático e focado em ações replicáveis. Use dados dos casos analisados.
`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em direito previdenciário focado em identificar padrões de sucesso em processos judiciais. Forneça análises práticas e acionáveis.'
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns instantes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos esgotados. Adicione créditos no painel Lovable.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Erro da API de IA:', response.status, errorText);
      throw new Error('Erro ao gerar análise com IA');
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    console.log('Análise de padrões gerada com sucesso');

    return new Response(
      JSON.stringify({ 
        analysis,
        totalCasesAnalyzed: wonCases.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função ai-case-analysis:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
