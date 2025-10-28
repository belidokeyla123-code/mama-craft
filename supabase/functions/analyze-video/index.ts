import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { ESPECIALISTA_MATERNIDADE_PROMPT } from '../_shared/prompts/especialista-maternidade.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    const { caseId, videoFile } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

🎥 **ANÁLISE DE VÍDEO**

Você recebeu um vídeo relacionado ao caso de auxílio maternidade. Analise o conteúdo e descreva:

1. **O que é mostrado no vídeo**: Local, pessoas, atividades, ambiente
2. **Relevância para o caso**: Como este vídeo comprova atividade rural, residência, ou outras informações importantes
3. **Dados extraíveis**: Informações que podem ser adicionadas à petição

RETORNE JSON:
{
  "descricao_video": "Descrição detalhada do que é mostrado",
  "relevancia_caso": "Como este vídeo ajuda o caso",
  "informacoes_extraidas": {
    "local": "descrição do local",
    "atividades": ["atividade1", "atividade2"],
    "pessoas": "quem aparece",
    "evidencias_rurais": ["evidência1", "evidência2"]
  },
  "sugestao_uso_peticao": "Como incluir na petição"
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:video/mp4;base64,${videoFile}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" }
      }),
    });
    
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }
    
    const result = await aiResponse.json();
    const analysis = JSON.parse(result.choices[0].message.content);
    
    // Salvar análise
    const { error: updateError } = await supabase
      .from('cases')
      .update({
        video_analysis: analysis,
        updated_at: new Date().toISOString()
      })
      .eq('id', caseId);
    
    if (updateError) throw updateError;
    
    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in analyze-video:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});