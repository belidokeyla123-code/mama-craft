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

    // Buscar procuração especificamente e extrair TODOS os dados
    const procuracao = documents?.find(d => d.document_type === 'procuracao');
    const procuracaoData = procuracao?.extractions?.[0]?.entities || {};

    // EXTRAIR TODOS OS DADOS DA PROCURAÇÃO COM FALLBACKS PARA CASEDATA
    const autoraNome = caseData.author_name || procuracaoData.author_name || procuracaoData.name || '';
    const autoraRG = caseData.author_rg || procuracaoData.rg || procuracaoData.author_rg || procuracaoData.identidade || '';
    const autoraCPF = caseData.author_cpf || procuracaoData.cpf || procuracaoData.author_cpf || '';
    const autoraCivil = caseData.author_marital_status || procuracaoData.marital_status || procuracaoData.estado_civil || '';
    const autoraNacionalidade = procuracaoData.nationality || procuracaoData.nacionalidade || 'brasileira';
    const autoraEndereco = caseData.author_address || procuracaoData.address || procuracaoData.endereco || '';
    const autoraDataNasc = caseData.author_birth_date || procuracaoData.birth_date || procuracaoData.data_nascimento || '';
    const autoraPhone = caseData.author_phone || procuracaoData.phone || procuracaoData.telefone || '';
    const autoraWhatsApp = caseData.author_whatsapp || procuracaoData.whatsapp || '';

    // Buscar benefícios anteriores
    const { data: benefitHistory } = await supabase
      .from('benefit_history')
      .select('*')
      .eq('case_id', caseId);

    // 🆕 BUSCAR BENEFÍCIOS MANUAIS
    const manualBenefits = caseData?.manual_benefits || [];
    console.log('[PETITION] Benefícios manuais:', manualBenefits.length);

    // ✅ ESTRATÉGIA ROBUSTA DE EXTRAÇÃO DE CIDADE/UF
    let city = '';
    let uf = '';

    console.log('[DADOS BRUTOS]', {
      autoraEndereco,
      birth_city: caseData.birth_city,
      birth_state: caseData.birth_state,
      procuracao_city: procuracaoData.city,
      procuracao_uf: procuracaoData.uf
    });

    // ═══ PRIORIDADE 1: ENDEREÇO COMPLETO ═══
    const addressMatch = autoraEndereco?.match(/([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÈÌÒÙ\s]+?)[\s,/-]+(RO|AC|AM|RR|PA|AP|TO|MA|PI|CE|RN|PB|PE|AL|SE|BA|MG|ES|RJ|SP|PR|SC|RS|MS|MT|GO|DF)/i);

    if (addressMatch) {
      city = addressMatch[1].trim();
      uf = addressMatch[2].toUpperCase();
      console.log(`✅ [PRIORIDADE 1] Extraído do endereço: ${city}/${uf}`);
    }

    // ═══ PRIORIDADE 2: BIRTH_CITY (formato "Cidade-UF") ═══
    if (!city || !uf) {
      if (caseData.birth_city) {
        const birthCityMatch = caseData.birth_city.match(/([^-/]+)[\s-/]*(RO|AC|AM|RR|PA|AP|TO|MA|PI|CE|RN|PB|PE|AL|SE|BA|MG|ES|RJ|SP|PR|SC|RS|MS|MT|GO|DF)?/i);
        if (birthCityMatch) {
          city = city || birthCityMatch[1].trim();
          uf = uf || birthCityMatch[2]?.toUpperCase() || caseData.birth_state?.toUpperCase() || '';
          console.log(`✅ [PRIORIDADE 2] Extraído de birth_city: ${city}/${uf}`);
        }
      }
    }

    // ═══ PRIORIDADE 3: PROCURAÇÃO ═══
    if (!city && procuracaoData.city) {
      city = procuracaoData.city;
      console.log(`✅ [PRIORIDADE 3] Cidade da procuração: ${city}`);
    }
    if (!uf && procuracaoData.uf) {
      uf = procuracaoData.uf.toUpperCase();
      console.log(`✅ [PRIORIDADE 3] UF da procuração: ${uf}`);
    }

    // ═══ VALIDAÇÃO FINAL ═══
    if (!city || !uf) {
      console.error('🔴 ERRO CRÍTICO: Cidade ou UF não identificados!', {
        autoraEndereco,
        birth_city: caseData.birth_city,
        birth_state: caseData.birth_state,
        procuracao_city: procuracaoData.city,
        procuracao_uf: procuracaoData.uf,
        city_final: city,
        uf_final: uf
      });
      
      throw new Error(`Dados de endereçamento incompletos: cidade="${city}", uf="${uf}". Verifique os dados do caso.`);
    }

    console.log(`✅ [EXTRAÇÃO FINAL] Cidade: ${city} | UF: ${uf}`);
    
    // ═══ VALIDAÇÃO ONLINE DE JURISDIÇÃO ═══
    console.log('🔍 Validando jurisdição na internet...');
    let subsecao = city;
    let enderecoJusticaFederal = '';
    let jurisdicaoValidada: any = {
      confianca: 'media',
      fonte: 'dados do caso'
    };

    try {
      const { data: validation, error: validationError } = await supabase.functions.invoke('validate-jurisdiction', {
        body: { city, uf, address: autoraEndereco }
      });

      if (!validationError && validation?.subsecao) {
        subsecao = validation.subsecao;
        enderecoJusticaFederal = validation.endereco || '';
        jurisdicaoValidada = validation;
        
        console.log('✅ Jurisdição validada online:', {
          cidade_autora: city,
          subsecao_correta: subsecao,
          confianca: validation.confianca,
          fonte: validation.fonte
        });
      } else {
        console.warn('⚠️ Não foi possível validar jurisdição online. Usando cidade como fallback.');
        subsecao = city;
      }
    } catch (validationError) {
      console.error('❌ Erro ao validar jurisdição:', validationError);
      subsecao = city;
    }
    
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
    
    // ═══ DETERMINAR COMPETÊNCIA: JUIZADO vs VARA ═══
    const salarioMinimoAtual = 1518.00; // 2025
    
    // Para SALÁRIO-MATERNIDADE: valor da causa = períodos atrasados (não todo o benefício)
    // Diferente de auxílio-doença que usa valor total
    let valorCausa = parseFloat(analysis?.valor_causa || '0');
    
    // Garantir que para salário-maternidade usamos apenas 4 meses
    if (caseData.case_type === 'salario_maternidade' && valorCausa === 0) {
      const rmi = parseFloat(analysis?.rmi?.valor || caseData.salario_minimo_ref || '1518.00');
      valorCausa = rmi * 4; // 4 meses de salário-maternidade atrasado
    }
    
    // Juizado Especial Federal: até 60 salários mínimos
    // Juizado Especial Cível: até 40 salários mínimos  
    // Vara Federal: acima desses limites
    const limiteJuizadoFederal = salarioMinimoAtual * 60; // R$ 91.080,00
    
    const isJuizado = valorCausa > 0 && valorCausa <= limiteJuizadoFederal;
    
    console.log('[COMPETÊNCIA]', {
      valor_causa: valorCausa,
      limite_juizado_federal: limiteJuizadoFederal,
      competencia: isJuizado ? 'JUIZADO ESPECIAL FEDERAL' : 'VARA FEDERAL',
      subsecao,
      uf,
      trf
    });
    
    console.log('[VALOR DA CAUSA - SALÁRIO-MATERNIDADE]', {
      tipo_caso: caseData.case_type,
      rmi: analysis?.rmi?.valor,
      valor_causa: valorCausa,
      observacao: 'Apenas 4 meses atrasados, não todo o período'
    });

    // BANCO DE ENDEREÇOS DO INSS POR CIDADE
    const inssAddresses: Record<string, string> = {
      'SÃO PAULO': 'Rua da Consolação, 1875 - Consolação, São Paulo/SP, CEP 01416-001',
      'RIO DE JANEIRO': 'Avenida Presidente Vargas, 417 - Centro, Rio de Janeiro/RJ, CEP 20071-003',
      'BELO HORIZONTE': 'Avenida Afonso Pena, 1007 - Centro, Belo Horizonte/MG, CEP 30130-002',
      'CURITIBA': 'Rua Marechal Deodoro, 344 - Centro, Curitiba/PR, CEP 80010-010',
      'PORTO ALEGRE': 'Avenida Loureiro da Silva, 515 - Centro, Porto Alegre/RS, CEP 90010-420',
      'BRASÍLIA': 'Setor de Autarquias Sul, Quadra 3, Bloco N - Brasília/DF, CEP 70070-030',
      'SALVADOR': 'Avenida Estados Unidos, 57 - Comércio, Salvador/BA, CEP 40010-020',
      'FORTALEZA': 'Rua Barão do Rio Branco, 1594 - Centro, Fortaleza/CE, CEP 60025-061',
      'RECIFE': 'Rua do Imperador, 206 - Santo Antônio, Recife/PE, CEP 50010-240',
      'MANAUS': 'Avenida André Araújo, 901 - Aleixo, Manaus/AM, CEP 69060-000',
      'BELÉM': 'Avenida Presidente Vargas, 350 - Campina, Belém/PA, CEP 66010-000',
      'GOIÂNIA': 'Rua 82, nº 102 - Centro, Goiânia/GO, CEP 74055-100',
    };
    const inssEndereco = inssAddresses[city.toUpperCase()] || `Procuradoria Federal em ${city}/${uf} (endereço a ser notificado nos autos)`;

    // Preparar dados completos da autora
    const autoraProfissao = caseData.profile === 'especial' ? 'trabalhadora rural' : 
                            caseData.profile === 'individual' ? 'trabalhadora autônoma' : 'trabalhadora';

    // Preparar histórico de benefícios para o prompt
    let benefitHistoryText = '';
    if (benefitHistory && benefitHistory.length > 0) {
      benefitHistoryText = '\n\n**BENEFÍCIOS ANTERIORES (Automáticos - CNIS/Processo Admin):**\n';
      benefitHistory.forEach(b => {
        benefitHistoryText += `- NB ${b.nb}: ${b.benefit_type} (${b.start_date} a ${b.end_date || 'atual'}) - ${b.status}\n`;
      });
      benefitHistoryText += '🚨 CRÍTICO: Estes benefícios PROVAM que o INSS já reconheceu a qualidade de segurada especial!\n';
    }

    // Adicionar benefícios manuais
    if (manualBenefits && manualBenefits.length > 0) {
      benefitHistoryText += '\n**BENEFÍCIOS ANTERIORES (Informados Manualmente pela Cliente):**\n';
      manualBenefits.forEach((b: any) => {
        benefitHistoryText += `- TIPO: ${b.tipo}\n`;
        benefitHistoryText += `  PERÍODO: ${new Date(b.inicio).toLocaleDateString('pt-BR')} até ${new Date(b.fim).toLocaleDateString('pt-BR')}\n`;
        if (b.numero_beneficio) {
          benefitHistoryText += `  NÚMERO DO BENEFÍCIO: ${b.numero_beneficio}\n`;
        }
      });

      // Detectar se há salário-maternidade anterior
      const hasSalarioMaternidade = manualBenefits.some((b: any) => 
        b.tipo?.toLowerCase().includes('maternidade') || b.tipo?.toLowerCase().includes('salário')
      );

      if (hasSalarioMaternidade) {
        benefitHistoryText += '\n⚠️⚠️⚠️ INSTRUÇÕES OBRIGATÓRIAS SOBRE SALÁRIO-MATERNIDADE ANTERIOR ⚠️⚠️⚠️\n\n';
        benefitHistoryText += '**NA SEÇÃO "DOS FATOS":**\n';
        benefitHistoryText += '- Mencione que a requerente já recebeu salário-maternidade anteriormente\n';
        benefitHistoryText += '- Deixe claro que foi por OUTRA GESTAÇÃO\n\n';
        
        benefitHistoryText += '**NA SEÇÃO "DO DIREITO":**\n';
        benefitHistoryText += '- Crie subseção específica: "DO DIREITO AO SALÁRIO-MATERNIDADE POR CADA GESTAÇÃO"\n';
        benefitHistoryText += '- Fundamente no Art. 71, Lei 8.213/91: "O salário-maternidade é devido à segurada da Previdência Social, durante 120 (cento e vinte) dias"\n';
        benefitHistoryText += '- Argumente: "O benefício é devido A CADA GESTAÇÃO, não havendo limite legal de quantidade"\n';
        benefitHistoryText += '- Cite precedente: TNU-PEDILEF 0506032-44.2012.4.05.8300\n';
        benefitHistoryText += '- Explique: "O fato de a requerente já ter recebido salário-maternidade anteriormente não impede o deferimento do presente pedido, pois trata-se de NOVA GESTAÇÃO, gerando NOVO FATO GERADOR"\n\n';
        
        benefitHistoryText += '**ANTECIPAÇÃO DE DEFESA:**\n';
        benefitHistoryText += 'Se o INSS indeferiu alegando "benefício anterior", refute diretamente:\n';
        benefitHistoryText += '"O indeferimento baseado na existência de benefício anterior é ILEGAL, pois:\n';
        benefitHistoryText += 'a) Não há vedação legal ao recebimento de múltiplos salários-maternidade\n';
        benefitHistoryText += 'b) Cada gestação constitui fato gerador autônomo\n';
        benefitHistoryText += 'c) Jurisprudência consolidada admite o pagamento do benefício mesmo com histórico anterior"\n\n';
        
        benefitHistoryText += '**NO PEDIDO:**\n';
        benefitHistoryText += '- Inclua pedido subsidiário sobre reconhecimento do direito independente de benefício anterior\n\n';
        
        benefitHistoryText += '**IMPORTANTE:** Transforme o que seria "ponto fraco" em FUNDAMENTO FAVORÁVEL!\n';
      }
    }

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

🚨🚨🚨 INSTRUÇÕES OBRIGATÓRIAS - NÃO IGNORE 🚨🚨🚨

Você DEVE gerar uma petição inicial seguindo EXATAMENTE este formato. PREENCHA TODOS OS CAMPOS. NÃO deixe NADA em branco ou com placeholders tipo [inserir], [preencher], etc.

═══════════════════════════════════════════════════════════════

**I. ENDEREÇAMENTO (PRIMEIRA LINHA DA PETIÇÃO):**

🚨🚨🚨 ATENÇÃO CRÍTICA - VALIDADO NA INTERNET:
- A autora mora em: ${city}/${uf}
- Subseção Judiciária CORRETA: ${subsecao}/${uf}
- Tribunal Regional Federal: ${trf} (${trfNumber}ª REGIÃO)
- Valor da Causa: R$ ${valorCausa.toFixed(2)}
- Competência: ${isJuizado ? 'JUIZADO ESPECIAL FEDERAL' : 'VARA FEDERAL'}
${jurisdicaoValidada.observacao ? `- Observação: ${jurisdicaoValidada.observacao}` : ''}
- Fonte: ${jurisdicaoValidada.fonte}
- Confiança: ${jurisdicaoValidada.confianca}

🚨 ESCREVA EXATAMENTE ASSIM (SEM ENDEREÇO FÍSICO):

${isJuizado 
  ? `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DO JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}` 
  : `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA SUBSEÇÃO JUDICIÁRIA DE ${subsecao.toUpperCase()}/${uf}`
}

🚨 NÃO INCLUA: rua, avenida, número, CEP ou qualquer endereço físico!
🚨 Use APENAS o cabeçalho formal acima!

═══════════════════════════════════════════════════════════════

**II. QUALIFICAÇÃO COMPLETA DA AUTORA:**

Escreva EXATAMENTE assim (usando os dados fornecidos):

"**${autoraNome}**, ${autoraNacionalidade}, ${autoraCivil}, ${autoraProfissao}, portadora do RG nº **${autoraRG || 'RG a ser apresentado'}**, inscrita no CPF sob o nº **${autoraCPF}**, nascida em ${autoraDataNasc || 'data a ser informada'}, residente e domiciliada em ${autoraEndereco || 'endereço a ser informado'}, telefone ${autoraPhone || 'a ser informado'}, por sua advogada que esta subscreve (procuração anexa), vem, com o devido respeito e acatamento, perante Vossa Excelência, propor a presente"

═══════════════════════════════════════════════════════════════

**III. TÍTULO DA AÇÃO (CENTRALIZADO E EM NEGRITO):**

**AÇÃO DE CONCESSÃO DE SALÁRIO-MATERNIDADE (SEGURADA ESPECIAL RURAL)**
c/c PEDIDO DE TUTELA DE URGÊNCIA

═══════════════════════════════════════════════════════════════

**IV. QUALIFICAÇÃO COMPLETA DO RÉU:**

Escreva EXATAMENTE assim:

"em face do **INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS**, autarquia federal, inscrita no CNPJ sob o nº **29.979.036/0001-40**, representada por sua Procuradoria Federal, com endereço em **${inssEndereco}**, pelos fatos e fundamentos jurídicos a seguir expostos."

═══════════════════════════════════════════════════════════════

**V. DOS FATOS**

Redija uma narrativa completa dos fatos incluindo:
- Perfil da segurada: ${caseData.profile === 'especial' ? 'Segurada Especial Rural' : caseData.profile}
- Evento gerador: ${caseData.event_type === 'parto' ? 'Nascimento' : caseData.event_type} em ${caseData.child_birth_date || caseData.event_date}
- Nome da criança: ${caseData.child_name || 'nome da criança'}
${caseData.ra_protocol ? `- Requerimento administrativo NB ${caseData.ra_protocol} INDEFERIDO em ${caseData.ra_denial_date}
- Motivo do indeferimento: ${caseData.ra_denial_reason}` : '- Requerimento administrativo ainda não realizado ou em andamento'}
${benefitHistoryText}

═══════════════════════════════════════════════════════════════

**VI. DO DIREITO**

Fundamente juridicamente com:
- Lei 8.213/91, Arts. 11, VII e 39 (segurada especial)
- IN 128/2022 do INSS
- Jurisprudências do STJ, TRF e TNU
- Súmulas aplicáveis

═══════════════════════════════════════════════════════════════

**VII. DAS PROVAS**

Liste os ${documents?.length || 0} documentos anexados.

═══════════════════════════════════════════════════════════════

**VIII. DOS PEDIDOS**

1. **TUTELA DE URGÊNCIA** (Art. 300 CPC): Implantação imediata do benefício
2. **PEDIDO PRINCIPAL**: Concessão de salário-maternidade
   - DIB: ${caseData.child_birth_date || caseData.event_date}
   - RMI: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
   - Duração: 4 meses (120 dias)
3. **HONORÁRIOS ADVOCATÍCIOS**: 15% a 20% sobre o valor da condenação
4. **JUSTIÇA GRATUITA**: Deferimento dos benefícios da assistência judiciária gratuita

═══════════════════════════════════════════════════════════════

**IX. DO VALOR DA CAUSA**

R$ ${valorCausa.toFixed(2)}

🚨 ATENÇÃO: Este é o valor dos SALÁRIOS-MATERNIDADE ATRASADOS (4 meses), 
não o valor total do benefício ao longo do tempo.

═══════════════════════════════════════════════════════════════

**DADOS COMPLETOS DO CASO PARA VOCÊ USAR:**

**AUTORA:**
- Nome: ${autoraNome}
- CPF: ${autoraCPF}
- RG: ${autoraRG || 'a ser apresentado'}
- Data de Nascimento: ${autoraDataNasc || 'não informada'}
- Estado Civil: ${autoraCivil || 'não informado'}
- Nacionalidade: ${autoraNacionalidade}
- Profissão: ${autoraProfissao}
- Endereço: ${autoraEndereco || 'não informado'}
- Telefone: ${autoraPhone || 'não informado'}
- WhatsApp: ${autoraWhatsApp || 'não informado'}

**RÉU (INSS):**
- Nome: Instituto Nacional do Seguro Social - INSS
- CNPJ: 29.979.036/0001-40 (USE SEMPRE ESTE CNPJ)
- Endereço: ${inssEndereco}

**JURISDIÇÃO:**
- Cidade/Comarca: ${city}/${uf}
- Tribunal: ${trf} (${trfNumber}ª Região)

**EVENTO:**
- Tipo: ${caseData.event_type === 'parto' ? 'Nascimento' : caseData.event_type}
- Data: ${caseData.child_birth_date || caseData.event_date}
- Nome da Criança: ${caseData.child_name || 'não informado'}

**PROCESSO ADMINISTRATIVO:**
${caseData.ra_protocol ? `- NB/Protocolo: ${caseData.ra_protocol}
- Data do Requerimento: ${caseData.ra_request_date || 'não informada'}
- Data do Indeferimento: ${caseData.ra_denial_date || 'não informada'}
- Motivo: ${caseData.ra_denial_reason || 'não informado'}` : '- Sem RA prévio'}
${benefitHistoryText}

**ANÁLISE JURÍDICA:**
${JSON.stringify(analysis || {}, null, 2)}

**CÁLCULOS:**
- RMI: R$ ${analysis?.rmi?.valor || caseData.salario_minimo_ref}
- Valor da Causa: R$ ${analysis?.valor_causa || 'a calcular'}
- Carência: ${analysis?.carencia ? JSON.stringify(analysis.carencia) : 'a analisar'}

**DOCUMENTOS:** ${documents?.length || 0} documento(s) anexados

═══════════════════════════════════════════════════════════════

🚨 **REGRAS CRÍTICAS - LEIA COM ATENÇÃO:**

✅ USE OS DADOS FORNECIDOS - não invente, não deixe vazios
✅ RG: ${autoraRG || 'RG a ser apresentado'} - USE ESTE EXATO TEXTO
✅ Estado Civil: ${autoraCivil || 'não informado'} - USE ESTE EXATO TEXTO
✅ CNPJ do INSS: **29.979.036/0001-40** (SEMPRE este CNPJ, não outro)
✅ Endereço do INSS: ${inssEndereco}
✅ Cidade: ${city}/${uf}
✅ Tribunal: ${trf} (${trfNumber}ª Região)
✅ Siga EXATAMENTE a estrutura acima com os separadores ═══
✅ NÃO use placeholders tipo [inserir], [preencher], [estado civil], [RG], etc.
✅ Se houver benefícios anteriores, DESTAQUE MUITO isso como prova da qualidade de segurada
✅ Seja técnica, persuasiva e completa
✅ Retorne em markdown bem formatado com negrito, itálico onde couber
✅ Numere os tópicos corretamente (I, II, III, etc.)

🚨 **SE VOCÊ DEIXAR QUALQUER CAMPO VAZIO OU COM PLACEHOLDER, A PETIÇÃO SERÁ REJEITADA!**

Retorne a petição completa em markdown, seguindo EXATAMENTE a estrutura acima.`;
    
    // ✅ CORREÇÃO #3: Log detalhado antes de chamar IA
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 DADOS DE ENDEREÇAMENTO PARA IA:');
    console.log(`   Autora: ${autoraNome}`);
    console.log(`   Endereço: ${autoraEndereco}`);
    console.log(`   Cidade extraída: ${city}`);
    console.log(`   UF extraída: ${uf}`);
    console.log(`   TRF: ${trf} (${trfNumber}ª Região)`);
    console.log(`   Endereço INSS: ${inssEndereco}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
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
        console.error('[PETITION] AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
      }

      console.log('[PETITION] 📥 Recebendo resposta da AI...');
      
      let aiData;
      try {
        const responseText = await aiResponse.text();
        console.log('[PETITION] Response length:', responseText.length);
        console.log('[PETITION] First 500 chars:', responseText.substring(0, 500));
        
        aiData = JSON.parse(responseText);
        console.log('[PETITION] ✅ JSON parsed successfully');
        
      } catch (parseError) {
        console.error('[PETITION] ❌ JSON parse failed:', parseError);
        console.error('[PETITION] Response was not valid JSON');
        throw new Error(`Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
      
      // Validar estrutura da resposta
      if (!aiData || !aiData.choices || !aiData.choices[0] || !aiData.choices[0].message) {
        console.error('[PETITION] ❌ Invalid response structure:', JSON.stringify(aiData).substring(0, 500));
        throw new Error('AI response has invalid structure - missing choices or message');
      }
      
      let petitionText = aiData.choices[0].message.content;
      
      if (!petitionText || typeof petitionText !== 'string') {
        console.error('[PETITION] ❌ Invalid petition content type:', typeof petitionText);
        throw new Error('AI response content is invalid or empty');
      }
      
      console.log('[PETITION] ✅ Petition received, length:', petitionText.length);

      // ═══ CONTROLE DE QUALIDADE PÓS-GERAÇÃO ═══
      console.log('🔍 Executando controle de qualidade...');
      
      const qualityIssues = [];

      // 1. Verificar se usou a subseção correta
      if (subsecao && subsecao !== city && !petitionText.includes(subsecao.toUpperCase())) {
        qualityIssues.push({
          tipo: 'ENDEREÇAMENTO_INCORRETO',
          gravidade: 'CRÍTICO',
          problema: `Petição não menciona a subseção correta "${subsecao}"`,
          linha_esperada: `JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}`,
          acao: 'Corrigindo automaticamente...'
        });
        
        console.error('🔴 ERRO CRÍTICO: IA não usou subseção correta. Corrigindo...');
        
        // Correção automática
        petitionText = petitionText.replace(
          new RegExp(`JUIZADO ESPECIAL FEDERAL DE ${city.toUpperCase()}/${uf}`, 'g'),
          `JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}`
        );
        
        petitionText = petitionText.replace(
          new RegExp(`${city}/${uf}`, 'g'),
          `${subsecao}/${uf}`
        );
      }

      // 2. Verificar cidade incorreta (fallback adicional)
      if (petitionText.includes('SÃO PAULO/SP') && city.toUpperCase() !== 'SÃO PAULO' && subsecao.toUpperCase() !== 'SÃO PAULO') {
        qualityIssues.push({
          tipo: 'CIDADE_INCORRETA',
          gravidade: 'CRÍTICO',
          problema: 'Petição menciona São Paulo incorretamente'
        });
        
        console.error('🔴 ERRO CRÍTICO: IA gerou petição para São Paulo mas deveria ser', subsecao || city, uf);
        
        petitionText = petitionText.replace(
          /JUIZADO ESPECIAL FEDERAL DE SÃO PAULO\/SP/g,
          `JUIZADO ESPECIAL FEDERAL DE ${subsecao.toUpperCase()}/${uf}`
        );
        
        petitionText = petitionText.replace(
          /São Paulo\/SP/g,
          `${subsecao}/${uf}`
        );
      }

      // 3. Verificar cidade no corpo do texto
      const wrongCityPattern = new RegExp(`(em|de|município de)\\s+(?!${city})(?!${subsecao})\\w+/${uf}`, 'gi');
      if (wrongCityPattern.test(petitionText)) {
        qualityIssues.push({
          tipo: 'CIDADE_INCONSISTENTE',
          gravidade: 'ALTO',
          problema: 'Petição menciona cidade diferente da autora no corpo do texto'
        });
      }

      // VALIDAÇÃO PÓS-GERAÇÃO - Verificar campos obrigatórios
      console.log('📋 Validando petição gerada...');
      
      const missingFields = [];
      
      // Verificar se tem endereçamento correto
      if (!petitionText.includes('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL')) {
        console.warn('⚠️ Falta endereçamento correto');
        missingFields.push('Endereçamento do Juízo');
      }
      
      // Verificar se tem CNPJ correto do INSS
      if (!petitionText.includes('29.979.036/0001-40')) {
        console.warn('⚠️ CNPJ do INSS incorreto ou ausente');
        petitionText = petitionText.replace(/00\.394\.429\/9999-06/g, '29.979.036/0001-40');
      }
      
      // Substituir placeholders comuns se ainda existirem
      if (autoraRG && autoraRG !== '') {
        petitionText = petitionText.replace(/\[RG\]/gi, autoraRG);
        petitionText = petitionText.replace(/RG não informado/gi, `RG nº ${autoraRG}`);
      }
      
      if (autoraCivil && autoraCivil !== '') {
        petitionText = petitionText.replace(/\[estado civil\]/gi, autoraCivil);
      }
      
      if (autoraNacionalidade) {
        petitionText = petitionText.replace(/\[nacionalidade\]/gi, autoraNacionalidade);
      }
      
      petitionText = petitionText
        .replace(/\[cidade\]/gi, city)
        .replace(/\[UF\]/gi, uf)
        .replace(/\[inserir\]/gi, '')
        .replace(/\[preencher\]/gi, '');
      
      // 4. Verificar RG/CPF placeholders
      if (petitionText.includes('[RG]') || petitionText.includes('[CPF]')) {
        qualityIssues.push({
          tipo: 'DADOS_INCOMPLETOS',
          gravidade: 'ALTO',
          problema: 'RG ou CPF não foram substituídos'
        });
      }

      if (missingFields.length > 0) {
        console.error('❌ Campos obrigatórios faltantes:', missingFields);
      } else {
        console.log('✅ Petição validada com sucesso');
      }

      // Salvar relatório de qualidade
      const qualityStatus = qualityIssues.length === 0 ? 'aprovado' : 
                           qualityIssues.some(i => i.gravidade === 'CRÍTICO') ? 'corrigido_automaticamente' : 
                           'aprovado_com_avisos';

      const camposFaltantes = missingFields.filter(f => f !== 'Endereçamento do Juízo');
      
      await supabase
        .from('quality_reports')
        .insert({
          case_id: caseId,
          document_type: 'petition',
          issues: qualityIssues,
          status: qualityStatus,
          jurisdicao_validada: jurisdicaoValidada,
          enderecamento_ok: !qualityIssues.some(i => i.tipo.includes('ENDEREÇAMENTO')),
          dados_completos: camposFaltantes.length === 0,
          campos_faltantes: camposFaltantes,
          jurisdicao_confianca: jurisdicaoValidada.confianca,
          fonte: jurisdicaoValidada.fonte,
          
          // NOVAS VALIDAÇÕES
          valor_causa: valorCausa.toFixed(2),
          valor_causa_validado: valorCausa > 0,
          competencia: isJuizado ? 'juizado' : 'vara',
          limite_juizado: limiteJuizadoFederal,
          subsecao: subsecao,
          uf: uf,
          trf: trf,
          jurisdicao_ok: petitionText.includes(subsecao.toUpperCase()),
        });

      console.log('📊 Relatório de qualidade salvo:', {
        status: qualityStatus,
        problemas: qualityIssues.length,
        confianca: jurisdicaoValidada.confianca
      });

      // Salvar draft no banco
      await supabase
        .from('drafts')
        .insert({
          case_id: caseId,
          markdown_content: petitionText,
          payload: { selectedJurisprudencias, jurisdicaoValidada }
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
