import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    if (!caseId) {
      return new Response(
        JSON.stringify({ error: 'caseId obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[RECONVERT] Buscando PDFs sem extraction para caso ${caseId}`);

    // ✅ MUDANÇA 2: Buscar todos os documentos PDF do caso que não têm parent_document_id
    const { data: pdfDocuments, error: pdfError } = await supabase
      .from('documents')
      .select('id, file_name, document_type, file_path')
      .eq('case_id', caseId)
      .eq('mime_type', 'application/pdf')
      .is('parent_document_id', null);

    if (pdfError) throw pdfError;

    console.log(`[RECONVERT] Encontrados ${pdfDocuments?.length || 0} PDFs`);

    const failedPdfs = [];
    const toReprocess = [];

    // Verificar quais PDFs não têm extractions
    for (const pdf of pdfDocuments || []) {
      const { data: extraction } = await supabase
        .from('extractions')
        .select('id')
        .eq('document_id', pdf.id)
        .maybeSingle();

      if (!extraction) {
        console.log(`[RECONVERT] PDF sem extraction: ${pdf.file_name}`);
        failedPdfs.push(pdf);
        toReprocess.push(pdf.id);
      }
    }

    if (toReprocess.length === 0) {
      console.log('[RECONVERT] Nenhum PDF precisa ser reprocessado');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Todos os PDFs já foram processados',
          reprocessed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[RECONVERT] ⚠️ NOTA: Conversão PDF→Imagens deve ser feita no FRONTEND`);
    console.log(`[RECONVERT] Disparando análise dos PDFs pendentes...`);
    
    // ✅ CORREÇÃO: Disparar análise para cada PDF pendente
    const analysisResults = [];
    for (const pdf of failedPdfs) {
      console.log(`[RECONVERT] Analisando PDF: ${pdf.file_name}`);
      
      try {
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
          'analyze-single-document',
          {
            body: {
              documentId: pdf.id,
              caseId: caseId,
              forceReprocess: true
            }
          }
        );

        if (analysisError) {
          console.error(`[RECONVERT] Erro ao analisar ${pdf.file_name}:`, analysisError);
          analysisResults.push({ id: pdf.id, status: 'error', error: analysisError.message });
        } else {
          console.log(`[RECONVERT] ✅ Análise concluída: ${pdf.file_name}`);
          analysisResults.push({ id: pdf.id, status: 'success' });
        }
      } catch (err: any) {
        console.error(`[RECONVERT] Exceção ao analisar ${pdf.file_name}:`, err);
        analysisResults.push({ id: pdf.id, status: 'error', error: err.message });
      }
    }

    const successCount = analysisResults.filter(r => r.status === 'success').length;

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${successCount} de ${toReprocess.length} PDF(s) analisado(s) com sucesso`,
        reprocessed: successCount,
        pendingConversion: toReprocess.length - successCount,
        documents: failedPdfs.map(p => p.file_name),
        results: analysisResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[RECONVERT] Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
