import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CacheInvalidationOptions {
  caseId: string;
  triggerType: 'basic_info' | 'documents' | 'validation';
  watchFields?: any[];
}

// ✅ FASE 3: Sistema de hash de dependências
const calculateDocHash = async (caseId: string): Promise<string> => {
  try {
    const { data } = await supabase
      .from('documents')
      .select('id, document_type, uploaded_at')
      .eq('case_id', caseId);
    
    return JSON.stringify(data);
  } catch (error) {
    console.error('[CACHE] Erro ao calcular hash:', error);
    return '';
  }
};

export const useCacheInvalidation = ({ caseId, triggerType, watchFields = [] }: CacheInvalidationOptions) => {
  const [lastDocHash, setLastDocHash] = useState<string>('');

  useEffect(() => {
    const invalidateCaches = async () => {
      if (!caseId) return;
      
      console.log(`[CACHE-INVALIDATION] Tipo: ${triggerType}`);
      
      try {
        // Marcar como stale em vez de deletar
        await supabase
          .from('case_analysis')
          .update({ is_stale: true })
          .eq('case_id', caseId);
        
        await supabase
          .from('jurisprudence_results')
          .update({ is_stale: true })
          .eq('case_id', caseId);
        
        await supabase
          .from('teses_juridicas')
          .update({ is_stale: true })
          .eq('case_id', caseId);
        
        await supabase
          .from('drafts')
          .update({ is_stale: true })
          .eq('case_id', caseId);
        
        console.log('[CACHE-INVALIDATION] Dados marcados como desatualizados');
      } catch (error) {
        console.error('[CACHE-INVALIDATION] Erro:', error);
      }
    };

    // Invalidar sempre que watchFields mudarem
    if (watchFields.length > 0) {
      invalidateCaches();
    }
  }, [caseId, ...watchFields]);

  // ✅ FASE 3: Monitoramento contínuo de mudanças em documentos
  useEffect(() => {
    if (!caseId) return;

    const interval = setInterval(async () => {
      const currentHash = await calculateDocHash(caseId);
      
      if (lastDocHash && lastDocHash !== currentHash) {
        // Documentos mudaram → invalidar análise downstream
        await supabase
          .from('case_analysis')
          .update({ is_stale: true })
          .eq('case_id', caseId);
        
        console.log('[CACHE] 📄 Documentos mudaram - invalidando análise');
        toast.info('Documentos alterados. Clique em "Reanalisar" para atualizar.', {
          duration: 5000
        });
      }
      
      setLastDocHash(currentHash);
    }, 10000); // Verificar a cada 10 segundos
    
    return () => clearInterval(interval);
  }, [caseId, lastDocHash]);
};
