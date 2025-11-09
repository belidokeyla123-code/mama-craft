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

    try {
      // 1. VALIDAÇÃO (sempre executa, mesmo se insuficiente)
      console.log('[ORCHESTRATION] Executando validação...');
      const { data: validationResult, error: validationError } = await supabase.functions.invoke(
        'validate-case-documents',
        { body: { caseId } }
      );

      if (validationError) {
        console.error('[ORCHESTRATION] Erro na validação:', validationError);
        throw validationError;
      }

      console.log('[ORCHESTRATION] Validação concluída:', validationResult);

      // Avisar se documentos insuficientes, mas continuar pipeline
      if (!validationResult?.is_sufficient) {
        console.warn('[ORCHESTRATION] Documentos insuficientes, mas continuando pipeline');
        toast.warning('Documentos insuficientes detectados. Checklist técnico disponível na aba Validação.', { id: 'orchestration' });
        // NÃO retornar aqui - continuar com análise
      }

      // 2. ANÁLISE JURÍDICA
      const { error: analysisError } = await supabase.functions.invoke('analyze-case-legal', {
        body: { caseId }
      });

      if (analysisError) throw analysisError;

      // 3. JURISPRUDÊNCIA
      const { error: jurisError } = await supabase.functions.invoke('search-jurisprudence', {
        body: { caseId }
      });

      if (jurisError) throw jurisError;

      // 4. TESES JURÍDICAS
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

      // 5. MINUTA (PETIÇÃO INICIAL)
      const { error: minutaError } = await supabase.functions.invoke('generate-petition', {
        body: { caseId }
      });

      if (minutaError) throw minutaError;

      toast.success('✅ Pipeline completo! Validação → Análise → Jurisprudência → Teses → Minuta', { id: 'orchestration' });
    } catch (error: any) {
      console.error('[ORCHESTRATION] Erro:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      isProcessingRef.current = false;
    }
  };

  return { triggerFullPipeline };
};
