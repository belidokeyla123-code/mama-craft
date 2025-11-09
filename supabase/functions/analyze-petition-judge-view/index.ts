import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { validateRequest, createValidationErrorResponse, petitionAnalysisSchema } from '../_shared/validators.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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
    const validated = validateRequest(petitionAnalysisSchema, body);
    const { petition, caseId, contextDocuments } = validated;
    
    // Extract additional fields from body that aren't in schema
    const { caseInfo, documents, analysis, jurisprudence, tese } = body;

    console.log('[JUDGE-MODULE] Request body keys:', Object.keys(body));

    // Log detalhado para debug
    console.log('[JUDGE-MODULE] 📋 ANÁLISE PROFUNDA - Data validation:', {
      hasPetition: !!petition,
      petitionLength: petition?.length || 0,
      hasCaseInfo: !!caseInfo,
      hasDocuments: !!documents,
      documentsCount: documents?.length || 0,
      hasAnalysis: !!analysis,
      hasJurisprudence: !!jurisprudence,
      hasTese: !!tese,
      documentTypes: documents?.map((d: any) => d.document_type) || []
    });
    
    // ═══ CRIAR LISTA DETALHADA DE DOCUMENTOS COM EXTRAÇÕES ═══
    const documentosInfo = documents?.map((doc: any, i: number) => {
      const extraction = doc.extractions?.[0];
      return `Doc. ${String(i + 1).padStart(2, '0')}: ${doc.file_name}
   Tipo: ${doc.document_type || 'não classificado'}
   Conteúdo extraído: ${extraction?.extracted_text ? extraction.extracted_text.substring(0, 500) + '...' : 'Não extraído'}`;
    }).join('\n\n') || 'Nenhum documento anexado';

    // Validação básica
    if (!petition || typeof petition !== 'string' || petition.trim().length === 0) {
      console.error('[JUDGE-MODULE] ❌ Petição inválida');
      throw new Error('Petição não fornecida ou inválida');
    }

    const prompt = `Você é um JUIZ FEDERAL fazendo ANÁLISE CRÍTICA PROFUNDA da petição inicial.

📋 CONTEXTO COMPLETO DO CASO:

**INFORMAÇÕES DO CASO:**
${JSON.stringify(caseInfo, null, 2)}

**ANÁLISE JURÍDICA REALIZADA:**
${JSON.stringify(analysis, null, 2)}

**JURISPRUDÊNCIAS ENCONTRADAS:**
${JSON.stringify(jurisprudence, null, 2)}

**TESE JURÍDICA CONSTRUÍDA:**
${JSON.stringify(tese, null, 2)}

**DOCUMENTOS ANEXADOS (COM CONTEÚDO):**
${documentosInfo}

**PETIÇÃO INICIAL:**
${petition}

---

⚖️ ANÁLISE JUDICIAL COMPLETA

Verifique RIGOROSAMENTE:

1. **REQUISITOS LEGAIS PREVIDENCIÁRIOS**
   - ✅ Carência de 10 meses cumprida? (verificar CNIS + autodeclaração)
   - ✅ Qualidade de segurada mantida? (último recolhimento + período de graça)
   - ✅ Parto/adoção comprovada? (certidão de nascimento + prontuário médico)
   - ✅ Autodeclaração vs CNIS: informações conferem?

2. **CONSISTÊNCIA DOCUMENTOS ↔ PETIÇÃO**
   - A petição menciona "conforme Doc. X anexo"? O Doc. X existe e é do tipo correto?
   - Dados citados na petição (datas, valores) conferem com extrações dos documentos?
   - Certidão de nascimento anexada? Data do parto mencionada na petição confere?
   - CNIS anexado? Períodos de contribuição mencionados conferem?
   - Há menção a documentos que não estão anexados?

3. **JURISPRUDÊNCIAS**
   - As jurisprudências citadas são do TRF correto (${caseInfo.trf || 'verificar'})?
   - As teses das jurisprudências são ESPECÍFICAS para salário-maternidade?
   - Faltam precedentes importantes que deveriam estar citados?
   - As ementas citadas são atuais e relevantes?

4. **TESE JURÍDICA**
   - A tese é sólida e alinhada com jurisprudência dominante?
   - Há fundamentação legal robusta (Lei 8.213/91, art. 71-73)?
   - A argumentação é convincente e bem estruturada?
   - Há precedentes do STF/STJ/TRF citados adequadamente?

5. **JURISDIÇÃO CORRETA (CRÍTICO)**
   - Verificar se o endereçamento está CORRETO e SEM ERROS
   - Para Rondônia: Porto Velho é atendido por Ji-Paraná (não pode ser "Porto Velho")
   - O endereçamento deve mencionar "Subseção Judiciária" quando aplicável
   - Formato correto: "Juizado Especial Federal de [Subseção]/[UF]"
   - NUNCA use UF errada (ex: Porto Velho-PR é ERRO CRÍTICO, deve ser Ji-Paraná/RO)
   - Exemplo CORRETO: "Juizado Especial Federal da Subseção Judiciária de Ji-Paraná/RO"
   - Exemplo ERRADO: "Juizado Especial Federal de Porto Velho-PR" ❌

6. **BRECHAS CRÍTICAS QUE O RÉU (INSS) PODE EXPLORAR**
   - Inconsistências entre autodeclaração e CNIS
   - Falta de documentos essenciais
   - Erros de datas, cálculos ou valores
   - Argumentação fraca ou contraditória
   - Referências documentais incorretas
   - Falhas na demonstração de requisitos legais

---

RETORNE JSON ESTRUTURADO:

{
  "status_geral": "APROVADO" | "REVISAR" | "REFAZER",
  "risco_improcedencia": 15,
  "chance_procedencia_total": 85,
  "brechas": [
    {
      "tipo": "requisito_legal" | "documento" | "jurisprudencia" | "tese" | "fundamentacao" | "calculo",
      "problema": "Descrição específica e detalhada da brecha encontrada",
      "gravidade": "alta" | "media" | "baixa",
      "localizacao": "Em qual parte da petição está o problema (ex: 'Seção II - Dos Fatos, parágrafo 3')",
      "impacto": "Como isso pode prejudicar o caso judicialmente",
      "sugestao": "Como corrigir de forma prática e objetiva",
      "paragrafo_corrigido": "O parágrafo completo já corrigido, pronto para substituir na petição"
    }
  ],
  "pontos_fortes": [
    "Máximo 3 pontos fortes identificados"
  ],
  "pontos_fracos": [
    "Máximo 3 pontos fracos identificados"
  ],
  "recomendacoes": [
    "Até 3 recomendações práticas para melhorar a petição"
  ]
}

**EXEMPLOS DE BRECHAS ESPECÍFICAS:**

❌ **Brecha Grave - Documento Inconsistente:**
{
  "tipo": "documento",
  "problema": "A petição menciona 'conforme autodeclaração anexa (Doc. 05)' mas o Doc. 05 é na verdade o CNIS, não a autodeclaração. A autodeclaração é o Doc. 03.",
  "gravidade": "alta",
  "localizacao": "Seção II - Dos Fatos, parágrafo 4",
  "impacto": "O juiz pode rejeitar o pedido por falta de prova adequada ou desorganização processual",
  "sugestao": "Corrigir a numeração do documento citado para Doc. 03",
  "paragrafo_corrigido": "A autora declarou que exerce atividade rural em regime de economia familiar desde 01/01/2020, conforme autodeclaração anexa (Doc. 03), sendo que o CNIS (Doc. 05) confirma os períodos de contribuição como segurada individual."
}

❌ **Brecha Grave - Requisito Legal:**
{
  "tipo": "requisito_legal",
  "problema": "A petição não demonstra claramente o cumprimento da carência de 10 meses. O CNIS anexo mostra contribuições apenas de 03/2024 a 11/2024 (8 meses), mas a petição afirma que há carência suficiente sem explicar como.",
  "gravidade": "alta",
  "localizacao": "Seção III - Do Direito, requisitos para concessão",
  "impacto": "O INSS contestará alegando falta de carência, o que pode levar à improcedência",
  "sugestao": "Incluir períodos anteriores de contribuição ou demonstrar trabalho rural anterior que complemente a carência",
  "paragrafo_corrigido": "A autora cumpriu a carência de 10 meses necessária para a concessão do salário-maternidade, considerando: (i) 8 meses de contribuições como segurada individual de 03/2024 a 11/2024, conforme CNIS (Doc. 05); e (ii) 4 meses de trabalho rural em regime de economia familiar de 11/2023 a 02/2024, conforme autodeclaração e início de prova material (Doc. 03 e Doc. 06), totalizando 12 meses de carência cumpridos antes do parto ocorrido em 15/12/2024."
}

❌ **Brecha Média - Jurisprudência:**
{
  "tipo": "jurisprudencia",
  "problema": "A petição cita jurisprudência do TRF-3, mas o caso será julgado no TRF-1 (Rondônia). Embora não seja um erro fatal, citar precedentes do próprio TRF aumenta a força persuasiva.",
  "gravidade": "media",
  "localizacao": "Seção IV - Jurisprudência",
  "impacto": "Argumentação menos persuasiva; perda de oportunidade de usar precedentes vinculantes do TRF-1",
  "sugestao": "Substituir ou complementar com jurisprudências específicas do TRF-1 sobre salário-maternidade",
  "paragrafo_corrigido": "Nesse sentido, o TRF-1 já decidiu reiteradamente pela concessão do salário-maternidade à segurada especial em regime de economia familiar, conforme: 'PREVIDENCIÁRIO. SALÁRIO-MATERNIDADE. SEGURADA ESPECIAL. REGIME DE ECONOMIA FAMILIAR. INÍCIO DE PROVA MATERIAL. CARÊNCIA CUMPRIDA. CONCESSÃO DO BENEFÍCIO. (TRF-1, AC 1001234-56.2024.4.01.4100, Rel. Des. João Silva, DJe 10/05/2024)'."
}

DIRETRIZES PARA ANÁLISE:
- Seja EXTREMAMENTE RIGOROSO e DETALHISTA
- Identifique TODAS as brechas, mesmo pequenas
- Para cada brecha, forneça o PARÁGRAFO CORRIGIDO completo e pronto para uso
- Verifique a CONSISTÊNCIA entre documentos anexados e citações na petição
- Analise se os REQUISITOS LEGAIS estão claramente demonstrados
- Verifique se as JURISPRUDÊNCIAS são do TRF correto e específicas
- Se não houver brechas, deixe o array vazio
- Foque em problemas que o INSS ou o juiz REALMENTE apontariam

IMPORTANTE: Retorne APENAS o JSON, sem texto adicional ou markdown.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    console.log('[JUDGE-MODULE] 🚀 Iniciando chamada para AI Gateway...');
    console.log('[JUDGE-MODULE] Prompt length:', prompt.length);
    
    // Timeout de 30 segundos para análises rápidas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[JUDGE-MODULE] ⏰ TIMEOUT após 30 segundos');
      controller.abort();
    }, 30000);

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
