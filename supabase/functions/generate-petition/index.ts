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

**ESTRUTURA COMPLETA E OBRIGATÓRIA DA PETIÇÃO INICIAL:**

═══════════════════════════════════════════════════════════

I. 📝 **ENDEREÇAMENTO CORRETO**

EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) FEDERAL DA [VARA/SUBSEÇÃO JUDICIÁRIA DE MUNICÍPIO]

Tribunal: ${trf}
Município: [identificar pelo endereço da autora]

Exemplo: "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA SUBSEÇÃO JUDICIÁRIA DE ARACAJU - SE"

═══════════════════════════════════════════════════════════

II. 👥 **QUALIFICAÇÃO COMPLETA DAS PARTES**

**AUTORA (REQUERENTE):**
Nome completo: ${caseData.author_name}
Nacionalidade: brasileira
Estado civil: ${caseData.author_marital_status || 'a informar'}
Profissão: ${caseData.profile === 'especial' ? 'Trabalhadora Rural' : 'a informar'}
RG: ${caseData.author_rg || 'a informar'}
CPF: ${caseData.author_cpf}
Endereço COMPLETO: [extrair da procuração ou dos documentos]
   Rua: [extrair]
   Nº: [extrair]
   Bairro: [extrair]
   Cidade: [extrair]
   Estado: [extrair]
   CEP: [extrair]
Telefone/WhatsApp: ${caseData.author_whatsapp || caseData.author_phone || 'a informar'}

**RÉU (REQUERIDO):**
INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS
CNPJ: 29.979.036/0001-40
Agência: [identificar agência INSS mais próxima do município da autora]
Endereço completo da agência: [pesquisar endereço real da agência local]

═══════════════════════════════════════════════════════════

III. 📖 **DOS FATOS (NARRATIVA CRONOLÓGICA DETALHADA)**

Estrutura da narrativa:

A) PERFIL DA SEGURADA
   - Descrever atividade rural (quando começou, onde, com quem)
   - Se especial: descrever regime de economia familiar
   - Se urbana: descrever vínculos empregatícios

B) ATIVIDADE RURAL DETALHADA (se segurada especial)
   - Local da atividade: [município, propriedade]
   - Período de exercício: [datas]
   - Tipo de atividade: [agricultura, pecuária, etc.]
   - Com quem trabalhava: [família, sozinha]
   - O que produzia: [produtos agrícolas]
   
   ${videoAnalysis ? `
   C) ANÁLISE DE VÍDEO DA PROPRIEDADE
      ${JSON.stringify(videoAnalysis, null, 2)}
   ` : ''}

D) EVENTO GERADOR
   - Data do parto/adoção: ${caseData.child_birth_date || caseData.event_date}
   - Nome do filho: ${caseData.child_name || 'não informado'}
   - Tipo de evento: ${caseData.event_type || 'parto'}

E) REQUERIMENTO ADMINISTRATIVO (se houver)
   ${caseData.ra_protocol ? `
   - Protocolo NB: ${caseData.ra_protocol}
   - Data do requerimento: ${caseData.ra_request_date || 'não informada'}
   - Data do indeferimento: ${caseData.ra_denial_date || 'não informada'}
   - Motivo alegado pelo INSS: ${caseData.ra_denial_reason || 'não informado'}
   - Análise: [fundamentar por que o indeferimento é injusto]
   ` : 'Não houve requerimento administrativo prévio'}

F) SITUAÇÕES ESPECIAIS (se houver)
   [Listar situações especiais detectadas]

═══════════════════════════════════════════════════════════

IV. ⚖️ **DO DIREITO (FUNDAMENTAÇÃO LEGAL COMPLETA)**

A) BASE LEGAL PRINCIPAL
   
   1. Lei 8.213/91:
      - Art. 11, VII: Define segurada especial
      - Art. 39: Prova material início de prova + testemunhal
      - Art. 71: Salário-maternidade (120 dias)
      - Art. 71, §3º: DIB retroativa (até 120 dias antes do parto)
   
   2. Decreto 3.048/99:
      - Art. 93: Salário-maternidade para segurada especial
      - Art. 106: Prova do exercício da atividade rural
   
   3. Instrução Normativa 128/2022 INSS:
      - Procedimento administrativo para concessão

B) JURISPRUDÊNCIAS APLICÁVEIS
   
   ${selectedJurisprudencias?.length > 0 ? 
     selectedJurisprudencias.map((j: any) => `
     📚 JURISPRUDÊNCIA: ${j.tese || j.ementa}
     Processo: ${j.processo_numero || 'não informado'}
     Tribunal: ${j.tribunal}
     Ementa: ${j.ementa || 'não informada'}
     Relevância: Esta jurisprudência fundamenta [explicar aplicação ao caso]
     `).join('\n\n') 
     : 'Incluir jurisprudências aplicáveis'}

C) ARGUMENTAÇÃO PERSUASIVA (usar técnicas de PNL)
   - Anáforas, metáforas jurídicas
   - Apelos à dignidade da pessoa humana
   - Princípio da proteção social
   - Função social da previdência

═══════════════════════════════════════════════════════════

V. 🗂️ **DAS PROVAS (DOCUMENTOS ANEXADOS)**

Lista completa dos ${documents?.length || 0} documentos:

${documents?.map((d, i) => `
${i+1}. ${d.document_type.toUpperCase()} (${d.file_name})
   - Comprova: [explicar com base nas extrações o que esse documento prova]
   - Relevância: [mostrar por que é essencial para o caso]
`).join('\n')}

Explicar como o CONJUNTO de documentos forma um todo probatório robusto.

═══════════════════════════════════════════════════════════

VI. 📋 **DOS PEDIDOS (ESTRUTURA COMPLETA)**

A) TUTELA DE URGÊNCIA (Art. 300, CPC)

   A.1) PROBABILIDADE DO DIREITO:
        - Documentação robusta comprova qualidade de segurada
        - Evento (parto) é fato incontroverso (certidão)
        - Jurisprudência consolidada é favorável
        - [fundamentar com base nas provas e análise]
   
   A.2) PERIGO DE DANO / RISCO AO RESULTADO ÚTIL:
        - Autora sem renda para sustento do filho
        - Situação de vulnerabilidade social
        - Necessidade imediata de recursos para alimentação/cuidados
        - Demora na tramitação ordinária causaria dano irreparável
   
   A.3) PEDIDO:
        Conceder TUTELA DE URGÊNCIA para implantar IMEDIATAMENTE o benefício,
        no valor de R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref},
        até o trânsito em julgado da decisão.

B) PEDIDO PRINCIPAL

   B.1) Concessão do SALÁRIO-MATERNIDADE (Art. 71, Lei 8.213/91)
   
   B.2) Data de Início do Benefício (DIB):
        ${caseData.child_birth_date ? 
          `${caseData.child_birth_date} (ou 120 dias retroativos se requerimento posterior)` :
          'Data do parto/adoção'}
   
   B.3) Renda Mensal Inicial (RMI):
        R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
        Base de cálculo: ${analysis?.rmi?.base_calculo || 'Salário mínimo vigente'}
   
   B.4) Parcelas vencidas (120 dias / 4 meses):
        Com juros e correção monetária nos termos da Lei 11.960/09
        (índice IPCA-E + juros de 0,5% ao mês)

C) INVERSÃO DO ÔNUS DA PROVA (Art. 373, §1º, CPC)

   Fundamentos:
   - INSS tem acesso facilitado aos sistemas (CNIS, cadastros internos)
   - Autora é hipossuficiente técnica (não tem como produzir prova negativa)
   - INSS pode facilmente comprovar ou não a existência de vínculos/benefícios
   - Aplicação do princípio da aptidão para a prova

D) HONORÁRIOS ADVOCATÍCIOS (Art. 85, CPC)

   - Sobre o valor da condenação
   - Percentual de 15% a 20% (Súmula 111 STJ)
   - Em caso de acordo, honorários sobre o valor acordado

E) JUSTIÇA GRATUITA (Art. 98, CPC / Lei 1.060/50)

   - Autora não possui condições de arcar com custas processuais
   - Pagamento de custas comprometeria sustento próprio e familiar
   - Declaração de hipossuficiência econômica
   - Princípio do acesso à Justiça (CF, Art. 5º, LXXIV)

═══════════════════════════════════════════════════════════

VII. 💰 **DO VALOR DA CAUSA**

R$ ${analysis?.valor_causa || 'a calcular'}

Base de cálculo: 4 meses × RMI de R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}

═══════════════════════════════════════════════════════════

VIII. 📎 **DOS REQUERIMENTOS FINAIS**

Diante do exposto, requer a Vossa Excelência:

a) A concessão da TUTELA DE URGÊNCIA para implantação imediata do benefício;

b) A citação do INSS para, querendo, apresentar contestação;

c) A intimação da Fazenda Pública (Art. 183, CPC);

d) A produção de todas as provas em direito admitidas, especialmente:
   - Prova documental (já juntada)
   - Prova testemunhal (oitiva de testemunhas)
   - Prova pericial (se necessário)
   - Ofícios a órgãos públicos (escolas, UBS, sindicatos)

e) A inversão do ônus da prova;

f) A PROCEDÊNCIA TOTAL DOS PEDIDOS para:
   - Concessão do salário-maternidade
   - Pagamento das parcelas vencidas com juros e correção
   - Honorários advocatícios sobre condenação (15-20%)
   - Concessão de justiça gratuita

g) A intimação pessoal de todos os atos processuais.

═══════════════════════════════════════════════════════════

Nestes termos,
Pede deferimento.

[LOCAL], [DATA ATUAL]

[NOME DO ADVOGADO]
OAB/[UF] XXXXX

**CHECKLIST DE QUALIDADE OBRIGATÓRIO:**

Você DEVE incluir TODOS estes elementos (se faltar algum, a petição está INCOMPLETA):

✅ Endereçamento correto (VARA/SUBSEÇÃO do município)
✅ Qualificação COMPLETA da autora (nome, nacionalidade, estado civil, RG, CPF, endereço COMPLETO, telefone)
✅ Qualificação COMPLETA do INSS (nome, CNPJ, agência local, endereço completo)
✅ Nome da ação ("AÇÃO DE CONCESSÃO DE SALÁRIO-MATERNIDADE")
✅ Fatos narrados CRONOLOGICAMENTE e DETALHADAMENTE
✅ Perfil da segurada explicado
✅ Atividade rural descrita (onde, quando, com quem, o que produzia)
✅ Evento gerador com data (parto/adoção)
✅ RA mencionado (se houver) com protocolo e motivo do indeferimento
✅ Direito fundamentado COMPLETAMENTE (leis + decretos + INs)
✅ Jurisprudências CITADAS com número do processo
✅ Argumentação persuasiva (uso de PNL, anáforas, metáforas)
✅ TODAS as provas listadas e explicadas individualmente
✅ Pedido de TUTELA DE URGÊNCIA (probabilidade + perigo de dano)
✅ Pedido PRINCIPAL (concessão do benefício)
✅ INVERSÃO DO ÔNUS DA PROVA fundamentada
✅ HONORÁRIOS ADVOCATÍCIOS (15-20% sobre condenação)
✅ JUSTIÇA GRATUITA fundamentada
✅ VALOR DA CAUSA calculado (4 meses × RMI)
✅ REQUERIMENTOS FINAIS completos (citação, intimação, produção de provas, procedência)
✅ Local, data e assinatura do advogado

**SE ALGUM DESSES ELEMENTOS ESTIVER FALTANDO, A PETIÇÃO NÃO ESTÁ PRONTA!**

**LEMBRE-SE:**
🎓 Você é uma ADVOGADA ESPECIALISTA com 20 ANOS DE EXPERIÊNCIA em Direito Previdenciário.
⚖️ Esta petição pode MUDAR A VIDA da cliente e de seu filho.
📝 Seja PROFISSIONAL, PERSUASIVA, COMPLETA e TECNICAMENTE IMPECÁVEL.
💪 Use TODA sua expertise para convencer o juiz da JUSTIÇA desse pedido.

**IMPORTANTE:**
- NÃO invente informações
- Use APENAS dados fornecidos
- Se faltar algo, mencione "a ser comprovado" ou "conforme documento anexo"

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
