import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, extractionType } = await req.json();
    
    if (!text || !extractionType) {
      throw new Error("Parâmetros 'text' e 'extractionType' são obrigatórios");
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Definir prompt baseado no tipo
    let systemPrompt = "";
    if (extractionType === "terra") {
      systemPrompt = `Você é um assistente de extração de dados. Extraia informações sobre terra/propriedade rural do texto fornecido.
      
Retorne um JSON válido com as seguintes chaves (use null se não encontrar):
- landArea (número em hectares)
- landTotalArea (número em hectares)
- landExploitedArea (número em hectares)
- landCessionType (string: comodato, arrendamento, etc)
- landITR (string: número do ITR ou "NÃO POSSUI")
- landPropertyName (string: nome da propriedade)
- landMunicipality (string: município/UF)
- landOwnerName (string: nome do proprietário)

Retorne APENAS o JSON, sem explicações adicionais.`;
    } else if (extractionType === "processo_administrativo") {
      systemPrompt = `Você é um assistente de extração de dados. Extraia informações sobre processo administrativo do INSS do texto fornecido.
      
Retorne um JSON válido com as seguintes chaves (use null se não encontrar):
- raProtocol (string: número do protocolo/NB)
- raRequestDate (string: data em formato YYYY-MM-DD)
- raDenialDate (string: data em formato YYYY-MM-DD)
- raDenialReason (string: motivo completo do indeferimento)

Retorne APENAS o JSON, sem explicações adicionais.`;
    } else {
      throw new Error("extractionType deve ser 'terra' ou 'processo_administrativo'");
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const extractedContent = aiResult.choices[0].message.content;
    
    // Parse do JSON retornado pela IA
    const extractedData = JSON.parse(extractedContent);

    return new Response(JSON.stringify({ success: true, data: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in extract-data-from-text:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
