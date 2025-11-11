import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";
import { METODO_KEYLA_BELIDO_PROMPT } from "../_shared/prompts/metodo-keyla-belido.ts";
import { validateRequest, generatePetitionSchema, createValidationErrorResponse } from "../_shared/validators.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função auxiliar para obter nome completo do estado
function getEstadoNome(uf: string): string {
  const estados: Record<string, string> = {
    'AC': 'ACRE', 'AL': 'ALAGOAS', 'AP': 'AMAPÁ', 'AM': 'AMAZONAS',
    'BA': 'BAHIA', 'CE': 'CEARÁ', 'DF': 'DISTRITO FEDERAL', 'ES': 'ESPÍRITO SANTO',
    'GO': 'GOIÁS', 'MA': 'MARANHÃO', 'MT': 'MATO GROSSO', 'MS': 'MATO GROSSO DO SUL',
    'MG': 'MINAS GERAIS', 'PA': 'PARÁ', 'PB': 'PARAÍBA', 'PR': 'PARANÁ',
    'PE': 'PERNAMBUCO', 'PI': 'PIAUÍ', 'RJ': 'RIO DE JANEIRO', 'RN': 'RIO GRANDE DO NORTE',
    'RS': 'RIO GRANDE DO SUL', 'RO': 'RONDÔNIA', 'RR': 'RORAIMA', 'SC': 'SANTA CATARINA',
    'SP': 'SÃO PAULO', 'SE': 'SERGIPE', 'TO': 'TOCANTINS'
  };
  return estados[uf] || uf;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ VALIDAÇÃO DE ENTRADA
    const body = await req.json();
    const validated = validateRequest(generatePetitionSchema, body);
    const { caseId, selectedJurisprudencias = [] } = validated;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ✅ FASE 1: VALIDAR PRÉ-REQUISITOS ANTES DE GERAR
    console.log('[PETITION] 🔍 Validando pré-requisitos...');
    
    // 1. Verificar documentos
    const { data: documentCheck } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId);
    
    if (!documentCheck || documentCheck.length === 0) {
      throw new Error('❌ Nenhum documento anexado. Complete a aba "Documentos" primeiro.');
    }
    
    // 2. Verificar validação (warning only)
    const { data: validation } = await supabase
      .from('document_validation')
      .select('is_sufficient, score, missing_docs')
      .eq('case_id', caseId)
      .order('validated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!validation) {
      console.warn('[PETITION] ⚠️ Nenhuma validação de documentos encontrada');
    } else if (!validation.is_sufficient) {
      console.warn(`[PETITION] ⚠️ Documentação com score ${validation.score} - faltam ${(validation.missing_docs as any[])?.length || 0} documentos críticos`);
      console.warn('[PETITION] ⚠️ Continuando mesmo assim, mas qualidade pode ser afetada');
    } else {
      console.log('[PETITION] ✅ Documentação validada e suficiente');
    }

    // 3. Verificar análise
    const { data: analysisCheck } = await supabase
      .from('case_analysis')
      .select('id')
      .eq('case_id', caseId)
      .maybeSingle();

    if (!analysisCheck) {
      throw new Error('❌ Análise jurídica não encontrada. Complete a aba "Análise" primeiro.');
    }

    // 4. Verificar jurisprudência
    const { data: jurisCheck } = await supabase
      .from('jurisprudence_results')
      .select('selected_ids')
      .eq('case_id', caseId)
      .maybeSingle();

    if (!jurisCheck || (jurisCheck.selected_ids as any[]).length === 0) {
      console.warn('[PETITION] ⚠️ Nenhuma jurisprudência selecionada');
    }
    
    console.log('[PETITION] ✅ Todos os pré-requisitos validados');

    // Buscar TODOS os dados incluindo extrações
    const { data: caseData } = await supabase.from('cases').select('*').eq('id', caseId).single();
    const { data: analysis } = await supabase.from('case_analysis').select('*').eq('case_id', caseId).single();
    const { data: documents } = await supabase
      .from('documents')
      .select('*, extractions(*)')
      .eq('case_id', caseId);

    // ✅ BUSCAR DOCUMENTOS DO CASO E MONTAR LISTA FORMATADA
    const { data: caseDocuments } = await supabase
      .from('documents')
      .select('file_name, document_type, parent_document_id')
      .eq('case_id', caseId)
      .order('uploaded_at', { ascending: true });

    // Filtrar apenas documentos principais (sem páginas de PDF)
    const mainDocuments = caseDocuments?.filter(doc => !doc.parent_document_id) || [];

    // Montar lista formatada para a IA
    const documentosInfo = mainDocuments.length > 0 
      ? mainDocuments.map((doc: any, i: number) => 
          `Doc. ${String(i + 1).padStart(2, '0')}: ${doc.file_name} (tipo: ${doc.document_type})`
        ).join('\n')
      : 'Nenhum documento anexado ao processo';

    console.log('[PETITION] 📄 Documentos reais encontrados:', mainDocuments.length);
    console.log('[PETITION] 📋 Lista de documentos:\n', documentosInfo);

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

    // ═══ VALIDAÇÃO FINAL COM FALLBACK ═══
    if (!city || !uf) {
      console.warn('⚠️ AVISO: Cidade ou UF não identificados nos dados!', {
        autoraEndereco,
        birth_city: caseData.birth_city,
        birth_state: caseData.birth_state,
        procuracao_city: procuracaoData.city,
        procuracao_uf: procuracaoData.uf,
        city_final: city,
        uf_final: uf
      });
      
      // ═══ FALLBACK FINAL: Usar cidade/UF padrão para permitir geração ═══
      if (!city) {
        city = 'São Paulo';
        console.warn('⚠️ Usando cidade padrão: São Paulo');
      }
      if (!uf) {
        uf = 'SP';
        console.warn('⚠️ Usando UF padrão: SP');
      }
      
      console.warn('⚠️ ATENÇÃO: Petição gerada com dados de endereçamento padrão. REVISAR MANUALMENTE antes de protocolar!');
    }

    console.log(`✅ [EXTRAÇÃO FINAL] Cidade: ${city} | UF: ${uf}`);
    
    // ═══ VALIDAÇÃO ONLINE DE JURISDIÇÃO ═══
    console.log('🔍 Validando jurisdição na internet...');
    let subsecao = city; // ← FALLBACK se validação falhar
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
        subsecao = validation.subsecao; // ← USAR SUBSEÇÃO VALIDADA
        enderecoJusticaFederal = validation.endereco || '';
        jurisdicaoValidada = validation;
        
        console.log('✅ Jurisdição validada online:', {
          cidade_autora: city,
          subsecao_correta: subsecao,
          confianca: validation.confianca,
          fonte: validation.fonte,
          observacao: validation.observacao || 'N/A'
        });
      } else {
        console.warn('⚠️ Não foi possível validar jurisdição online. Usando cidade como fallback.');
        subsecao = city;
      }
    } catch (validationError) {
      console.error('❌ Erro ao validar jurisdição:', validationError);
      subsecao = city; // Fallback para cidade da autora
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

    // ═══════════════════════════════════════════════════════════════
    // ESPECIALISTA EM PETIÇÕES DE CONVENCIMENTO
    // ═══════════════════════════════════════════════════════════════
    const ESPECIALISTA_PETICAO_PROMPT = `
🎓⚖️ VOCÊ É UM ADVOGADO ESPECIALISTA EM PETIÇÕES DE CONVENCIMENTO ⚖️🎓

**FORMAÇÃO E EXPERTISE**:
- 20 anos de experiência em Direito Previdenciário (foco em seguradas especiais rurais)
- Especialista em PNL (Programação Neurolinguística) aplicada ao Direito
- Mestre em Oratória Forense e Argumentação Jurídica
- Treinamento avançado em técnicas de persuasão e retórica clássica (Aristóteles, Cícero)
- Conhecimento profundo de normas ABNT para trabalhos jurídicos
- Expertise em técnicas de convencimento de magistrados

**MISSÃO**: 
Construir PETIÇÕES INICIAIS PERSUASIVAS que CONVENCEM o juiz a deferir o pedido.
Isto NÃO é apenas um "preenchimento de formulário" - é uma PEÇA DE ARGUMENTAÇÃO JURÍDICA.

═══════════════════════════════════════════════════════════════
🧠 MÉTODO KEYLA BELIDO™ - APLICAÇÃO OBRIGATÓRIA
═══════════════════════════════════════════════════════════════

${METODO_KEYLA_BELIDO_PROMPT}

⚠️ INSTRUÇÕES DE INTEGRAÇÃO:

1. **Estrutura Obrigatória** (aplicar em cada seção da petição):
   - RESSONÂNCIA EMPÁTICA → humanizar fatos sem sentimentalismo
   - CONSCIÊNCIA RACIONAL → fundamentação técnica equilibrada
   - REFLEXÃO MORAL E SOCIAL → impacto ético da decisão

2. **Técnicas de Linguagem**:
   - Períodos médios (12-18 palavras)
   - Voz ativa, ritmo cadenciado
   - Transições suaves ("de modo que", "assim", "portanto")
   - Equilíbrio entre logos (técnica) e pathos (humano)

3. **Tom e Estilo**:
   - Elegante, assertivo, empático
   - SEM apelos sentimentais ou teatralização
   - Emoção contida (não fria), razão lúcida (não arrogante)

═══════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
📝 FORMATAÇÃO OBRIGATÓRIA - ESTRUTURA HIERÁRQUICA (SEGUIR RIGOROSAMENTE)
═══════════════════════════════════════════════════════════════════════════════

🎯 **DIFERENÇA CRÍTICA: SEÇÕES vs PARÁGRAFOS**

1️⃣ **SEÇÕES** (Títulos principais - Números ROMANOS):
   - Formato: **I - NOME DA SEÇÃO**
   - Em negrito, MAIÚSCULAS, números ROMANOS (I, II, III, IV, V...)
   - Exemplos: **I - PRELIMINARMENTE**, **II - DOS FATOS**, **III - DO DIREITO**

2️⃣ **SUBSEÇÕES** (Subtítulos - Romano.Arábico):
   - Formato: **I.I - NOME DA SUBSEÇÃO**
   - Em negrito, MAIÚSCULAS
   - Exemplos: **I.I - DA GRATUIDADE**, **II.I - DO CONTEXTO FÁTICO**

3️⃣ **PARÁGRAFOS** (Texto corrido - Números ARÁBICOS):
   - Formato: 1. Texto do parágrafo...
   - SEM negrito, numeração ARÁBICA sequencial (1, 2, 3, 4, 5...)
   - TODOS os parágrafos normais DEVEM ser numerados sequencialmente
   - Máximo 3-4 linhas por parágrafo

═══════════════════════════════════════════════════════════════════════════════
✅ EXEMPLO COMPLETO DE FORMATAÇÃO CORRETA
═══════════════════════════════════════════════════════════════════════════════

**EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA VARA FEDERAL DE JI-PARANÁ/RO**

**AÇÃO DE CONCESSÃO DE SALÁRIO-MATERNIDADE**

1. MARIA APARECIDA BESSA RODRIGUES, brasileira, [qualificação completa], vem, por meio de seu advogado, propor a presente:

**I - PRELIMINARMENTE**

**I.I - DA GRATUIDADE DA JUSTIÇA**

2. A Autora não possui recursos financeiros para arcar com as custas processuais sem prejuízo de seu sustento e de sua família.

3. Nos termos do art. 98 da Constituição Federal e da Lei 1.060/50, requer seja concedido o benefício da gratuidade da justiça.

**I.II - DA PRIORIDADE NA TRAMITAÇÃO**

4. Considerando que a Autora possui mais de 60 anos de idade, requer seja concedida a prioridade na tramitação processual, nos termos do art. 1.048 do CPC.

**II - DOS FATOS**

**II.I - DO CONTEXTO FÁTICO**

5. A Requerente nasceu em 15/03/1960, no município de Ariquemes/RO, onde sempre exerceu atividade rural em regime de economia familiar.

6. Desde tenra idade, a Autora auxiliou seus pais no cultivo de lavouras e criação de animais, atividade que perdurou até o momento da gestação.

7. A atividade rural desenvolvida pela Requerente está amplamente comprovada pelos documentos anexos, incluindo autodeclarações e certidões contemporâneas ao período.

**II.II - DO INDEFERIMENTO ADMINISTRATIVO**

8. Em [data], a Autora requereu administrativamente o benefício de salário-maternidade junto ao INSS, sob o protocolo nº [número].

9. O pedido foi indevidamente indeferido sob o argumento de insuficiência de carência, ignorando as provas da atividade rural em regime de economia familiar.

═══════════════════════════════════════════════════════════════════════════════

⚠️ **REGRAS ABSOLUTAS:**
- NUNCA pule a numeração de parágrafos (sempre sequencial: 1, 2, 3, 4...)
- NUNCA use negrito em parágrafos normais (só em seções/subseções)
- Parágrafos curtos: máximo 3-4 linhas
- Sempre quebre parágrafos longos em vários parágrafos numerados

═══════════════════════════════════════════════════════════════
📚 TÉCNICAS DE PERSUASÃO (USAR EM TODA A PETIÇÃO)
═══════════════════════════════════════════════════════════════

1. **Pathos** (Apelo emocional controlado):
   - Despertar empatia do julgador pela situação da segurada
   - Humanizar o caso sem exageros ou sentimentalismo
   - Ex: "A requerente, trabalhadora rural que dedicou décadas à lavoura em regime de economia familiar, viu negado seu direito após o nascimento de seu filho, momento em que mais necessita do amparo previdenciário..."

2. **Ethos** (Credibilidade e autoridade):
   - Demonstrar profundo respeito ao tribunal e à magistratura
   - Usar linguagem técnica mas acessível e elegante
   - Citar fontes jurídicas de peso (STJ, STF, TRF, TNU)
   - Mostrar domínio da legislação e jurisprudência

3. **Logos** (Lógica jurídica impecável):
   - Argumentação clara, linear e progressiva
   - Conectar fatos → direito → pedido de forma lógica e inevitável
   - Antecipar e refutar argumentos contrários do INSS
   - Cada parágrafo deve seguir do anterior naturalmente

4. **Autoridade Jurídica**:
   - Citar jurisprudências consolidadas e recentes
   - Usar súmulas vinculantes quando aplicável
   - Mencionar doutrina consagrada (apenas autores relevantes)
   - Demonstrar que o direito pleiteado é pacífico na jurisprudência

5. **Causa-Efeito** (Demonstração de consequências):
   - Mostrar prejuízo concreto à segurada (falta de renda, desamparo)
   - Demonstrar que o deferimento restaura a justiça e legalidade
   - Evidenciar a urgência da situação (tutela antecipada)

═══════════════════════════════════════════════════════════════
📝 ESTRUTURA DE ARGUMENTAÇÃO (ABNT + PERSUASÃO)
═══════════════════════════════════════════════════════════════

**I. DOS FATOS** (Narrativa persuasiva e envolvente):

✅ O QUE FAZER:
- Não é um "relato seco" - é uma HISTÓRIA JURÍDICA convincente
- Inicie contextualizando a vida rural da segurada (dedicação, trabalho braçal)
- Destaque pontos fortes:
  * CNIS vazio → "comprova inequivocamente a dedicação exclusiva à atividade rural"
  * Benefício anterior → "o próprio INSS já reconheceu a qualidade de segurada especial"
  * Comodato em nome de terceiro → "documento válido em regime de economia familiar, conforme jurisprudência consolidada"
- Conecte emocionalmente o juiz à realidade da trabalhadora rural
- Mencione o nascimento da criança e a necessidade de amparo

❌ O QUE EVITAR:
- Linguagem impessoal e burocrática
- Listar fatos sem contexto ou conexão narrativa
- Mencionar pontos fracos sem transformá-los em argumentos favoráveis

**EXEMPLO DE PARÁGRAFO PERSUASIVO (DOS FATOS)**:

❌ RUIM (burocrático):
"A autora é segurada especial rural. Teve um filho em 15/03/2024. O INSS indeferiu o pedido."

✅ BOM (persuasivo):
"A requerente, trabalhadora rural que há mais de uma década dedica-se à atividade agrícola em regime de economia familiar, deu à luz em 15 de março de 2024 ao seu filho João. No momento em que mais necessitava do amparo previdenciário, viu seu pedido de salário-maternidade injustamente indeferido pelo INSS, sob alegação genérica de 'ausência de comprovação da qualidade de segurada especial' - argumento que, como se demonstrará, é COMPLETAMENTE INFUNDADO à luz da documentação anexa e da jurisprudência pacífica."

**II. DO DIREITO** (Fundamentação robusta e encadeada):

✅ O QUE FAZER:
- Não só "citar leis" - ARGUMENTAR persuasivamente com base nelas
- Estrutura lógica: Lei → Interpretação → Jurisprudência → Aplicação ao caso
- Antecipar defesa do INSS e refutar preventivamente
- Usar conectores argumentativos fortes: "Ademais", "Outrossim", "Destarte", "Com efeito", "Nesse diapasão"
- Criar subseções temáticas claras (ex: "Da Qualidade de Segurada Especial", "Da Ilegalidade do Indeferimento")

TÉCNICA AVANÇADA - **ANTECIPAÇÃO DE DEFESA**:
Se o INSS indeferiu alegando X, refute PREVENTIVAMENTE na petição:
"Quanto ao argumento genérico de 'falta de prova da atividade rural' utilizado no indeferimento administrativo, cumpre esclarecer que tal alegação não subsiste diante da robusta documentação anexa (Doc. 03 - CNIS vazio, Doc. 05 - Autodeclaração, Doc. 08 - Comodato rural), que, nos termos da jurisprudência consolidada do E. TRF1, constitui início de prova material suficiente para o reconhecimento da qualidade de segurada especial (REsp 1.354.908/SP)."

**III. DAS PROVAS** (Valorização estratégica dos documentos):

✅ O QUE FAZER:
- Não é uma "lista de documentos" - é uma DEMONSTRAÇÃO da suficiência probatória
- Para cada documento, explique:
  * O que ele comprova
  * Por que é relevante
  * Como se relaciona com outros documentos
- Conecte documentos entre si (ex: "O CNIS vazio (Doc. 03), aliado à autodeclaração (Doc. 05) e ao comodato rural (Doc. 08), forma um CONJUNTO PROBATÓRIO ROBUSTO")
- Cite jurisprudências sobre valoração de provas

**VALORIZAÇÃO DE PONTOS APARENTEMENTE "FRACOS"**:
- CNIS vazio → "Comprova dedicação EXCLUSIVA à atividade rural, afastando qualquer vínculo urbano (TRF1, REsp XXXXX)"
- Benefício anterior → "O próprio INSS JÁ reconheceu a qualidade de segurada especial ao conceder benefício anterior"
- Documento em nome de terceiro (mãe/esposo) → "Plenamente válido em regime de economia familiar, nos termos da jurisprudência consolidada (TRF1, AC XXXXX)"
- Salário-maternidade anterior → "Benefício devido A CADA GESTAÇÃO, sem limite legal (TNU-PEDILEF 0506032-44.2012.4.05.8300)"

**IV. DOS PEDIDOS** (Clareza e assertividade):

✅ O QUE FAZER:
- Pedidos numerados, claros, específicos e objetivos
- Tutela de urgência FUNDAMENTADA (periculum in mora + fumus boni juris)
- Pedido principal com DIB, RMI e duração especificados
- Pedido subsidiário quando aplicável
- Incluir pedido de prova testemunhal se necessário

═══════════════════════════════════════════════════════════════
📐 NORMAS ABNT PARA PETIÇÕES JURÍDICAS
═══════════════════════════════════════════════════════════════

1. **Parágrafos**: 3 a 5 linhas (legibilidade e clareza)
2. **Citações jurídicas**: Formato correto
   - Ex: (STJ, REsp 1.234.567/SP, Rel. Min. Fulano, 2020)
   - Ex: (TRF1, AC 0012345-67.2023.4.01.3800, Des. Fed. Beltrano, 2024)
3. **Negrito**: Nomes das partes, números de processo, valores monetários
4. **Itálico**: Expressões latinas (*in dubio pro operario*) e termos jurídicos estrangeiros
5. **Seções numeradas**: I, II, III ou 1., 2., 3. (consistência)
6. **Documentos**: Citar como "Doc. 01", "Doc. 02" (conforme lista fornecida)

═══════════════════════════════════════════════════════════════
💬 LINGUAGEM JURÍDICA PERSUASIVA
═══════════════════════════════════════════════════════════════

**VERBOS FORTES** (usar em vez de verbos fracos):
✅ "comprova", "demonstra", "evidencia", "atesta", "confirma"
❌ "parece", "indica", "sugere", "pode indicar"

**CONECTORES ARGUMENTATIVOS**:
- "Ademais" (adição)
- "Outrossim" (adição formal)
- "Destarte" (conclusão)
- "Com efeito" (confirmação)
- "Nesse diapasão" (continuidade)
- "Assim sendo" (conclusão)
- "Por conseguinte" (consequência)

**EXPRESSÕES DE SEGURANÇA JURÍDICA**:
✅ "resta inequívoco", "é certo que", "não há dúvidas", "está cabalmente comprovado"
✅ "nos termos da jurisprudência consolidada", "conforme entendimento pacífico"
✅ "à luz do ordenamento jurídico pátrio", "nos moldes da legislação vigente"

═══════════════════════════════════════════════════════════════
🎯 TRANSFORMAÇÃO DE "PONTOS FRACOS" EM ARGUMENTOS FAVORÁVEIS
═══════════════════════════════════════════════════════════════

**CENÁRIO 1: CNIS sem vínculo urbano (aparentemente "vazio")**
❌ ABORDAGEM FRACA: "A autora não tem CNIS..."
✅ ABORDAGEM FORTE: "O CNIS anexo (Doc. 03) demonstra inequivocamente a AUSÊNCIA de vínculos urbanos, reforçando a dedicação exclusiva à atividade rural em regime de economia familiar, o que, nos termos da jurisprudência consolidada do E. TRF1, constitui INÍCIO DE PROVA MATERIAL suficiente para o reconhecimento da qualidade de segurada especial (REsp 1.354.908/SP)."

**CENÁRIO 2: Já recebeu salário-maternidade antes**
❌ ABORDAGEM FRACA: Omitir o benefício anterior
✅ ABORDAGEM FORTE: Criar subseção "DO DIREITO AO SALÁRIO-MATERNIDADE POR CADA GESTAÇÃO" e argumentar: "Embora a requerente já tenha recebido salário-maternidade anteriormente, o benefício é devido A CADA GESTAÇÃO, não havendo qualquer vedação legal ao recebimento de múltiplos benefícios, pois cada nascimento constitui FATO GERADOR AUTÔNOMO (Art. 71, Lei 8.213/91 + TNU-PEDILEF 0506032-44.2012.4.05.8300)."

**CENÁRIO 3: Comodato rural em nome de terceiro (mãe/esposo)**
❌ ABORDAGEM FRACA: Não mencionar ou minimizar o documento
✅ ABORDAGEM FORTE: "O comodato rural apresentado (Doc. 08), embora em nome da Sra. Divanilda (mãe da autora), é PLENAMENTE VÁLIDO como prova da atividade rural em regime de economia familiar, nos termos do entendimento consolidado do E. TRF1, que admite documentos em nome de membros do núcleo familiar para comprovação da atividade rural (AC 0012345-67.2020.4.01.3800)."

**CENÁRIO 4: Indeferimento genérico pelo INSS**
✅ ABORDAGEM FORTE: Antecipar e refutar na seção "DO DIREITO":
"Quanto ao indeferimento administrativo, baseado em alegação genérica de 'ausência de comprovação', cumpre esclarecer que tal fundamento é MANIFESTAMENTE ILEGAL, porquanto:
a) A documentação anexa (Doc. 03, 05, 08) constitui início de prova material + prova testemunhal
b) A jurisprudência do TRF1 é pacífica quanto à suficiência deste conjunto probatório
c) O INSS aplica critérios MAIS RIGOROSOS que a própria legislação e jurisprudência"

═══════════════════════════════════════════════════════════════
⚖️ EXEMPLO DE PARÁGRAFO COM TODAS AS TÉCNICAS
═══════════════════════════════════════════════════════════════

❌ VERSÃO BUROCRÁTICA:
"A autora é segurada especial. Apresenta documentos. Requer o benefício."

✅ VERSÃO PERSUASIVA (PNL + ABNT + ARGUMENTAÇÃO):
"A requerente, trabalhadora rural que há mais de uma década dedica-se à atividade agrícola em regime de economia familiar, **comprova inequivocamente** sua qualidade de segurada especial por meio de robusto conjunto probatório (Doc. 03 - CNIS vazio, Doc. 05 - Autodeclaração, Doc. 08 - Comodato rural). A ausência de vínculos urbanos no CNIS, **longe de constituir fragilidade probatória**, reforça a dedicação exclusiva à atividade rural, conforme entendimento consolidado do E. Tribunal Regional Federal da 1ª Região (REsp 1.354.908/SP). **Destarte**, resta cabalmente demonstrado o direito ao salário-maternidade pleiteado, sendo o indeferimento administrativo manifestamente ilegal e violador do princípio da dignidade da pessoa humana (CF/88, Art. 1º, III)."

═══════════════════════════════════════════════════════════════
🚨 REGRAS CRÍTICAS OBRIGATÓRIAS
═══════════════════════════════════════════════════════════════

1. **CADA FRASE DEVE PERSUADIR**: Nenhuma frase pode ser "neutra" ou "burocrática"
2. **TRANSFORME FRAGILIDADES EM FORÇAS**: Toda aparente "falta" vira argumento favorável
3. **ANTECIPE DEFESA DO INSS**: Refute preventivamente antes que o réu alegue
4. **USE JURISPRUDÊNCIA COMO AUTORIDADE**: Não só cite - ARGUMENTE com ela
5. **CONECTE EMOÇÃO + TÉCNICA + LÓGICA**: Combine Pathos + Ethos + Logos em cada seção
6. **LINGUAGEM ASSERTIVA**: Verbos fortes, expressões de certeza, conectores argumentativos

═══════════════════════════════════════════════════════════════

**LEMBRE-SE**: 
Esta é uma PETIÇÃO DE CONVENCIMENTO, não um mero formulário.
Seu objetivo é fazer o juiz QUERER deferir o pedido.
Combine técnica jurídica impecável + argumentação persuasiva + empatia.
Use PNL, retórica clássica, ABNT e oratória forense em CADA parágrafo.
`;

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

${ESPECIALISTA_PETICAO_PROMPT}

🚨🚨🚨 INSTRUÇÕES OBRIGATÓRIAS - NÃO IGNORE 🚨🚨🚨

Você DEVE gerar uma petição inicial seguindo EXATAMENTE este formato. PREENCHA TODOS OS CAMPOS. NÃO deixe NADA em branco ou com placeholders tipo [inserir], [preencher], etc.

═══════════════════════════════════════════════════════════════

**I. ENDEREÇAMENTO (PRIMEIRA LINHA DA PETIÇÃO):**

🚨🚨🚨 ATENÇÃO CRÍTICA - ENDEREÇAMENTO VALIDADO NA INTERNET:
- A autora mora em: ${city}/${uf}
- Subseção Judiciária CORRETA: ${subsecao}/${uf}
- Tribunal Regional Federal: ${trf} (${trfNumber}ª REGIÃO)
- Competência: ${isJuizado ? 'JUIZADO ESPECIAL FEDERAL' : 'VARA FEDERAL'}
- Valor da Causa: R$ ${valorCausa.toFixed(2)}
${jurisdicaoValidada.observacao ? `- Observação: ${jurisdicaoValidada.observacao}` : ''}
- Fonte: ${jurisdicaoValidada.fonte}
- Confiança: ${jurisdicaoValidada.confianca}

🚨 ESCREVA EXATAMENTE ASSIM (SEM ENDEREÇO FÍSICO):

${isJuizado 
  ? `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DO JUIZADO ESPECIAL FEDERAL DE ${getEstadoNome(uf)}` 
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

🚨 ATENÇÃO CRÍTICA: DOCUMENTOS REAIS ANEXADOS AO PROCESSO:

${documentosInfo}

🚨 INSTRUÇÕES OBRIGATÓRIAS:
1. Use EXATAMENTE os documentos listados acima
2. NÃO invente documentos que não estão na lista
3. Numere como "Doc. 01", "Doc. 02", etc (conforme a lista)
4. Cite o tipo correto de cada documento
5. Se não houver documentos anexados, informe: "A requerente anexa os seguintes documentos, a serem juntados em momento oportuno"

REDIJA:
Para cada documento da lista acima, escreva uma frase explicando sua relevância para o caso.
Exemplo: "Doc. 01 - Certidão de Nascimento (nome_arquivo.pdf): comprova a qualidade de segurada especial rural da requerente"

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

**RECOMENDAÇÕES DA ANÁLISE (GARANTIR QUE TODAS ESTÃO NA PETIÇÃO):**
${analysis?.draft_payload?.recomendacoes?.length > 0 
  ? analysis.draft_payload.recomendacoes.map((r: string, i: number) => `
☐ ${i+1}. ${r}`).join('\n')
  : 'Nenhuma recomendação específica'}

**REGRAS CRÍTICAS SOBRE RECOMENDAÇÕES**:
- A petição DEVE abordar TODAS as recomendações acima
- Para cada recomendação, crie um parágrafo ou seção específica
- Use as teses e jurisprudências fornecidas para fundamentar cada ponto
- Ao final, você deve indicar para cada recomendação:
  * Se foi atendida (true/false)
  * Onde na petição está (ex: "Seção III, parágrafo 5")
  * Como foi atendida (breve explicação)
  * Se não atendida, por quê

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

**DOCUMENTOS REAIS DO CASO:**
${documentosInfo}

Total: ${mainDocuments.length} documento(s) anexado(s)

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

🎯 **VALIDAÇÃO DE RECOMENDAÇÕES (OBRIGATÓRIO)**:
Ao final da petição, você DEVE retornar um JSON separado com a validação de cada recomendação:

PETIÇÃO:
[texto completo da petição em markdown]

---VALIDACAO_RECOMENDACOES---
{
  "recomendacoes_validacao": [
    {
      "id": 1,
      "recomendacao": "texto da recomendação",
      "atendida": true,
      "onde": "Seção III - Do Direito, Item 3.2",
      "como": "Criada seção específica com jurisprudência TRF1"
    },
    {
      "id": 2,
      "recomendacao": "texto da recomendação 2",
      "atendida": false,
      "motivo": "Documento não foi anexado ao caso"
    }
  ]
}

🚨 **SE VOCÊ DEIXAR QUALQUER CAMPO VAZIO OU COM PLACEHOLDER, A PETIÇÃO SERÁ REJEITADA!**

🚨🚨🚨 VALIDAÇÃO CRÍTICA DE DOCUMENTOS 🚨🚨🚨

✅ Na seção "DAS PROVAS", você DEVE:
- Citar APENAS documentos da lista fornecida
- Usar numeração EXATA (Doc. 01, Doc. 02, etc)
- NÃO inventar "RG e CPF", "Comprovante de Residência" se não estiverem na lista
- Se a lista estiver vazia, escreva: "A requerente juntará os documentos necessários em momento oportuno"

❌ NUNCA faça isso:
- Inventar documentos que não existem
- Citar "Certidão de Nascimento" se não estiver na lista
- Usar numeração genérica tipo "Doc. 01 a 10"

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
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    // ✅ Timeout otimizado de 45 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    console.log('[PETITION] 🚀 Usando gpt-5-2025-08-07 (melhor qualidade para petições)');

    try {
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: 12000,
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
        
        // ✅ VALIDAR SE A RESPOSTA NÃO É SÓ ESPAÇOS EM BRANCO
        if (!responseText.trim()) {
          console.error('[PETITION] ❌ Resposta vazia ou apenas espaços em branco!');
          throw new Error('AI retornou resposta vazia. Tente novamente.');
        }
        
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

      // ✅ EXTRAIR VALIDAÇÃO DE RECOMENDAÇÕES
      let recomendacoesValidacao = [];
      const validacaoMatch = petitionText.match(/---VALIDACAO_RECOMENDACOES---([\s\S]*?)$/);
      
      if (validacaoMatch) {
        try {
          const validacaoJson = validacaoMatch[1].trim();
          const validacaoData = JSON.parse(validacaoJson);
          recomendacoesValidacao = validacaoData.recomendacoes_validacao || [];
          
          // Remover a seção de validação do texto da petição
          petitionText = petitionText.replace(/---VALIDACAO_RECOMENDACOES---[\s\S]*$/, '').trim();
          
          console.log('[PETITION] ✅ Validação de recomendações extraída:', recomendacoesValidacao.length);
        } catch (parseError) {
          console.warn('[PETITION] ⚠️ Erro ao parsear validação de recomendações:', parseError);
        }
      } else {
        console.warn('[PETITION] ⚠️ Validação de recomendações não encontrada na resposta');
      }

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

      // ✅ VALIDAÇÃO FINAL: Verificar se a IA respeitou os documentos
      console.log('[PETITION] 🔍 Validando citações de documentos...');

      const secaoProvas = petitionText.match(/(?:DAS PROVAS|DOS DOCUMENTOS)([\s\S]*?)(?=\n\n[A-Z]{2,}|$)/i);

      if (secaoProvas && mainDocuments.length > 0) {
        const docsNaPetition = secaoProvas[0];
        mainDocuments.forEach((doc: any, i: number) => {
          const docRef = `Doc. ${String(i + 1).padStart(2, '0')}`;
          if (!docsNaPetition.includes(docRef)) {
            console.warn(`⚠️ [PETITION] Documento ${docRef} não foi citado na seção 'Das Provas'`);
            qualityIssues.push({
              tipo: 'DOCUMENTO_NAO_CITADO',
              gravidade: 'MÉDIO',
              problema: `Documento ${docRef} (${doc.file_name}) não foi citado na petição`
            });
          }
        });
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

      // Salvar draft no banco e retornar ID
      const { data: savedDraft, error: draftError } = await supabase
        .from('drafts')
        .insert({
          case_id: caseId,
          markdown_content: petitionText,
          payload: { 
            selectedJurisprudencias, 
            jurisdicaoValidada,
            recomendacoes_validacao: recomendacoesValidacao 
          },
          is_stale: false
        })
        .select()
        .single();

      if (draftError) {
        console.error('❌ Erro ao salvar draft:', draftError);
      } else {
        console.log('✅ Draft salvo com ID:', savedDraft?.id);
      }

      return new Response(JSON.stringify({ 
        petitionText,
        recomendacoes_validacao: recomendacoesValidacao,
        draftId: savedDraft?.id
      }), {
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
