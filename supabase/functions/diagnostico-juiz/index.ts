import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const JUIZ_SYSTEM_PROMPT = `Você é o **JUIZ Virtual**, um auditor especializado em petições previdenciárias de salário-maternidade rural.

## SUA MISSÃO:
Analisar criticamente a minuta da ação judicial e atribuir um **Score Global (0-100)** baseado em 5 dimensões:

1. **Prova Material (0-20)**: Início de prova material adequado, documentos contemporâneos, pluralidade documental
2. **Coerência Temporal (0-20)**: Cobertura da janela de 10-12 meses, ausência de lacunas críticas
3. **Tese e Jurisprudência (0-20)**: Fundamentação jurídica sólida, precedentes relevantes, súmulas aplicáveis
4. **Pedidos e Calculística (0-20)**: Pedidos completos, cálculo correto da RMI, valor da causa
5. **Redação e Clareza (0-20)**: Clareza, objetividade, estrutura lógica, ausência de contradições

## OUTPUTS OBRIGATÓRIOS:
Para cada dimensão, forneça:
- **Score (0-20)**
- **Pontos Fortes** (lista)
- **Pontos Fracos** (lista)

Depois, forneça:
- **Ajustes Obrigatórios (A)**: Impedem protocolo
- **Ajustes Recomendados (B)**: Aumentam chance de procedência
- **Ajustes Opcionais (C)**: Melhorias estilísticas

## CRITÉRIOS DE PONTUAÇÃO:
- **90-100**: Excelente, pronta para protocolo
- **80-89**: Muito boa, ajustes menores
- **70-79**: Boa, ajustes recomendados
- **60-69**: Regular, ajustes obrigatórios
- **0-59**: Insuficiente, revisão completa necessária

## FORMATO DE SAÍDA:
Retorne SEMPRE um JSON estruturado com o formato:
{
  "score_global": 85,
  "analise_prova_material": {
    "score": 18,
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."]
  },
  "analise_coerencia_temporal": {
    "score": 17,
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."]
  },
  "analise_tese_jurisprudencia": {
    "score": 16,
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."]
  },
  "analise_pedidos_calculistica": {
    "score": 18,
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."]
  },
  "analise_redacao_clareza": {
    "score": 16,
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."]
  },
  "ajustes_obrigatorios": ["..."],
  "ajustes_recomendados": ["..."],
  "ajustes_opcionais": ["..."],
  "recomendacao_final": "Texto livre com recomendação estratégica"
}

Seja RIGOROSO mas CONSTRUTIVO. Aponte gaps probatórios, inconsistências temporais, pedidos faltantes, cálculos incorretos.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, chatAnalysis, analysisReport, jurisprudenceData, thesisData, minuta } = await req.json();

    console.log("[Diagnóstico JUIZ] Processing case:", caseId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build comprehensive context for JUIZ
    const contextMessage = `# CONTEXTO DO CASO

## Chat Inteligente (Análise Inicial):
${JSON.stringify(chatAnalysis, null, 2)}

## Análise Jurídica:
${JSON.stringify(analysisReport, null, 2)}

## Jurisprudência Levantada:
${JSON.stringify(jurisprudenceData, null, 2)}

## Tese Consolidada:
${JSON.stringify(thesisData, null, 2)}

## MINUTA DA PETIÇÃO INICIAL:
${minuta}

---

Analise criticamente todos os aspectos e forneça o diagnóstico completo em JSON.`;

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: JUIZ_SYSTEM_PROMPT },
          { role: "user", content: contextMessage },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 3000,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error("[Diagnóstico JUIZ] OpenAI error:", error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;

    console.log("[Diagnóstico JUIZ] AI Response length:", aiResponse.length);

    // Extract JSON from response
    let diagnostico = null;
    const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        diagnostico = JSON.parse(jsonMatch[1]);
        console.log("[Diagnóstico JUIZ] Extracted diagnostico, score:", diagnostico.score_global);
      } catch (e) {
        console.error("[Diagnóstico JUIZ] Failed to parse JSON:", e);
        throw new Error("Falha ao processar resposta do JUIZ");
      }
    } else {
      // Try to parse the entire response as JSON
      try {
        diagnostico = JSON.parse(aiResponse);
      } catch (e) {
        console.error("[Diagnóstico JUIZ] No JSON found in response");
        throw new Error("Resposta do JUIZ não contém JSON válido");
      }
    }

    // Save to database
    const { error: updateError } = await supabase
      .from("cases")
      .update({
        diagnostico_juiz: diagnostico,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (updateError) {
      console.error("[Diagnóstico JUIZ] Error updating case:", updateError);
    }

    return new Response(
      JSON.stringify({
        diagnostico,
        rawResponse: aiResponse,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Diagnóstico JUIZ] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
