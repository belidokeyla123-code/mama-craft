import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PipelineStatus {
  documentos: 'pending' | 'running' | 'complete' | 'error';
  validacao: 'pending' | 'running' | 'complete' | 'error';
  analise: 'pending' | 'running' | 'complete' | 'error';
  jurisprudencia: 'pending' | 'running' | 'complete' | 'error';
  teses: 'pending' | 'running' | 'complete' | 'error';
  peticao: 'pending' | 'running' | 'complete' | 'error';
}

interface PipelineStale {
  documentos: boolean;
  validacao: boolean;
  analise: boolean;
  jurisprudencia: boolean;
  teses: boolean;
  peticao: boolean;
}

export const useCasePipeline = (caseId: string) => {
  const [status, setStatus] = useState<PipelineStatus>({
    documentos: 'pending',
    validacao: 'pending',
    analise: 'pending',
    jurisprudencia: 'pending',
    teses: 'pending',
    peticao: 'pending'
  });

  const [isStale, setIsStale] = useState<PipelineStale>({
    documentos: false,
    validacao: false,
    analise: false,
    jurisprudencia: false,
    teses: false,
    peticao: false
  });

  const checkPipelineStatus = async () => {
    if (!caseId) return;

    try {
      // Verificar documentos
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId);
      
      if (docs && docs.length > 0) {
        setStatus(prev => ({ ...prev, documentos: 'complete' }));
      }
      
      // Verificar validação
      const { data: validation } = await supabase
        .from('document_validation')
        .select('is_sufficient')
        .eq('case_id', caseId)
        .order('validated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (validation?.is_sufficient) {
        setStatus(prev => ({ ...prev, validacao: 'complete' }));
      }
      
      // Verificar análise
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('id, is_stale')
        .eq('case_id', caseId)
        .maybeSingle();
      
      if (analysis) {
        setStatus(prev => ({ ...prev, analise: 'complete' }));
        setIsStale(prev => ({ ...prev, analise: analysis.is_stale || false }));
      }
      
      // Verificar jurisprudência
      const { data: juris } = await supabase
        .from('jurisprudence_results')
        .select('selected_ids, is_stale')
        .eq('case_id', caseId)
        .maybeSingle();
      
      if (juris && (juris.selected_ids as any[])?.length > 0) {
        setStatus(prev => ({ ...prev, jurisprudencia: 'complete' }));
        setIsStale(prev => ({ ...prev, jurisprudencia: juris.is_stale || false }));
      }
      
      // Verificar teses
      const { data: teses } = await supabase
        .from('teses_juridicas')
        .select('id, is_stale')
        .eq('case_id', caseId)
        .maybeSingle();
      
      if (teses) {
        setStatus(prev => ({ ...prev, teses: 'complete' }));
        setIsStale(prev => ({ ...prev, teses: teses.is_stale || false }));
      }
      
      // Verificar petição
      const { data: draft } = await supabase
        .from('drafts')
        .select('id, is_stale')
        .eq('case_id', caseId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (draft) {
        setStatus(prev => ({ ...prev, peticao: 'complete' }));
        setIsStale(prev => ({ ...prev, peticao: draft.is_stale || false }));
      }
    } catch (error) {
      console.error('[PIPELINE] Erro ao verificar status:', error);
    }
  };

  const runFullPipeline = async () => {
    try {
      // 1. Validação
      setStatus(prev => ({ ...prev, validacao: 'running' }));
      await supabase.functions.invoke('validate-case-documents', { body: { caseId } });
      setStatus(prev => ({ ...prev, validacao: 'complete' }));
      
      // 2. Análise
      setStatus(prev => ({ ...prev, analise: 'running' }));
      await supabase.functions.invoke('analyze-case-legal', { body: { caseId } });
      setStatus(prev => ({ ...prev, analise: 'complete' }));
      
      // 3. Jurisprudência
      setStatus(prev => ({ ...prev, jurisprudencia: 'running' }));
      await supabase.functions.invoke('search-jurisprudence', { body: { caseId } });
      setStatus(prev => ({ ...prev, jurisprudencia: 'complete' }));
      
      // 4. Teses (se jurisprudências foram selecionadas)
      const { data: juris } = await supabase
        .from('jurisprudence_results')
        .select('selected_ids')
        .eq('case_id', caseId)
        .maybeSingle();
      
      if (juris && (juris.selected_ids as any[])?.length > 0) {
        setStatus(prev => ({ ...prev, teses: 'running' }));
        await supabase.functions.invoke('generate-tese-juridica', { 
          body: { caseId, selectedJurisprudencias: [], selectedSumulas: [], selectedDoutrinas: [] }
        });
        setStatus(prev => ({ ...prev, teses: 'complete' }));
      }

      toast.success('Pipeline completo executado com sucesso!');
    } catch (error) {
      console.error('[PIPELINE] Erro:', error);
      toast.error('Erro ao executar pipeline completo');
    }
  };

  // Verificar status ao montar
  useEffect(() => {
    if (caseId) {
      checkPipelineStatus();
    }
  }, [caseId]);

  return { status, isStale, runFullPipeline, checkPipelineStatus };
};
