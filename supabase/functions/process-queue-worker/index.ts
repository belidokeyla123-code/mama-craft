import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CONCURRENT = 5; // Processar até 5 casos simultaneamente

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    console.log('[WORKER] Verificando fila de processamento...');
    
    // 1. Buscar próximos casos na fila (status = 'queued')
    const { data: queuedCases, error: fetchError } = await supabase
      .from('processing_queue')
      .select('*, cases!inner(*)')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT);

    if (fetchError) {
      console.error('[WORKER] Erro ao buscar fila:', fetchError);
      throw fetchError;
    }

    if (!queuedCases || queuedCases.length === 0) {
      console.log('[WORKER] Nenhum caso na fila');
      return new Response(
        JSON.stringify({ message: 'Nenhum caso na fila' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[WORKER] Processando ${queuedCases.length} caso(s) da fila...`);

    // 2. Processar cada caso em paralelo
    const results = await Promise.all(
      queuedCases.map(async (queueEntry) => {
        try {
          console.log(`[WORKER] Iniciando processamento do caso ${queueEntry.case_id}`);
          
          // Marcar como 'processing'
          const { error: updateError } = await supabase
            .from('processing_queue')
            .update({ 
              status: 'processing', 
              started_at: new Date().toISOString() 
            })
            .eq('id', queueEntry.id);

          if (updateError) {
            console.error(`[WORKER] Erro ao atualizar status para processing:`, updateError);
            throw updateError;
          }

          // Buscar documentos do caso
          const { data: documents, error: docsError } = await supabase
            .from('documents')
            .select('*')
            .eq('case_id', queueEntry.case_id);

          if (docsError) {
            console.error(`[WORKER] Erro ao buscar documentos:`, docsError);
            throw docsError;
          }

          if (!documents || documents.length === 0) {
            console.warn(`[WORKER] Nenhum documento encontrado para o caso ${queueEntry.case_id}`);
            throw new Error('Nenhum documento encontrado para processar');
          }

          console.log(`[WORKER] Encontrados ${documents.length} documentos para processar`);

          // Chamar função de processamento
          const { data: processResult, error: invokeError } = await supabase.functions.invoke('process-documents-with-ai', {
            body: {
              caseId: queueEntry.case_id,
              documentIds: documents.map(d => d.id)
            }
          });

          if (invokeError) {
            console.error(`[WORKER] Erro ao invocar process-documents-with-ai:`, invokeError);
            throw invokeError;
          }

          console.log(`[WORKER] Processamento iniciado para caso ${queueEntry.case_id}:`, processResult);

          // Aguardar alguns segundos para o processamento em background completar
          // (o process-documents-with-ai retorna imediatamente mas processa em background)
          console.log(`[WORKER] Aguardando processamento em background...`);
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Marcar como 'completed'
          const { error: completeError } = await supabase
            .from('processing_queue')
            .update({ 
              status: 'completed', 
              completed_at: new Date().toISOString() 
            })
            .eq('id', queueEntry.id);

          if (completeError) {
            console.error(`[WORKER] Erro ao atualizar status para completed:`, completeError);
          }

          console.log(`[WORKER] ✅ Caso ${queueEntry.case_id} processado com sucesso`);
          
          return { 
            success: true, 
            caseId: queueEntry.case_id,
            queueId: queueEntry.id
          };
          
        } catch (error) {
          console.error(`[WORKER] ❌ Erro ao processar caso ${queueEntry.case_id}:`, error);
          
          // Marcar como 'failed'
          const { error: failError } = await supabase
            .from('processing_queue')
            .update({ 
              status: 'failed', 
              error_message: error instanceof Error ? error.message : 'Erro desconhecido',
              retry_count: (queueEntry.retry_count || 0) + 1,
              completed_at: new Date().toISOString()
            })
            .eq('id', queueEntry.id);

          if (failError) {
            console.error(`[WORKER] Erro ao atualizar status para failed:`, failError);
          }

          return { 
            success: false, 
            caseId: queueEntry.case_id, 
            error: error instanceof Error ? error.message : 'Erro desconhecido' 
          };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[WORKER] ✅ Processamento concluído: ${successCount} sucesso(s), ${failCount} falha(s)`);

    return new Response(
      JSON.stringify({ 
        message: 'Processamento concluído',
        processed: results.length,
        success: successCount,
        failed: failCount,
        results 
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[WORKER] Erro fatal:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
