import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('[JUDGE-MODULE] ⚖️ Edge function INICIADA');
  
  if (req.method === 'OPTIONS') {
    console.log('[JUDGE-MODULE] OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[JUDGE-MODULE] Parsing request body...');
    const body = await req.json();
    console.log('[JUDGE-MODULE] Request body keys:', Object.keys(body));
    
    const { petition, caseInfo, documents, analysis, jurisprudence, tese } = body;

    // Log detalhado para debug
    console.log('[JUDGE-MODULE] Data validation:', {
      hasPetition: !!petition,
      petitionLength: petition?.length || 0,
      hasCaseInfo: !!caseInfo,
      hasDocuments: !!documents,
      documentsCount: documents?.length || 0,
      hasManualBenefits: !!caseInfo?.manual_benefits,
      manualBenefitsCount: caseInfo?.manual_benefits?.length || 0
    });
    
    // ═══ FASE 6: CRIAR LISTA DETALHADA DE DOCUMENTOS PARA O JUIZ ═══
    const documentosInfo = documents?.map((doc: any, i: number) => 
      `Doc. ${String(i + 1).padStart(2, '0')}: ${doc.file_name} (${doc.document_type})`
    ).join('\n') || 'Nenhum documento anexado';

    // Validação básica
    if (!petition || typeof petition !== 'string' || petition.trim().length === 0) {
      console.error('[JUDGE-MODULE] ❌ Petição inválida');
      throw new Error('Petição não fornecida ou inválida');
    }

    const prompt = `Você é um JUIZ FEDERAL fazendo CONTROLE DE QUALIDADE FINAL.

⚠️ IMPORTANTE: A petição JÁ passou por análise preliminar automática que corrigiu:
✅ Endereçamento e jurisdição
✅ Valor da causa (com salário mínimo correto)
✅ Dados completos (sem placeholders)
✅ Português e sintaxe (concordância, pontuação, coesão)
✅ Documentos citados (numeração e validação)

📁 DADOS DO CASO:
**INFORMAÇÕES BÁSICAS:**
${JSON.stringify(caseInfo, null, 2)}

**DOCUMENTOS (${documents?.length || 0}):**
${documents?.map((doc: any, i: number) => 
  `Doc. ${String(i + 1).padStart(2, '0')}: ${doc.file_name} (${doc.document_type})`
).join('\n') || 'Nenhum documento anexado'}

**ANÁLISE JURÍDICA:**
${analysis ? JSON.stringify(analysis, null, 2) : 'Não realizada'}

**JURISPRUDÊNCIAS:**
${jurisprudence?.results ? JSON.stringify(jurisprudence.results, null, 2) : 'Nenhuma selecionada'}

**TESE JURÍDICA:**
${tese?.teses ? JSON.stringify(tese.teses, null, 2) : 'Não elaborada'}

**PETIÇÃO:**
${petition}

---

⚖️ TAREFA: CONTROLE DE QUALIDADE GERAL

Foque APENAS em:

1. **COERÊNCIA ARGUMENTATIVA**
   - A tese faz sentido lógico?
   - Os argumentos se sustentam mutuamente?
   - Há contradições na narrativa?

2. **FUNDAMENTAÇÃO JURÍDICA**
   - Leis e artigos citados são adequados?
   - Jurisprudências selecionadas fortalecem o caso?
   - Há gaps na fundamentação legal?

3. **FORÇA PERSUASIVA**
   - A petição convence um juiz neutro?
   - Há brechas críticas que o réu pode explorar?
   - Os pedidos estão bem fundamentados?

🚫 NÃO ANALISE (já corrigido):
- Português/sintaxe
- Documentos citados
- Endereçamento/jurisdição
- Dados completos

RETORNE JSON:
{
  "status_geral": "APROVADO" | "REVISAR" | "REFAZER",
  "brechas_criticas": [
    {
      "tipo": "argumentativa" | "juridica",
      "descricao": "Descrição específica e objetiva",
      "gravidade": "alta" | "media",
      "sugestao": "Como corrigir (seja PRÁTICO e DIRETO)"
    }
  ],
  "pontos_fortes": ["Máximo 3 pontos fortes"],
  "pontos_fracos": ["Máximo 3 pontos fracos"],
  "risco_improcedencia": 15,
  "recomendacao_final": "Breve recomendação geral em 1-2 frases"
}

DIRETRIZES:
- Seja RÁPIDO e OBJETIVO (não repita análises já feitas)
- Foque apenas em QUALIDADE ARGUMENTATIVA e JURÍDICA
- NÃO crie brechas sobre português ou documentos
- Se tudo estiver OK, retorne brechas_criticas vazio`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    console.log('[JUDGE-MODULE] 🚀 Iniciando chamada para AI Gateway...');
    console.log('[JUDGE-MODULE] Prompt length:', prompt.length);
    
    // Timeout de 60 segundos para análises complexas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[JUDGE-MODULE] ⏰ TIMEOUT após 60 segundos');
      controller.abort();
    }, 60000);

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      console.log('[JUDGE-MODULE] ✅ Resposta recebida, status:', aiResponse.status);
      clearTimeout(timeoutId);

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ 
            error: 'Rate limit: Muitas requisições. Aguarde e tente novamente.',
            code: 'RATE_LIMIT'
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ 
            error: 'Sem créditos: Adicione créditos em Settings -> Workspace -> Usage.',
            code: 'NO_CREDITS'
          }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errorText = await aiResponse.text();
        console.error('AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      console.log('[JUDGE-MODULE] AI response received, parsing content...');
      
      let analysis;
      try {
        const content = aiData.choices[0].message.content;
        console.log('[JUDGE-MODULE] Content to parse (first 200 chars):', content.substring(0, 200));
        analysis = JSON.parse(content);
        console.log('[JUDGE-MODULE] Analysis parsed successfully:', {
          hasBrechas: !!analysis.brechas,
          brechasCount: analysis.brechas?.length || 0,
          hasPontosFracos: !!analysis.pontos_fracos,
          hasRisco: !!analysis.risco_improcedencia
        });
      } catch (parseError) {
        console.error('[JUDGE-MODULE] JSON parse error:', parseError);
        console.error('[JUDGE-MODULE] Raw content:', aiData.choices[0].message.content);
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        throw new Error(`Failed to parse AI response: ${errorMsg}`);
      }

      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Análise demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('[JUDGE-MODULE] Error:', error);
    console.error('[JUDGE-MODULE] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = {
      error: errorMessage,
      type: error instanceof Error ? error.constructor.name : typeof error,
      timestamp: new Date().toISOString()
    };
    
    console.error('[JUDGE-MODULE] Error details:', errorDetails);
    
    return new Response(JSON.stringify(errorDetails), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
