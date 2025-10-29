import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, messageText } = await req.json();
    
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

    const prompt = `Você é um assistente especializado em extrair informações de mensagens de advogados sobre casos previdenciários.

MENSAGEM DO ADVOGADO:
"${messageText}"

DADOS ATUAIS DO CASO:
${JSON.stringify(caseData, null, 2)}

TAREFA:
Analise a mensagem e extraia TODAS as informações relevantes estruturadas. Identifique:
1. Benefícios anteriores recebidos (NB, tipo, datas)
2. Períodos de atividade rural adicionais
3. Análises do CNIS
4. Reconhecimentos prévios do INSS
5. Qualquer outra informação relevante sobre a qualidade de segurada

Retorne um JSON estruturado com:
{
  "type": "benefit_history" | "rural_period" | "cnis_analysis" | "general_info",
  "data": {
    // Para benefit_history:
    "nb": "número do benefício",
    "benefitType": "tipo do benefício",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "status": "ativo/cessado"
    
    // Para rural_period:
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "location": "local da atividade",
    "activityType": "tipo de atividade"
    
    // Para cnis_analysis:
    "observation": "texto da observação",
    "recognizedAsSpecial": true/false
    
    // Para general_info:
    "field": "nome do campo",
    "value": "valor"
  },
  "summary": "Resumo amigável do que foi extraído"
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
                    type: {
                      type: 'string',
                      enum: ['benefit_history', 'rural_period', 'cnis_analysis', 'general_info']
                    },
                    data: {
                      type: 'object',
                      properties: {
                        nb: { type: 'string' },
                        benefitType: { type: 'string' },
                        startDate: { type: 'string' },
                        endDate: { type: 'string' },
                        status: { type: 'string' },
                        location: { type: 'string' },
                        activityType: { type: 'string' },
                        observation: { type: 'string' },
                        recognizedAsSpecial: { type: 'boolean' },
                        field: { type: 'string' },
                        value: { type: 'string' }
                      }
                    },
                    summary: { type: 'string' }
                  },
                  required: ['type', 'data', 'summary']
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
      console.log('[PROCESS-CHAT] Dados extraídos:', extracted);

      // Processar dados extraídos baseado no tipo
      let updates: any = {};
      let insertions: any[] = [];

      if (extracted.type === 'benefit_history' && extracted.data.nb) {
        // Inserir benefício anterior
        insertions.push({
          table: 'benefit_history',
          data: {
            case_id: caseId,
            nb: extracted.data.nb,
            benefit_type: extracted.data.benefitType || 'Não especificado',
            start_date: extracted.data.startDate,
            end_date: extracted.data.endDate,
            status: extracted.data.status || 'cessado'
          }
        });

        // Se o período tem datas, adicionar aos períodos rurais
        if (extracted.data.startDate && extracted.data.endDate) {
          const currentRuralPeriods = caseData.rural_periods || [];
          updates.rural_periods = [
            ...currentRuralPeriods,
            {
              startDate: extracted.data.startDate,
              endDate: extracted.data.endDate,
              location: 'Reconhecido pelo INSS (benefício anterior)',
              activityType: extracted.data.benefitType
            }
          ];
        }
      }

      if (extracted.type === 'rural_period' && extracted.data.startDate) {
        const currentRuralPeriods = caseData.rural_periods || [];
        updates.rural_periods = [
          ...currentRuralPeriods,
          {
            startDate: extracted.data.startDate,
            endDate: extracted.data.endDate || new Date().toISOString().split('T')[0],
            location: extracted.data.location || '',
            activityType: extracted.data.activityType || ''
          }
        ];
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

      // Aplicar atualizações no caso
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('cases')
          .update(updates)
          .eq('id', caseId);

        if (updateError) {
          console.error('[PROCESS-CHAT] Erro ao atualizar caso:', updateError);
        } else {
          console.log('[PROCESS-CHAT] Caso atualizado:', updates);
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

      return new Response(JSON.stringify({
        extracted,
        updatedFields: Object.keys(updates),
        insertedRecords: insertions.length
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

  } catch (error) {
    console.error('[PROCESS-CHAT] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
