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

    const prompt = `Você é um JUIZ FEDERAL experiente analisando esta petição inicial. Seja CRÍTICO e RIGOROSO.

PETIÇÃO:
${petition}

TAREFA: Analise a petição como um juiz e identifique:
1. BRECHAS ARGUMENTATIVAS - Onde o argumento é fraco ou falho
2. BRECHAS PROBATÓRIAS - Que documentos/provas estão faltando
3. BRECHAS JURÍDICAS - Fundamentos legais ausentes ou mal aplicados
4. CONTRADIÇÕES - Inconsistências no texto
5. RISCOS DE IMPROCEDÊNCIA - O que pode levar à rejeição

Retorne JSON:
{
  "brechas": [
    {
      "tipo": "probatoria" | "argumentativa" | "juridica",
      "descricao": "Descrição detalhada da brecha",
      "gravidade": "alta" | "media" | "baixa",
      "localizacao": "Em qual parte da petição está",
      "sugestao": "Como corrigir/melhorar",
      "documento_necessario": "Nome do documento que falta (se aplicável)"
    }
  ],
  "pontos_fortes": [
    "Ponto forte identificado"
  ],
  "pontos_fracos": [
    "Ponto fraco identificado"
  ],
  "risco_improcedencia": 35,
  "recomendacoes": [
    "Recomendação específica 1",
    "Recomendação específica 2"
  ],
  "sugestoes_melhoria": [
    {
      "secao": "Dos Fatos" | "Do Direito" | "Das Provas" | "Dos Pedidos",
      "sugestao": "O que melhorar nesta seção"
    }
  ]
}

Seja específico e prático nas sugestões.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 15 segundos (otimizado)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

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
          error: 'Timeout: Análise demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in analyze-petition-judge-view:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
