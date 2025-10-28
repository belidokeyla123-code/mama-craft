export const mapDocumentTypeToEnum = (docType: string): string => {
  const mapping: Record<string, string> = {
    // Mapeamento de nomes descritivos da IA
    "rg da autora": "identificacao",
    "rg": "identificacao",
    "cpf da autora": "identificacao",
    "cpf": "identificacao",
    "identidade": "identificacao",
    "identificação": "identificacao",
    
    "certidão de nascimento da criança": "certidao_nascimento",
    "certidão de nascimento": "certidao_nascimento",
    "certidao de nascimento": "certidao_nascimento",
    "nascimento": "certidao_nascimento",
    
    "autodeclaração rural": "autodeclaracao_rural",
    "autodeclaração": "autodeclaracao_rural",
    "declaração rural": "autodeclaracao_rural",
    
    "documento da terra": "documento_terra",
    "documentos da terra": "documento_terra",
    "propriedade": "documento_terra",
    "itr": "documento_terra",
    
    "processo administrativo": "processo_administrativo",
    "requerimento administrativo": "processo_administrativo",
    "indeferimento": "processo_administrativo",
    
    "comprovante de residência": "comprovante_residencia",
    "comprovante de endereco": "comprovante_residencia",
    "comprovante": "comprovante_residencia",
    
    "procuração": "procuracao",
    "cnis": "cnis",
    "ficha de atendimento": "ficha_atendimento",
    "carteira de pescador": "carteira_pescador",
    
    // NOVOS TIPOS
    "histórico escolar": "historico_escolar",
    "historico escolar": "historico_escolar",
    "boletim": "historico_escolar",
    "declaração escolar": "historico_escolar",
    "escola": "historico_escolar",
    
    "declaração de saúde": "declaracao_saude_ubs",
    "declaracao de saude": "declaracao_saude_ubs",
    "declaração ubs": "declaracao_saude_ubs",
    "ubs": "declaracao_saude_ubs",
    "posto de saúde": "declaracao_saude_ubs",
    "unidade básica": "declaracao_saude_ubs",
    "saúde": "declaracao_saude_ubs",
  };
  
  const normalized = docType.toLowerCase().trim();
  return mapping[normalized] || "outro";
};

// Sanitizar nome do arquivo (remover caracteres inválidos do Windows)
export const sanitizeFileName = (name: string): string => {
  return name
    .replace(/~/g, '_')        // ~ → _
    .replace(/[<>:"|?*]/g, '') // Caracteres inválidos do Windows
    .replace(/\s+/g, '_')      // Espaços → _
    .trim();
};
