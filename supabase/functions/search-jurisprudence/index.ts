import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";
import { validateRequest, createValidationErrorResponse, caseIdSchema } from '../_shared/validators.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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
    const body = await req.json();
    const validated = validateRequest(caseIdSchema, body);
    const { caseId } = validated;
    console.log('[JURISPRUDENCE] CaseID:', caseId);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Criar registro inicial com status 'generating'
    const { error: createError } = await supabase
      .from('jurisprudence_results')
      .upsert({
        case_id: caseId,
        results: { status: 'generating' } as any,
        is_stale: false,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'case_id'
      });

    if (createError) {
      console.error('[JURISPRUDENCE] Erro ao criar registro inicial:', createError);
      throw createError;
    }

    console.log('[JURISPRUDENCE] ✅ Registro inicial criado, processando em background...');

    // Executar busca em background
    const backgroundTask = async () => {
      try {
        // 1. Buscar dados do caso
        const { data: caseData } = await supabase
          .from('cases')
          .select('*')
          .eq('id', caseId)
          .single();
        
        console.log('[JURISPRUDENCE] Caso carregado:', caseData?.profile, caseData?.event_type);

        const manualBenefits = caseData?.manual_benefits || [];
        console.log('[JURISPRUDENCE] Benefícios manuais:', manualBenefits.length);

        // Buscar histórico de benefícios
        const { data: benefitHistory } = await supabase
          .from('benefit_history')
          .select('*')
          .eq('case_id', caseId);
        
        // 2. Buscar análise jurídica completa
        const { data: analysisData } = await supabase
          .from('case_analysis')
          .select('*')
          .eq('case_id', caseId)
          .order('analyzed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        console.log('[JURISPRUDENCE] Análise encontrada:', !!analysisData);
        
        // 3. Buscar documentos e extrações
        const { data: documents } = await supabase
          .from('documents')
          .select(`
            *,
            extractions(*)
          `)
          .eq('case_id', caseId);
        
        console.log('[JURISPRUDENCE] Documentos encontrados:', documents?.length || 0);
        
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
          console.log('[JURISPRUDENCE] ✅ Cache HIT! Usando resultado cacheado');
          
          // Incrementar contador de hits
          await supabase
            .from('jurisprudence_cache')
            .update({ hits: cachedResult.hits + 1 })
            .eq('id', cachedResult.id);
          
          // Salvar no caso específico
          await supabase
            .from('jurisprudence_results')
            .update({
              results: { ...cachedResult.results, status: 'completed' } as any,
              is_stale: false
            })
            .eq('case_id', caseId);
          
          console.log('[JURISPRUDENCE] ✅ Background task concluída (cache)');
          return;
        }
        
        console.log('[JURISPRUDENCE] Cache MISS - Chamando IA...');

        // Construir contexto rico e específico do caso
        const draftPayload = analysisData?.draft_payload as any;
        
        const situacoesEspecificas = [];
        
        // Detectar situações específicas
        if (draftPayload?.carencia?.cumprida === false) {
          situacoesEspecificas.push(`Carência NÃO cumprida (faltam ${draftPayload.carencia.meses_faltantes} meses)`);
        }
        
        if (draftPayload?.cnis_analysis?.periodos_urbanos?.length === 0 && 
            draftPayload?.cnis_analysis?.periodos_rurais?.length === 0) {
          situacoesEspecificas.push('CNIS VAZIO - reforça atividade rural exclusiva');
        }
        
        if (caseData.child_death_date) {
          situacoesEspecificas.push('FILHO FALECIDO - situação especial de salário maternidade post-mortem');
        }
        
        if (draftPayload?.rmi?.situacao_especial) {
          situacoesEspecificas.push('Situação especial detectada na análise de RMI');
        }
        
        if (caseData.has_ra) {
          situacoesEspecificas.push(`Requerimento Administrativo: ${caseData.ra_denial_reason || 'indeferido'}`);
        }

        // Prompt enriquecido com análise completa
        const prompt = `# BUSCA DE JURISPRUDÊNCIA ESPECÍFICA - SALÁRIO MATERNIDADE

## DADOS DO CASO
- Perfil: ${caseData.profile === 'especial' ? 'SEGURADA ESPECIAL RURAL' : 'SEGURADA URBANA'}
- Evento: ${caseData.event_type || 'Nascimento'}
- Data do evento: ${caseData.event_date || 'não informada'}
- Nome da autora: ${caseData.author_name || 'não informado'}
- Nome do filho: ${caseData.child_name || 'não informado'}

## ANÁLISE JURÍDICA COMPLETA
${analysisData ? `
- Qualidade de segurada: ${draftPayload?.qualidade_segurada?.comprovado ? 'COMPROVADA' : 'NÃO COMPROVADA'} (${draftPayload?.qualidade_segurada?.detalhes || ''})
- Carência: ${draftPayload?.carencia?.cumprida ? 'CUMPRIDA' : `NÃO CUMPRIDA - faltam ${draftPayload?.carencia?.meses_faltantes || 0} meses`}
- RMI calculada: R$ ${draftPayload?.rmi?.valor?.toFixed(2) || '0.00'}
- Valor da causa: R$ ${draftPayload?.valor_causa?.toFixed(2) || '0.00'}
- Probabilidade de êxito: ${draftPayload?.probabilidade_exito?.score || 0}% (${draftPayload?.probabilidade_exito?.nivel || 'média'})
` : '⚠️ Análise jurídica não disponível'}

## SITUAÇÕES ESPECÍFICAS IDENTIFICADAS
${situacoesEspecificas.length > 0 ? situacoesEspecificas.map(s => `- ${s}`).join('\n') : '- Nenhuma situação especial identificada'}

## PONTOS FORTES DO CASO
${draftPayload?.probabilidade_exito?.pontos_fortes?.length > 0 
  ? draftPayload.probabilidade_exito.pontos_fortes.map((p: string) => `- ${p}`).join('\n')
  : '- Não identificados'}

## PONTOS FRACOS DO CASO
${draftPayload?.probabilidade_exito?.pontos_fracos?.length > 0 
  ? draftPayload.probabilidade_exito.pontos_fracos.map((p: string) => `- ${p}`).join('\n')
  : '- Não identificados'}

## 🎯 RECOMENDAÇÕES DA ANÁLISE (BUSCAR JURISPRUDÊNCIAS ESPECÍFICAS PARA CADA)
${draftPayload?.recomendacoes?.length > 0 
  ? draftPayload.recomendacoes.map((r: string, i: number) => `
${i+1}. ${r}
   → Busque PELO MENOS 1 jurisprudência ESPECÍFICA sobre: "${r}"`).join('\n')
  : '- Não há recomendações'}

**EXEMPLOS DE BUSCA ESPECÍFICA POR RECOMENDAÇÃO**:
- Recomendação: "Fundamentar ilegalidade do indeferimento"
  → Buscar: Jurisprudências sobre INSS indeferindo ilegalmente salário-maternidade

- Recomendação: "Argumentar qualidade de segurada"
  → Buscar: Jurisprudências sobre prova testemunhal, início de prova material

- Recomendação: "CNIS sem vínculos urbanos"
  → Buscar: Jurisprudências que RECONHECEM CNIS vazio como prova de atividade rural

- Recomendação: "Comodato em nome de terceiro"
  → Buscar: Jurisprudências sobre validade de documentos em nome de familiares

⚠️ IMPORTANTE: CADA recomendação deve ter pelo menos 1 jurisprudência correspondente. Se não houver jurisprudência direta, buscar a mais próxima e indicar no campo "por_que_relevante" qual recomendação ela atende.

## DOCUMENTOS JUNTADOS
${documents && documents.length > 0 
  ? documents.map(d => `- ${d.document_type} (${d.file_name})`).join('\n')
  : '- Nenhum documento juntado'}

## BENEFÍCIOS ANTERIORES
Automáticos: ${benefitHistory?.length || 0}
Manuais: ${manualBenefits?.length || 0}

${manualBenefits && manualBenefits.length > 0 ? `
📋 Benefícios Informados Manualmente:
${manualBenefits.map((b: any) => `- ${b.tipo}: ${b.inicio} a ${b.fim}`).join('\n')}

⚠️ SE HOUVER SALÁRIO-MATERNIDADE ANTERIOR:
- Busque jurisprudências sobre "múltiplos salários-maternidade"
- Busque TNU-PEDILEF sobre salário-maternidade por gestação
- Busque precedentes que confirmam direito a benefício mesmo com histórico anterior
- Priorize julgados que afastem tese de "duplicidade de benefício"
` : ''}

---

# INSTRUÇÃO
Com base na ANÁLISE JURÍDICA COMPLETA e nas SITUAÇÕES ESPECÍFICAS acima, busque jurisprudências, súmulas e doutrinas ALTAMENTE RELEVANTES e ESPECÍFICAS para este caso.

**IMPORTANTE**: 
- Não busque jurisprudências genéricas de salário maternidade
- Foque nas SITUAÇÕES ESPECÍFICAS identificadas (ex: carência não cumprida, CNIS vazio, filho falecido, etc)
- Foque nas RECOMENDAÇÕES DA ANÁLISE - cada recomendação deve ter jurisprudência correspondente
- Se o CNIS for vazio, busque jurisprudências que REFORÇAM isso como prova de atividade rural
- Se a carência não foi cumprida, busque precedentes sobre reconhecimento de atividade rural
- Se houver situações especiais (filho falecido, etc), busque jurisprudências ESPECÍFICAS disso
- No campo "por_que_relevante", SEMPRE mencione qual recomendação a jurisprudência atende

**REGRAS CRÍTICAS:**
1. Retorne NO MÁXIMO 3 itens de cada tipo (jurisprudências, súmulas, doutrinas)
2. Escolha APENAS as MAIS RELEVANTES - qualidade > quantidade
3. NÃO REPITA informações - se uma súmula diz o mesmo que uma jurisprudência, escolha apenas a mais forte
4. NÃO REPITA autores de doutrina - máximo 1 citação por autor
5. Priorize: STJ > TRF > TNU > TJ

⚠️⚠️⚠️ REGRAS CRÍTICAS DE JURISPRUDÊNCIA ⚠️⚠️⚠️
1. **NÃO INVENTE JULGADOS:** Use APENAS jurisprudência REAL que você conhece
2. **SE NÃO SOUBER:** Indique "buscar em repositórios oficiais" em vez de inventar
3. **NÚMEROS DE PROCESSO:** Use formato real ou indique "a pesquisar"
4. **DATAS DE JULGAMENTO:** Apenas se souber com certeza
5. **TESES FIXADAS:** Cite exatamente como está no acórdão, não parafraseie
6. **LINKS:** Apenas se souber o link real, senão deixe vazio

**CRÍTICO:** Jurisprudência inventada é conduta antiética. NUNCA faça isso.

Retorne JSON com NO MÁXIMO 3 de cada tipo:
{
  "jurisprudencias": [
    {
      "tipo": "acórdão/decisão monocrática/etc",
      "tribunal": "TRF1/TRF2/STJ/etc",
      "numero_processo": "número completo",
      "relator": "nome do relator",
      "data_julgamento": "DD/MM/AAAA",
      "tese_fixada": "tese principal fixada no julgado",
      "ementa_completa": "ementa completa do julgado",
      "trecho_chave": "trecho específico aplicável ao caso",
      "link": "link oficial se disponível",
      "relevancia": 0-100,
      "por_que_relevante": "explicação de como se aplica ESPECIFICAMENTE a este caso"
    }
  ],
  "sumulas": [
    {
      "tribunal": "STF/STJ/TNU/etc",
      "numero": "número da súmula",
      "tipo": "vinculante/simples",
      "texto_completo": "texto completo da súmula",
      "texto_resumido": "resumo aplicável",
      "link": "link oficial",
      "relevancia": 0-100,
      "como_aplicar": "como aplicar especificamente neste caso"
    }
  ],
  "doutrinas": [
    {
      "autor": "nome do autor",
      "obra": "nome da obra",
      "editora": "editora",
      "ano": 2024,
      "pagina": "p. XXX",
      "citacao_literal": "citação direta da obra",
      "contexto": "contexto da citação",
      "relevancia": 0-100,
      "por_que_citar": "por que citar neste caso específico"
    }
  ],
  "teses_juridicas_aplicaveis": []
}`;

        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
          
        // Chamar OpenAI para busca jurisprudências com contexto completo
        console.log('[SEARCH-JURIS] Chamando OpenAI com análise completa...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutos

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5-mini-2025-08-07',
            messages: [
              { 
                role: 'system', 
                content: 'Você é um especialista em pesquisa jurisprudencial de direito previdenciário com 20 anos de experiência. Busque jurisprudências ESPECÍFICAS e RELEVANTES para cada caso, não genéricas.' 
              },
              { role: 'user', content: prompt }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 4000,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiResponse.status === 429) {
          throw new Error('Rate limit atingido');
        }

        if (aiResponse.status === 402) {
          throw new Error('Créditos esgotados');
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
          console.log('JSON parse error, tentando limpar...');
          const cleanedContent = aiData.choices[0].message.content
            .replace(/\n/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\\"/g, '"')
            .trim();
          
          results = JSON.parse(cleanedContent);
        }

        // Salvar no cache global para reutilização
        console.log('[JURISPRUDENCE] Salvando no cache global...');
        await supabase
          .from('jurisprudence_cache')
          .insert({
            query_hash: cacheKey,
            profile: caseData.profile,
            event_type: caseData.event_type,
            results: results
          });

        console.log('[JURISPRUDENCE] ✅ Salvo no cache global');

        // Atualizar com sucesso e status completed
        await supabase
          .from('jurisprudence_results')
          .update({
            results: { ...results, status: 'completed' } as any,
            selected_ids: [],
            last_case_hash: cacheKey,
            is_stale: false
          })
          .eq('case_id', caseId);

        console.log('[JURISPRUDENCE] ✅ Background task concluída com sucesso');
      } catch (error: any) {
        console.error('[JURISPRUDENCE] ❌ Erro no background task:', error);
        
        // Atualizar com erro
        await supabase
          .from('jurisprudence_results')
          .update({
            results: { 
              status: 'error',
              error: error.name === 'AbortError' 
                ? 'Timeout: Busca de jurisprudência demorou muito.'
                : error.message || 'Erro ao buscar jurisprudência'
            } as any
          })
          .eq('case_id', caseId);
      }
    };

    // Executar em background sem aguardar (async IIFE)
    backgroundTask();

    // Retornar 202 Accepted imediatamente
    return new Response(JSON.stringify({ 
      message: 'Busca de jurisprudência iniciada',
      caseId: caseId,
      status: 'generating'
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, corsHeaders);
    }
    console.error('[JURISPRUDENCE] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro ao buscar jurisprudência',
      code: 'SEARCH_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
