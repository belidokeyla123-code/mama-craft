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
    const { text, image, extractionType } = await req.json();
    
    if ((!text && !image) || !extractionType) {
      throw new Error("Parâmetros 'text' ou 'image' e 'extractionType' são obrigatórios");
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    // Definir prompt baseado no tipo
    let systemPrompt = "";
    
    if (extractionType === "terra") {
      systemPrompt = `Você é um assistente ESPECIALIZADO em extração de dados de documentos de terra/propriedade rural.

ANALISE CUIDADOSAMENTE o documento fornecido e extraia informações sobre:
- Área em hectares (procure por "ha", "hectares", "área total", "área explorada")
- Nome da propriedade/sítio
- Município e UF
- Nome do proprietário
- Tipo de cessão (comodato, arrendamento, propriedade, posse)
- Número do ITR (se houver)

RACIOCÍNIO:
- Se for matrícula de imóvel: procure área, localização, proprietário
- Se for ITR: procure número do ITR, área, município
- Se for contrato: procure partes envolvidas, área, tipo de cessão

Retorne um JSON válido com as seguintes chaves (use null se não encontrar):
{
  "landArea": número em hectares,
  "landTotalArea": número em hectares,
  "landExploitedArea": número em hectares,
  "landCessionType": "comodato" | "arrendamento" | "propriedade" | "posse" | "outro",
  "landITR": "número do ITR" ou "NÃO POSSUI",
  "landPropertyName": "nome da propriedade/sítio",
  "landMunicipality": "município/UF",
  "landOwnerName": "nome completo do proprietário"
}

Retorne APENAS o JSON, sem explicações adicionais.`;
    } 
    else if (extractionType === "processo_administrativo") {
      systemPrompt = `Você é um assistente ESPECIALIZADO em extração de dados de processos administrativos do INSS.

ANALISE CUIDADOSAMENTE o documento fornecido e extraia:
- Número do protocolo/NB
- Data do pedido
- Data do indeferimento
- Motivo COMPLETO do indeferimento (extraia TODO o texto explicativo)

RACIOCÍNIO:
- Procure por "NB", "Protocolo", "Número do Benefício"
- Identifique datas no formato DD/MM/YYYY
- O motivo geralmente está em seção chamada "Fundamentação", "Motivo", "Justificativa"

Retorne um JSON válido:
{
  "raProtocol": "número completo",
  "raRequestDate": "YYYY-MM-DD",
  "raDenialDate": "YYYY-MM-DD",
  "raDenialReason": "texto completo do motivo"
}

Retorne APENAS o JSON, sem explicações adicionais.`;
    }
    else if (extractionType === "historico_escolar") {
      systemPrompt = `Você é um assistente ESPECIALIZADO em extração de dados de históricos escolares.

ANALISE CUIDADOSAMENTE o documento fornecido e extraia:
- Nome da instituição de ensino
- Períodos de estudo (ano/série inicial e final)
- Localização da escola (se menciona "rural", "zona rural", "campo", etc)
- Datas de início e fim
- Observações relevantes

RACIOCÍNIO:
- Identifique o nome da escola no cabeçalho
- Procure por "Zona Rural", "Escola Municipal Rural", "Campo", etc
- Encontre os anos/séries cursadas
- Identifique período de estudo

Retorne um JSON válido:
{
  "school_history": [
    {
      "instituicao": "nome completo da escola",
      "periodo_inicio": "YYYY-MM-DD",
      "periodo_fim": "YYYY-MM-DD",
      "serie_ano": "1º ao 5º ano" ou série específica,
      "localizacao": "Zona Rural" | "Zona Urbana" | "informação extraída",
      "observacoes": "qualquer observação relevante"
    }
  ]
}

Se houver múltiplos períodos, adicione todos ao array.
Retorne APENAS o JSON, sem explicações adicionais.`;
    }
    else if (extractionType === "declaracao_saude_ubs") {
      systemPrompt = `Você é um assistente ESPECIALIZADO em extração de dados de declarações de saúde de UBS.

ANALISE CUIDADOSAMENTE o documento fornecido e extraia:
- Nome da Unidade Básica de Saúde
- Desde quando a pessoa recebe tratamento/atendimento
- Tipo de tratamento/acompanhamento
- Localização da UBS (se menciona "rural", "zona rural", "campo", etc)
- Observações relevantes

RACIOCÍNIO:
- Identifique o nome da UBS no cabeçalho
- Procure por datas de início de atendimento
- Identifique o tipo de tratamento (pré-natal, acompanhamento, etc)
- Verifique se menciona localização rural

Retorne um JSON válido:
{
  "health_declaration_ubs": {
    "unidade_saude": "nome completo da UBS",
    "tratamento_desde": "YYYY-MM-DD",
    "tipo_tratamento": "descrição do tratamento/acompanhamento",
    "localizacao_ubs": "Zona Rural" | "Zona Urbana" | "informação extraída",
    "observacoes": "qualquer observação relevante ou texto completo da declaração"
  }
}

Retorne APENAS o JSON, sem explicações adicionais.`;
    }
    else {
      throw new Error("extractionType inválido");
    }

    // Montar mensagem
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    if (image) {
      // Se for imagem, usar formato de vision
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analise esta imagem e extraia as informações solicitadas:'
          },
          {
            type: 'image_url',
            image_url: {
              url: image // base64 data URL
            }
          }
        ]
      });
    } else {
      // Se for texto
      messages.push({
        role: 'user',
        content: text
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // Suporta vision
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit excedido. Aguarde alguns segundos e tente novamente.");
      }
      if (response.status === 402) {
        throw new Error("Créditos de IA esgotados. Contate o administrador.");
      }
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const extractedContent = aiResult.choices[0].message.content;
    
    console.log('AI raw response:', extractedContent);
    
    // Parse do JSON retornado pela IA
    let extractedData;
    try {
      // Tentar extrair JSON se vier com texto adicional
      const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        extractedData = JSON.parse(extractedContent);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('IA retornou resposta inválida. Tente novamente.');
    }

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