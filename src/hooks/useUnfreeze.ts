import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useUnfreeze = () => {
  const unfreezeCase = async (caseId: string) => {
    try {
      console.log('[UNFREEZE] 🔓 Descongelando caso:', caseId);

      // 1. Descongelar draft
      const { error: draftError } = await supabase
        .from('drafts')
        .update({
          is_final: false,
          finalized_at: null,
        })
        .eq('case_id', caseId)
        .eq('is_final', true);

      if (draftError) throw draftError;

      // 2. Desbloquear análise jurídica
      const { error: analysisError } = await supabase
        .from('case_analysis')
        .update({ is_locked: false })
        .eq('case_id', caseId)
        .eq('is_locked', true);

      if (analysisError) throw analysisError;

      // 3. Desbloquear jurisprudência
      const { error: jurisError } = await supabase
        .from('jurisprudence_results')
        .update({ is_locked: false })
        .eq('case_id', caseId)
        .eq('is_locked', true);

      if (jurisError) throw jurisError;

      // 4. Desbloquear teses
      const { error: tesesError } = await supabase
        .from('teses_juridicas')
        .update({ is_locked: false })
        .eq('case_id', caseId)
        .eq('is_locked', true);

      if (tesesError) throw tesesError;

      console.log('[UNFREEZE] ✅ Caso descongelado com sucesso');
      toast.success('🔓 Versão final descongelada. Você pode reprocessar agora.');
      return true;

    } catch (error: any) {
      console.error('[UNFREEZE] ❌ Erro:', error);
      toast.error(`Erro ao descongelar: ${error.message}`);
      return false;
    }
  };

  return { unfreezeCase };
};
