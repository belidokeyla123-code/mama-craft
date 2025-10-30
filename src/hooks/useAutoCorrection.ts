import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AutoCorrectionStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  startTime?: number;
  endTime?: number;
}

export interface AutoCorrectionState {
  isRunning: boolean;
  currentStage: number;
  stages: AutoCorrectionStage[];
  totalCorrections: number;
  error?: string;
}

export const useAutoCorrection = (caseId: string) => {
  const [state, setState] = useState<AutoCorrectionState>({
    isRunning: false,
    currentStage: 0,
    stages: [
      { name: 'Análise de Qualidade', status: 'pending', progress: 0 },
      { name: 'Correções Automáticas', status: 'pending', progress: 0 },
      { name: 'Geração da Petição', status: 'pending', progress: 0 },
      { name: 'Análise do Juiz', status: 'pending', progress: 0 },
      { name: 'Aplicação de Correções', status: 'pending', progress: 0 },
      { name: 'Adaptação Regional', status: 'pending', progress: 0 },
      { name: 'Análise Recursiva', status: 'pending', progress: 0 },
      { name: 'Finalização', status: 'pending', progress: 0 },
    ],
    totalCorrections: 0,
  });

  const updateStage = useCallback((index: number, updates: Partial<AutoCorrectionStage>) => {
    setState(prev => ({
      ...prev,
      stages: prev.stages.map((stage, i) => 
        i === index ? { ...stage, ...updates } : stage
      ),
      currentStage: updates.status === 'running' ? index : prev.currentStage,
    }));
  }, []);

  const logCorrection = async (type: string, module: string, before: string, after: string, summary: any) => {
    try {
      await supabase.from('correction_history').insert({
        case_id: caseId,
        correction_type: type,
        module,
        before_content: before,
        after_content: after,
        changes_summary: summary,
        applied_by: 'Sistema Auto-Correção',
        auto_applied: true,
        confidence_score: summary.confidence || 85,
      });
    } catch (error) {
      console.error('[AUTO-CORRECTION] Erro ao registrar correção:', error);
    }
  };

  const runFullPipeline = async () => {
    console.log('[AUTO-CORRECTION] 🚀 Iniciando pipeline completo');
    setState(prev => ({ ...prev, isRunning: true, error: undefined }));

    try {
      // ETAPA 1: Análise de Qualidade
      updateStage(0, { status: 'running', progress: 0, startTime: Date.now() });
      toast.info('🔍 Analisando qualidade da petição...');

      const { data: qualityData } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('case_id', caseId)
        .eq('document_type', 'petition')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      updateStage(0, { status: 'completed', progress: 100, endTime: Date.now() });

      // ETAPA 2: Correções Automáticas
      if (qualityData && qualityData.status !== 'aprovado') {
        updateStage(1, { status: 'running', progress: 0, startTime: Date.now() });
        toast.info('🔧 Aplicando correções automáticas...');

        const { data: fixData, error: fixError } = await supabase.functions.invoke('auto-fix-quality', {
          body: { caseId, qualityReport: qualityData }
        });

        if (fixError) throw new Error(`Erro ao corrigir: ${fixError.message}`);

        const corrections = fixData?.corrections_applied || [];
        for (const corr of corrections) {
          await logCorrection('quality_report', corr.module, corr.before, corr.after, {
            issue: corr.issue,
            action: corr.action,
            confidence: corr.confidence
          });
        }

        setState(prev => ({ ...prev, totalCorrections: prev.totalCorrections + corrections.length }));
        updateStage(1, { status: 'completed', progress: 100, endTime: Date.now() });
      } else {
        updateStage(1, { status: 'completed', progress: 100, message: 'Sem correções necessárias' });
      }

      // ETAPA 3: Geração da Petição (se necessário)
      updateStage(2, { status: 'running', progress: 0, startTime: Date.now() });
      const { data: draftData } = await supabase
        .from('drafts')
        .select('markdown_content')
        .eq('case_id', caseId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!draftData) {
        toast.info('📝 Gerando petição inicial...');
        await supabase.functions.invoke('generate-petition', { body: { caseId } });
      }
      updateStage(2, { status: 'completed', progress: 100, endTime: Date.now() });

      // ETAPA 4: Análise do Juiz
      updateStage(3, { status: 'running', progress: 0, startTime: Date.now() });
      toast.info('⚖️ Analisando com Módulo Juiz...');

      const { data: judgeData, error: judgeError } = await supabase.functions.invoke('analyze-petition-judge-view', {
        body: { caseId }
      });

      if (judgeError) throw new Error(`Erro no módulo juiz: ${judgeError.message}`);
      updateStage(3, { status: 'completed', progress: 100, endTime: Date.now() });

      // ETAPA 5: Aplicação das Correções do Juiz
      if (judgeData?.brechas?.length > 0) {
        updateStage(4, { status: 'running', progress: 0, startTime: Date.now() });
        toast.info('🔧 Aplicando correções do Módulo Juiz...');

        const { data: correctedData, error: applyError } = await supabase.functions.invoke('apply-judge-corrections', {
          body: {
            petition: draftData?.markdown_content,
            judgeAnalysis: judgeData,
            caseId
          }
        });

        if (applyError) throw new Error(`Erro ao aplicar correções: ${applyError.message}`);

        // Salvar versão corrigida
        await supabase.from('drafts').insert({
          case_id: caseId,
          markdown_content: correctedData.petition_corrigida,
          payload: { auto_corrected_judge: true, applied_at: new Date().toISOString() }
        });

        await logCorrection('judge', 'brechas', draftData?.markdown_content || '', correctedData.petition_corrigida, {
          brechas_count: judgeData.brechas.length,
          auto_applied: true,
          confidence: 90
        });

        setState(prev => ({ ...prev, totalCorrections: prev.totalCorrections + judgeData.brechas.length }));
        updateStage(4, { status: 'completed', progress: 100, endTime: Date.now() });
      } else {
        updateStage(4, { status: 'completed', progress: 100, message: 'Nenhuma correção necessária' });
      }

      // ETAPA 6: Adaptação Regional
      updateStage(5, { status: 'running', progress: 0, startTime: Date.now() });
      toast.info('🗺️ Adaptando para o tribunal regional...');

      const { data: regionalData, error: regionalError } = await supabase.functions.invoke('analyze-petition-regional', {
        body: { caseId }
      });

      if (!regionalError && regionalData?.adaptacoes_sugeridas?.length > 0) {
        const { data: adaptedData } = await supabase.functions.invoke('apply-regional-adaptations', {
          body: { caseId, regionalAnalysis: regionalData }
        });

        if (adaptedData) {
          await supabase.from('drafts').insert({
            case_id: caseId,
            markdown_content: adaptedData.petition_adaptada,
            payload: { auto_adapted_regional: true, applied_at: new Date().toISOString() }
          });

          await logCorrection('regional', 'adaptacoes', '', adaptedData.petition_adaptada, {
            adaptacoes_count: regionalData.adaptacoes_sugeridas.length,
            trf: regionalData.trf,
            confidence: 85
          });

          setState(prev => ({ ...prev, totalCorrections: prev.totalCorrections + regionalData.adaptacoes_sugeridas.length }));
        }
      }
      updateStage(5, { status: 'completed', progress: 100, endTime: Date.now() });

      // ETAPA 7: Análise Recursiva (TNU)
      updateStage(6, { status: 'running', progress: 0, startTime: Date.now() });
      toast.info('⚖️ Preparando para análise recursiva...');

      const { data: appellateData } = await supabase.functions.invoke('analyze-petition-appellate', {
        body: { caseId }
      });

      if (appellateData?.adaptacoes_sugeridas?.length > 0) {
        const { data: appellateAdapted } = await supabase.functions.invoke('apply-appellate-adaptations', {
          body: { caseId, appellateAnalysis: appellateData }
        });

        if (appellateAdapted) {
          await supabase.from('drafts').insert({
            case_id: caseId,
            markdown_content: appellateAdapted.petition_adaptada,
            payload: { auto_adapted_appellate: true, applied_at: new Date().toISOString() }
          });

          setState(prev => ({ ...prev, totalCorrections: prev.totalCorrections + appellateData.adaptacoes_sugeridas.length }));
        }
      }
      updateStage(6, { status: 'completed', progress: 100, endTime: Date.now() });

      // ETAPA 8: Finalização
      updateStage(7, { status: 'running', progress: 50, startTime: Date.now() });
      toast.info('✅ Finalizando processo...');

      // Atualizar status do caso
      await supabase
        .from('cases')
        .update({ status: 'drafted', updated_at: new Date().toISOString() })
        .eq('id', caseId);

      updateStage(7, { status: 'completed', progress: 100, endTime: Date.now() });

      setState(prev => ({ ...prev, isRunning: false }));
      
      toast.success(`🎉 Pipeline completo! ${state.totalCorrections} correções aplicadas automaticamente`, {
        duration: 8000
      });

      console.log('[AUTO-CORRECTION] ✅ Pipeline concluído:', {
        total_corrections: state.totalCorrections,
        duration: Date.now() - (state.stages[0].startTime || 0)
      });

    } catch (error: any) {
      console.error('[AUTO-CORRECTION] ❌ Erro no pipeline:', error);
      setState(prev => ({
        ...prev,
        isRunning: false,
        error: error.message
      }));
      
      toast.error(`❌ Erro no pipeline: ${error.message}`, { duration: 8000 });
      
      // Marcar etapa atual como falha
      updateStage(state.currentStage, { status: 'failed', message: error.message });
    }
  };

  return {
    state,
    runFullPipeline,
    isRunning: state.isRunning,
    currentStage: state.stages[state.currentStage],
    progress: (state.currentStage / state.stages.length) * 100,
  };
};
