import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `Você é uma Advogada Previdenciária especialista em salário-maternidade rural.

## MISSÃO:
Analisar documentos e gerar JSON estruturado.

## CHECKLIST RÁPIDO:
1. Listar documentos
2. Janela 10 meses: ✅/❌
3. Qualidade segurada
4. Início prova material
5. Red flags
6. Conclusão: Apto/Ressalvas/Inapto

## OUTPUT OBRIGATÓRIO:
- Texto resumido
- JSON estruturado (case_payload)

## IMPORTANTE: Seja objetiva e rápida.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, files, message, conversationHistory, currentPayload } = await req.json();

    console.log("[Chat AI] Processing request:", { caseId, filesCount: files?.length, hasMessage: !!message });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build conversation context
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
    }

    // Add current message or file analysis request
    if (message) {
      messages.push({
        role: "user",
        content: message,
      });
    } else if (files && files.length > 0) {
      const fileList = files.map((f: any) => f.name).join(", ");
      messages.push({
        role: "user",
        content: `Analise os documentos: ${fileList}\n\n1. Tipo e titular\n2. Cobre janela 10 meses?\n3. Red flags\n4. Conclusão`,
      });
    }

    // Add instruction to generate case_payload if we have enough information
    if (files && files.length > 0) {
      messages.push({
        role: "system",
        content: `Ao final da sua análise, SEMPRE gere um JSON estruturado (case_payload) com o formato:
{
  "identificacao": { "nome": "", "cpf": "", "estado_civil": "", "endereco": "", "contatos": "" },
  "evento_gerador": { "tipo": "nascimento|adocao|guarda", "data": "AAAA-MM-DD", "comprovante": [], "local": "" },
  "categoria_segurada": "especial|empregada|avulsa|domestica|CI|MEI|facultativa",
  "janela_carencia_ou_atividade": { "inicio": "AAAA-MM-DD", "fim": "AAAA-MM-DD", "criterio": "" },
  "provas": { "inicio_prova_material": [], "testemunhas_sugeridas": [], "observacoes": "" },
  "coerencia_temporal": { "conflitos_urbanos": false, "descricao": "" },
  "riscos": [],
  "pendencias": [],
  "rmi_resumo": { "regra": "especial_minimo", "observacoes": "" },
  "conclusao_previa": "Apto|Apto_com_ressalvas|Inapto",
  "auditoria": { "versao": "v1", "responsavel_ia": "Chat Inteligente SMR", "timestamp": "${new Date().toISOString()}" }
}

Preencha com as informações disponíveis. Use "" ou [] para campos ainda não identificados.`,
      });
    }

    // ⚡ OTIMIZAÇÃO: Usar Lovable AI (mais rápido e sem custo extra)
    console.log("[Chat AI] Calling Lovable AI...");
    const startTime = Date.now();
    
    const openaiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.7,
        max_tokens: 800, // ⚡ OTIMIZADO: Reduzido para máxima velocidade
      }),
    });

    const elapsedTime = Date.now() - startTime;
    console.log(`[Chat AI] AI responded in ${elapsedTime}ms`);

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error("[Chat AI] OpenAI error:", error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const openaiData = await openaiResponse.json();
    const aiResponse = openaiData.choices[0].message.content;

    console.log("[Chat AI] AI Response length:", aiResponse.length);

    // Try to extract JSON from response (múltiplos padrões)
    let extractedPayload = currentPayload;
    
    // Padrão 1: ```json ... ```
    let jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
    
    // Padrão 2: ``` ... ``` (sem "json")
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/```\s*([\s\S]*?)\s*```/);
    }
    
    // Padrão 3: Procurar por { ... } diretamente
    if (!jsonMatch) {
      const jsonStart = aiResponse.indexOf('{');
      const jsonEnd = aiResponse.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonMatch = [null, aiResponse.substring(jsonStart, jsonEnd + 1)];
      }
    }
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        extractedPayload = JSON.parse(jsonMatch[1]);
        console.log("[Chat AI] ✅ Extracted case_payload");
      } catch (e) {
        console.error("[Chat AI] ❌ Failed to parse JSON:", e);
        console.error("[Chat AI] JSON string:", jsonMatch[1].substring(0, 200));
      }
    } else {
      console.warn("[Chat AI] ⚠️ No JSON found in response");
    }

    // Save to database
    if (extractedPayload) {
      const { error: updateError } = await supabase
        .from("cases")
        .update({
          chat_analysis: extractedPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);

      if (updateError) {
        console.error("[Chat AI] Error updating case:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        response: aiResponse,
        analysis: files ? aiResponse : undefined,
        casePayload: extractedPayload,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Chat AI] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
