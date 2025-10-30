/**
 * Sistema de nomenclatura inteligente para documentos
 * Gera nomes de arquivo descritivos baseados no tipo e dados extraídos
 */

interface ExtractedData {
  // Certidão de Nascimento
  childName?: string;
  childBirthDate?: string;
  motherName?: string;
  fatherName?: string;
  
  // Identificação
  fullName?: string;
  rg?: string;
  cpf?: string;
  
  // Procuração
  granterName?: string;
  granterCpf?: string;
  attorneyName?: string;
  
  // Processo Administrativo
  raProtocol?: string;
  raRequestDate?: string;
  
  // Casamento
  spouseName?: string;
  marriageDate?: string;
  
  // CNIS
  nit?: string;
  
  // Terra
  landOwnerName?: string;
  
  // Comprovante Residência
  holderName?: string;
  referenceDate?: string;
  
  // Histórico Escolar
  studentName?: string;
  period?: string;
  
  // Declaração Saúde
  patientName?: string;
  declarationDate?: string;
}

/**
 * Remove acentos e caracteres especiais para nomes de arquivo
 */
function sanitizeName(name: string | undefined): string {
  if (!name) return 'Sem_Nome';
  
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '_')  // Substitui caracteres especiais
    .replace(/\s+/g, '_')              // Substitui espaços por underscore
    .replace(/_+/g, '_')               // Remove underscores duplicados
    .replace(/^_|_$/g, '')             // Remove underscores nas pontas
    .substring(0, 50);                  // Limita tamanho
}

/**
 * Formata data para nome de arquivo (YYYY-MM-DD)
 */
function formatDateForFileName(date: string | undefined): string {
  if (!date) return '';
  
  // Já está no formato ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  
  // Tenta outros formatos comuns
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  
  return '';
}

/**
 * Gera nome inteligente baseado no tipo e dados extraídos
 */
export function generateIntelligentFileName(
  docType: string,
  extractedData: ExtractedData,
  originalFileName: string
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const originalExt = originalFileName.split('.').pop() || 'png';
  
  // Templates por tipo de documento
  const templates: Record<string, (data: ExtractedData) => string> = {
    certidao_nascimento: (d) => {
      const childName = sanitizeName(d.childName);
      const birthDate = formatDateForFileName(d.childBirthDate) || timestamp;
      return `Certidao_Nascimento_${childName}_${birthDate}`;
    },
    
    identificacao: (d) => {
      const name = sanitizeName(d.fullName);
      
      if (d.rg) {
        const rgClean = d.rg.replace(/[^0-9]/g, '').substring(0, 10);
        return `RG_${name}_${rgClean}`;
      }
      
      if (d.cpf) {
        const cpfClean = d.cpf.replace(/[^0-9]/g, '');
        return `CPF_${name}_${cpfClean}`;
      }
      
      return `Identificacao_${name}`;
    },
    
    procuracao: (d) => {
      const granterName = sanitizeName(d.granterName);
      return `Procuracao_${granterName}_${timestamp}`;
    },
    
    processo_administrativo: (d) => {
      const protocol = d.raProtocol ? d.raProtocol.replace(/[^0-9]/g, '') : timestamp;
      return `Processo_INSS_${protocol}`;
    },
    
    certidao_casamento: (d) => {
      const spouseName = sanitizeName(d.spouseName);
      const marriageDate = formatDateForFileName(d.marriageDate) || timestamp;
      return `Certidao_Casamento_${spouseName}_${marriageDate}`;
    },
    
    cnis: (d) => {
      const nit = d.nit ? d.nit.replace(/[^0-9]/g, '') : 'Cliente';
      return `CNIS_${nit}_${timestamp}`;
    },
    
    autodeclaracao_rural: () => {
      return `Autodeclaracao_Rural_${timestamp}`;
    },
    
    documento_terra: (d) => {
      const ownerName = sanitizeName(d.landOwnerName);
      return `Documento_Terra_${ownerName}_${timestamp}`;
    },
    
    comprovante_residencia: (d) => {
      const holderName = sanitizeName(d.holderName);
      const refDate = formatDateForFileName(d.referenceDate) || timestamp;
      return `Comprovante_Residencia_${holderName}_${refDate}`;
    },
    
    historico_escolar: (d) => {
      const studentName = sanitizeName(d.studentName);
      const period = d.period || timestamp;
      return `Historico_Escolar_${studentName}_${period}`;
    },
    
    declaracao_saude_ubs: (d) => {
      const patientName = sanitizeName(d.patientName);
      const declDate = formatDateForFileName(d.declarationDate) || timestamp;
      return `Declaracao_Saude_${patientName}_${declDate}`;
    },
  };
  
  const generateName = templates[docType];
  
  // Tipo não reconhecido ou sem template
  if (!generateName) {
    return originalFileName; // Manter nome original
  }
  
  try {
    const baseName = generateName(extractedData);
    return `${baseName}.${originalExt}`;
  } catch (error) {
    console.error('Erro ao gerar nome inteligente:', error);
    return originalFileName; // Fallback para nome original
  }
}

/**
 * Retorna informações de exibição para cada tipo de documento
 */
export function getDocTypeDisplayInfo(docType: string) {
  const types: Record<string, { icon: string; color: string; label: string }> = {
    certidao_nascimento: { 
      icon: '👶', 
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', 
      label: 'Certidão Nascimento' 
    },
    identificacao: { 
      icon: '🪪', 
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', 
      label: 'Identificação' 
    },
    procuracao: { 
      icon: '📝', 
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', 
      label: 'Procuração' 
    },
    processo_administrativo: { 
      icon: '📋', 
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', 
      label: 'Processo INSS' 
    },
    certidao_casamento: { 
      icon: '💍', 
      color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200', 
      label: 'Certidão Casamento' 
    },
    cnis: { 
      icon: '📊', 
      color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', 
      label: 'CNIS' 
    },
    autodeclaracao_rural: { 
      icon: '🌾', 
      color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200', 
      label: 'Autodeclaração Rural' 
    },
    documento_terra: { 
      icon: '🏡', 
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', 
      label: 'Documento Terra' 
    },
    comprovante_residencia: { 
      icon: '🏠', 
      color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200', 
      label: 'Comp. Residência' 
    },
    historico_escolar: { 
      icon: '🎓', 
      color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200', 
      label: 'Histórico Escolar' 
    },
    declaracao_saude_ubs: { 
      icon: '🏥', 
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', 
      label: 'Declaração Saúde' 
    },
    outro: { 
      icon: '📎', 
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200', 
      label: 'Outro' 
    }
  };
  
  return types[docType] || types.outro;
}
