import { useMemo } from 'react';
import { CaseData } from '@/pages/NewCase';

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Hook for live validation during case intake
 */
export const useValidation = (data: CaseData): ValidationIssue[] => {
  return useMemo(() => {
    const issues: ValidationIssue[] = [];

    // CPF validation
    if (data.authorCpf) {
      const cpf = data.authorCpf.replace(/\D/g, '');
      if (cpf.length !== 11) {
        issues.push({
          field: 'CPF',
          severity: 'error',
          message: 'CPF deve ter 11 dígitos'
        });
      } else if (/^(\d)\1{10}$/.test(cpf)) {
        issues.push({
          field: 'CPF',
          severity: 'error',
          message: 'CPF inválido (dígitos repetidos)'
        });
      }
    } else {
      issues.push({
        field: 'CPF',
        severity: 'error',
        message: 'CPF é obrigatório'
      });
    }

    // Nome validation
    if (!data.authorName) {
      issues.push({
        field: 'Nome',
        severity: 'error',
        message: 'Nome da autora é obrigatório'
      });
    }

    // Endereço validation
    if (!data.authorAddress) {
      issues.push({
        field: 'Endereço',
        severity: 'warning',
        message: 'Endereço não informado'
      });
    }

    // Data do evento
    if (data.eventDate) {
      const eventDate = new Date(data.eventDate);
      const now = new Date();
      
      if (eventDate > now) {
        issues.push({
          field: 'Data do Evento',
          severity: 'error',
          message: 'Data não pode ser no futuro'
        });
      }
      
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      
      if (eventDate < fiveYearsAgo) {
        issues.push({
          field: 'Data do Evento',
          severity: 'warning',
          message: 'Evento ocorreu há mais de 5 anos (possível decadência)'
        });
      }
    }

    // Perfil validation
    if (data.profile === 'especial' && !data.ruralActivitySince) {
      issues.push({
        field: 'Atividade Rural',
        severity: 'warning',
        message: 'Informe desde quando exerce atividade rural'
      });
    }

    // Documentos validation
    const documentCount = data.documents?.length || 0;
    if (documentCount < 5) {
      issues.push({
        field: 'Documentos',
        severity: 'warning',
        message: `Apenas ${documentCount} documentos anexados (recomendado: 8+)`
      });
    }

    return issues;
  }, [data]);
};
