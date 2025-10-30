import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * ✅ FASE 4: Hook para reprocessamento automático de análises desatualizadas
 * 
 * Monitora constantemente as flags is_stale e dispara reprocessamento automático
 * quando análise/jurisprudência/teses ficam desatualizadas.
 */
export const useAutoReprocessing = (caseId: string) => {
  useEffect(() => {
    if (!caseId) return;
    
    const checkAndReprocess = async () => {
      console.log('[AUTO-REPROCESS] 🔍 Verificando se precisa reprocessar...');
      
      try {
        // Verificar o que está stale (apenas is_stale)
        const { data: analysis } = await supabase
          .from('case_analysis')
          .select('is_stale')
          .eq('case_id', caseId)
          .maybeSingle();
        
        const { data: juris } = await supabase
          .from('jurisprudence_results')
          .select('is_stale')
          .eq('case_id', caseId)
          .maybeSingle();
        
        const { data: teses } = await supabase
          .from('teses_juridicas')
          .select('is_stale')
          .eq('case_id', caseId)
          .maybeSingle();
        
        // Se análise está stale, reprocessar
        if (analysis?.is_stale) {
          console.log('[AUTO-REPROCESS] 🔄 Análise desatualizada, reprocessando...');
          toast.info('🔄 Análise desatualizada. Reprocessando automaticamente...');
          
          await supabase.functions.invoke('analyze-case-legal', { body: { caseId } });
          toast.success('✅ Análise atualizada!');
        }
        
        // Se jurisprudência está stale E análise está ok, reprocessar
        if (juris?.is_stale && !analysis?.is_stale) {
          console.log('[AUTO-REPROCESS] 🔄 Jurisprudência desatualizada, reprocessando...');
          toast.info('🔄 Atualizando jurisprudência...');
          
          await supabase.functions.invoke('search-jurisprudence', { body: { caseId } });
          toast.success('✅ Jurisprudência atualizada!');
        }
        
        // Se teses estão stale E jurisprudência está ok, reprocessar
        if (teses?.is_stale && !juris?.is_stale) {
          console.log('[AUTO-REPROCESS] 🔄 Teses desatualizadas, reprocessando...');
          toast.info('🔄 Atualizando teses jurídicas...');
          
          await supabase.functions.invoke('generate-tese-juridica', { 
            body: { caseId, selectedJurisprudencias: [], selectedSumulas: [], selectedDoutrinas: [] }
          });
          toast.success('✅ Teses atualizadas!');
        }
      } catch (error) {
        console.error('[AUTO-REPROCESS] Erro:', error);
      }
    };
    
    // Verificar imediatamente ao montar
    checkAndReprocess();
    
    // Verificar a cada 15 segundos
    const interval = setInterval(checkAndReprocess, 15000);
    return () => clearInterval(interval);
  }, [caseId]);
};