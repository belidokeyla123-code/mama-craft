import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { city, uf, address } = await req.json();
    console.log('🔍 Validando jurisdição:', { city, uf, address });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Buscar informações de jurisdição na internet
    const searchQuery = `site:trf1.jus.br "subseção" "${city}" "${uf}" jurisdição endereço municípios`;
    
    const searchResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Você é um especialista em jurisdição da Justiça Federal brasileira. 
Sua tarefa é identificar a subseção judiciária correta para processos.

IMPORTANTE:
- Busque SEMPRE no site do TRF1 (trf1.jus.br)
- Retorne a subseção EXATA que tem jurisdição sobre o município
- Se o município não tem vara própria, identifique qual subseção o atende
- Informe o endereço completo da subseção
- Liste todos os municípios sob jurisdição dessa subseção

Retorne APENAS um JSON válido no formato:
{
  "city": "cidade consultada",
  "uf": "UF",
  "subsecao": "nome da subseção correta",
  "endereco": "endereço completo da Justiça Federal",
  "trf": "TRF1",
  "municipios_jurisdicao": ["município1", "município2"],
  "confianca": "alta" | "media" | "baixa",
  "fonte": "URL do TRF1",
  "observacao": "informação adicional relevante"
}`
          },
          {
            role: 'user',
            content: `Preciso identificar a subseção judiciária federal correta para:
- Município: ${city}
- UF: ${uf}
${address ? `- Endereço completo: ${address}` : ''}

Por favor, pesquise no site do TRF1 e me informe qual subseção judiciária tem jurisdição sobre este município.

Exemplos conhecidos:
- Porto Velho/RO → Jurisdição de Ji-Paraná/RO
- Gleba Rio Preto → Jurisdição de Ji-Paraná/RO
- São Paulo/SP → São Paulo/SP (sede)

Busque especificamente no site trf1.jus.br a lista de municípios sob jurisdição de cada subseção.`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Erro na busca de jurisdição:', searchResponse.status, errorText);
      
      // Fallback: retornar cidade original com baixa confiança
      return new Response(JSON.stringify({
        city,
        uf,
        subsecao: city,
        endereco: `JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}`,
        trf: 'TRF1',
        municipios_jurisdicao: [city],
        confianca: 'baixa',
        fonte: 'fallback - não foi possível validar online',
        observacao: 'Erro ao validar jurisdição. Usando cidade como padrão.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const searchData = await searchResponse.json();
    const aiResponse = searchData.choices?.[0]?.message?.content;
    
    console.log('🤖 Resposta da IA:', aiResponse);

    // Extrair JSON da resposta
    let jurisdictionData;
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jurisdictionData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('JSON não encontrado na resposta');
      }
    } catch (parseError) {
      console.error('Erro ao parsear resposta da IA:', parseError);
      
      // Fallback
      jurisdictionData = {
        city,
        uf,
        subsecao: city,
        endereco: `JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}`,
        trf: 'TRF1',
        municipios_jurisdicao: [city],
        confianca: 'baixa',
        fonte: 'fallback - erro ao processar validação',
        observacao: 'Não foi possível validar jurisdição. Usando cidade como padrão.'
      };
    }

    console.log('✅ Jurisdição validada:', jurisdictionData);

    return new Response(JSON.stringify(jurisdictionData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Erro em validate-jurisdiction:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: 'Erro ao validar jurisdição'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
