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

    // Buscar benefícios anteriores
    const { data: benefitHistory } = await supabase
      .from('benefit_history')
      .select('*')
      .eq('case_id', caseId);

    // Buscar análise de vídeo (se houver)
    const videoAnalysis = caseData.video_analysis;

    // Extrair cidade do endereço ou usar procuração
    const addressMatch = caseData.author_address?.match(/([A-ZÁÉÍÓÚÂÊÔÃÕ\s]+)\s*-\s*([A-Z]{2})/i);
    const city = addressMatch?.[1]?.trim() || procuracaoData.city || 'a ser informada';
    const uf = addressMatch?.[2] || caseData.birth_state || 'SP';
    
    // Mapear tribunal por UF
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
    const trfNumber = trf.replace('TRF', '');

    // Preparar dados completos da autora
    const autoraCivil = caseData.author_marital_status || 'não informado';
    const autoraProfissao = caseData.profile === 'especial' ? 'Trabalhadora Rural' : 
                            caseData.profile === 'individual' ? 'Trabalhadora Autônoma' : 'Trabalhadora';

    // Preparar histórico de benefícios para o prompt
    let benefitHistoryText = '';
    if (benefitHistory && benefitHistory.length > 0) {
      benefitHistoryText = '\n\nBENEFÍCIOS ANTERIORES (já reconhecidos pelo INSS):\n';
      benefitHistory.forEach(b => {
        benefitHistoryText += `- NB ${b.nb}: ${b.benefit_type} (${b.start_date} a ${b.end_date || 'atual'}) - ${b.status}\n`;
      });
      benefitHistoryText += 'IMPORTANTE: Estes benefícios PROVAM que o INSS já reconheceu a qualidade de segurada especial!\n';
    }

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

DADOS COMPLETOS DO CASO:

**AUTORA (Qualificação Completa):**
- Nome: ${caseData.author_name}
- CPF: ${caseData.author_cpf}
- RG: ${caseData.author_rg || 'não informado'}
- Data de Nascimento: ${caseData.author_birth_date || 'não informada'}
- Estado Civil: ${autoraCivil}
- Profissão: ${autoraProfissao}
- Endereço: ${caseData.author_address || 'não informado'}
- Telefone: ${caseData.author_phone || ''}
- WhatsApp: ${caseData.author_whatsapp || ''}

**RÉU (INSS - Qualificação Completa):**
- Nome: Instituto Nacional do Seguro Social - INSS
- Natureza Jurídica: Autarquia Federal
- CNPJ: 00.394.429/9999-06
- Representação: Por sua Procuradoria Federal
- Endereço: Procuradoria Federal em ${city}/${uf}

**CIDADE/COMARCA:** ${city}/${uf}
**TRIBUNAL:** ${trf} (Terceira Região)

**EVENTO:**
- Tipo: ${caseData.event_type === 'parto' ? 'Nascimento' : caseData.event_type}
- Data: ${caseData.child_birth_date || caseData.event_date}
- Nome da Criança: ${caseData.child_name || 'não informado'}

**PROCESSO ADMINISTRATIVO:**
${caseData.ra_protocol ? `- NB/Protocolo: ${caseData.ra_protocol}
- Data do Requerimento: ${caseData.ra_request_date || 'não informada'}
- Data do Indeferimento: ${caseData.ra_denial_date || 'não informada'}
- Motivo do Indeferimento: ${caseData.ra_denial_reason || 'não informado'}` : '- Nenhum requerimento administrativo prévio'}
${benefitHistoryText}

**ANÁLISE JURÍDICA:**
${JSON.stringify(analysis?.resumo_executivo || {}, null, 2)}

**CÁLCULOS:**
- RMI Calculada: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
- Valor da Causa: R$ ${analysis?.valor_causa || 'a calcular'}

**DOCUMENTOS ANEXADOS:** ${documents?.length || 0} documento(s)

**ESTRUTURA OBRIGATÓRIA DA PETIÇÃO:**

I. **ENDEREÇAMENTO**
"EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA ${trfNumber}ª REGIÃO
JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}"

II. **QUALIFICAÇÃO DA AUTORA** (use TODOS os dados acima)
Nome completo, CPF, RG, estado civil, profissão, endereço completo

III. **TÍTULO DA AÇÃO** (entre as qualificações)
"AÇÃO DE CONCESSÃO DE SALÁRIO-MATERNIDADE"

IV. **QUALIFICAÇÃO DO RÉU** (use dados completos do INSS)
Instituto Nacional do Seguro Social - INSS
Autarquia Federal, CNPJ 00.394.429/9999-06
Representado por sua Procuradoria Federal
Endereço: Procuradoria Federal em ${city}/${uf}

V. **DOS FATOS**
- Perfil da segurada (${caseData.profile})
- Evento gerador (nascimento em ${caseData.child_birth_date})
- ${caseData.ra_protocol ? 'Requerimento administrativo indeferido' : 'Ausência de RA'}
${benefitHistory && benefitHistory.length > 0 ? '- INSS já reconheceu qualidade de segurada em benefícios anteriores' : ''}

VI. **DO DIREITO**
- Lei 8.213/91
- IN 128/2022
- Jurisprudências

VII. **DAS PROVAS**
- ${documents?.length || 0} documentos anexados

VIII. **DOS PEDIDOS**
1. Tutela de Urgência (Art. 300 CPC)
2. Pedido Principal: Concessão de salário-maternidade
   - DIB: ${caseData.child_birth_date}
   - RMI: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
3. Honorários advocatícios (15-20%)
4. Justiça Gratuita

IX. **DO VALOR DA CAUSA**
R$ ${analysis?.valor_causa}

**REGRAS IMPORTANTES:**
✅ Use TODOS os dados fornecidos (CPF, RG, endereço completo)
✅ INSS com CNPJ 00.394.429/9999-06
✅ Cidade e tribunal corretos: ${city}/${uf} - ${trf}
✅ Se houver benefícios anteriores, ENFATIZE que o INSS já reconheceu a qualidade de segurada
✅ Seja técnica, persuasiva e completa
✅ Markdown bem formatado

Retorne a petição completa em markdown, seguindo EXATAMENTE a estrutura acima.`;
    
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
