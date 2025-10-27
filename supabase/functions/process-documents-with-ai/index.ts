import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Process base64 in chunks to prevent memory issues with large files
function processBase64Chunks(arrayBuffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(arrayBuffer);
  const CHUNK_SIZE = 8192; // 8KB chunks to be safe
  let base64 = '';
  
  for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, uint8Array.length);
    const chunk = uint8Array.slice(i, end);
    const chunkArray = Array.from(chunk);
    base64 += btoa(String.fromCharCode.apply(null, chunkArray as any));
  }
  
  return base64;
}

// Check if file is too large (limit to 5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar os documentos
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .in("id", documentIds);

    if (docsError) throw docsError;
    console.log(`[OCR] ${documents.length} documentos encontrados no banco`);

    // Classificar documento por nome
    const classifyDocument = (fileName: string) => {
      const name = fileName.toLowerCase();
      
      if (name.includes('certidao') && name.includes('nascimento')) return 'certidao_nascimento';
      if (name.includes('cpf') || name.includes('rg')) return 'identificacao';
      if (name.includes('residencia') || name.includes('endereco')) return 'comprovante_residencia';
      if (name.includes('autodeclaracao') || name.includes('rural')) return 'autodeclaracao_rural';
      if (name.includes('terra') || name.includes('propriedade')) return 'documento_terra';
      if (name.includes('processo') || name.includes('inss') || name.includes('nb') || name.includes('indeferimento')) return 'processo_administrativo';
      
      return 'outro';
    };

    // Processar cada documento com OCR REAL
    const extractedTexts = await Promise.all(
      documents.map(async (doc) => {
        try {
          console.log(`[OCR] Processando ${doc.file_name} (${doc.mime_type})`);
          const docType = classifyDocument(doc.file_name);
          
          // Baixar o arquivo do Storage
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("case-documents")
            .download(doc.file_path);

          if (downloadError) {
            console.error(`[OCR] Erro ao baixar ${doc.file_name}:`, downloadError);
            return null;
          }

          console.log(`[OCR] Arquivo ${doc.file_name} baixado. Tamanho: ${fileData.size} bytes`);

          // Check file size before processing
          if (!isFileSizeAcceptable(fileData.size)) {
            console.warn(`[OCR] Arquivo ${doc.file_name} muito grande (${fileData.size} bytes). Limite: ${MAX_FILE_SIZE} bytes. Pulando...`);
            return null;
          }

          // Converter para base64 usando chunks para evitar stack overflow
          const arrayBuffer = await fileData.arrayBuffer();
          const base64 = processBase64Chunks(arrayBuffer);
          
          console.log(`[OCR] ${doc.file_name} convertido para base64 (${base64.length} chars)`);
          
          return {
            fileName: doc.file_name,
            docType,
            mimeType: doc.mime_type,
            base64Content: base64
          };
        } catch (error) {
          console.error(`[OCR] Erro ao processar ${doc.file_name}:`, error);
          return null;
        }
      })
    );

    const validDocs = extractedTexts.filter(d => d !== null);
    console.log(`[OCR] ${validDocs.length} documentos processados com sucesso`);

    if (validDocs.length === 0) {
      throw new Error("Nenhum documento pôde ser processado");
    }

    // Chamar OpenAI GPT-4o com visão para extrair informações dos documentos
    console.log("[IA] Chamando OpenAI GPT-4o com visão para extrair dados...");
    console.log(`[IA] Total de imagens: ${validDocs.length}`);
    
    const systemPrompt = `Você é um assistente especializado em extrair informações de documentos previdenciários brasileiros com OCR avançado.

TIPOS DE DOCUMENTOS E O QUE EXTRAIR:

**Certidão de Nascimento:**
- Nome COMPLETO da criança
- Data de nascimento DD/MM/AAAA
- Local de nascimento (cidade e UF)
- Nome COMPLETO do pai
- Nome COMPLETO da mãe
- Data de nascimento da mãe (se constar na seção DADOS DA MÃE)

**CPF/RG/CNH:**
- Nome completo exatamente como aparece
- CPF (apenas números, sem pontos ou traços)
- RG (com órgão expedidor)
- Data de nascimento DD/MM/AAAA
- Filiação (nome da mãe e do pai)

**Comprovante de Residência:**
- Endereço COMPLETO (rua + número + complemento + bairro + cidade + UF + CEP)
- Nome do titular

**Autodeclaração Rural:**
- Desde quando trabalha na atividade rural (data ou "desde nascimento")
- Membros da família que moram junto
- Tipo de trabalho (lavoura, criação, etc)
- Se menciona ser proprietária ou trabalhar em terra de terceiro

**Documento da Terra:**
- Nome do proprietário
- CPF/RG do proprietário
- Tipo de propriedade

**Processo INSS:**
- Número COMPLETO do protocolo/NB
- Data do requerimento DD/MM/AAAA
- Data do indeferimento DD/MM/AAAA
- Motivo COMPLETO do indeferimento (copiar PALAVRA POR PALAVRA)

REGRAS CRÍTICAS:
1. Leia TODOS os textos, incluindo manuscritos e carimbos
2. Se um campo não estiver visível, deixe vazio (não invente)
3. Datas sempre em formato DD/MM/AAAA
4. CPF sempre apenas números
5. Copie nomes EXATAMENTE como aparecem
6. Se o nome do arquivo menciona "documento de NOME", esse NOME é o proprietário da terra
7. Motivo do indeferimento deve ser copiado LITERALMENTE do documento`;
    
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];

    // Adicionar cada documento como mensagem com imagem
    for (const doc of validDocs) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Documento: ${doc.fileName}\nTipo classificado: ${doc.docType}\n\nExtraia TODAS as informações visíveis neste documento com máxima precisão:`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${doc.mimeType};base64,${doc.base64Content}`
            }
          }
        ]
      });
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 4000,
        temperature: 0.1,
        functions: [
          {
            name: "extract_case_info",
            description: "Extrai informações estruturadas de documentos previdenciários brasileiros",
            parameters: {
                type: "object",
                properties: {
                  // Dados da mãe/autora
                  motherName: { 
                    type: "string", 
                    description: "Nome COMPLETO da mãe/autora exatamente como aparece no documento (certidão ou RG)" 
                  },
                  motherCpf: { 
                    type: "string", 
                    description: "CPF da mãe sem formatação (apenas 11 números)" 
                  },
                  motherRg: { 
                    type: "string", 
                    description: "RG da mãe com órgão expedidor se possível" 
                  },
                  motherBirthDate: { 
                    type: "string", 
                    description: "Data nascimento da mãe formato YYYY-MM-DD (converter de DD/MM/AAAA se encontrado)" 
                  },
                  motherAddress: { 
                    type: "string", 
                    description: "Endereço COMPLETO da mãe: rua + número + bairro + cidade + UF + CEP" 
                  },
                  motherPhone: {
                    type: "string",
                    description: "Telefone ou celular da mãe (apenas números)"
                  },
                  motherWhatsapp: {
                    type: "string",
                    description: "WhatsApp da mãe (apenas números, pode ser igual ao telefone)"
                  },
                  maritalStatus: { 
                    type: "string", 
                    description: "Estado civil: solteira, casada, divorciada, viúva ou união estável" 
                  },
                  
                  // Dados da criança
                  childName: { 
                    type: "string", 
                    description: "Nome COMPLETO da criança exatamente como aparece na certidão de nascimento" 
                  },
                  childBirthDate: { 
                    type: "string", 
                    description: "Data nascimento criança YYYY-MM-DD (converter de DD/MM/AAAA) - ESTE É O EVENT_DATE" 
                  },
                  childBirthPlace: { 
                    type: "string", 
                    description: "Local de nascimento da criança (cidade e UF)" 
                  },
                  fatherName: { 
                    type: "string", 
                    description: "Nome COMPLETO do pai da criança conforme certidão" 
                  },
                  
                  // Proprietário da terra (se não for a autora)
                  landOwnerName: { 
                    type: "string", 
                    description: "Nome do proprietário da terra (do documento OU extraído do nome do arquivo se mencionar 'documento de NOME')" 
                  },
                  landOwnerCpf: { 
                    type: "string", 
                    description: "CPF do proprietário apenas números" 
                  },
                  landOwnerRg: { 
                    type: "string", 
                    description: "RG do proprietário da terra" 
                  },
                  landOwnershipType: { 
                    type: "string", 
                    description: "Tipo de relação com a terra: 'proprietaria' (se ela é dona), 'parceria', 'arrendamento', 'meeiro', 'comodato', 'posseiro', 'terceiro' (genérico)" 
                  },
                  
                  // Atividade rural
                  ruralActivitySince: { 
                    type: "string", 
                    description: "Desde quando trabalha na atividade rural. Formato YYYY-MM-DD ou texto como 'desde nascimento'. Se só tiver ano, usar 01/01/ANO" 
                  },
                  familyMembers: { 
                    type: "array", 
                    items: { 
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Nome do membro da família" },
                        relationship: { type: "string", description: "Relação: esposo, filho(a), pai, mãe, irmão(ã), etc" }
                      }
                    },
                    description: "Lista de membros da família que moram junto e trabalham na lavoura" 
                  },
                  
                  // Processo administrativo
                  raProtocol: { 
                    type: "string", 
                    description: "Número COMPLETO do protocolo/NB do processo administrativo no INSS" 
                  },
                  raRequestDate: { 
                    type: "string", 
                    description: "Data do requerimento administrativo YYYY-MM-DD (converter de DD/MM/AAAA)" 
                  },
                  raDenialDate: { 
                    type: "string", 
                    description: "Data do indeferimento YYYY-MM-DD (converter de DD/MM/AAAA)" 
                  },
                  raDenialReason: { 
                    type: "string", 
                    description: "Motivo COMPLETO do indeferimento COPIADO PALAVRA POR PALAVRA do documento oficial. Incluir TODOS os detalhes" 
                  },
                  
                  // Observações
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de observações importantes ou inconsistências encontradas entre documentos"
                  }
                },
                required: [],
              },
          },
        ],
        function_call: { name: "extract_case_info" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[IA] Erro na resposta da API OpenAI:", aiResponse.status);
      console.error("[IA] Detalhes do erro:", errorText);
      
      let errorMessage = `Erro na API OpenAI: ${aiResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Se não for JSON, usar a mensagem padrão
      }
      
      throw new Error(errorMessage);
    }

    const aiResult = await aiResponse.json();
    console.log("[IA] Resposta recebida com sucesso");

    // Extrair dados do function call (OpenAI usa function_call ao invés de tool_calls)
    let extractedData: Record<string, any> = {};
    try {
      const functionCall = aiResult.choices?.[0]?.message?.function_call;
      if (!functionCall || functionCall.name !== 'extract_case_info') {
        console.error("[IA] Resposta não contém function call esperado");
        console.error("[IA] Resposta completa:", JSON.stringify(aiResult.choices[0]?.message, null, 2));
        throw new Error('A IA não retornou os dados no formato esperado');
      }
      
      const args = functionCall.arguments;
      console.log("[IA] Arguments raw:", args);
      extractedData = JSON.parse(args);
      console.log("[IA] Dados extraídos:", JSON.stringify(extractedData, null, 2));
    } catch (error) {
      console.error("[IA] Erro ao parsear resposta:", error);
      throw new Error('Falha ao interpretar resposta da IA');
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

    // Salvar extração no banco
    console.log("[DB] Salvando extração...");
    const { error: extractionError } = await supabase.from("extractions").insert({
      case_id: caseId,
      document_id: documentIds[0],
      entities: extractedData,
      auto_filled_fields: extractedData,
      missing_fields: missingRequiredFields,
      observations: extractedData.observations || [],
      raw_text: JSON.stringify(validDocs.map(d => d.fileName)),
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
    
    // Atividade rural
    if (extractedData.ruralActivitySince) {
      // Se for texto como "desde nascimento", tentar converter
      if (extractedData.ruralActivitySince.toLowerCase().includes('nascimento') && extractedData.motherBirthDate) {
        updateData.rural_activity_since = extractedData.motherBirthDate;
      } else {
        updateData.rural_activity_since = extractedData.ruralActivitySince;
      }
    }
    if (extractedData.familyMembers && Array.isArray(extractedData.familyMembers)) {
      updateData.family_members = JSON.stringify(extractedData.familyMembers);
    }
    
    // Processo administrativo
    if (extractedData.raProtocol) {
      updateData.ra_protocol = extractedData.raProtocol;
      updateData.has_ra = true;
    }
    if (extractedData.raRequestDate) updateData.ra_request_date = extractedData.raRequestDate;
    if (extractedData.raDenialDate) updateData.ra_denial_date = extractedData.raDenialDate;
    if (extractedData.raDenialReason) updateData.ra_denial_reason = extractedData.raDenialReason;

    console.log(`[DB] Atualizando caso ${caseId} com ${Object.keys(updateData).length} campos`);
    console.log("[DB] Campos a atualizar:", Object.keys(updateData).join(", "));

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("cases")
        .update(updateData)
        .eq("id", caseId);
      
      if (updateError) {
        console.error("[DB] Erro ao atualizar caso:", updateError);
        throw updateError;
      }
      console.log("[DB] Caso atualizado com sucesso ✓");
    } else {
      console.warn("[DB] Nenhum campo para atualizar");
    }

    console.log("[SUCESSO] Processamento concluído com sucesso ✓");
    return new Response(
      JSON.stringify({
        success: true,
        extractedData,
        missingFields: missingRequiredFields,
        documentsProcessed: validDocs.length,
        completenessRate: ((requiredFields.length - missingRequiredFields.length) / requiredFields.length * 100).toFixed(1) + '%'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[ERRO] Falha no processamento:", error);
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
