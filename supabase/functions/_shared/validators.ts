import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ============================================================
// SHARED VALIDATION SCHEMAS FOR EDGE FUNCTIONS
// ============================================================

// Simple case operations
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

// Petition analysis and adaptation
export const petitionAnalysisSchema = z.object({
  petition: z.string()
    .min(100, 'Petição muito curta (mínimo 100 caracteres)')
    .max(500000, 'Petição muito longa (máximo 500KB)'),
  caseId: z.string().uuid().optional(),
  contextDocuments: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
  })).optional(),
});

export const applyCorrectionsSchema = z.object({
  petition: z.string()
    .min(100, 'Petição muito curta')
    .max(500000, 'Petição muito longa'),
  judgeAnalysis: z.object({
    brechas: z.array(z.any()).optional(),
    pontos_fortes: z.array(z.any()).optional(),
    pontos_fracos: z.array(z.any()).optional(),
    recomendacoes: z.array(z.string()).optional(),
  }),
  caseId: z.string().uuid(),
  contextDocuments: z.array(z.any()).optional(),
  tentativaInfo: z.object({
    tentativa: z.number().min(1).max(10),
    numero: z.number().min(1).max(10).optional(),
    maxTentativas: z.number(),
    contextoAnterior: z.string().optional(),
  }).optional(),
});

export const applyAdaptationsSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  appellateAnalysis: z.object({
    adaptacoes_sugeridas: z.array(z.any()),
  }).optional(),
  regionalAnalysis: z.object({
    adaptacoes_sugeridas: z.array(z.any()).optional(),
    trf: z.string().optional(),
    tendencias: z.array(z.string()).optional(),
    estilo_preferido: z.string().optional(),
    jurisprudencias_locais_sugeridas: z.array(z.any()).optional(),
  }).optional(),
}).refine(data => data.appellateAnalysis || data.regionalAnalysis, {
  message: 'Deve fornecer appellateAnalysis ou regionalAnalysis'
});

// Jurisprudence and legal thesis
export const teseJuridicaSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  selectedJurisprudencias: z.array(z.object({
    id: z.string().uuid().optional(),
    link: z.string().url().optional(),
    ementa: z.string().optional(),
  })).max(100, 'Máximo de 100 jurisprudências').optional().default([]),
  selectedSumulas: z.array(z.object({
    id: z.string().optional(),
    text: z.string().optional(),
  })).max(50, 'Máximo de 50 súmulas').optional().default([]),
  selectedDoutrinas: z.array(z.object({
    id: z.string().optional(),
    title: z.string().optional(),
  })).max(50, 'Máximo de 50 doutrinas').optional().default([]),
});

// Audio processing
export const voiceToTextSchema = z.object({
  audio: z.string()
    .min(100, 'Dados de áudio inválidos')
    .max(10485760, 'Arquivo de áudio muito grande (máximo 10MB em base64)')
    .refine(
      (val) => /^[A-Za-z0-9+/]+=*$/.test(val),
      'Formato base64 inválido'
    ),
});

// Data extraction
export const extractDataSchema = z.object({
  text: z.string()
    .min(10, 'Texto muito curto para extração')
    .max(100000, 'Texto muito longo (máximo 100KB)'),
  caseId: z.string().uuid(),
});

export const convertPdfSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido'),
  caseId: z.string().uuid('ID de caso inválido'),
});

// Quality and auto-fix
export const autoFixQualitySchema = z.object({
  caseId: z.string().uuid(),
  qualityReport: z.object({
    status: z.string().optional(),
    issues: z.array(z.any()).optional(),
    campos_faltantes: z.array(z.string()).optional(),
    erros_portugues: z.array(z.any()).optional(),
    enderecamento_ok: z.boolean().optional(),
    valor_causa_validado: z.boolean().optional(),
    valor_causa_referencia: z.number().optional(),
    jurisdicao_ok: z.boolean().optional(),
    jurisdicao_confianca: z.string().optional(),
    dados_completos: z.boolean().optional(),
  }).passthrough(), // Allow additional fields
});

// Case replication
export const replicateCaseSchema = z.object({
  sourceCaseId: z.string().uuid('ID de caso origem inválido'),
  destinationCaseId: z.string().uuid('ID de caso destino inválido'),
});

// CNIS detection
export const cnisDetectionSchema = z.object({
  caseId: z.string().uuid('ID de caso inválido'),
  cnisText: z.string().min(50, 'Texto CNIS muito curto').max(100000, 'Texto CNIS muito longo'),
});

// Special situation detection
export const specialSituationSchema = z.object({
  text: z.string().min(10, 'Texto muito curto').max(10000, 'Texto muito longo'),
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
