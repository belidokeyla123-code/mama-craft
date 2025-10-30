import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useFinalizeVersion = () => {
  const finalizeVersion = async (caseId: string, draftId: string) => {
    try {
      console.log('[FINALIZE] 🔒 Finalizando versão:', { caseId, draftId });

      // 1. Marcar draft como final
      const { error: draftError } = await supabase
        .from('drafts')
        .update({
          is_final: true,
          finalized_at: new Date().toISOString(),
          is_stale: false,
        })
        .eq('id', draftId);

      if (draftError) throw draftError;

      // 2. Congelar análise jurídica
      const { error: analysisError } = await supabase
        .from('case_analysis')
        .update({ 
          is_locked: true,
          is_stale: false 
        })
        .eq('case_id', caseId);

      if (analysisError) throw analysisError;

      // 3. Congelar jurisprudência
      const { error: jurisError } = await supabase
        .from('jurisprudence_results')
        .update({ 
          is_locked: true,
          is_stale: false 
        })
        .eq('case_id', caseId);

      if (jurisError) throw jurisError;

      // 4. Congelar teses
      const { error: tesesError } = await supabase
        .from('teses_juridicas')
        .update({ 
          is_locked: true,
          is_stale: false 
        })
        .eq('case_id', caseId);

      if (tesesError) throw tesesError;

      console.log('[FINALIZE] ✅ Versão finalizada com sucesso');
      toast.success('✅ Versão Final Salva e Congelada!');
      return true;

    } catch (error: any) {
      console.error('[FINALIZE] ❌ Erro:', error);
      toast.error(`Erro ao finalizar: ${error.message}`);
      return false;
    }
  };

  return { finalizeVersion };
};
