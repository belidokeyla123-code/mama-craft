import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ============================================================
// SHARED VALIDATION SCHEMAS FOR EDGE FUNCTIONS
// ============================================================

export const caseIdSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido (UUID esperado)'),
});

export const chatMessageSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  messageText: z.string()
    .min(1, 'Mensagem não pode estar vazia')
    .max(10000, 'Mensagem muito longa (máximo 10.000 caracteres)'),
});

export const documentAnalysisSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido'),
  caseId: z.string().uuid('ID de caso inválido'),
  forceReprocess: z.boolean().optional(),
});

export const generatePetitionSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  selectedJurisprudencias: z.array(z.string().uuid())
    .max(50, 'Máximo de 50 jurisprudências permitido')
    .optional()
    .default([]),
});

export const processDocumentsSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  documentIds: z.array(z.string().uuid())
    .min(1, 'Pelo menos um documento é necessário')
    .max(100, 'Máximo de 100 documentos por vez'),
});

export const reclassifyDocumentsSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  documentIds: z.array(z.string().uuid())
    .min(1, 'Pelo menos um documento é necessário')
    .max(100, 'Máximo de 100 documentos'),
  forceReprocess: z.boolean().optional(),
});

// ============================================================
// VALIDATION HELPER
// ============================================================

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// ============================================================
// ERROR RESPONSE HELPER
// ============================================================

export function createValidationErrorResponse(error: z.ZodError, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: 'Validação de entrada falhou',
      details: error.errors.map(e => ({
        field: e.path.join('.') || 'body',
        message: e.message,
      })),
    }),
    {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
