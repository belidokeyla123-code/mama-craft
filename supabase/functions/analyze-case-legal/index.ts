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

    // Buscar dados completos do caso
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseError) throw caseError;

    // 🆕 BUSCAR BENEFÍCIOS MANUAIS
    const manualBenefits = caseData?.manual_benefits || [];
    console.log('[ANALYZE] Benefícios manuais encontrados:', manualBenefits.length);

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('case_id', caseId);

    const { data: extractions } = await supabase
      .from('extractions')
      .select('*')
      .eq('case_id', caseId);

    // Buscar histórico de benefícios e exceções
    const { data: benefitHistory } = await supabase
      .from('benefit_history')
      .select('*')
      .eq('case_id', caseId);

    const { data: caseExceptions } = await supabase
      .from('case_exceptions')
      .select('*')
      .eq('case_id', caseId);

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

⚠️⚠️⚠️ AGORA VOCÊ VAI FAZER ANÁLISE JURÍDICA ⚠️⚠️⚠️

Você é um advogado especialista em Direito Previdenciário. Analise este caso de salário-maternidade e forneça uma análise jurídica completa.

IMPORTANTE SOBRE O BENEFÍCIO:
- A REQUERENTE é a MÃE (author_name no JSON)
- O FILHO é apenas um requisito para o benefício (não é o requerente)
- Salário-maternidade é benefício pago à MÃE por ter dado à luz
- Verifique a idade e qualidade de segurada da MÃE na data do parto

**REGRA CRÍTICA PARA TIMELINE:**
- Se há documentos comprovantes (autodeclaracao_rural, documento_terra, declaracao_saude_ubs) E o período é descrito como "comprovado por documentos" → use status: "reconhecido"
- Se NÃO há documentos ou descrição indica "a comprovar" → use status: "a_comprovar"
- NUNCA use "a_comprovar" quando há documentos válidos anexados

**REGRA PARA PONTOS FRACOS:**
- NUNCA liste "falta data de início de atividade rural" se há documentos rurais (autodeclaração, documento da terra, UBS) comprovando o período
- SEMPRE priorize análise de documentos sobre campos vazios no formulário
- Se há autodeclaração rural detalhada + documento da terra + declaração UBS → período rural está COMPROVADO, mesmo que 'rural_activity_since' esteja vazio
- Ponto fraco só é válido se REALMENTE faltar prova documental

**ANÁLISE AVANÇADA DO CNIS:**
Ao analisar o CNIS, você deve:

1. **Interpretar ausência de vínculos:**
   - Se CNIS mostra 0 anos e 0 meses E perfil é "especial" → isso é POSITIVO
   - Significa: sem vínculos urbanos = reforça qualidade de segurada especial rural
   - Inclua em "pontos_fortes": "CNIS sem vínculos urbanos reforça perfil de segurada especial rural"

2. **Análise prospectiva:**
   - Calcular: Da data do parto (${caseData.child_birth_date}) até hoje (2025-10-29)
   - Adicionar em cnis_analysis.analise_prospectiva: "Se a ação for procedente, o período de [data parto] até a presente data (~X anos) será reconhecido como tempo de contribuição rural, gerando direito a futuros benefícios previdenciários"

3. **Benefícios futuros:**
   - Explicar impacto: Reconhecimento desse tempo pode facilitar aposentadoria por idade rural no futuro
   - Adicionar em cnis_analysis.impacto_futuro: "O reconhecimento desse período é estratégico para futuros benefícios previdenciários, especialmente aposentadoria por idade rural"
   - Adicionar em recomendacoes: "Orientar a cliente que o reconhecimento desse período é estratégico para futuros benefícios previdenciários"

DADOS DO CASO:
${JSON.stringify(caseData, null, 2)}

📁 DOCUMENTOS JÁ ENVIADOS PELA CLIENTE (${documents?.length || 0}):
${documents?.map(d => `✅ ${d.document_type} - ${d.file_name} [JÁ POSSUI]`).join('\n') || '❌ Nenhum documento enviado ainda'}

⚠️⚠️⚠️ ATENÇÃO CRÍTICA: OS DOCUMENTOS LISTADOS ACIMA JÁ FORAM ENVIADOS! ⚠️⚠️⚠️
NÃO RECOMENDE JUNTAR DOCUMENTOS QUE JÁ ESTÃO NA LISTA ACIMA!

EXTRAÇÕES (resumidas):
${extractions?.slice(0, 3).map(e => `- Doc: ${e.document_id} | Dados: ${JSON.stringify(e.entities || {}).substring(0, 200)}...`).join('\n') || 'Nenhuma'}
${extractions && extractions.length > 3 ? `... e mais ${extractions.length - 3} extrações` : ''}

TAREFA: Faça uma análise jurídica completa e retorne JSON com:
{
  "qualidade_segurada": {
    "tipo": "especial" | "urbana",
    "comprovado": boolean,
    "detalhes": "Explicação detalhada sobre a QUALIDADE DE SEGURADA DA MÃE"
  },
  "carencia": {
    "necessaria": boolean,
    "cumprida": boolean,
    "meses_faltantes": number,
    "detalhes": "Explicação se a MÃE cumpriu carência"
  },
  "cnis_analysis": {
    "periodos_urbanos": [{"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD", "empregador": "Nome"}],
    "periodos_rurais": [{"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD", "detalhes": "Descrição"}],
    "beneficios_anteriores": [{"tipo": "auxilio-maternidade", "data": "YYYY-MM-DD"}],
    "tempo_reconhecido_inss": {"anos": 0, "meses": 0},
    "interpretacao": "CNIS sem vínculos urbanos - FAVORÁVEL ao perfil rural",
    "analise_prospectiva": "Se procedente, período de [data parto] até [data atual] (~X anos) será reconhecido como tempo rural",
    "impacto_futuro": "Tempo reconhecido facilitará aposentadoria por idade rural no futuro"
  },
  "timeline": [
    {"periodo": "2015-2020", "tipo": "rural", "status": "reconhecido", "detalhes": "Atividade rural comprovada"}
  ],
  "rmi": {
    "valor": 1412.00,
    "base_calculo": "Salário mínimo",
    "situacao_especial": false,
    "observacoes": ""
  },
  "valor_causa": 5648.00,
  "probabilidade_exito": {
    "score": 85,
    "nivel": "alta" | "media" | "baixa",
    "justificativa": ["Razão 1", "Razão 2"],
    "pontos_fortes": ["Ponto forte 1"],
    "pontos_fracos": ["Ponto fraco 1"]
  },
  "recomendacoes": ["Recomendação 1"]
}

**REGRAS CRÍTICAS - RECOMENDAÇÕES:**

Documentos JÁ ENVIADOS (NÃO recomende novamente):
${documents?.map(d => `✅ ${d.document_type}`).join(', ') || 'Nenhum'}

⚠️ REGRAS:
1. NÃO recomende documentos da lista acima
2. NÃO recomende "pedidos processuais" (tutela urgência, inversão ônus, etc) - isso vai na minuta
3. Recomende APENAS: documentos faltantes, buscar testemunhas, orientações
4. Priorize: CRÍTICO (docs obrigatórios) > ALTO (reforçam prova) > MÉDIO (orientações)

**SITUAÇÕES ESPECIAIS DETECTADAS:**
${caseExceptions && caseExceptions.length > 0 ? 
  caseExceptions.map(ex => `- ${ex.exception_type}: ${ex.description}`).join('\n') : 
  'Nenhuma situação especial identificada'}

**BENEFÍCIOS ANTERIORES - ANÁLISE COMPLETA:**

📋 Benefícios Detectados Automaticamente (CNIS/Processo Admin):
${benefitHistory && benefitHistory.length > 0 ?
  benefitHistory.map(b => `- NB ${b.nb}: ${b.benefit_type} (${b.start_date} a ${b.end_date}) - Status: ${b.status}`).join('\n') :
  'Nenhum benefício detectado automaticamente'}

✍️ Benefícios Informados Manualmente pela Cliente:
${manualBenefits && manualBenefits.length > 0 ?
  manualBenefits.map((b: any) => `- TIPO: ${b.tipo} | PERÍODO: ${b.inicio} a ${b.fim} | NB: ${b.numero_beneficio || 'Não informado'}`).join('\n') :
  'Nenhum benefício informado manualmente'}

⚠️⚠️⚠️ REGRA CRÍTICA SOBRE SALÁRIO-MATERNIDADE ANTERIOR ⚠️⚠️⚠️
Se a cliente informou manualmente que recebeu SALÁRIO-MATERNIDADE anteriormente:
→ Isso é um PONTO FORTE, NÃO um ponto fraco!
→ Jurisprudência consolidada: Mulher pode receber múltiplos salários-maternidade (um para cada filho)
→ Art. 71, Lei 8.213/91: Direito a salário-maternidade para CADA gestação
→ Não há impedimento de receber novo benefício se já recebeu antes
→ Adicione em "pontos_fortes": "Histórico de salário-maternidade anterior comprova vínculo previdenciário e reforça direito ao novo benefício"
→ NÃO adicione em "pontos_fracos" nada relacionado a "já recebeu benefício" ou "INSS indeferiu por benefício anterior"

Se INSS indeferiu alegando benefício anterior:
→ Fundamente que salário-maternidade é POR GESTAÇÃO, não há limite
→ Cite jurisprudência: TNU-PEDILEF 0506032-44.2012.4.05.8300
→ Adicione em "recomendacoes": "Fundamentar na inicial que salário-maternidade é devido POR CADA GESTAÇÃO, sem limite de quantidade"

Considere:
- Para segurada especial: carência dispensada
- Para segurada urbana: 10 meses de carência
- RMI segurada especial = salário mínimo vigente (${caseData.salario_minimo_ref})
- RMI segurada urbana = média das últimas 12 remunerações
- Valor da causa = 4 meses × RMI
- Se há benefício CONCEDIDO anteriormente → Caso de RESTABELECIMENTO (Art. 71, §4º, Lei 8.213/91)
- Se há múltiplos indeferimentos → Analisar razões e fundamentar recurso
- Se CNIS mostra remuneração urbana recente → Avaliar qualidade de segurada urbana
- A requerente é ${caseData.author_name || 'a mãe'} (MÃE), não a criança
- Verifique idade e qualidade da MÃE na data do evento (child_birth_date)
- Jurisprudência aplicável: TNU, Pedido 0502723-87.2015.4.05.8300 (restabelecimento)`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Timeout de 30 segundos (otimizado para casos com muitos documentos)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      const analysisResult = JSON.parse(aiData.choices[0].message.content);

      // Atualizar RMI e valor_causa no caso
      if (analysisResult.rmi?.valor_final) {
        await supabase
          .from('cases')
          .update({
            rmi_calculated: analysisResult.rmi.valor_final,
            valor_causa: analysisResult.valor_causa
          })
          .eq('id', caseId);
      }

      // Salvar análise na tabela case_analysis
      const { error: insertError } = await supabase
        .from('case_analysis')
        .upsert({
          case_id: caseId,
          qualidade_segurada: analysisResult.qualidade_segurada,
          carencia: analysisResult.carencia,
          rmi: analysisResult.rmi,
          valor_causa: analysisResult.valor_causa,
          draft_payload: analysisResult,
          analyzed_at: new Date().toISOString()
        }, { onConflict: 'case_id' });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      return new Response(JSON.stringify(analysisResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Análise demorou muito. Tente com menos documentos.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in analyze-case-legal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
