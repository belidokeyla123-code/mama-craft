export interface PlaceholderMap {
  [key: string]: string | number | null;
}

export const extractPlaceholders = (caseData: any, analysis: any): PlaceholderMap => {
  return {
    // Identificação da Autora (Mãe)
    '{{AUTOR_NOME}}': caseData.author_name || caseData.authorName,
    '{{AUTOR_CPF}}': caseData.author_cpf || caseData.authorCpf,
    '{{AUTOR_RG}}': caseData.author_rg || caseData.authorRg,
    '{{AUTOR_ENDERECO}}': caseData.author_address || caseData.authorAddress,
    '{{AUTOR_DATA_NASCIMENTO}}': caseData.author_birth_date || caseData.authorBirthDate,
    '{{AUTOR_ESTADO_CIVIL}}': caseData.author_marital_status || caseData.authorMaritalStatus,
    '{{AUTOR_TELEFONE}}': caseData.author_phone || caseData.authorPhone,
    '{{AUTOR_WHATSAPP}}': caseData.author_whatsapp || caseData.authorWhatsapp,
    
    // Criança
    '{{FILHO_NOME}}': caseData.child_name || caseData.childName,
    '{{FILHO_DATA_NASCIMENTO}}': caseData.child_birth_date || caseData.childBirthDate,
    '{{PAI_NOME}}': caseData.father_name || caseData.fatherName,
    
    // Processo Administrativo
    '{{RA_PROTOCOLO}}': caseData.ra_protocol || caseData.raProtocol,
    '{{RA_DATA_REQUERIMENTO}}': caseData.ra_request_date || caseData.raRequestDate,
    '{{RA_DATA_INDEFERIMENTO}}': caseData.ra_denial_date || caseData.raDenialDate,
    '{{RA_MOTIVO_NEGATIVA}}': caseData.ra_denial_reason || caseData.raDenialReason,
    
    // Valores Financeiros
    '{{RMI}}': analysis?.rmi?.valor_final || analysis?.rmi?.valor || caseData.rmi_calculated,
    '{{VALOR_CAUSA}}': analysis?.valor_causa || caseData.valor_causa,
    '{{SALARIO_MINIMO_REF}}': caseData.salario_minimo_ref || caseData.salarioMinimoRef || 1412.00,
    
    // Qualidade de Segurada
    '{{QUALIDADE_SEGURADA}}': analysis?.qualidade_segurada?.tipo,
    '{{QUALIDADE_COMPROVADA}}': analysis?.qualidade_segurada?.comprovado ? 'Sim' : 'Não',
    '{{CARENCIA_NECESSARIA}}': analysis?.carencia?.necessaria ? 'Sim' : 'Não',
    '{{CARENCIA_CUMPRIDA}}': analysis?.carencia?.cumprida ? 'Sim' : 'Não',
    '{{CARENCIA_MESES_FALTANTES}}': analysis?.carencia?.meses_faltantes || 0,
    
    // Propriedade Rural
    '{{PROPRIETARIO_NOME}}': caseData.land_owner_name || caseData.landOwnerName,
    '{{PROPRIETARIO_CPF}}': caseData.land_owner_cpf || caseData.landOwnerCpf,
    '{{PROPRIETARIO_RG}}': caseData.land_owner_rg || caseData.landOwnerRg,
    '{{TIPO_PROPRIEDADE}}': caseData.land_ownership_type || caseData.landOwnershipType,
    '{{NOME_PROPRIEDADE}}': caseData.land_property_name || caseData.landPropertyName,
    '{{MUNICIPIO_PROPRIEDADE}}': caseData.land_municipality || caseData.landMunicipality,
    '{{AREA_TOTAL}}': caseData.land_total_area || caseData.landTotalArea,
    '{{AREA_EXPLORADA}}': caseData.land_exploited_area || caseData.landExploitedArea,
    '{{ITR}}': caseData.land_itr || caseData.landITR,
    
    // Atividade Rural
    '{{ATIVIDADE_RURAL_DESDE}}': caseData.rural_activity_since || caseData.ruralActivitySince,
    '{{ATIVIDADES_PLANTIO}}': caseData.rural_activities_planting || caseData.ruralActivitiesPlanting,
    '{{ATIVIDADES_CRIACAO}}': caseData.rural_activities_breeding || caseData.ruralActivitiesBreeding,
    
    // Perfil e Evento
    '{{PERFIL}}': caseData.profile,
    '{{TIPO_EVENTO}}': caseData.event_type || caseData.eventType,
    '{{DATA_EVENTO}}': caseData.event_date || caseData.eventDate,
    
    // Probabilidade de Êxito
    '{{PROBABILIDADE_EXITO_SCORE}}': analysis?.probabilidade_exito?.score,
    '{{PROBABILIDADE_EXITO_NIVEL}}': analysis?.probabilidade_exito?.nivel,
  };
};

export const generatePlaceholderList = (placeholders: PlaceholderMap): string => {
  let output = '═════════════════════════════════════════════════\n';
  output += '   LISTA DE PLACEHOLDERS DISPONÍVEIS\n';
  output += '═════════════════════════════════════════════════\n\n';
  output += 'Use estes placeholders no seu template DOCX.\n';
  output += 'Eles serão substituídos pelos dados do caso.\n\n';
  output += '─────────────────────────────────────────────────\n\n';
  
  const categories = {
    'IDENTIFICAÇÃO DA AUTORA': [
      'AUTOR_NOME', 'AUTOR_CPF', 'AUTOR_RG', 'AUTOR_ENDERECO', 
      'AUTOR_DATA_NASCIMENTO', 'AUTOR_ESTADO_CIVIL', 'AUTOR_TELEFONE', 'AUTOR_WHATSAPP'
    ],
    'DADOS DA CRIANÇA': [
      'FILHO_NOME', 'FILHO_DATA_NASCIMENTO', 'PAI_NOME'
    ],
    'PROCESSO ADMINISTRATIVO': [
      'RA_PROTOCOLO', 'RA_DATA_REQUERIMENTO', 'RA_DATA_INDEFERIMENTO', 'RA_MOTIVO_NEGATIVA'
    ],
    'VALORES FINANCEIROS': [
      'RMI', 'VALOR_CAUSA', 'SALARIO_MINIMO_REF'
    ],
    'QUALIDADE DE SEGURADA': [
      'QUALIDADE_SEGURADA', 'QUALIDADE_COMPROVADA', 
      'CARENCIA_NECESSARIA', 'CARENCIA_CUMPRIDA', 'CARENCIA_MESES_FALTANTES'
    ],
    'PROPRIEDADE RURAL': [
      'PROPRIETARIO_NOME', 'PROPRIETARIO_CPF', 'PROPRIETARIO_RG',
      'TIPO_PROPRIEDADE', 'NOME_PROPRIEDADE', 'MUNICIPIO_PROPRIEDADE',
      'AREA_TOTAL', 'AREA_EXPLORADA', 'ITR'
    ],
    'ATIVIDADE RURAL': [
      'ATIVIDADE_RURAL_DESDE', 'ATIVIDADES_PLANTIO', 'ATIVIDADES_CRIACAO'
    ],
    'PERFIL E EVENTO': [
      'PERFIL', 'TIPO_EVENTO', 'DATA_EVENTO'
    ],
    'PROBABILIDADE DE ÊXITO': [
      'PROBABILIDADE_EXITO_SCORE', 'PROBABILIDADE_EXITO_NIVEL'
    ]
  };
  
  for (const [category, keys] of Object.entries(categories)) {
    output += `\n📁 ${category}\n`;
    output += '─────────────────────────────────────────────────\n';
    for (const key of keys) {
      const placeholder = `{{${key}}}`;
      const value = placeholders[placeholder];
      const displayValue = value !== null && value !== undefined ? String(value) : '(vazio)';
      output += `${placeholder.padEnd(35)} = ${displayValue}\n`;
    }
  }
  
  output += '\n═════════════════════════════════════════════════\n';
  output += 'Total de placeholders: ' + Object.keys(placeholders).length + '\n';
  output += '═════════════════════════════════════════════════\n';
  
  return output;
};
