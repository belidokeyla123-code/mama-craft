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

⚠️ IMPORTANTE: A petição JÁ passou por análise preliminar que corrigiu:
✅ Endereçamento, jurisdição, valor da causa
✅ Dados completos, português, sintaxe
✅ Documentos validados e citados corretamente

📁 DADOS DO CASO:
${JSON.stringify(caseInfo, null, 2)}

**PETIÇÃO:**
${petition}

---

⚖️ TAREFA: ANÁLISE CRÍTICA DE MÉRITO

Foque EXCLUSIVAMENTE em:

1. **TESE JURÍDICA**
   - A tese é sólida e bem fundamentada?
   - Há precedentes suficientes para sustentá-la?
   - A argumentação está alinhada com a jurisprudência atual?

2. **PODER DE CONVENCIMENTO**
   - A petição convence um juiz neutro?
   - A narrativa dos fatos é clara e persuasiva?
   - Os argumentos estão bem encadeados?

3. **RISCO DE IMPROCEDÊNCIA**
   - Quais as chances de procedência total? (0-100%)
   - Existem brechas críticas que o réu pode explorar?
   - Há contradições ou fragilidades argumentativas?

4. **FUNDAMENTO LEGAL**
   - As leis citadas são apropriadas?
   - Faltam normas importantes?
   - Os artigos estão atualizados?

🚫 NÃO ANALISE (já verificado):
- Português/sintaxe/gramática
- Documentos citados
- Endereçamento/competência
- Dados completos/placeholders

RETORNE JSON:
{
  "status_geral": "APROVADO" | "REVISAR" | "REFAZER",
  "risco_improcedencia": 15,
  "chance_procedencia_total": 85,
  "brechas_criticas": [
    {
      "tipo": "tese" | "fundamentacao" | "convencimento",
      "descricao": "Descrição específica da brecha",
      "gravidade": "alta" | "media" | "baixa",
      "sugestao": "Como corrigir de forma prática"
    }
  ],
  "pontos_fortes": ["Máximo 3 pontos"],
  "pontos_fracos": ["Máximo 3 pontos"],
  "recomendacao_final": "Recomendação em 1-2 frases"
}

DIRETRIZES:
- Seja RÁPIDO (não repita análises já feitas)
- Foque em ARGUMENTAÇÃO e MÉRITO
- Se está perfeito, deixe brechas_criticas vazio
- Seja objetivo e prático nas sugestões`;

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
