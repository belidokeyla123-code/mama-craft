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
    const { documentId, caseId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar documento
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('file_path, file_name, extracted_text')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    // Extrair valor do contrato usando IA
    const prompt = `Analise este contrato de honorários advocatícios e extraia:

1. **Valor total do contrato** (honorários totais acordados)
2. **Percentual** (se houver, ex: 30% do valor da causa)
3. **Forma de pagamento** (ex: à vista, parcelado, êxito)

Texto do contrato:
${doc.extracted_text || 'Texto não disponível'}

Retorne APENAS um JSON válido no formato:
{
  "contract_value": 5000.00,
  "percentage": 30,
  "payment_type": "exito",
  "details": "Descrição resumida do acordo"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista em análise de contratos jurídicos.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
      }),
    });

    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Não foi possível extrair JSON da resposta');
    
    const extracted = JSON.parse(jsonMatch[0]);

    // Salvar no caso
    const { error: updateError } = await supabase
      .from('cases')
      .update({
        contract_value: extracted.contract_value,
        contract_percentage: extracted.percentage,
        payment_type: extracted.payment_type,
        contract_details: extracted.details,
      })
      .eq('id', caseId);

    if (updateError) throw updateError;

    console.log('[CONTRACT] ✅ Valor extraído:', extracted);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[CONTRACT] Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
