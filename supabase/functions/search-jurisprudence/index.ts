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

    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    const prompt = `Você é um especialista em pesquisa jurisprudencial. Encontre jurisprudências, súmulas e teses relevantes para este caso:

CASO:
- Perfil: ${caseData.profile}
- Evento: ${caseData.event_type}
- Tem RA: ${caseData.has_ra ? 'Sim' : 'Não'}
- Situação especial: ${caseData.has_special_situation ? 'Sim' : 'Não'}

TAREFA: Retorne um JSON com jurisprudências REAIS e relevantes dos seguintes tribunais:
- STF (Supremo Tribunal Federal)
- STJ (Superior Tribunal de Justiça)
- TNU (Turma Nacional de Uniformização)
- TRF1, TRF2, TRF3, TRF4, TRF5, TRF6

Formato do JSON:
{
  "jurisprudencias": [
    {
      "tribunal": "STF" | "STJ" | "TNU" | "TRF1" | "TRF2" | "TRF3" | "TRF4" | "TRF5" | "TRF6",
      "tipo": "acordao" | "sumula" | "sumula_vinculante" | "tese",
      "numero_processo": "REsp 1234567/SP",
      "tese": "Resumo da tese fixada",
      "ementa": "Ementa completa do julgado",
      "trecho_chave": "Trecho mais relevante",
      "link": "URL do tribunal",
      "data_decisao": "YYYY-MM-DD",
      "relevance_score": 95,
      "tags": ["salario-maternidade", "segurada-especial"],
      "aplicabilidade": "Por que se aplica a este caso específico"
    }
  ],
  "sumulas": [
    {
      "tribunal": "STJ",
      "numero": "Súmula 149",
      "texto": "Texto da súmula",
      "aplicabilidade": "Como se aplica",
      "relevance_score": 90
    }
  ],
  "teses": [
    {
      "tribunal": "TNU",
      "numero": "Tese 123",
      "texto": "Texto da tese fixada",
      "aplicabilidade": "Relevância para o caso",
      "relevance_score": 88
    }
  ],
  "doutrinas": [
    {
      "autor": "Carlos Alberto Pereira de Castro",
      "obra": "Manual de Direito Previdenciário",
      "citacao": "Citação relevante",
      "aplicabilidade": "Por que é relevante",
      "relevance_score": 75
    }
  ]
}

IMPORTANTE: Busque jurisprudências "ipsis literis" - casos idênticos ao nosso:
- Mesmo perfil de segurada
- Mesmo tipo de evento
- Mesma situação probatória
Ordene por relevância (score).`;

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
      let results;
      
      try {
        results = JSON.parse(aiData.choices[0].message.content);
      } catch (parseError) {
        // Tentar limpar o JSON antes de parsear novamente
        console.log('JSON parse error, tentando limpar...');
        const cleanedContent = aiData.choices[0].message.content
          .replace(/\n/g, ' ')
          .replace(/\t/g, ' ')
          .replace(/\r/g, ' ')
          .replace(/\\"/g, '"')
          .trim();
        
        try {
          results = JSON.parse(cleanedContent);
        } catch (secondError) {
          console.error('Failed to parse even after cleaning:', cleanedContent.substring(0, 200));
          throw new Error('JSON inválido retornado pela IA. Tente novamente.');
        }
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Busca de jurisprudência demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in search-jurisprudence:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
