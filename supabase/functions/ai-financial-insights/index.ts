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
    const { currentStats, previousStats, monthlyData } = await req.json();
    
    console.log('Gerando insights financeiros com IA...');
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const prompt = `
Você é um consultor financeiro especializado em gestão de escritórios de advocacia focados em causas previdenciárias.

Analise os dados abaixo e forneça insights estratégicos, sugestões de melhoria e projeções tipo DRE:

**DADOS DO PERÍODO ATUAL:**
- Total de Casos Protocolados: ${currentStats.total_protocoladas}
- Acordos Fechados: ${currentStats.total_acordos}
- Sentenças Procedentes: ${currentStats.total_sentencas_procedentes}
- Derrotas: ${currentStats.total_sentencas_improcedentes}
- Honorários Recebidos: R$ ${currentStats.valor_total_honorarios.toFixed(2)}
- Valor para Cliente: R$ ${currentStats.valor_total_cliente.toFixed(2)}
- Total Recebido: R$ ${currentStats.valor_total_recebido.toFixed(2)}

**DADOS DO PERÍODO ANTERIOR:**
- Total de Casos Protocolados: ${previousStats.total_protocoladas}
- Acordos Fechados: ${previousStats.total_acordos}
- Sentenças Procedentes: ${previousStats.total_sentencas_procedentes}
- Derrotas: ${previousStats.total_sentencas_improcedentes}
- Honorários Recebidos: R$ ${previousStats.valor_total_honorarios.toFixed(2)}

**EVOLUÇÃO DOS ÚLTIMOS MESES:**
${JSON.stringify(monthlyData, null, 2)}

Forneça uma análise completa incluindo:

1. **DIAGNÓSTICO:** Avalie a performance atual comparando com o período anterior
2. **INSIGHTS ESTRATÉGICOS:** Identifique tendências, pontos fortes e fracos
3. **METAS SUGERIDAS:** Quantos casos preciso ganhar nos próximos meses para manter/aumentar a renda?
4. **PROJEÇÃO DRE (Demonstrativo de Resultados):**
   - Receita atual e projetada
   - Taxa de conversão (casos ganhos / casos protocolados)
   - Sugestões para aumentar margem de lucro
   - Projeção de crescimento mensal
5. **AÇÕES PRÁTICAS:** Liste 3-5 ações concretas para melhorar os resultados

Seja direto, prático e focado em resultados. Use números e percentuais específicos.
`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um consultor financeiro especializado em gestão de escritórios de advocacia. Forneça análises práticas, diretas e acionáveis.'
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns instantes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos esgotados. Adicione créditos no painel Lovable.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Erro da API de IA:', response.status, errorText);
      throw new Error('Erro ao gerar insights com IA');
    }

    const data = await response.json();
    const insights = data.choices[0].message.content;

    console.log('Insights gerados com sucesso');

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função ai-financial-insights:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
