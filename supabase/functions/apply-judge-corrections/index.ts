import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[EDGE] apply-judge-corrections INICIADA');
  
  if (req.method === 'OPTIONS') {
    console.log('[EDGE] OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[EDGE] Parsing request body...');
    const { petition, judgeAnalysis } = await req.json();
    console.log('[EDGE] Petition length:', petition?.length);
    console.log('[EDGE] JudgeAnalysis exists:', !!judgeAnalysis);
    console.log('[EDGE] JudgeAnalysis brechas:', judgeAnalysis?.brechas?.length || 0);

    const prompt = `Você é um advogado especialista em petições previdenciárias.

PETIÇÃO ATUAL:
${petition}

ANÁLISE CRÍTICA DO JUIZ:
${JSON.stringify(judgeAnalysis, null, 2)}

TAREFA: Aplique TODAS as correções e sugestões do módulo juiz na petição.

INSTRUÇÕES:
1. **Corrija TODAS as brechas identificadas**:
   - Brechas probatórias: Adicione menções aos documentos faltantes
   - Brechas argumentativas: Reforce os argumentos fracos com fundamentação adicional
   - Brechas jurídicas: Adicione fundamentos legais ausentes ou cite jurisprudências

2. **Implemente TODAS as recomendações** fornecidas pelo juiz

3. **Mantenha a estrutura original** da petição (não mude a ordem das seções)

4. **Mantenha o tom profissional** e persuasivo

5. **NÃO adicione** informações que não estejam na petição original ou nas sugestões

6. **SEJA CIRÚRGICO**: Faça apenas as correções necessárias

Retorne APENAS o texto da petição corrigida em markdown, sem JSON.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    console.log('[EDGE] LOVABLE_API_KEY exists:', !!LOVABLE_API_KEY);
    console.log('[EDGE] Número de brechas:', judgeAnalysis?.brechas?.length || 0);
    console.log('[EDGE] Tipos de brechas:', judgeAnalysis?.brechas?.map((b: any) => b.tipo) || []);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 🆕 60s timeout (aumentado)

    try {
      console.log('[EDGE] Chamando Lovable AI Gateway...');
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[EDGE] AI Response status:', aiResponse.status);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atingido. Aguarde alguns segundos.',
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
      const petition_corrigida = aiData.choices[0].message.content;
      console.log('[EDGE] Petition corrigida gerada, length:', petition_corrigida?.length);

      return new Response(JSON.stringify({ petition_corrigida }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Aplicação de correções demorou muito.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in apply-judge-corrections:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
