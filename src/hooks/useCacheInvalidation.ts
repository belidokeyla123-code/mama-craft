import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CacheInvalidationOptions {
  caseId: string;
  triggerType: 'basic_info' | 'documents' | 'validation';
  watchFields?: any[];
}

export const useCacheInvalidation = ({ caseId, triggerType, watchFields = [] }: CacheInvalidationOptions) => {
  useEffect(() => {
    const invalidateAndRequeue = async () => {
      if (!caseId) return;
      
      try {
        console.log(`[CACHE] Invalidando caches - ${triggerType}`);
        
        // Deletar análises e jurisprudências antigas
        await Promise.all([
          supabase.from('case_analysis').delete().eq('case_id', caseId),
          supabase.from('jurisprudence_results').delete().eq('case_id', caseId),
          supabase.from('teses_juridicas').delete().eq('case_id', caseId),
        ]);
        
        // Re-adicionar à fila para análise completa
        const { data: existingQueue } = await supabase
          .from('processing_queue')
          .select('id')
          .eq('case_id', caseId)
          .maybeSingle();
        
        if (existingQueue) {
          await supabase
            .from('processing_queue')
            .update({
              status: 'queued',
              validation_status: 'queued',
              analysis_status: 'queued',
              jurisprudence_status: 'queued',
              updated_at: new Date().toISOString()
            })
            .eq('case_id', caseId);
        } else {
          await supabase
            .from('processing_queue')
            .insert({
              case_id: caseId,
              status: 'queued',
              validation_status: 'queued',
              analysis_status: 'queued',
              jurisprudence_status: 'queued',
            });
        }
        
        console.log(`[CACHE] ✅ Invalidação concluída - ${triggerType}`);
      } catch (error) {
        console.error('[CACHE] Erro ao invalidar:', error);
      }
    };
    
    // Só invalidar se watchFields mudarem (não no mount inicial)
    if (watchFields.length > 0 && watchFields.some(field => field !== undefined && field !== null)) {
      const timer = setTimeout(invalidateAndRequeue, 2000); // debounce 2s
      return () => clearTimeout(timer);
    }
  }, watchFields);
};
