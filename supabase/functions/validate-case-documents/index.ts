import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError) throw caseError;

    // Buscar documentos
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    if (docsError) throw docsError;

    // Buscar extrações
    const { data: extractions } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId);

    // Normalizar tipos de documentos com sinônimos
    const normalizeDocType = (type: string): string => {
      const synonyms: Record<string, string> = {
        'comprovante_endereco': 'comprovante_residencia',
        'OUTROS': 'outro',
        'outros': 'outro',
        'OUTRO': 'outro'
      };
      const normalized = type.toLowerCase().trim();
      return synonyms[normalized] || normalized;
    };

    // Normalizar e agrupar documentos por tipo
    const docTypesNormalized = documents.map(d => normalizeDocType(d.document_type));
    const uniqueDocTypes = [...new Set(docTypesNormalized)];

    // Checklist determinístico baseado no perfil
    const getRequiredDocsByProfile = (profile: string): string[] => {
      const commonDocs = [
        'certidao_nascimento',
        'identificacao', 
        'comprovante_residencia',
        'processo_administrativo'
      ];
      
      if (profile === 'especial') {
        return [
          ...commonDocs,
          'autodeclaracao_rural',
          'documento_terra',
          // CNIS é opcional - vazio é vantagem!
        ];
      }
      
      if (profile === 'segurada_urbana') {
        return [
          ...commonDocs,
          'cnis', // obrigatório
          'carteira_trabalho'
        ];
      }
      
      if (profile === 'contribuinte_individual') {
        return [
          ...commonDocs,
          'cnis', // obrigatório
          'comprovantes_pagamento'
        ];
      }
      
      return commonDocs;
    };

    const requiredDocs = getRequiredDocsByProfile(caseData.profile);

    // Preparar dados para IA
    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

⚠️⚠️⚠️ AGORA VOCÊ VAI VALIDAR DOCUMENTOS ⚠️⚠️⚠️

Você é um especialista em validação de processos de salário-maternidade. Analise o caso abaixo e valide a documentação.

📋 CHECKLIST OBRIGATÓRIO (SEMPRE USE ESTES):
${requiredDocs.map(doc => `- ${doc} (CRITICAL)`).join('\n')}

DADOS DO CASO:
- Nome da autora: ${caseData.author_name}
- CPF: ${caseData.author_cpf}
- Perfil: ${caseData.profile}
- Tipo de evento: ${caseData.event_type}
- Data do evento: ${caseData.event_date}
- Tem RA: ${caseData.has_ra ? 'Sim' : 'Não'}

DOCUMENTOS ENVIADOS (${documents.length} documentos):
${documents.map(d => `- ${normalizeDocType(d.document_type)}: ${d.file_name}`).join('\n')}

⚠️ **IMPORTANTE**: Ao validar documentos, considere sinônimos:
- "comprovante_endereco" = "comprovante_residencia" ✅
- "outros" = "outro" ✅
Se o caso tem "comprovante_endereco", considere como "comprovante_residencia" presente.

INFORMAÇÕES EXTRAÍDAS:
${JSON.stringify(extractions, null, 2)}

TAREFA:
Valide se a documentação é suficiente para protocolar a ação. Retorne um JSON com:
{
  "score": number (0-10),
  "is_sufficient": boolean,
  "can_proceed": boolean,
  "checklist": [
    {"item": "Nome do documento", "status": "ok" | "missing" | "incomplete", "importance": "critical" | "high" | "medium"}
  ],
  "missing_docs": [
    {
      "doc_type": "Tipo do documento (USE ENUM VÁLIDO)",
      "reason": "Por que é importante (explicação detalhada)",
      "importance": "critical" | "high" | "medium",
      "impact": "Como a falta disso impacta na ação"
    }
  ],
  "recommendations": ["Recomendação 1", "Recomendação 2"]
}

⚠️ **IMPORTANTE - VALORES DO ENUM para "doc_type"**:
Use APENAS estes valores exatos (NÃO use nomes descritivos):
- "identificacao" (NÃO "RG da autora", "CPF", etc)
- "certidao_nascimento" (NÃO "Certidão de Nascimento da criança")
- "autodeclaracao_rural" (NÃO "Autodeclaração Rural")
- "documento_terra" (NÃO "Documento da Terra", "ITR")
- "processo_administrativo" (NÃO "Requerimento Administrativo")
- "comprovante_residencia"
- "procuracao"
- "cnis"
- "ficha_atendimento"
- "carteira_pescador"
- "outro"

⚠️ **REGRA DE IMPORTÂNCIA**:
Use "critical" (não "high") para documentos ESSENCIAIS sem os quais a ação não pode ser protocolada:
- certidao_nascimento (critical - comprova o fato gerador)
- identificacao (critical - RG/CPF da autora)
- Comprovantes de atividade rural (critical - para segurada especial)
- autodeclaracao_rural (critical - caracteriza a segurada especial)
- documento_terra (critical - comprova local de trabalho)
- cnis (critical - histórico contributivo)
- processo_administrativo (critical - comprova negativa do INSS)

Use "high" apenas para documentos importantes mas não impeditivos.
Use "medium" para documentos complementares.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 15 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atingido. Aguarde alguns segundos e tente novamente.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos Lovable AI esgotados. Adicione mais créditos.',
          code: 'NO_CREDITS'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', aiResponse.status, errorText);
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const validationResult = JSON.parse(aiData.choices[0].message.content);

      // Adicionar document_id aos itens do checklist com logging detalhado
      const enrichedChecklist = validationResult.checklist.map((checkItem: any) => {
        // Extrair o tipo de documento do nome do item
        const itemLower = checkItem.item.toLowerCase();
        
        // Mapeamento mais agressivo de strings para tipos
        let itemType = '';
        if (itemLower.includes('rg') || itemLower.includes('cpf') || itemLower.includes('identifica')) {
          itemType = 'identificacao';
        } else if (itemLower.includes('certid') && itemLower.includes('nasc')) {
          itemType = 'certidao_nascimento';
        } else if (itemLower.includes('autodecl') || itemLower.includes('rural')) {
          itemType = 'autodeclaracao_rural';
        } else if (itemLower.includes('terra') || itemLower.includes('itr') || itemLower.includes('propriedade')) {
          itemType = 'documento_terra';
        } else if (itemLower.includes('processo') || itemLower.includes('administrativo') || itemLower.includes('ra')) {
          itemType = 'processo_administrativo';
        } else if (itemLower.includes('resid') || itemLower.includes('endereco') || itemLower.includes('comprovante')) {
          itemType = 'comprovante_residencia';
        } else if (itemLower.includes('cnis')) {
          itemType = 'cnis';
        } else if (itemLower.includes('carteira')) {
          itemType = 'carteira_trabalho';
        }
        
        // Encontrar documento correspondente com múltiplas estratégias
        const matchingDoc = documents.find(d => {
          const docTypeNorm = normalizeDocType(d.document_type);
          return docTypeNorm === itemType || 
                 d.document_type.toLowerCase().includes(itemType) ||
                 itemType.includes(docTypeNorm);
        });
        
        console.log(`[MATCH] Item: "${checkItem.item}" -> Type: "${itemType}" -> Doc: ${matchingDoc?.id || 'NOT FOUND'}`);
        
        return {
          ...checkItem,
          document_id: matchingDoc?.id || null
        };
      });

      validationResult.checklist = enrichedChecklist;

      // Salvar na tabela document_validation
      const { error: insertError } = await supabase
        .from('document_validation')
        .upsert({
          case_id: caseId,
          score: validationResult.score,
          is_sufficient: validationResult.is_sufficient,
          checklist: validationResult.checklist,
          missing_docs: validationResult.missing_docs,
          validation_details: validationResult,
          validated_at: new Date().toISOString()
        }, { onConflict: 'case_id' });

      if (insertError) throw insertError;

      return new Response(JSON.stringify(validationResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Validação demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in validate-case-documents:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
