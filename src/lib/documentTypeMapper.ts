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
    "procuracao": "procuracao",
    "cnis": "cnis",
    "histórico": "cnis",
    "historico": "cnis",
    "ficha de atendimento": "ficha_atendimento",
    "carteira de pescador": "carteira_pescador",
    "carteira pescador": "carteira_pescador",
  };
  
  const normalized = docType.toLowerCase().trim();
  return mapping[normalized] || "outro";
};

export const sanitizeFileName = (name: string): string => {
  return name
    .replace(/~/g, '_')        // ~ → _
    .replace(/[<>:"|?*]/g, '') // Caracteres inválidos do Windows
    .replace(/\s+/g, '_')      // Espaços → _
    .trim();
};
