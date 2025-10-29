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

DADOS DO CASO:
Autora: ${caseData.author_name} | CPF: ${caseData.author_cpf}
Perfil: ${caseData.profile} | Evento: ${caseData.child_birth_date || caseData.event_date}
${caseData.ra_protocol ? `RA Indeferido: ${caseData.ra_protocol}` : ''}

ANÁLISE: ${JSON.stringify(analysis?.resumo_executivo || {}, null, 2)}
RMI: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
Valor da Causa: R$ ${analysis?.valor_causa || 'a calcular'}

ESTRUTURA OBRIGATÓRIA:
I. Endereçamento ao ${trf}
II. Qualificação (Autora + INSS)
III. Fatos (perfil segurada + evento gerador + ${caseData.ra_protocol ? 'RA indeferido' : 'nenhum RA'})
IV. Direito (Lei 8.213/91 + IN 128/2022 + jurisprudências)
V. Provas (${documents?.length || 0} documentos)
VI. Pedidos:
   - Tutela Urgência (Art. 300 CPC)
   - Principal: salário-maternidade | DIB: ${caseData.child_birth_date}
   - Honorários (15-20%)
   - Justiça Gratuita
VII. Valor da Causa: R$ ${analysis?.valor_causa}

REGRAS:
✅ Use APENAS dados fornecidos
✅ Seja técnica e persuasiva
✅ Markdown formatado

Retorne petição completa em markdown.`;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 60 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
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
