import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `Você é uma Advogada Previdenciária especialista em salário-maternidade rural.

## MISSÃO CRÍTICA:
Analisar TODOS os documentos enviados e extrair FIELMENTE as informações contidas neles.

## REGRAS INEGOCIÁVEIS:
1. **VOCÊ DEVE LER E ANALISAR CADA DOCUMENTO**
2. **EXTRAIA DATAS EXATAS** conforme aparecem nos documentos
3. **SEJA FIEL AO CONTEÚDO** - não invente ou presuma informações
4. **LISTE CADA DOCUMENTO ANALISADO** com seu tipo e conteúdo principal

## EXTRAÇÃO OBRIGATÓRIA DE DATAS:
Para CADA documento, identifique:
- **Autodeclaração**: Data de início da atividade rural (ex: "desde 2018" = "2018-01-01")
- **Histórico Escolar**: Ano de início e fim (ex: "2015-2020" = períodos escolares)
- **Documentos de Terra** (ITR, Escritura, CCIR): Ano do documento
- **Declarações** (Sindicato, UBS): Data da declaração
- **CNIS**: Períodos urbanos e rurais identificados
- **Certidões**: Datas de nascimento, casamento, etc.

## ANÁLISE PROSPECTIVA:
Ao analisar períodos, você DEVE:
1. **Contar EXATAMENTE os períodos documentados**
2. **Informar SE os documentos cobrem a janela de 10 meses antes do parto**
3. **NÃO presumir períodos não documentados**
4. Exemplo correto: "Autodeclaração desde 2018 (AUT_1.PDF) + histórico escolar 2015-2020 (HIS_1.PDF) = documentação robusta"

## OUTPUT OBRIGATÓRIO:
1. **Texto detalhado** listando cada documento analisado
2. **JSON estruturado** com periodos_estruturados preenchidos
3. **Análise de suficiência** baseada nos documentos REAIS enviados

## IMPORTANTE: 
- Se um documento não foi analisado, INFORME claramente
- Seja FIEL aos documentos - não "complete" informações faltantes
- Extraia TODAS as datas mencionadas`;

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
  "periodos_estruturados": {
    "periodos_rurais": [
      {
        "inicio": "AAAA-MM-DD",
        "fim": "AAAA-MM-DD", 
        "atividade": "Descrição da atividade",
        "fonte_documento": "Nome do documento (ex: AUT_1.PDF)"
      }
    ],
    "historico_escolar": [
      {
        "inicio": "AAAA-MM-DD",
        "fim": "AAAA-MM-DD",
        "escola": "Nome da escola",
        "localizacao": "Rural/Urbano",
        "fonte_documento": "HIS_1.PDF"
      }
    ],
    "documentos_terra": [
      {
        "data": "AAAA-MM-DD",
        "tipo": "ITR|Escritura|CCIR|Contrato",
        "observacao": "Descrição",
        "fonte_documento": "Nome do arquivo"
      }
    ],
    "declaracoes": [
      {
        "data": "AAAA-MM-DD",
        "tipo": "Sindicato|UBS|Outro",
        "conteudo": "Resumo da declaração",
        "fonte_documento": "Nome do arquivo"
      }
    ]
  },
  "auditoria": { "versao": "v2", "responsavel_ia": "Chat Inteligente SMR", "timestamp": "${new Date().toISOString()}" }
}

⚠️ REGRAS CRÍTICAS PARA EXTRAÇÃO DE DATAS:
1. SEMPRE busque datas explícitas nos documentos (ano, mês, dia)
2. Se documento menciona "desde 2018" → use "2018-01-01" como início
3. Para histórico escolar: extraia ano de início e fim (ex: "2015" → "2015-02-01" a "2015-12-15")
4. Para documentos da terra: use ano mencionado (ex: ITR 2020 → "2020-01-01")
5. Se não houver data exata, use 01 de janeiro do ano mencionado
6. SEMPRE preencha "fonte_documento" com o nome do arquivo PDF analisado

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
      // Extrair períodos estruturados
      const periodos = extractedPayload.periodos_estruturados || {};
      const ruralPeriods = periodos.periodos_rurais || [];
      const schoolHistory = periodos.historico_escolar || [];
      const ruralActivitySince = ruralPeriods.length > 0 ? ruralPeriods[0].inicio : null;

      console.log("[Chat AI] 📅 Períodos extraídos:", {
        rural: ruralPeriods.length,
        escola: schoolHistory.length,
        inicio_atividade: ruralActivitySince
      });

      // Preparar dados para atualizar
      const updatePayload: any = {
        chat_analysis: extractedPayload,
        rural_periods: ruralPeriods,
        school_history: schoolHistory,
        rural_activity_since: ruralActivitySince,
        updated_at: new Date().toISOString(),
      };

      // Adicionar dados de identificação se disponíveis
      if (extractedPayload.identificacao?.nome) {
        updatePayload.author_name = extractedPayload.identificacao.nome;
      }
      if (extractedPayload.identificacao?.cpf) {
        updatePayload.author_cpf = extractedPayload.identificacao.cpf;
      }
      if (extractedPayload.crianca?.nome) {
        updatePayload.child_name = extractedPayload.crianca.nome;
      }
      if (extractedPayload.crianca?.data_nascimento) {
        updatePayload.child_birth_date = extractedPayload.crianca.data_nascimento;
      }

      const { error: updateError } = await supabase
        .from("cases")
        .update(updatePayload)
        .eq("id", caseId);

      if (updateError) {
        console.error("[Chat AI] Error updating case:", updateError);
      } else {
        console.log("[Chat AI] ✅ Períodos salvos em cases table");
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
