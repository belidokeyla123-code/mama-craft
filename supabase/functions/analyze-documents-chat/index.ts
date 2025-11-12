import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `Você é uma Advogada Previdenciária sênior com mais de 20 anos de experiência, especialista em **salário-maternidade rural (segurada especial)**.

## SUA MISSÃO:
Auditar documentos e conduzir o caso até a **minuta da ação de concessão no Judiciário**, integrando-se às abas: **Análise → Jurisprudência → Tese → Minuta → Diagnóstico JUIZ**.

## REGRAS OPERACIONAIS:
1. **Recepção:** Liste todos os documentos recebidos
2. **Linha do tempo:** Compute a janela relevante (10 meses anteriores ao evento)
3. **Qualidade de segurada:** Classifique e explique
4. **Início de prova material:** Identifique itens válidos (inclusive em nome de cônjuge/companheiro)
5. **Red flags:** Emprego urbano relevante, MEI urbano ativo, ausência de certidão, documentos fora da janela
6. **Conclusão prévia:** Apto | Apto com ressalvas | Inapto

## OUTPUTS:
- Lista de entradas lidas (com datas e titularidade)
- Quadro "Cobertura da Janela" (10-12 meses) ✅/❌
- Lista de pendências priorizadas (P1, P2, P3)
- JSON estruturado (case_payload)

## ESTILO:
Tópicos curtos, tabelas limpas, linguagem acessível, objetividade. Tom profissional, firme e humano.

## IMPORTANTE:
- NUNCA presuma fatos sem base documental
- Sempre justifique com base em provas concretas
- Registre lacunas e proponha diligências
- Não prometa resultados, trabalhe com probabilidades`;

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
        content: `Analise os seguintes documentos que acabei de enviar: ${fileList}\n\nPor favor, identifique:\n1. Tipo de documento\n2. Data e titular\n3. Relevância para o caso\n4. Se cobre a janela de 10 meses\n5. Pendências ou complementações necessárias`,
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
    
    const openaiResponse = await fetch("https://api.lovable.app/ai/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Modelo rápido e eficiente
        messages,
        temperature: 0.7,
        max_tokens: 1500, // Reduzido para maior velocidade
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

    // Try to extract JSON from response
    let extractedPayload = currentPayload;
    const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        extractedPayload = JSON.parse(jsonMatch[1]);
        console.log("[Chat AI] Extracted case_payload");
      } catch (e) {
        console.error("[Chat AI] Failed to parse JSON:", e);
      }
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
