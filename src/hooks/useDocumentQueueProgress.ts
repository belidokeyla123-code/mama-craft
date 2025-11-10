import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QueueProgress {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalDocuments: number;
  processedDocuments: number;
  currentDocument?: string;
  error?: string;
}

export const useDocumentQueueProgress = (caseId: string | null) => {
  const [queueProgress, setQueueProgress] = useState<QueueProgress>({
    status: 'idle',
    progress: 0,
    totalDocuments: 0,
    processedDocuments: 0,
  });

  const [isPolling, setIsPolling] = useState(false);

  // Fetch current progress from database
  const fetchProgress = useCallback(async () => {
    if (!caseId) return;

    try {
      // Get case processing status
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('processing_status, processing_progress, total_documents, processed_documents')
        .eq('id', caseId)
        .single();

      if (caseError) {
        console.error('[Queue Progress] Error fetching case:', caseError);
        return;
      }

      if (!caseData) return;

      // Get queue items to find current document
      const { data: queueItems, error: queueError } = await supabase
        .from('document_processing_queue')
        .select('*, documents(file_name)')
        .eq('case_id', caseId)
        .eq('status', 'processing')
        .order('started_at', { ascending: false })
        .limit(1);

      if (queueError) {
        console.error('[Queue Progress] Error fetching queue:', queueError);
      }

      const currentItem = queueItems?.[0];
      const currentDocName = currentItem?.documents?.file_name;

      setQueueProgress({
        status: caseData.processing_status || 'idle',
        progress: caseData.processing_progress || 0,
        totalDocuments: caseData.total_documents || 0,
        processedDocuments: caseData.processed_documents || 0,
        currentDocument: currentDocName,
      });

      // Stop polling if completed or failed
      if (caseData.processing_status === 'completed' || caseData.processing_status === 'failed') {
        setIsPolling(false);
      }

    } catch (error) {
      console.error('[Queue Progress] Error:', error);
    }
  }, [caseId]);

  // Start polling
  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  // Poll every 2 seconds when active
  useEffect(() => {
    if (!isPolling || !caseId) return;

    const interval = setInterval(() => {
      fetchProgress();
    }, 2000);

    // Initial fetch
    fetchProgress();

    return () => clearInterval(interval);
  }, [isPolling, caseId, fetchProgress]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!caseId) return;

    const channel = supabase
      .channel(`queue-progress-${caseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cases',
          filter: `id=eq.${caseId}`,
        },
        (payload) => {
          console.log('[Queue Progress] Realtime update:', payload);
          fetchProgress();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_processing_queue',
          filter: `case_id=eq.${caseId}`,
        },
        (payload) => {
          console.log('[Queue Progress] Queue update:', payload);
          fetchProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [caseId, fetchProgress]);

  return {
    queueProgress,
    startPolling,
    stopPolling,
    isPolling,
    refresh: fetchProgress,
  };
};
