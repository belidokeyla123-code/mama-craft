import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { ESPECIALISTA_MATERNIDADE_PROMPT } from "../_shared/prompts/especialista-maternidade.ts";
import { buildPromptForDocType } from './prompts.ts';
import { validateRequest, documentAnalysisSchema, createValidationErrorResponse } from "../_shared/validators.ts";

// ============================================================
// SISTEMA DE NOMENCLATURA INTELIGENTE
// ============================================================

function sanitizeName(name: string | undefined): string {
  if (!name) return 'Sem_Nome';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_]|_$/g, '')
    .substring(0, 50);
}

function formatDateForFileName(date: string | undefined): string {
  if (!date) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function generateIntelligentFileName(docType: string, extractedData: any, originalFileName: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const originalExt = originalFileName.split('.').pop() || 'png';
  
  const templates: Record<string, (d: any) => string> = {
    certidao_nascimento: (d) => {
      // ✅ Priorizar nome da CRIANÇA, não da mãe
      const name = sanitizeName(d.childName || d.motherName || 'Sem_Nome');
      const date = formatDateForFileName(d.childBirthDate || d.motherBirthDate || timestamp);
      return `Certidao_Nascimento_${name}_${date}`;
    },
    identificacao: (d) => {
      const name = sanitizeName(d.fullName);
      if (d.rg) return `RG_${name}_${d.rg.replace(/[^0-9]/g, '').substring(0, 10)}`;
      if (d.cpf) return `CPF_${name}_${d.cpf.replace(/[^0-9]/g, '')}`;
      return `Identificacao_${name}`;
    },
    procuracao: (d) => {
      // ✅ CORRIGIDO: Usar granterName (outorgante), não attorneyName
      const granterName = d.granterName || d.clientName || 'Outorgante_Nao_Identificado';
      const cpf = d.granterCpf ? `_${d.granterCpf.substring(0, 11)}` : '';
      return `Procuracao_${sanitizeName(granterName)}${cpf}_${timestamp}`;
    },
    cnis: (d) => {
      const nit = d.nit ? `_${d.nit.replace(/[^0-9]/g, '')}` : '';
      return `CNIS${nit}_${timestamp}`;
    },
    autodeclaracao_rural: (d) => {
      const name = sanitizeName(d.fullName || d.declarantName || 'Declarante');
      return `Autodeclaracao_Rural_${name}_${timestamp}`;
    },
    documento_terra: (d) => {
      const owner = sanitizeName(d.landOwnerName || 'Proprietario');
      const docType = d.documentType || 'Terra';
      return `${docType}_${owner}_${timestamp}`;
    },
    processo_administrativo: (d) => {
      const protocol = d.raProtocol ? `_${d.raProtocol.replace(/[^0-9]/g, '')}` : '';
      return `Processo_Administrativo${protocol}_${timestamp}`;
    },
    comprovante_residencia: (d) => {
      const name = sanitizeName(d.holderName || 'Titular');
      return `Comprovante_Residencia_${name}_${timestamp}`;
    },
    historico_escolar: (d) => {
      const name = sanitizeName(d.studentName || 'Aluno');
      return `Historico_Escolar_${name}_${timestamp}`;
    },
    declaracao_saude_ubs: (d) => {
      const name = sanitizeName(d.patientName || 'Paciente');
      return `Declaracao_Saude_${name}_${timestamp}`;
    },
  };
  
  const generator = templates[docType];
  if (!generator) return `${docType}_${timestamp}`;
  
  try {
    const fileName = generator(extractedData);
    return `${fileName}.${originalExt}`;
  } catch (error) {
    console.error(`Erro ao gerar nome para ${docType}:`, error);
    return `${docType}_${timestamp}.${originalExt}`;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: user } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Could not get user')

    const requestBody = await req.json();
    
    // ✅ VALIDAÇÃO DE ENTRADA
    let validated;
    try {
      validated = validateRequest(documentAnalysisSchema, requestBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return createValidationErrorResponse(error, corsHeaders);
      }
      throw error;
    }
    
    const { documentId, caseId, forceReprocess = false } = validated;

    // ==================================================================
    // 1. Buscar dados do documento
    // ==================================================================
    console.log(`[DOC ${documentId}] Iniciando análise...`);
    const { data: documentData, error: documentError } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (documentError) {
      console.error(`[DOC ${documentId}] Erro ao buscar dados do documento:`, documentError);
      throw new Error(documentError.message);
    }

    if (!documentData) {
      console.error(`[DOC ${documentId}] Documento não encontrado.`);
      throw new Error("Document not found");
    }

    const filePath = documentData.file_path;
    const originalFileName = documentData.file_name;
    const currentType = documentData.document_type;

    console.log(`[DOC ${documentId}] Tipo atual: ${currentType}`);

    // ==================================================================
    // 2. Verificar se já existe análise e se deve reprocessar
    // ==================================================================
    const { data: existingAnalysis, error: existingAnalysisError } = await supabaseClient
      .from('extractions')
      .select('*')
      .eq('document_id', documentId)
      .single();

    if (existingAnalysisError && existingAnalysisError.code !== 'PGRST116') {
      console.error(`[DOC ${documentId}] Erro ao verificar análise existente:`, existingAnalysisError);
      throw new Error(existingAnalysisError.message);
    }

    if (existingAnalysis && !forceReprocess) {
      console.log(`[DOC ${documentId}] Análise já existe. Ignorando.`);
      return new Response(
        JSON.stringify({ 
          message: "Análise já existente", 
          documentId, 
          newFileName: documentData.file_name 
        }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================================================================
    // 3. Baixar o arquivo do storage
    // ==================================================================
    console.log(`[DOC ${documentId}] Baixando arquivo do storage: ${filePath}`);
    const { data: fileData, error: storageError } = await supabaseClient.storage
      .from('case-documents')
      .download(filePath);

    if (storageError) {
      console.error(`[DOC ${documentId}] Erro ao baixar arquivo do storage:`, storageError);
      throw new Error(storageError.message);
    }

    if (!fileData) {
      console.error(`[DOC ${documentId}] Arquivo não encontrado no storage.`);
      throw new Error("File not found in storage");
    }

    // ✅ MUDANÇA 3: VERIFICAR SE É PDF - Se sim, disparar conversão automática
    const isPDF = documentData.mime_type === 'application/pdf' || originalFileName.toLowerCase().endsWith('.pdf');
    if (isPDF) {
      console.log(`[DOC ${documentId}] 📄 DOCUMENTO É PDF - Disparando conversão automática...`);
      
      // Chamar reconvert-failed-pdfs para converter este PDF
      const { error: reconvertError } = await supabaseClient.functions.invoke('reconvert-failed-pdfs', {
        body: { caseId }
      });
      
      if (reconvertError) {
        console.error(`[DOC ${documentId}] Erro ao disparar conversão:`, reconvertError);
      } else {
        console.log(`[DOC ${documentId}] ✅ Conversão automática iniciada`);
      }
      
      return new Response(
        JSON.stringify({ 
          message: "PDF detectado - conversão automática iniciada",
          documentId,
          caseId,
          status: "converting"
        }), {
        status: 202, // ✅ Status 202 Accepted (processando)
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const arrayBuffer = await fileData.arrayBuffer();
    const fileBase64 = encodeBase64(arrayBuffer);
    console.log(`[DOC ${documentId}] Arquivo baixado e convertido para Base64 (${Math.round(arrayBuffer.byteLength / 1024)}KB).`);

    // ==================================================================
    // 4. ETAPA 1: CLASSIFICAR PRIMEIRO (não confiar no tipo atual)
    // ==================================================================
    console.log(`[DOC ${documentId}] 🎯 ETAPA 1: Classificando documento pelo CONTEÚDO...`);
    
    const classificationPrompt = `Você é um especialista em análise documental jurídica para processos previdenciários.

⚠️ CRÍTICO: RETORNE APENAS JSON VÁLIDO! SUA RESPOSTA DEVE COMEÇAR COM { E TERMINAR COM }

🔍 **ANALISE A IMAGEM E IDENTIFIQUE O TIPO DO DOCUMENTO:**

**Arquivo:** "${originalFileName}"

**TIPOS POSSÍVEIS (escolha o mais adequado):**

1. **procuracao** - Documento assinado autorizando advogado a representar o cliente
   - Contém palavras: "outorga", "poderes", "advogado", "OAB"
   
2. **certidao_nascimento** - Certidão de nascimento de criança
   - Contém: dados da criança, data de nascimento, nome dos pais, cartório
   
3. **identificacao** - RG, CPF, CNH ou outro documento de identidade
   - Contém: foto, RG, CPF, órgão emissor
   
4. **cnis** - Extrato do CNIS (histórico previdenciário)
   - Contém: "CNIS", "vínculos", "remunerações", períodos de trabalho
   
5. **autodeclaracao_rural** - Declaração de atividade rural ASSINADA
   - Contém: "declaro", "atividade rural", assinatura, testemunhas
   
6. **documento_terra** - Contrato de comodato, arrendamento, ITR, CCIR
   - Contém: "comodato", "arrendamento", "ITR", "propriedade rural", "hectares"
   
7. **processo_administrativo** - Protocolo ou indeferimento do INSS
   - Contém: "INSS", "protocolo", "indeferimento", número de processo
   
8. **comprovante_residencia** - Conta de luz, água, telefone
   - Contém: endereço, conta de consumo, valor a pagar
   
9. **historico_escolar** - Histórico ou declaração escolar
   - Contém: escola, série, notas, frequência
   
10. **declaracao_saude_ubs** - Declaração de saúde da UBS
    - Contém: "UBS", "unidade básica de saúde", declaração médica

11. **outro** - APENAS se realmente não se encaixar em nenhum tipo acima

**RETORNE JSON:**
{
  "documentType": "tipo_do_documento",
  "confidence": 0.95,
  "reason": "Explique brevemente por que classificou assim"
}`;

    const prompt = classificationPrompt;
    console.log(`[DOC ${documentId}] 📋 Prompt de classificação gerado`);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    const aiRequestBody = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${fileBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    };

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(aiRequestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[DOC ${documentId}] ❌ Erro na resposta da IA:`, aiResponse.status, errorText);
      
      // ⚠️ Erro 400 geralmente é imagem corrompida ou muito grande
      if (aiResponse.status === 400) {
        console.error(`[DOC ${documentId}] ⚠️ Imagem pode estar corrompida ou formato inválido`);
        
        // Salvar erro para o usuário saber
        await supabaseClient
          .from('extractions')
          .upsert({
            document_id: documentId,
            case_id: caseId,
            entities: {
              error: "Falha ao processar imagem. Arquivo pode estar corrompido.",
              documentType: "outro",
              status: "error"
            },
            extracted_at: new Date().toISOString(),
          }, { onConflict: 'document_id' });
        
        return new Response(
          JSON.stringify({ 
            error: "Falha ao processar imagem. Arquivo pode estar corrompido.",
            documentId,
            shouldRetry: false
          }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices[0].message.content;
    
    console.log(`[DOC ${documentId}] 📝 Resposta bruta da IA:`, rawContent.substring(0, 200));
    
    // Usar parseJSONResponse do ai-helpers para lidar com texto misturado
    const { parseJSONResponse } = await import('../_shared/ai-helpers.ts');
    let analysisResult = parseJSONResponse(rawContent, { 
      documentType: 'outro',
      extracted: {},
      confidence: 0.0
    });

    console.log(`[DOC ${documentId}] ✅ ETAPA 1 CONCLUÍDA: Tipo identificado = ${analysisResult.documentType}`);
    
    // ==================================================================
    // 5. ETAPA 2: Se classificou corretamente, extrair dados detalhados
    // ==================================================================
    if (analysisResult.documentType && analysisResult.documentType !== 'outro' && analysisResult.documentType !== 'OUTRO') {
      console.log(`[DOC ${documentId}] 🎯 ETAPA 2: Extraindo dados detalhados para tipo: ${analysisResult.documentType}`);
      
      // Atualizar tipo no banco IMEDIATAMENTE
      await supabaseClient
        .from('documents')
        .update({ document_type: analysisResult.documentType })
        .eq('id', documentId);
      
      // Usar prompt específico para extrair dados detalhados
      const detailedPrompt = buildPromptForDocType(analysisResult.documentType, originalFileName);
      console.log(`[DOC ${documentId}] 📋 Prompt detalhado gerado (${detailedPrompt.length} caracteres)`);
      
      const detailedRequest = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: detailedPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${fileBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 8192,
        temperature: 0.3,
      };

      const detailedResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(detailedRequest),
      });

      if (detailedResponse.ok) {
        const detailedData = await detailedResponse.json();
        const detailedRawContent = detailedData.choices[0].message.content;
        const detailedResult = parseJSONResponse(detailedRawContent, analysisResult);
        
        // Mesclar dados detalhados com classificação
        analysisResult = {
          ...analysisResult,
          ...detailedResult,
          documentType: analysisResult.documentType // Manter tipo da classificação
        };
        
        console.log(`[DOC ${documentId}] ✅ ETAPA 2 CONCLUÍDA: Dados detalhados extraídos`);
      } else {
        console.log(`[DOC ${documentId}] ⚠️ ETAPA 2 FALHOU: Mantendo apenas classificação`);
      }
    }
    
    // ✅ FALLBACK: Se não conseguiu classificar ou classificou como "outro"
    if (!analysisResult.documentType || analysisResult.documentType === 'outro' || analysisResult.documentType === 'OUTRO') {
      console.log(`[DOC ${documentId}] ⚠️ Não conseguiu classificar corretamente. Tentando novamente com prompt genérico...`);
      
      const genericPrompt = `Analise este documento e identifique o tipo.

⚠️ CRÍTICO: RETORNE APENAS JSON VÁLIDO! 
SUA RESPOSTA DEVE COMEÇAR COM { E TERMINAR COM }
NÃO adicione "Aqui está o JSON:" ou qualquer texto antes/depois.
APENAS O JSON PURO!

TIPOS POSSÍVEIS (escolha apenas um):
- certidao_nascimento
- identificacao (RG, CNH, CPF)
- procuracao
- cnis
- autodeclaracao_rural
- documento_terra
- processo_administrativo
- comprovante_residencia
- historico_escolar
- declaracao_saude_ubs
- outro (APENAS se realmente não se encaixar em nenhum dos acima)

RETORNE JSON com análise detalhada:
{
  "documentType": "tipo_identificado",
  "confidence": 0.0-1.0,
  "reason": "explicação detalhada do porquê você classificou assim",
  "extracted": {
    "...dados extraídos..."
  }
}`;

      const fallbackRequest = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: genericPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${fileBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      };

      const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(fallbackRequest),
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        const fallbackRawContent = fallbackData.choices[0].message.content;
        const fallbackResult = parseJSONResponse(fallbackRawContent, analysisResult);
        
        if (fallbackResult.documentType && fallbackResult.documentType !== 'outro') {
          console.log(`[DOC ${documentId}] ✅ Segunda tentativa bem-sucedida: ${fallbackResult.documentType}`);
          analysisResult = fallbackResult;
          
          // Atualizar o tipo do documento IMEDIATAMENTE
          await supabaseClient
            .from('documents')
            .update({ document_type: fallbackResult.documentType })
            .eq('id', documentId);
        } else {
          console.log(`[DOC ${documentId}] ⚠️ Segunda tentativa também resultou em "outro"`);
        }
      }
    }

    // ==================================================================
    // 5. Salvar os resultados da análise no banco de dados
    // ==================================================================
    console.log(`[DOC ${documentId}] Salvando resultados da análise no banco de dados...`);
    const { error: upsertError } = await supabaseClient
      .from('extractions')
      .upsert({
        document_id: documentId,
        case_id: caseId,
        entities: analysisResult,
        auto_filled_fields: analysisResult,
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'document_id' });

    if (upsertError) {
      console.error(`[DOC ${documentId}] Erro ao salvar análise no banco de dados:`, upsertError);
      throw new Error(upsertError.message);
    }

    console.log(`[DOC ${documentId}] Análise salva no banco de dados.`);

    // ==================================================================
    // 6. Sistema de Nomenclatura Inteligente
    // ==================================================================
    console.log(`[DOC ${documentId}] Gerando novo nome de arquivo...`);
    const newFileName = generateIntelligentFileName(
      currentType,
      analysisResult,
      originalFileName
    );

    if (!newFileName) {
      console.warn(`[DOC ${documentId}] Não foi possível gerar um novo nome de arquivo. Mantendo o original.`);
    }

    // ==================================================================
    // 7. Renomear o arquivo no storage (se o nome for diferente)
    // ==================================================================
    let newFilePath = filePath;
    if (newFileName && newFileName !== originalFileName) {
      console.log(`[DOC ${documentId}] Renomeando arquivo no storage para: ${newFileName}`);
      const newPath = filePath.substring(0, filePath.lastIndexOf('/') + 1) + newFileName;

      // Verificar se o arquivo já existe no caminho de destino
      const { data: existingFile } = await supabaseClient.storage
        .from('case-documents')
        .list(newPath.substring(0, newPath.lastIndexOf('/')), {
          search: newFileName
        });

      if (existingFile && existingFile.length > 0) {
        console.log(`[DOC ${documentId}] Arquivo já existe no caminho de destino. Atualizando apenas o banco de dados.`);
        newFilePath = newPath;
      } else {
        // Tentar renomear apenas se o arquivo de origem ainda existir
        const { data: moveData, error: moveError } = await supabaseClient.storage
          .from('case-documents')
          .move(filePath, newPath);

        if (moveError) {
          // Se o arquivo não foi encontrado, pode já ter sido renomeado anteriormente
          if (moveError.message.includes('Object not found')) {
            console.warn(`[DOC ${documentId}] Arquivo de origem não encontrado. Pode já ter sido renomeado. Continuando...`);
            newFilePath = newPath;
          } else {
            console.error(`[DOC ${documentId}] Erro ao renomear arquivo no storage:`, moveError);
            throw new Error(moveError.message);
          }
        } else {
          newFilePath = newPath;
          console.log(`[DOC ${documentId}] Arquivo renomeado no storage para: ${newPath}`);
        }
      }
    }

    // ==================================================================
    // 8. Atualizar o nome do arquivo no banco de dados (se renomeado)
    // ==================================================================
    if (newFileName && newFileName !== originalFileName) {
      console.log(`[DOC ${documentId}] Atualizando nome do arquivo no banco de dados para: ${newFileName}`);
      const { error: updateError } = await supabaseClient
        .from('documents')
        .update({ file_name: newFileName, file_path: newFilePath })
        .eq('id', documentId);

      if (updateError) {
        console.error(`[DOC ${documentId}] Erro ao atualizar nome do arquivo no banco de dados:`, updateError);
        throw new Error(updateError.message);
      }

      console.log(`[DOC ${documentId}] Nome do arquivo atualizado no banco de dados.`);
    }

    // ==================================================================
    // 9. Responder com sucesso
    // ==================================================================
    console.log(`[DOC ${documentId}] Análise concluída com sucesso.`);
    return new Response(
      JSON.stringify({ 
        message: "Análise concluída com sucesso", 
        documentId, 
        newFileName 
      }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Erro durante a execução da função:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
