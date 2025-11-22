import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useChatProcessing = (caseId: string | undefined) => {
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentDocument, setCurrentDocument] = useState<string>('');

  useEffect(() => {
    if (!caseId) return;

    // Buscar estado inicial
    const fetchInitialState = async () => {
      const { data } = await supabase
        .from('processing_queue')
        .select('*')
        .eq('case_id', caseId)
        .eq('job_type', 'chat_analysis')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setStatus(data.status as any);
        if (data.total_documents > 0) {
          setProgress((data.processed_documents / data.total_documents) * 100);
        }
        setCurrentDocument(data.current_document || '');
      }
    };

    fetchInitialState();

    // Inscrever-se em atualizações em tempo real
    const channel = supabase
      .channel(`processing-${caseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_queue',
          filter: `case_id=eq.${caseId}`,
        },
        (payload) => {
          const queue = payload.new as any;
          if (queue.job_type === 'chat_analysis') {
            setStatus(queue.status);
            setCurrentDocument(queue.current_document || '');
            
            if (queue.total_documents > 0) {
              setProgress((queue.processed_documents / queue.total_documents) * 100);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId]);

  return { status, progress, currentDocument };
};
