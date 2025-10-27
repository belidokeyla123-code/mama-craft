// Função auxiliar para extrair dados de um batch de documentos
export async function extractDataFromBatch(
  processedBatch: any[],
  openaiApiKey: string,
  hasAutodeclaracao: boolean
): Promise<any> {
  console.log(`[IA BATCH] Chamando OpenAI GPT-4o com ${processedBatch.length} imagens...`);
  
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

🔹 **CERTIDÃO DE NASCIMENTO** (CRÍTICO!)
   LEIA A SEÇÃO "DADOS DA MÃE" E "DADOS DO PAI" COM ATENÇÃO:
   ✓ Nome COMPLETO da criança (campo principal na certidão)
   ✓ Data de nascimento da criança DD/MM/AAAA (CAMPO CRÍTICO!)
   ✓ Local de nascimento (cidade e UF)
   ✓ Nome COMPLETO da mãe (na seção "DADOS DA MÃE")
   ✓ Data de nascimento da mãe (se constar na certidão)
   ✓ Nome COMPLETO do pai (na seção "DADOS DO PAI")

🔹 **CPF / RG / CNH / IDENTIDADE**
   ✓ Nome completo EXATAMENTE como aparece
   ✓ CPF (apenas 11 números, sem pontos ou traços)
   ✓ RG com órgão expedidor (ex: "12.345.678-9 SSP/MG")
   ✓ Data de nascimento DD/MM/AAAA
   ✓ Nome da mãe (filiação)
   ✓ Endereço (se constar)

🔹 **COMPROVANTE DE RESIDÊNCIA**
   ✓ Endereço COMPLETO: Rua + Nº + Complemento + Bairro + Cidade + UF + CEP
   ✓ Nome do titular

🔹 **AUTODECLARAÇÃO RURAL** (CRÍTICO - SEÇÕES ESPECÍFICAS!)

📋 **SEÇÃO 2: PERÍODOS DE ATIVIDADE RURAL**
   ✓ Tabela de períodos: DESDE XX/XX/XXXX ATÉ XX/XX/XXXX
   ✓ CONDIÇÃO EM RELAÇÃO AO IMÓVEL: COMODATO/Proprietário/Arrendatário/etc
   ✓ SITUAÇÃO: Individual ou Regime de Economia Familiar (checkbox)
   
   **SEÇÃO 2.1: CONDIÇÃO NO GRUPO**
   ✓ Titular ou Componente do grupo familiar
   
   **SEÇÃO 2.2: GRUPO FAMILIAR COMPLETO**
   ✓ NOME + DN + CPF + ESTADO CIVIL + PARENTESCO de CADA membro
   ✓ Extrair TODOS os membros listados na tabela
   
📋 **SEÇÃO 3: DADOS DA TERRA**
   
   **SEÇÃO 3.1: INFORMAÇÕES DO IMÓVEL**
   ✓ FORMA DE CESSÃO: Comodato/Arrendamento/etc
   ✓ PERÍODO: Desde quando até quando
   ✓ ÁREA CEDIDA em hectare - ha (campo numérico)
   ✓ Registro ITR (se possuir)
   ✓ Nome da propriedade
   ✓ Município/UF
   ✓ Área total do imóvel (ha)
   ✓ Área explorada pelo requerente (ha)
   ✓ Nome do proprietário
   ✓ CPF do Proprietário
   
   **SEÇÃO 3.2: ATIVIDADES RURAIS**
   ✓ ATIVIDADE: Lista de culturas/criações
   ✓ SUBSISTÊNCIA/VENDA: Checkbox marcado
   
   Exemplo:
   - PLANTIO: CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ → Subsistência/Venda
   - CRIAÇÃO: GALINHA E PORCO → Subsistência

⚠️ **REGRA CRÍTICA**: 
- Se o CPF do proprietário for DIFERENTE do CPF da autora/mãe → landOwnershipType = "terceiro"
- Se o CPF do proprietário for IGUAL ao CPF da autora/mãe → landOwnershipType = "propria"
- NÃO agrupe períodos diferentes! Separe cada um!
- Se menciona zona urbana, EXTRAIR também (urbanPeriods)

🔹 **DOCUMENTO DA TERRA / PROPRIEDADE**
   ✓ Nome do proprietário
   ✓ CPF do proprietário (apenas números)
   ✓ RG do proprietário
   ✓ Tipo de propriedade/relação

🔹 **PROCESSO INSS / INDEFERIMENTO / NB** (CRÍTICO!)
   ✓ Número COMPLETO do protocolo/NB (ex: "NB 123.456.789-0")
   ✓ Data do requerimento DD/MM/AAAA
   ✓ Data do indeferimento DD/MM/AAAA
   ✓ Motivo COMPLETO do indeferimento:
      → Copie PALAVRA POR PALAVRA todo o texto do motivo
      → Inclua fundamentação jurídica, artigos de lei, etc
      → NÃO resuma, copie LITERALMENTE tudo

═══════════════════════════════════════════════════════════════
⚠️ REGRAS ABSOLUTAS - SIGA RIGOROSAMENTE!
═══════════════════════════════════════════════════════════════

1. ✅ Leia TODOS os textos, incluindo manuscritos, carimbos, assinaturas
2. ✅ Se um campo estiver visível, EXTRAIA-O
3. ✅ Formato de datas: SEMPRE converter para YYYY-MM-DD
4. ✅ CPF: SEMPRE apenas os 11 números
5. ✅ Nomes: Copiar EXATAMENTE como aparecem
6. ✅ Endereços: SEMPRE completos
7. ✅ Motivo indeferimento: Copiar LITERALMENTE

AGORA EXTRAIA TODAS AS INFORMAÇÕES DOS DOCUMENTOS FORNECIDOS!`;

  const messages: any[] = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  // Adicionar cada documento como mensagem com imagem
  for (const doc of processedBatch) {
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
            url: `data:${doc.mimeType};base64,${doc.base64Content}`,
            detail: "high"
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
              motherName: { type: "string", description: "Nome COMPLETO da mãe/autora" },
              motherCpf: { type: "string", description: "CPF da mãe sem formatação" },
              motherRg: { type: "string", description: "RG da mãe com órgão expedidor" },
              motherBirthDate: { type: "string", description: "Data nascimento da mãe YYYY-MM-DD" },
              motherAddress: { type: "string", description: "Endereço COMPLETO da mãe" },
              motherPhone: { type: "string", description: "Telefone ou celular da mãe" },
              motherWhatsapp: { type: "string", description: "WhatsApp da mãe" },
              maritalStatus: { type: "string", description: "Estado civil" },
              
              // Dados da criança
              childName: { type: "string", description: "Nome COMPLETO da criança" },
              childBirthDate: { type: "string", description: "Data nascimento criança YYYY-MM-DD" },
              childBirthPlace: { type: "string", description: "Local de nascimento da criança" },
              fatherName: { type: "string", description: "Nome COMPLETO do pai" },
              
              // Proprietário da terra
              landOwnerName: { type: "string", description: "Nome do proprietário da terra" },
              landOwnerCpf: { type: "string", description: "CPF do proprietário" },
              landOwnerRg: { type: "string", description: "RG do proprietário" },
              landOwnershipType: { type: "string", description: "Tipo de relação com a terra (propria ou terceiro)" },
              
              // Dados detalhados da terra (seção 3.1 e 3.2)
              landArea: { 
                type: "number", 
                description: "Área cedida em hectares (campo 'ÁREA CEDIDA em hectare - ha')" 
              },
              landTotalArea: { 
                type: "number", 
                description: "Área total do imóvel em hectares" 
              },
              landExploitedArea: { 
                type: "number", 
                description: "Área explorada pelo requerente em hectares" 
              },
              landITR: { 
                type: "string", 
                description: "Registro ITR, se possuir" 
              },
              landPropertyName: { 
                type: "string", 
                description: "Nome da propriedade (sítio, fazenda, etc)" 
              },
              landMunicipality: { 
                type: "string", 
                description: "Município/UF onde fica o imóvel" 
              },
              landCessionType: { 
                type: "string", 
                description: "Forma de cessão (COMODATO, arrendamento, parceria, etc)" 
              },

              // Atividades rurais detalhadas (seção 3.2)
              ruralActivitiesPlanting: { 
                type: "string", 
                description: "Atividades de PLANTIO (ex: 'CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ')" 
              },
              ruralActivitiesBreeding: { 
                type: "string", 
                description: "Atividades de CRIAÇÃO (ex: 'GALINHA E PORCO')" 
              },
              ruralActivitiesSubsistence: { 
                type: "boolean", 
                description: "Se é para subsistência" 
              },
              ruralActivitiesSale: { 
                type: "boolean", 
                description: "Se é para venda" 
              },
              
              // Atividade rural
              ruralPeriods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startDate: { type: "string", description: "Data início YYYY-MM-DD" },
                    endDate: { type: "string", description: "Data fim YYYY-MM-DD" },
                    location: { type: "string", description: "Local COMPLETO" },
                    withWhom: { type: "string", description: "Com quem morava" },
                    activities: { type: "string", description: "Atividades desenvolvidas" }
                  },
                  required: ["startDate", "location"]
                },
                description: "TODOS os períodos de atividade rural"
              },
              urbanPeriods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startDate: { type: "string" },
                    endDate: { type: "string" },
                    details: { type: "string" }
                  }
                }
              },
              familyMembers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    relationship: { type: "string" }
                  }
                },
                description: "Membros do grupo familiar (apenas nome e parentesco)"
              },
              
              // Grupo familiar completo (seção 2.2)
              familyMembersDetailed: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Nome completo" },
                    birthDate: { type: "string", description: "Data nascimento YYYY-MM-DD" },
                    cpf: { type: "string", description: "CPF sem formatação (11 dígitos)" },
                    maritalStatus: { type: "string", description: "Estado civil" },
                    relationship: { type: "string", description: "Parentesco (marido, mãe, pai, etc)" }
                  }
                },
                description: "Lista COMPLETA de membros do grupo familiar conforme seção 2.2 da autodeclaração"
              },
              
              // Processo administrativo
              raProtocol: { type: "string", description: "Número do protocolo/NB" },
              raRequestDate: { type: "string", description: "Data do requerimento YYYY-MM-DD" },
              raDenialDate: { type: "string", description: "Data do indeferimento YYYY-MM-DD" },
              raDenialReason: { type: "string", description: "Motivo COMPLETO do indeferimento" },
              
              // Observações
              observations: {
                type: "array",
                items: { type: "string" },
                description: "Observações importantes"
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
    console.error("[IA BATCH] Erro na resposta da API OpenAI:", aiResponse.status);
    console.error("[IA BATCH] Detalhes do erro:", errorText);
    throw new Error(`Erro na API OpenAI: ${aiResponse.status}`);
  }

  const aiResult = await aiResponse.json();
  console.log("[IA BATCH] Resposta recebida com sucesso");

  // Extrair dados do function call
  const functionCall = aiResult.choices?.[0]?.message?.function_call;
  if (!functionCall || functionCall.name !== 'extract_case_info') {
    console.error("[IA BATCH] Resposta não contém function call esperado");
    throw new Error('A IA não retornou os dados no formato esperado');
  }
  
  const extractedData = JSON.parse(functionCall.arguments);
  console.log("[IA BATCH] Dados extraídos:", JSON.stringify(extractedData, null, 2));
  
  return extractedData;
}
