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
    const { petition, caseInfo, documents, analysis, jurisprudence, tese, judgeAnalysis } = await req.json();

    const prompt = `Você é um DESEMBARGADOR de TRF com VISÃO 360° do processo.

📁 CONTEXTO COMPLETO DO CASO:

**INFORMAÇÕES BÁSICAS:**
${JSON.stringify(caseInfo, null, 2)}

**DOCUMENTOS (${documents?.length || 0}):**
${documents?.map((d: any) => `- ${d.document_type}: ${d.file_name}`).join('\n') || 'Nenhum'}

**ANÁLISE PRÉVIA:**
${analysis ? `Probabilidade: ${analysis.probabilidade_sucesso}% | RMI: R$ ${analysis.rmi}` : 'Não realizada'}

**ANÁLISE DO JUIZ:**
${judgeAnalysis ? `Risco: ${judgeAnalysis.risco_improcedencia}% | Brechas: ${judgeAnalysis.brechas?.length || 0}` : 'Não realizada'}

**PETIÇÃO:**
${petition}

---

🎯 TAREFA: ANÁLISE RECURSIVA PREVENTIVA PARA TRF

RETORNE JSON com adaptações regionais e preventivas:

{
  "adaptacoes_regionais": [
    {
      "tipo": "foro",
      "adaptacao": "Subseção Judiciária correta baseada no endereço: ${caseInfo?.author_address || 'verificar endereço'}",
      "justificativa": "Competência territorial",
      "prioridade": "alta"
    },
    {
      "tipo": "estilo_argumentativo", 
      "adaptacao": "Usar linguagem direta e objetiva (estilo preferido do TRF da região)",
      "justificativa": "Aumenta chances de procedência",
      "prioridade": "media"
    }
  ],
  "pontos_a_reforcar": [
    {
      "ponto": "Título claro",
      "como_reforcar": "Texto específico",
      "prioridade": "alta|media|baixa"
    }
  ],
  "jurisprudencias_recursal": [
    {
      "tribunal": "TRF4",
      "tese": "Resumo",
      "onde_incluir": "Seção específica"
    }
  ],
  "risco_pos_analise": 20,
  "recomendacao": "Síntese executiva"
}

IMPORTANTE:
- Use o ENDEREÇO correto para determinar foro/subseção
- Seja RÁPIDO mas PRECISO
- Adaptações devem ser ACIONÁVEIS`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s otimizado

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit: Muitas requisições. Aguarde e tente novamente.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Sem créditos: Adicione créditos em Settings -> Workspace -> Usage.',
          code: 'NO_CREDITS'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[APPELLATE-MODULE] AI API error:', aiResponse.status, errorText);
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
