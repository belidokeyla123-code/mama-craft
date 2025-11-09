import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════
// MAPEAMENTO HARDCODED DE JURISDIÇÃO - RONDÔNIA (TRF1)
// ═══════════════════════════════════════════════════════════
const JURISDICAO_RONDONIA: Record<string, {
  subsecao: string;
  endereco: string;
  municipios: string[];
}> = {
  'ji-parana': {
    subsecao: 'Ji-Paraná',
    endereco: 'Rua Duque de Caxias, 1221, Centro, Ji-Paraná/RO, CEP 76900-036',
    municipios: [
      'Ji-Paraná',
      'Porto Velho',
      'Ariquemes',
      'Ouro Preto do Oeste',
      'Jaru',
      'Presidente Médici',
      'Alvorada do Oeste',
      'Urupá',
      'Mirante da Serra',
      'Teixeirópolis',
      'Vale do Paraíso',
      'Governador Jorge Teixeira',
      'Nova União',
      'Rio Crespo',
      'Cacaulândia',
      'Gleba Rio Preto'
    ]
  },
  'vilhena': {
    subsecao: 'Vilhena',
    endereco: 'Avenida Capitão Castro, 4389, Centro, Vilhena/RO, CEP 76980-020',
    municipios: [
      'Vilhena',
      'Colorado do Oeste',
      'Cabixi',
      'Cerejeiras',
      'Corumbiara',
      'Pimenteiras do Oeste',
      'Chupinguaia'
    ]
  },
  'rolim-de-moura': {
    subsecao: 'Rolim de Moura',
    endereco: 'Avenida 25 de Agosto, 5549, Centro, Rolim de Moura/RO, CEP 76940-000',
    municipios: [
      'Rolim de Moura',
      'Santa Luzia do Oeste',
      'Nova Brasilândia do Oeste',
      'Alto Alegre dos Parecis',
      'Novo Horizonte do Oeste',
      'Castanheiras'
    ]
  }
};

function normalizarCidade(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim();
}

function identificarSubsecaoRO(cidade: string, endereco?: string): {
  subsecao: string;
  endereco: string;
  municipios_jurisdicao: string[];
  confianca: string;
  fonte: string;
} | null {
  const cidadeNorm = normalizarCidade(cidade);
  
  if (endereco?.toLowerCase().includes('gleba rio preto')) {
    return {
      subsecao: 'Ji-Paraná',
      endereco: JURISDICAO_RONDONIA['ji-parana'].endereco,
      municipios_jurisdicao: JURISDICAO_RONDONIA['ji-parana'].municipios,
      confianca: 'alta',
      fonte: 'Mapeamento hardcoded - Gleba Rio Preto pertence à jurisdição de Ji-Paraná'
    };
  }
  
  for (const [key, info] of Object.entries(JURISDICAO_RONDONIA)) {
    const municipiosNorm = info.municipios.map(normalizarCidade);
    
    if (municipiosNorm.includes(cidadeNorm)) {
      return {
        subsecao: info.subsecao,
        endereco: info.endereco,
        municipios_jurisdicao: info.municipios,
        confianca: 'alta',
        fonte: `Mapeamento hardcoded - TRF1 Rondônia`
      };
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { city, uf, address } = await req.json();
    console.log('🔍 Validando jurisdição:', { city, uf, address });

    // ═══════════════════════════════════════════════════════════
    // ESTRATÉGIA 1: MAPEAMENTO HARDCODED (RONDÔNIA)
    // ═══════════════════════════════════════════════════════════
    if (uf?.toUpperCase() === 'RO') {
      console.log('🎯 Detectado Rondônia - usando mapeamento hardcoded');
      const resultado = identificarSubsecaoRO(city, address);
      
      if (resultado) {
        console.log('✅ Jurisdição identificada (hardcoded):', resultado.subsecao);
        return new Response(JSON.stringify({
          city,
          uf: 'RO',
          ...resultado,
          trf: 'TRF1',
          tribunal: 'TRF1',
          competencia: 'Juizado Especial Federal',
          enderecamento_completo: `Excelentíssimo Senhor Doutor Juiz Federal do Juizado Especial Federal de ${resultado.subsecao}/RO`,
          observacao: `${city} é atendido pela subseção judiciária de ${resultado.subsecao}/RO`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.warn(`⚠️ Município ${city}/RO não encontrado no mapeamento. Usando Ji-Paraná como fallback.`);
      return new Response(JSON.stringify({
        city,
        uf: 'RO',
        subsecao: 'Ji-Paraná',
        endereco: JURISDICAO_RONDONIA['ji-parana'].endereco,
        trf: 'TRF1',
        tribunal: 'TRF1',
        competencia: 'Juizado Especial Federal',
        enderecamento_completo: `Excelentíssimo Senhor Doutor Juiz Federal do Juizado Especial Federal de Ji-Paraná/RO`,
        municipios_jurisdicao: JURISDICAO_RONDONIA['ji-parana'].municipios,
        confianca: 'media',
        fonte: 'Fallback hardcoded - Ji-Paraná atende a maioria dos municípios de RO',
        observacao: `${city} não está no mapeamento, mas Ji-Paraná é a subseção que atende a maioria dos municípios de Rondônia`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // ESTRATÉGIA 2: IA (OUTROS ESTADOS)
    // ═══════════════════════════════════════════════════════════
    console.log('🤖 Usando IA para validar jurisdição (não é Rondônia)');

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
  "tribunal": "TRF1",
  "competencia": "Juizado Especial Federal" ou "Vara Federal",
  "endereco": "endereço completo da Justiça Federal",
  "enderecamento_completo": "Excelentíssimo Senhor Doutor Juiz Federal do Juizado Especial Federal de [Subseção]/[UF]",
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
        tribunal: 'TRF1',
        competencia: 'Juizado Especial Federal',
        endereco: `JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}`,
        enderecamento_completo: `Excelentíssimo Senhor Doutor Juiz Federal do Juizado Especial Federal de ${city}/${uf}`,
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
        
        // Garantir campos obrigatórios se a IA não retornou
        if (!jurisdictionData.tribunal) jurisdictionData.tribunal = 'TRF1';
        if (!jurisdictionData.competencia) jurisdictionData.competencia = 'Juizado Especial Federal';
        if (!jurisdictionData.enderecamento_completo) {
          jurisdictionData.enderecamento_completo = `Excelentíssimo Senhor Doutor Juiz Federal do ${jurisdictionData.competencia} de ${jurisdictionData.subsecao}/${jurisdictionData.uf}`;
        }
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
        tribunal: 'TRF1',
        competencia: 'Juizado Especial Federal',
        endereco: `JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}`,
        enderecamento_completo: `Excelentíssimo Senhor Doutor Juiz Federal do Juizado Especial Federal de ${city}/${uf}`,
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
