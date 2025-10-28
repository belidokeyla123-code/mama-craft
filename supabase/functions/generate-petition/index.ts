import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, selectedJurisprudencias = [] } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar TODOS os dados incluindo extrações
    const { data: caseData } = await supabase.from('cases').select('*').eq('id', caseId).single();
    const { data: analysis } = await supabase.from('case_analysis').select('*').eq('case_id', caseId).single();
    const { data: documents } = await supabase
      .from('documents')
      .select('*, extractions(*)')
      .eq('case_id', caseId);

    // Buscar procuração especificamente
    const procuracao = documents?.find(d => d.document_type === 'procuracao');
    const procuracaoData = procuracao?.extractions?.[0]?.entities || {};

    // Buscar análise de vídeo (se houver)
    const videoAnalysis = caseData.video_analysis;

    // Mapear tribunal por UF
    const uf = caseData.author_address?.match(/[A-Z]{2}$/)?.[0] || 'SP';
    const trfMap: Record<string, string> = {
      'AC': 'TRF1', 'AM': 'TRF1', 'AP': 'TRF1', 'BA': 'TRF1', 'DF': 'TRF1', 'GO': 'TRF1',
      'MA': 'TRF1', 'MG': 'TRF1', 'MT': 'TRF1', 'PA': 'TRF1', 'PI': 'TRF1', 'RO': 'TRF1',
      'RR': 'TRF1', 'TO': 'TRF1',
      'ES': 'TRF2', 'RJ': 'TRF2',
      'MS': 'TRF3', 'SP': 'TRF3',
      'PR': 'TRF4', 'RS': 'TRF4', 'SC': 'TRF4',
      'AL': 'TRF5', 'CE': 'TRF5', 'PB': 'TRF5', 'PE': 'TRF5', 'RN': 'TRF5', 'SE': 'TRF5'
    };
    const trf = trfMap[uf] || 'TRF3';

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

⚠️⚠️⚠️ AGORA VOCÊ VAI GERAR UMA PETIÇÃO INICIAL COMPLETA E PROFISSIONAL ⚠️⚠️⚠️

Você é um ADVOGADO ESPECIALISTA EM PETIÇÕES PREVIDENCIÁRIAS com conhecimento COMPLETO.

**DADOS COMPLETOS DISPONÍVEIS:**

CASO:
${JSON.stringify(caseData, null, 2)}

ANÁLISE JURÍDICA:
${JSON.stringify(analysis, null, 2)}

DOCUMENTOS COM DADOS EXTRAÍDOS:
${JSON.stringify(documents?.map(d => ({
  tipo: d.document_type,
  nome: d.file_name,
  dados_extraidos: d.extractions?.[0]?.entities
})), null, 2)}

PROCURAÇÃO:
${JSON.stringify(procuracaoData, null, 2)}

JURISPRUDÊNCIAS SELECIONADAS:
${JSON.stringify(selectedJurisprudencias, null, 2)}

${videoAnalysis ? `
📹 ANÁLISE DE VÍDEO:
${JSON.stringify(videoAnalysis, null, 2)}
` : ''}

⚠️ **VOCÊ DEVE USAR TODAS AS INFORMAÇÕES ACIMA** ⚠️

**REGRAS OBRIGATÓRIAS:**

1. **CABEÇALHO E QUALIFICAÇÃO DA AUTORA:**
   - Use o endereço COMPLETO da procuração
   - Inclua RG e CPF conforme documentos extraídos
   - Identifique automaticamente a VARA/SUBSEÇÃO pelo município
   - Tribunal: ${trf}
   - Exemplo: "SUBSEÇÃO JUDICIÁRIA DE [MUNICÍPIO] - [UF]"

2. **QUALIFICAÇÃO DO INSS:**
   - Identifique a agência INSS mais próxima do município
   - Use endereço completo da agência
   - Exemplo: "INSS - Agência de [Município], Rua [endereço], [Município]-[UF]"

3. **DOS FATOS:**
   - Use TODOS os dados de análise de vídeo (se houver)
   - Mencione TODOS os documentos anexados
   - Descreva cronologicamente com base nas datas dos documentos
   - Cite números de protocolo, datas de negativas da procuração ou outros docs
   - Se há RA negado, mencione protocolo e motivo

4. **DAS PROVAS:**
   - Liste TODOS os documentos enviados: ${documents?.map(d => d.document_type).join(', ')}
   - Explique o que CADA documento comprova
   - Referencie dados extraídos (datas, nomes, locais)

5. **DO DIREITO:**
   - Fundamentos legais completos (Lei 8.213/91, Decreto 3.048/99)
   - Cite TODAS as jurisprudências fornecidas com número do processo
   - Argumentação persuasiva com PNL

6. **VALOR DA CAUSA:**
   - R$ ${analysis?.valor_causa || 'a calcular'}

**FORMATAÇÃO ABNT:**
- Sem tags HTML
- Tópicos numerados
- Linguagem técnico-jurídica clara
- Máximo 15 páginas

**ESTRUTURA:**
I. EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) FEDERAL DA [VARA]

II. QUALIFICAÇÃO DAS PARTES
- Autora com endereço completo, RG e CPF
- INSS com endereço da agência local

III. DOS FATOS
- Narrativa detalhada e cronológica
- Perfil da segurada
- Evento com data
- RA (se houver) com protocolo e motivo da negativa

IV. DO DIREITO
- Fundamentos legais
- Jurisprudências citadas
- Argumentação persuasiva

V. DAS PROVAS
- Lista completa de documentos
- O que cada um comprova

VI. DOS PEDIDOS
- Concessão do benefício
- Valor da causa

VII. REQUERIMENTOS
- Citação do INSS
- Honorários
- Justiça gratuita

**IMPORTANTE:**
- NÃO invente informações
- Use APENAS dados fornecidos
- Se faltar algo, mencione "a ser comprovado"

Retorne apenas o texto da petição em markdown.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 12 segundos (otimizado)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atingido. Aguarde alguns segundos e tente novamente.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos Lovable AI esgotados. Adicione mais créditos.',
          code: 'NO_CREDITS'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const petitionText = aiData.choices[0].message.content;

      // Salvar draft no banco
      await supabase
        .from('drafts')
        .insert({
          case_id: caseId,
          markdown_content: petitionText,
          payload: { selectedJurisprudencias }
        });

      return new Response(JSON.stringify({ petitionText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Geração da petição demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in generate-petition:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
