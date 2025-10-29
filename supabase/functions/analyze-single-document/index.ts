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
        motherCpf: { type: 'string', description: 'CPF da mãe (apenas números, sem pontos/traços)' },
        fatherName: { type: 'string', description: 'Nome completo do pai (seção FILIAÇÃO PATERNA)' },
        fatherCpf: { type: 'string', description: 'CPF do pai (apenas números, sem pontos/traços)' },
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
    certidao_casamento: {
      type: 'object',
      properties: {
        spouseName: { type: 'string', description: 'Nome completo do cônjuge' },
        spouseCpf: { type: 'string', description: 'CPF do cônjuge (apenas números)' },
        marriageDate: { type: 'string', description: 'Data do casamento (formato YYYY-MM-DD)' },
        marriageLocation: { type: 'string', description: 'Local/cartório do casamento' },
        propertyRegime: { type: 'string', description: 'Regime de bens' },
        authorMaritalStatus: { type: 'string', description: 'Estado civil (casada/casado)' }
      },
      required: ['spouseName', 'marriageDate']
    },
    cnis: {
      type: 'object',
      properties: {
        nit: { type: 'string', description: 'Número de Identificação do Trabalhador (NIT)' },
        currentSalary: { type: 'number', description: 'Salário/remuneração atual ou mais recente (valor numérico)' },
        lastEmploymentDate: { type: 'string', description: 'Data do último vínculo empregatício (YYYY-MM-DD)' },
        hasUrbanEmployment: { type: 'boolean', description: 'Possui vínculos urbanos ativos ou recentes?' },
        previousBenefits: {
          type: 'array',
          description: 'Benefícios anteriores identificados',
          items: {
            type: 'object',
            properties: {
              nb: { type: 'string', description: 'Número do benefício' },
              benefitType: { type: 'string', description: 'Tipo (ex: Salário-Maternidade)' },
              startDate: { type: 'string', description: 'Data início (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'Data fim (YYYY-MM-DD)' },
              status: { type: 'string', description: 'Status: ATIVO, CESSADO, INDEFERIDO' }
            }
          }
        },
        hasMaternityBenefitSameEvent: { type: 'boolean', description: 'Há auxílio-maternidade concedido para o mesmo evento?' }
      }
    },
    cartao_vacina: {
      type: 'object',
      properties: {
        childName: { type: 'string', description: 'Nome completo da criança' },
        childBirthDate: { type: 'string', description: 'Data de nascimento (YYYY-MM-DD)' },
        birthCity: { type: 'string', description: 'Cidade onde nasceu' },
        birthState: { type: 'string', description: 'Estado onde nasceu (sigla, ex: MG)' },
        vaccinations: {
          type: 'array',
          description: 'Histórico de vacinas',
          items: {
            type: 'object',
            properties: {
              vaccine: { type: 'string' },
              date: { type: 'string' },
              dose: { type: 'string' }
            }
          }
        }
      },
      required: ['childName', 'childBirthDate']
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

    // 2. Baixar arquivo do Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('case-documents')
      .download(doc.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Erro ao baixar: ${downloadError?.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const mimeType = doc.mime_type || '';
    const isPdf = mimeType === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');
    
    // 3. DETECTAR PDFs antigos (já no storage) - ignorar graciosamente
    if (isPdf) {
      console.log(`[ANALYZE-SINGLE] ⚠️ PDF detectado no storage - pulando análise (PDFs devem ser convertidos no cliente)`);
      
      return new Response(
        JSON.stringify({
          success: true,
          documentId,
          docType: 'outro',
          extracted: {},
          confidence: 'low',
          skipped: true,
          message: 'PDF não processado - faça re-upload para converter em imagens',
          debug: {
            modelUsed: 'none',
            processingType: 'skipped_pdf'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Converter imagem para base64
    const base64 = base64Encode(arrayBuffer);
    const base64Image = `data:${mimeType};base64,${base64}`;
    console.log(`[ANALYZE-SINGLE] 🖼️ Imagem convertida para análise (${(base64.length / 1024).toFixed(1)} KB)`);

    // 4. Classificar tipo (se ainda não classificado)
    let docType = doc.document_type;
    if (docType === 'OUTROS' || docType === 'outro') {
      docType = classifyDocument(doc.file_name);
      console.log(`[ANALYZE-SINGLE] 🏷️ Tipo detectado por filename: ${docType}`);
      
      // 🔥 FALLBACK VISUAL: Se filename deu tipo específico mas pode ser ambíguo, usar IA para confirmar
      // Especialmente para nomes truncados como CERT~1.PDF que podem ser vários tipos
      const isAmbiguousName = /^[A-Z0-9~]{1,8}\.(pdf|png|jpg)/i.test(doc.file_name);
      
      if (isAmbiguousName || docType === 'outro') {
        console.log(`[ANALYZE-SINGLE] 🤖 Classificação visual iniciando (nome ambíguo: ${isAmbiguousName})...`);
        
        const classifyResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            max_completion_tokens: 100,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Qual o tipo deste documento? Responda APENAS com UMA das opções: certidao_nascimento, identificacao, comprovante_residencia, processo_administrativo, autodeclaracao_rural, documento_terra, procuracao, cnis, historico_escolar, declaracao_saude_ubs, outro' },
                { type: 'image_url', image_url: { url: base64Image } }
              ]
            }]
          })
        });
        
        if (classifyResponse.ok) {
          const classifyResult = await classifyResponse.json();
          const visualType = classifyResult.choices?.[0]?.message?.content?.trim().toLowerCase();
          if (visualType && visualType !== 'outro') {
            docType = visualType;
            console.log(`[ANALYZE-SINGLE] 👁️ Tipo detectado VISUALMENTE: ${docType} (sobrescreveu classificação por nome)`);
          }
        }
      }
      
      // Atualizar tipo no banco
      await supabase
        .from('documents')
        .update({ document_type: docType })
        .eq('id', documentId);
    } else {
      console.log(`[ANALYZE-SINGLE] 🏷️ Tipo já classificado: ${docType}`);
    }

    // 5. Montar prompt específico
    const prompt = buildPromptForDocType(docType, doc.file_name);

    // 6. Chamar IA com imagem para OCR
    console.log(`[ANALYZE-SINGLE] 🤖 Chamando IA (Google Gemini 2.5 Flash)...`);
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: ESPECIALISTA_MATERNIDADE_PROMPT + `

📋 **INSTRUÇÕES ESPECÍFICAS PARA EXTRAÇÃO DE DADOS**

Você é um especialista altamente experiente em análise de documentos previdenciários brasileiros, com foco em:

1. **Processos administrativos do INSS** (indeferimentos, concessões, despachos)
2. **Certidões de nascimento** (formato brasileiro RCPN)
3. **Documentos de identificação** (RG, CPF)
4. **Comprovantes de atividade rural** (autodeclarações, ITR, documentos de terra)
5. **Históricos escolares e declarações de saúde** (UBS/Postos rurais)

🎯 **REGRAS CRÍTICAS:**

- Extraia **TODAS** as informações visíveis com **precisão máxima**
- Use OCR com atenção especial a:
  - Datas (formato brasileiro DD/MM/AAAA → converter para YYYY-MM-DD)
  - Números de protocolo/NB (geralmente 10+ dígitos)
  - CPFs (11 dígitos, remover pontos/traços)
  - Nomes completos (respeitar maiúsculas/minúsculas originais)
  
- **PROCESSO INSS (Indeferimento):** Extraia protocolo/NB, data do requerimento, data do indeferimento, motivo literal completo
- **CERTIDÃO DE NASCIMENTO:** Nome da criança ≠ Nome da mãe (são pessoas diferentes!)
- **DOCUMENTOS DE TERRA:** Extrair nome do proprietário, CPF, área, localização
- **AUTODECLARAÇÃO RURAL:** Períodos de trabalho, membros da família, atividades

⚠️ **RESPONDA SEMPRE EM PORTUGUÊS BRASILEIRO** usando a função extract_document_data fornecida.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\n\n⚠️ **INSTRUÇÕES CRÍTICAS:**\n- Esta é uma IMAGEM de documento\n- Use OCR para ler TODAS as informações visíveis\n- Atenção especial a: datas, números de protocolo, CPFs, nomes completos\n- Para datas, use formato YYYY-MM-DD (exemplo: "2022-11-19")\n- Para CPF, extraia apenas números (sem pontos/traços)\n- **IMPORTANTE:** Se uma informação NÃO estiver visível no documento, deixe o campo VAZIO ou omita-o completamente\n- **NUNCA** retorne mensagens explicativas como valor de um campo (exemplo: "Não é possível extrair...")\n- **NUNCA** retorne texto descritivo no lugar de valores estruturados\n- Se o documento não corresponder ao tipo esperado, ajuste o documentType e extraia apenas o que é visível\n- Responda SEMPRE em português brasileiro\n- Use a função extract_document_data para retornar os dados estruturados`
              },
              {
                type: 'image_url',
                image_url: { url: base64Image }
              }
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
    console.log(`[ANALYZE-SINGLE] 🔍 Resposta completa da IA:`, JSON.stringify(aiResult, null, 2));

    // 7. Extrair dados da resposta com parsing defensivo
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error(`[ANALYZE-SINGLE] ❌ IA não retornou tool calls. Resposta:`, JSON.stringify(aiResult.choices?.[0]?.message, null, 2));
      throw new Error('IA não retornou dados estruturados');
    }

    let extracted;
    try {
      // Tentar parsear JSON diretamente
      const rawJson = toolCall.function.arguments;
      console.log(`[ANALYZE-SINGLE] 🔍 JSON bruto (primeiros 200 chars):`, rawJson.substring(0, 200));
      
      // Sanitizar: remover texto após fechamento do JSON principal
      let cleanJson = rawJson.trim();
      const lastBrace = cleanJson.lastIndexOf('}');
      if (lastBrace !== -1 && lastBrace < cleanJson.length - 1) {
        console.log(`[ANALYZE-SINGLE] ⚠️ JSON tinha texto extra após }, removendo...`);
        cleanJson = cleanJson.substring(0, lastBrace + 1);
      }
      
      extracted = JSON.parse(cleanJson);
      console.log(`[ANALYZE-SINGLE] 📋 Dados extraídos:`, JSON.stringify(extracted, null, 2));
      console.log(`[ANALYZE-SINGLE] 🔍 childName:`, extracted.extractedData?.childName);
      console.log(`[ANALYZE-SINGLE] 🔍 motherName:`, extracted.extractedData?.motherName);
      console.log(`[ANALYZE-SINGLE] 🔍 motherCpf:`, extracted.extractedData?.motherCpf);
      console.log(`[ANALYZE-SINGLE] 🔍 fatherCpf:`, extracted.extractedData?.fatherCpf);
    } catch (parseError: any) {
      console.error(`[ANALYZE-SINGLE] ❌ Erro ao parsear JSON:`, parseError.message);
      console.error(`[ANALYZE-SINGLE] 📄 JSON completo que falhou:`, toolCall.function.arguments);
      throw new Error(`Falha ao parsear resposta da IA: ${parseError.message}`);
    }

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

    // 9. Atualizar campos do caso conforme tipo de documento
    if ((docType === 'certidao_nascimento' || docType === 'cartao_vacina') && extracted.extractedData) {
      const updates: any = {};
      
      // Helper: validar se é uma data válida no formato YYYY-MM-DD
      const isValidDate = (dateStr: string | undefined | null): boolean => {
        if (!dateStr || typeof dateStr !== 'string') return false;
        // Regex para YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) return false;
        // Verificar se é uma data real
        const date = new Date(dateStr);
        return date instanceof Date && !isNaN(date.getTime());
      };
      
      // Helper: validar se é texto explicativo (não é um valor extraído)
      const isExplanationText = (value: string | undefined | null): boolean => {
        if (!value || typeof value !== 'string') return false;
        // Se contém frases explicativas, não é um valor válido
        const explanationPhrases = [
          'não é possível',
          'não foi possível',
          'não consta',
          'não está',
          'não é uma certidão',
          'documento não contém',
          'informação não disponível'
        ];
        const lowerValue = value.toLowerCase();
        return explanationPhrases.some(phrase => lowerValue.includes(phrase));
      };
      
      // Extrair childName (validar se não é texto explicativo)
      if (extracted.extractedData.childName && !isExplanationText(extracted.extractedData.childName)) {
        updates.child_name = extracted.extractedData.childName;
        console.log(`[ANALYZE-SINGLE] ✅ childName: ${extracted.extractedData.childName}`);
      }
      
      // Extrair childBirthDate (validar formato de data)
      if (extracted.extractedData.childBirthDate && isValidDate(extracted.extractedData.childBirthDate)) {
        updates.child_birth_date = extracted.extractedData.childBirthDate;
        console.log(`[ANALYZE-SINGLE] ✅ childBirthDate: ${extracted.extractedData.childBirthDate}`);
      } else if (extracted.extractedData.childBirthDate) {
        console.log(`[ANALYZE-SINGLE] ⚠️ childBirthDate inválida (ignorada): ${extracted.extractedData.childBirthDate.substring(0, 100)}`);
      }
      
      // Extrair motherName (validar se não é texto explicativo)
      if (extracted.extractedData.motherName && !isExplanationText(extracted.extractedData.motherName)) {
        updates.author_name = extracted.extractedData.motherName;
        console.log(`[ANALYZE-SINGLE] ✅ motherName: ${extracted.extractedData.motherName}`);
      }
      
      // Extrair motherCpf (validar formato numérico)
      if (extracted.extractedData.motherCpf && /^\d{11}$/.test(extracted.extractedData.motherCpf)) {
        updates.mother_cpf = extracted.extractedData.motherCpf;
        console.log(`[ANALYZE-SINGLE] ✅ motherCpf: ${extracted.extractedData.motherCpf}`);
      }
      
      // Extrair fatherName (validar se não é texto explicativo)
      if (extracted.extractedData.fatherName && !isExplanationText(extracted.extractedData.fatherName)) {
        updates.father_name = extracted.extractedData.fatherName;
      }
      
      // Extrair fatherCpf (validar formato numérico)
      if (extracted.extractedData.fatherCpf && /^\d{11}$/.test(extracted.extractedData.fatherCpf)) {
        updates.father_cpf = extracted.extractedData.fatherCpf;
        console.log(`[ANALYZE-SINGLE] ✅ fatherCpf: ${extracted.extractedData.fatherCpf}`);
      }
      
      // Extrair birthCity e birthState (cartão de vacina)
      if (extracted.extractedData.birthCity && !isExplanationText(extracted.extractedData.birthCity)) {
        updates.birth_city = extracted.extractedData.birthCity;
        console.log(`[ANALYZE-SINGLE] ✅ birthCity: ${extracted.extractedData.birthCity}`);
      }
      if (extracted.extractedData.birthState && !isExplanationText(extracted.extractedData.birthState)) {
        updates.birth_state = extracted.extractedData.birthState;
        console.log(`[ANALYZE-SINGLE] ✅ birthState: ${extracted.extractedData.birthState}`);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('cases')
          .update(updates)
          .eq('id', caseId);
        
        if (updateError) {
          console.error(`[ANALYZE-SINGLE] ❌ Erro ao atualizar caso:`, updateError);
        } else {
          console.log(`[ANALYZE-SINGLE] 📝 Caso atualizado:`, updates);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        docType,
        extracted: extracted.extractedData,
        confidence: extracted.extractionConfidence,
        debug: {
          modelUsed: 'google/gemini-2.5-flash',
          processingType: 'visual_ocr'
        }
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
  
  // 🔥 PRIORIDADE ALTA: Detectar nomes truncados DOS 8.3 (cert~1, certid~1, etc)
  if (/(cert|certid|nasc|nascimento|dn)/i.test(lower)) return 'certidao_nascimento';
  if (/(procura[cç][aã]o|poder|outorga)/i.test(lower)) return 'procuracao';
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
4. motherCpf: CPF da MÃE (apenas números, sem pontos/traços - procurar na seção da mãe)
5. fatherName: Nome do PAI (seção "FILIAÇÃO PATERNA")
6. fatherCpf: CPF do PAI (apenas números, sem pontos/traços - procurar na seção do pai)

**REGRAS CRÍTICAS:**
- childName ≠ motherName (não confundir!)
- CPFs devem estar no formato numérico puro (ex: "12345678900")
- Se CPF não estiver visível, deixar em branco (não inventar)`;
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
