import { z } from 'zod';

// CPF validation helper
const validateCPFFormat = (cpf: string): boolean => {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false;
  return true;
};

// File validation
export const fileSchema = z.object({
  name: z.string().refine(
    (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
    'Nome de arquivo inválido'
  ),
  size: z.number().max(10 * 1024 * 1024, 'Arquivo muito grande (máximo 10MB)'),
  type: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ], { errorMap: () => ({ message: 'Tipo de arquivo não permitido' }) }),
});

// Case data validation
export const caseBasicSchema = z.object({
  author_name: z.string()
    .trim()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(100, 'Nome muito longo')
    .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome inválido'),
  
  author_cpf: z.string()
    .trim()
    .refine(validateCPFFormat, 'CPF inválido'),
  
  author_rg: z.string()
    .trim()
    .regex(/^\d{7,9}$/, 'RG inválido')
    .optional()
    .or(z.literal('')),
  
  author_address: z.string()
    .trim()
    .min(10, 'Endereço deve ter no mínimo 10 caracteres')
    .max(200, 'Endereço muito longo')
    .optional()
    .or(z.literal('')),
  
  author_phone: z.string()
    .trim()
    .regex(/^\(\d{2}\)\s?\d{4,5}-\d{4}$/, 'Telefone inválido (formato: (11) 98765-4321)')
    .optional()
    .or(z.literal('')),
  
  author_whatsapp: z.string()
    .trim()
    .regex(/^\(\d{2}\)\s?\d{4,5}-\d{4}$/, 'WhatsApp inválido (formato: (11) 98765-4321)')
    .optional()
    .or(z.literal('')),
  
  event_date: z.string()
    .refine((date) => {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime()) && d <= new Date();
    }, 'Data inválida ou no futuro')
    .optional()
    .or(z.literal('')),
  
  author_birth_date: z.string()
    .refine((date) => {
      if (!date) return true;
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime()) && d <= new Date();
    }, 'Data de nascimento inválida')
    .optional()
    .or(z.literal('')),
});

// Edge function request schemas
export const caseIdSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
});

export const generatePetitionSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  selectedJurisprudencias: z.array(z.string().uuid()).max(50, 'Máximo de 50 jurisprudências'),
});

export const processDocumentsSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  documentIds: z.array(z.string().uuid()).max(100, 'Máximo de 100 documentos por vez'),
});

export const reclassifyDocumentsSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  documentIds: z.array(z.string().uuid()).min(1, 'Pelo menos um documento necessário').max(100, 'Máximo de 100 documentos'),
  forceReprocess: z.boolean().optional(),
});

// Sanitization helpers
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .slice(0, 10000); // Max length
}

export function sanitizeForAI(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, 50000); // AI context limit
}

// File validation function
export function validateFileUpload(file: File): { valid: boolean; error?: string } {
  try {
    fileSchema.parse({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.errors[0].message };
    }
    return { valid: false, error: 'Arquivo inválido' };
  }
}
