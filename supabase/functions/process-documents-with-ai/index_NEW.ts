// NOVA EDGE FUNCTION - REESCRITA DO ZERO
// Versão simplificada e funcional para extração de dados de documentos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tipos de dados extraídos
interface ExtractedData {
  motherName?: string;
  motherCpf?: string;
  motherRg?: string;
  motherBirthDate?: string;
  childName?: string;
  childBirthDate?: string;
  childCpf?: string;
  observations?: string[];
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[INIT] Iniciando processamento de documentos");
    
    const { caseId, documentIds } = await req.json();
    
    if (!caseId || !documentIds || !Array.isArray(documentIds)) {
      throw new Error("Parâmetros inválidos: caseId e documentIds são obrigatórios");
    }

    console.log(`[INIT] Caso: ${caseId}, Documentos: ${documentIds.length}`);

    // Inicializar Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar documentos
    const { data: documents, error: docsError } = await supabase
      .from("documents")
      .select("*")
      .in("id", documentIds);

    if (docsError) {
      console.error("[ERROR] Erro ao buscar documentos:", docsError);
      throw docsError;
    }

    console.log(`[DOCS] ${documents?.length || 0} documentos encontrados`);

    // Processar cada documento
    const extractedData: ExtractedData = {
      observations: []
    };

    for (const doc of documents || []) {
      try {
        console.log(`[DOC] Processando: ${doc.file_name}`);

        // Baixar arquivo do storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("case-documents")
          .download(doc.file_path);

        if (downloadError) {
          console.error(`[ERROR] Erro ao baixar ${doc.file_name}:`, downloadError);
          continue;
        }

        // Converter para base64
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        console.log(`[DOC] Arquivo convertido para base64, tamanho: ${base64.length} chars`);

        // Chamar OpenAI Vision API
        const visionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analise este documento e extraia as seguintes informações em formato JSON:
{
  "motherName": "nome completo da mãe/segurada",
  "motherCpf": "CPF da mãe (apenas números)",
  "motherRg": "RG da mãe",
  "motherBirthDate": "data de nascimento da mãe (formato DD/MM/AAAA)",
  "childName": "nome completo do filho/bebê",
  "childBirthDate": "data de nascimento do filho (formato DD/MM/AAAA)",
  "childCpf": "CPF do filho se houver",
  "observations": ["observações relevantes"]
}

IMPORTANTE:
- Retorne APENAS o JSON, sem texto adicional
- Se algum campo não for encontrado, use null
- CPF deve conter apenas números
- Datas no formato DD/MM/AAAA`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${doc.mime_type};base64,${base64}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 1000,
          }),
        });

        if (!visionResponse.ok) {
          const errorText = await visionResponse.text();
          console.error(`[ERROR] OpenAI API error: ${errorText}`);
          continue;
        }

        const visionResult = await visionResponse.json();
        const content = visionResult.choices[0]?.message?.content || "{}";

        console.log(`[AI] Resposta da IA: ${content}`);

        // Parse JSON da resposta
        const docData = JSON.parse(content);

        // Mesclar dados extraídos
        if (docData.motherName) extractedData.motherName = docData.motherName;
        if (docData.motherCpf) extractedData.motherCpf = docData.motherCpf;
        if (docData.motherRg) extractedData.motherRg = docData.motherRg;
        if (docData.motherBirthDate) extractedData.motherBirthDate = docData.motherBirthDate;
        if (docData.childName) extractedData.childName = docData.childName;
        if (docData.childBirthDate) extractedData.childBirthDate = docData.childBirthDate;
        if (docData.childCpf) extractedData.childCpf = docData.childCpf;
        if (docData.observations && Array.isArray(docData.observations)) {
          extractedData.observations!.push(...docData.observations);
        }

        console.log(`[DOC] ✓ Dados extraídos de ${doc.file_name}`);

      } catch (error) {
        console.error(`[ERROR] Erro ao processar ${doc.file_name}:`, error);
      }
    }

    console.log("[EXTRACT] Dados finais extraídos:", JSON.stringify(extractedData, null, 2));

    // Salvar extração na tabela extractions
    const { error: insertError } = await supabase
      .from("extractions")
      .insert({
        case_id: caseId,
        document_ids: documentIds,
        entities: extractedData,
        auto_filled_fields: extractedData,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("[ERROR] Erro ao salvar extração:", insertError);
      throw insertError;
    }

    console.log("[SAVE] ✓ Extração salva na tabela extractions");

    // Atualizar tabela cases com dados extraídos
    const updateData: any = {};
    if (extractedData.motherName) updateData.author_name = extractedData.motherName;
    if (extractedData.motherCpf) updateData.author_cpf = extractedData.motherCpf;
    if (extractedData.childName) updateData.child_name = extractedData.childName;
    if (extractedData.childBirthDate) updateData.child_birth_date = extractedData.childBirthDate;

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("cases")
        .update(updateData)
        .eq("id", caseId);

      if (updateError) {
        console.error("[ERROR] Erro ao atualizar caso:", updateError);
      } else {
        console.log("[SAVE] ✓ Caso atualizado com dados extraídos");
      }
    }

    // Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        caseId,
        extractedData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[ERROR] Erro geral:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
