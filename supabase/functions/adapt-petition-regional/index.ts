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
    const { petition, estado } = await req.json();

    // Mapear estado para TRF
    const trfMap: Record<string, { trf: string, estados: string[] }> = {
      'TRF1': { trf: 'TRF1', estados: ['AC', 'AM', 'AP', 'BA', 'DF', 'GO', 'MA', 'MG', 'MT', 'PA', 'PI', 'RO', 'RR', 'TO'] },
      'TRF2': { trf: 'TRF2', estados: ['RJ', 'ES'] },
      'TRF3': { trf: 'TRF3', estados: ['SP', 'MS'] },
      'TRF4': { trf: 'TRF4', estados: ['RS', 'SC', 'PR'] },
      'TRF5': { trf: 'TRF5', estados: ['PE', 'AL', 'CE', 'PB', 'RN', 'SE'] },
      'TRF6': { trf: 'TRF6', estados: ['MG'] } // TRF6 foi criado recentemente
    };

    let trfIdentificado = 'TRF1'; // default
    for (const [trf, data] of Object.entries(trfMap)) {
      if (data.estados.includes(estado?.toUpperCase())) {
        trfIdentificado = trf;
        break;
      }
    }

    const prompt = `Você é um especialista em adaptação de petições para tribunais regionais. Analise e adapte esta petição para o ${trfIdentificado}.

PETIÇÃO ATUAL:
${petition}

REGIÃO: ${estado} (${trfIdentificado})

TAREFA: 
1. Identifique o estilo e preferências do ${trfIdentificado}:
   - Como os juízes desta região pensam
   - Argumentos que mais funcionam
   - Jurisprudências locais prioritárias
   - Linguagem preferida

2. Retorne JSON com:
{
  "trf": "${trfIdentificado}",
  "tendencias": [
    "Tendência 1 do tribunal",
    "Tendência 2 do tribunal"
  ],
  "estilo_preferido": "Descrição do estilo argumentativo",
  "jurisprudencias_locais_sugeridas": [
    {
      "numero": "Processo do ${trfIdentificado}",
      "tese": "Tese fixada",
      "motivo": "Por que é importante para esta região"
    }
  ],
  "adaptacoes_sugeridas": [
    {
      "secao": "Dos Fatos" | "Do Direito" | "Dos Pedidos",
      "adaptacao": "Como adaptar esta seção para o ${trfIdentificado}",
      "justificativa": "Por que esta adaptação funciona melhor"
    }
  ],
  "petition_adaptada": "Petição completa adaptada para o ${trfIdentificado}"
}

IMPORTANTE: Mantenha a estrutura e argumentos principais, apenas adapte o estilo e priorize jurisprudências locais.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
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
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const adaptation = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify(adaptation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in adapt-petition-regional:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
