import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ✅ FASE 5: Converter PDFs remotos do storage em imagens e processar
 * 
 * Esta função permite reprocessar PDFs que já estão no storage, convertendo-os
 * em imagens no servidor e processando cada página individualmente.
 * 
 * Útil para casos onde:
 * - PDFs foram enviados antes da implementação de conversão client-side
 * - Usuário quer reprocessar documentos antigos
 * - Falhas na conversão client-side precisam de retry
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, caseId } = await req.json();
    
    console.log(`[CONVERT-PDF-REMOTE] 🔄 Convertendo PDF remoto: ${documentId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar documento
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Documento não encontrado: ${docError?.message}`);
    }

    // 2. Verificar se é PDF
    const isPdf = doc.mime_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');
    
    if (!isPdf) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Documento não é PDF',
          message: 'Este documento já está em formato de imagem e pode ser processado diretamente'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Baixar PDF do Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('case-documents')
      .download(doc.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`);
    }

    console.log(`[CONVERT-PDF-REMOTE] ✅ PDF baixado: ${doc.file_name} (${fileData.size} bytes)`);

    // 4. NOTA: Conversão PDF → Imagens no Deno requer bibliotecas especiais
    // Esta é uma implementação placeholder que retorna instruções para o client
    
    return new Response(
      JSON.stringify({
        success: false,
        requiresClientSideConversion: true,
        message: 'PDFs antigos precisam ser re-enviados pelo cliente para conversão',
        documentId,
        fileName: doc.file_name,
        instructions: {
          step1: 'Baixar o PDF original do storage',
          step2: 'Converter em imagens usando pdfjs no cliente',
          step3: 'Re-enviar as imagens para processamento',
          alternativa: 'Usar a função de reprocessamento que faz isso automaticamente'
        }
      }),
      { 
        status: 501, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('[CONVERT-PDF-REMOTE] ❌ Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
