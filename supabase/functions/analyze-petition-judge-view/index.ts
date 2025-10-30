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

    // Validação básica
    if (!petition || typeof petition !== 'string' || petition.trim().length === 0) {
      console.error('[JUDGE-MODULE] ❌ Petição inválida');
      throw new Error('Petição não fornecida ou inválida');
    }

    const prompt = `Você é um JUIZ FEDERAL experiente com VISÃO 360° do processo. 

📁 DADOS COMPLETOS DO CASO:

**INFORMAÇÕES BÁSICAS:**
${JSON.stringify(caseInfo, null, 2)}

**BENEFÍCIOS ANTERIORES (Manual):**
${caseInfo?.manual_benefits && caseInfo.manual_benefits.length > 0 ?
  caseInfo.manual_benefits.map((b: any) => `- ${b.tipo}: ${b.inicio} a ${b.fim}`).join('\n') :
  'Nenhum informado'}

⚠️ REGRA CRÍTICA: 
Se houver salário-maternidade anterior informado manualmente:
→ NÃO liste como "brecha" ou "ponto fraco"
→ VERIFIQUE se a petição fundamentou corretamente que é direito POR CADA GESTAÇÃO
→ Se NÃO fundamentou, crie brecha tipo "argumentativa" com sugestão para adicionar Art. 71, Lei 8.213/91 e TNU-PEDILEF 0506032-44.2012.4.05.8300

**DOCUMENTOS ANEXADOS (${documents?.length || 0}):**
${documents?.map((d: any) => `
- Tipo: ${d.document_type}
- Nome: ${d.file_name}
- Dados extraídos: ${JSON.stringify(d.extractions, null, 2)}
`).join('\n') || 'Nenhum documento anexado'}

**ANÁLISE JURÍDICA PRÉVIA:**
${analysis ? JSON.stringify(analysis, null, 2) : 'Não realizada'}

**JURISPRUDÊNCIAS SELECIONADAS:**
${jurisprudence?.results ? JSON.stringify(jurisprudence.results, null, 2) : 'Nenhuma selecionada'}

**TESE JURÍDICA:**
${tese?.teses ? JSON.stringify(tese.teses, null, 2) : 'Não elaborada'}

**PETIÇÃO INICIAL:**
${petition}

---

⚠️ TAREFA: ANÁLISE DE QUALIDADE COMPLETA - RECHECKAGEM RÁPIDA E CRÍTICA

**REGRAS OBRIGATÓRIAS:**

1. **NÃO sugira que faltam documentos se eles EXISTEM nos dados acima!**
   - Exemplo: Se há procuração listada, NÃO diga que falta procuração!
   
2. **Verifique se os dados extraídos dos documentos estão NA PETIÇÃO:**
   - Endereço da procuração está na qualificação da autora?
   - RG e CPF dos documentos estão corretos na petição?
   - Datas dos documentos batem com os fatos narrados?

3. **Verifique COERÊNCIA entre as seções:**
   - A análise jurídica está refletida na fundamentação?
   - As jurisprudências selecionadas foram citadas?
   - A tese jurídica está incorporada na argumentação?

4. **Identifique brechas REAIS:**
   - Argumentos fracos ou contraditórios
   - Fundamentos legais ausentes
   - Falhas na concatenação lógica
   - Pedidos mal formulados

**RETORNE JSON:**
{
  "brechas": [
    {
      "tipo": "probatoria" | "argumentativa" | "juridica",
      "descricao": "Descrição ESPECÍFICA da brecha",
      "gravidade": "alta" | "media" | "baixa",
      "localizacao": "Em qual parte da petição",
      "sugestao": "Como corrigir (seja PRÁTICO e ESPECÍFICO)",
      "documento_necessario": "Nome do documento que falta (SOMENTE se realmente faltar)"
    }
  ],
  "pontos_fortes": ["Máximo 5 pontos"],
  "pontos_fracos": ["Máximo 5 pontos"],
  "risco_improcedencia": 20,
  "recomendacoes": ["Máximo 3 recomendações PRÁTICAS"],
  "validacao_abas": {
    "validacao": {
      "status": "OK" | "ATENÇÃO" | "CRÍTICO",
      "problemas": ["Problema específico 1", "Problema específico 2"]
    },
    "analise": {
      "status": "OK" | "ATENÇÃO" | "CRÍTICO",
      "problemas": ["Ex: Carência não foi calculada corretamente", "RMI diverge dos dados"]
    },
    "jurisprudencia": {
      "status": "OK" | "ATENÇÃO" | "CRÍTICO",
      "problemas": ["Ex: Jurisprudências genéricas", "Faltam casos específicos do TRF"]
    },
    "teses": {
      "status": "OK" | "ATENÇÃO" | "CRÍTICO",
      "problemas": ["Ex: Teses não conectadas às jurisprudências", "Argumentação fraca"]
    },
    "peticao": {
      "status": "OK" | "ATENÇÃO" | "CRÍTICO",
      "problemas": ["Ex: Dados das abas não incorporados", "Jurisprudências não citadas"]
    }
  }
}

**IMPORTANTE:**
- Seja RÁPIDO mas PRECISO
- NÃO invente problemas que não existem
- Foque em melhorias ACIONÁVEIS
- Considere que o caso JÁ foi analisado pela IA antes`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 8 segundos (otimizado para velocidade)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
