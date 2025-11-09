import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma lógica de classificação do process-documents-with-ai
const classifyDocument = (fileName: string): string => {
  const name = fileName.toLowerCase();
  console.log(`[CLASSIFY] Analisando: "${fileName}"`);
  
  if (name.match(/pro[0-9~]/i) || name.match(/procur/i)) {
    console.log(`[CLASSIFY] ✅ PROCURAÇÃO detectada`);
    return 'procuracao';
  }
  
  if (name.match(/cer[0-9~]/i) || name.match(/cert/i) || name.match(/nasc/i)) {
    console.log(`[CLASSIFY] ✅ CERTIDÃO DE NASCIMENTO detectada`);
    return 'certidao_nascimento';
  }
  
  if (name.match(/ide[0-9~]/i) || name.match(/\brg\b/i) || name.match(/\bcpf\b/i) || 
      name.match(/identid/i) || name.match(/carteira/i)) {
    console.log(`[CLASSIFY] ✅ IDENTIFICAÇÃO (RG/CPF) detectada`);
    return 'identificacao';
  }
  
  if (name.match(/aut[0-9~]/i) || name.match(/autodec/i) || name.match(/dec[0-9~]/i)) {
    console.log(`[CLASSIFY] ✅ AUTODECLARAÇÃO RURAL detectada`);
    return 'autodeclaracao_rural';
  }
  
  if (name.match(/cni[0-9~]/i) || name.match(/cnis/i) || name.match(/his[0-9~]/i) || name.match(/histor/i)) {
    console.log(`[CLASSIFY] ✅ CNIS detectado`);
    return 'cnis';
  }
  
  if (name.match(/ter[0-9~]/i) || name.match(/terra/i) || name.match(/doc[0-9~]/i) || 
      name.match(/\bitr\b/i) || name.match(/ccir/i) || name.match(/propriedade/i) ||
      name.match(/comodato/i) || name.match(/fazenda/i) || name.match(/sitio/i) || 
      name.match(/escritura/i) || name.match(/matricula/i)) {
    console.log(`[CLASSIFY] ✅ DOCUMENTO DA TERRA detectado`);
    return 'documento_terra';
  }
  
  if (name.match(/indeferim/i) || name.match(/ind[0-9~]/i) || name.match(/admini/i) ||
      (name.match(/proces/i) && name.match(/adm/i))) {
    console.log(`[CLASSIFY] ✅ PROCESSO ADMINISTRATIVO detectado`);
    return 'processo_administrativo';
  }
  
  if (name.match(/com[0-9~]/i) || name.match(/compr/i) || name.match(/end[0-9~]/i) || 
      name.match(/endereco/i) || name.match(/residencia/i) || name.match(/\bconta\b/i)) {
    console.log(`[CLASSIFY] ✅ COMPROVANTE DE RESIDÊNCIA detectado`);
    return 'comprovante_residencia';
  }
  
  if (name.match(/fic[0-9~]/i) || name.match(/ficha/i) || name.match(/ate[0-9~]/i) || name.match(/atend/i)) {
    console.log(`[CLASSIFY] ✅ FICHA DE ATENDIMENTO detectada`);
    return 'ficha_atendimento';
  }
  
  if (name.match(/pes[0-9~]/i) || name.match(/pesca/i)) {
    console.log(`[CLASSIFY] ✅ CARTEIRA DE PESCADOR detectada`);
    return 'carteira_pescador';
  }
  
  console.log(`[CLASSIFY] ⚠️ NÃO RECONHECIDO - Classificando como "outro"`);
  return 'outro';
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    if (!caseId) {
      return new Response(
        JSON.stringify({ error: "caseId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[RECLASSIFY] Iniciando reclassificação para caso ${caseId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar todos os documentos do caso
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .eq("case_id", caseId);

    if (docsError) throw docsError;

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "Nenhum documento encontrado para reclassificar",
          reclassified: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[RECLASSIFY] ${documents.length} documentos encontrados`);

    let reclassified = 0;
    let errors = 0;

    // Reclassificar cada documento
    for (const doc of documents) {
      try {
        const newType = classifyDocument(doc.file_name);
        
        if (newType !== doc.document_type) {
          console.log(`[RECLASSIFY] ${doc.file_name}: "${doc.document_type}" → "${newType}"`);
          
          const { error: updateError } = await supabase
            .from("documents")
            .update({ document_type: newType })
            .eq("id", doc.id);

          if (updateError) {
            console.error(`[RECLASSIFY] Erro ao atualizar ${doc.file_name}:`, updateError);
            errors++;
          } else {
            reclassified++;
          }
        } else {
          console.log(`[RECLASSIFY] ${doc.file_name}: Mantido como "${newType}"`);
        }
      } catch (error) {
        console.error(`[RECLASSIFY] Erro ao processar ${doc.file_name}:`, error);
        errors++;
      }
    }

    console.log(`[RECLASSIFY] Concluído: ${reclassified} reclassificados, ${errors} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        total: documents.length,
        reclassified,
        errors,
        message: `${reclassified} documento(s) reclassificado(s) com sucesso`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[RECLASSIFY] Erro:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
