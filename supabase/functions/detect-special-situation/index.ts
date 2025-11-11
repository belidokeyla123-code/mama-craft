import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    console.log('Detecting special situation in text:', text);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const prompt = `
Você é um assistente especializado em identificar situações especiais em casos de salário-maternidade.

Analise o seguinte texto e determine se ele descreve uma situação especial:

"${text}"

SITUAÇÕES ESPECIAIS POSSÍVEIS:
1. **obito_filho**: Menciona que o filho faleceu após o parto
2. **gemeos**: Menciona parto de gêmeos ou múltiplos
3. **prematuridade**: Menciona parto prematuro
4. **adocao_especial**: Situação atípica de adoção
5. **outro**: Outras situações relevantes que fogem do padrão

RESPONDA APENAS COM UM JSON:
{
  "isException": true/false,
  "type": "tipo_da_excecao" (ou null se não for exceção),
  "typeName": "Nome legível da exceção",
  "confidence": 0-1 (confiança na detecção)
}

Se NÃO for uma situação especial, retorne: {"isException": false, "type": null, "typeName": null, "confidence": 0}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em processos previdenciários. Retorne APENAS JSON válido.'
          },
          { role: 'user', content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "detect_exception",
              description: "Detecta situações especiais em casos previdenciários",
              parameters: {
                type: "object",
                properties: {
                  isException: { type: "boolean", description: "Se é uma situação especial" },
                  type: { type: "string", description: "Tipo da exceção", enum: ["obito_filho", "gemeos", "prematuridade", "adocao_especial", "outro", null] },
                  typeName: { type: "string", description: "Nome legível da exceção" },
                  confidence: { type: "number", description: "Confiança na detecção (0-1)" }
                },
                required: ["isException"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "detect_exception" } }
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
      throw new Error('Erro ao detectar situação especial');
    }

    const data = await response.json();
    console.log('AI Response:', JSON.stringify(data, null, 2));

    let result = { isException: false, type: null, typeName: null, confidence: 0 };

    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      }
    } catch (error) {
      console.error('Erro ao parsear resposta da IA:', error);
    }

    console.log('Detection result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função detect-special-situation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
