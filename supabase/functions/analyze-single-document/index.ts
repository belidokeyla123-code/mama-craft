import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema dinâmico por tipo de documento
function getSchemaForDocType(docType: string) {
  const schemas: Record<string, any> = {
    certidao_nascimento: {
      type: 'object',
      properties: {
        childName: { type: 'string', description: 'Nome completo da criança (no topo da certidão)' },
        childBirthDate: { type: 'string', description: 'Data de nascimento da criança (formato YYYY-MM-DD)' },
        motherName: { type: 'string', description: 'Nome completo da mãe (seção FILIAÇÃO MATERNA)' },
        fatherName: { type: 'string', description: 'Nome completo do pai (seção FILIAÇÃO PATERNA)' },
        registryNumber: { type: 'string', description: 'Número da matrícula/registro' },
        registryDate: { type: 'string', description: 'Data do registro (formato YYYY-MM-DD)' },
        birthCity: { type: 'string', description: 'Cidade onde nasceu' }
      },
      required: ['childName', 'childBirthDate', 'motherName']
    },
    processo_administrativo: {
      type: 'object',
      properties: {
        raProtocol: { type: 'string', description: 'Número do protocolo/NB do processo administrativo' },
        raRequestDate: { type: 'string', description: 'Data do requerimento administrativo (formato YYYY-MM-DD)' },
        raDenialDate: { type: 'string', description: 'Data do indeferimento (formato YYYY-MM-DD)' },
        raDenialReason: { type: 'string', description: 'Motivo completo e literal do indeferimento' },
        benefitType: { type: 'string', description: 'Tipo do benefício solicitado (ex: Salário-Maternidade)' }
      },
      required: ['raProtocol']
    },
    autodeclaracao_rural: {
      type: 'object',
      properties: {
        ruralPeriods: {
          type: 'array',
          description: 'Períodos de trabalho rural',
          items: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Data início (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'Data fim (YYYY-MM-DD)' },
              location: { type: 'string', description: 'Local/município' },
              activities: { type: 'string', description: 'Atividades exercidas' },
              withWhom: { type: 'string', description: 'Com quem trabalhou' }
            }
          }
        },
        familyMembersDetailed: {
          type: 'array',
          description: 'Membros do grupo familiar',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              cpf: { type: 'string' },
              birthDate: { type: 'string' },
              relationship: { type: 'string' }
            }
          }
        },
        landOwnerName: { type: 'string', description: 'Nome do proprietário da terra' },
        landOwnerCpf: { type: 'string', description: 'CPF do proprietário (apenas números)' }
      }
    },
    documento_terra: {
      type: 'object',
      properties: {
        landOwnerName: { type: 'string', description: 'Nome completo do proprietário da terra' },
        landOwnerCpf: { type: 'string', description: 'CPF do proprietário (apenas números)' },
        landOwnerRg: { type: 'string', description: 'RG completo com órgão expedidor' },
        landArea: { type: 'string', description: 'Área total do imóvel em hectares' },
        landLocation: { type: 'string', description: 'Localização/endereço do imóvel' },
        registryNumber: { type: 'string', description: 'Número da matrícula/registro' }
      },
      required: ['landOwnerName']
    },
    identificacao: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'Nome completo da pessoa' },
        cpf: { type: 'string', description: 'CPF (apenas números, sem pontos/traços)' },
        rg: { type: 'string', description: 'RG completo com órgão expedidor' },
        birthDate: { type: 'string', description: 'Data de nascimento (formato YYYY-MM-DD)' },
        motherName: { type: 'string', description: 'Nome completo da mãe (filiação)' },
        fatherName: { type: 'string', description: 'Nome completo do pai (filiação)' }
      },
      required: ['fullName']
    },
    comprovante_residencia: {
      type: 'object',
      properties: {
        holderName: { type: 'string', description: 'Nome do titular da conta' },
        address: { type: 'string', description: 'Endereço completo' },
        city: { type: 'string', description: 'Cidade' },
        state: { type: 'string', description: 'Estado (UF)' },
        zipCode: { type: 'string', description: 'CEP' },
        referenceDate: { type: 'string', description: 'Data de referência do comprovante (YYYY-MM-DD)' }
      }
    },
    cnis: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'Nome completo do segurado' },
        cpf: { type: 'string', description: 'CPF (apenas números)' },
        contributionRecords: {
          type: 'array',
          description: 'Registros de vínculos/contribuições',
          items: {
            type: 'object',
            properties: {
              employer: { type: 'string' },
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              cnpj: { type: 'string' }
            }
          }
        }
      }
    },
    historico_escolar: {
      type: 'object',
      properties: {
        studentName: { type: 'string', description: 'Nome completo do aluno' },
        schoolName: { type: 'string', description: 'Nome da instituição de ensino' },
        period: { type: 'string', description: 'Período/ano letivo' },
        grades: { type: 'string', description: 'Série/ano cursado' }
      }
    },
    declaracao_saude_ubs: {
      type: 'object',
      properties: {
        patientName: { type: 'string', description: 'Nome do paciente' },
        healthUnit: { type: 'string', description: 'Nome da UBS/Posto de Saúde' },
        declarationDate: { type: 'string', description: 'Data da declaração (YYYY-MM-DD)' },
        content: { type: 'string', description: 'Conteúdo da declaração' }
      }
    },
    procuracao: {
      type: 'object',
      properties: {
        granterName: { type: 'string', description: 'Nome do outorgante (quem dá o poder)' },
        granterCpf: { type: 'string', description: 'CPF do outorgante' },
        attorneyName: { type: 'string', description: 'Nome do outorgado (procurador/advogado)' },
        attorneyCpf: { type: 'string', description: 'CPF do outorgado' },
        oabNumber: { type: 'string', description: 'Número da OAB do advogado' },
        powers: { type: 'string', description: 'Poderes outorgados' },
        signatureDate: { type: 'string', description: 'Data da assinatura (YYYY-MM-DD)' }
      }
    }
  };

  return schemas[docType] || {
    type: 'object',
    description: 'Dados extraídos do documento',
    additionalProperties: true
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, caseId } = await req.json();
    console.log(`[ANALYZE-SINGLE] 📄 Analisando documento ${documentId} do caso ${caseId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar documento
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Documento não encontrado: ${docError?.message}`);
    }

    console.log(`[ANALYZE-SINGLE] 📂 Documento: ${doc.file_name} (${doc.document_type})`);

    // 2. Baixar imagem do Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('case-documents')
      .download(doc.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Erro ao baixar: ${downloadError?.message}`);
    }

    // 3. Converter para base64 usando biblioteca padrão do Deno (solução correta!)
    const arrayBuffer = await fileData.arrayBuffer();
    
    // Usar encode do Deno que é otimizado para arquivos grandes
    const base64 = base64Encode(arrayBuffer);
    const base64Image = `data:${doc.mime_type};base64,${base64}`;

    console.log(`[ANALYZE-SINGLE] 🖼️ Imagem convertida (${(base64.length / 1024).toFixed(1)} KB)`);

    // 4. Classificar tipo (se ainda não classificado)
    let docType = doc.document_type;
    if (docType === 'OUTROS') {
      docType = classifyDocument(doc.file_name);
      console.log(`[ANALYZE-SINGLE] 🏷️ Tipo detectado: ${docType}`);
      
      // Atualizar tipo no banco
      await supabase
        .from('documents')
        .update({ document_type: docType })
        .eq('id', documentId);
    }

    // 5. Montar prompt específico
    const prompt = buildPromptForDocType(docType, doc.file_name);

    // 6. Chamar IA
    console.log(`[ANALYZE-SINGLE] 🤖 Chamando IA (Gemini 2.5 Flash)...`);
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_completion_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: ESPECIALISTA_MATERNIDADE_PROMPT + '\n\nVocê é um especialista em OCR. Extraia TODAS as informações visíveis com máxima precisão.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: base64Image } }
            ]
          }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'extract_document_data',
            description: 'Extrair dados estruturados do documento',
            parameters: {
              type: 'object',
              properties: {
                documentType: { type: 'string', description: 'Tipo do documento' },
                extractionConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                extractedData: getSchemaForDocType(docType)
              },
              required: ['documentType', 'extractionConfidence', 'extractedData']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'extract_document_data' } }
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`IA falhou: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    console.log(`[ANALYZE-SINGLE] ✅ IA respondeu`);

    // 7. Extrair dados da resposta
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error('IA não retornou dados estruturados');
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log(`[ANALYZE-SINGLE] 📋 Dados extraídos:`, JSON.stringify(extracted, null, 2));

    // 8. Salvar extração individual (sem campo confidence que não existe)
    const { error: saveError } = await supabase
      .from('extractions')
      .upsert({
        case_id: caseId,
        document_id: documentId,
        entities: extracted.extractedData || {},
        extracted_at: new Date().toISOString()
      });

    if (saveError) {
      console.error('[ANALYZE-SINGLE] ⚠️ Erro ao salvar:', saveError);
    }

    // 9. Atualizar campos do caso se for certidão
    if (docType === 'certidao_nascimento' && extracted.extractedData) {
      const updates: any = {};
      if (extracted.extractedData.childName) updates.child_name = extracted.extractedData.childName;
      if (extracted.extractedData.childBirthDate) updates.child_birth_date = extracted.extractedData.childBirthDate;
      if (extracted.extractedData.motherName) updates.author_name = extracted.extractedData.motherName;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('cases')
          .update(updates)
          .eq('id', caseId);
        console.log(`[ANALYZE-SINGLE] 📝 Caso atualizado:`, updates);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        docType,
        extracted: extracted.extractedData,
        confidence: extracted.extractionConfidence
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[ANALYZE-SINGLE] ❌ Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Classificar tipo de documento baseado no nome
function classifyDocument(fileName: string): string {
  const lower = fileName.toLowerCase();
  
  if (/(procura[cç][aã]o|poder|outorga)/i.test(lower)) return 'procuracao';
  if (/(certid[aã]o.*nasc|nascimento|dn)/i.test(lower)) return 'certidao_nascimento';
  if (/(rg|identidade|cnh|carteira)/i.test(lower)) return 'identificacao';
  if (/(cpf)/i.test(lower)) return 'identificacao';
  if (/(comprovante.*resid|endere[cç]o|conta.*luz|agua|telefone)/i.test(lower)) return 'comprovante_residencia';
  if (/(autodeclara[cç][aã]o|declara[cç][aã]o.*rural)/i.test(lower)) return 'autodeclaracao_rural';
  if (/(documento.*terra|posse|propriedade|matricula|escritura|contrato.*compra)/i.test(lower)) return 'documento_terra';
  if (/(cnis|cadastro.*informa[cç])/i.test(lower)) return 'cnis';
  if (/(processo|indeferi|indeferimento|requerimento|beneficio|despacho|decisao)/i.test(lower)) return 'processo_administrativo';
  if (/(hist[oó]rico.*escolar|declara[cç][aã]o.*escola)/i.test(lower)) return 'historico_escolar';
  if (/(declara[cç][aã]o.*sa[uú]de|ubs|posto.*sa[uú]de)/i.test(lower)) return 'declaracao_saude_ubs';
  
  return 'outro';
}

// Montar prompt específico por tipo
function buildPromptForDocType(docType: string, fileName: string): string {
  const basePrompt = `Documento: ${fileName}\nTipo: ${docType}\n\n`;
  
  if (docType === 'certidao_nascimento') {
    return basePrompt + `🚨 CERTIDÃO DE NASCIMENTO - ATENÇÃO MÁXIMA!

**EXTRAIR (não confundir):**
1. childName: Nome da CRIANÇA (topo do documento)
2. childBirthDate: Data nascimento (formato YYYY-MM-DD)
3. motherName: Nome da MÃE (seção "FILIAÇÃO MATERNA" - DIFERENTE da criança!)
4. fatherName: Nome do PAI (seção "FILIAÇÃO PATERNA")

**REGRA: childName ≠ motherName**`;
  }
  
  if (docType === 'processo_administrativo') {
    return basePrompt + `🚨 PROCESSO INSS - EXTRAIR:
- raProtocol: Número do protocolo/NB
- raRequestDate: Data do requerimento (YYYY-MM-DD)
- raDenialDate: Data do indeferimento (YYYY-MM-DD)
- raDenialReason: Motivo completo (copiar literal)`;
  }
  
  if (docType === 'autodeclaracao_rural') {
    return basePrompt + `🌾 AUTODECLARAÇÃO RURAL - EXTRAIR:
- ruralPeriods: [{startDate, endDate, location, activities, withWhom}]
- familyMembersDetailed: Tabela do grupo familiar completa
- landOwnerName, landOwnerCpf: Dados do proprietário da terra`;
  }
  
  if (docType === 'documento_terra') {
    return basePrompt + `🏡 DOCUMENTO DA TERRA - EXTRAIR:
- landOwnerName: Nome do proprietário
- landOwnerCpf: CPF (apenas números)
- landOwnerRg: RG completo
- landArea: Área em hectares`;
  }
  
  if (docType === 'identificacao') {
    return basePrompt + `🪪 DOCUMENTO DE IDENTIFICAÇÃO - EXTRAIR:
- fullName: Nome completo
- cpf: CPF (apenas números)
- rg: RG com órgão expedidor
- birthDate: Data nascimento (YYYY-MM-DD)
- motherName: Nome da mãe (filiação)`;
  }
  
  return basePrompt + `Extraia TODAS as informações visíveis deste documento.`;
}
