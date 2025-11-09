import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function classifyDocument(fileName: string): string {
  const name = fileName.toLowerCase();
  
  // PROCURAÇÃO
  if (name.includes('procura') || name.includes('procur')) {
    return 'procuracao';
  }
  
  // CERTIDÃO DE NASCIMENTO
  if (name.includes('certidao') || name.includes('certid') || name.includes('nasciment')) {
    return 'certidao_nascimento';
  }
  
  // IDENTIFICAÇÃO
  if (name.match(/\b(rg|cpf|cnh|identidade)\b/i) || 
      name.includes('registro geral') || 
      name.includes('carteira de habilitacao')) {
    return 'identificacao';
  }
  
  // CNIS
  if ((name.includes('cnis') || 
      name.includes('extrato') && (name.includes('inss') || name.includes('previdenci'))) &&
      !name.match(/\bhis\b/i)) {
    return 'cnis';
  }
  
  // HISTÓRICO ESCOLAR
  if ((name.match(/\bhis[0-9~-]/i) || name.match(/\bhis\b/i) || 
       name.includes('historico') || name.includes('escolar') || 
       name.includes('boletim')) && !name.includes('cnis')) {
    return 'historico_escolar';
  }
  
  // DECLARAÇÃO DE SAÚDE UBS
  if (name.includes('ubs') || 
      name.includes('saude') && (name.includes('declaracao') || name.includes('posto')) ||
      name.includes('unidade basica')) {
    return 'declaracao_saude_ubs';
  }
  
  // PROCESSO ADMINISTRATIVO
  if (name.includes('processo') || 
      name.includes('requerimento') || 
      name.includes('indeferimento') ||
      name.includes('administrativo')) {
    return 'processo_administrativo';
  }
  
  // AUTODECLARAÇÃO RURAL
  if (name.includes('autodeclaracao') || 
      name.includes('auto-declaracao') ||
      name.includes('declaracao') && name.includes('rural')) {
    return 'autodeclaracao_rural';
  }
  
  // DOCUMENTO DA TERRA
  if (name.includes('itr') || 
      name.includes('terra') ||
      name.includes('propriedade') ||
      name.includes('contrato') && name.includes('arrendamento')) {
    return 'documento_terra';
  }
  
  // COMPROVANTE DE RESIDÊNCIA
  if (name.match(/comp[0-9~-]/i) || name.match(/\bcomp\b/i) ||
      name.includes('comprovante') || 
      name.includes('residencia') || 
      name.includes('endereco') ||
      name.includes('luz') || 
      name.includes('agua') || 
      name.includes('energia')) {
    return 'comprovante_residencia';
  }
  
  // FICHA DE ATENDIMENTO
  if (name.match(/\bfic[0-9~-]/i) || name.match(/\bfic\b/i) ||
      name.includes('ficha') || name.includes('atendimento')) {
    return 'ficha_atendimento';
  }
  
  // CARTEIRA DE PESCADOR
  if (name.includes('pescador') || 
      name.includes('pesca') ||
      name.includes('rgp')) {
    return 'carteira_pescador';
  }
  
  return 'outro';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[RECLASSIFY-ALL] Iniciando reclassificação para caso ${caseId}`);

    // Buscar todos documentos do caso
    const { data: docs, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    if (fetchError) throw fetchError;
    if (!docs || docs.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'Nenhum documento encontrado',
        reclassified: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[RECLASSIFY-ALL] ${docs.length} documentos encontrados`);

    // Reclassificar cada documento
    const updates: Array<{ id: string; oldType: string; newType: string }> = [];
    
    for (const doc of docs) {
      const newType = classifyDocument(doc.file_name);
      if (newType !== doc.document_type) {
        console.log(`[RECLASSIFY] ${doc.file_name}: ${doc.document_type} → ${newType}`);
        updates.push({ id: doc.id, oldType: doc.document_type, newType });
      }
    }

    // Atualizar documentos em batch
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('documents')
        .update({ document_type: update.newType })
        .eq('id', update.id);

      if (updateError) {
        console.error(`[RECLASSIFY-ALL] Erro ao atualizar documento ${update.id}:`, updateError);
      }
    }

    // Reprocessar documentos reclassificados
    if (updates.length > 0) {
      console.log(`[RECLASSIFY-ALL] Reprocessando ${updates.length} documentos reclassificados`);
      
      const { error: queueError } = await supabase
        .from('processing_queue')
        .upsert({
          case_id: caseId,
          status: 'queued',
          updated_at: new Date().toISOString()
        }, { onConflict: 'case_id' });

      if (queueError) {
        console.error('[RECLASSIFY-ALL] Erro ao adicionar à fila:', queueError);
      }
    }

    return new Response(JSON.stringify({ 
      message: `${updates.length} documento(s) reclassificado(s) e reprocessado(s)`,
      reclassified: updates.length,
      details: updates
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RECLASSIFY-ALL] Erro:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
