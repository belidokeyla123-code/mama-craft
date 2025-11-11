import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";
import { parseJSONResponse } from "../_shared/ai-helpers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody;
    try {
      const text = await req.text();
      if (!text || text.trim() === '') {
        throw new Error('Request body is empty');
      }
      requestBody = JSON.parse(text);
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid request body. Expected JSON with caseId.',
        code: 'INVALID_REQUEST'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { caseId } = requestBody;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .maybeSingle();

    if (caseError) throw caseError;
    
    if (!caseData) {
      return new Response(JSON.stringify({ 
        error: 'Caso não encontrado',
        code: 'CASE_NOT_FOUND'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar documentos (incluindo parent_document_id para agrupar PDFs convertidos)
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
  "recommendations": ["Recomendação 1", "Recomendação 2"],
  "technical_analysis": {
    "atividade_10_meses": {
      "status": "ok" | "missing" | "incomplete",
      "details": "Análise detalhada: verificar CNIS + data do parto (${caseData.event_date}) + documentos de prova material. A autora comprovou atividade rural nos 10 meses anteriores ao parto?"
    },
    "prova_material": {
      "status": "ok" | "missing" | "incomplete",
      "details": "Análise detalhada: há notas fiscais, declarações, contratos, ITR, bloco de produtor, etc. em nome próprio OU do grupo familiar (cônjuge, pais)?"
    }
  }
}

🧠 **ANÁLISE TÉCNICA OBRIGATÓRIA**:
1. **Carência de 10 meses**: Verifique se há documentos (CNIS, autodeclaração, notas fiscais, contratos) que comprovem atividade rural nos 10 meses anteriores à data do parto (${caseData.event_date}). Se o CNIS estiver vazio ou mostrar apenas atividade rural, isso é POSITIVO.
2. **Prova Material**: Verifique se há documentos materiais (notas fiscais, ITR, bloco de produtor, contratos, declarações) em nome próprio da autora OU do grupo familiar (cônjuge, pais). Prova indireta (em nome de familiares) também é válida.

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
    
    if (!LOVABLE_API_KEY) {
      console.error('[VALIDATION] ❌ LOVABLE_API_KEY não configurada!');
      return new Response(JSON.stringify({ 
        error: 'LOVABLE_API_KEY não configurada. Configure em Edge Function Secrets.',
        code: 'MISSING_API_KEY'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[VALIDATION] 🚀 Iniciando validação para caso:', caseId);
    console.log('[VALIDATION] 📄 Documentos encontrados:', documents.length);
    console.log('[VALIDATION] 🤖 Chamando Lovable AI...');
    
    // Timeout de 25 segundos (maior que o do frontend)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

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

      let aiData;
      try {
        let responseText = await aiResponse.text();
        if (!responseText || responseText.trim() === '') {
          throw new Error('AI response is empty');
        }
        
        // Limpar markdown code blocks da resposta completa
        responseText = responseText.trim();
        if (responseText.startsWith('```')) {
          const lines = responseText.split('\n');
          // Remove primeira linha (```json ou ```)
          if (lines[0].startsWith('```')) lines.shift();
          // Remove última linha se for ```)
          if (lines[lines.length - 1].trim() === '```') lines.pop();
          responseText = lines.join('\n');
        }
        
        aiData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        throw new Error('Invalid AI response format');
      }

      const validationResult = parseJSONResponse<any>(aiData.choices[0].message.content, {
        score: 0,
        threshold: 7,
        is_sufficient: false,
        missing_docs: [],
        checklist: []
      });

      // ✅ FILTRAR DOCUMENTOS JÁ VALIDADOS COM SUCESSO
      const validatedDocs = documents.filter(doc => 
        doc.document_type !== 'outro' && 
        doc.document_type !== 'OUTRO' &&
        doc.document_type !== 'OUTROS'
      );
      
      const alreadyValidatedTypes = validatedDocs.map(d => normalizeDocType(d.document_type));
      console.log('[VALIDATION] Documentos já validados:', alreadyValidatedTypes);
      
      // Filtrar missing_docs para não pedir documentos já validados
      if (validationResult.missing_docs) {
        validationResult.missing_docs = validationResult.missing_docs.filter((doc: any) => {
          const docTypeNormalized = normalizeDocType(doc.doc_type);
          const isAlreadyValidated = alreadyValidatedTypes.includes(docTypeNormalized);
          
          if (isAlreadyValidated) {
            console.log(`[VALIDATION] ✅ Documento "${doc.doc_type}" já validado, não solicitar novamente`);
            return false;
          }
          
          // 🆕 NOVA VERIFICAÇÃO: Buscar pelo nome do arquivo
          const fileKeywords: Record<string, string[]> = {
            'documento_terra': ['comodato', 'arrendamento', 'itr', 'ccir'],
            'autodeclaracao_rural': ['autodeclaracao', 'auto declaracao']
          };
          
          const keywords = fileKeywords[docTypeNormalized] || [];
          const hasFileWithKeyword = documents.some(d => {
            const fileNameLower = d.file_name.toLowerCase();
            return keywords.some(kw => fileNameLower.includes(kw));
          });
          
          if (hasFileWithKeyword) {
            console.log(`[VALIDATION] ✅ Documento "${doc.doc_type}" existe com nome correto, não solicitar`);
            return false;
          }
          
          return true;
        });
      }

      // ✅ MELHORIA: Matching robusto de document_id
      const enrichedChecklist = validationResult.checklist.map((checkItem: any) => {
        const itemLower = checkItem.item.toLowerCase();
        
        // Normalizar nome do item (remover acentos, plural, etc)
        const normalizeText = (text: string) => {
          return text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/[^a-z0-9\s]/g, '') // Remove pontuação
            .replace(/\s+/g, ' ') // Normaliza espaços
            .trim();
        };
        
        const normalizedItem = normalizeText(itemLower);
        
        console.log(`[MATCHING] Procurando documento para: "${checkItem.item}" (normalizado: "${normalizedItem}")`);
        
        // Buscar documento correspondente com matching mais flexível
        const matchingDoc = documents.find(doc => {
          const docTypeLower = doc.document_type.toLowerCase();
          const normalizedDocType = normalizeText(docTypeLower);
          
          // Mapeamento de sinônimos
          const synonyms: Record<string, string[]> = {
            'identificacao': ['rg', 'cpf', 'identidade', 'documento'],
            'certidao_nascimento': ['certidao', 'nascimento', 'crianca'],
            'autodeclaracao_rural': ['autodeclaracao', 'declaracao', 'rural', 'segurada especial'],
            'documento_terra': ['terra', 'itr', 'propriedade', 'ccir', 'escritura'],
            'processo_administrativo': ['processo', 'administrativo', 'ra', 'requerimento'],
            'comprovante_residencia': ['residencia', 'endereco', 'comprovante'],
            'declaracao_saude_ubs': ['ubs', 'saude', 'posto', 'unidade basica'],
            'historico_escolar': ['escola', 'escolar', 'historico'],
            'cnis': ['cnis', 'previdenciario', 'inss']
          };
          
          // Verificar match direto
          if (normalizedDocType.includes(normalizedItem) || normalizedItem.includes(normalizedDocType)) {
            console.log(`  ✅ Match direto: ${doc.document_type} ↔ ${checkItem.item}`);
            return true;
          }
          
          // Verificar sinônimos
          for (const [key, syns] of Object.entries(synonyms)) {
            const itemMatchesSyns = syns.some(syn => normalizedItem.includes(syn));
            const docMatchesSyns = syns.some(syn => normalizedDocType.includes(syn));
            
            if (itemMatchesSyns && docMatchesSyns) {
              console.log(`  ✅ Match por sinônimo (${key}): ${doc.document_type} ↔ ${checkItem.item}`);
              return true;
            }
          }
          
          return false;
        });
        
        // 🆕 Se não encontrou por document_type, buscar por nome do arquivo
        if (!matchingDoc) {
          const fileNameMatching = documents.find(doc => {
            const fileNameLower = doc.file_name.toLowerCase();
            
            // Mapeamento de palavras-chave no nome do arquivo
            const fileKeywords: Record<string, string[]> = {
              'documento_terra': ['comodato', 'arrendamento', 'itr', 'ccir', 'propriedade', 'terra'],
              'autodeclaracao_rural': ['autodeclaracao', 'auto declaracao', 'declaracao rural'],
              'identificacao': ['rg', 'cpf', 'identidade', 'carteira de identidade'],
              'certidao_nascimento': ['certidao', 'nascimento', 'crianca'],
              'comprovante_residencia': ['comprovante', 'endereco', 'residencia', 'conta de luz'],
              'processo_administrativo': ['processo', 'protocolo', 'indeferimento', 'negativa']
            };
            
            // Verificar se o nome do arquivo contém keywords relevantes
            const itemKeywords = fileKeywords[normalizedItem] || [];
            const hasKeywordMatch = itemKeywords.some(keyword => fileNameLower.includes(keyword));
            
            if (hasKeywordMatch) {
              console.log(`  ✅ Match por nome de arquivo: "${doc.file_name}" contém keyword para "${checkItem.item}"`);
              return true;
            }
            
            return false;
          });
          
          if (fileNameMatching) {
            console.log(`  🎯 Documento encontrado por nome: ID=${fileNameMatching.id} nome=${fileNameMatching.file_name}`);
            return {
              ...checkItem,
              document_id: fileNameMatching.id,
              document_name: fileNameMatching.file_name
            };
          }
        }
        
        if (matchingDoc) {
          console.log(`  🎯 Documento encontrado: ID=${matchingDoc.id} tipo=${matchingDoc.document_type}`);
          return {
            ...checkItem,
            document_id: matchingDoc.id,
            document_name: matchingDoc.file_name
          };
        } else {
          console.log(`  ❌ Documento não encontrado para: ${checkItem.item}`);
          return checkItem;
        }
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
