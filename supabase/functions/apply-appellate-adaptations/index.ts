import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "../_shared/cors.ts";
import { callLovableAI } from "../_shared/ai-helpers.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, appellateAnalysis } = await req.json();
    
    console.log('[APPLY-APPELLATE] Aplicando adaptações recursivas:', {
      caseId,
      adaptacoes: appellateAnalysis?.adaptacoes_sugeridas?.length || 0
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

    const adaptacoesList = appellateAnalysis.adaptacoes_sugeridas.map((adaptacao: any, i: number) => `
### ADAPTAÇÃO RECURSIVA ${i + 1}
**Seção:** ${adaptacao.secao}
**Adaptação:** ${adaptacao.adaptacao}
**Justificativa TNU:** ${adaptacao.justificativa}
**Precedente:** ${adaptacao.precedente || 'N/A'}
    `).join('\n---\n');

    const prompt = `Você é um advogado especializado em recursos para a TNU (Turma Nacional de Uniformização).

# PETIÇÃO ORIGINAL (PRIMEIRA INSTÂNCIA)
${petition}

═══════════════════════════════════════════════════════════════

# ADAPTAÇÕES PARA PERSPECTIVA RECURSIVA (TNU)

${adaptacoesList}

═══════════════════════════════════════════════════════════════

# INSTRUÇÕES

Adapte a petição para que ela já esteja preparada para eventual recurso à TNU:

1. Antecipe argumentos que serão úteis em recurso
2. Reforce temas já decididos pela TNU de forma favorável
3. Neutralize possíveis defesas do INSS que costumam prosperar em recursos
4. Cite precedentes da TNU que favoreçam a tese
5. Use linguagem que demonstre conhecimento da jurisprudência da TNU
6. Implemente TODAS as ${appellateAnalysis.adaptacoes_sugeridas.length} adaptações listadas acima

Retorne a petição COMPLETA adaptada em markdown.`;

    const result = await callLovableAI(prompt, {
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      timeout: 60000
    });

    const petition_adaptada = result.content;

    console.log('[APPLY-APPELLATE] ✅ Adaptações aplicadas');

    return new Response(JSON.stringify({
      petition_adaptada,
      adaptacoes_aplicadas: appellateAnalysis.adaptacoes_sugeridas.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[APPLY-APPELLATE] ❌ Erro:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
