import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[JURISPRUDENCE] Iniciando busca de jurisprudência');
    const { caseId } = await req.json();
    console.log('[JURISPRUDENCE] CaseID:', caseId);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    
    console.log('[JURISPRUDENCE] Caso carregado:', caseData?.profile, caseData?.event_type);
    
    // Gerar chave de cache baseada no perfil e tipo de evento
    const cacheKey = `${caseData.profile}_${caseData.event_type}`;
    console.log('[JURISPRUDENCE] Cache key:', cacheKey);
    
    // Verificar cache global
    const { data: cachedResult } = await supabase
      .from('jurisprudence_cache')
      .select('*')
      .eq('profile', caseData.profile)
      .eq('event_type', caseData.event_type)
      .single();
    
    if (cachedResult) {
      console.log('[JURISPRUDENCE] ✅ Cache HIT! Retornando resultado cacheado');
      
      // Incrementar contador de hits
      await supabase
        .from('jurisprudence_cache')
        .update({ hits: cachedResult.hits + 1 })
        .eq('id', cachedResult.id);
      
      return new Response(JSON.stringify(cachedResult.results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[JURISPRUDENCE] Cache MISS - Chamando IA...');

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

Busque jurisprudências, súmulas e doutrinas REAIS para:

**CASO:**
- Perfil: ${caseData.profile === 'especial' ? 'Segurada Especial Rural' : 'Segurada Urbana'}
- Evento: ${caseData.event_type}
- Tem RA: ${caseData.has_ra ? 'Sim' : 'Não'}

Retorne máx 3 de cada tipo. JSON:
{
  "jurisprudencias": [{"tipo":"","tribunal":"","numero_processo":"","tese_fixada":"","relevancia":0,"por_que_relevante":""}],
  "sumulas": [{"tribunal":"","numero":"","tipo":"","texto_completo":"","relevancia":0,"como_aplicar":""}],
  "doutrinas": [{"autor":"","obra":"","citacao_literal":"","relevancia":0,"por_que_citar":""}],
  "teses_juridicas_aplicaveis": []
}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
    // Chamar IA para busca jurisprudências - OTIMIZADO
    console.log('[SEARCH-JURIS] Chamando IA para busca rápida...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos timeout

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

      // Salvar no cache global para reutilização
      await supabase
        .from('jurisprudence_cache')
        .insert({
          query_hash: cacheKey,
          profile: caseData.profile,
          event_type: caseData.event_type,
          results: results
        });

      console.log('[JURISPRUDENCE] Salvo no cache global');

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
