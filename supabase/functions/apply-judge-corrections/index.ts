import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
    const { petition, judgeAnalysis, caseId, contextDocuments, tentativaInfo } = await req.json();
    console.log('[EDGE] Petition length:', petition?.length);
    console.log('[EDGE] JudgeAnalysis exists:', !!judgeAnalysis);
    console.log('[EDGE] JudgeAnalysis brechas:', judgeAnalysis?.brechas?.length || 0);
    console.log('[EDGE] Case ID:', caseId);
    console.log('[EDGE] Context documents:', contextDocuments?.length || 0);
    console.log('[EDGE] Tentativa info:', tentativaInfo);

    // ═══════════════════════════════════════════════════════════════
    // 🔥 BUSCAR DADOS DO CASO PARA CONTEXTO TEMPORAL E DOCUMENTOS
    // ═══════════════════════════════════════════════════════════════
    let contextoTemporal = '';
    let documentosContexto = '';
    
    // ═══ FASE 4: CRIAR CONTEXTO DE DOCUMENTOS (APENAS NOMES, SEM NUMERAÇÃO) ═══
    if (contextDocuments && contextDocuments.length > 0) {
      documentosContexto = `

═══════════════════════════════════════════════════════════════
# 📄 DOCUMENTOS ANEXADOS REAIS (CONTEXTO OBRIGATÓRIO)

A seguir está a lista COMPLETA e DEFINITIVA de documentos que estão anexados ao processo.

${contextDocuments.map((doc: any) => 
  `- ${doc.nome} (Tipo: ${doc.tipo})`
).join('\n')}

⚠️ REGRA ABSOLUTA SOBRE DOCUMENTOS:
- ❌ NÃO use numeração "Doc. 01", "Doc. 02", etc.
- ✅ Use APENAS o NOME do documento: "Comprovante de Endereço", "Autodeclaração", "Certidão de Nascimento"
- ✅ Ao citar provas: "conforme Comprovante de Endereço, RG e CPF anexos"
- ❌ NUNCA escreva: "conforme Doc. 01, Doc. 02 e Doc. 03 anexos"
- ❌ NÃO cite documentos que não estão nesta lista
- ❌ NÃO invente documentos que não existem

═══════════════════════════════════════════════════════════════
`;
      console.log('[EDGE] Contexto de documentos adicionado:', contextDocuments.length, 'documentos');
    }
    
    if (caseId) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const { data: caseData } = await supabase
          .from('cases')
          .select('child_birth_date, event_date, event_type, salario_minimo_history')
          .eq('id', caseId)
          .single();
        
        if (caseData) {
          const fatoGeradorDate = caseData.child_birth_date || caseData.event_date;
          const fatoGeradorYear = new Date(fatoGeradorDate).getFullYear();
          const salarioMinimoCorreto = caseData.salario_minimo_history?.find(
            (h: any) => h.year === fatoGeradorYear
          )?.value || 1212.00;
          
          contextoTemporal = `

═══════════════════════════════════════════════════════════════
# ⏰ CONTEXTO TEMPORAL CRÍTICO - LEIA COM ATENÇÃO

**Data do Fato Gerador:** ${new Date(fatoGeradorDate).toLocaleDateString('pt-BR')}
**Ano do Fato Gerador:** ${fatoGeradorYear}
**Salário Mínimo Vigente na Época:** R$ ${salarioMinimoCorreto.toFixed(2)}
**Valor da Causa CORRETO:** R$ ${(salarioMinimoCorreto * 4).toFixed(2)} (${salarioMinimoCorreto.toFixed(2)} × 4 meses)

⚠️ **REGRA ABSOLUTA:** Todos os cálculos de valor da causa e RMI devem usar o salário mínimo vigente NA DATA DO FATO GERADOR (${fatoGeradorYear}), NÃO o salário atual.

❌ **ERRADO:** Usar salário mínimo de 2025 (R$ 1.518,00)
✅ **CORRETO:** Usar salário mínimo de ${fatoGeradorYear} (R$ ${salarioMinimoCorreto.toFixed(2)})

Se a petição mencionar valores baseados em salário mínimo incorreto, VOCÊ DEVE corrigir TODOS os valores na petição.
═══════════════════════════════════════════════════════════════
`;
          
          console.log('[EDGE] Contexto temporal adicionado:', {
            ano: fatoGeradorYear,
            salario_minimo: salarioMinimoCorreto,
            valor_causa: salarioMinimoCorreto * 4
          });
        }
      } catch (supabaseError) {
        console.error('[EDGE] Erro ao buscar dados do caso:', supabaseError);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔥 CONSTRUIR LISTA COMPLETA DE TODAS AS CORREÇÕES
    // ═══════════════════════════════════════════════════════════════

    // 1️⃣ BRECHAS (falhas graves que comprometem a petição)
    const brechasList = judgeAnalysis?.brechas?.map((brecha: any, i: number) => {
      return `
### BRECHA ${i + 1} - ${brecha.tipo.toUpperCase()} (Gravidade: ${brecha.gravidade})
**Localização:** ${brecha.localizacao}
**Problema:** ${brecha.problema || brecha.descricao}
${brecha.impacto ? `**Impacto:** ${brecha.impacto}` : ''}
**AÇÃO OBRIGATÓRIA:** ${brecha.sugestao}
${brecha.paragrafo_corrigido ? `
**PARÁGRAFO CORRIGIDO (USE EXATAMENTE ESTE TEXTO):**
"${brecha.paragrafo_corrigido}"
` : ''}
${brecha.documento_necessario ? `**DOCUMENTO NECESSÁRIO:** ${brecha.documento_necessario}` : ''}
`;
    }).join('\n---\n') || '';

    // 2️⃣ PONTOS FRACOS (argumentações que precisam ser fortalecidas)
    const pontosFracosList = judgeAnalysis?.pontos_fracos?.map((ponto: any, i: number) => {
      const descricao = typeof ponto === 'string' ? ponto : ponto.descricao || ponto.problema;
      const secao = typeof ponto === 'object' ? (ponto.secao || ponto.localizacao || 'Não especificada') : 'Não especificada';
      const recomendacao = typeof ponto === 'object' ? (ponto.recomendacao || ponto.sugestao || 'Reescrever com mais fundamentação') : 'Reescrever com mais fundamentação';
      
      return `
### PONTO FRACO ${i + 1}
**Localização:** ${secao}
**Problema:** ${descricao}
**AÇÃO OBRIGATÓRIA:** ${recomendacao}
`;
    }).join('\n---\n') || '';

    // 3️⃣ RECOMENDAÇÕES GERAIS (melhorias sugeridas pelo juiz)
    const recomendacoesList = judgeAnalysis?.recomendacoes?.map((rec: string | any, i: number) => {
      const texto = typeof rec === 'string' ? rec : rec.texto || rec.descricao || rec.recomendacao;
      return `
### RECOMENDAÇÃO ${i + 1}
${texto}
**VOCÊ DEVE IMPLEMENTAR ISSO NA PETIÇÃO!**
`;
    }).join('\n---\n') || '';

    // 🔥 CONSOLIDAR TODAS AS CORREÇÕES EM UM ÚNICO PROMPT
    const contextoTentativa = tentativaInfo?.contextoAnterior || '';
    
    const todasCorrecoes = [
      brechasList && `# 🔴 BRECHAS CRÍTICAS (OBRIGATÓRIO CORRIGIR)\n${brechasList}`,
      pontosFracosList && `# ⚠️ PONTOS FRACOS (FORTALECER ARGUMENTAÇÃO)\n${pontosFracosList}`,
      recomendacoesList && `# 💡 RECOMENDAÇÕES DO JUIZ (IMPLEMENTAR)\n${recomendacoesList}`
    ].filter(Boolean).join('\n\n═══════════════════════════════════════════════\n\n');

    const totalCorrecoes = 
      (judgeAnalysis?.brechas?.length || 0) + 
      (judgeAnalysis?.pontos_fracos?.length || 0) + 
      (judgeAnalysis?.recomendacoes?.length || 0);

    console.log('[EDGE] 📊 Correções a aplicar:', {
      brechas: judgeAnalysis?.brechas?.length || 0,
      pontos_fracos: judgeAnalysis?.pontos_fracos?.length || 0,
      recomendacoes: judgeAnalysis?.recomendacoes?.length || 0,
      total: totalCorrecoes
    });

    if (totalCorrecoes === 0) {
      console.warn('[EDGE] ⚠️ Nenhuma correção fornecida!');
      return new Response(JSON.stringify({ 
        petition_corrigida: petition,
        mudancas_realizadas: 'Nenhuma correção foi especificada'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = `Você é um EDITOR DE PETIÇÕES com PODER ABSOLUTO de modificação. Sua tarefa é REESCREVER a petição aplicando TODAS as ${totalCorrecoes} correções abaixo.

⚠️ REGRAS CRÍTICAS DE CORREÇÃO:

1. **Documentos com numeração errada:**
   → LOCALIZE a seção "Das Provas" ou "Documentos Anexos"
   → REESCREVA COMPLETAMENTE usando esta lista EXATA:
${contextDocuments?.split('\n').slice(0, 10).join('\n') || '(documentos não fornecidos)'}

2. **Benefício anterior não fundamentado:**
   → ADICIONE parágrafo após mencionar benefícios anteriores:
   "Ressalta-se que cada gestação gera direito autônomo ao salário-maternidade, nos termos do Art. 71 da Lei 8.213/91, conforme entendimento consolidado (TNU PEDILEF 0506032-44.2012.4.05.8300)."

3. **Valor da causa incorreto:**
   → LOCALIZE "Atribui-se à causa o valor"
   → SUBSTITUA por valor correto do contexto temporal

4. **Fundamentação jurídica fraca:**
   → ADICIONE citações de lei específicas (Arts. 11, 39, 71 da Lei 8.213/91)
   → INCLUA jurisprudência relevante quando mencionada nas correções

5. **Falta de documentos obrigatórios:**
   → MENCIONE explicitamente cada documento necessário na seção de provas
   → JUSTIFIQUE por que cada documento comprova o alegado

${tentativaInfo?.numero > 1 ? `
═══════════════════════════════════════════════════════════════
⚠️ ATENÇÃO: Esta é a TENTATIVA ${tentativaInfo.numero} de ${3}!

As seguintes correções NÃO foram aplicadas na tentativa anterior.
VOCÊ PRECISA APLICÁ-LAS AGORA DE FORMA CLARA E VERIFICÁVEL:

${contextoTentativa}
═══════════════════════════════════════════════════════════════
` : ''}

${contextoTemporal}
${documentosContexto}

# PETIÇÃO ORIGINAL
${petition}

═══════════════════════════════════════════════════════════════

# CORREÇÕES OBRIGATÓRIAS (TOTAL: ${totalCorrecoes})

${todasCorrecoes}

═══════════════════════════════════════════════════════════════

# 🚨 REGRAS ANTI-ERRO (CRÍTICO!)

❌ **NÃO FAÇA:**
1. NÃO remova partes corretas da petição
2. NÃO mude endereçamento se já estiver correto
3. NÃO altere valor da causa se já estiver correto
4. NÃO invente documentos que não existem
5. NÃO cite jurisprudências genéricas sem número de processo
6. NÃO use placeholders [XXX]
7. NÃO use numeração "Doc. 01" - use apenas nomes dos documentos

✅ **VOCÊ DEVE:**
1. Focar APENAS nas correções solicitadas
2. Manter TUDO que já está correto
3. Ser ESPECÍFICO (citar documentos pelo nome, leis com artigos, jurisprudências com número)
4. Expandir argumentações fracas COM SUBSTÂNCIA REAL
5. Adicionar fundamentação jurídica CONCRETA

═══════════════════════════════════════════════════════════════

# INSTRUÇÕES CRÍTICAS - LEIA COM ATENÇÃO

⚠️ **IMPORTANTE:** Você DEVE fazer mudanças SUBSTANCIAIS. NÃO seja conservador.

## COMO APLICAR CADA TIPO DE CORREÇÃO:

### Para BRECHAS:
- **Probatórias** → Adicione parágrafos citando documentos específicos anexos pelo NOME (ex: "conforme Comprovante de Endereço, RG e CPF anexos")
- **Argumentativas** → Reescreva completamente argumentos fracos com fundamentação jurídica robusta e persuasiva
- **Jurídicas** → Adicione citações completas de leis, artigos, incisos, súmulas e jurisprudências específicas

### Para PONTOS FRACOS:
1. Localize a seção/parágrafo indicado
2. Reescreva COMPLETAMENTE a argumentação problemática
3. Adicione fundamentação legal sólida (leis + jurisprudências)
4. Torne a redação mais clara, persuasiva e didática
5. Expanda com exemplos concretos quando aplicável

### Para RECOMENDAÇÕES DO JUIZ:
- **"Revisar seção X"** → Reescreva a seção INTEIRA com melhorias substanciais
- **"Incluir referência ao Tema Y/Súmula Z"** → Adicione parágrafo específico citando o tema/súmula com ementa completa
- **"Aprofundar argumento W"** → Expanda o argumento com mais detalhes, exemplos práticos e fundamentação teórica
- **"Tornar mais didático"** → Reescreva de forma mais clara, com exemplos, analogias e explicações passo a passo
- **"Incluir jurisprudência específica"** → Adicione jurisprudências citadas com número do processo e trecho relevante

## REGRAS GERAIS OBRIGATÓRIAS:
1. ✅ Mantenha a estrutura geral (cabeçalho, seções, pedidos)
2. ✅ Adicione conteúdo novo substancial onde necessário (mínimo 20% de expansão)
3. ✅ Reescreva parágrafos inteiros quando indicado
4. ✅ Cite leis, artigos, incisos, súmulas e jurisprudências específicas
5. ✅ Use linguagem técnica mas persuasiva
6. ❌ NÃO mencione que você está fazendo correções
7. ❌ NÃO use expressões genéricas ("conforme documentos anexos") - seja específico
8. ✅ Retorne a petição COMPLETA em markdown

═══════════════════════════════════════════════════════════════

# EXEMPLO DE CORREÇÃO REAL

**RECOMENDAÇÃO DO JUIZ:**
"Incluir mensagem direta ao Tema 89 da TNU sobre autonomia dos fatos geradores"

**ANTES (texto original):**
"A autora tem direito ao benefício mesmo tendo recebido salário-maternidade anteriormente."

**DEPOIS (aplicando a recomendação):**
"A autora faz jus ao benefício mesmo tendo recebido salário-maternidade anteriormente, nos termos do **Tema nº 89 da Turma Nacional de Uniformização (TNU)**, que pacificou definitivamente a questão da autonomia dos fatos geradores:

> **EMENTA:** 'O fato de a segurada já ter recebido o benefício de salário-maternidade anteriormente não constitui óbice a uma nova concessão, se preenchidos os requisitos legais, referentes a um novo parto.' 
> (TNU-PEDILEF 0506032-44.2012.4.05.8300, Rel. Juiz Federal FREDERICO KOEHLER)

Este precedente da TNU é de observância obrigatória por todos os Juizados Especiais Federais (art. 14, § 2º, da Lei nº 10.259/2001), deixando cristalino que **cada gestação gera um direito autônomo e independente** ao salário-maternidade, conforme art. 71 da Lei nº 8.213/91."

═══════════════════════════════════════════════════════════════

Agora, reescreva a petição aplicando TODAS as ${totalCorrecoes} correções:`;

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
          temperature: 0.8,
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

    // ✅ ATUALIZAR QUALITY REPORT PARA INDICAR QUE PRECISA REVALIDAÇÃO
    if (caseId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        const { error: qrError } = await supabase
          .from('quality_reports')
          .update({ 
            status: 'em_revisao',
            updated_at: new Date().toISOString()
          })
          .eq('case_id', caseId)
          .eq('document_type', 'petition');
        
        if (qrError) {
          console.error('[EDGE] Erro ao atualizar quality report:', qrError);
        } else {
          console.log('[EDGE] ✅ Quality report atualizado para EM_REVISAO');
        }
      } catch (qrUpdateError) {
        console.error('[EDGE] Erro ao atualizar quality report:', qrUpdateError);
      }
    }

  } catch (error) {
    console.error('Error in apply-judge-corrections:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
