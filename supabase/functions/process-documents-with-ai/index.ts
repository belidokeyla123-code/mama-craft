import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractDataFromBatch } from "./extractDataFromBatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert ArrayBuffer to base64 safely
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

// Check if file is too large (limit to 4MB per image for OpenAI)
const MAX_FILE_SIZE = 4 * 1024 * 1024;

function isFileSizeAcceptable(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, documentIds } = await req.json();
    console.log(`[OCR] Iniciando processamento para caso ${caseId} com ${documentIds.length} documentos`);
    
    // Retornar resposta imediata e processar em background
    const response = new Response(
      JSON.stringify({ 
        status: 'processing',
        message: 'Processamento iniciado em background',
        caseId,
        documentCount: documentIds.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
    // Processar em background usando EdgeRuntime.waitUntil
    const backgroundTask = async () => {
      try {
        await processDocumentsInBackground(caseId, documentIds);
      } catch (error) {
        console.error('[BACKGROUND] Erro no processamento:', error);
      }
    };
    
    // @ts-ignore - EdgeRuntime existe no Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask());
    } else {
      // Fallback: processar imediatamente se waitUntil não estiver disponível
      backgroundTask();
    }
    
    return response;
  } catch (error) {
    console.error("[ERRO] Falha ao iniciar processamento:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Classificar documento por nome COM SUPORTE A NOMES TRUNCADOS E NOVOS TIPOS
const classifyDocument = (fileName: string): string => {
  const name = fileName.toLowerCase();
  console.log(`[CLASSIFY] Analisando: "${fileName}"`);
  
  // ORDEM DE PRIORIDADE: do mais específico ao mais genérico
  
  // 1. PROCURAÇÃO: PRO~, PROC, PROCUR
  if (name.match(/pro[0-9~]/i) || name.match(/procur/i)) {
    console.log(`[CLASSIFY] ✅ PROCURAÇÃO detectada`);
    return 'procuracao';
  }
  
  // 2. CERTIDÃO DE NASCIMENTO: CER~, CERT, NASC, CERTID
  if (name.match(/cer[0-9~]/i) || name.match(/cert/i) || name.match(/nasc/i)) {
    console.log(`[CLASSIFY] ✅ CERTIDÃO DE NASCIMENTO detectada: "${fileName}"`);
    console.log(`[CLASSIFY] → Este documento contém dados DA CRIANÇA (nome + data nascimento)`);
    console.log(`[CLASSIFY] → ATENÇÃO: Nome da mãe está na seção "FILIAÇÃO MATERNA"`);
    return 'certidao_nascimento';
  }
  
  // 3. RG/CPF/IDENTIDADE: ide~, rg, cpf
  if (name.match(/ide[0-9~]/i) || name.match(/\brg\b/i) || name.match(/\bcpf\b/i) || 
      name.match(/identid/i) || name.match(/carteira/i)) {
    console.log(`[CLASSIFY] ✅ IDENTIFICAÇÃO (RG/CPF) detectada`);
    return 'identificacao';
  }
  
  // 4. CNIS: CNI~, CNIS (mas NÃO histórico escolar)
  if ((name.match(/cni[0-9~]/i) || name.match(/cnis/i)) && 
      !name.match(/\bhis\b/i) && !name.match(/escola/i) && !name.match(/boletim/i)) {
    console.log(`[CLASSIFY] ✅ CNIS detectado`);
    return 'cnis';
  }
  
  // 5. HISTÓRICO ESCOLAR: HIS-, HIS~, histórico, escolar (NÃO pode ter CNIS)
  if ((name.match(/\bhis[0-9~-]/i) || name.match(/\bhis\b/i) || name.match(/11-his/i) ||
       name.includes('historico') || name.includes('escolar') || 
       name.includes('boletim') || name.includes('escola')) && 
      !name.includes('cnis')) {
    console.log(`[CLASSIFY] ✅ HISTÓRICO ESCOLAR detectado`);
    return 'historico_escolar';
  }
  
  // 6. DECLARAÇÃO DE SAÚDE UBS: UBS, saúde, posto
  if (
    name.match(/decl.*sa[úu]de/i) || 
    name.match(/ubs/i) ||
    name.match(/posto.*sa[úu]de/i) ||
    name.match(/unidade.*b[áa]sica/i) ||
    name.match(/atestado.*m[ée]dico/i) ||
    name.match(/pr[ée][-]?natal/i)
  ) {
    console.log(`[CLASSIFY] ✅ DECLARAÇÃO DE SAÚDE UBS detectada: "${fileName}"`);
    return 'declaracao_saude_ubs';
  }
  
  // 7. AUTODECLARAÇÃO RURAL: AUT~, AUTO, DEC~
  if (name.match(/aut[0-9~]/i) || name.match(/autodec/i) || name.match(/dec[0-9~]/i)) {
    console.log(`[CLASSIFY] ✅ AUTODECLARAÇÃO RURAL detectada`);
    return 'autodeclaracao_rural';
  }
  
  // 8. DOCUMENTO DA TERRA: TER~, TERRA, DOC~, ITR, CCIR
  if (
    name.match(/itr/i) || 
    name.match(/escrit.*terra/i) ||
    name.match(/matr[íi]cula.*im[óo]vel/i) ||
    name.match(/comodat/i) ||
    name.match(/cess[ãa]o.*terra/i) ||
    name.match(/contrato.*rural/i) ||
    name.match(/ter[0-9~]/i) || name.match(/terra/i) || name.match(/doc[0-9~]/i) || 
    name.match(/ccir/i) || name.match(/propriedade/i) ||
    name.match(/fazenda/i) || name.match(/sitio/i) || 
    name.match(/escritura/i) || name.match(/matricula/i)
  ) {
    console.log(`[CLASSIFY] ✅ DOCUMENTO DA TERRA detectado: "${fileName}"`);
    return 'documento_terra';
  }
  
  // 9. PROCESSO ADMINISTRATIVO: PRO~1, IND~, INDEFER, ADM
  if (
    name.match(/indefer/i) || 
    name.match(/processo.*adm/i) ||
    name.match(/despacho/i) ||
    name.match(/decis[ãa]o.*inss/i) ||
    name.match(/negativa/i) ||
    name.match(/requeri.*adm/i) ||
    name.match(/ind[0-9~]/i) || 
    name.match(/admini/i)
  ) {
    console.log(`[CLASSIFY] ✅ PROCESSO ADMINISTRATIVO/INDEFERIMENTO detectado: "${fileName}"`);
    return 'processo_administrativo';
  }
  
  // 10. COMPROVANTE DE RESIDÊNCIA: COMP, 3-COMP, COM~, COMPR
  if (name.match(/\bcomp[0-9~-]/i) || name.match(/\bcomp\b/i) ||
      name.match(/com[0-9~]/i) || name.match(/compr/i) || 
      name.match(/end[0-9~]/i) || name.match(/endereco/i) || 
      name.match(/residencia/i) || name.match(/\bconta\b/i) ||
      name.match(/3-comp/i)) {
    console.log(`[CLASSIFY] ✅ COMPROVANTE DE RESIDÊNCIA detectado`);
    return 'comprovante_residencia';
  }
  
  // 11. FICHA DE ATENDIMENTO: FIC, 12-FIC, FIC~, FICHA
  if (name.match(/\bfic[0-9~-]/i) || name.match(/\bfic\b/i) ||
      name.match(/ficha/i) || name.match(/ate[0-9~]/i) || 
      name.match(/atend/i) || name.match(/12-fic/i)) {
    console.log(`[CLASSIFY] ✅ FICHA DE ATENDIMENTO detectada`);
    return 'ficha_atendimento';
  }
  
  // 12. CARTEIRA DE PESCADOR: PES~, PESCA
  if (name.match(/pes[0-9~]/i) || name.match(/pesca/i)) {
    console.log(`[CLASSIFY] ✅ CARTEIRA DE PESCADOR detectada`);
    return 'carteira_pescador';
  }
  
  console.log(`[CLASSIFY] ⚠️ NÃO RECONHECIDO - Classificando como "outro"`);
  return 'outro';
};

// Função de processamento em background com BATCH PROCESSING
async function processDocumentsInBackground(caseId: string, documentIds: string[]) {
  try {
    console.log(`[BACKGROUND] Processando ${documentIds.length} documentos...`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Buscar os documentos
  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .in("id", documentIds);

  if (docsError) throw docsError;
  console.log(`[BATCH] ${documents.length} documentos encontrados no banco`);

  // FASE 1: BATCH PROCESSING - Dividir em lotes de 3 (otimizado para Lovable AI)
  const BATCH_SIZE = 3;
  const batches: any[][] = [];
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    batches.push(documents.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[BATCH] Processando ${documents.length} documentos em ${batches.length} lote(s) de até ${BATCH_SIZE}`);
  
  // Inicializar objeto para acumular dados extraídos
  let allExtractedData: any = {
    ruralPeriods: [],
    urbanPeriods: [],
    familyMembers: [],
    observations: []
  };
  
  let hasAutodeclaracao = false;
  
  // Processar cada batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`[BATCH ${batchIndex + 1}/${batches.length}] Processando ${batch.length} documentos...`);
    
    // Processar documentos do batch
    const processedBatch: any[] = [];
    
    for (const doc of batch) {
      try {
        console.log(`[BATCH] Processando ${doc.file_name} (${doc.mime_type})`);
        const docType = classifyDocument(doc.file_name);
        
        // Salvar classificação no banco
        await supabase
          .from('documents')
          .update({ document_type: docType })
          .eq('id', doc.id);
        console.log(`[BATCH] ✓ Tipo "${docType}" salvo para ${doc.file_name}`);
        
        // Detectar autodeclaração
        if (docType === 'autodeclaracao_rural') {
          hasAutodeclaracao = true;
        }
        
        // Baixar o arquivo do Storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("case-documents")
          .download(doc.file_path);

        if (downloadError) {
          console.error(`[BATCH] ❌ Erro ao baixar ${doc.file_name}:`, downloadError);
          continue;
        }

        const fileSizeKB = (fileData.size / 1024).toFixed(1);
        const fileSizeMB = (fileData.size / 1024 / 1024).toFixed(2);
        console.log(`[BATCH] ✓ Arquivo ${doc.file_name} baixado. Tamanho: ${fileSizeKB} KB (${fileSizeMB} MB)`);

        if (!isFileSizeAcceptable(fileData.size)) {
          console.warn(`[BATCH] ⚠️ Arquivo ${doc.file_name} muito grande (${fileSizeMB} MB). Limite: 4 MB. Pulando...`);
          continue;
        }

        console.log(`[BATCH] Convertendo ${doc.file_name} para base64...`);
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        
        const base64SizeKB = (base64.length / 1024).toFixed(1);
        console.log(`[BATCH] ✓ ${doc.file_name} convertido para base64 (${base64SizeKB} KB encoded)`);
        
        processedBatch.push({
          fileName: doc.file_name,
          docType,
          mimeType: doc.mime_type,
          base64Content: base64,
          originalSize: fileData.size
        });
        
        console.log(`[BATCH] ✅ ${doc.file_name} processado com sucesso`);
      } catch (error) {
        console.error(`[BATCH] ❌ Erro fatal ao processar ${doc.file_name}:`, error);
      }
    }
    
    if (processedBatch.length === 0) {
      console.warn(`[BATCH ${batchIndex + 1}/${batches.length}] Nenhum documento processado neste lote`);
      continue;
    }
    
    console.log(`[BATCH ${batchIndex + 1}/${batches.length}] ✓ ${processedBatch.length} documentos prontos para IA`);
    
    // Chamar IA com este batch (usando Lovable AI com Claude Sonnet 4.5)
    const batchExtractedData = await extractDataFromBatch(processedBatch, openaiApiKey, hasAutodeclaracao, lovableApiKey);
    
    // Mesclar dados extraídos (priorizar não-nulos)
    for (const [key, value] of Object.entries(batchExtractedData)) {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value) && Array.isArray(allExtractedData[key])) {
          // Para arrays, fazer merge
          allExtractedData[key] = [...allExtractedData[key], ...value];
        } else if (!allExtractedData[key]) {
          // Para campos simples, substituir apenas se ainda não tiver valor
          allExtractedData[key] = value;
        }
      }
    }
    
    console.log(`[BATCH ${batchIndex + 1}/${batches.length}] ✅ Dados extraídos e mesclados`);
  }
  
  const extractedData = allExtractedData;
  console.log(`[BATCH] ✅ Todos os ${batches.length} lotes processados. Total de períodos rurais: ${extractedData.ruralPeriods?.length || 0}`);
  
  // FASE 3: Validação pós-extração de períodos rurais
  if (hasAutodeclaracao) {
    console.log('[FASE 3] Verificando extração de períodos rurais...');
    
    if (!extractedData.ruralPeriods || extractedData.ruralPeriods.length === 0) {
      console.warn('[FASE 3] ⚠️ AVISO: Autodeclaração presente mas ruralPeriods vazio!');
      console.warn('[FASE 3] Criando período genérico para garantir preenchimento...');
      
      // Buscar dados do caso para preencher período genérico
      const { data: caseData } = await supabase
        .from('cases')
        .select('rural_activity_since, author_address')
        .eq('id', caseId)
        .single();
      
      extractedData.ruralPeriods = [{
        startDate: caseData?.rural_activity_since || "2000-01-01",
        endDate: "",
        location: extractedData.motherAddress || caseData?.author_address || "Endereço da autodeclaração",
        withWhom: "família",
        activities: "atividade rural em regime de economia familiar"
      }];
      
      console.log('[FASE 3] ✓ Período genérico criado:', extractedData.ruralPeriods[0]);
    } else {
      console.log(`[FASE 3] ✅ ${extractedData.ruralPeriods.length} período(s) rural(is) extraído(s) com sucesso!`);
    }
  }

  // Determinar campos críticos faltantes
  const requiredFields = ["motherName", "motherCpf", "childName", "childBirthDate"];
  const optionalFields = [
    "motherRg", "motherBirthDate", "motherAddress", "motherPhone", "motherWhatsapp", "maritalStatus",
    "fatherName", "childBirthPlace",
    "landOwnerName", "landOwnerCpf", "landOwnerRg", "landOwnershipType",
    "ruralActivitySince", "familyMembers",
    "raProtocol", "raRequestDate", "raDenialDate", "raDenialReason"
  ];

  const missingRequiredFields = requiredFields.filter(field => !extractedData[field]);
  const missingOptionalFields = optionalFields.filter(field => !extractedData[field]);
  
  console.log(`[EXTRAÇÃO] Campos críticos faltando: ${missingRequiredFields.length > 0 ? missingRequiredFields.join(', ') : 'Nenhum ✓'}`);
  console.log(`[EXTRAÇÃO] Campos opcionais faltando: ${missingOptionalFields.length > 0 ? missingOptionalFields.length : 'Nenhum ✓'}`);
  console.log(`[EXTRAÇÃO] Taxa de completude crítica: ${((requiredFields.length - missingRequiredFields.length) / requiredFields.length * 100).toFixed(1)}%`);

  // Salvar extração no banco com periodos_rurais
  console.log("[DB] Salvando extração...");
  const { error: extractionError } = await supabase.from("extractions").insert({
    case_id: caseId,
    document_id: documentIds[0],
    entities: extractedData,
    auto_filled_fields: extractedData,
    missing_fields: missingRequiredFields,
    observations: extractedData.observations || [],
    raw_text: JSON.stringify(documents.map(d => d.file_name)),
    periodos_rurais: extractedData.ruralPeriods || [],
  });

  if (extractionError) {
    console.error("[DB] Erro ao salvar extração:", extractionError);
  }

  // Atualizar caso com informações extraídas
  const updateData: any = {};
    
    // Dados da mãe
    if (extractedData.motherName) updateData.author_name = extractedData.motherName;
    if (extractedData.motherCpf) updateData.author_cpf = extractedData.motherCpf.replace(/\D/g, '');
    if (extractedData.motherRg) updateData.author_rg = extractedData.motherRg;
    if (extractedData.motherBirthDate) updateData.author_birth_date = extractedData.motherBirthDate;
    if (extractedData.motherAddress) updateData.author_address = extractedData.motherAddress;
    if (extractedData.motherPhone) updateData.author_phone = extractedData.motherPhone.replace(/\D/g, '');
    if (extractedData.motherWhatsapp) updateData.author_whatsapp = extractedData.motherWhatsapp.replace(/\D/g, '');
    if (extractedData.maritalStatus) updateData.author_marital_status = extractedData.maritalStatus;
    
    // ============================================================
    // VALIDAÇÃO CRÍTICA: Nome da mãe ≠ Nome da criança
    // ============================================================
    if (extractedData.childName && extractedData.motherName) {
      if (extractedData.childName === extractedData.motherName) {
        console.error('[VALIDAÇÃO CRÍTICA] ❌ ERRO: childName === motherName!');
        console.error(`[VALIDAÇÃO] Nome extraído: "${extractedData.childName}"`);
        console.error('[VALIDAÇÃO] Isso é um erro! A criança e a mãe não podem ter o mesmo nome!');
        console.error('[VALIDAÇÃO] Resetando childName para null - reprocessamento necessário');
        
        // Resetar childName para forçar revisão manual
        extractedData.childName = null;
        
        // Adicionar aviso nas observações
        if (!extractedData.observations) extractedData.observations = [];
        extractedData.observations.push(
          '⚠️ ERRO CRÍTICO: IA confundiu nome da mãe com nome da criança. REVISAR CERTIDÃO DE NASCIMENTO MANUALMENTE!'
        );
      } else {
        console.log('[VALIDAÇÃO] ✅ childName ≠ motherName - OK');
        console.log(`[VALIDAÇÃO] Mãe: "${extractedData.motherName}"`);
        console.log(`[VALIDAÇÃO] Criança: "${extractedData.childName}"`);
      }
    }

    // Validar confiança na extração
    if (extractedData.extractionConfidence?.childNameConfidence === 'low') {
      console.warn('[VALIDAÇÃO] ⚠️ IA com baixa confiança em childName - marcar para revisão');
      if (!extractedData.observations) extractedData.observations = [];
      extractedData.observations.push('⚠️ Nome da criança extraído com baixa confiança - revisar manualmente');
    }
    
    // Dados da criança
    if (extractedData.childName) updateData.child_name = extractedData.childName;
    if (extractedData.childBirthDate) {
      updateData.child_birth_date = extractedData.childBirthDate;
      updateData.event_date = extractedData.childBirthDate; // Data do evento = data nascimento
    }
    if (extractedData.fatherName) updateData.father_name = extractedData.fatherName;
    
    // Proprietário da terra
    if (extractedData.landOwnerName) updateData.land_owner_name = extractedData.landOwnerName;
    if (extractedData.landOwnerCpf) updateData.land_owner_cpf = extractedData.landOwnerCpf.replace(/\D/g, '');
    if (extractedData.landOwnerRg) updateData.land_owner_rg = extractedData.landOwnerRg;
    if (extractedData.landOwnershipType) updateData.land_ownership_type = extractedData.landOwnershipType;
    
    // Dados detalhados da terra
    if (extractedData.landArea) updateData.land_area = extractedData.landArea;
    if (extractedData.landTotalArea) updateData.land_total_area = extractedData.landTotalArea;
    if (extractedData.landExploitedArea) updateData.land_exploited_area = extractedData.landExploitedArea;
    if (extractedData.landITR) updateData.land_itr = extractedData.landITR;
    if (extractedData.landPropertyName) updateData.land_property_name = extractedData.landPropertyName;
    if (extractedData.landMunicipality) updateData.land_municipality = extractedData.landMunicipality;
    if (extractedData.landCessionType) updateData.land_cession_type = extractedData.landCessionType;

    // Atividades rurais detalhadas
    if (extractedData.ruralActivitiesPlanting) updateData.rural_activities_planting = extractedData.ruralActivitiesPlanting;
    if (extractedData.ruralActivitiesBreeding) updateData.rural_activities_breeding = extractedData.ruralActivitiesBreeding;

    // Declaração de Saúde UBS
    if (extractedData.health_declaration_ubs && typeof extractedData.health_declaration_ubs === 'object') {
      updateData.health_declaration_ubs = extractedData.health_declaration_ubs;
      console.log('[UBS] ✅ Declaração de saúde UBS extraída:', extractedData.health_declaration_ubs);
    }

    // Grupo familiar detalhado
    if (extractedData.familyMembersDetailed && extractedData.familyMembersDetailed.length > 0) {
      updateData.family_members = extractedData.familyMembersDetailed;
    }

    // Lógica terra própria vs terceiro (AUTOMÁTICA baseada em CPF)
    if (extractedData.landOwnerCpf && extractedData.motherCpf) {
      const ownerCpfClean = extractedData.landOwnerCpf.replace(/\D/g, '');
      const motherCpfClean = extractedData.motherCpf.replace(/\D/g, '');
      
      if (ownerCpfClean === motherCpfClean) {
        updateData.land_ownership_type = "propria";
        // COPIAR dados da autora para proprietário
        updateData.land_owner_name = extractedData.motherName;
        updateData.land_owner_cpf = extractedData.motherCpf;
        updateData.land_owner_rg = extractedData.motherRg;
        console.log('[TERRA] ✅ TERRA PRÓPRIA - Dados da autora copiados para proprietário');
      } else {
        updateData.land_ownership_type = "terceiro";
        console.log('[TERRA] ✅ TERRA DE TERCEIRO - Dados do proprietário extraídos');
      }
    } else if (extractedData.landOwnershipType === "propria" && extractedData.motherCpf) {
      // Se detectou terra própria mas não tem CPF do proprietário, copiar dados da autora
      updateData.land_owner_name = extractedData.motherName;
      updateData.land_owner_cpf = extractedData.motherCpf;
      updateData.land_owner_rg = extractedData.motherRg;
      console.log('[TERRA] ✅ TERRA PRÓPRIA (detectada) - Dados da autora copiados');
    }
    
    // Atividade rural com períodos estruturados
    if (extractedData.ruralPeriods && Array.isArray(extractedData.ruralPeriods) && extractedData.ruralPeriods.length > 0) {
      // ✅ BUSCAR PERÍODOS EXISTENTES
      const { data: currentCase } = await supabase
        .from('cases')
        .select('rural_periods')
        .eq('id', caseId)
        .single();
      
      const existingPeriods = currentCase?.rural_periods || [];
      
      // ✅ MESCLAR SEM DUPLICAR
      const mergedPeriods = [...existingPeriods];
      
      for (const newPeriod of extractedData.ruralPeriods) {
        const exists = existingPeriods.some((ep: any) => 
          ep.startDate === newPeriod.startDate && 
          ep.endDate === newPeriod.endDate
        );
        
        if (!exists) {
          console.log('[PROCESS-DOCS] ✅ Adicionando novo período:', newPeriod);
          mergedPeriods.push(newPeriod);
        } else {
          console.log('[PROCESS-DOCS] ⚠️ Período já existe, pulando:', newPeriod);
        }
      }
      
      updateData.rural_periods = mergedPeriods;
      
      // Usar a data mais antiga como "rural_activity_since" (apenas se houver períodos)
      if (mergedPeriods.length > 0) {
        const oldestPeriod = mergedPeriods.reduce((oldest: any, current: any) => {
          return new Date(current.startDate) < new Date(oldest.startDate) ? current : oldest;
        });
        updateData.rural_activity_since = oldestPeriod.startDate;
      }
    }
    
    if (extractedData.urbanPeriods) updateData.urban_periods = extractedData.urbanPeriods;
    if (extractedData.familyMembers) updateData.family_members = extractedData.familyMembers;
    
    // Processo administrativo
    if (extractedData.raProtocol) {
      updateData.has_ra = true;
      updateData.ra_protocol = extractedData.raProtocol;
    }
    if (extractedData.raRequestDate) updateData.ra_request_date = extractedData.raRequestDate;
    if (extractedData.raDenialDate) updateData.ra_denial_date = extractedData.raDenialDate;
    if (extractedData.raDenialReason) updateData.ra_denial_reason = extractedData.raDenialReason;
    
    // FASE 4: VALIDAÇÃO INTELIGENTE PÓS-EXTRAÇÃO
    console.log('[VALIDAÇÃO] Iniciando validação inteligente...');
    const validationIssues: string[] = [];
    
    // Verificar reconhecimento do proprietário da terra
    const hasLandDoc = documents.some(d => classifyDocument(d.file_name) === 'documento_terra');
    if (hasLandDoc) {
      if (!updateData.land_ownership_type) {
        validationIssues.push('⚠️ Documento da terra enviado mas tipo de propriedade não identificado');
        console.warn('[VALIDAÇÃO] Tipo de propriedade não detectado');
      }
      if (!updateData.land_owner_name && updateData.land_ownership_type === 'terceiro') {
        validationIssues.push('⚠️ Terra de terceiro mas nome do proprietário não extraído');
        console.warn('[VALIDAÇÃO] Nome do proprietário faltando');
      }
    }
    
    // Verificar RA/Processo Administrativo
    const hasRADoc = documents.some(d => classifyDocument(d.file_name) === 'processo_administrativo');
    if (hasRADoc) {
      updateData.has_ra = true;
      if (!extractedData.raProtocol) {
        validationIssues.push('⚠️ Processo administrativo enviado mas protocolo não extraído');
        console.warn('[VALIDAÇÃO] Protocolo RA não extraído');
      }
      if (!extractedData.raRequestDate) {
        validationIssues.push('⚠️ Data do requerimento não extraída');
        console.warn('[VALIDAÇÃO] Data do requerimento faltando');
      }
      if (!extractedData.raDenialReason) {
        validationIssues.push('⚠️ Motivo do indeferimento não extraído');
        console.warn('[VALIDAÇÃO] Motivo indeferimento faltando');
      }
    }
    
    // Log de validação
    if (validationIssues.length > 0) {
      console.warn('[VALIDAÇÃO] Problemas detectados:', validationIssues);
      if (!extractedData.observations) extractedData.observations = [];
      extractedData.observations.push(...validationIssues);
    } else {
      console.log('[VALIDAÇÃO] ✅ Todos os dados críticos extraídos com sucesso');
    }
    
    if (extractedData.observations && extractedData.observations.length > 0) {
      updateData.special_notes = extractedData.observations.join('; ');
    }

    console.log("[DB] Atualizando caso com dados extraídos...");
    const { error: updateError } = await supabase
      .from("cases")
      .update(updateData)
      .eq("id", caseId);

    if (updateError) {
      console.error("[DB] Erro ao atualizar caso:", updateError);
    } else {
      console.log("[DB] ✓ Caso atualizado com sucesso");
    }

    console.log("[SUCESSO] Processamento concluído com sucesso!");
  } catch (error) {
    console.error("[ERRO FATAL] Erro no processamento em background:", error);
    throw error;
  }
}
