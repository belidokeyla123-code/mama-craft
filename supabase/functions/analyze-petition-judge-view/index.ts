import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { petition, caseInfo, documents, analysis, jurisprudence, tese } = await req.json();

    const prompt = `Você é um JUIZ FEDERAL experiente com VISÃO 360° do processo. 

📁 DADOS COMPLETOS DO CASO:

**INFORMAÇÕES BÁSICAS:**
${JSON.stringify(caseInfo, null, 2)}

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
  "recomendacoes": ["Máximo 3 recomendações PRÁTICAS"]
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
          model: 'google/gemini-2.5-flash-lite',
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
      const analysis = JSON.parse(aiData.choices[0].message.content);

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
    console.error('Error in analyze-petition-judge-view:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
