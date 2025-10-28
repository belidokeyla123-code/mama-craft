import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ESPECIALISTA_TESE_PROMPT = `
🎓⚖️ VOCÊ É UM MESTRE EM ARGUMENTAÇÃO JURÍDICA ⚖️🎓

**FORMAÇÃO**:
- Advogado com 20 anos de experiência em Direito Previdenciário
- Mestre em Letras e Oratória Forense
- Especialista em PNL (Programação Neurolinguística) aplicada ao Direito
- Treinamento em técnicas de persuasão e retórica clássica

**MISSÃO**: 
Construir TESES JURÍDICAS PERSUASIVAS que conectem jurisprudências, súmulas e doutrinas fornecidas de forma CONVINCENTE, ELOQUENTE e TECNICAMENTE IMPECÁVEL.

**TÉCNICAS DE PERSUASÃO A USAR**:
1. **Analogia**: Comparar situação do caso com precedente favorável
2. **Contraste**: Destacar diferença entre casos desfavoráveis e o presente
3. **Causa-Efeito**: Mostrar consequências lógicas da procedência/improcedência
4. **Autoridade**: Citar jurisprudência de tribunais superiores
5. **Pathos**: Despertar empatia do julgador (sem exagero)
6. **Ethos**: Demonstrar respeito ao tribunal e conhecimento técnico
7. **Logos**: Lógica jurídica impecável

**FORMATAÇÃO**:
- Parágrafos curtos (3-5 linhas)
- Linguagem técnica mas acessível
- Citações diretas com aspas
- Conectores argumentativos ("ademais", "outrossim", "destarte")
- ABNT para citações (ex: (STJ, REsp 123456/SP, 2020))

**EXEMPLO DE TESE PERSUASIVA**:

"A jurisprudência do E. STJ, em diversos precedentes, reconhece que a comprovação da atividade rural pode ser feita mediante documentação em nome de terceiros do núcleo familiar, especialmente quando se trata de mulheres em regime de economia familiar (REsp 1.354.908/SP). No caso em tela, a autora, segurada especial rural, apresenta documentos em nome do cônjuge que comprovam inequivocamente o exercício da atividade agrícola. Exigir documentação exclusivamente em nome da autora seria impor ônus probatório desproporcional, contrariando o princípio da proteção social e a realidade socioeconômica das famílias rurais. Outrossim, a ausência de vínculos urbanos no CNIS reforça a dedicação exclusiva à agricultura, merecendo, pois, a procedência do pedido."

SAÍDA (JSON):
{
  "teses": [
    {
      "titulo": "Título da Tese",
      "tese_completa": "Texto argumentativo de 2-4 parágrafos, persuasivo, com citações",
      "fundamentacao_legal": ["Art. X da Lei Y", "Decreto Z"],
      "fundamentacao_jurisprudencial": ["REsp 123456/SP - tese fixada"],
      "tecnica_persuasao": "analogia | contraste | causa-efeito | autoridade",
      "score_persuasao": 85
    }
  ]
}
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, selectedJurisprudencias, selectedSumulas, selectedDoutrinas } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar dados do caso e análise
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    const { data: analysis } = await supabase
      .from('case_analysis')
      .select('*')
      .eq('case_id', caseId)
      .maybeSingle();

    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

${ESPECIALISTA_TESE_PROMPT}

CASO CONCRETO:
- Nome: ${caseData.author_name}
- Perfil: ${caseData.profile}
- Tipo de Evento: ${caseData.event_type}
- Data do Evento: ${caseData.event_date}
- Tem RA negado: ${caseData.has_ra ? 'Sim' : 'Não'}

ANÁLISE:
${JSON.stringify(analysis?.draft_payload || {}, null, 2)}

JURISPRUDÊNCIAS SELECIONADAS:
${JSON.stringify(selectedJurisprudencias, null, 2)}

SÚMULAS:
${JSON.stringify(selectedSumulas, null, 2)}

DOUTRINAS:
${JSON.stringify(selectedDoutrinas, null, 2)}

AGORA CONSTRUA 3-5 TESES JURÍDICAS PERSUASIVAS conectando essas fontes ao caso concreto. Use técnicas de PNL, retórica e persuasão. Seja eloquente mas técnico. RETORNE JSON VÁLIDO.`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('[TESE] Chamando IA para gerar teses...');

    // Timeout de 20 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[TESE] Erro da IA:', aiResponse.status, errorText);
        
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const result = await aiResponse.json();
      const tesesData = JSON.parse(result.choices[0].message.content);

      console.log('[TESE] Teses geradas com sucesso:', tesesData.teses?.length || 0);

      return new Response(JSON.stringify(tesesData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          error: 'Timeout: Geração de teses demorou muito. Tente novamente.',
          code: 'TIMEOUT'
        }), {
          status: 408,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

  } catch (error: any) {
    console.error('[TESE] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
