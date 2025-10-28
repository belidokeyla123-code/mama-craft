import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar se já existe entrada para este caso
    const { data: existing } = await supabase
      .from('processing_queue')
      .select('id')
      .eq('case_id', caseId)
      .maybeSingle();

    let error;
    if (existing) {
      // Atualizar entrada existente
      const result = await supabase
        .from('processing_queue')
        .update({
          analysis_status: 'queued',
          status: 'queued',
          updated_at: new Date().toISOString()
        })
        .eq('case_id', caseId);
      error = result.error;
    } else {
      // Criar nova entrada
      const result = await supabase
        .from('processing_queue')
        .insert({
          case_id: caseId,
          analysis_status: 'queued',
          status: 'queued'
        });
      error = result.error;
    }

    if (error) throw error;

    return new Response(JSON.stringify({ 
      message: 'Análise jurídica adicionada à fila',
      status: 'queued'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in queue-analysis:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
