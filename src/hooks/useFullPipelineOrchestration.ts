import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PipelineStep {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  error?: string;
  [key: string]: any;
}

interface PipelineResult {
  success: boolean;
  message?: string;
  steps: PipelineStep[];
  readyToProtocol?: boolean;
}

export const useFullPipelineOrchestration = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const runFullPipeline = async (caseId: string, forceReprocess = false, skipUnfreezeCheck = false): Promise<PipelineResult | null> => {
    if (!caseId) {
      toast.error('ID do caso não fornecido');
      return null;
    }

    // Verificar se tem versão final (a menos que skipUnfreezeCheck seja true)
    if (!skipUnfreezeCheck) {
      const { data: finalDraft } = await supabase
        .from('drafts')
        .select('id, is_final')
        .eq('case_id', caseId)
        .eq('is_final', true)
        .maybeSingle();

      if (finalDraft) {
        toast.error('⚠️ Versão final detectada! Use o diálogo de confirmação para descongelar antes de reprocessar.');
        return {
          success: false,
          message: 'Versão final congelada. Descongelar primeiro.',
          steps: [],
          readyToProtocol: false,
        };
      }
    }

    setIsRunning(true);
    setProgress(0);
    
    const toastId = toast.loading('Iniciando pipeline completo...', { id: 'full-pipeline' });

    try {
      setCurrentStep('Reclassificando documentos');
      setProgress(10);
      
      const { data, error } = await supabase.functions.invoke('replicate-case-structure', {
        body: { caseId, forceReprocess }
      });

      if (error) {
        throw error;
      }

      const result = data as PipelineResult;

      if (!result.success) {
        toast.error(result.message || 'Pipeline falhou', { id: toastId });
        return result;
      }

      // Mostrar progresso baseado nos steps
      const totalSteps = result.steps.length;
      result.steps.forEach((step, index) => {
        const stepProgress = ((index + 1) / totalSteps) * 100;
        setProgress(stepProgress);
        
        if (step.status === 'error') {
          console.error(`[PIPELINE] Erro no passo ${step.step}:`, step.error);
        }
      });

      setProgress(100);

      if (result.readyToProtocol) {
        toast.success('✅ Pipeline concluído! Caso pronto para protocolar.', { id: toastId });
      } else {
        toast.success('Pipeline concluído com ressalvas. Verifique o relatório de qualidade.', { id: toastId });
      }

      // Disparar evento de sincronização para outras abas
      window.dispatchEvent(new CustomEvent('case-pipeline-completed', {
        detail: { caseId, timestamp: Date.now(), result }
      }));

      return result;

    } catch (error: any) {
      console.error('[PIPELINE] Erro fatal:', error);
      toast.error(`Erro no pipeline: ${error.message}`, { id: toastId });
      return null;
    } finally {
      setIsRunning(false);
      setCurrentStep('');
    }
  };

  return {
    runFullPipeline,
    isRunning,
    currentStep,
    progress,
  };
};

