import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, documentIds } = await req.json();
    console.log(`[OCR] Iniciando processamento para caso ${caseId} com ${documentIds.length} documentos`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

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
      if (name.includes('processo') || name.includes('inss') || name.includes('nb')) return 'processo_administrativo';
      
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
            throw downloadError;
          }

          console.log(`[OCR] Arquivo ${doc.file_name} baixado. Tamanho: ${fileData.size} bytes`);

          // Converter para base64 para enviar à IA (visão)
          const arrayBuffer = await fileData.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          
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

    // Chamar Lovable AI com visão para extrair informações dos documentos
    console.log("[IA] Chamando Gemini 2.5 Flash com visão para extrair dados...");
    
    const messages: any[] = [
      {
        role: "system",
        content: `Você é um assistente especializado em extrair informações de documentos previdenciários brasileiros.
Analise CUIDADOSAMENTE cada imagem de documento e extraia TODAS as informações visíveis.

TIPOS DE DOCUMENTOS:
- Certidão de Nascimento → Nome completo da criança, data nascimento DD/MM/AAAA, nome completo do pai, nome completo da mãe, local de nascimento
- CPF/RG/CNH → Nome completo, CPF (apenas números), RG, data nascimento DD/MM/AAAA, filiação
- Comprovante de Residência → Endereço COMPLETO (rua, número, bairro, cidade, UF, CEP), nome do titular
- Autodeclaração Rural → Desde quando trabalha (data ou "desde nascimento"), membros da família, tipo de terra
- Documento da Terra → Nome do proprietário, tipo de propriedade
- Processo INSS → Número NB completo, data requerimento, data indeferimento, motivo COMPLETO do indeferimento

REGRAS IMPORTANTES:
1. Extraia TODOS os dados visíveis no documento
2. Use formato DD/MM/AAAA para datas
3. CPF apenas números (sem pontos ou traços)
4. Se o nome do arquivo menciona "documento da terra + nome", esse é o proprietário
5. Copie o motivo do indeferimento PALAVRA POR PALAVRA
6. Se não conseguir ler algo, deixe vazio (não invente)`,
      }
    ];

    // Adicionar cada documento como mensagem com imagem
    for (const doc of validDocs) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Documento: ${doc.fileName}\nTipo: ${doc.docType}\n\nExtraia TODAS as informações deste documento:`
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

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "extract_case_info",
              description: "Extrai informações estruturadas de documentos previdenciários",
              parameters: {
                type: "object",
                  properties: {
                    // Dados da mãe/autora
                    motherName: { type: "string", description: "Nome COMPLETO da mãe/autora exatamente como aparece no documento" },
                    motherCpf: { type: "string", description: "CPF sem formatação (apenas 11 números)" },
                    motherRg: { type: "string", description: "RG da mãe" },
                    motherBirthDate: { type: "string", description: "Data nascimento da mãe formato YYYY-MM-DD (converter de DD/MM/AAAA)" },
                    motherAddress: { type: "string", description: "Endereço COMPLETO com rua, número, bairro, cidade, UF e CEP" },
                    maritalStatus: { type: "string", description: "Estado civil (solteira, casada, divorciada, viúva, união estável)" },
                    
                    // Dados da criança
                    childName: { type: "string", description: "Nome COMPLETO do filho/filha" },
                    childBirthDate: { type: "string", description: "Data nascimento criança YYYY-MM-DD (esta é a DATA DO EVENTO)" },
                    childBirthPlace: { type: "string", description: "Local de nascimento (cidade e UF)" },
                    fatherName: { type: "string", description: "Nome COMPLETO do pai da criança" },
                    
                    // Proprietário da terra
                    landOwnerName: { type: "string", description: "Nome do proprietário (do documento OU do nome do arquivo se mencionar)" },
                    landOwnerCpf: { type: "string", description: "CPF do proprietário apenas números" },
                    landOwnerRg: { type: "string", description: "RG do proprietário" },
                    landOwnershipType: { type: "string", enum: ["propria", "terceiro"], description: "propria ou terceiro" },
                    
                    // Atividade rural
                    ruralActivitySince: { type: "string", description: "Desde quando trabalha rural (YYYY-MM-DD ou 'desde nascimento')" },
                    familyMembers: { type: "array", items: { type: "string" }, description: "Lista de quem mora junto com a autora" },
                    
                    // Processo administrativo
                    raProtocol: { type: "string", description: "Número COMPLETO do protocolo/NB do INSS" },
                    raRequestDate: { type: "string", description: "Data do requerimento YYYY-MM-DD" },
                    raDenialDate: { type: "string", description: "Data do indeferimento YYYY-MM-DD" },
                    raDenialReason: { type: "string", description: "Motivo COMPLETO do indeferimento COPIADO EXATAMENTE do documento" },
                  },
                required: [],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_case_info" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Erro na API Lovable AI:", errorText);
      throw new Error(`Erro na API: ${aiResponse.status}`);
    }

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[IA] Erro na API:", aiResponse.status, errorText);
      throw new Error(`Erro na API Lovable AI: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    console.log("[IA] Resposta recebida:", JSON.stringify(aiResult, null, 2));

    // Extrair dados do tool call
    let extractedData: Record<string, any> = {};
    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const args = toolCall.function.arguments;
        console.log("[IA] Arguments raw:", args);
        extractedData = JSON.parse(args);
        console.log("[IA] Dados extraídos:", JSON.stringify(extractedData, null, 2));
      } else {
        console.warn("[IA] Nenhum tool call encontrado na resposta");
      }
    } catch (error) {
      console.error("[IA] Erro ao parsear resposta:", error);
    }

    // Determinar campos faltantes (campos críticos)
    const allFields = ["motherName", "motherCpf", "childName", "childBirthDate"];
    const missingFields = allFields.filter(field => !extractedData[field]);
    console.log(`[IA] Campos faltantes: ${missingFields.length > 0 ? missingFields.join(", ") : "nenhum"}`);

    // Salvar extração no banco
    console.log("[DB] Salvando extração...");
    const { error: extractionError } = await supabase.from("extractions").insert({
      case_id: caseId,
      document_id: documentIds[0],
      entities: extractedData,
      auto_filled_fields: extractedData,
      missing_fields: missingFields,
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
    if (extractedData.ruralActivitySince) updateData.rural_activity_since = extractedData.ruralActivitySince;
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
      console.log("[DB] Caso atualizado com sucesso");
    } else {
      console.warn("[DB] Nenhum campo para atualizar");
    }

    console.log("[SUCESSO] Processamento concluído");
    return new Response(
      JSON.stringify({
        success: true,
        extractedData,
        missingFields,
        documentsProcessed: validDocs.length,
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
