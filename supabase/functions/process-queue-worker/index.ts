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
    
    // Buscar casos com análises pendentes (validação, análise legal, jurisprudência)
    const { data: pendingCases, error: fetchError } = await supabase
      .from('processing_queue')
      .select('*')
      .or('validation_status.eq.queued,analysis_status.eq.queued,jurisprudence_status.eq.queued,status.eq.queued')
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT);

    if (fetchError) {
      console.error('[WORKER] Erro ao buscar fila:', fetchError);
      throw fetchError;
    }

    if (!pendingCases || pendingCases.length === 0) {
      console.log('[WORKER] Nenhuma tarefa pendente na fila');
      return new Response(
        JSON.stringify({ message: 'Nenhuma tarefa pendente na fila' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[WORKER] Processando ${pendingCases.length} tarefa(s)...`);

    // Processar cada caso
    const results = await Promise.all(
      pendingCases.map(async (queueEntry) => {
        const caseId = queueEntry.case_id;
        const tasks = [];

        try {
          // 1. Processar documentos se status geral = 'queued'
          if (queueEntry.status === 'queued') {
            console.log(`[WORKER] Processando documentos do caso ${caseId}`);
            
            await supabase
              .from('processing_queue')
              .update({ 
                status: 'processing', 
                started_at: new Date().toISOString() 
              })
              .eq('id', queueEntry.id);

            const { data: documents } = await supabase
              .from('documents')
              .select('*')
              .eq('case_id', caseId);

            if (documents && documents.length > 0) {
              await supabase.functions.invoke('process-documents-with-ai', {
                body: {
                  caseId: caseId,
                  documentIds: documents.map(d => d.id)
                }
              });
              
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              await supabase
                .from('processing_queue')
                .update({ 
                  status: 'completed', 
                  completed_at: new Date().toISOString() 
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'documents', success: true });
            }
          }

          // 2. Processar validação se pendente
          if (queueEntry.validation_status === 'queued') {
            console.log(`[WORKER] Validando caso ${caseId}`);
            
            await supabase
              .from('processing_queue')
              .update({ validation_status: 'processing' })
              .eq('id', queueEntry.id);

            try {
              await supabase.functions.invoke('validate-case-documents', {
                body: { caseId }
              });
              
              await supabase
                .from('processing_queue')
                .update({ 
                  validation_status: 'completed',
                  validation_completed_at: new Date().toISOString()
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'validation', success: true });
            } catch (err) {
              await supabase
                .from('processing_queue')
                .update({ 
                  validation_status: 'failed',
                  error_message: err instanceof Error ? err.message : 'Erro na validação'
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'validation', success: false });
            }
          }

          // 3. Processar análise legal se pendente
          if (queueEntry.analysis_status === 'queued') {
            console.log(`[WORKER] Analisando caso ${caseId}`);
            
            await supabase
              .from('processing_queue')
              .update({ analysis_status: 'processing' })
              .eq('id', queueEntry.id);

            try {
              await supabase.functions.invoke('analyze-case-legal', {
                body: { caseId }
              });
              
              await supabase
                .from('processing_queue')
                .update({ 
                  analysis_status: 'completed',
                  analysis_completed_at: new Date().toISOString()
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'analysis', success: true });
            } catch (err) {
              await supabase
                .from('processing_queue')
                .update({ 
                  analysis_status: 'failed',
                  error_message: err instanceof Error ? err.message : 'Erro na análise'
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'analysis', success: false });
            }
          }

          // 4. Processar busca de jurisprudência se pendente
          if (queueEntry.jurisprudence_status === 'queued') {
            console.log(`[WORKER] Buscando jurisprudências para caso ${caseId}`);
            
            await supabase
              .from('processing_queue')
              .update({ jurisprudence_status: 'processing' })
              .eq('id', queueEntry.id);

            try {
              await supabase.functions.invoke('search-jurisprudence', {
                body: { caseId }
              });
              
              await supabase
                .from('processing_queue')
                .update({ 
                  jurisprudence_status: 'completed',
                  jurisprudence_completed_at: new Date().toISOString()
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'jurisprudence', success: true });
            } catch (err) {
              await supabase
                .from('processing_queue')
                .update({ 
                  jurisprudence_status: 'failed',
                  error_message: err instanceof Error ? err.message : 'Erro na busca'
                })
                .eq('id', queueEntry.id);
              
              tasks.push({ task: 'jurisprudence', success: false });
            }
          }

          console.log(`[WORKER] ✅ Caso ${caseId} processado:`, tasks);
          
          return { 
            success: true, 
            caseId,
            tasks
          };
          
        } catch (error) {
          console.error(`[WORKER] ❌ Erro ao processar caso ${caseId}:`, error);
          
          return { 
            success: false, 
            caseId, 
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
