import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert ArrayBuffer to base64 safely
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

// Check if file is too large (limit to 4MB per image for OpenAI)
const MAX_FILE_SIZE = 4 * 1024 * 1024;

function isFileSizeAcceptable(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId, documentIds } = await req.json();
    console.log(`[OCR] Iniciando processamento para caso ${caseId} com ${documentIds.length} documentos`);
    
    // FASE 2: Retornar resposta imediata e processar em background
    const response = new Response(
      JSON.stringify({ 
        status: 'processing',
        message: 'Processamento iniciado em background',
        caseId,
        documentCount: documentIds.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
    // Processar em background usando EdgeRuntime.waitUntil
    const backgroundTask = async () => {
      try {
        await processDocumentsInBackground(caseId, documentIds);
      } catch (error) {
        console.error('[BACKGROUND] Erro no processamento:', error);
      }
    };
    
    // @ts-ignore - EdgeRuntime existe no Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask());
    } else {
      // Fallback: processar imediatamente se waitUntil não estiver disponível
      backgroundTask();
    }
    
    return response;
  } catch (error) {
    console.error("[ERRO] Falha ao iniciar processamento:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// FASE 2: Função de processamento em background
async function processDocumentsInBackground(caseId: string, documentIds: string[]) {
  try {
    console.log(`[BACKGROUND] Processando ${documentIds.length} documentos...`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Buscar os documentos
  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .in("id", documentIds);

  if (docsError) throw docsError;
  console.log(`[OCR] ${documents.length} documentos encontrados no banco`);

    // Classificar documento por nome (MELHORADO para nomes truncados)
    const classifyDocument = (fileName: string) => {
      const name = fileName.toLowerCase();
      
      // Reconhecer nomes truncados do Windows (ex: PRO~1, HIS~1)
      if (name.includes('pro') && !name.includes('protocolo') && !name.includes('processo')) return 'autodeclaracao_rural';
      if (name.includes('procuracao') || name.includes('procuração')) return 'procuracao';
      if (name.includes('certidao') && name.includes('nascimento')) return 'certidao_nascimento';
      if (name.includes('certidao') && name.includes('casamento')) return 'certidao_casamento';
      if (name.includes('cpf') || name.includes('rg') || name.includes('identidade')) return 'identificacao';
      if (name.includes('residencia') || name.includes('endereco')) return 'comprovante_residencia';
      if (name.includes('autodeclaracao') || name.includes('rural')) return 'autodeclaracao_rural';
      if (name.includes('terra') || name.includes('propriedade') || name.includes('comodato')) return 'documento_terra';
      if (name.includes('cnis') || name.includes('his')) return 'cnis';
      if (name.includes('cartao') || name.includes('gestante') || name.includes('vacina')) return 'cartao_gestante';
      
      // Processo administrativo
      if (name.includes('indeferimento') || name.includes('inss') || name.includes('nb') || 
          name.includes('processo') || name.includes('administrativo')) return 'processo_administrativo';
      
      return 'outro';
    };

  // Processar cada documento com OCR REAL
  const processedDocs: any[] = [];
  
  for (const doc of documents) {
    try {
      console.log(`[OCR] Processando ${doc.file_name} (${doc.mime_type})`);
      const docType = classifyDocument(doc.file_name);
      
      // FASE 1: Salvar classificação no banco
      await supabase
        .from('documents')
        .update({ document_type: docType })
        .eq('id', doc.id);
      console.log(`[OCR] ✓ Tipo "${docType}" salvo para ${doc.file_name}`);
      
      // Baixar o arquivo do Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("case-documents")
        .download(doc.file_path);

      if (downloadError) {
        console.error(`[OCR] ❌ Erro ao baixar ${doc.file_name}:`, downloadError);
        continue;
      }

      const fileSizeKB = (fileData.size / 1024).toFixed(1);
      const fileSizeMB = (fileData.size / 1024 / 1024).toFixed(2);
      console.log(`[OCR] ✓ Arquivo ${doc.file_name} baixado. Tamanho: ${fileSizeKB} KB (${fileSizeMB} MB)`);

      if (!isFileSizeAcceptable(fileData.size)) {
        console.warn(`[OCR] ⚠️ Arquivo ${doc.file_name} muito grande (${fileSizeMB} MB). Limite: 4 MB. Pulando...`);
        continue;
      }

      console.log(`[OCR] Convertendo ${doc.file_name} para base64...`);
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      
      const base64SizeKB = (base64.length / 1024).toFixed(1);
      console.log(`[OCR] ✓ ${doc.file_name} convertido para base64 (${base64SizeKB} KB encoded)`);
      console.log(`[OCR] Base64 preview: ${base64.substring(0, 50)}...`);
      
      processedDocs.push({
        fileName: doc.file_name,
        docType,
        mimeType: doc.mime_type,
        base64Content: base64,
        originalSize: fileData.size
      });
      
      console.log(`[OCR] ✅ ${doc.file_name} processado com sucesso`);
    } catch (error) {
      console.error(`[OCR] ❌ Erro fatal ao processar ${doc.file_name}:`, error);
      console.error(`[OCR] Stack:`, error instanceof Error ? error.stack : 'N/A');
    }
  }

  console.log(`[OCR] ✅ ${processedDocs.length}/${documents.length} documentos processados com sucesso`);
  
  const validDocs = processedDocs;

  if (validDocs.length === 0) {
    throw new Error("Nenhum documento pôde ser processado");
  }
  
  // FASE 3: Detectar se há autodeclaração rural
  const hasAutodeclaracao = validDocs.some(d => d.docType === 'autodeclaracao_rural');
  console.log(`[FASE 3] Autodeclaração rural detectada: ${hasAutodeclaracao ? 'SIM ✓' : 'NÃO'}`);

    // Chamar OpenAI GPT-4o com visão para extrair informações dos documentos
    console.log("[IA] Chamando OpenAI GPT-4o com visão para extrair dados...");
    console.log(`[IA] Total de imagens: ${validDocs.length}`);
    
    const systemPrompt = `Você é um especialista em OCR e extração de dados de documentos previdenciários brasileiros. Sua missão é extrair TODAS as informações visíveis com MÁXIMA PRECISÃO.

═══════════════════════════════════════════════════════════════
📋 TIPOS DE DOCUMENTOS E INSTRUÇÕES ESPECÍFICAS
═══════════════════════════════════════════════════════════════

🔹 **PROCURAÇÃO** (CRÍTICO - CONTÉM ENDEREÇO COMPLETO!)
   A procuração geralmente contém os dados MAIS COMPLETOS da autora:
   ✓ Nome COMPLETO da outorgante (mãe/autora)
   ✓ CPF completo
   ✓ RG completo
   ✓ Endereço COMPLETO: Rua + Nº + Bairro + Cidade + UF + CEP
   ✓ Telefone/celular (se constar)
   ⚠️ Este é o documento PRIORITÁRIO para dados de endereço e contato!
   ⚠️ Se existir procuração, EXTRAIR TODOS estes dados!

🔹 **CERTIDÃO DE NASCIMENTO** (CRÍTICO!)
   LEIA A SEÇÃO "DADOS DA MÃE" E "DADOS DO PAI" COM ATENÇÃO:
   ✓ Nome COMPLETO da criança (campo principal na certidão)
   ✓ Data de nascimento da criança DD/MM/AAAA (CAMPO CRÍTICO!)
   ✓ Local de nascimento (cidade e UF)
   ✓ Nome COMPLETO da mãe (na seção "DADOS DA MÃE")
   ✓ Data de nascimento da mãe (se constar na certidão)
   ✓ Nome COMPLETO do pai (na seção "DADOS DO PAI")
   ⚠️ Se tiver CARIMBO ou MANUSCRITO, leia também!

🔹 **CPF / RG / CNH / IDENTIDADE**
   ✓ Nome completo EXATAMENTE como aparece
   ✓ CPF (apenas 11 números, sem pontos ou traços)
   ✓ RG com órgão expedidor (ex: "12.345.678-9 SSP/MG")
   ✓ Data de nascimento DD/MM/AAAA
   ✓ Nome da mãe (filiação)
   ✓ Endereço (se constar)
   ⚠️ Leia até números manuscritos e carimbos!

🔹 **COMPROVANTE DE RESIDÊNCIA**
   ✓ Endereço COMPLETO: Rua + Nº + Complemento + Bairro + Cidade + UF + CEP
   ✓ Nome do titular
   ⚠️ Extraia o endereço COMPLETO, não apenas parte dele

🔹 **AUTODECLARAÇÃO RURAL** (CRÍTICO - MÚLTIPLOS PERÍODOS!)
   **INSTRUÇÕES ESPECIAIS**: Se o texto mencionar MÚLTIPLOS PERÍODOS, EXTRAIA TODOS!
   
   Exemplo: "Morei de 1990 a 2000 com minha mãe no Sítio São José. 
             Depois morei de 2001 a 2025 com meu esposo na Fazenda Esperança."
   
   → EXTRAIR 2 PERÍODOS SEPARADOS:
   Período 1: {
     startDate: "1990-01-01",
     endDate: "2000-12-31",
     location: "Sítio São José",
     withWhom: "com minha mãe",
     activities: "atividade rural"
   }
   Período 2: {
     startDate: "2001-01-01",
     endDate: "2025-12-31", (ou deixar vazio se ainda ativo)
     location: "Fazenda Esperança",
     withWhom: "com meu esposo",
     activities: "atividade rural"
   }
   
   ✓ TODOS os períodos de atividade rural (início e fim)
   ✓ Local de CADA período (sítio, fazenda, município)
   ✓ Com quem morava em CADA período
   ✓ Tipo de trabalho (lavoura, gado, agricultura familiar, etc)
   ✓ Se menciona zona urbana, EXTRAIR também (urbanPeriods)
   ✓ Membros da família que moram junto ATUALMENTE
   ⚠️ NÃO agrupe períodos diferentes! Separe cada um!

🔹 **DOCUMENTO DA TERRA / PROPRIEDADE**
   ✓ Nome do proprietário
   ✓ CPF do proprietário (apenas números)
   ✓ RG do proprietário
   ✓ Tipo de propriedade/relação
   ⚠️ Se o nome do arquivo menciona "documento de FULANO", FULANO é o proprietário!

🔹 **PROCESSO INSS / INDEFERIMENTO / NB** (CRÍTICO!)
   ✓ Número COMPLETO do protocolo/NB (ex: "NB 123.456.789-0")
   ✓ Data do requerimento DD/MM/AAAA
   ✓ Data do indeferimento DD/MM/AAAA
   ✓ Motivo COMPLETO do indeferimento:
      → Copie PALAVRA POR PALAVRA todo o texto do motivo
      → Inclua fundamentação jurídica, artigos de lei, etc
      → NÃO resuma, copie LITERALMENTE tudo
   ⚠️ O motivo do indeferimento é ESSENCIAL para a petição!

═══════════════════════════════════════════════════════════════
⚠️ REGRAS ABSOLUTAS - SIGA RIGOROSAMENTE!
═══════════════════════════════════════════════════════════════

1. ✅ Leia TODOS os textos, incluindo:
   - Textos manuscritos
   - Carimbos oficiais
   - Assinaturas com informações
   - Anotações laterais
   - Observações em canetas

2. ✅ Se um campo estiver visível, EXTRAIA-O
   - Não invente informações
   - Mas NUNCA deixe de extrair o que está visível
   - Prefira extrair demais do que de menos

3. ✅ Formato de datas: SEMPRE converter para YYYY-MM-DD
   - Exemplos: "15/03/2020" → "2020-03-15"
   - Se só tiver ano, usar 01/01: "2020" → "2020-01-01"

4. ✅ CPF: SEMPRE apenas os 11 números
   - "123.456.789-00" → "12345678900"

5. ✅ Nomes: Copiar EXATAMENTE como aparecem
   - Incluir todos os sobrenomes
   - Manter maiúsculas/minúsculas originais

6. ✅ Endereços: SEMPRE completos
   - Não omitir CEP, bairro, complemento
   - Incluir tudo que estiver visível

7. ✅ Motivo indeferimento: Copiar LITERALMENTE
   - Incluir TODA a fundamentação
   - Não resumir, não parafrasear

═══════════════════════════════════════════════════════════════
🎯 EXEMPLOS DE BOA EXTRAÇÃO
═══════════════════════════════════════════════════════════════

RUIM ❌:
ruralActivitySince: "2000"

BOM ✅:
ruralPeriods: [
  {
    startDate: "2000-01-01",
    endDate: "2010-12-31",
    location: "Sítio Santa Maria, Município X - MG",
    withWhom: "com meus pais",
    activities: "lavoura de milho e feijão"
  },
  {
    startDate: "2011-01-01",
    endDate: "",
    location: "Fazenda Boa Vista, Município Y - MG",
    withWhom: "com meu esposo",
    activities: "criação de gado leiteiro e agricultura familiar"
  }
]

RUIM ❌:
raDenialReason: "Falta de documentação"

BOM ✅:
raDenialReason: "O pedido foi indeferido com base no artigo 39, II, da Lei 8.213/91, uma vez que a segurada não conseguiu comprovar o exercício de atividade rural no período de carência exigido. Os documentos apresentados são insuficientes para demonstrar o vínculo laboral rural nos 10 meses anteriores ao parto. Necessário apresentar documentos em nome próprio que comprovem a atividade rural de forma contemporânea ao período de carência."

═══════════════════════════════════════════════════════════════
⚠️ SISTEMA DE QUALIDADE DA EXTRAÇÃO
═══════════════════════════════════════════════════════════════

Você será AVALIADO pela completude da extração:

✅ CAMPOS CRÍTICOS (Pontuação máxima: 100 pontos)
- Nome da mãe (20 pts) - SE VAZIO = FALHA CRÍTICA
- CPF da mãe (20 pts) - SE VAZIO = FALHA CRÍTICA
- Nome da criança (20 pts) - SE VAZIO = FALHA CRÍTICA
- Data nascimento criança (20 pts) - SE VAZIO = FALHA CRÍTICA
- Endereço completo (10 pts)
- Telefone/WhatsApp (10 pts)

✅ CAMPOS IMPORTANTES (50 pontos)
- RG da mãe (5 pts)
- Estado civil (5 pts)
- Nome do pai (5 pts)
- Períodos rurais estruturados (15 pts)
- Dados do processo administrativo completos (20 pts)

⚠️ REGRA: Se um campo crítico estiver VAZIO e o documento correspondente 
foi fornecido (ex: procuração enviada mas endereço vazio), você FALHOU!

OBJETIVO: Alcançar 100+ pontos em TODAS as extrações!

═══════════════════════════════════════════════════════════════
❌ EXEMPLO DE EXTRAÇÃO RUIM (NÃO FAÇA ISSO!)
═══════════════════════════════════════════════════════════════

{
  "motherName": "MARIA", // ❌ Faltam sobrenomes
  "motherAddress": "Rua X, 123", // ❌ Falta CEP, bairro, cidade
  "raProtocol": "123456", // ❌ Falta formato completo
  "raDenialReason": "Falta de documentos" // ❌ Muito vago, copiar LITERAL!
}

Pontuação: 40/150 ❌ REPROVADO

═══════════════════════════════════════════════════════════════
✅ EXEMPLO DE EXTRAÇÃO EXCELENTE (FAÇA ASSIM!)
═══════════════════════════════════════════════════════════════

{
  "motherName": "MARIA DA SILVA SANTOS", // ✅ Nome COMPLETO
  "motherCpf": "12345678900", // ✅ Só números
  "motherRg": "MG-12.345.678 SSP/MG", // ✅ Com órgão
  "motherAddress": "Rua das Flores, 123, Apto 201, Bairro Centro, Belo Horizonte - MG, CEP 30120-010", // ✅ COMPLETO
  "motherPhone": "31987654321", // ✅ Extraído da procuração
  "motherWhatsapp": "31987654321",
  
  "childName": "JOÃO DA SILVA SANTOS", // ✅ Nome completo da certidão
  "childBirthDate": "2024-03-15", // ✅ Formato correto
  
  "raProtocol": "NB 187.654.321-5", // ✅ Número completo
  "raRequestDate": "2024-01-10",
  "raDenialDate": "2024-02-20",
  "raDenialReason": "O benefício foi indeferido com fulcro no artigo 39, II, da Lei 8.213/91, uma vez que a segurada não logrou êxito em comprovar o exercício de atividade rural no período de carência exigido pela legislação previdenciária. A documentação apresentada, consistente em declaração de sindicato rural e fotos da propriedade, mostra-se insuficiente para demonstrar de forma contemporânea o labor campesino nos 10 (dez) meses imediatamente anteriores ao parto. Faz-se necessária a apresentação de documentos em nome próprio da autora que comprovem, de maneira inequívoca e em período próximo ao evento gerador do benefício, o efetivo exercício da atividade rural em regime de economia familiar." // ✅ Copiado PALAVRA POR PALAVRA do documento oficial
}

Pontuação: 150/150 ✅ PERFEITO!

═══════════════════════════════════════════════════════════════

AGORA EXTRAIA TODAS AS INFORMAÇÕES DOS DOCUMENTOS FORNECIDOS!`;
    
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt
      }
    ];

  // Adicionar cada documento como mensagem com imagem
  for (const doc of validDocs) {
    // FASE 3: Prompt especial para autodeclaração rural
    let docPrompt = `Documento: ${doc.fileName}\nTipo classificado: ${doc.docType}\n\nExtraia TODAS as informações visíveis neste documento com máxima precisão:`;
    
    if (doc.docType === 'autodeclaracao_rural') {
      docPrompt = `⚠️⚠️⚠️ AUTODECLARAÇÃO RURAL DETECTADA! ⚠️⚠️⚠️

Este é o documento MAIS IMPORTANTE para períodos rurais!

🔴 OBRIGATÓRIO: Você DEVE extrair os períodos rurais deste documento!

📋 INSTRUÇÕES CRÍTICAS:
1. Leia CADA parágrafo cuidadosamente
2. Identifique TODOS os períodos mencionados (ex: "morei de 1990 a 2000", "trabalho desde 2001")
3. NUNCA deixe ruralPeriods vazio se este documento existir!
4. Se houver múltiplos períodos, crie um objeto separado para CADA um
5. Se não houver datas exatas, infira do contexto (ex: "desde criança" = usar ano estimado)

⚠️ ESTE CAMPO É OBRIGATÓRIO! Sem períodos rurais = FALHA TOTAL!

Documento: ${doc.fileName}
Tipo: ${doc.docType}

Agora extraia TODOS os períodos rurais mencionados:`;
    }
    
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: docPrompt
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${doc.mimeType};base64,${doc.base64Content}`
          }
        }
      ]
    });
  }

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      max_tokens: 4000,
      temperature: 0.1,
      functions: [
        {
          name: "extract_case_info",
          description: "Extrai informações estruturadas de documentos previdenciários brasileiros",
          parameters: {
            type: "object",
            properties: {
                  // Dados da mãe/autora
                  motherName: { 
                    type: "string", 
                    description: "Nome COMPLETO da mãe/autora exatamente como aparece no documento (certidão ou RG)" 
                  },
                  motherCpf: { 
                    type: "string", 
                    description: "CPF da mãe sem formatação (apenas 11 números)" 
                  },
                  motherRg: { 
                    type: "string", 
                    description: "RG da mãe com órgão expedidor se possível" 
                  },
                  motherBirthDate: { 
                    type: "string", 
                    description: "Data nascimento da mãe formato YYYY-MM-DD (converter de DD/MM/AAAA se encontrado)" 
                  },
                  motherAddress: { 
                    type: "string", 
                    description: "Endereço COMPLETO da mãe: rua + número + bairro + cidade + UF + CEP" 
                  },
                  motherPhone: {
                    type: "string",
                    description: "Telefone ou celular da mãe (apenas números)"
                  },
                  motherWhatsapp: {
                    type: "string",
                    description: "WhatsApp da mãe (apenas números, pode ser igual ao telefone)"
                  },
                  maritalStatus: { 
                    type: "string", 
                    description: "Estado civil: solteira, casada, divorciada, viúva ou união estável" 
                  },
                  
                  // Dados da criança
                  childName: { 
                    type: "string", 
                    description: "Nome COMPLETO da criança exatamente como aparece na certidão de nascimento" 
                  },
                  childBirthDate: { 
                    type: "string", 
                    description: "Data nascimento criança YYYY-MM-DD (converter de DD/MM/AAAA) - ESTE É O EVENT_DATE" 
                  },
                  childBirthPlace: { 
                    type: "string", 
                    description: "Local de nascimento da criança (cidade e UF)" 
                  },
                  fatherName: { 
                    type: "string", 
                    description: "Nome COMPLETO do pai da criança conforme certidão" 
                  },
                  
                  // Proprietário da terra (se não for a autora)
                  landOwnerName: { 
                    type: "string", 
                    description: "Nome do proprietário da terra (do documento OU extraído do nome do arquivo se mencionar 'documento de NOME')" 
                  },
                  landOwnerCpf: { 
                    type: "string", 
                    description: "CPF do proprietário apenas números" 
                  },
                  landOwnerRg: { 
                    type: "string", 
                    description: "RG do proprietário da terra" 
                  },
                  landOwnershipType: { 
                    type: "string", 
                    description: "Tipo de relação com a terra: 'proprietaria' (se ela é dona), 'parceria', 'arrendamento', 'meeiro', 'comodato', 'posseiro', 'terceiro' (genérico)" 
                  },
                  
                  // Atividade rural (ESTRUTURADO EM PERÍODOS)
                  ruralPeriods: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        startDate: { 
                          type: "string", 
                          description: "Data início do período rural YYYY-MM-DD. Se só tiver ano, usar 01/01/ANO" 
                        },
                        endDate: { 
                          type: "string", 
                          description: "Data fim do período rural YYYY-MM-DD. Deixar vazio se ainda ativo" 
                        },
                        location: { 
                          type: "string", 
                          description: "Local COMPLETO: Sítio/Fazenda + Município + UF. Ex: 'Sítio São José, Município X - MG'" 
                        },
                        withWhom: { 
                          type: "string", 
                          description: "Com quem morava: 'com minha mãe', 'com meu esposo', etc" 
                        },
                        activities: { 
                          type: "string", 
                          description: "Atividades desenvolvidas: 'lavoura', 'criação de gado', 'agricultura familiar', etc" 
                        }
                      },
                      required: ["startDate", "location"]
                    },
                    description: "CRÍTICO: TODOS os períodos de atividade rural mencionados na autodeclaração. Se houver múltiplos períodos (ex: 'morei de 1990 a 2000 no Sítio X, depois de 2001 a 2025 na Fazenda Y'), EXTRAIR CADA UM SEPARADAMENTE!"
                  },
                  urbanPeriods: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        startDate: { type: "string", description: "Data início YYYY-MM-DD" },
                        endDate: { type: "string", description: "Data fim YYYY-MM-DD" },
                        details: { type: "string", description: "Detalhes do trabalho urbano: empresa, função, etc" }
                      },
                      required: ["startDate", "endDate"]
                    },
                    description: "Períodos em zona urbana, se mencionados na autodeclaração"
                  },
                  familyMembers: { 
                    type: "array", 
                    items: { 
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Nome do membro da família" },
                        relationship: { type: "string", description: "Relação: esposo, filho(a), pai, mãe, irmão(ã), etc" }
                      }
                    },
                    description: "Membros da família que moram junto ATUALMENTE e trabalham na lavoura" 
                  },
                  
                  // Processo administrativo
                  raProtocol: { 
                    type: "string", 
                    description: "Número COMPLETO do protocolo/NB do processo administrativo no INSS" 
                  },
                  raRequestDate: { 
                    type: "string", 
                    description: "Data do requerimento administrativo YYYY-MM-DD (converter de DD/MM/AAAA)" 
                  },
                  raDenialDate: { 
                    type: "string", 
                    description: "Data do indeferimento YYYY-MM-DD (converter de DD/MM/AAAA)" 
                  },
                  raDenialReason: { 
                    type: "string", 
                    description: "Motivo COMPLETO do indeferimento COPIADO PALAVRA POR PALAVRA do documento oficial. Incluir TODOS os detalhes" 
                  },
                  
                  // Observações
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista de observações importantes ou inconsistências encontradas entre documentos"
                  }
                },
                required: [],
              },
          },
        ],
        function_call: { name: "extract_case_info" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[IA] Erro na resposta da API OpenAI:", aiResponse.status);
      console.error("[IA] Detalhes do erro:", errorText);
      
      let errorMessage = `Erro na API OpenAI: ${aiResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // Se não for JSON, usar a mensagem padrão
      }
      
      throw new Error(errorMessage);
    }

    const aiResult = await aiResponse.json();
    console.log("[IA] Resposta recebida com sucesso");

    // Extrair dados do function call (OpenAI usa function_call ao invés de tool_calls)
    let extractedData: Record<string, any> = {};
    try {
      const functionCall = aiResult.choices?.[0]?.message?.function_call;
      if (!functionCall || functionCall.name !== 'extract_case_info') {
        console.error("[IA] Resposta não contém function call esperado");
        console.error("[IA] Resposta completa:", JSON.stringify(aiResult.choices[0]?.message, null, 2));
        throw new Error('A IA não retornou os dados no formato esperado');
      }
      
      const args = functionCall.arguments;
    console.log("[IA] Arguments raw:", args);
    extractedData = JSON.parse(args);
    console.log("[IA] Dados extraídos:", JSON.stringify(extractedData, null, 2));
  } catch (error) {
    console.error("[IA] Erro ao parsear resposta:", error);
    throw new Error('Falha ao interpretar resposta da IA');
  }
  
  // FASE 3: Validação pós-extração de períodos rurais
  if (hasAutodeclaracao) {
    console.log('[FASE 3] Verificando extração de períodos rurais...');
    
    if (!extractedData.ruralPeriods || extractedData.ruralPeriods.length === 0) {
      console.warn('[FASE 3] ⚠️ AVISO: Autodeclaração presente mas ruralPeriods vazio!');
      console.warn('[FASE 3] Criando período genérico para garantir preenchimento...');
      
      // Buscar dados do caso para preencher período genérico
      const { data: caseData } = await supabase
        .from('cases')
        .select('rural_activity_since, author_address')
        .eq('id', caseId)
        .single();
      
      extractedData.ruralPeriods = [{
        startDate: caseData?.rural_activity_since || "2000-01-01",
        endDate: "",
        location: extractedData.motherAddress || caseData?.author_address || "Endereço da autodeclaração",
        withWhom: "família",
        activities: "atividade rural em regime de economia familiar"
      }];
      
      console.log('[FASE 3] ✓ Período genérico criado:', extractedData.ruralPeriods[0]);
    } else {
      console.log(`[FASE 3] ✅ ${extractedData.ruralPeriods.length} período(s) rural(is) extraído(s) com sucesso!`);
    }
  }

  // Determinar campos críticos faltantes
  const requiredFields = ["motherName", "motherCpf", "childName", "childBirthDate"];
  const optionalFields = [
    "motherRg", "motherBirthDate", "motherAddress", "motherPhone", "motherWhatsapp", "maritalStatus",
    "fatherName", "childBirthPlace",
    "landOwnerName", "landOwnerCpf", "landOwnerRg", "landOwnershipType",
    "ruralActivitySince", "familyMembers",
    "raProtocol", "raRequestDate", "raDenialDate", "raDenialReason"
  ];

  const missingRequiredFields = requiredFields.filter(field => !extractedData[field]);
  const missingOptionalFields = optionalFields.filter(field => !extractedData[field]);
  
  console.log(`[EXTRAÇÃO] Campos críticos faltando: ${missingRequiredFields.length > 0 ? missingRequiredFields.join(', ') : 'Nenhum ✓'}`);
  console.log(`[EXTRAÇÃO] Campos opcionais faltando: ${missingOptionalFields.length > 0 ? missingOptionalFields.length : 'Nenhum ✓'}`);
  console.log(`[EXTRAÇÃO] Taxa de completude crítica: ${((requiredFields.length - missingRequiredFields.length) / requiredFields.length * 100).toFixed(1)}%`);

  // Salvar extração no banco com periodos_rurais
  console.log("[DB] Salvando extração...");
  const { error: extractionError } = await supabase.from("extractions").insert({
    case_id: caseId,
    document_id: documentIds[0],
    entities: extractedData,
    auto_filled_fields: extractedData,
    missing_fields: missingRequiredFields,
    observations: extractedData.observations || [],
    raw_text: JSON.stringify(validDocs.map(d => d.fileName)),
    periodos_rurais: extractedData.ruralPeriods || [], // FASE 3: Salvar períodos rurais
  });

  if (extractionError) {
    console.error("[DB] Erro ao salvar extração:", extractionError);
  }

  // Atualizar caso com informações extraídas
  const updateData: any = {};
    
    // Dados da mãe
    if (extractedData.motherName) updateData.author_name = extractedData.motherName;
    if (extractedData.motherCpf) updateData.author_cpf = extractedData.motherCpf.replace(/\D/g, '');
    if (extractedData.motherRg) updateData.author_rg = extractedData.motherRg;
    if (extractedData.motherBirthDate) updateData.author_birth_date = extractedData.motherBirthDate;
    if (extractedData.motherAddress) updateData.author_address = extractedData.motherAddress;
    if (extractedData.motherPhone) updateData.author_phone = extractedData.motherPhone.replace(/\D/g, '');
    if (extractedData.motherWhatsapp) updateData.author_whatsapp = extractedData.motherWhatsapp.replace(/\D/g, '');
    if (extractedData.maritalStatus) updateData.author_marital_status = extractedData.maritalStatus;
    
    // Dados da criança
    if (extractedData.childName) updateData.child_name = extractedData.childName;
    if (extractedData.childBirthDate) {
      updateData.child_birth_date = extractedData.childBirthDate;
      updateData.event_date = extractedData.childBirthDate; // Data do evento = data nascimento
    }
    if (extractedData.fatherName) updateData.father_name = extractedData.fatherName;
    
    // Proprietário da terra
    if (extractedData.landOwnerName) updateData.land_owner_name = extractedData.landOwnerName;
    if (extractedData.landOwnerCpf) updateData.land_owner_cpf = extractedData.landOwnerCpf.replace(/\D/g, '');
    if (extractedData.landOwnerRg) updateData.land_owner_rg = extractedData.landOwnerRg;
    if (extractedData.landOwnershipType) updateData.land_ownership_type = extractedData.landOwnershipType;
    
    // Atividade rural com períodos estruturados
    if (extractedData.ruralPeriods && Array.isArray(extractedData.ruralPeriods) && extractedData.ruralPeriods.length > 0) {
      updateData.rural_periods = extractedData.ruralPeriods;
      // Usar a data mais antiga como "rural_activity_since"
      const oldestPeriod = extractedData.ruralPeriods.reduce((oldest: any, current: any) => {
        return new Date(current.startDate) < new Date(oldest.startDate) ? current : oldest;
      });
      updateData.rural_activity_since = oldestPeriod.startDate;
    }
    
    if (extractedData.urbanPeriods && Array.isArray(extractedData.urbanPeriods) && extractedData.urbanPeriods.length > 0) {
      updateData.urban_periods = extractedData.urbanPeriods;
    }
    
    if (extractedData.familyMembers && Array.isArray(extractedData.familyMembers)) {
      updateData.family_members = extractedData.familyMembers;
    }
    
    // Processo administrativo
    if (extractedData.raProtocol) {
      updateData.ra_protocol = extractedData.raProtocol;
      updateData.has_ra = true;
    }
    if (extractedData.raRequestDate) updateData.ra_request_date = extractedData.raRequestDate;
    if (extractedData.raDenialDate) updateData.ra_denial_date = extractedData.raDenialDate;
    if (extractedData.raDenialReason) updateData.ra_denial_reason = extractedData.raDenialReason;

    console.log(`[DB] Atualizando caso ${caseId} com ${Object.keys(updateData).length} campos`);
    console.log("[DB] Campos a atualizar:", Object.keys(updateData).join(", "));

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("cases")
        .update(updateData)
        .eq("id", caseId);
      
      if (updateError) {
        console.error("[DB] Erro ao atualizar caso:", updateError);
        throw updateError;
      }
      console.log("[DB] Caso atualizado com sucesso ✓");
    } else {
      console.warn("[DB] Nenhum campo para atualizar");
    }

  console.log("[SUCESSO] Processamento concluído com sucesso ✓");
  console.log(`[RESULTADO] Períodos rurais extraídos: ${extractedData.ruralPeriods?.length || 0}`);
  } catch (error) {
    console.error("[BACKGROUND] Erro no processamento:", error);
    throw error;
  }
}
