import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { validateRequest, chatMessageSchema, createValidationErrorResponse } from "../_shared/validators.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ VALIDAÇÃO DE ENTRADA
    const body = await req.json();
    const validated = validateRequest(chatMessageSchema, body);
    const { caseId, messageText } = validated;
    
    console.log('[PROCESS-CHAT] Processando mensagem:', messageText);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Buscar dados atuais do caso
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    // 🆕 BUSCAR DOCUMENTOS PROCESSADOS DO CASO
    const { data: caseDocuments } = await supabase
      .from('documents')
      .select('file_name, document_type')
      .eq('case_id', caseId)
      .neq('document_type', 'outro');

    const documentsContext = caseDocuments && caseDocuments.length > 0
      ? `\n\n📄 DOCUMENTOS JÁ PROCESSADOS:\n${caseDocuments.map(d => `- ${d.file_name} (${d.document_type})`).join('\n')}\n\n⚠️ NÃO solicite novamente documentos que já estão na lista acima.`
      : '';

    const prompt = `Você é um assistente especializado em extrair informações de mensagens/áudios de advogados sobre casos previdenciários de SALÁRIO-MATERNIDADE.${documentsContext}

MENSAGEM/ÁUDIO RECEBIDA:
"${messageText}"

DADOS ATUAIS DO CASO NO SISTEMA:
${JSON.stringify(caseData, null, 2)}

SUA TAREFA:
Analise a mensagem/áudio e extraia TODAS as informações mencionadas, incluindo:

📋 **1. DADOS PESSOAIS DA AUTORA/REQUERENTE:**
   - Nome completo
   - CPF (11 dígitos sem pontuação)
   - RG (número e órgão emissor)
   - Data de nascimento (formato YYYY-MM-DD)
   - Endereço completo (rua, número, bairro, cidade, UF, CEP)
   - Telefone fixo
   - Celular/WhatsApp
   - Estado civil

👶 **2. DADOS DE DEPENDENTES (FILHO/CRIANÇA):**
   - Nome completo do(a) filho(a)
   - Data de nascimento (formato YYYY-MM-DD)
   - CPF (se aplicável)
   - Nome do pai
   - Nome da mãe

💑 **3. DADOS DO CÔNJUGE (se aplicável):**
   - Nome completo
   - CPF
   - Data de casamento (formato YYYY-MM-DD)

💼 **4. HISTÓRICO DE BENEFÍCIOS ANTERIORES:**
   - NB (número do benefício)
   - Tipo de benefício
   - Data de início (formato YYYY-MM-DD)
   - Data de fim (formato YYYY-MM-DD ou null se ativo)
   - Status atual

🌾 **5. PERÍODOS DE ATIVIDADE RURAL:**
   - Data de início (formato YYYY-MM-DD)
   - Data de fim (formato YYYY-MM-DD)
   - Município/localização completa
   - Tipo de atividade

⚠️ **REGRAS:**
- NÃO invente informações que NÃO foram mencionadas
- Se não houver dados de uma categoria, retorne null ou array vazio
- Datas SEMPRE no formato YYYY-MM-DD
- CPF sem pontuação (apenas 11 dígitos)

📤 **FORMATO DE RETORNO (JSON):**
{
  "personal_data": {
    "author_name": "string ou null",
    "author_cpf": "string ou null",
    "author_rg": "string ou null",
    "author_birth_date": "YYYY-MM-DD ou null",
    "author_address": "string ou null",
    "author_phone": "string ou null",
    "author_whatsapp": "string ou null",
    "author_marital_status": "string ou null"
  },
  "dependent_data": {
    "child_name": "string ou null",
    "child_birth_date": "YYYY-MM-DD ou null",
    "child_cpf": "string ou null",
    "father_name": "string ou null",
    "mother_name": "string ou null"
  },
  "spouse_data": {
    "spouse_name": "string ou null",
    "spouse_cpf": "string ou null",
    "marriage_date": "YYYY-MM-DD ou null"
  },
  "benefit_history": [
    {
      "benefit_number": "string",
      "benefit_type": "string",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD ou null",
      "status": "string"
    }
  ],
  "rural_periods": [
    {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "location": "string",
      "municipality": "string",
      "activity": "string"
    }
  ],
  "cnis_analysis": "texto descritivo ou null",
  "general_info": "observações gerais ou null"
}`;

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
          messages: [
            {
              role: 'system',
              content: 'Você extrai informações estruturadas de mensagens sobre casos previdenciários. Sempre retorne JSON válido.'
            },
            { role: 'user', content: prompt }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'extract_case_info',
                description: 'Extrai informações estruturadas da mensagem',
                parameters: {
                  type: 'object',
                  properties: {
                    personal_data: {
                      type: 'object',
                      properties: {
                        author_name: { type: 'string' },
                        author_cpf: { type: 'string' },
                        author_rg: { type: 'string' },
                        author_birth_date: { type: 'string' },
                        author_address: { type: 'string' },
                        author_phone: { type: 'string' },
                        author_whatsapp: { type: 'string' },
                        author_marital_status: { type: 'string' }
                      }
                    },
                    dependent_data: {
                      type: 'object',
                      properties: {
                        child_name: { type: 'string' },
                        child_birth_date: { type: 'string' },
                        child_cpf: { type: 'string' },
                        father_name: { type: 'string' },
                        mother_name: { type: 'string' }
                      }
                    },
                    spouse_data: {
                      type: 'object',
                      properties: {
                        spouse_name: { type: 'string' },
                        spouse_cpf: { type: 'string' },
                        marriage_date: { type: 'string' }
                      }
                    },
                    benefit_history: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          benefit_number: { type: 'string' },
                          benefit_type: { type: 'string' },
                          start_date: { type: 'string' },
                          end_date: { type: 'string' },
                          status: { type: 'string' }
                        }
                      }
                    },
                    rural_periods: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          start_date: { type: 'string' },
                          end_date: { type: 'string' },
                          location: { type: 'string' },
                          municipality: { type: 'string' },
                          activity: { type: 'string' }
                        }
                      }
                    },
                    cnis_analysis: { type: 'string' },
                    general_info: { type: 'string' }
                  }
                }
              }
            }
          ],
          tool_choice: { type: 'function', function: { name: 'extract_case_info' } }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit atingido.',
          code: 'RATE_LIMIT'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos Lovable AI esgotados.',
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
      const toolCall = aiData.choices[0].message.tool_calls?.[0];
      
      if (!toolCall) {
        throw new Error('Nenhuma informação estruturada extraída');
      }

      const extracted = JSON.parse(toolCall.function.arguments);
      console.log('[PROCESS-CHAT] 📊 Dados extraídos:', JSON.stringify(extracted, null, 2));

      // 🆕 Disparar reclassificação de documentos não classificados após processar
      const { data: pendingDocs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId)
        .in('document_type', ['OUTROS', 'outro']);

      if (pendingDocs && pendingDocs.length > 0) {
        console.log(`[PROCESS-CHAT] 🔄 Reclassificando ${pendingDocs.length} documento(s) pendente(s)...`);
        
        for (const doc of pendingDocs) {
          await supabase.functions.invoke('analyze-single-document', {
            body: { 
              documentId: doc.id, 
              caseId, 
              forceReprocess: true 
            }
          });
        }
      }

      // ✅ CORREÇÃO: Validar campos existentes e salvar corretamente
      let updates: any = {};
      let insertions: any[] = [];

      if (extracted.type === 'benefit_history' && extracted.data.nb) {
        console.log('[PROCESS-CHAT] 💊 Verificando benefício anterior...');
        
        // ✅ VERIFICAR SE JÁ EXISTE NA TABELA
        const { data: existingBenefit } = await supabase
          .from('benefit_history')
          .select('id')
          .eq('case_id', caseId)
          .eq('nb', extracted.data.nb)
          .maybeSingle();
        
        if (existingBenefit) {
          console.log('[PROCESS-CHAT] ⚠️ Benefício já existe, pulando inserção');
        } else {
          console.log('[PROCESS-CHAT] ✅ Novo benefício, inserindo...');
          insertions.push({
            table: 'benefit_history',
            data: {
              case_id: caseId,
              nb: extracted.data.nb,
              benefit_type: extracted.data.benefitType || 'Salário-Maternidade',
              start_date: extracted.data.startDate || null,
              end_date: extracted.data.endDate || null,
              status: extracted.data.status || 'cessado'
            }
          });
        }

        // ✅ VERIFICAR DUPLICATA EM PERÍODOS RURAIS
        if (extracted.data.startDate && extracted.data.endDate) {
          const currentRuralPeriods = caseData.rural_periods || [];
          
          // Verificar se já existe período com as mesmas datas
          const periodExists = currentRuralPeriods.some((period: any) => 
            period.startDate === extracted.data.startDate && 
            period.endDate === extracted.data.endDate
          );
          
          if (!periodExists) {
            console.log('[PROCESS-CHAT] ✅ Adicionando período rural do benefício');
            updates.rural_periods = [
              ...currentRuralPeriods,
              {
                startDate: extracted.data.startDate,
                endDate: extracted.data.endDate,
                location: 'Reconhecido pelo INSS (benefício anterior)',
                activityType: extracted.data.benefitType
              }
            ];
          } else {
            console.log('[PROCESS-CHAT] ⚠️ Período rural já existe, pulando');
          }
        }
      }

      if (extracted.type === 'rural_period' && extracted.data.startDate) {
        const currentRuralPeriods = caseData.rural_periods || [];
        
        // ✅ VERIFICAR DUPLICATA
        const periodExists = currentRuralPeriods.some((period: any) => 
          period.startDate === extracted.data.startDate && 
          period.endDate === (extracted.data.endDate || new Date().toISOString().split('T')[0])
        );
        
        if (!periodExists) {
          console.log('[PROCESS-CHAT] ✅ Adicionando novo período rural');
          updates.rural_periods = [
            ...currentRuralPeriods,
            {
              startDate: extracted.data.startDate,
              endDate: extracted.data.endDate || new Date().toISOString().split('T')[0],
              location: extracted.data.location || '',
              activityType: extracted.data.activityType || ''
            }
          ];
        } else {
          console.log('[PROCESS-CHAT] ⚠️ Período rural já existe, pulando');
        }
      }

      if (extracted.type === 'cnis_analysis') {
        // Criar exceção para análise de CNIS
        insertions.push({
          table: 'case_exceptions',
          data: {
            case_id: caseId,
            exception_type: 'cnis_analysis',
            description: extracted.data.observation,
            voice_transcribed: false
          }
        });

        if (extracted.data.recognizedAsSpecial) {
          updates.special_notes = (caseData.special_notes || '') + 
            `\n[CNIS] ${extracted.data.observation}`;
        }
      }

      if (extracted.type === 'general_info' && extracted.data.field && extracted.data.value) {
        updates[extracted.data.field] = extracted.data.value;
      }

      // ✅ CORREÇÃO: Validar campos antes de salvar em cases
      let validUpdates: any = {};
      
      if (Object.keys(updates).length > 0) {
        // Lista de campos válidos na tabela cases
        const validFields = [
          'author_name', 'author_cpf', 'author_rg', 'child_name', 'child_birth_date',
          'rural_periods', 'urban_periods', 'special_notes', 'has_ra', 'ra_protocol'
        ];
        
        // Filtrar apenas campos válidos
        for (const [key, value] of Object.entries(updates)) {
          if (validFields.includes(key)) {
            validUpdates[key] = value;
          } else {
            console.warn(`[PROCESS-CHAT] ⚠️ Campo "${key}" não existe em cases, criando exceção`);
            // Criar exceção para informação não mapeada
            insertions.push({
              table: 'case_exceptions',
              data: {
                case_id: caseId,
                exception_type: 'unmapped_field',
                description: `Campo "${key}": ${JSON.stringify(value)}`,
                voice_transcribed: false
              }
            });
          }
        }
        
        if (Object.keys(validUpdates).length > 0) {
          const { error: updateError } = await supabase
            .from('cases')
            .update(validUpdates)
            .eq('id', caseId);

          if (updateError) {
            console.error('[PROCESS-CHAT] ❌ Erro ao atualizar caso:', updateError);
          } else {
            console.log('[PROCESS-CHAT] ✅ Caso atualizado:', validUpdates);
          }
        }
      }

      // Fazer inserções
      for (const insertion of insertions) {
        const { error: insertError } = await supabase
          .from(insertion.table)
          .insert(insertion.data);

        if (insertError) {
          console.error(`[PROCESS-CHAT] Erro ao inserir em ${insertion.table}:`, insertError);
        } else {
          console.log(`[PROCESS-CHAT] Inserido em ${insertion.table}:`, insertion.data);
        }
      }

      // ✅ CORREÇÃO #6: Disparar sincronização após salvar benefício
      if (extracted.type === 'benefit_history' && insertions.length > 0) {
        console.log('[PROCESS-CHAT] 🔄 Benefício salvo, sincronização necessária');
      }

      return new Response(JSON.stringify({
        extracted,
        updatedFields: Object.keys(validUpdates || {}),
        insertedRecords: insertions.length,
        requiresSync: extracted.type === 'benefit_history'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout ao processar mensagem.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error: any) {
    // ✅ TRATAMENTO SEGURO DE ERROS
    if (error instanceof z.ZodError) {
      return createValidationErrorResponse(error, corsHeaders);
    }
    
    console.error('[PROCESS-CHAT] Error:', error);
    
    // Não expor detalhes internos ao cliente
    const userMessage = error.message?.includes('JWT') 
      ? 'Sessão expirada. Faça login novamente.'
      : error.message?.includes('permission')
      ? 'Você não tem permissão para esta ação.'
      : 'Erro ao processar mensagem. Tente novamente.';
    
    return new Response(JSON.stringify({ error: userMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
