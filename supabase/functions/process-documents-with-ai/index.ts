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

    // Classificar e processar cada documento
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

    const extractedTexts = await Promise.all(
      documents.map(async (doc) => {
        try {
          const docType = classifyDocument(doc.file_name);
          
          // Para simplificação, retornar informações do documento
          // Em produção real, você usaria document--parse_document do Lovable para OCR
          return `
=== DOCUMENTO: ${doc.file_name} ===
Tipo identificado: ${docType}
MIME: ${doc.mime_type}

[Conteúdo do documento seria extraído aqui via OCR]
`;
        } catch (error) {
          console.error(`Erro ao processar ${doc.file_name}:`, error);
          return "";
        }
      })
    );

    const combinedText = extractedTexts.join("\n\n");

    // Chamar Lovable AI para extrair informações estruturadas
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair informações de documentos previdenciários.
Analise CUIDADOSAMENTE cada documento e extraia APENAS informações que você tem CERTEZA.

TIPOS DE DOCUMENTOS:
- Certidão de Nascimento → Nome da criança, data nascimento, nome do pai, nome da mãe
- CPF/RG/Declaração → Nome, CPF, RG, data nascimento, endereço
- Autodeclaração Rural → Desde quando trabalha, quem mora junto, tipo de terra
- Documento da Terra → Nome do proprietário (atenção ao nome do arquivo!)
- Processo INSS → Protocolo NB, datas, motivo indeferimento

IMPORTANTE: Se o nome do arquivo contém "documento da terra + nome", extraia esse nome como proprietário!`,
          },
          {
            role: "user",
            content: `Analise estes documentos e extraia todas as informações possíveis:

${combinedText}

Extraia:
- Dados da Mãe/Autora
- Dados da Criança
- Dados do Proprietário da Terra
- Atividade Rural
- Processo Administrativo

Retorne JSON estruturado com TODOS os campos que encontrar.`,
          },
        ],
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
                  motherName: { type: "string", description: "Nome completo da mãe/autora" },
                  motherCpf: { type: "string", description: "CPF sem formatação" },
                  motherRg: { type: "string", description: "RG" },
                  motherBirthDate: { type: "string", description: "Data de nascimento YYYY-MM-DD" },
                  motherAddress: { type: "string", description: "Endereço completo" },
                  maritalStatus: { type: "string", description: "Estado civil" },
                  
                  // Dados da criança
                  childName: { type: "string", description: "Nome do filho/filha" },
                  childBirthDate: { type: "string", description: "Data nascimento da criança YYYY-MM-DD" },
                  fatherName: { type: "string", description: "Nome do pai" },
                  
                  // Proprietário da terra
                  landOwnerName: { type: "string", description: "Nome do proprietário da terra" },
                  landOwnerCpf: { type: "string", description: "CPF do proprietário" },
                  landOwnerRg: { type: "string", description: "RG do proprietário" },
                  landOwnershipType: { type: "string", description: "Tipo: propria ou terceiro" },
                  
                  // Atividade rural
                  ruralActivitySince: { type: "string", description: "Desde quando trabalha (data ou 'desde nascimento')" },
                  familyMembers: { type: "array", items: { type: "string" }, description: "Quem mora junto" },
                  
                  // Processo administrativo
                  raProtocol: { type: "string", description: "Número do protocolo NB" },
                  raRequestDate: { type: "string", description: "Data do requerimento YYYY-MM-DD" },
                  raDenialDate: { type: "string", description: "Data do indeferimento YYYY-MM-DD" },
                  raDenialReason: { type: "string", description: "Motivo completo do indeferimento" },
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

    const aiResult = await aiResponse.json();
    console.log("Resposta da IA:", JSON.stringify(aiResult, null, 2));

    // Extrair dados do tool call
    let extractedData: Record<string, any> = {};
    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        extractedData = JSON.parse(toolCall.function.arguments);
      }
    } catch (error) {
      console.error("Erro ao parsear resposta da IA:", error);
    }

    // Determinar campos faltantes
    const allFields = ["motherName", "motherCpf", "childName", "childBirthDate"];
    const missingFields = allFields.filter(field => !extractedData[field]);

    // Salvar extração no banco
    await supabase.from("extractions").insert({
      case_id: caseId,
      document_id: documentIds[0],
      entities: extractedData,
      auto_filled_fields: extractedData,
      missing_fields: missingFields,
      raw_text: combinedText.substring(0, 5000),
    });

    // Atualizar caso com informações extraídas
    const updateData: any = {};
    if (extractedData.motherName) updateData.author_name = extractedData.motherName;
    if (extractedData.motherCpf) updateData.author_cpf = extractedData.motherCpf;
    if (extractedData.motherRg) updateData.author_rg = extractedData.motherRg;
    if (extractedData.motherBirthDate) updateData.author_birth_date = extractedData.motherBirthDate;
    if (extractedData.motherAddress) updateData.author_address = extractedData.motherAddress;
    if (extractedData.maritalStatus) updateData.author_marital_status = extractedData.maritalStatus;
    if (extractedData.childName) updateData.child_name = extractedData.childName;
    if (extractedData.childBirthDate) {
      updateData.child_birth_date = extractedData.childBirthDate;
      updateData.event_date = extractedData.childBirthDate;
    }
    if (extractedData.fatherName) updateData.father_name = extractedData.fatherName;
    if (extractedData.landOwnerName) updateData.land_owner_name = extractedData.landOwnerName;
    if (extractedData.landOwnerCpf) updateData.land_owner_cpf = extractedData.landOwnerCpf;
    if (extractedData.landOwnerRg) updateData.land_owner_rg = extractedData.landOwnerRg;
    if (extractedData.landOwnershipType) updateData.land_ownership_type = extractedData.landOwnershipType;
    if (extractedData.ruralActivitySince) updateData.rural_activity_since = extractedData.ruralActivitySince;
    if (extractedData.familyMembers) updateData.family_members = JSON.stringify(extractedData.familyMembers);
    if (extractedData.raProtocol) updateData.ra_protocol = extractedData.raProtocol;
    if (extractedData.raRequestDate) updateData.ra_request_date = extractedData.raRequestDate;
    if (extractedData.raDenialDate) updateData.ra_denial_date = extractedData.raDenialDate;
    if (extractedData.raDenialReason) updateData.ra_denial_reason = extractedData.raDenialReason;

    if (Object.keys(updateData).length > 0) {
      await supabase.from("cases").update(updateData).eq("id", caseId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        extractedData,
        missingFields,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
