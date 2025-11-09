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
        JSON.stringify({ error: 'caseId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    let cleaned = 0;
    
    console.log(`[CLEANUP] 🧹 Iniciando limpeza do caso ${caseId}`);
    
    // 1. Remover PDFs antigos não processados (tipo "outro")
    const { data: outdatedPdfs } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId)
      .eq('document_type', 'outro')
      .or('mime_type.eq.application/pdf,file_name.ilike.%.pdf');
    
    for (const pdf of outdatedPdfs || []) {
      await supabase.storage.from('case-documents').remove([pdf.file_path]);
      await supabase.from('documents').delete().eq('id', pdf.id);
      cleaned++;
      console.log(`[CLEANUP] 🗑️ Removido PDF antigo: ${pdf.file_name}`);
    }
    
    // 2. Remover duplicatas (manter o mais recente por nome)
    const { data: allDocs } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId)
      .order('uploaded_at', { ascending: false });
    
    const seenNames = new Set<string>();
    const duplicates: string[] = [];
    
    for (const doc of allDocs || []) {
      if (seenNames.has(doc.file_name)) {
        duplicates.push(doc.id);
        console.log(`[CLEANUP] 🗑️ Duplicata encontrada: ${doc.file_name}`);
      } else {
        seenNames.add(doc.file_name);
      }
    }
    
    if (duplicates.length > 0) {
      // Deletar do storage
      const filesToDelete = allDocs!
        .filter(d => duplicates.includes(d.id))
        .map(d => d.file_path);
      
      await supabase.storage.from('case-documents').remove(filesToDelete);
      
      // Deletar do banco
      await supabase.from('documents').delete().in('id', duplicates);
      cleaned += duplicates.length;
    }
    
    // 3. Forçar reprocessamento de documentos "outro" restantes
    const { data: outrosRemaining } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId)
      .eq('document_type', 'outro');
    
    if (outrosRemaining && outrosRemaining.length > 0) {
      console.log(`[CLEANUP] 🔄 Reprocessando ${outrosRemaining.length} documentos "outro"`);
      
      for (const doc of outrosRemaining) {
        await supabase.functions.invoke('analyze-single-document', {
          body: {
            documentId: doc.id,
            caseId,
            forceReprocess: true
          }
        });
      }
    }
    
    console.log(`[CLEANUP] ✅ Limpeza concluída: ${cleaned} documentos removidos, ${outrosRemaining?.length || 0} reprocessando`);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        cleaned,
        reprocessing: outrosRemaining?.length || 0,
        message: `${cleaned} documentos removidos, ${outrosRemaining?.length || 0} reprocessando`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[CLEANUP] Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
