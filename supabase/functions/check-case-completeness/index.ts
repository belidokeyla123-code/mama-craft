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
    
    console.log('[COMPLETENESS] 🔍 Verificando completude do caso:', caseId);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 1️⃣ BUSCAR DADOS ATUAIS DO CASO
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    
    if (caseError) {
      console.error('[COMPLETENESS] ❌ Erro ao buscar caso:', caseError);
      throw caseError;
    }
    
    // 2️⃣ IDENTIFICAR CAMPOS FALTANTES
    const requiredFields: Record<string, string> = {
      'author_name': 'Nome da autora',
      'author_cpf': 'CPF da autora',
      'author_rg': 'RG da autora',
      'author_birth_date': 'Data de nascimento',
      'author_address': 'Endereço completo',
      'author_phone': 'Telefone',
      'child_name': 'Nome do filho(a)',
      'child_birth_date': 'Data de nascimento do filho(a)',
    };
    
    const missingFields: string[] = [];
    const missingFieldsHuman: string[] = [];
    
    for (const [field, label] of Object.entries(requiredFields)) {
      const value = caseData[field];
      if (!value || 
          value === '00000000000' || 
          value === 'Processando...' ||
          value === 'N/A' ||
          (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
        missingFieldsHuman.push(label);
      }
    }
    
    console.log(`[COMPLETENESS] ⚠️ Campos faltantes (${missingFields.length}):`, missingFieldsHuman);
    
    if (missingFields.length === 0) {
      console.log('[COMPLETENESS] ✅ Todos os campos obrigatórios preenchidos!');
      return new Response(JSON.stringify({
        complete: true,
        message: '✅ Todos os campos obrigatórios foram preenchidos!'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // 3️⃣ BUSCAR DOCUMENTOS RELEVANTES
    const relevantDocTypes = ['procuracao', 'identificacao', 'certidao_nascimento', 'declaracao_residencia', 'processo_administrativo'];
    
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_name, document_type')
      .eq('case_id', caseId)
      .in('document_type', relevantDocTypes);
    
    if (docsError) {
      console.error('[COMPLETENESS] ❌ Erro ao buscar documentos:', docsError);
    }
    
    console.log(`[COMPLETENESS] 📄 Encontrados ${documents?.length || 0} documentos relevantes`);
    
    // 4️⃣ REANALISAR DOCUMENTOS BUSCANDO CAMPOS FALTANTES
    let reanalyzedCount = 0;
    const errors: string[] = [];
    
    for (const doc of documents || []) {
      console.log(`[COMPLETENESS] 🔄 Reprocessando "${doc.file_name}"...`);
      
      try {
        const { data: result, error } = await supabase.functions.invoke('analyze-single-document', {
          body: {
            caseId,
            documentId: doc.id,
            forceDocType: doc.document_type,
          }
        });
        
        if (error) {
          console.error(`[COMPLETENESS] ⚠️ Erro ao reprocessar ${doc.file_name}:`, error.message);
          errors.push(`${doc.file_name}: ${error.message}`);
        } else if (result?.success) {
          reanalyzedCount++;
          console.log(`[COMPLETENESS] ✅ ${doc.file_name} reprocessado com sucesso`);
        }
      } catch (error) {
        console.error(`[COMPLETENESS] ⚠️ Exceção ao reprocessar ${doc.file_name}:`, error);
        errors.push(`${doc.file_name}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
    
    console.log(`[COMPLETENESS] 📊 Reprocessados: ${reanalyzedCount}/${documents?.length || 0}`);
    
    return new Response(JSON.stringify({
      complete: false,
      missingFields: missingFieldsHuman,
      reanalyzedDocuments: reanalyzedCount,
      totalRelevantDocuments: documents?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `🔄 ${reanalyzedCount} documento(s) foram reprocessados buscando: ${missingFieldsHuman.join(', ')}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[COMPLETENESS] ❌ Erro fatal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      complete: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
