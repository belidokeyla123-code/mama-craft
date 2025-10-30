import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";
import { buildPromptForDocType } from './prompts.ts';

// ============================================================
// SISTEMA DE NOMENCLATURA INTELIGENTE
// ============================================================

function sanitizeName(name: string | undefined): string {
  if (!name) return 'Sem_Nome';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_]|_$/g, '')
    .substring(0, 50);
}

function formatDateForFileName(date: string | undefined): string {
  if (!date) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function generateIntelligentFileName(docType: string, extractedData: any, originalFileName: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const originalExt = originalFileName.split('.').pop() || 'png';
  
  const templates: Record<string, (d: any) => string> = {
    certidao_nascimento: (d) => {
      // ✅ Priorizar nome da CRIANÇA, não da mãe
      const name = sanitizeName(d.childName || d.motherName || 'Sem_Nome');
      const date = formatDateForFileName(d.childBirthDate || d.motherBirthDate || timestamp);
      return `Certidao_Nascimento_${name}_${date}`;
    },
    identificacao: (d) => {
      const name = sanitizeName(d.fullName);
      if (d.rg) return `RG_${name}_${d.rg.replace(/[^0-9]/g, '').substring(0, 10)}`;
      if (d.cpf) return `CPF_${name}_${d.cpf.replace(/[^0-9]/g, '')}`;
      return `Identificacao_${name}`;
    },
    procuracao: (d) => {
      // ✅ CORRIGIDO: Usar granterName (outorgante), não attorneyName
      const granterName = d.granterName || d.clientName || 'Outorgante_Nao_Identificado';
      const cpf = d.granterCpf ? `_${d.granterCpf.substring(0, 11)}` : '';
      return `Procuracao_${sanitizeName(granterName)}${cpf}_${timestamp}`;
    },
    cnis: (d) => {
      const nit = d.nit ? `_${d.nit.replace(/[^0-9]/g, '')}` : '';
      return `CNIS${nit}_${timestamp}`;
    },
    autodeclaracao_rural: (d) => {
      const name = sanitizeName(d.fullName || d.declarantName || 'Declarante');
      return `Autodeclaracao_Rural_${name}_${timestamp}`;
    },
    documento_terra: (d) => {
      const owner = sanitizeName(d.landOwnerName || 'Proprietario');
      const docType = d.documentType || 'Terra';
      return `${docType}_${owner}_${timestamp}`;
    },
    processo_administrativo: (d) => {
      const protocol = d.raProtocol ? `_${d.raProtocol.replace(/[^0-9]/g, '')}` : '';
      return `Processo_Administrativo${protocol}_${timestamp}`;
    },
    comprovante_residencia: (d) => {
      const name = sanitizeName(d.holderName || 'Titular');
      return `Comprovante_Residencia_${name}_${timestamp}`;
    },
    historico_escolar: (d) => {
      const name = sanitizeName(d.studentName || 'Aluno');
      return `Historico_Escolar_${name}_${timestamp}`;
    },
    declaracao_saude_ubs: (d) => {
      const name = sanitizeName(d.patientName || 'Paciente');
      return `Declaracao_Saude_${name}_${timestamp}`;
    },
  };
  
  const generator = templates[docType];
  if (!generator) return `${docType}_${timestamp}`;
  
  try {
    const fileName = generator(extractedData);
    return `${fileName}.${originalExt}`;
  } catch (error) {
    console.error(`Erro ao gerar nome para ${docType}:`, error);
    return `${docType}_${timestamp}.${originalExt}`;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: user } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Could not get user')

    const requestBody = await req.json();
    const documentId = requestBody.documentId;
    const caseId = requestBody.caseId;
    const forceReprocess = requestBody.forceReprocess === true;

    if (!documentId || !caseId) {
      return new Response(JSON.stringify({ error: "Missing documentId or caseId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================================================================
    // 1. Buscar dados do documento
    // ==================================================================
    console.log(`[DOC ${documentId}] Iniciando análise...`);
    const { data: documentData, error: documentError } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (documentError) {
      console.error(`[DOC ${documentId}] Erro ao buscar dados do documento:`, documentError);
      throw new Error(documentError.message);
    }

    if (!documentData) {
      console.error(`[DOC ${documentId}] Documento não encontrado.`);
      throw new Error("Document not found");
    }

    const filePath = documentData.file_path;
    const originalFileName = documentData.file_name;
    const currentType = documentData.document_type;

    console.log(`[DOC ${documentId}] Tipo atual: ${currentType}`);

    // ==================================================================
    // 2. Verificar se já existe análise e se deve reprocessar
    // ==================================================================
    const { data: existingAnalysis, error: existingAnalysisError } = await supabaseClient
      .from('document_analysis')
      .select('*')
      .eq('document_id', documentId)
      .single();

    if (existingAnalysisError && existingAnalysisError.code !== 'PGRST116') {
      console.error(`[DOC ${documentId}] Erro ao verificar análise existente:`, existingAnalysisError);
      throw new Error(existingAnalysisError.message);
    }

    if (existingAnalysis && !forceReprocess) {
      console.log(`[DOC ${documentId}] Análise já existe. Ignorando.`);
      return new Response(
        JSON.stringify({ 
          message: "Análise já existente", 
          documentId, 
          newFileName: documentData.file_name 
        }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================================================================
    // 3. Baixar o arquivo do storage
    // ==================================================================
    console.log(`[DOC ${documentId}] Baixando arquivo do storage: ${filePath}`);
    const { data: fileData, error: storageError } = await supabaseClient.storage
      .from('case-documents')
      .download(filePath);

    if (storageError) {
      console.error(`[DOC ${documentId}] Erro ao baixar arquivo do storage:`, storageError);
      throw new Error(storageError.message);
    }

    if (!fileData) {
      console.error(`[DOC ${documentId}] Arquivo não encontrado no storage.`);
      throw new Error("File not found in storage");
    }

    const fileBase64 = base64Encode(await fileData.arrayBuffer());
    console.log(`[DOC ${documentId}] Arquivo baixado e convertido para Base64.`);

    // ==================================================================
    // 4. Chamar a API da OpenAI para análise
    // ==================================================================
    console.log(`[DOC ${documentId}] Chamando API da OpenAI...`);
    const prompt = buildPromptForDocType(currentType, ESPECIALISTA_MATERNIDADE_PROMPT);
    const openAiRequestBody = {
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${fileBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify(openAiRequestBody),
    });

    if (!openAiResponse.ok) {
      console.error(`[DOC ${documentId}] Erro na resposta da OpenAI:`, openAiResponse.status, openAiResponse.statusText, await openAiResponse.text());
      throw new Error(`OpenAI API error: ${openAiResponse.statusText}`);
    }

    const aiData = await openAiResponse.json();
    const analysisResult = JSON.parse(aiData.choices[0].message.content);

    console.log(`[DOC ${documentId}] Resposta da OpenAI recebida e parseada.`);

    // ==================================================================
    // 5. Salvar os resultados da análise no banco de dados
    // ==================================================================
    console.log(`[DOC ${documentId}] Salvando resultados da análise no banco de dados...`);
    const { error: upsertError } = await supabaseClient
      .from('document_analysis')
      .upsert({
        document_id: documentId,
        case_id: caseId,
        analysis_result: analysisResult,
        model_version: 'gpt-4-vision-preview',
      }, { onConflict: 'document_id' });

    if (upsertError) {
      console.error(`[DOC ${documentId}] Erro ao salvar análise no banco de dados:`, upsertError);
      throw new Error(upsertError.message);
    }

    console.log(`[DOC ${documentId}] Análise salva no banco de dados.`);

    // ==================================================================
    // 6. Sistema de Nomenclatura Inteligente
    // ==================================================================
    console.log(`[DOC ${documentId}] Gerando novo nome de arquivo...`);
    const newFileName = generateIntelligentFileName(
      currentType,
      analysisResult,
      originalFileName
    );

    if (!newFileName) {
      console.warn(`[DOC ${documentId}] Não foi possível gerar um novo nome de arquivo. Mantendo o original.`);
    }

    // ==================================================================
    // 7. Renomear o arquivo no storage (se o nome for diferente)
    // ==================================================================
    let newFilePath = filePath;
    if (newFileName && newFileName !== originalFileName) {
      console.log(`[DOC ${documentId}] Renomeando arquivo no storage para: ${newFileName}`);
      const newPath = filePath.substring(0, filePath.lastIndexOf('/') + 1) + newFileName;

      const { data: moveData, error: moveError } = await supabaseClient.storage
        .from('case-documents')
        .move(filePath, newPath);

      if (moveError) {
        console.error(`[DOC ${documentId}] Erro ao renomear arquivo no storage:`, moveError);
        throw new Error(moveError.message);
      }

      newFilePath = newPath;
      console.log(`[DOC ${documentId}] Arquivo renomeado no storage para: ${newPath}`);
    }

    // ==================================================================
    // 8. Atualizar o nome do arquivo no banco de dados (se renomeado)
    // ==================================================================
    if (newFileName && newFileName !== originalFileName) {
      console.log(`[DOC ${documentId}] Atualizando nome do arquivo no banco de dados para: ${newFileName}`);
      const { error: updateError } = await supabaseClient
        .from('documents')
        .update({ file_name: newFileName, file_path: newFilePath })
        .eq('id', documentId);

      if (updateError) {
        console.error(`[DOC ${documentId}] Erro ao atualizar nome do arquivo no banco de dados:`, updateError);
        throw new Error(updateError.message);
      }

      console.log(`[DOC ${documentId}] Nome do arquivo atualizado no banco de dados.`);
    }

    // ==================================================================
    // 9. Responder com sucesso
    // ==================================================================
    console.log(`[DOC ${documentId}] Análise concluída com sucesso.`);
    return new Response(
      JSON.stringify({ 
        message: "Análise concluída com sucesso", 
        documentId, 
        newFileName 
      }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Erro durante a execução da função:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
