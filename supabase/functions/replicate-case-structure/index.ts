import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, forceReprocess = false } = await req.json();

    if (!caseId) {
      return new Response(
        JSON.stringify({ error: 'caseId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[REPLICATE] 🚀 Iniciando replicação para caso ${caseId}`);

    // Buscar dados do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError || !caseData) {
      throw new Error(`Caso não encontrado: ${caseError?.message}`);
    }

    const results: any = {
      caseId,
      caseName: caseData.author_name,
      steps: [],
      success: false,
    };

    // ========================================
    // PASSO 1: RECLASSIFICAR DOCUMENTOS "OUTRO"
    // ========================================
    console.log('[REPLICATE] 📄 Passo 1: Reclassificando documentos...');
    const { data: outroDocuments } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId)
      .eq('document_type', 'outro');

    if (outroDocuments && outroDocuments.length > 0) {
      console.log(`[REPLICATE] 🔄 Encontrados ${outroDocuments.length} documentos "outro"`);
      
      for (const doc of outroDocuments) {
        try {
          const { error: reclassifyError } = await supabase.functions.invoke(
            'analyze-single-document',
            { body: { documentId: doc.id, forceReprocess: true } }
          );
          
          if (reclassifyError) {
            console.error(`[REPLICATE] ❌ Erro ao reclassificar doc ${doc.id}:`, reclassifyError);
          }
        } catch (error) {
          console.error(`[REPLICATE] ❌ Erro ao reclassificar doc ${doc.id}:`, error);
        }
      }
      
      results.steps.push({
        step: 'reclassify_documents',
        status: 'completed',
        documentsProcessed: outroDocuments.length,
      });
    } else {
      results.steps.push({
        step: 'reclassify_documents',
        status: 'skipped',
        reason: 'Nenhum documento "outro" encontrado',
      });
    }

    // ========================================
    // PASSO 2: VALIDAR DOCUMENTOS
    // ========================================
    console.log('[REPLICATE] ✅ Passo 2: Validando documentos...');
    const { data: validationResult, error: validationError } = await supabase.functions.invoke(
      'validate-case-documents',
      { body: { caseId } }
    );

    if (validationError) {
      results.steps.push({
        step: 'validation',
        status: 'error',
        error: validationError.message,
      });
      
      if (!forceReprocess) {
        return new Response(
          JSON.stringify({
            ...results,
            success: false,
            message: 'Validação falhou. Use forceReprocess: true para continuar mesmo assim.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      results.steps.push({
        step: 'validation',
        status: 'completed',
        isSufficient: validationResult?.is_sufficient,
        score: validationResult?.score,
      });

      if (!validationResult?.is_sufficient && !forceReprocess) {
        return new Response(
          JSON.stringify({
            ...results,
            success: false,
            message: 'Documentos insuficientes. Complete a documentação ou use forceReprocess: true.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========================================
    // PASSO 3: ANÁLISE JURÍDICA
    // ========================================
    console.log('[REPLICATE] ⚖️ Passo 3: Gerando análise jurídica...');
    const { data: analysisResult, error: analysisError } = await supabase.functions.invoke(
      'analyze-case-legal',
      { body: { caseId } }
    );

    if (analysisError) {
      results.steps.push({
        step: 'legal_analysis',
        status: 'error',
        error: analysisError.message,
      });
      
      if (!forceReprocess) {
        throw new Error(`Análise jurídica falhou: ${analysisError.message}`);
      }
    } else {
      results.steps.push({
        step: 'legal_analysis',
        status: 'completed',
      });
    }

    // ========================================
    // PASSO 4: BUSCAR JURISPRUDÊNCIA
    // ========================================
    console.log('[REPLICATE] 📚 Passo 4: Buscando jurisprudência...');
    const { data: jurisResult, error: jurisError } = await supabase.functions.invoke(
      'search-jurisprudence',
      { body: { caseId } }
    );

    if (jurisError) {
      results.steps.push({
        step: 'jurisprudence',
        status: 'error',
        error: jurisError.message,
      });
      
      if (!forceReprocess) {
        throw new Error(`Busca de jurisprudência falhou: ${jurisError.message}`);
      }
    } else {
      results.steps.push({
        step: 'jurisprudence',
        status: 'completed',
      });
    }

    // ========================================
    // PASSO 5: GERAR TESES JURÍDICAS
    // ========================================
    console.log('[REPLICATE] 💡 Passo 5: Gerando teses jurídicas...');
    
    const { data: jurisData } = await supabase
      .from('jurisprudence_results')
      .select('results')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jurisData?.results) {
      const jurisResults = jurisData.results as any;
      const { data: teseResult, error: teseError } = await supabase.functions.invoke(
        'generate-tese-juridica',
        {
          body: {
            caseId,
            selectedJurisprudencias: jurisResults.jurisprudencias || [],
            selectedSumulas: jurisResults.sumulas || [],
            selectedDoutrinas: jurisResults.doutrinas || [],
          },
        }
      );

      if (teseError) {
        results.steps.push({
          step: 'legal_theses',
          status: 'error',
          error: teseError.message,
        });
        
        if (!forceReprocess) {
          throw new Error(`Geração de teses falhou: ${teseError.message}`);
        }
      } else {
        results.steps.push({
          step: 'legal_theses',
          status: 'completed',
        });
      }
    } else {
      results.steps.push({
        step: 'legal_theses',
        status: 'skipped',
        reason: 'Nenhuma jurisprudência encontrada',
      });
    }

    // ========================================
    // PASSO 6: GERAR MINUTA
    // ========================================
    console.log('[REPLICATE] 📝 Passo 6: Gerando minuta...');
    const { data: draftResult, error: draftError } = await supabase.functions.invoke(
      'generate-petition',
      { body: { caseId } }
    );

    if (draftError) {
      results.steps.push({
        step: 'draft',
        status: 'error',
        error: draftError.message,
      });
      
      if (!forceReprocess) {
        throw new Error(`Geração de minuta falhou: ${draftError.message}`);
      }
    } else {
      results.steps.push({
        step: 'draft',
        status: 'completed',
      });
    }

    // ========================================
    // PASSO 7: QUALITY CHECK
    // ========================================
    console.log('[REPLICATE] 🔍 Passo 7: Verificando qualidade...');
    const { data: qualityData } = await supabase
      .from('quality_reports')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    results.steps.push({
      step: 'quality_check',
      status: 'completed',
      qualityStatus: qualityData?.status || 'unknown',
    });

    // ========================================
    // PASSO 8: ATUALIZAR STATUS DO CASO
    // ========================================
    if (qualityData?.status === 'aprovado') {
      console.log('[REPLICATE] ✅ Caso aprovado! Atualizando status...');
      
      await supabase
        .from('cases')
        .update({ status: 'ready_to_protocolo' })
        .eq('id', caseId);

      results.steps.push({
        step: 'update_status',
        status: 'completed',
        newStatus: 'ready_to_protocolo',
      });
    } else {
      results.steps.push({
        step: 'update_status',
        status: 'skipped',
        reason: 'Quality report não aprovado',
      });
    }

    // ========================================
    // RESULTADO FINAL
    // ========================================
    results.success = true;
    results.message = 'Replicação de estrutura concluída com sucesso!';
    results.readyToProtocol = qualityData?.status === 'aprovado';

    console.log('[REPLICATE] ✅ Replicação concluída!');

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[REPLICATE] ❌ Erro fatal:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
