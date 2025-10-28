import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { petition } = await req.json();

    const prompt = `Você é um DESEMBARGADOR de TRF analisando uma petição de salário-maternidade. Sua missão: PREPARAR A PETIÇÃO PARA EVENTUAL RECURSO.

PETIÇÃO ANALISADA:
${petition}

TAREFA: Retorne um JSON com análise recursiva preventiva:

{
  "pontos_a_reforcar": [
    {
      "ponto": "Fundamentação legal sobre dispensa de carência",
      "motivo": "Juízes de primeira instância frequentemente exigem carência indevidamente",
      "como_reforcar": "Adicionar parágrafo específico citando art. 39, parágrafo único, e precedente do TRF4 explicando que segurada especial NÃO precisa de carência",
      "prioridade": "alta"
    }
  ],
  "jurisprudencias_recursal_sugeridas": [
    {
      "tribunal": "TRF4",
      "numero": "AC 5012345-67.2020.4.04.9999",
      "tese": "Reforma de sentença que indeferiu salário-maternidade por ausência de prova",
      "por_que_incluir": "Demonstra que TRF4 reforma sentenças desfavoráveis nestes casos",
      "onde_incluir": "Capítulo DO DIREITO, ao final, como reforço"
    }
  ],
  "previsao_pontos_criticos_juiz": [
    {
      "ponto_critico": "Juiz pode questionar autenticidade da autodeclaração",
      "probabilidade": "alta",
      "argumento_preventivo": "Incluir parágrafo explicando que autodeclaração tem presunção de veracidade e pode ser corroborada por testemunhas, conforme jurisprudência pacífica"
    }
  ],
  "sugestoes_tutela_urgencia": {
    "aplicavel": true,
    "fundamento": "Necessidade de subsistência da autora e do recém-nascido",
    "texto_sugerido": "Parágrafo específico para pedido de tutela antecipada"
  },
  "adaptacoes_finais": [
    {
      "secao": "DOS PEDIDOS",
      "adicionar": "Pedido expresso de honorários recursais em caso de sentença desfavorável",
      "justificativa": "Já preparar a petição para eventual apelação"
    }
  ],
  "risco_improcedencia_pos_analise": 25,
  "recomendacao_final": "A petição está bem fundamentada. Sugestões implementadas reduzirão risco de indeferimento de 40% para 25%."
}

FOQUE EM:
1. Antecipar objeções típicas de juízes de primeira instância
2. Reforçar pontos que costumam ser questionados
3. Sugerir jurisprudências de SEGUNDA INSTÂNCIA (TRFs) que reformaram sentenças
4. Preparar argumentos para eventual apelação
5. Incluir pedidos preventivos (tutela, honorários recursais)`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s otimizado

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
          error: 'Rate limit atingido.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos Lovable AI esgotados.',
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
      const analysis = JSON.parse(aiData.choices[0].message.content);

      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Análise recursiva demorou muito.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in analyze-petition-appellate:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
