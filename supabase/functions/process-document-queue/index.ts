import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { caseId } = await req.json()

    console.log(`[Queue Processor] Starting for case: ${caseId}`)

    // Get all pending queue items for this case
    const { data: queueItems, error: queueError } = await supabaseClient
      .from('document_processing_queue')
      .select('*')
      .eq('case_id', caseId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`)
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('[Queue Processor] No pending items')
      return new Response(
        JSON.stringify({ message: 'No pending items', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Queue Processor] Found ${queueItems.length} items to process`)

    // Update case status
    await supabaseClient
      .from('cases')
      .update({
        processing_status: 'processing',
        total_documents: queueItems.length,
        processed_documents: 0,
        processing_progress: 0
      })
      .eq('id', caseId)

    let processedCount = 0
    const results = []

    // Process each item sequentially
    for (const item of queueItems) {
      try {
        console.log(`[Queue Processor] Processing item ${item.id}`)

        // Mark as processing
        await supabaseClient
          .from('document_processing_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            progress: 0
          })
          .eq('id', item.id)

        // If there's a document_id, process it
        if (item.document_id) {
          // Get document
          const { data: document } = await supabaseClient
            .from('documents')
            .select('*')
            .eq('id', item.document_id)
            .single()

          if (document && document.file_path) {
            // Extract text from document
            console.log(`[Queue Processor] Extracting text from ${document.file_name}`)
            
            // Update progress
            await supabaseClient
              .from('document_processing_queue')
              .update({ progress: 30 })
              .eq('id', item.id)

            // Call extract-document function
            const extractResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-document`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  documentId: document.id,
                  filePath: document.file_path
                })
              }
            )

            if (!extractResponse.ok) {
              throw new Error(`Extract failed: ${await extractResponse.text()}`)
            }

            const extractResult = await extractResponse.json()
            console.log(`[Queue Processor] Extracted ${extractResult.text?.length || 0} chars`)

            // Update progress
            await supabaseClient
              .from('document_processing_queue')
              .update({ progress: 60 })
              .eq('id', item.id)

            // Classify document
            console.log(`[Queue Processor] Classifying document`)
            
            const classifyResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/classify-document`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                },
                body: JSON.stringify({
                  documentId: document.id,
                  text: extractResult.text
                })
              }
            )

            if (!classifyResponse.ok) {
              throw new Error(`Classify failed: ${await classifyResponse.text()}`)
            }

            await classifyResponse.json()
            console.log(`[Queue Processor] Document classified`)

            // Update progress
            await supabaseClient
              .from('document_processing_queue')
              .update({ progress: 90 })
              .eq('id', item.id)
          }
        }

        // Mark as completed
        await supabaseClient
          .from('document_processing_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            progress: 100
          })
          .eq('id', item.id)

        processedCount++

        // Update case progress
        const progress = Math.round((processedCount / queueItems.length) * 100)
        await supabaseClient
          .from('cases')
          .update({
            processed_documents: processedCount,
            processing_progress: progress
          })
          .eq('id', caseId)

        results.push({ id: item.id, status: 'completed' })

        console.log(`[Queue Processor] Item ${item.id} completed (${processedCount}/${queueItems.length})`)

      } catch (error) {
        console.error(`[Queue Processor] Error processing item ${item.id}:`, error)

        const maxRetries = 3
        const shouldRetry = item.retry_count < maxRetries

        if (shouldRetry) {
          // Mark for retry
          console.log(`[Queue Processor] Retrying item ${item.id} (attempt ${item.retry_count + 1}/${maxRetries})`)
          await supabaseClient
            .from('document_processing_queue')
            .update({
              status: 'pending',
              error_message: error instanceof Error ? error.message : 'Unknown error',
              retry_count: item.retry_count + 1,
              started_at: null
            })
            .eq('id', item.id)

          results.push({ id: item.id, status: 'retry', error: error instanceof Error ? error.message : 'Unknown error' })
        } else {
          // Mark as failed after max retries
          console.log(`[Queue Processor] Max retries reached for item ${item.id}`)
          await supabaseClient
            .from('document_processing_queue')
            .update({
              status: 'failed',
              error_message: `Max retries (${maxRetries}) exceeded: ${error instanceof Error ? error.message : 'Unknown error'}`,
              completed_at: new Date().toISOString()
            })
            .eq('id', item.id)

          results.push({ id: item.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' })
        }
      }
    }

    // Update case final status
    const allCompleted = results.every(r => r.status === 'completed')
    await supabaseClient
      .from('cases')
      .update({
        processing_status: allCompleted ? 'completed' : 'failed',
        processing_progress: 100
      })
      .eq('id', caseId)

    // Run validation after all documents processed
    if (allCompleted) {
      console.log('[Queue Processor] Running validation')
      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/validate-case-documents`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({ caseId })
          }
        )
      } catch (validationError) {
        console.error('[Queue Processor] Validation error:', validationError)
      }
    }

    console.log(`[Queue Processor] Completed: ${processedCount}/${queueItems.length}`)

    return new Response(
      JSON.stringify({
        message: 'Processing completed',
        processed: processedCount,
        total: queueItems.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Queue Processor] Fatal error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
