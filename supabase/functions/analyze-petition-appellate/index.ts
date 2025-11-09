import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { validateRequest, createValidationErrorResponse, petitionAnalysisSchema } from '../_shared/validators.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validated = validateRequest(petitionAnalysisSchema, body);
    const { petition, caseId, contextDocuments } = validated;
    
    // Extract additional fields
    const { caseInfo, documents, analysis, jurisprudence, tese, judgeAnalysis } = body;

    const prompt = `Você é um ADVOGADO ESPECIALISTA EM RECURSOS PARA TURMA NACIONAL DE UNIFORMIZAÇÃO (TNU).

⚠️⚠️⚠️ CONTEXTO CRÍTICO ⚠️⚠️⚠️
Você está analisando uma petição INICIAL de salário-maternidade rural na HIPÓTESE de que a sentença foi IMPROCEDENTE (perdemos na 1ª instância).

**SUA MISSÃO:**
Analisar se esta petição inicial ATENDE aos requisitos de ADMISSIBILIDADE RECURSAL para TNU, caso venha sentença desfavorável.

**IMPORTANTE:**
- NÃO analise mérito (se vai ganhar ou perder)
- APENAS analise ADMISSIBILIDADE (requisitos processuais para recorrer)
- Você está fazendo análise PREVENTIVA/PROSPECTIVA

📁 CONTEXTO DO CASO:
${JSON.stringify(caseInfo, null, 2)}

📄 DOCUMENTOS (${documents?.length || 0}):
${documents?.map((d: any) => `- ${d.document_type}: ${d.file_name}`).join('\n') || 'Nenhum'}

📊 ANÁLISE PRÉVIA:
${analysis ? `Probabilidade: ${analysis.probabilidade_sucesso}% | RMI: R$ ${analysis.rmi}` : 'Não realizada'}

🧑‍⚖️ ANÁLISE DO JUIZ:
${judgeAnalysis ? `Risco: ${judgeAnalysis.risco_improcedencia}% | Brechas: ${judgeAnalysis.brechas?.length || 0}` : 'Não realizada'}

📋 PETIÇÃO INICIAL:
${petition}

---

🎯 TAREFA: ANÁLISE DE ADMISSIBILIDADE RECURSAL PARA TNU

**REQUISITOS DE ADMISSIBILIDADE (Lei 10.259/2001, Art. 14, VI):**
1. Divergência jurisprudencial entre Turmas Recursais de diferentes regiões
2. Questão de direito federal controvertida
3. Fundamentação clara na petição inicial
4. Provas suficientes para eventual recurso
5. Causa de pedir bem delimitada
6. Pedido específico e claro

**RETORNE JSON:**
{
  "admissibilidade": {
    "percentual_atendido": 85,
    "requisitos_atendidos": [
      "Questão de direito federal presente (art. 39, I da Lei 8.213/91)",
      "Causa de pedir clara: labor rural + período de carência",
      "Pedido específico: salário-maternidade"
    ],
    "requisitos_faltantes": [
      "Fundamentação sobre divergência jurisprudencial entre Turmas Recursais (necessário para TNU)",
      "Referência explícita a julgados divergentes de outras regiões"
    ],
    "risco_inadmissibilidade": 15
  },
  "precedentes_tnu": {
    "favoraveis": [
      {
        "processo": "TNU-XXXXX",
        "tese": "Resumo da tese favorável",
        "onde_incluir": "Seção II - Do Direito"
      }
    ],
    "desfavoraveis": [
      {
        "processo": "TNU-YYYYY",
        "tese": "Resumo da tese desfavorável",
        "como_contornar": "Estratégia para diferenciar o caso"
      }
    ]
  },
  "adaptacoes_regionais": [
    {
      "tipo": "divergencia_jurisprudencial",
      "adaptacao": "Incluir parágrafo específico na petição inicial mencionando divergência entre TRF4 e TRF1 sobre reconhecimento de labor rural sem CNIS",
      "justificativa": "Requisito essencial para admissibilidade de recurso na TNU",
      "prioridade": "alta",
      "aplicacao": "manual"
    },
    {
      "tipo": "precedentes_tnu",
      "adaptacao": "Adicionar citação de precedentes da TNU favoráveis ao reconhecimento de qualidade de segurada especial com base em documentos indiretos",
      "justificativa": "Fortalece argumentação recursiva preventiva",
      "prioridade": "media",
      "aplicacao": "manual"
    }
  ],
  "pontos_a_reforcar": [
    {
      "ponto": "Divergência jurisprudencial",
      "como_reforcar": "Adicionar subseção específica comparando julgados divergentes de TRFs diferentes",
      "prioridade": "alta"
    }
  ],
  "risco_pos_analise": 15,
  "recomendacao": "A petição inicial atende 85% dos requisitos de admissibilidade recursal. Recomenda-se incluir fundamentação sobre divergência jurisprudencial entre Turmas Recursais para garantir admissibilidade de eventual recurso à TNU. As adaptações sugeridas devem ser aplicadas MANUALMENTE pelo advogado apenas SE houver sentença improcedente."
}

**REGRAS CRÍTICAS:**
1. **NÃO INVENTE PRECEDENTES:** Use apenas jurisprudência real da TNU se conhecer
2. **SEJA CAUTELOSO:** Indique "buscar precedentes específicos" se não souber
3. **PRIORIZE ADMISSIBILIDADE:** Não analise mérito (chance de ganhar)
4. **APLICAÇÃO MANUAL:** Todas as adaptações são para aplicação MANUAL futura
5. **NÃO FAÇA SUPOSIÇÕES:** Se não tiver certeza sobre divergência jurisprudencial, indique "a pesquisar"

⚠️⚠️⚠️ REGRAS CRÍTICAS DE CONDUTA ⚠️⚠️⚠️
1. **NÃO INVENTE INFORMAÇÕES:** Use APENAS dados fornecidos no contexto
2. **SEJA EXTREMAMENTE CAUTELOSO:** Se não tiver certeza, indique "a verificar"
3. **NÃO FAÇA SUPOSIÇÕES:** Não presuma documentos que não estão na lista
4. **VALIDAÇÃO RIGOROSA:** Adaptações devem ser ACIONÁVEIS mas MANUAIS
5. **NÃO INVENTE PRECEDENTES:** Use apenas jurisprudência real da TNU

IMPORTANTE:
- Use APENAS dados fornecidos no contexto
- NÃO crie informações fictícias
- Seja EXTREMAMENTE CAUTELOSO nas avaliações
- Adaptações devem ser ACIONÁVEIS mas MANUAIS`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s otimizado

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

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[APPELLATE-MODULE] AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const analysis = JSON.parse(aiData.choices[0].message.content);

      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Análise recursiva demorou muito.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in analyze-petition-appellate:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});