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

GERE UMA PETIÇÃO INICIAL DE SALÁRIO-MATERNIDADE COMPLETA E PROFISSIONAL.

**DADOS DO CASO:**
Autora: ${caseData.author_name} | CPF: ${caseData.author_cpf}
Perfil: ${caseData.profile} | Evento: ${caseData.child_birth_date || caseData.event_date}
${caseData.ra_protocol ? `RA Indeferido: ${caseData.ra_protocol} | Motivo: ${caseData.ra_denial_reason}` : ''}

ANÁLISE: ${JSON.stringify(analysis?.resumo_executivo || analysis?.fundamentacao_legal || {}, null, 2)}
RMI: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
Valor da Causa: R$ ${analysis?.valor_causa || 'a calcular'}

DOCUMENTOS (${documents?.length || 0}): ${documents?.map(d => d.document_type).join(', ') || 'Nenhum'}

JURISPRUDÊNCIAS: ${selectedJurisprudencias?.map((j: any) => j.tese || j.ementa?.substring(0, 100)).join(' | ') || 'Nenhuma'}

**ESTRUTURA OBRIGATÓRIA:**

I. EXCELENTÍSSIMO SR. DR. JUIZ FEDERAL DA [SUBSEÇÃO] - ${trf}

II. QUALIFICAÇÃO
- Autora completa (nome, CPF, RG, endereço completo, telefone)
- Réu: INSS | CNPJ: 29.979.036/0001-40

III. DOS FATOS (narrativa cronológica)
- Perfil segurada ${caseData.profile === 'especial' ? '(atividade rural, regime familiar)' : '(urbana)'}
- Evento gerador (parto/adoção ${caseData.child_birth_date})
${caseData.ra_protocol ? '- RA indeferido injustamente' : ''}
${videoAnalysis ? '- Vídeo propriedade comprova atividade' : ''}

IV. DO DIREITO
- Lei 8.213/91 (Arts. 11-VII, 39, 71, 71-§3º)
- Decreto 3.048/99 (Arts. 93, 106)
- IN 128/2022
- Jurisprudências citadas
- Argumentação persuasiva

V. DAS PROVAS
Lista ${documents?.length} documentos (explicar conjunto probatório)

VI. DOS PEDIDOS
A) TUTELA URGÊNCIA (Art. 300 CPC): probabilidade direito + perigo dano → implantar benefício
B) PRINCIPAL: concessão salário-maternidade | DIB: ${caseData.child_birth_date} | RMI: R$ ${analysis?.rmi?.valor}
C) INVERSÃO ÔNUS PROVA (Art. 373-§1º CPC)
D) HONORÁRIOS (15-20% Súmula 111 STJ)
E) JUSTIÇA GRATUITA (Art. 98 CPC)

VII. VALOR DA CAUSA: R$ ${analysis?.valor_causa}

VIII. REQUERIMENTOS FINAIS (citação, provas, procedência total)

Local, Data
[Nome Advogado] OAB/[UF]

**REGRAS:**
✅ Use APENAS dados fornecidos (não invente)
✅ Seja técnica, persuasiva e completa
✅ Inclua TODOS elementos estrutura
✅ Argumentação PNL (anáforas, metáforas dignidade humana)

Retorne petição em markdown formatado.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 40 segundos (geração de petição é processo complexo)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

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
