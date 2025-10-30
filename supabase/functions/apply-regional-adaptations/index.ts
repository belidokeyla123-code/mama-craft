import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "../_shared/cors.ts";
import { callLovableAI } from "../_shared/ai-helpers.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, regionalAnalysis } = await req.json();
    
    console.log('[APPLY-REGIONAL] Aplicando adaptações regionais:', {
      caseId,
      trf: regionalAnalysis?.trf,
      adaptacoes: regionalAnalysis?.adaptacoes_sugeridas?.length || 0
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar petição atual
    const { data: draftData } = await supabase
      .from('drafts')
      .select('markdown_content')
      .eq('case_id', caseId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (!draftData?.markdown_content) {
      throw new Error('Petição não encontrada');
    }

    const petition = draftData.markdown_content;

    // Construir prompt para aplicar adaptações
    const adaptacoesList = regionalAnalysis.adaptacoes_sugeridas.map((adaptacao: any, i: number) => `
### ADAPTAÇÃO ${i + 1} - ${adaptacao.secao}
**Adaptação:** ${adaptacao.adaptacao}
**Justificativa:** ${adaptacao.justificativa}
**AÇÃO:** Você DEVE implementar esta adaptação na seção correspondente.
    `).join('\n---\n');

    const jurisprudenciasLocais = regionalAnalysis.jurisprudencias_locais_sugeridas?.map((jur: any) => `
- **${jur.numero}**
  Tese: ${jur.tese}
  Motivo: ${jur.motivo}
    `).join('\n') || '';

    const prompt = `Você é um advogado especializado em processos do ${regionalAnalysis.trf}.

# PETIÇÃO ORIGINAL
${petition}

═══════════════════════════════════════════════════════════════

# ADAPTAÇÕES REGIONAIS OBRIGATÓRIAS (${regionalAnalysis.trf})

## Características do ${regionalAnalysis.trf}:
${regionalAnalysis.tendencias.map((t: string) => `- ${t}`).join('\n')}

## Estilo Preferido:
${regionalAnalysis.estilo_preferido}

## Jurisprudências Locais Prioritárias:
${jurisprudenciasLocais}

## Adaptações Específicas a Implementar:
${adaptacoesList}

═══════════════════════════════════════════════════════════════

# INSTRUÇÕES

Reescreva a petição implementando TODAS as ${regionalAnalysis.adaptacoes_sugeridas.length} adaptações regionais acima:

1. Ajuste o estilo para o preferido do ${regionalAnalysis.trf}
2. Adicione as jurisprudências locais sugeridas nas seções apropriadas
3. Implemente cada adaptação específica listada
4. Mantenha a estrutura geral da petição
5. Torne o texto mais persuasivo para juízes do ${regionalAnalysis.trf}

Retorne a petição COMPLETA adaptada em markdown.`;

    const result = await callLovableAI(prompt, {
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      timeout: 60000
    });

    const petition_adaptada = result.content;

    console.log('[APPLY-REGIONAL] ✅ Adaptações aplicadas');

    return new Response(JSON.stringify({
      petition_adaptada,
      adaptacoes_aplicadas: regionalAnalysis.adaptacoes_sugeridas.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[APPLY-REGIONAL] ❌ Erro:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
