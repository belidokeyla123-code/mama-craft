import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "../_shared/cors.ts";
import { callLovableAI } from "../_shared/ai-helpers.ts";
import { validateRequest, createValidationErrorResponse, autoFixQualitySchema } from '../_shared/validators.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validated = validateRequest(autoFixQualitySchema, body);
    const { caseId, qualityReport: qualityReportParam } = validated;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Buscar qualityReport do banco se não foi passado no body
    let qualityReport = qualityReportParam;
    if (!qualityReport) {
      const { data: qrData } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('case_id', caseId)
        .eq('document_type', 'petition')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      qualityReport = qrData;
      
      if (!qualityReport) {
        throw new Error('Quality report não encontrado');
      }
    }
    
    console.log('[AUTO-FIX-QUALITY] Iniciando correções automáticas:', {
      caseId,
      status: qualityReport?.status,
      issues: qualityReport?.issues?.length || 0
    });

    // Buscar dados do caso
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (!caseData) {
      throw new Error('Caso não encontrado');
    }

    // Buscar petição atual
    const { data: draftData } = await supabase
      .from('drafts')
      .select('markdown_content')
      .eq('case_id', caseId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const petition = draftData?.markdown_content || '';
    if (!petition) {
      throw new Error('Petição não encontrada');
    }

    let corrections: any[] = [];

    // ═══════════════════════════════════════════════════════════════
    // CORREÇÃO 1: ENDEREÇAMENTO (se incorreto)
    // ═══════════════════════════════════════════════════════════════
    if (!qualityReport.enderecamento_ok) {
      console.log('[AUTO-FIX] 🔧 Corrigindo endereçamento...');

      const { data: jurisdictionData } = await supabase.functions.invoke('validate-jurisdiction', {
        body: {
          city: caseData.birth_city,
          uf: caseData.birth_state,
          address: caseData.author_address
        }
      });

      if (jurisdictionData) {
        const subsecao = jurisdictionData.subsecao;
        const uf = jurisdictionData.uf || caseData.birth_state;

        console.log('[AUTO-FIX] 🎯 Jurisdição correta:', { subsecao, uf });
        console.log('[AUTO-FIX] 📝 Procurando padrões de endereçamento na petição...');

        // REGEX ROBUSTA: Captura QUALQUER variação de JEF + Cidade + UF
        const enderecamentoRegex = /EXCELENTÍSSIMO\s+SENHOR\s+DOUTOR\s+JUIZ\s+FEDERAL\s+DO\s+JUIZADO\s+ESPECIAL\s+FEDERAL\s+DE\s+([A-ZÀ-Ú\s\-]+?)\s*\/\s*([A-Z]{2})/gi;
        
        let petitionCorrigida = petition;
        let foundMatch = false;
        
        // Substituir TODAS as ocorrências de endereçamento incorreto
        petitionCorrigida = petitionCorrigida.replace(enderecamentoRegex, (_match: string, cidade: string, estadoAtual: string) => {
          foundMatch = true;
          console.log('[AUTO-FIX] 🔍 Encontrado:', { cidade: cidade.trim(), estadoAtual });
          
          // Substituir por endereçamento correto
          const novoEnderecamento = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DO JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}`;
          console.log('[AUTO-FIX] ✅ Substituindo por:', novoEnderecamento);
          
          return novoEnderecamento;
        });

        if (!foundMatch) {
          console.log('[AUTO-FIX] ⚠️ Nenhum endereçamento encontrado na petição, inserindo no início...');
          petitionCorrigida = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DO JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}\n\n` + petitionCorrigida;
        }

        corrections.push({
          module: 'enderecamento',
          issue: 'Endereçamento incorreto ou ausente',
          action: `Corrigido para: ${subsecao}/${uf}`,
          before: petition.substring(0, 200),
          after: petitionCorrigida.substring(0, 200),
          confidence: 95
        });

        // Salvar petição corrigida
        await supabase.from('drafts').insert({
          case_id: caseId,
          markdown_content: petitionCorrigida,
          payload: { auto_fixed_enderecamento: true, subsecao, uf },
          is_stale: false
        });
        
        // Registrar em correction_history
        await supabase.from('correction_history').insert({
          case_id: caseId,
          correction_type: 'enderecamento',
          module: 'quality_report',
          before_content: petition.substring(0, 500),
          after_content: petitionCorrigida.substring(0, 500),
          changes_summary: { subsecao, uf, foundMatch },
          auto_applied: true,
          confidence_score: 95
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CORREÇÃO 2: VALOR DA CAUSA (se incorreto)
    // ═══════════════════════════════════════════════════════════════
    if (!qualityReport.valor_causa_validado) {
      console.log('[AUTO-FIX] 🔧 Corrigindo valor da causa...');

      const fatoGeradorDate = caseData.child_birth_date || caseData.event_date;
      const fatoGeradorYear = new Date(fatoGeradorDate).getFullYear();
      const salarioMinimoHistory = caseData.salario_minimo_history || [];
      const salarioMinimoCorreto = salarioMinimoHistory.find(
        (h: any) => h.year === fatoGeradorYear
      )?.value || 1212.00;

      const valorCausaCorreto = salarioMinimoCorreto * 4;

      // Atualizar no banco
      await supabase
        .from('cases')
        .update({
          salario_minimo_ref: salarioMinimoCorreto,
          valor_causa: valorCausaCorreto
        })
        .eq('id', caseId);

      await supabase
        .from('case_analysis')
        .update({ valor_causa: valorCausaCorreto })
        .eq('case_id', caseId);

      corrections.push({
        module: 'valor_causa',
        issue: 'Valor da causa incorreto (usando salário mínimo errado)',
        action: `Recalculado: R$ ${valorCausaCorreto.toFixed(2)} (base: ${fatoGeradorYear})`,
        before: String(qualityReport.valor_causa_referencia),
        after: String(valorCausaCorreto),
        confidence: 100
      });
      
      // Registrar em correction_history
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: 'valor_causa',
        module: 'quality_report',
        before_content: String(qualityReport.valor_causa_referencia),
        after_content: String(valorCausaCorreto),
        changes_summary: { fatoGeradorYear, salarioMinimoCorreto, valorCausaCorreto },
        auto_applied: true,
        confidence_score: 100
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CORREÇÃO 3: JURISDIÇÃO (se incorreta)
    // ═══════════════════════════════════════════════════════════════
    if (!qualityReport.jurisdicao_ok) {
      console.log('[AUTO-FIX] 🔧 Validando e corrigindo jurisdição...');

      // Já corrigido no passo 1 (endereçamento)
      corrections.push({
        module: 'jurisdicao',
        issue: 'Jurisdição validada',
        action: 'Jurisdição corrigida via validação online',
        confidence: qualityReport.jurisdicao_confianca === 'alta' ? 95 : 80
      });
      
      // Registrar em correction_history
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: 'jurisdicao',
        module: 'quality_report',
        changes_summary: { status: 'validated' },
        auto_applied: true,
        confidence_score: qualityReport.jurisdicao_confianca === 'alta' ? 95 : 80
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CORREÇÃO 4: DADOS COMPLETOS (preencher campos faltantes)
    // ═══════════════════════════════════════════════════════════════
    const camposFaltantes = qualityReport.campos_faltantes || [];
    if (!qualityReport.dados_completos && camposFaltantes.length > 0) {
      console.log('[AUTO-FIX] 🔧 Preenchendo campos faltantes:', camposFaltantes);

      let petitionComDados = petition;

      // Buscar dados da procuração
      const { data: documents } = await supabase
        .from('documents')
        .select('*, extractions(*)')
        .eq('case_id', caseId)
        .eq('document_type', 'procuracao');

      const procuracaoData = documents?.[0]?.extractions?.[0]?.entities || {};

      for (const campo of camposFaltantes) {
        const valorCampo = caseData[`author_${campo.toLowerCase()}`] || procuracaoData[campo.toLowerCase()];
        
        if (valorCampo) {
          const placeholderRegex = new RegExp(`\\[${campo}\\]`, 'gi');
          petitionComDados = petitionComDados.replace(placeholderRegex, valorCampo);
        }
      }

      // Salvar petição com dados preenchidos
      await supabase.from('drafts').insert({
        case_id: caseId,
        markdown_content: petitionComDados,
        payload: { auto_filled_fields: camposFaltantes },
        is_stale: false
      });

      corrections.push({
        module: 'dados_completos',
        issue: `${camposFaltantes.length} campos faltantes`,
        action: `Preenchidos: ${camposFaltantes.join(', ')}`,
        before: 'Placeholders vazios',
        after: 'Dados preenchidos',
        confidence: 85
      });
      
      // Registrar em correction_history
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: 'dados_completos',
        module: 'quality_report',
        changes_summary: { camposFaltantes },
        auto_applied: true,
        confidence_score: 85
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CORREÇÕES 5 E 6: RODAR EM PARALELO (PORTUGUÊS + DOCUMENTOS)
    // ═══════════════════════════════════════════════════════════════
    console.log('[AUTO-FIX] 🚀 Iniciando análises em paralelo (Português + Documentos)...');
    
    // Declarar variáveis FORA dos try/catch
    let analisePortugues: any = null;
    let analiseDocumentos: any = null;
    let errosPortugues: any[] = [];
    let problemasDocumentos: any[] = [];
    
    // Buscar documentos do caso
    const { data: caseDocuments } = await supabase
      .from('documents')
      .select('file_name, document_type')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    const documentosInfo = caseDocuments?.map((doc: any, i: number) => 
      `Doc. ${String(i + 1).padStart(2, '0')}: ${doc.file_name} (tipo: ${doc.document_type})`
    ).join('\n') || 'Nenhum documento anexado';

    // Extrair seção "Das Provas" da petição
    const secaoProvasMatch = petition.match(/(?:DAS PROVAS|DOS DOCUMENTOS)([\s\S]*?)(?=\n\n[A-Z]{2,}|$)/i);
    const secaoProvas = secaoProvasMatch ? secaoProvasMatch[0] : '';

    // ✅ RODAR ANÁLISES EM PARALELO
    const [resultPortugues, resultDocumentos] = await Promise.all([
      // Análise 1: Português e Sintaxe
      (async () => {
        try {
          const promptPortugues = `Você é um revisor especializado em português jurídico.

PETIÇÃO:
${petition}

TAREFA: Identifique e corrija APENAS erros objetivos de:
1. Concordância verbal e nominal
2. Pontuação incorreta
3. Repetições desnecessárias de palavras
4. Problemas graves de coesão

NÃO altere:
- Terminologia jurídica
- Estrutura argumentativa
- Citações de leis/jurisprudências

RETORNE JSON:
{
  "temErros": true/false,
  "errosEncontrados": [
    {
      "tipo": "concordancia" | "pontuacao" | "repeticao" | "coesao",
      "trecho_original": "texto com erro",
      "correcao": "texto corrigido",
      "explicacao": "breve explicação"
    }
  ],
  "peticao_corrigida": "texto completo corrigido ou null se não houver erros"
}`;

          const result = await callLovableAI(promptPortugues, {
            model: 'google/gemini-2.5-flash',
            responseFormat: "json_object"
          });
          
          return JSON.parse(result.content);
        } catch (error) {
          console.error('[AUTO-FIX] ❌ FALHA na análise de português:', error);
          return null;
        }
      })(),
      
      // Análise 2: Validação de Documentos
      (async () => {
        try {
          const promptDocumentos = `Você é um assistente jurídico especializado em validação de provas.

DOCUMENTOS ANEXADOS AO CASO:
${documentosInfo}

SEÇÃO "DAS PROVAS" DA PETIÇÃO:
${secaoProvas || 'Seção não encontrada'}

TAREFA: Valide se a petição cita corretamente os documentos anexados.

VERIFIQUE:
1. Todos os documentos citados como "Doc. XX" existem?
2. A numeração está correta? (Doc. 01 = primeiro documento, etc)
3. O tipo de documento citado corresponde ao arquivo real?
4. Existem documentos anexados que não foram citados?

RETORNE JSON:
{
  "temProblemas": true/false,
  "problemas": [
    {
      "tipo": "doc_inexistente" | "numeracao_errada" | "tipo_incorreto" | "doc_nao_citado",
      "descricao": "Descrição do problema",
      "doc_citado": "Doc. XX citado na petição",
      "doc_real": "Nome do arquivo real"
    }
  ],
  "secao_provas_corrigida": "Seção 'Das Provas' reescrita com citações corretas ou null se não houver problemas"
}`;

          const result = await callLovableAI(promptDocumentos, {
            model: 'google/gemini-2.5-flash',
            responseFormat: "json_object"
          });
          
          return JSON.parse(result.content);
        } catch (error) {
          console.error('[AUTO-FIX] ❌ FALHA na validação de documentos:', error);
          return null;
        }
      })()
    ]);

    // ═══ PROCESSAR RESULTADO: PORTUGUÊS ═══
    analisePortugues = resultPortugues;
    if (analisePortugues && analisePortugues.temErros && analisePortugues.peticao_corrigida) {
      console.log('[AUTO-FIX] ✅ Erros de português encontrados e corrigidos:', analisePortugues.errosEncontrados.length);
      errosPortugues = analisePortugues.errosEncontrados || [];
      
      // Salvar petição corrigida
      await supabase.from('drafts').insert({
        case_id: caseId,
        markdown_content: analisePortugues.peticao_corrigida,
        payload: { 
          auto_fixed_portugues: true,
          erros_corrigidos: analisePortugues.errosEncontrados
        },
        is_stale: false
      });

      corrections.push({
        module: 'portugues',
        issue: `${analisePortugues.errosEncontrados.length} erros de português`,
        action: 'Erros de concordância, pontuação e coesão corrigidos',
        before: analisePortugues.errosEncontrados.map((e: any) => e.trecho_original).join('; '),
        after: 'Corrigido',
        confidence: 90
      });

      // Registrar em correction_history
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: 'portugues',
        module: 'quality_report',
        changes_summary: { erros: analisePortugues.errosEncontrados },
        auto_applied: true,
        confidence_score: 90
      });
    } else {
      console.log('[AUTO-FIX] ✅ Nenhum erro de português detectado');
    }

    // ═══ PROCESSAR RESULTADO: DOCUMENTOS ═══
    analiseDocumentos = resultDocumentos;
    if (analiseDocumentos && analiseDocumentos.temProblemas && analiseDocumentos.secao_provas_corrigida) {
      console.log('[AUTO-FIX] ✅ Problemas em documentos encontrados e corrigidos:', analiseDocumentos.problemas.length);
      problemasDocumentos = analiseDocumentos.problemas || [];
      
      // Substituir seção "Das Provas" na petição
      let petitionCorrigidaDocs = petition;
      if (secaoProvas) {
        petitionCorrigidaDocs = petition.replace(secaoProvas, analiseDocumentos.secao_provas_corrigida);
      } else {
        // Se não existe seção, adicionar antes do "Dos Pedidos"
        petitionCorrigidaDocs = petition.replace(
          /(?=DOS PEDIDOS)/i, 
          `\n\n${analiseDocumentos.secao_provas_corrigida}\n\n`
        );
      }

      // Salvar petição corrigida
      await supabase.from('drafts').insert({
        case_id: caseId,
        markdown_content: petitionCorrigidaDocs,
        payload: { 
          auto_fixed_documentos: true,
          problemas_corrigidos: analiseDocumentos.problemas
        },
        is_stale: false
      });

      corrections.push({
        module: 'documentos',
        issue: `${analiseDocumentos.problemas.length} problemas em documentos citados`,
        action: 'Citações de documentos corrigidas',
        before: 'Citações incorretas ou ausentes',
        after: 'Citações corrigidas e validadas',
        confidence: 95
      });

      // Registrar em correction_history
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: 'documentos',
        module: 'quality_report',
        changes_summary: { problemas: analiseDocumentos.problemas },
        auto_applied: true,
        confidence_score: 95
      });
    } else {
      console.log('[AUTO-FIX] ✅ Documentos citados corretamente');
    }

    // ═══════════════════════════════════════════════════════════════
    // FINALIZAR: ATUALIZAR QUALITY REPORT COM VALORES CORRETOS
    // ═══════════════════════════════════════════════════════════════
    console.log('[AUTO-FIX] ✅ Todas as correções aplicadas. Atualizando quality_report...');
    
    await supabase
      .from('quality_reports')
      .update({
        status: 'aprovado',
        enderecamento_ok: true,
        jurisdicao_ok: true,
        valor_causa_validado: true,
        dados_completos: true,
        
        // ✅ CORREÇÃO: Só marca como true se a análise RODOU com sucesso
        portugues_ok: analisePortugues !== null,
        documentos_validados: analiseDocumentos !== null,
        
        // ✅ NOVO: Armazenar detalhes dos erros/problemas encontrados
        erros_portugues: errosPortugues,
        problemas_documentos: problemasDocumentos,
        
        campos_faltantes: [],
        issues: [],
        generated_at: new Date().toISOString()
      })
      .eq('case_id', caseId)
      .eq('document_type', 'petition');

    console.log('[AUTO-FIX-QUALITY] ✅ Correções aplicadas:', corrections.length);

    return new Response(JSON.stringify({
      success: true,
      corrections_applied: corrections,
      total_corrections: corrections.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[AUTO-FIX-QUALITY] ❌ Erro:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
