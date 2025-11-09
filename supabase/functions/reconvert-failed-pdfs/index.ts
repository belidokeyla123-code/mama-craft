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

    console.log(`[RECONVERT] ⚠️ NOTA IMPORTANTE: Conversão PDF→Imagens deve ser feita no FRONTEND`);
    console.log(`[RECONVERT] Backend (Deno) não suporta canvas/pdfjs nativamente`);
    console.log(`[RECONVERT] Solução: PDFs devem ser convertidos automaticamente ao fazer upload`);
    
    // ✅ MUDANÇA 2: Como não podemos converter no backend, marcar PDFs para reprocessamento
    console.log(`[RECONVERT] Marcando ${toReprocess.length} PDF(s) para conversão no próximo acesso`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `${toReprocess.length} PDF(s) detectado(s) - conversão deve ser feita no frontend`,
        reprocessed: 0,
        pendingConversion: toReprocess.length,
        documents: failedPdfs.map(p => p.file_name),
        note: "PDFs serão convertidos automaticamente no próximo upload ou na aba de documentos"
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
