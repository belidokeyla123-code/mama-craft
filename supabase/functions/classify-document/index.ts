import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4.20.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { documentId, text } = await req.json()

    console.log(`[Classify] Processing document: ${documentId}`)

    // Use GPT to classify document and extract entities
    const prompt = `Você é um assistente especializado em classificar documentos previdenciários.

Analise o texto abaixo e:
1. Classifique o tipo de documento
2. Extraia todas as entidades relevantes

TIPOS DE DOCUMENTOS POSSÍVEIS:
- RG/CPF
- Certidão de Nascimento
- Certidão de Casamento
- Comprovante de Residência
- CNIS (Cadastro Nacional de Informações Sociais)
- Autodeclaração Rural
- Contrato (Honorários)
- Procuração
- Documento da Terra (ITR, Escritura)
- Declaração de Sindicato
- Nota Fiscal Rural
- Outro

ENTIDADES PARA EXTRAIR:
- nome_completo
- cpf
- rg
- data_nascimento
- endereco
- telefone
- nome_mae
- nome_pai
- cpf_mae
- cpf_pai
- nome_filho
- data_nascimento_filho
- nit
- valor_contrato (se for contrato de honorários)

TEXTO DO DOCUMENTO:
${text.substring(0, 2000)}

Responda APENAS com um JSON válido no formato:
{
  "document_type": "tipo_do_documento",
  "confidence": 0.95,
  "entities": {
    "nome_completo": "valor ou null",
    "cpf": "valor ou null",
    ...
  }
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    })

    const responseText = completion.choices[0]?.message?.content || '{}'
    console.log('[Classify] GPT Response:', responseText)

    // Parse JSON response
    let classification
    try {
      classification = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[Classify] Failed to parse GPT response:', parseError)
      classification = {
        document_type: 'Outro',
        confidence: 0.5,
        entities: {}
      }
    }

    // Update document with classification
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({
        document_type: classification.document_type,
        classification_confidence: classification.confidence,
        classification_status: 'completed',
        classified_at: new Date().toISOString()
      })
      .eq('id', documentId)

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`)
    }

    // Save entities to extractions table
    const { data: document } = await supabaseClient
      .from('documents')
      .select('case_id')
      .eq('id', documentId)
      .single()

    if (document && classification.entities) {
      const { error: extractionError } = await supabaseClient
        .from('extractions')
        .insert({
          case_id: document.case_id,
          document_id: documentId,
          entities: classification.entities,
          extracted_at: new Date().toISOString()
        })

      if (extractionError) {
        console.error('[Classify] Failed to save extraction:', extractionError)
      }
    }

    console.log(`[Classify] Classified as: ${classification.document_type}`)

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        classification
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Classify] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
