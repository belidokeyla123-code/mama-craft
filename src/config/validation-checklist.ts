/**
 * Checklist completo de documentos para Ação de Auxílio-Maternidade Rural
 * Baseado nas melhores práticas jurídicas e requisitos do INSS
 */

export interface DocumentChecklistItem {
  id: string;
  label: string;
  description?: string;
  category: 'imprescindivel' | 'pessoal' | 'complementar' | 'extras' | 'tecnico_interno';
  required: boolean;
}

export const VALIDATION_CHECKLIST: DocumentChecklistItem[] = [
  // 1️⃣ DOCUMENTOS IMPRESCINDÍVEIS (bloqueiam se não tiver)
  {
    id: 'rg_cpf_mae',
    label: 'RG e CPF da mãe',
    description: 'Documentos de identificação da segurada',
    category: 'imprescindivel',
    required: true,
  },
  {
    id: 'certidao_nascimento_filho',
    label: 'Certidão de nascimento do filho',
    description: 'Ou natimorto, se for o caso',
    category: 'imprescindivel',
    required: true,
  },
  {
    id: 'autodeclaracao',
    label: 'Autodeclaração',
    description: 'Declaração de atividade rural assinada pela segurada',
    category: 'imprescindivel',
    required: true,
  },
  {
    id: 'comprovante_residencia',
    label: 'Comprovante de residência',
    description: 'Mesmo que simples, rural ou urbano',
    category: 'imprescindivel',
    required: true,
  },

  // 2️⃣ DOCUMENTOS PESSOAIS DA SEGURADA
  {
    id: 'nit_pis_pasep',
    label: 'Número do NIT/PIS/PASEP',
    category: 'pessoal',
    required: false,
  },
  {
    id: 'certidao_casamento',
    label: 'Certidão de casamento',
    description: 'Se constar profissão como agricultora, reforça o vínculo rural',
    category: 'pessoal',
    required: false,
  },

  // 3️⃣ DOCUMENTOS COMPLEMENTARES (Prova Indireta)
  {
    id: 'docs_conjuge_pais',
    label: 'Documentos do cônjuge ou pais com profissão "lavrador(a)" ou "agricultor(a)"',
    category: 'complementar',
    required: false,
  },
  {
    id: 'certidao_filhos_anteriores',
    label: 'Certidão de nascimento dos filhos anteriores com profissão rural dos pais',
    category: 'complementar',
    required: false,
  },
  {
    id: 'historico_escolar',
    label: 'Histórico escolar de filhos indicando escola rural',
    category: 'complementar',
    required: false,
  },
  {
    id: 'ficha_saude_rural',
    label: 'Ficha de atendimento em posto de saúde rural',
    description: 'Pré-natal, vacina, etc.',
    category: 'complementar',
    required: false,
  },
  {
    id: 'declaracao_vizinhos',
    label: 'Declaração de vizinhos',
    description: 'Testemunhos escritos com local de residência e atividade',
    category: 'complementar',
    required: false,
  },
  {
    id: 'declaracao_lider',
    label: 'Declaração de líder comunitário, presidente de associação ou padre/pastor local',
    category: 'complementar',
    required: false,
  },
  {
    id: 'bloco_produtor',
    label: 'Bloco de produtor rural',
    category: 'complementar',
    required: false,
  },
  {
    id: 'notas_fiscais',
    label: 'Notas fiscais de vendas de produto agrícola',
    category: 'complementar',
    required: false,
  },
  {
    id: 'contrato_comodato',
    label: 'Contrato de comodato',
    category: 'complementar',
    required: false,
  },
  {
    id: 'pronaf',
    label: 'Declaração de aptidão do PRONAF',
    category: 'complementar',
    required: false,
  },
  {
    id: 'sindicato_associacao',
    label: 'Comprovante de cadastro em sindicatos rurais ou associações',
    category: 'complementar',
    required: false,
  },
  {
    id: 'recibo_cooperativa',
    label: 'Recibo de entrega de produção em cooperativas',
    category: 'complementar',
    required: false,
  },
  {
    id: 'certidao_incra',
    label: 'Certidão do INCRA',
    category: 'complementar',
    required: false,
  },
  {
    id: 'declaracao_itr',
    label: 'Declaração do ITR',
    category: 'complementar',
    required: false,
  },
  {
    id: 'energia_eletrica_rural',
    label: 'Comprovante de energia elétrica rural',
    category: 'complementar',
    required: false,
  },
  {
    id: 'cnis',
    label: 'CNIS (Cadastro Nacional de Informações Sociais)',
    category: 'complementar',
    required: false,
  },
  {
    id: 'documento_terra',
    label: 'Documento da terra',
    description: 'Escritura, ITR, contrato, etc.',
    category: 'complementar',
    required: false,
  },

  // 4️⃣ EXTRAS QUE FAZEM DIFERENÇA
  {
    id: 'declaracao_prefeitura',
    label: 'Declaração da prefeitura ou sindicato rural confirmando que a autora é agricultora familiar',
    category: 'extras',
    required: false,
  },
  {
    id: 'fotos_antigas',
    label: 'Fotos antigas',
    description: 'Autora grávida em ambiente rural, colheita, etc.',
    category: 'extras',
    required: false,
  },
  {
    id: 'certidao_negativa_cnis',
    label: 'Cópia de certidão negativa de vínculo urbano no CNIS',
    category: 'extras',
    required: false,
  },
  {
    id: 'cnis_atualizado',
    label: 'CNIS atualizado',
    category: 'extras',
    required: false,
  },
  {
    id: 'entrevista_rural',
    label: 'Entrevista rural bem estruturada',
    description: 'Roteiro de perguntas e respostas consistentes',
    category: 'extras',
    required: false,
  },

  // 🧠 CHECKLIST TÉCNICO INTERNO (para o advogado revisar antes de ajuizar)
  {
    id: 'atividade_10_meses',
    label: 'Autora comprova atividade rural nos 10 meses anteriores ao parto',
    category: 'tecnico_interno',
    required: true,
  },
  {
    id: 'sem_vinculo_urbano',
    label: 'Autora NÃO possui vínculo urbano ativo no período',
    category: 'tecnico_interno',
    required: true,
  },
  {
    id: 'prova_material',
    label: 'Prova material em nome próprio ou do grupo familiar',
    category: 'tecnico_interno',
    required: true,
  },
  {
    id: 'procuracao',
    label: 'PROCURAÇÃO',
    description: 'Sem isso não pode distribuir!',
    category: 'tecnico_interno',
    required: true,
  },
  {
    id: 'contrato',
    label: 'CONTRATO',
    description: 'Para calcular honorários no financeiro',
    category: 'tecnico_interno',
    required: true,
  },
];

export const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    imprescindivel: '1️⃣ Documentos IMPRESCINDÍVEIS',
    pessoal: '2️⃣ Documentos Pessoais da Segurada',
    complementar: '3️⃣ Documentos Complementares (Prova Indireta)',
    extras: '4️⃣ Extras que Fazem Diferença',
    tecnico_interno: '🧠 Checklist Técnico Interno (para o advogado revisar antes de ajuizar)',
  };
  return labels[category] || category;
};

export const getRequiredDocuments = (): DocumentChecklistItem[] => {
  return VALIDATION_CHECKLIST.filter(item => item.required);
};

export const getDocumentsByCategory = (category: string): DocumentChecklistItem[] => {
  return VALIDATION_CHECKLIST.filter(item => item.category === category);
};
