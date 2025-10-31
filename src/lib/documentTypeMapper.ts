export const mapDocumentTypeToEnum = (docType: string): string => {
  const mapping: Record<string, string> = {
    // ✅ MAPEAMENTOS RIGOROSOS (com todas as variações)
    // Identificação
    "rg da autora": "identificacao",
    "rg": "identificacao",
    "cpf da autora": "identificacao",
    "cpf": "identificacao",
    "identidade": "identificacao",
    "identificação": "identificacao",
    "identificacao": "identificacao",
    "documento de identidade": "identificacao",
    
    // Certidão de Nascimento
    "certidão de nascimento da criança": "certidao_nascimento",
    "certidão de nascimento": "certidao_nascimento",
    "certidao de nascimento": "certidao_nascimento",
    "certidaonascimento": "certidao_nascimento",
    "nascimento": "certidao_nascimento",
    "certidão": "certidao_nascimento",
    
    // Autodeclaração Rural
    "autodeclaração rural": "autodeclaracao_rural",
    "autodeclaração": "autodeclaracao_rural",
    "autodeclaracao": "autodeclaracao_rural",
    "autodeclaracaorural": "autodeclaracao_rural",
    "declaração rural": "autodeclaracao_rural",
    "declaracao rural": "autodeclaracao_rural",
    
    // Documento da Terra
    "documento da terra": "documento_terra",
    "documentos da terra": "documento_terra",
    "documento terra": "documento_terra",
    "documentoterra": "documento_terra",
    "propriedade": "documento_terra",
    "terra": "documento_terra",
    "itr": "documento_terra",
    "escritura": "documento_terra",
    
    // Processo Administrativo
    "processo administrativo": "processo_administrativo",
    "processo": "processo_administrativo",
    "processoadministrativo": "processo_administrativo",
    "requerimento administrativo": "processo_administrativo",
    "indeferimento": "processo_administrativo",
    "ra": "processo_administrativo",
    
    // Comprovante de Residência
    "comprovante de residência": "comprovante_residencia",
    "comprovante de residencia": "comprovante_residencia",
    "comprovante residencia": "comprovante_residencia",
    "comprovanteresidencia": "comprovante_residencia",
    "comprovante de endereco": "comprovante_residencia",
    "comprovante endereco": "comprovante_residencia",
    "residencia": "comprovante_residencia",
    "endereco": "comprovante_residencia",
    "comprovante": "comprovante_residencia",
    "comp": "comprovante_residencia",
    "3-comp": "comprovante_residencia",
    
    // Procuração
    "procuração": "procuracao",
    "procuracao": "procuracao",
    
    // CNIS
    "cnis": "cnis",
    
    // Histórico Escolar
    "histórico escolar": "historico_escolar",
    "historico escolar": "historico_escolar",
    "historicoescolar": "historico_escolar",
    "boletim": "historico_escolar",
    "declaração escolar": "historico_escolar",
    "escola": "historico_escolar",
    "his": "historico_escolar",
    "11-his": "historico_escolar",
    
    // Declaração de Saúde UBS
    "declaração de saúde": "declaracao_saude_ubs",
    "declaracao de saude": "declaracao_saude_ubs",
    "declaracaosaude": "declaracao_saude_ubs",
    "declaração ubs": "declaracao_saude_ubs",
    "declaracao ubs": "declaracao_saude_ubs",
    "declaracaosaudeubs": "declaracao_saude_ubs",
    "ubs": "declaracao_saude_ubs",
    "posto de saúde": "declaracao_saude_ubs",
    "posto de saude": "declaracao_saude_ubs",
    "unidade básica": "declaracao_saude_ubs",
    "unidade basica": "declaracao_saude_ubs",
    "saúde": "declaracao_saude_ubs",
    "saude": "declaracao_saude_ubs",
    
    // Outros
    "ficha de atendimento": "ficha_atendimento",
    "ficha": "ficha_atendimento",
    "fic": "ficha_atendimento",
    "12-fic": "ficha_atendimento",
    "carteira de pescador": "carteira_pescador",
  };
  
  const normalized = docType.toLowerCase().trim();
  return mapping[normalized] || "outro";
};

// Sanitizar nome do arquivo (remover caracteres inválidos e acentos)
export const sanitizeFileName = (name: string): string => {
  return name
    .normalize('NFD')           // Decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remover diacríticos (acentos)
    .replace(/~/g, '_')         // ~ → _
    .replace(/[<>:"|?*]/g, '')  // Caracteres inválidos do Windows
    .replace(/\s+/g, '_')       // Espaços → _
    .trim();
};
