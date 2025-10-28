import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OrchestrationOptions {
  caseId: string;
  enabled: boolean;
}

export const useCaseOrchestration = ({ caseId, enabled }: OrchestrationOptions) => {
  const isProcessingRef = useRef(false);

  const triggerFullPipeline = async (reason: string) => {
    if (!enabled || !caseId) return;
    
    if (isProcessingRef.current) {
      console.log('[ORCHESTRATION] Já processando, ignorando');
      return;
    }

    isProcessingRef.current = true;
    console.log(`[ORCHESTRATION] Iniciando pipeline completo. Motivo: ${reason}`);
    toast.loading('Atualizando caso completo...', { id: 'orchestration' });

    try {
      // 1. VALIDAÇÃO
      toast.loading('1/4 - Validando documentos...', { id: 'orchestration' });
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        'validate-case-documents',
        { body: { caseId } }
      );

      if (validationError) throw validationError;

      if (!validationResult?.is_sufficient) {
        toast.warning('Documentos insuficientes. Complete a documentação.', { id: 'orchestration' });
        isProcessingRef.current = false;
        return;
      }

      // 2. ANÁLISE JURÍDICA
      toast.loading('2/4 - Analisando caso juridicamente...', { id: 'orchestration' });
      const { error: analysisError } = await supabase.functions.invoke('analyze-case-legal', {
        body: { caseId }
      });

      if (analysisError) throw analysisError;

      // 3. JURISPRUDÊNCIA
      toast.loading('3/4 - Buscando jurisprudências...', { id: 'orchestration' });
      const { error: jurisError } = await supabase.functions.invoke('search-jurisprudence', {
        body: { caseId }
      });

      if (jurisError) throw jurisError;

      // 4. TESES JURÍDICAS
      toast.loading('4/4 - Gerando teses jurídicas...', { id: 'orchestration' });
      const { data: jurisResults } = await supabase
        .from('jurisprudence_results')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jurisResults) {
        const { error: teseError } = await supabase.functions.invoke('generate-tese-juridica', {
          body: {
            caseId,
            selectedJurisprudencias: (jurisResults.results as any)?.jurisprudencias || [],
            selectedSumulas: (jurisResults.results as any)?.sumulas || [],
            selectedDoutrinas: (jurisResults.results as any)?.doutrinas || []
          }
        });

        if (teseError) throw teseError;
      }

      toast.success('✅ Caso atualizado completamente!', { id: 'orchestration' });
    } catch (error: any) {
      console.error('[ORCHESTRATION] Erro:', error);
      toast.error(`Erro: ${error.message}`, { id: 'orchestration' });
    } finally {
      isProcessingRef.current = false;
    }
  };

  return { triggerFullPipeline };
};
