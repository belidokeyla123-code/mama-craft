// Prompts específicos por tipo de documento

export function buildPromptForDocType(docType: string, fileName: string): string {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 5;

  const basePrompt = `Você é um especialista em análise documental jurídica para processos previdenciários. 
Analise o documento "${fileName}" e extraia todas as informações relevantes com MÁXIMA PRECISÃO.

⚠️ CRÍTICO: RETORNE APENAS JSON VÁLIDO! SUA RESPOSTA DEVE COMEÇAR COM { E TERMINAR COM }
NÃO adicione texto explicativo antes ou depois do JSON.
NÃO comece com "Aqui está..." ou "Segue..." ou qualquer outro texto.
APENAS JSON PURO!

🎯 **EXEMPLOS DE CLASSIFICAÇÃO INTELIGENTE (baseie-se no NOME do arquivo):**
- "CONTRATO_DE_COMODATO.pdf" → documento_terra
- "CONTRATO DE ARRENDAMENTO.pdf" → documento_terra
- "ITR 2023.pdf" → documento_terra
- "CCIR.pdf" → documento_terra
- "AUTODECLARAÇÃO RURAL.pdf" → autodeclaracao_rural
- "AUTODECLARAÇÃO DE SEGURADA ESPECIAL.pdf" → autodeclaracao_rural
- "AUTO DECLARACAO RURAL.pdf" → autodeclaracao_rural
- "RG.pdf" → identificacao
- "CPF.pdf" → identificacao
- "IDENTIDADE.pdf" → identificacao
- "CERTIDÃO DE NASCIMENTO.pdf" → certidao_nascimento
- "COMPROVANTE DE ENDEREÇO.pdf" → comprovante_residencia
- "CONTA DE LUZ.pdf" → comprovante_residencia

REGRAS GERAIS:
- Extraia APENAS informações explícitas e legíveis no documento
- Se um campo não estiver visível/legível, retorne null
- Datas devem ser no formato YYYY-MM-DD
- CPF/RG sem formatação (apenas números)
- Valores numéricos sem símbolos de moeda

`;

  const specificPrompts: Record<string, string> = {
    procuracao: `📝 PROCURAÇÃO - ATENÇÃO MÁXIMA!

**CAMPO MAIS IMPORTANTE:**
- granterName: Nome do OUTORGANTE (pessoa que ASSINA a procuração e DÁ poderes)
  → É o CLIENTE, não o advogado!
  → Geralmente aparece no topo: "Fulano de Tal, CPF xxx, outorga poderes a..."
  → Este campo é OBRIGATÓRIO!

**OUTROS CAMPOS:**
- granterCpf: CPF do cliente/outorgante (apenas números)
- attorneyName: Nome do ADVOGADO/PROCURADOR (quem RECEBE os poderes)
- attorneyCpf: CPF do advogado
- oabNumber: Número da OAB do advogado
- signatureDate: Data da assinatura (YYYY-MM-DD)

⚠️ REGRA CRÍTICA: NÃO confundir outorgante (cliente) com outorgado (advogado)!
O cliente é quem DÁ o poder, o advogado é quem RECEBE.

EXEMPLO:
Input: "Maria da Silva, CPF 123.456.789-00, outorga poderes ao Dr. João Santos, OAB/SP 12345"
Output:
{
  "granterName": "Maria da Silva",
  "granterCpf": "12345678900",
  "attorneyName": "João Santos",
  "oabNumber": "OAB/SP 12345"
}`,

    certidao_nascimento: `🚨 CERTIDÃO DE NASCIMENTO - ATENÇÃO MÁXIMA!

**VALIDAÇÃO CRÍTICA DE CONTEXTO:**
🎯 Esta certidão é de um processo de SALÁRIO-MATERNIDADE.
   → A criança deve ter nascido NOS ÚLTIMOS 5 ANOS (${minYear}-${currentYear})
   → Se a data de nascimento é MUITO ANTIGA (ex: 2002, 1999), 
      esta é a certidão DA MÃE, NÃO da criança!

**EXTRAIR (não confundir):**
1. childName: Nome da CRIANÇA (recém-nascida, nascida entre ${minYear}-${currentYear})
2. childBirthDate: Data nascimento DA CRIANÇA (formato YYYY-MM-DD)
   ⚠️ DEVE ser entre ${minYear}-${currentYear}! Se for antes, é certidão ERRADA!
3. motherName: Nome da MÃE (seção "FILIAÇÃO MATERNA")
4. motherCpf: CPF da MÃE
5. fatherName: Nome do PAI (seção "FILIAÇÃO PATERNA")

**SE A DATA DE NASCIMENTO FOR ANTES DE ${minYear}:**
→ Retorne childName e childBirthDate como null
→ Adicione warning: "Esta é a certidão de nascimento da mãe, não da criança"

**REGRAS CRÍTICAS:**
- childName ≠ motherName (NUNCA podem ser iguais!)
- childBirthDate deve ser RECENTE (${minYear}-${currentYear})
- Se a certidão é de ${minYear - 10} ou antes, é da MÃE, não da criança!

EXEMPLO DE ERRO COMUM:
Input: Certidão com data "27/12/2002"
Output CORRETO:
{
  "childName": null,
  "childBirthDate": null,
  "motherName": "Fulana de Tal",
  "warning": "Certidão de nascimento da mãe (2002). Solicitar certidão da CRIANÇA."
}`,

    identificacao: `📇 DOCUMENTO DE IDENTIFICAÇÃO

Extrair com atenção:
- fullName: Nome completo da pessoa
- cpf: CPF (apenas números)
- rg: RG completo com órgão expedidor (ex: 12.345.678-9 SSP/SP)
- birthDate: Data de nascimento (YYYY-MM-DD)
- motherName: Nome da mãe (filiação)
- fatherName: Nome do pai (filiação)

Se o documento for RG Nacional (novo formato), extrair também o número do novo formato.`,

    cnis: `📋 CNIS - CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS

Extrair:
- nit: NIT/PIS/PASEP
- Vínculos empregatícios (períodos, empregadores)
- Contribuições
- Benefícios anteriores (NB, tipo, período)
- Remunerações

IMPORTANTE: Benefícios anteriores devem ter NB no formato XXX.XXX.XXX-X`,

    autodeclaracao_rural: `🌾 AUTODECLARAÇÃO DE TRABALHO RURAL

⚠️ CRÍTICO: Extrair TODAS as datas mencionadas!

**EXTRAIR OBRIGATORIAMENTE:**
{
  "declarationDate": "data da autodeclaração (YYYY-MM-DD)",
  "ruralActivityStartDate": "data de INÍCIO da atividade rural declarada (YYYY-MM-DD)",
  "ruralActivityEndDate": "data FIM (se aplicável) ou null se ainda ativa (YYYY-MM-DD)",
  "ruralLocation": "município e estado da atividade",
  "activities": "atividades rurais descritas (plantio, criação, etc)",
  "familyMembers": ["lista de membros da família mencionados"],
  "landOwnerName": "nome do proprietário da terra",
  "landOwnerCpf": "CPF do proprietário"
}

**REGRAS CRÍTICAS:**
1. Se mencionar "desde XXXX", extrair como ruralActivityStartDate
2. Se disser "até hoje" ou "atualmente", ruralActivityEndDate deve ser null
3. A declarationDate é a data em que o documento foi assinado
4. Estas datas são ESSENCIAIS para comprovar carência de 10 meses`,

    documento_terra: `🏞️ DOCUMENTO DA TERRA (ITR, Escritura, CCIR, INCRA, etc)

⚠️ CRÍTICO: Este documento DEVE conter DATAS que comprovam a atividade rural!

**EXTRAIR OBRIGATORIAMENTE:**
{
  "documentType": "tipo do documento (ITR, Escritura, CCIR, CAR, INCRA, etc)",
  "documentDate": "data de emissão do documento (YYYY-MM-DD)",
  "landOwnerName": "nome completo do proprietário da terra",
  "landOwnerCpf": "CPF do proprietário (apenas números)",
  "landOwnerRg": "RG do proprietário",
  "ruralActivityStartDate": "data de início da atividade rural mencionada (YYYY-MM-DD)",
  "ruralActivityEndDate": "data fim da atividade rural se mencionada (YYYY-MM-DD)",
  "landArea": "área total em hectares",
  "landLocation": "município e estado",
  "registrationNumber": "número de matrícula/registro/inscrição"
}

**REGRAS CRÍTICAS:**
1. A data do documento (documentDate) é ESSENCIAL para comprovar período de atividade rural
2. Se o documento menciona "desde" ou "a partir de", extrair como ruralActivityStartDate
3. Documentos do tipo ITR mostram atividade rural NO ANO de referência do imposto
4. CAR (Cadastro Ambiental Rural) e CCIR também comprovam atividade rural na data de emissão
5. Se não houver data explícita de início, use a data de emissão como referência

EXEMPLO:
Input: "ITR 2020 - Propriedade Rural 'Sítio Boa Vista' - João Silva, CPF 123.456.789-00"
Output:
{
  "documentType": "ITR",
  "documentDate": "2020-12-31",
  "landOwnerName": "João Silva",
  "landOwnerCpf": "12345678900",
  "ruralActivityStartDate": "2020-01-01"
}`,

    processo_administrativo: `📄 PROCESSO ADMINISTRATIVO / REQUERIMENTO ADMINISTRATIVO

Extrair:
- raProtocol: Número do protocolo/NB
- raRequestDate: Data do requerimento
- raDenialDate: Data do indeferimento
- raDenialReason: Motivo literal e completo do indeferimento
- benefitType: Tipo do benefício solicitado`,

    historico_escolar: `🎓 HISTÓRICO ESCOLAR

Extrair:
- studentName: Nome do aluno
- schoolName: Nome da escola
- period: Período/ano letivo
- grades: Série/ano cursado`,

    declaracao_saude_ubs: `🏥 DECLARAÇÃO DE SAÚDE (UBS/Posto de Saúde)

Extrair:
- patientName: Nome do paciente
- healthUnit: Nome da UBS/Posto
- declarationDate: Data da declaração
- content: Conteúdo da declaração`,

    comprovante_residencia: `🏠 COMPROVANTE DE RESIDÊNCIA - ATENÇÃO MÁXIMA!

**VOCÊ ESTÁ ANALISANDO UM COMPROVANTE DE RESIDÊNCIA**

Procure por qualquer um destes tipos de documento:
- 💡 Conta de luz (energia elétrica)
- 💧 Conta de água
- 📞 Conta de telefone/internet
- 🏦 Extrato bancário com endereço
- 📄 Contrato de aluguel
- 🏘️ Declaração de residência
- 📬 Correspondências oficiais (INSS, Receita Federal, etc.)

**EXTRAIR OBRIGATORIAMENTE:**
{
  "address": "Endereço COMPLETO (rua, número, complemento, bairro, cidade, UF, CEP)",
  "addressType": "tipo do comprovante (ex: conta de luz, água, telefone, contrato)",
  "issueDate": "data de emissão do documento (YYYY-MM-DD)",
  "holderName": "nome do titular da conta/documento",
  "referenceMonth": "mês de referência (se aplicável)"
}

⚠️ REGRAS CRÍTICAS:
1. Se não conseguir extrair o ENDEREÇO COMPLETO → retorne ERROR
2. O endereço deve incluir: rua/avenida, número, bairro, cidade e CEP
3. Se a imagem estiver ilegível → retorne ERROR e peça reenvio
4. Se não for um comprovante de residência válido → retorne ERROR

EXEMPLO DE RESPOSTA:
{
  "address": "Rua das Flores, 123, Apto 45, Centro, Manaus-AM, CEP 69000-000",
  "addressType": "conta de luz",
  "issueDate": "2025-10-15",
  "holderName": "Maria da Silva",
  "referenceMonth": "2025-10"
}`
  };

  return basePrompt + (specificPrompts[docType] || '');
}
