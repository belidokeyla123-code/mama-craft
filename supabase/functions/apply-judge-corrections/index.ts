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

    // Construir lista detalhada de correções
    const correcoesList = judgeAnalysis?.brechas?.map((brecha: any, i: number) => {
      return `
### BRECHA ${i + 1} - ${brecha.tipo.toUpperCase()} (Gravidade: ${brecha.gravidade})
**Localização:** ${brecha.localizacao}
**Problema:** ${brecha.descricao}
**O QUE FAZER:** ${brecha.sugestao}
${brecha.documento_necessario ? `**DOCUMENTO NECESSÁRIO:** ${brecha.documento_necessario}` : ''}
`;
    }).join('\n---\n');

    const prompt = `Você é um advogado especialista em petições previdenciárias. Sua tarefa é REESCREVER a petição aplicando TODAS as correções abaixo.

# PETIÇÃO ORIGINAL
${petition}

---

# CORREÇÕES OBRIGATÓRIAS A APLICAR

${correcoesList}

---

# INSTRUÇÕES CRÍTICAS

⚠️ **IMPORTANTE:** Você DEVE fazer mudanças SUBSTANCIAIS na petição. NÃO seja conservador.

1. **CORRIJA CADA BRECHA LISTADA ACIMA:**
   - Brechas probatórias → Adicione parágrafos mencionando os documentos anexados
   - Brechas argumentativas → Reescreva os argumentos fracos com fundamentação robusta
   - Brechas jurídicas → Adicione citações de leis, artigos e jurisprudências

2. **APLIQUE AS SUGESTÕES DE CADA BRECHA** (campo "O QUE FAZER" acima)

3. **Mantenha a estrutura geral** (cabeçalho, seções I, II, III, pedidos)

4. **Adicione conteúdo novo** onde necessário para corrigir as brechas

5. **Reescreva parágrafos inteiros** se a sugestão pedir

6. **NÃO mencione** que você está fazendo correções (escreva como se fosse a versão original)

7. **Retorne a petição COMPLETA corrigida** em markdown, sem comentários ou JSON

---

# EXEMPLO DE CORREÇÃO

**Antes (com brecha):**
"A autora preenche os requisitos."

**Depois (corrigido):**
"A autora preenche os requisitos, conforme demonstrado pela Autodeclaração Rural (doc. AUTODECLARACAO.pdf), corroborada pelas Notas Fiscais de Venda de Produção Rural (doc. NOTAS_FISCAIS.pdf) e pelos comprovantes de compra de insumos agrícolas (doc. COMPROVANTES_INSUMOS.pdf), que atestam o labor rural contínuo no período de 19/02/2022 a 19/11/2022."

Agora, reescreva a petição aplicando TODAS as ${judgeAnalysis?.brechas?.length || 0} correções:`;

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
          model: 'google/gemini-2.5-flash', // Modelo intermediário, muito melhor para reescrita
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7, // Aumentar criatividade para ser menos conservador
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
      const lengthDiff = petition_corrigida?.length - petition?.length;
      const percentChange = ((lengthDiff / petition?.length) * 100).toFixed(1);

      console.log('[EDGE] ✅ Petition corrigida gerada');
      console.log('[EDGE] Length original:', petition?.length);
      console.log('[EDGE] Length corrigida:', petition_corrigida?.length);
      console.log('[EDGE] Diferença:', lengthDiff, `(${percentChange}%)`);

      if (Math.abs(lengthDiff) < 100) {
        console.warn('[EDGE] ⚠️ ATENÇÃO: Mudanças muito pequenas! AI pode não ter corrigido.');
      }

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
