import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

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

    // Buscar todos os dados
    const { data: caseData } = await supabase.from('cases').select('*').eq('id', caseId).single();
    const { data: analysis } = await supabase.from('case_analysis').select('*').eq('case_id', caseId).single();
    const { data: documents } = await supabase.from('documents').select('*').eq('case_id', caseId);

    const prompt = `Você é um advogado especialista em petições de salário-maternidade. Redija uma PETIÇÃO INICIAL COMPLETA, PERSUASIVA e de ALTO NÍVEL.

DADOS DO CASO:
${JSON.stringify(caseData, null, 2)}

ANÁLISE JURÍDICA:
${JSON.stringify(analysis, null, 2)}

JURISPRUDÊNCIAS SELECIONADAS:
${JSON.stringify(selectedJurisprudencias, null, 2)}

DOCUMENTOS:
${documents?.map(d => `- ${d.document_type}: ${d.file_name}`).join('\n')}

INSTRUÇÕES:
1. Use técnicas de PNL e persuasão
2. Seja extremamente convincente
3. Fundamente com as jurisprudências fornecidas
4. Cite leis (Lei 8.213/91, Decreto 3.048/99)
5. Use linguagem técnica mas acessível
6. Estruture profissionalmente

ESTRUTURA DA PETIÇÃO:
I. EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) FEDERAL DA [VARA]

II. DOS FATOS
- Narrativa detalhada, cronológica e persuasiva
- Mencione o perfil (segurada especial/urbana)
- Descreva o evento (parto/adoção/aborto) com data
- Se há RA negado, mencione protocolo e motivo
- Se há situação especial, explique com detalhes

III. DO DIREITO
- Fundamentos legais completos
- Artigos específicos da Lei 8.213/91
- Súmulas aplicáveis
- Jurisprudências selecionadas (cite número do processo e tese)
- Doutrinas (se houver)
- Argumentação persuasiva com PNL

IV. DAS PROVAS
- Liste todos os documentos anexados
- Explique o que cada documento comprova

V. DOS PEDIDOS
- Concessão do benefício de salário-maternidade
- Se gêmeos: pagamento em dobro
- Tutela de urgência (se aplicável)
- Valor da causa: R$ ${analysis?.valor_causa || 0}

VI. REQUERIMENTOS
- Citação do INSS
- Condenação em honorários
- Justiça gratuita (se aplicável)

Retorne apenas o texto da petição, sem JSON. Use formatação markdown para negrito e itálico.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const petitionText = aiData.choices[0].message.content;

    // Salvar draft
    await supabase.from('drafts').insert({
      case_id: caseId,
      markdown_content: petitionText,
      payload: { caseData, analysis, selectedJurisprudencias },
      version: 1
    });

    return new Response(JSON.stringify({ petition: petitionText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-petition:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
