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
    const invalidateCaches = async () => {
      if (!caseId) return;
      
      console.log(`[CACHE-INVALIDATION] Tipo: ${triggerType}`);
      
      try {
        // Deletar análise antiga
        await supabase
          .from('case_analysis')
          .delete()
          .eq('case_id', caseId);
        
        // Deletar jurisprudência antiga
        await supabase
          .from('jurisprudence_results')
          .delete()
          .eq('case_id', caseId);
        
        // Deletar teses antigas
        await supabase
          .from('teses_juridicas')
          .delete()
          .eq('case_id', caseId);
        
        console.log('[CACHE-INVALIDATION] Caches deletados');
      } catch (error) {
        console.error('[CACHE-INVALIDATION] Erro:', error);
      }
    };

    // Invalidar sempre que watchFields mudarem
    if (watchFields.length > 0) {
      invalidateCaches();
    }
  }, [caseId, ...watchFields]);
};
