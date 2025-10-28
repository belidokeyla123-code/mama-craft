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

⚠️⚠️⚠️ AGORA VOCÊ VAI BUSCAR JURISPRUDÊNCIA ⚠️⚠️⚠️

Você é um pesquisador jurídico especialista em Direito Previdenciário. Para este caso de salário-maternidade, retorne um JSON estruturado por TIPO de fonte jurídica.

CASO:
- Perfil: ${caseData.profile === 'especial' ? 'Segurada Especial Rural' : 'Segurada Urbana'}
- Evento: ${caseData.event_type}
- Tem RA: ${caseData.has_ra ? 'Sim' : 'Não'}
- Situação especial: ${caseData.has_special_situation ? 'Sim' : 'Não'}

⚠️ IMPORTANTE: Retorne fontes jurídicas REAIS e APLICÁVEIS ao caso. Não invente números de processos ou súmulas inexistentes.

ESTRUTURA DO JSON:
{
  "jurisprudencias": [
    {
      "tipo": "acordao" | "sumula" | "tese",
      "tribunal": "STF" | "STJ" | "TNU" | "TRF1" | "TRF2" | "TRF3" | "TRF4" | "TRF5" | "TRF6",
      "numero_processo": "REsp 1234567/SP" ou "PEDILEF 0012345-67.2020.4.01.3800",
      "relator": "Des. Nome do Relator",
      "data_julgamento": "YYYY-MM-DD",
      "tese_fixada": "Resumo objetivo da tese fixada neste julgado",
      "ementa_completa": "PREVIDENCIÁRIO. SALÁRIO-MATERNIDADE. SEGURADA ESPECIAL RURAL... (texto completo da ementa)",
      "trecho_chave": "Trecho mais relevante que se aplica diretamente ao caso",
      "link": "https://jurisprudencia.trf4.jus.br/...",
      "relevancia": 95,
      "por_que_relevante": "Situação fática idêntica: segurada especial sem documentação própria"
    }
  ],
  "sumulas": [
    {
      "tribunal": "STJ" | "STF" | "TNU",
      "numero": "Súmula 149",
      "tipo": "simples" | "vinculante",
      "texto_completo": "A prova exclusivamente testemunhal não basta à comprovação da atividade rurícola, para efeito da obtenção de benefício previdenciário.",
      "texto_resumido": "Prova testemunhal insuficiente sozinha",
      "link": "https://www.stj.jus.br/docs_internet/revista/eletronica/stj-revista-sumulas-2011_15_capSumula149.pdf",
      "relevancia": 90,
      "como_aplicar": "Reforça necessidade de prova documental além de testemunhas"
    }
  ],
  "doutrinas": [
    {
      "autor": "Carlos Alberto Pereira de Castro",
      "obra": "Manual de Direito Previdenciário, 26ª ed.",
      "editora": "Forense",
      "ano": 2023,
      "pagina": "p. 450-455",
      "citacao_literal": "A segurada especial rural em regime de economia familiar pode utilizar documentos em nome do cônjuge ou filhos para comprovar sua atividade, desde que demonstrado o vínculo familiar e o exercício conjunto da atividade agrícola.",
      "contexto": "Capítulo sobre Salário-Maternidade da Segurada Especial",
      "relevancia": 75,
      "por_que_citar": "Autoridade máxima em Direito Previdenciário brasileiro"
    },
    {
      "autor": "Frederico Amado",
      "obra": "Curso de Direito e Processo Previdenciário, 14ª ed.",
      "editora": "JusPodivm",
      "ano": 2023,
      "pagina": "p. 320-325",
      "citacao_literal": "O salário-maternidade da segurada especial independe de carência, sendo suficiente a comprovação do exercício da atividade rural nos 10 (dez) meses imediatamente anteriores ao parto, mesmo que não consecutivos.",
      "contexto": "Parte sobre Benefícios por Incapacidade e Maternidade",
      "relevancia": 80,
      "por_que_citar": "Obra atualizada e amplamente citada em petições"
    }
  ],
  "precedentes_vinculantes": [
    {
      "tipo": "IRDR" | "IAC" | "Recurso Repetitivo" | "Tema de Repercussão Geral",
      "numero": "Tema 1234" ou "IRDR 5000123-45.2020.4.04.0000",
      "tribunal": "STJ" | "STF" | "TRF4",
      "tese_vinculante": "Texto exato da tese fixada pelo tribunal",
      "aplicacao_obrigatoria": true,
      "link": "https://...",
      "relevancia": 100
    }
  ],
  "teses_juridicas_aplicaveis": [
    {
      "titulo": "Documentação em nome de terceiros no núcleo familiar",
      "descricao": "Mulheres em regime de economia familiar rural podem usar documentos em nome do cônjuge ou filhos como prova de atividade rural, desde que comprovem vínculo familiar e exercício conjunto da atividade",
      "fundamentacao": [
        "Súmula X do STJ",
        "Jurisprudência consolidada do TRF4 (REsp 123456)",
        "Doutrina de Carlos Alberto Pereira de Castro (Manual de Direito Previdenciário, p. 450)"
      ],
      "como_usar_na_peticao": "No capítulo DO DIREITO, argumentar que a ausência de documentos em nome próprio da segurada não é impeditiva, pois a jurisprudência do TRF4 e a doutrina majoritária reconhecem que mulheres em economia familiar podem utilizar documentos do núcleo familiar",
      "relevancia": 95
    },
    {
      "titulo": "Dispensa de carência para segurada especial",
      "descricao": "Seguradas especiais rurais têm dispensa de carência para salário-maternidade, sendo exigida apenas comprovação de atividade rural nos 10 meses anteriores ao parto",
      "fundamentacao": [
        "Art. 39, parágrafo único, da Lei 8.213/91",
        "Art. 93, §2º, do Decreto 3.048/99",
        "Jurisprudência pacífica dos TRFs"
      ],
      "como_usar_na_peticao": "No capítulo DOS FATOS, mencionar que a autora não precisa comprovar 10 meses de carência contributiva, mas apenas o exercício efetivo da atividade rural no período gestacional",
      "relevancia": 100
    },
    {
      "titulo": "Prova material + testemunhal em conjunto",
      "descricao": "Embora prova exclusivamente testemunhal seja insuficiente (Súmula 149 STJ), a combinação de prova material início de prova material com prova testemunhal é plenamente válida para comprovar atividade rural",
      "fundamentacao": [
        "Súmula 149 do STJ (interpretação a contrario sensu)",
        "TNU: início de prova material + testemunhas = comprovação suficiente",
        "Jurisprudência consolidada dos TRFs"
      ],
      "como_usar_na_peticao": "No capítulo DAS PROVAS, demonstrar que há início de prova material (declaração de sindicato, fotos, etc.) e que essa prova será corroborada por testemunhas, atendendo plenamente aos requisitos legais e jurisprudenciais",
      "relevancia": 90
    }
  ]
}

INSTRUÇÕES CRÍTICAS:
1. **Jurisprudências**: Busque DECISÕES REAIS de casos SIMILARES (segurada especial, salário-maternidade)
   - Preferir TRF4 (maior volume de casos rurais)
   - Citar número COMPLETO do processo
   - Incluir ementa COMPLETA
   - Retornar NO MÍNIMO 5 jurisprudências relevantes

2. **Súmulas**: Busque SÚMULAS NUMERADAS REAIS dos tribunais superiores
   - Súmula 149 do STJ (prova testemunhal)
   - Outras súmulas aplicáveis a seguradas especiais
   - Texto COMPLETO da súmula
   - Retornar NO MÍNIMO 3 súmulas

3. **Doutrinas**: Cite AUTORES REAIS e OBRAS EXISTENTES
   - Carlos Alberto Pereira de Castro (Manual de Direito Previdenciário)
   - Frederico Amado (Curso de Direito Previdenciário)
   - Ivan Kertzman (Curso Prático de Direito Previdenciário)
   - Citação LITERAL de trecho aplicável
   - Retornar NO MÍNIMO 2 doutrinas

4. **Precedentes Vinculantes**: Se houver Tema de Repercussão Geral ou IRDR aplicável, incluir

5. **Teses Jurídicas**: São RACIOCÍNIOS JURÍDICOS que conectam as fontes ao caso
   - NÃO são decisões judiciais
   - São argumentações construídas COM BASE nas fontes
   - Retornar NO MÍNIMO 3 teses aplicáveis ao caso

ORDENE TUDO POR RELEVÂNCIA (score mais alto primeiro).`;

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
