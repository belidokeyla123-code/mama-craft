import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError) throw caseError;

    // Buscar documentos
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    if (docsError) throw docsError;

    // Buscar extrações
    const { data: extractions } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId);

    // Preparar dados para IA
    const prompt = `Você é um especialista em validação de processos de salário-maternidade. Analise o caso abaixo e valide a documentação.

DADOS DO CASO:
- Nome da autora: ${caseData.author_name}
- CPF: ${caseData.author_cpf}
- Perfil: ${caseData.profile}
- Tipo de evento: ${caseData.event_type}
- Data do evento: ${caseData.event_date}
- Tem RA: ${caseData.has_ra ? 'Sim' : 'Não'}

DOCUMENTOS ENVIADOS (${documents.length} documentos):
${documents.map(d => `- ${d.document_type}: ${d.file_name}`).join('\n')}

INFORMAÇÕES EXTRAÍDAS:
${JSON.stringify(extractions, null, 2)}

TAREFA:
Valide se a documentação é suficiente para protocolar a ação. Retorne um JSON com:
{
  "score": number (0-10),
  "is_sufficient": boolean,
  "can_proceed": boolean,
  "checklist": [
    {"item": "Nome do documento", "status": "ok" | "missing" | "incomplete", "importance": "critical" | "high" | "medium"}
  ],
  "missing_docs": [
    {
      "doc_type": "Tipo do documento",
      "reason": "Por que é importante (explicação detalhada)",
      "importance": "critical" | "high" | "medium",
      "impact": "Como a falta disso impacta na ação"
    }
  ],
  "recommendations": ["Recomendação 1", "Recomendação 2"]
}

Documentos essenciais:
- Certidão de nascimento da criança (comprova o fato gerador)
- RG/CPF da autora (identificação)
- Comprovantes de atividade rural (para segurada especial)
- Autodeclaração rural (caracteriza a segurada especial)
- Documentos de propriedade/posse da terra (se aplicável)
- CNIS (histórico contributivo)`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 45 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atingido. Aguarde alguns segundos e tente novamente.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos Lovable AI esgotados. Adicione mais créditos.',
          code: 'NO_CREDITS'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const validationResult = JSON.parse(aiData.choices[0].message.content);

      // Salvar na tabela document_validation
      const { error: insertError } = await supabase
        .from('document_validation')
        .upsert({
          case_id: caseId,
          score: validationResult.score,
          is_sufficient: validationResult.is_sufficient,
          checklist: validationResult.checklist,
          missing_docs: validationResult.missing_docs,
          validation_details: validationResult,
          validated_at: new Date().toISOString()
        }, { onConflict: 'case_id' });

      if (insertError) throw insertError;

      return new Response(JSON.stringify(validationResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Validação demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in validate-case-documents:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
