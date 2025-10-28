// Função auxiliar para extrair dados de um batch de documentos
export async function extractDataFromBatch(
  processedBatch: any[],
  openaiApiKey: string,
  hasAutodeclaracao: boolean,
  lovableApiKey?: string
): Promise<any> {
  console.log(`[IA BATCH] Chamando IA (Lovable AI Claude Sonnet 4.5 ou OpenAI GPT-4o) com ${processedBatch.length} imagens...`);
  
  const systemPrompt = `Você é um especialista em OCR e extração de dados de documentos previdenciários brasileiros. Sua missão é extrair TODAS as informações visíveis com MÁXIMA PRECISÃO.

═══════════════════════════════════════════════════════════════
📋 TIPOS DE DOCUMENTOS E INSTRUÇÕES ESPECÍFICAS
═══════════════════════════════════════════════════════════════

🔹 **PROCURAÇÃO** (CRÍTICO - CONTÉM ENDEREÇO COMPLETO!)
   A procuração geralmente contém os dados MAIS COMPLETOS da autora:
   ✓ Nome COMPLETO da outorgante (mãe/autora)
   ✓ CPF completo
   ✓ RG completo
   ✓ Endereço COMPLETO: Rua + Nº + Bairro + Cidade + UF + CEP
   ✓ Telefone/celular (se constar)
   ⚠️ Este é o documento PRIORITÁRIO para dados de endereço e contato!

🔹 **CERTIDÃO DE NASCIMENTO** (CRÍTICO!)
   
   ⚠️⚠️⚠️ ATENÇÃO MÁXIMA: NÃO CONFUNDA MÃE COM CRIANÇA! ⚠️⚠️⚠️
   
   A certidão de nascimento tem 3 PESSOAS DIFERENTES:
   
   1️⃣ **CRIANÇA** (a pessoa que NASCEU):
      → Nome da criança: aparece no TOPO da certidão
      → Campo: "Nome do Registrado", "Nome Completo", "Nascido(a)"
      → Data de nascimento da CRIANÇA
      → É a PESSOA PRINCIPAL do documento!
   
   2️⃣ **MÃE** (quem DEU À LUZ):
      → Na seção "DADOS DA MÃE" ou "FILIAÇÃO MATERNA"
      → É DIFERENTE do nome da criança!
      → Campo: "Nome da Mãe", "Filiação Materna"
   
   3️⃣ **PAI**:
      → Na seção "DADOS DO PAI" ou "FILIAÇÃO PATERNA"
      → Campo: "Nome do Pai", "Filiação Paterna"
   
   🚨 REGRA ABSOLUTA:
   - Se o documento diz "MÃE:" ou "FILIAÇÃO MATERNA:" → É o nome da MÃE
   - Se o documento diz "NOME:", "REGISTRADO:" no início → É o nome da CRIANÇA
   - NUNCA coloque o nome da mãe no campo childName!
   - NUNCA coloque o nome da criança no campo motherName!
   
   Extrair:
   - Nome completo da criança (requerente/beneficiário) - ATENÇÃO: NÃO é o nome da mãe!
   - Data de nascimento da CRIANÇA DD/MM/AAAA (CAMPO CRÍTICO!)
   - Nome da mãe (seção DADOS DA MÃE) - DIFERENTE do nome da criança!
   - CPF da mãe (se disponível)
   - Naturalidade (cidade/estado de nascimento da CRIANÇA)
   - Cartório onde foi registrado

🔹 **CPF / RG / CNH / IDENTIDADE**
   ✓ Nome completo EXATAMENTE como aparece
   ✓ CPF (apenas 11 números, sem pontos ou traços)
   ✓ RG com órgão expedidor (ex: "12.345.678-9 SSP/MG")
   ✓ Data de nascimento DD/MM/AAAA
   ✓ Nome da mãe (filiação)
   ✓ Endereço (se constar)

🔹 **COMPROVANTE DE RESIDÊNCIA**
   ✓ Endereço COMPLETO: Rua + Nº + Complemento + Bairro + Cidade + UF + CEP
   ✓ Nome do titular

🔹 **AUTODECLARAÇÃO RURAL** (CRÍTICO - SEÇÕES ESPECÍFICAS!)

📋 **SEÇÃO 2: PERÍODOS DE ATIVIDADE RURAL**
   ✓ Tabela de períodos: DESDE XX/XX/XXXX ATÉ XX/XX/XXXX
   ✓ CONDIÇÃO EM RELAÇÃO AO IMÓVEL: COMODATO/Proprietário/Arrendatário/etc
   ✓ SITUAÇÃO: Individual ou Regime de Economia Familiar (checkbox)
   ✓ COM QUEM MORA: Pai, mãe, esposo, filhos, avós, tios - EXTRAIR LITERALMENTE
   ✓ ATIVIDADES: Plantio, criação, colheita - DESCREVER DETALHADAMENTE
   
   **SEÇÃO 2.1: CONDIÇÃO NO GRUPO**
   ✓ Titular ou Componente do grupo familiar
   
   **SEÇÃO 2.2: GRUPO FAMILIAR COMPLETO**
   ✓ NOME + DN + CPF + ESTADO CIVIL + PARENTESCO de CADA membro
   ✓ Extrair TODOS os membros listados na tabela
   ✓ Formato: [{"name":"Nome","birthDate":"YYYY-MM-DD","cpf":"12345678900","maritalStatus":"solteiro","relationship":"mãe"}]
   
📋 **SEÇÃO 3: DADOS DA TERRA**
   
   **SEÇÃO 3.1: INFORMAÇÕES DO IMÓVEL**
   ✓ FORMA DE CESSÃO: Comodato/Arrendamento/etc
   ✓ PERÍODO: Desde quando até quando
   ✓ ÁREA CEDIDA em hectare - ha (campo numérico)
   ✓ Registro ITR (se possuir)
   ✓ Nome da propriedade
   ✓ Município/UF
   ✓ Área total do imóvel (ha)
   ✓ Área explorada pelo requerente (ha)
   ✓ Nome do proprietário
   ✓ CPF do Proprietário
   
   **SEÇÃO 3.2: ATIVIDADES RURAIS**
   ✓ ATIVIDADE: Lista de culturas/criações
   ✓ SUBSISTÊNCIA/VENDA: Checkbox marcado
   
   Exemplo:
   - PLANTIO: CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ → Subsistência/Venda
   - CRIAÇÃO: GALINHA E PORCO → Subsistência

⚠️ **REGRA CRÍTICA**: 
- Se o CPF do proprietário for DIFERENTE do CPF da autora/mãe → landOwnershipType = "terceiro"
- Se o CPF do proprietário for IGUAL ao CPF da autora/mãe → landOwnershipType = "propria"
- NÃO agrupe períodos diferentes! Separe cada um!
- Se menciona zona urbana, EXTRAIR também (urbanPeriods)

🔹 **DOCUMENTO DA TERRA / PROPRIEDADE** (CRÍTICO!)
   ✓ Nome do proprietário
   ✓ CPF do proprietário (apenas números)
   ✓ RG do proprietário
   ✓ Tipo de propriedade/relação

🔹 **CNIS - CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS** (ANÁLISE CRÍTICA!)
   Este documento é ESSENCIAL para comprovar vínculos. Analise PÁGINA POR PÁGINA:
   
   **IMPORTANTE: CNIS pode ter múltiplas páginas! Leia TODAS até o final!**
   
   ✓ VÍNCULOS URBANOS (Tabela "Relação de Vínculos"):
     → Nome COMPLETO de cada empregador
     → Data início (YYYY-MM-DD) e fim (YYYY-MM-DD) de CADA vínculo
     → Tipo de vínculo (CLT, contrato, etc)
   
   ✓ VÍNCULOS RURAIS (se houver seção específica):
     → Descrição do período rural
     → Datas de início e fim
   
   ✓ BENEFÍCIOS ANTERIORES:
     → Procure por "Salário-Maternidade" na seção de benefícios
     → Anote número do benefício (NB) e datas
   
   ✓ OBSERVAÇÃO CRÍTICA:
     → Se o CNIS não apresentar NENHUM vínculo ou benefício → marcar "cnis_vazio": true
     → CNIS vazio É PONTO FORTE para comprovar atividade exclusivamente rural!

🔹 **PROCESSO INSS / INDEFERIMENTO / REQUERIMENTO ADMINISTRATIVO (RA)** (CRÍTICO!)
   
   **Este documento contém informações ESSENCIAIS para a ação judicial:**
   
   ✓ NÚMERO DO PROTOCOLO/NB (raProtocol) - OBRIGATÓRIO:
     → Procure por: "NB", "Benefício", "Protocolo", "Número do Benefício"
     → Formato comum: "NB 187.654.321-0" ou "Protocolo: 123456789"
     → Localizar na PRIMEIRA PÁGINA, geralmente no topo
     → Se encontrar, COPIE EXATAMENTE COMO ESTÁ
   
   ✓ DATA DO REQUERIMENTO (raRequestDate) - OBRIGATÓRIA:
     → Procure por: "Data do Requerimento", "Data da Solicitação", "Data do Pedido"
     → Data em que a segurada PEDIU o benefício
     → Converter para formato YYYY-MM-DD
   
   ✓ DATA DO INDEFERIMENTO (raDenialDate) - OBRIGATÓRIA:
     → Procure por: "Data da Decisão", "Data do Despacho", "Data do Indeferimento"
     → Data da decisão de negativa do INSS
     → Converter para formato YYYY-MM-DD
   
   ✓ MOTIVO DO INDEFERIMENTO (raDenialReason) - LITERAL E COMPLETO:
     → Procure por seções: "FUNDAMENTAÇÃO", "MOTIVO", "RAZÕES DO INDEFERIMENTO"
     → Copie PALAVRA POR PALAVRA TODO o texto do indeferimento
     → Incluir: fundamentação jurídica, artigos de lei citados, análise técnica completa
     → NÃO resuma, NÃO parafraseie, copie LITERALMENTE
     → Exemplo: "Não comprovada a qualidade de segurado especial conforme Lei 8.213/91 art. 39..."
     → Se houver múltiplas páginas de fundamentação, copie TODAS!

═══════════════════════════════════════════════════════════════
⚠️ REGRAS ABSOLUTAS - SIGA RIGOROSAMENTE!
═══════════════════════════════════════════════════════════════

1. ✅ Leia TODOS os textos, incluindo manuscritos, carimbos, assinaturas
2. ✅ Se um campo estiver visível, EXTRAIA-O
3. ✅ Formato de datas: SEMPRE converter para YYYY-MM-DD
4. ✅ CPF: SEMPRE apenas os 11 números
5. ✅ Nomes: Copiar EXATAMENTE como aparecem
6. ✅ Endereços: SEMPRE completos
7. ✅ Motivo indeferimento: Copiar LITERALMENTE

AGORA EXTRAIA TODAS AS INFORMAÇÕES DOS DOCUMENTOS FORNECIDOS!`;

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  // Adicionar cada documento como mensagem com imagem
  for (const doc of processedBatch) {
    let docPrompt = `Documento: ${doc.fileName}\nTipo classificado: ${doc.docType}\n\nExtraia TODAS as informações visíveis neste documento com máxima precisão:`;
    
    if (doc.docType === 'autodeclaracao_rural') {
      docPrompt = `⚠️⚠️⚠️ AUTODECLARAÇÃO RURAL DETECTADA! ⚠️⚠️⚠️

Este é o documento MAIS IMPORTANTE para períodos rurais!

🔴 CAMPOS OBRIGATÓRIOS A EXTRAIR:

1. **PERÍODOS DE ATIVIDADE RURAL** (ruralPeriods):
   - startDate: Data de início (YYYY-MM-DD)
   - endDate: Data de fim (YYYY-MM-DD ou vazio se ainda trabalha)
   - location: Local COMPLETO (Sítio/Fazenda + Município/UF)
   - withWhom: COM QUEM MORA - COPIE EXATAMENTE: "pai e mãe", "esposo e 3 filhos", "avó paterna", etc
   - activities: ATIVIDADES - COPIE TUDO: "plantio de café, cacau, banana, mandioca; criação de galinha e porco"

2. **SEÇÃO 2.2 - GRUPO FAMILIAR** (familyMembersDetailed):
   Procure uma TABELA com colunas: NOME | DN | CPF | ESTADO CIVIL | PARENTESCO
   Extrair CADA linha desta tabela!

3. **SEÇÃO 3 - DADOS DA TERRA**:
   - landArea: Área cedida em hectares (número)
   - landTotalArea: Área total do imóvel (número)
   - landExploitedArea: Área explorada (número)
   - landPropertyName: Nome da propriedade
   - landMunicipality: Município/UF
   - landITR: Registro ITR
   - landCessionType: COMODATO/Arrendamento/etc
   - landOwnerName: Nome do proprietário da terra
   - landOwnerCpf: CPF do proprietário (só números)
   - landOwnerRg: RG do proprietário

4. **ATIVIDADES RURAIS DETALHADAS**:
   - ruralActivitiesPlanting: "CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ"
   - ruralActivitiesBreeding: "GALINHA E PORCO"

⚠️ LEIA TODAS AS PÁGINAS DESTE DOCUMENTO PÁGINA POR PÁGINA!

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os dados listados acima:`;
    }
    
    if (doc.docType === 'documento_terra') {
      docPrompt = `🔍 DOCUMENTO DA TERRA - ATENÇÃO MÁXIMA:

Este documento define se a terra é PRÓPRIA ou de TERCEIRO.

🔴 CAMPOS OBRIGATÓRIOS A EXTRAIR:

**PROPRIETÁRIO DA TERRA**:
- landOwnerName: Nome COMPLETO do proprietário (OBRIGATÓRIO)
- landOwnerCpf: CPF do proprietário SEM FORMATAÇÃO - só 11 números (OBRIGATÓRIO)
- landOwnerRg: RG do proprietário com órgão expedidor

**DADOS DA PROPRIEDADE**:
- landArea: Área cedida em hectares - procure por "ha" ou "hectare" (número decimal)
- landTotalArea: Área total do imóvel em hectares (número decimal)
- landExploitedArea: Área explorada em hectares (número decimal)
- landPropertyName: Nome da propriedade (Sítio X, Fazenda Y)
- landMunicipality: Município/UF
- landITR: Número do registro ITR (se houver)
- landCessionType: Tipo de cessão - procure palavras como "COMODATO", "Arrendamento", "Parceria", "Cessão"

**TIPO DE PROPRIEDADE** (landOwnershipType):
- Se for ESCRITURA ou ITR em nome da autora → "propria"
- Se for COMODATO, ARRENDAMENTO, CESSÃO → "terceiro"
- DICA: Procure nos parágrafos iniciais do documento

⚠️ PROCURE EM:
- Cabeçalho do documento
- Parágrafos iniciais (geralmente tem "FULANO DE TAL, CPF XXX, proprietário...")
- Tabelas com dados cadastrais
- Assinaturas no final

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os campos listados acima COM MÁXIMA ATENÇÃO:`;
    }
    
    if (doc.docType === 'processo_administrativo') {
      docPrompt = `📄 PROCESSO ADMINISTRATIVO / INDEFERIMENTO INSS - CRÍTICO!

Este documento é ESSENCIAL para a ação judicial e deve ser lido COM MÁXIMA ATENÇÃO!

🔴 CAMPOS OBRIGATÓRIOS A EXTRAIR:

1. **raProtocol** - NÚMERO DO PROTOCOLO/BENEFÍCIO (OBRIGATÓRIO):
   → Procure por palavras-chave: "NB", "Número do Benefício", "Protocolo", "Requerimento nº"
   → Formato comum: "187.654.321-0", "NB 187654321", "Protocolo: 123456789"
   → Localização: PRIMEIRA PÁGINA, geralmente no TOPO ou no CABEÇALHO
   → COPIE EXATAMENTE COMO ESTÁ ESCRITO

2. **raRequestDate** - DATA DO REQUERIMENTO (OBRIGATÓRIA):
   → Procure por: "Data do Requerimento", "Data da Solicitação", "DER", "Data de Entrada do Requerimento"
   → É a data em que a segurada PEDIU o benefício ao INSS
   → Formato: YYYY-MM-DD (exemplo: 2023-05-15)

3. **raDenialDate** - DATA DO INDEFERIMENTO (OBRIGATÓRIA):
   → Procure por: "Data da Decisão", "Data do Despacho", "Data do Indeferimento", "Data da Negativa"
   → É a data em que o INSS NEGOU o benefício
   → Formato: YYYY-MM-DD

4. **raDenialReason** - MOTIVO DO INDEFERIMENTO (LITERAL E COMPLETO - OBRIGATÓRIO):
   → Procure por seções com títulos: "FUNDAMENTAÇÃO", "MOTIVO", "RAZÕES", "ANÁLISE", "DESPACHO"
   → COPIE PALAVRA POR PALAVRA TODO o texto explicando por que foi negado
   → NÃO resuma, NÃO parafraseie, NÃO omita nada
   → Inclua: fundamentação jurídica completa, artigos de lei citados, análise técnica
   → Se houver múltiplas páginas de texto, copie TODAS elas
   → Exemplo esperado: "Não restou comprovada a qualidade de segurado especial, tendo em vista que os documentos apresentados não são suficientes para comprovar o exercício de atividade rural em regime de economia familiar no período de carência exigido pela Lei 8.213/91, art. 39..."

⚠️ IMPORTANTE:
- Leia TODAS as páginas deste documento
- Páginas iniciais geralmente têm protocolo e datas
- Páginas intermediárias/finais têm a fundamentação completa
- NÃO OMITA NENHUMA INFORMAÇÃO!

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os 4 campos listados acima COM MÁXIMA PRECISÃO:`;
    }
    
    if (doc.docType === 'historico_escolar') {
      docPrompt = `📚 HISTÓRICO ESCOLAR / DECLARAÇÃO ESCOLAR - PROVA MATERIAL DE VÍNCULO RURAL!

⚠️⚠️⚠️ ESTE DOCUMENTO É EXTREMAMENTE IMPORTANTE! ⚠️⚠️⚠️

Você DEVE extrair TODOS os dados escolares neste documento!

🔴 OBRIGATÓRIO EXTRAIR (campo schoolHistory):

Para CADA escola mencionada, extrair um objeto com:
- instituicao: Nome COMPLETO da escola (ex: "Escola Rural Municipal São José")
- periodo_inicio: Ano de início (ex: "2010-01-01") 
- periodo_fim: Ano de fim (ex: "2014-12-31")
- serie_ano: Séries cursadas (ex: "1ª a 4ª série primária")
- localizacao: CRÍTICO - dizer se é "ZONA RURAL" ou "ZONA URBANA" + município/UF

🔍 ONDE PROCURAR:
- Nome da escola: geralmente no topo do documento
- Períodos: procure por "ANO:", "PERÍODO:", tabelas com anos
- Localização: procure por "ZONA RURAL", "ÁREA RURAL", "RURAL", nome do sítio/fazenda

⚠️ SE A ESCOLA É EM ZONA RURAL = PROVA QUE A FAMÍLIA MORAVA NA ZONA RURAL!

Documento: ${doc.fileName}
Tipo: historico_escolar

AGORA EXTRAIA TODOS OS DADOS ESCOLARES COM MÁXIMA ATENÇÃO:`;
    }
    
    if (doc.docType === 'declaracao_saude_ubs') {
      docPrompt = `🏥 DECLARAÇÃO DE SAÚDE / UBS - PROVA MATERIAL!

⚠️⚠️⚠️ ESTE DOCUMENTO É EXTREMAMENTE IMPORTANTE! ⚠️⚠️⚠️

Você DEVE extrair TODOS os dados da UBS neste documento!

🔴 OBRIGATÓRIO EXTRAIR (campo healthDeclarationUbs):

- unidade_saude: Nome COMPLETO da UBS/Posto (ex: "UBS Rural da Fazenda Esperança")  
- tratamento_desde: Desde quando recebe atendimento (formato YYYY-MM-DD)
- tipo_tratamento: Tipo (ex: "Pré-natal", "Acompanhamento gestacional")
- localizacao: CRÍTICO - dizer se é "ZONA RURAL" ou "ZONA URBANA" + município/UF
- profissional_responsavel: Nome do médico/enfermeiro + CRM
- observacoes_medicas: Qualquer observação relevante

🔍 ONDE PROCURAR:
- Nome da UBS: topo do documento, cabeçalho
- Datas: procure por "desde", "acompanhamento desde", datas
- Localização: procure por "RURAL", "ÁREA RURAL", nome da localidade

⚠️ SE A UBS É EM ZONA RURAL = PROVA QUE A AUTORA MORA/TRABALHA NA ZONA RURAL!

Documento: ${doc.fileName}
Tipo: declaracao_saude_ubs

AGORA EXTRAIA TODOS OS DADOS DA UBS COM MÁXIMA ATENÇÃO:`;
    }
    
    if (doc.docType === 'documento_terra') {
      docPrompt = `🔍 DOCUMENTO DA TERRA - DADOS CRÍTICOS!

⚠️⚠️⚠️ VOCÊ DEVE EXTRAIR O CPF DO PROPRIETÁRIO! ⚠️⚠️⚠️

🔴 OBRIGATÓRIO EXTRAIR:

**PROPRIETÁRIO** (procure em TODO o documento!):
- landOwnerName: Nome COMPLETO do proprietário  
- landOwnerCpf: CPF SEM FORMATAÇÃO (11 números) - OBRIGATÓRIO! Procure em:
  * Cabeçalho do documento
  * Parágrafos iniciais ("FULANO DE TAL, CPF XXX...")
  * Tabelas com dados cadastrais
  * Assinaturas no final
  * Qualquer lugar que tenha "CPF:" ou números no formato XXX.XXX.XXX-XX
- landOwnerRg: RG com órgão expedidor

**PROPRIEDADE**:
- landArea: Área em hectares (procure "ha", "hectare")
- landPropertyName: Nome (Sítio X, Fazenda Y)
- landMunicipality: Município/UF
- landCessionType: COMODATO/Arrendamento/Parceria/Cessão

⚠️ LEIA O DOCUMENTO INTEIRO! O CPF pode estar em QUALQUER lugar!

Documento: ${doc.fileName}
Tipo: documento_terra

AGORA EXTRAIA TODOS OS CAMPOS, ESPECIALMENTE O CPF DO PROPRIETÁRIO:`;
    }
      docPrompt = `📚 HISTÓRICO ESCOLAR / DECLARAÇÃO ESCOLAR - PROVA MATERIAL DE VÍNCULO RURAL!

Este documento é PROVA MATERIAL de que a autora estudou em escola rural, comprovando residência e atividade rural!

🔴 CAMPOS OBRIGATÓRIOS A EXTRAIR:

1. **schoolHistory** (campo JSONB - array de períodos):
   → Formato: [{"instituicao": "Nome da Escola", "periodo_inicio": "YYYY-MM-DD", "periodo_fim": "YYYY-MM-DD", "serie_ano": "3ª série primária", "localizacao": "Rural - Município/UF"}]
   
   EXTRAIR:
   - **instituicao**: Nome COMPLETO da escola (ex: "Escola Rural Municipal São José")
   - **periodo_inicio**: Data de início dos estudos (YYYY-MM-DD) - pode ser apenas o ano se não tiver mês/dia
   - **periodo_fim**: Data de fim dos estudos (YYYY-MM-DD) ou vazio se ainda estuda
   - **serie_ano**: Série/ano que cursou (ex: "1ª a 4ª série", "Ensino Fundamental")
   - **localizacao**: LOCALIZAÇÃO DA ESCOLA - procure por:
     * "Zona Rural"
     * "Área Rural"
     * Nome do sítio/fazenda/povoado onde fica a escola
     * Município e UF
     * IMPORTANTE: Se a escola está em zona rural, ISSO COMPROVA que a autora morava na zona rural!

2. **Observações importantes** (observations):
   → Se o documento menciona "escola rural", "zona rural", "área rural" → adicione: "Histórico escolar comprova residência em zona rural durante período dos estudos"
   → Se houver endereço da autora no documento → extrair para motherAddress

⚠️ POR QUE ESTE DOCUMENTO É IMPORTANTE:
- Escola em zona rural = família mora/trabalha em zona rural
- Comprova vínculo com a comunidade rural
- É PROVA MATERIAL aceita pela justiça para comprovar atividade rural!

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os dados escolares listados acima:`;
    }
    
    if (doc.docType === 'declaracao_saude_ubs') {
      docPrompt = `🏥 DECLARAÇÃO DE SAÚDE / UBS - PROVA MATERIAL DE RESIDÊNCIA E VÍNCULO RURAL!

Este documento comprova que a autora recebe atendimento em Unidade Básica de Saúde, provando residência local e vínculo com a comunidade!

🔴 CAMPOS OBRIGATÓRIOS A EXTRAIR:

1. **healthDeclarationUbs** (campo JSONB):
   → Formato: {"unidade_saude": "Nome da UBS", "tratamento_desde": "YYYY-MM-DD", "tipo_tratamento": "Descrição", "localizacao": "Zona Rural - Município/UF", "profissional_responsavel": "Nome + CRM"}
   
   EXTRAIR:
   - **unidade_saude**: Nome COMPLETO da UBS/Posto de Saúde (ex: "UBS Rural da Fazenda Esperança")
   - **tratamento_desde**: Desde quando recebe atendimento nesta UBS (YYYY-MM-DD)
   - **tipo_tratamento**: Tipo de tratamento/acompanhamento (ex: "Pré-natal", "Acompanhamento gestacional", "Consultas de rotina")
   - **localizacao**: LOCALIZAÇÃO DA UBS - procure por:
     * "Zona Rural"
     * "Área Rural"  
     * Nome da localidade (sítio/fazenda/povoado)
     * Município e UF
     * IMPORTANTE: UBS em zona rural = autora mora/trabalha na zona rural!
   - **profissional_responsavel**: Nome do médico/enfermeiro + CRM/COREN (se constar)
   - **observacoes_medicas**: Qualquer observação sobre a autora (ex: "Paciente reside em área rural de difícil acesso")

2. **Dados complementares**:
   → Se houver ENDEREÇO da autora no documento → extrair para motherAddress
   → Se houver CPF/RG da autora → extrair para motherCpf/motherRg
   → Se mencionar "gestante", "pré-natal", "salário-maternidade" → anotar em observations

3. **Observações importantes** (observations):
   → Adicionar: "Declaração de UBS comprova residência em zona rural e vínculo com a comunidade local"
   → Se mencionar "difícil acesso", "zona rural", "área rural" → anotar!

⚠️ POR QUE ESTE DOCUMENTO É IMPORTANTE:
- UBS em zona rural = família mora/trabalha lá
- Comprova residência continuada no local
- É PROVA MATERIAL aceita pela justiça!
- Comprova vínculo com a comunidade rural

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os dados de saúde listados acima:`;
    }
    
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: docPrompt
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${doc.mimeType};base64,${doc.base64Content}`,
            detail: "high"
          }
        }
      ]
    });
  }

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      max_tokens: 4096,
      temperature: 0,
      functions: [
        {
          name: "extract_case_info",
          description: "Extrai informações estruturadas de documentos previdenciários brasileiros. SEMPRE extraia TODOS os campos relevantes de TODOS os tipos de documentos.",
          parameters: {
            type: "object",
            properties: {
            // Dados da mãe/autora
              motherName: { 
                type: "string", 
                description: "Nome COMPLETO da MÃE/AUTORA (quem deu à luz). Exemplo: 'Maria da Silva Santos'. NA CERTIDÃO DE NASCIMENTO: procure em 'DADOS DA MÃE' ou 'FILIAÇÃO MATERNA'. NUNCA coloque o nome da criança aqui!" 
              },
              motherCpf: { type: "string", description: "CPF da mãe (apenas números, sem formatação)" },
              motherRg: { type: "string", description: "RG da mãe com órgão expedidor (ex: '12.345.678-9 SSP/MG')" },
              motherBirthDate: { type: "string", description: "Data de nascimento da mãe (formato: YYYY-MM-DD)" },
              motherAddress: { type: "string", description: "Endereço COMPLETO da mãe (Rua + Nº + Bairro + Cidade + UF + CEP)" },
              motherPhone: { type: "string", description: "Telefone ou celular da mãe" },
              motherWhatsapp: { type: "string", description: "WhatsApp da mãe" },
              maritalStatus: { type: "string", description: "Estado civil" },
              
              // Dados da criança
              childName: { 
                type: "string", 
                description: "Nome COMPLETO da CRIANÇA (quem nasceu, pessoa registrada). Exemplo: 'João Pedro Silva'. NA CERTIDÃO DE NASCIMENTO: aparece no TOPO do documento, campo 'NOME DO REGISTRADO' ou 'NASCIDO(A)'. ATENÇÃO: NÃO é o nome da mãe! Deve ser DIFERENTE do motherName!" 
              },
              childBirthDate: { type: "string", description: "Data de nascimento da CRIANÇA (formato: YYYY-MM-DD)" },
              childBirthPlace: { type: "string", description: "Local de nascimento da criança (cidade + UF)" },
              fatherName: { type: "string", description: "Nome COMPLETO do pai (seção DADOS DO PAI ou FILIAÇÃO PATERNA)" },
              
              // Proprietário da terra (SEMPRE EXTRAIR SE HOUVER DOCUMENTO DA TERRA!)
              landOwnerName: { type: "string", description: "Nome COMPLETO do proprietário da terra - OBRIGATÓRIO se houver documento da terra" },
              landOwnerCpf: { type: "string", description: "CPF do proprietário SEM FORMATAÇÃO (11 números) - OBRIGATÓRIO se houver documento da terra - procure em TODO o documento!" },
              landOwnerRg: { type: "string", description: "RG do proprietário com órgão expedidor" },
              landOwnershipType: { type: "string", description: "Tipo de relação com a terra (propria ou terceiro) - se CPF do proprietário = CPF da autora então 'propria', senão 'terceiro'" },
              
              // Dados detalhados da terra (seção 3.1 e 3.2) - SEMPRE EXTRAIR SE HOUVER DOCUMENTO DA TERRA OU AUTODECLARAÇÃO!
              landArea: { 
                type: "number", 
                description: "Área cedida em hectares (campo 'ÁREA CEDIDA em hectare - ha') - procure por números seguidos de 'ha' ou 'hectare' - OBRIGATÓRIO se houver dados da terra" 
              },
              landTotalArea: { 
                type: "number", 
                description: "Área total do imóvel em hectares - OBRIGATÓRIO se houver dados da terra" 
              },
              landExploitedArea: { 
                type: "number", 
                description: "Área explorada pelo requerente em hectares - OBRIGATÓRIO se houver dados da terra" 
              },
              landITR: { 
                type: "string", 
                description: "Registro ITR, se possuir - procure por 'ITR' ou 'registro'" 
              },
              landPropertyName: { 
                type: "string", 
                description: "Nome da propriedade (sítio, fazenda, etc) - OBRIGATÓRIO se houver dados da terra" 
              },
              landMunicipality: { 
                type: "string", 
                description: "Município/UF onde fica o imóvel - OBRIGATÓRIO se houver dados da terra" 
              },
              landCessionType: { 
                type: "string", 
                description: "Forma de cessão (COMODATO, arrendamento, parceria, etc) - procure por essas palavras-chave em TODO o documento" 
              },

              // Atividades rurais detalhadas (seção 3.2)
              ruralActivitiesPlanting: { 
                type: "string", 
                description: "Atividades de PLANTIO (ex: 'CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ')" 
              },
              ruralActivitiesBreeding: { 
                type: "string", 
                description: "Atividades de CRIAÇÃO (ex: 'GALINHA E PORCO')" 
              },
              ruralActivitiesSubsistence: { 
                type: "boolean", 
                description: "Se é para subsistência" 
              },
              ruralActivitiesSale: { 
                type: "boolean", 
                description: "Se é para venda" 
              },
              
              // Atividade rural
              ruralPeriods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startDate: { type: "string", description: "Data início YYYY-MM-DD" },
                    endDate: { type: "string", description: "Data fim YYYY-MM-DD" },
                    location: { type: "string", description: "Local COMPLETO" },
                    withWhom: { type: "string", description: "Com quem morava" },
                    activities: { type: "string", description: "Atividades desenvolvidas" }
                  },
                  required: ["startDate", "location"]
                },
                description: "TODOS os períodos de atividade rural"
              },
              urbanPeriods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startDate: { type: "string" },
                    endDate: { type: "string" },
                    details: { type: "string" }
                  }
                }
              },
              familyMembers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    relationship: { type: "string" }
                  }
                },
                description: "Membros do grupo familiar (apenas nome e parentesco)"
              },
              
              // Grupo familiar completo (seção 2.2)
              familyMembersDetailed: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Nome completo" },
                    birthDate: { type: "string", description: "Data nascimento YYYY-MM-DD" },
                    cpf: { type: "string", description: "CPF sem formatação (11 dígitos)" },
                    maritalStatus: { type: "string", description: "Estado civil" },
                    relationship: { type: "string", description: "Parentesco (marido, mãe, pai, etc)" }
                  }
                },
                description: "Lista COMPLETA de membros do grupo familiar conforme seção 2.2 da autodeclaração"
              },
              
              // Histórico Escolar (NOVO - SEMPRE EXTRAIR!)
              schoolHistory: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    instituicao: { type: "string", description: "Nome COMPLETO da escola OBRIGATÓRIO" },
                    periodo_inicio: { type: "string", description: "Data início dos estudos YYYY-MM-DD OBRIGATÓRIO" },
                    periodo_fim: { type: "string", description: "Data fim dos estudos YYYY-MM-DD ou vazio" },
                    serie_ano: { type: "string", description: "Série/ano cursado" },
                    localizacao: { type: "string", description: "Localização da escola - CRÍTICO: mencionar se é ZONA RURAL ou URBANA + município/UF OBRIGATÓRIO" }
                  },
                  required: ["instituicao", "periodo_inicio", "localizacao"]
                },
                description: "⚠️ CRÍTICO: Se houver HISTÓRICO ESCOLAR ou DECLARAÇÃO ESCOLAR, este campo é OBRIGATÓRIO! Escola em zona rural = prova material de vínculo rural!"
              },
              
              // Declaração de Saúde UBS (NOVO - SEMPRE EXTRAIR!)
              healthDeclarationUbs: {
                type: "object",
                properties: {
                  unidade_saude: { type: "string", description: "Nome da UBS/Posto de Saúde OBRIGATÓRIO" },
                  tratamento_desde: { type: "string", description: "Desde quando recebe tratamento YYYY-MM-DD OBRIGATÓRIO" },
                  tipo_tratamento: { type: "string", description: "Tipo de tratamento/acompanhamento (pré-natal, consultas, etc)" },
                  localizacao: { type: "string", description: "Localização da UBS - CRÍTICO: mencionar se é ZONA RURAL ou URBANA + município/UF OBRIGATÓRIO" },
                  profissional_responsavel: { type: "string", description: "Médico/Enfermeiro responsável + CRM/COREN" },
                  observacoes_medicas: { type: "string", description: "Observações sobre a autora" }
                },
                required: ["unidade_saude", "tratamento_desde", "localizacao"],
                description: "⚠️ CRÍTICO: Se houver DECLARAÇÃO DE SAÚDE/UBS, este campo é OBRIGATÓRIO! UBS em zona rural = prova material de residência rural!"
              },
              
              // Processo administrativo
              raProtocol: { type: "string", description: "Número do protocolo/NB" },
              raRequestDate: { type: "string", description: "Data do requerimento YYYY-MM-DD" },
              raDenialDate: { type: "string", description: "Data do indeferimento YYYY-MM-DD" },
              raDenialReason: { type: "string", description: "Motivo COMPLETO do indeferimento" },
              
              // Observações
              observations: {
                type: "array",
                items: { type: "string" },
                description: "Observações importantes"
              },
              
              // Confiança na extração
              extractionConfidence: {
                type: "object",
                properties: {
                  childNameConfidence: { 
                    type: "string", 
                    enum: ["high", "medium", "low"],
                    description: "Nível de confiança na extração do nome da criança. Use 'low' se houver dúvida entre nome da mãe e da criança, ou se a certidão não deixar claro qual é o nome do registrado. Use 'high' apenas quando tiver certeza ABSOLUTA que childName é DIFERENTE de motherName." 
                  }
                },
                description: "Nível de confiança em campos críticos (use para sinalizar quando houver ambiguidade ou risco de confusão)"
              }
            },
            required: [],
          },
        },
      ],
      function_call: { name: "extract_case_info" },
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error("[IA BATCH] Erro na resposta da API OpenAI:", aiResponse.status);
    console.error("[IA BATCH] Detalhes do erro:", errorText);
    throw new Error(`Erro na API OpenAI: ${aiResponse.status}`);
  }

  const aiResult = await aiResponse.json();
  console.log("[IA BATCH] Resposta recebida com sucesso");

  // Extrair dados do function call
  const functionCall = aiResult.choices?.[0]?.message?.function_call;
  if (!functionCall || functionCall.name !== 'extract_case_info') {
    console.error("[IA BATCH] Resposta não contém function call esperado");
    console.error("[IA BATCH] Resposta completa:", JSON.stringify(aiResult, null, 2));
    throw new Error('A IA não retornou os dados no formato esperado');
  }
  
  const extractedData = JSON.parse(functionCall.arguments);
  console.log("[IA BATCH] ===== DADOS EXTRAÍDOS =====");
  console.log("[IA BATCH] Dados completos:", JSON.stringify(extractedData, null, 2));
  
  // Log específico para novos campos
  if (extractedData.schoolHistory && extractedData.schoolHistory.length > 0) {
    console.log("[IA BATCH] ✅ Histórico Escolar extraído:", extractedData.schoolHistory.length, "registro(s)");
  } else {
    console.log("[IA BATCH] ⚠️ Histórico Escolar NÃO extraído");
  }
  
  if (extractedData.healthDeclarationUbs) {
    console.log("[IA BATCH] ✅ Declaração de Saúde UBS extraída:", extractedData.healthDeclarationUbs.unidade_saude);
  } else {
    console.log("[IA BATCH] ⚠️ Declaração de Saúde UBS NÃO extraída");
  }
  
  if (extractedData.landOwnerCpf) {
    console.log("[IA BATCH] ✅ CPF do proprietário da terra extraído:", extractedData.landOwnerCpf);
  } else {
    console.log("[IA BATCH] ⚠️ CPF do proprietário da terra NÃO extraído");
  }
  
  if (extractedData.landArea) {
    console.log("[IA BATCH] ✅ Área da terra extraída:", extractedData.landArea, "ha");
  } else {
    console.log("[IA BATCH] ⚠️ Área da terra NÃO extraída");
  }
  
  console.log("[IA BATCH] ================================");
  
  return extractedData;
}
