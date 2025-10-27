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

    // Processar cada documento
    const extractedTexts = await Promise.all(
      documents.map(async (doc) => {
        try {
          // Download do arquivo
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("case-documents")
            .download(doc.file_path);

          if (downloadError) {
            console.error(`Erro ao baixar ${doc.file_name}:`, downloadError);
            return "";
          }

          // Para simplificar, vamos apenas retornar o nome do arquivo
          // Em produção, aqui você usaria OCR/PDF parsing
          return `Documento: ${doc.file_name}\nTipo: ${doc.mime_type}`;
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
Extraia APENAS informações que você conseguir identificar com certeza nos documentos.
Retorne um JSON com os campos encontrados.`,
          },
          {
            role: "user",
            content: `Analise estes documentos e extraia as seguintes informações, se disponíveis:
- name: Nome completo da pessoa
- cpf: CPF (apenas números)
- birthDate: Data de nascimento (formato YYYY-MM-DD)
- childBirthDate: Data de nascimento do filho/a (formato YYYY-MM-DD)
- maritalStatus: Estado civil
- address: Endereço completo
- phone: Telefone
- whatsapp: WhatsApp

Documentos:\n${combinedText}

Retorne APENAS um JSON válido com os campos que você encontrou. 
Se não encontrar um campo, não o inclua no JSON.
Exemplo: {"name": "Maria Silva", "cpf": "12345678900"}`,
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
                  name: { type: "string", description: "Nome completo" },
                  cpf: { type: "string", description: "CPF sem formatação" },
                  birthDate: { type: "string", description: "Data de nascimento YYYY-MM-DD" },
                  childBirthDate: { type: "string", description: "Data nascimento do filho YYYY-MM-DD" },
                  maritalStatus: { type: "string", description: "Estado civil" },
                  address: { type: "string", description: "Endereço completo" },
                  phone: { type: "string", description: "Telefone" },
                  whatsapp: { type: "string", description: "WhatsApp" },
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
    const allFields = ["name", "cpf", "birthDate", "maritalStatus"];
    const missingFields = allFields.filter(field => !extractedData[field]);

    // Salvar extração no banco
    await supabase.from("extractions").insert({
      case_id: caseId,
      document_id: documentIds[0],
      entities: extractedData,
      auto_filled_fields: extractedData,
      missing_fields: missingFields,
      raw_text: combinedText.substring(0, 5000), // Limitar tamanho
    });

    // Atualizar caso com informações extraídas
    const updateData: any = {};
    if (extractedData.name) updateData.author_name = extractedData.name;
    if (extractedData.cpf) updateData.author_cpf = extractedData.cpf;
    if (extractedData.birthDate) updateData.author_birth_date = extractedData.birthDate;
    if (extractedData.maritalStatus) updateData.author_marital_status = extractedData.maritalStatus;
    if (extractedData.childBirthDate) updateData.event_date = extractedData.childBirthDate;

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
