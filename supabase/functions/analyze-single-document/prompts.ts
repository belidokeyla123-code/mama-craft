// Prompts específicos por tipo de documento

export function buildPromptForDocType(docType: string, fileName: string): string {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 5;

  const basePrompt = `Você é um especialista em análise documental jurídica para processos previdenciários. 
Analise o documento "${fileName}" e extraia todas as informações relevantes com MÁXIMA PRECISÃO.

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

Extrair:
- Períodos de trabalho rural (início, fim, local, atividades)
- Membros da família
- Nome do proprietário da terra
- CPF do proprietário`,

    documento_terra: `🏞️ DOCUMENTO DA TERRA (ITR, Escritura, CCIR, etc)

Extrair:
- landOwnerName: Nome completo do proprietário
- landOwnerCpf: CPF do proprietário
- landOwnerRg: RG do proprietário
- Área total
- Localização
- Número de matrícula/registro`,

    processo_administrativo: `📄 PROCESSO ADMINISTRATIVO / REQUERIMENTO ADMINISTRATIVO

Extrair:
- raProtocol: Número do protocolo/NB
- raRequestDate: Data do requerimento
- raDenialDate: Data do indeferimento
- raDenialReason: Motivo literal e completo do indeferimento
- benefitType: Tipo do benefício solicitado`,

    comprovante_residencia: `🏠 COMPROVANTE DE RESIDÊNCIA

Extrair:
- holderName: Nome do titular
- address: Endereço completo
- city: Cidade
- state: UF
- zipCode: CEP
- referenceDate: Data de referência`,

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
- content: Conteúdo da declaração`
  };

  return basePrompt + (specificPrompts[docType] || '');
}
