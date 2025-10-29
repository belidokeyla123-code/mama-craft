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

    console.log('[MIGRATE] Iniciando migração de benefícios para case:', caseId);

    // Buscar todas as extrações com previousBenefits
    const { data: extractions, error: extractionsError } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId);

    if (extractionsError) throw extractionsError;

    let migratedCount = 0;
    const benefitsToInsert: any[] = [];

    for (const extraction of extractions || []) {
      const entities = extraction.entities as any;
      
      if (entities?.previousBenefits && Array.isArray(entities.previousBenefits)) {
        for (const benefit of entities.previousBenefits) {
          // Verificar se já existe
          const { data: existing } = await supabase
            .from('benefit_history')
            .select('id')
            .eq('case_id', caseId)
            .eq('nb', benefit.nb || benefit.protocol || 'N/A')
            .maybeSingle();

          if (!existing) {
            benefitsToInsert.push({
              case_id: caseId,
              nb: benefit.nb || benefit.protocol || 'N/A',
              benefit_type: benefit.type || benefit.benefitType || 'Salário-Maternidade',
              status: benefit.status || 'concedido',
              start_date: benefit.startDate || benefit.start_date || null,
              end_date: benefit.endDate || benefit.end_date || null,
            });
          }
        }
      }
    }

    // Inserir em batch
    if (benefitsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('benefit_history')
        .insert(benefitsToInsert);

      if (insertError) {
        console.error('[MIGRATE] Erro ao inserir:', insertError);
        throw insertError;
      }

      migratedCount = benefitsToInsert.length;
    }

    console.log(`[MIGRATE] ✅ ${migratedCount} benefício(s) migrado(s)`);

    return new Response(JSON.stringify({ 
      success: true, 
      migratedCount,
      benefits: benefitsToInsert 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[MIGRATE] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
