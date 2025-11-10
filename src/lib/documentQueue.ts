import { supabase } from '@/integrations/supabase/client';

/**
 * Add documents to processing queue
 */
export const addDocumentsToQueue = async (caseId: string, documentIds: string[]) => {
  console.log(`[Queue] Adding ${documentIds.length} documents to queue for case ${caseId}`);

  // Insert all documents into queue
  const queueItems = documentIds.map(docId => ({
    case_id: caseId,
    document_id: docId,
    status: 'pending',
    progress: 0,
    retry_count: 0,
  }));

  const { error } = await supabase
    .from('document_processing_queue')
    .insert(queueItems);

  if (error) {
    console.error('[Queue] Error adding to queue:', error);
    throw error;
  }

  console.log('[Queue] Documents added to queue successfully');
};

/**
 * Start processing queue for a case
 */
export const startQueueProcessing = async (caseId: string) => {
  console.log(`[Queue] Starting queue processing for case ${caseId}`);

  try {
    const { data, error } = await supabase.functions.invoke('process-document-queue', {
      body: { caseId },
    });

    if (error) {
      console.error('[Queue] Error starting processing:', error);
      throw error;
    }

    console.log('[Queue] Processing started:', data);
    return data;
  } catch (error) {
    console.error('[Queue] Failed to start processing:', error);
    throw error;
  }
};

/**
 * Get queue status for a case
 */
export const getQueueStatus = async (caseId: string) => {
  const { data, error } = await supabase
    .from('document_processing_queue')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Queue] Error fetching status:', error);
    return null;
  }

  const total = data?.length || 0;
  const completed = data?.filter(item => item.status === 'completed').length || 0;
  const failed = data?.filter(item => item.status === 'failed').length || 0;
  const processing = data?.filter(item => item.status === 'processing').length || 0;
  const pending = data?.filter(item => item.status === 'pending').length || 0;

  return {
    total,
    completed,
    failed,
    processing,
    pending,
    items: data,
  };
};

/**
 * Clear completed queue items for a case
 */
export const clearCompletedQueue = async (caseId: string) => {
  const { error } = await supabase
    .from('document_processing_queue')
    .delete()
    .eq('case_id', caseId)
    .eq('status', 'completed');

  if (error) {
    console.error('[Queue] Error clearing completed items:', error);
    throw error;
  }

  console.log('[Queue] Completed items cleared');
};

/**
 * Retry failed queue items
 */
export const retryFailedItems = async (caseId: string) => {
  const { error } = await supabase
    .from('document_processing_queue')
    .update({ status: 'pending', retry_count: 0, error_message: null })
    .eq('case_id', caseId)
    .eq('status', 'failed');

  if (error) {
    console.error('[Queue] Error retrying failed items:', error);
    throw error;
  }

  console.log('[Queue] Failed items marked for retry');
  
  // Start processing again
  await startQueueProcessing(caseId);
};
