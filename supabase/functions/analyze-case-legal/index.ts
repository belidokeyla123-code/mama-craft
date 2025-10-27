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

    // Buscar dados completos do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError) throw caseError;

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    const { data: extractions } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId);

    const prompt = `Você é um advogado especialista em Direito Previdenciário. Analise este caso de salário-maternidade e forneça uma análise jurídica completa.

DADOS DO CASO:
${JSON.stringify(caseData, null, 2)}

DOCUMENTOS (${documents?.length || 0}):
${documents?.map(d => `- ${d.document_type}: ${d.file_name}`).join('\n') || 'Nenhum'}

EXTRAÇÕES:
${JSON.stringify(extractions, null, 2)}

TAREFA: Faça uma análise jurídica completa e retorne JSON com:
{
  "qualidade_segurada": {
    "tipo": "especial" | "urbana",
    "comprovado": boolean,
    "detalhes": "Explicação detalhada"
  },
  "carencia": {
    "necessaria": boolean,
    "cumprida": boolean,
    "meses_faltantes": number,
    "detalhes": "Explicação"
  },
  "cnis_analysis": {
    "periodos_urbanos": [{"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD", "empregador": "Nome"}],
    "periodos_rurais": [{"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD", "detalhes": "Descrição"}],
    "beneficios_anteriores": [{"tipo": "auxilio-maternidade", "data": "YYYY-MM-DD"}],
    "tempo_reconhecido_inss": {"anos": 0, "meses": 0}
  },
  "timeline": [
    {"periodo": "2015-2020", "tipo": "rural", "status": "reconhecido", "detalhes": "Atividade rural comprovada"}
  ],
  "rmi": {
    "valor": 1412.00,
    "base_calculo": "Salário mínimo",
    "situacao_especial": false,
    "observacoes": ""
  },
  "valor_causa": 5648.00,
  "probabilidade_exito": {
    "score": 85,
    "nivel": "alta" | "media" | "baixa",
    "justificativa": ["Razão 1", "Razão 2"],
    "pontos_fortes": ["Ponto forte 1"],
    "pontos_fracos": ["Ponto fraco 1"]
  },
  "recomendacoes": ["Recomendação 1"]
}

Considere:
- Para segurada especial: carência dispensada
- RMI = salário mínimo vigente (${caseData.salario_minimo_ref})
- Valor da causa = 4 meses × RMI
- Analise CNIS para identificar períodos reconhecidos pelo INSS
- Se há benefícios anteriores de maternidade = reconhecimento de atividade rural`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 60 segundos (análise mais complexa)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
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
      const analysisResult = JSON.parse(aiData.choices[0].message.content);

      // Atualizar RMI e valor_causa no caso
      if (analysisResult.rmi?.valor_final) {
        await supabase
          .from('cases')
          .update({
            rmi_calculated: analysisResult.rmi.valor_final,
            valor_causa: analysisResult.valor_causa
          })
          .eq('id', caseId);
      }

      // Salvar análise na tabela case_analysis
      const { error: insertError } = await supabase
        .from('case_analysis')
        .upsert({
          case_id: caseId,
          qualidade_segurada: analysisResult.qualidade_segurada,
          carencia: analysisResult.carencia,
          rmi: analysisResult.rmi,
          valor_causa: analysisResult.valor_causa,
          draft_payload: analysisResult,
          analyzed_at: new Date().toISOString()
        }, { onConflict: 'case_id' });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      return new Response(JSON.stringify(analysisResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Análise demorou muito. Tente com menos documentos.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in analyze-case-legal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
