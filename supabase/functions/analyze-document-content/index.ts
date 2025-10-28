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
    const { documentId } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // 1. Buscar documento
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (docError) throw docError;
    
    // 2. Download do arquivo
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('case-documents')
      .download(doc.file_path);
    
    if (downloadError) throw downloadError;
    
    // 3. Converter para base64
    const arrayBuffer = await fileBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // 4. Chamar IA para analisar conteúdo
    const prompt = `${ESPECIALISTA_MATERNIDADE_PROMPT}

🔍 **MISSÃO: CLASSIFICAR DOCUMENTO POR CONTEÚDO**

Você recebeu uma imagem/PDF de um documento. Analise o **CONTEÚDO VISUAL** e classifique em um destes tipos:

- procuracao
- certidao_nascimento
- identificacao (RG/CPF)
- autodeclaracao_rural
- cnis
- documento_terra (ITR, CCIR, escritura, comodato)
- processo_administrativo (indeferimento INSS)
- comprovante_residencia (conta de luz, água)
- ficha_atendimento
- carteira_pescador
- historico_escolar
- declaracao_saude_ubs
- outro

**RETORNE APENAS JSON**:
{
  "document_type": "tipo_aqui",
  "confidence": 0.95,
  "reasoning": "Breve explicação"
}

**IMPORTANTE**: Ignore o nome do arquivo. Analise SOMENTE o conteúdo visual.`;

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
                  url: `data:${doc.mime_type};base64,${base64}`
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
    const classification = JSON.parse(result.choices[0].message.content);
    
    // 5. Atualizar document_type no banco
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        document_type: classification.document_type
      })
      .eq('id', documentId);
    
    if (updateError) throw updateError;
    
    return new Response(JSON.stringify(classification), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in analyze-document-content:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});