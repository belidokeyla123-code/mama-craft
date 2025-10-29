import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, cnisText } = await req.json();
    console.log(`[DETECT-CNIS] 🔍 Analisando CNIS do caso ${caseId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do caso
    const { data: caseData } = await supabase
      .from('cases')
      .select('child_birth_date, event_date')
      .eq('id', caseId)
      .single();

    const eventDate = caseData?.child_birth_date || caseData?.event_date;

    const analysisPrompt = `Você é especialista em análise de CNIS previdenciário.

Analise este CNIS e identifique situações especiais relevantes para pedido de auxílio-maternidade:

**CNIS:**
${cnisText}

**DATA DO EVENTO:** ${eventDate || 'Não informada'}

**ANÁLISE OBRIGATÓRIA:**

1. **BENEFÍCIOS ANTERIORES:**
   - Há auxílio-maternidade JÁ CONCEDIDO para data próxima ao evento?
   - Se sim, anotar: NB, data início, data fim, status (CESSADO/ATIVO)
   - Múltiplos indeferimentos anteriores?

2. **QUALIDADE DE SEGURADA:**
   - Última remuneração registrada (valor + data)
   - Vínculos urbanos ativos ou recentes?
   - Se há remuneração urbana recente → Segurada URBANA
   - Se não há remuneração recente → Segurada ESPECIAL RURAL

3. **SITUAÇÕES ESPECIAIS:**
   - Benefício cessado indevidamente?
   - Perda de qualidade segurada?
   - Necessidade de restabelecimento?

**IMPORTANTE:**
- Se encontrar benefício concedido anteriormente para o mesmo evento → SITUAÇÃO ESPECIAL
- Retorne valores numéricos para salários (ex: 5082.00, não "R$ 5.082,00")
- Datas sempre em formato YYYY-MM-DD
- ❌ NUNCA retorne "N/A" ou textos explicativos
- ✅ Use null ou omita campos não encontrados`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: analysisPrompt }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'analyze_cnis',
              description: 'Análise estruturada de CNIS',
              parameters: {
                type: 'object',
                properties: {
                  hasMaternityBenefitSameEvent: { 
                    type: 'boolean', 
                    description: 'Há auxílio-maternidade concedido para o mesmo evento?' 
                  },
                  previousBenefits: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        nb: { type: 'string' },
                        benefitType: { type: 'string' },
                        startDate: { type: 'string' },
                        endDate: { type: 'string' },
                        status: { type: 'string' }
                      }
                    }
                  },
                  currentSalary: { type: 'number', description: 'Remuneração atual/recente (valor numérico)' },
                  lastEmploymentDate: { type: 'string', description: 'Data último vínculo (YYYY-MM-DD)' },
                  hasUrbanEmployment: { type: 'boolean' },
                  specialSituation: { 
                    type: 'string', 
                    description: 'Descrição da situação especial se houver' 
                  }
                },
                required: []
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'analyze_cnis' } }
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('Resposta da IA sem tool call');
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log('[DETECT-CNIS] 📊 Análise:', JSON.stringify(analysis, null, 2));

    // Salvar histórico de benefícios se houver
    if (analysis.previousBenefits && analysis.previousBenefits.length > 0) {
      for (const benefit of analysis.previousBenefits) {
        await supabase.from('benefit_history').insert({
          case_id: caseId,
          nb: benefit.nb,
          benefit_type: benefit.benefitType || 'Salário-Maternidade',
          start_date: benefit.startDate || null,
          end_date: benefit.endDate || null,
          status: benefit.status || 'DESCONHECIDO'
        });
      }
    }

    // Criar exceção se houver situação especial
    if (analysis.hasMaternityBenefitSameEvent || analysis.specialSituation) {
      const description = analysis.specialSituation || 
        `Benefício de auxílio-maternidade já concedido anteriormente para o mesmo evento (${analysis.previousBenefits?.[0]?.nb || 'NB não identificado'}). Caso de RESTABELECIMENTO.`;
      
      await supabase.from('case_exceptions').insert({
        case_id: caseId,
        exception_type: 'beneficio_anterior_concedido',
        description
      });
      
      console.log('[DETECT-CNIS] ⚠️ Situação especial detectada:', description);
    }

    // Atualizar NIT no caso
    if (analysis.nit) {
      await supabase.from('cases').update({ nit: analysis.nit }).eq('id', caseId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        specialSituationDetected: analysis.hasMaternityBenefitSameEvent || !!analysis.specialSituation
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[DETECT-CNIS] ❌ Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
