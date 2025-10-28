import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Send, FileText, CheckCircle, AlertCircle, Loader2, Mic, X, RefreshCw } from "lucide-react";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";
import { useCaseOrchestration } from "@/hooks/useCaseOrchestration";
import { DocumentUploadInline } from "./DocumentUploadInline";
import { PasteDataInline } from "./PasteDataInline";

interface Message {
  role: "assistant" | "user";
  content: string;
  extractedData?: any;
}

interface StepChatIntakeProps {
  data: any;
  updateData: (data: any) => void;
  onComplete: () => void;
}

export const StepChatIntake = ({ data, updateData, onComplete }: StepChatIntakeProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Vou te ajudar a criar uma nova petição de salário-maternidade. Para começar, faça upload dos documentos da cliente (certidões, comprovantes, documentos de identificação, etc.). Você também pode usar o microfone para narrar informações especiais.",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // Sistema de orquestração para disparar pipeline completo
  const { triggerFullPipeline } = useCaseOrchestration({ 
    caseId: data.caseId || '', 
    enabled: !!data.caseId 
  });

  // 🆕 DEBUG: Log quando o componente monta e quando há caseId
  console.log('[CHAT INTAKE] Componente montado');
  console.log('[CHAT INTAKE] Case ID atual:', data.caseId);
  console.log('[CHAT INTAKE] triggerFullPipeline disponível:', !!triggerFullPipeline);
  console.log('[CHAT INTAKE] Dados atuais:', {
    authorName: data.authorName,
    authorCpf: data.authorCpf,
    childName: data.childName,
    childBirthDate: data.childBirthDate
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles: File[] = [];
    
    for (const file of files) {
      // Validação de tamanho
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede 200MB`,
          variant: "destructive",
        });
        continue;
      }
      
      // Verificar duplicatas na sessão atual
      if (uploadedFiles.some(f => f.name === file.name)) {
        toast({
          title: "Documento duplicado",
          description: `"${file.name}" já foi adicionado`,
          variant: "destructive",
        });
        continue;
      }
      
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) return;
    
    setUploadedFiles(prev => [...prev, ...validFiles]);
    processDocuments(validFiles);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== index));
    toast({
      title: "Documento removido",
      description: "O arquivo foi removido da lista",
    });
  };

  const processDocuments = async (files: File[]) => {
    setIsProcessing(true);
    
    try {
      // Criar um caso temporário se não existir
      let caseId = data.caseId;
      if (!caseId) {
        const { data: newCase, error } = await supabase
          .from("cases")
          .insert({
            author_name: "Processando...",
            author_cpf: "00000000000",
            event_date: new Date().toISOString().split('T')[0],
            status: "intake",
            started_with_chat: true,
          })
          .select()
          .single();

        if (error) throw error;
        caseId = newCase.id;
        updateData({ caseId });
      }

      // Verificar duplicatas no banco antes de fazer upload
      const fileNames = files.map(f => f.name);
      const { data: existingDocs, error: checkError } = await supabase
        .from("documents")
        .select("file_name")
        .eq("case_id", caseId)
        .in("file_name", fileNames);

      if (checkError) throw checkError;

      const existingFileNames = existingDocs?.map(d => d.file_name) || [];
      const filesToUpload = files.filter(file => {
        if (existingFileNames.includes(file.name)) {
          toast({
            title: "Documento já existe",
            description: `"${file.name}" já foi enviado anteriormente`,
            variant: "destructive",
          });
          return false;
        }
        return true;
      });

      if (filesToUpload.length === 0) {
        toast({
          title: "Nenhum documento novo",
          description: "Todos os arquivos já foram enviados",
        });
        return;
      }

      // Avisar sobre duplicatas ignoradas
      if (files.length > filesToUpload.length) {
        const duplicatedCount = files.length - filesToUpload.length;
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ ${duplicatedCount} documento(s) duplicado(s) foram ignorados.`
        }]);
      }

      // Converter PDFs em imagens antes do upload
      console.log("[UPLOAD] Processando arquivos...");
      const processedFiles: File[] = [];
      
      for (const file of filesToUpload) {
        if (isPDF(file)) {
          console.log(`[UPLOAD] Arquivo é PDF, convertendo: ${file.name}`);
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `🔄 Convertendo PDF "${file.name}" em imagens...`
          }]);
          
          try {
            const { images } = await convertPDFToImages(file, 10);
            console.log(`[UPLOAD] PDF convertido em ${images.length} imagens`);
            processedFiles.push(...images);
            
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `✓ PDF convertido: ${images.length} página(s)`
            }]);
          } catch (error: any) {
            console.error("[UPLOAD] Erro ao converter PDF:", error);
            toast({
              title: "Erro ao converter PDF",
              description: error.message,
              variant: "destructive",
            });
            throw error;
          }
        } else {
          // Arquivos não-PDF (imagens) vão direto
          processedFiles.push(file);
        }
      }
      
      // Buscar nome da autora para criar a pasta
      const { data: caseInfo, error: caseError } = await supabase
        .from("cases")
        .select("author_name")
        .eq("id", caseId)
        .single();

      if (caseError) throw caseError;
      
      const clientFolderName = caseInfo.author_name || `caso_${caseId.slice(0, 8)}`;
      console.log(`[UPLOAD] Criando pasta para cliente: ${clientFolderName}`);

      // Upload dos arquivos processados para o Storage
      const uploadPromises = processedFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileName = `${clientFolderName}/${timestamp}_${randomId}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("case-documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Salvar registro do documento
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            case_id: caseId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            mime_type: file.type,
            document_type: "OUTROS",
          })
          .select()
          .single();

        if (docError) throw docError;
        return doc;
      });

      const documents = await Promise.all(uploadPromises);
      
      // Atualizar status do caso para "ready" (em análise)
      await supabase
        .from("cases")
        .update({ status: "ready" })
        .eq("id", caseId);

      console.log(`[UPLOAD] ✓ Pasta "${clientFolderName}" criada com ${documents.length} documento(s)`);

      // ✅ CORREÇÃO CRÍTICA: Buscar TODOS os documentos do caso para processamento completo
      console.log('[CHAT] 🔍 Buscando TODOS os documentos do caso para processamento completo...');
      const { data: allDocuments, error: allDocsError } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId);

      if (allDocsError) {
        console.error('[CHAT] ❌ Erro ao buscar todos os documentos:', allDocsError);
        throw allDocsError;
      }

      console.log(`[CHAT] 📋 Total de documentos no caso: ${allDocuments.length} (incluindo ${documents.length} novos)`);

      // Chamar edge function para extrair informações de TODOS os documentos
      console.log('[CHAT] 🤖 Chamando IA para processar TODOS os documentos do caso...');
      const { data: extractionResult, error: extractionError } = await supabase.functions.invoke(
        "process-documents-with-ai",
        {
          body: {
            caseId,
            documentIds: allDocuments.map(d => d.id), // ✅ TODOS os documentos
          },
        }
      );

      if (extractionError) throw extractionError;

      console.log('[CHAT] Resposta da edge function:', extractionResult);

      // Declarar variáveis para dados extraídos
      let extractedData: any = {};

      // A edge function processa em background, então vamos aguardar e buscar os dados
      if (extractionResult?.status === 'processing') {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "🔄 Processando documentos com IA... Aguarde alguns segundos."
        }]);

        // Aguardar 5 segundos para o processamento em background terminar
        console.log('[CHAT] Aguardando processamento em background...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Buscar dados extraídos do banco
        console.log('[CHAT] Buscando extrações do banco...');
        const { data: extractions, error: extractionsError } = await supabase
          .from('extractions')
          .select('*')
          .eq('case_id', caseId)
          .order('extracted_at', { ascending: false })
          .limit(1);

        if (extractionsError) {
          console.error('[CHAT] Erro ao buscar extrações:', extractionsError);
          throw extractionsError;
        }

        console.log('[CHAT] Extrações encontradas:', extractions);

        // Se não há extrações ainda, aguardar mais um pouco
        if (!extractions || extractions.length === 0) {
          console.log('[CHAT] Nenhuma extração encontrada, aguardando mais 3 segundos...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const { data: extractions2 } = await supabase
            .from('extractions')
            .select('*')
            .eq('case_id', caseId)
            .order('extracted_at', { ascending: false })
            .limit(1);
          
          if (extractions2 && extractions2.length > 0) {
            console.log('[CHAT] Extrações encontradas na segunda tentativa');
            extractedData = extractions2[0].entities || {};
          } else {
            console.warn('[CHAT] Nenhuma extração encontrada após 8 segundos');
            extractedData = {};
          }
        } else {
          extractedData = extractions[0].entities || {};
        }

        console.log('[CHAT] Dados extraídos finais:', extractedData);
      } else {
        // Fallback: usar dados da resposta se houver
        extractedData = extractionResult?.extractedData || {};
      }

      // Buscar também o caso atualizado do banco
      const { data: updatedCase } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single();

      if (updatedCase) {
        console.log('[CHAT] Caso atualizado encontrado:', updatedCase);
        // Merge com dados extraídos
        if (updatedCase.author_name && updatedCase.author_name !== 'Processando...') {
          extractedData.motherName = updatedCase.author_name;
        }
        if (updatedCase.child_name) extractedData.childName = updatedCase.child_name;
        if (updatedCase.child_birth_date) extractedData.childBirthDate = updatedCase.child_birth_date;
      }

      const missingFields: string[] = [];
      if (!extractedData.motherName) missingFields.push('motherName');
      if (!extractedData.motherCpf) missingFields.push('motherCpf');
      if (!extractedData.childName) missingFields.push('childName');
      if (!extractedData.childBirthDate) missingFields.push('childBirthDate');

      console.log("Dados extraídos:", extractedData);
      console.log("Campos faltantes:", missingFields);

      // ✅ VERIFICAR CAMPOS CRÍTICOS FALTANTES
      const criticalMissing = [];
      if (!extractedData.childName) criticalMissing.push('Nome da criança');
      if (!extractedData.childBirthDate) criticalMissing.push('Data de nascimento da criança');
      if (!extractedData.motherName) criticalMissing.push('Nome da mãe');
      if (!extractedData.motherCpf) criticalMissing.push('CPF da mãe');

      let assistantMessage = `✅ **Documentos processados com sucesso!**\n\n`;
      assistantMessage += `📄 **${allDocuments?.length || uploadedFiles.length} documento(s) analisado(s) (total no caso)**\n\n`;
      
      if (Object.keys(extractedData).length > 0) {
        assistantMessage += "**📋 Informações extraídas dos documentos:**\n\n";
        
        // Dados da mãe/autora
        if (extractedData.motherName || extractedData.motherCpf || extractedData.motherBirthDate) {
          assistantMessage += "**👤 Autora (Mãe):**\n";
          if (extractedData.motherName) assistantMessage += `• Nome: ${extractedData.motherName}\n`;
          if (extractedData.motherCpf) assistantMessage += `• CPF: ${extractedData.motherCpf}\n`;
          if (extractedData.motherRg) assistantMessage += `• RG: ${extractedData.motherRg}\n`;
          if (extractedData.motherBirthDate) assistantMessage += `• Data de Nascimento: ${extractedData.motherBirthDate}\n`;
          if (extractedData.motherAddress) assistantMessage += `• Endereço: ${extractedData.motherAddress}\n`;
          if (extractedData.maritalStatus) assistantMessage += `• Estado Civil: ${extractedData.maritalStatus}\n`;
          assistantMessage += "\n";
        }
        
        // Dados da criança
        if (extractedData.childName || extractedData.childBirthDate) {
          assistantMessage += "**👶 Criança:**\n";
          if (extractedData.childName) assistantMessage += `• Nome: ${extractedData.childName}\n`;
          if (extractedData.childBirthDate) assistantMessage += `• Data de Nascimento: ${extractedData.childBirthDate}\n`;
          if (extractedData.fatherName) assistantMessage += `• Pai: ${extractedData.fatherName}\n`;
          assistantMessage += "\n";
        }
        
        // Proprietário da terra
        if (extractedData.landOwnerName || extractedData.landOwnershipType) {
          assistantMessage += "**🏡 Propriedade Rural:**\n";
          if (extractedData.landOwnershipType) assistantMessage += `• Tipo: ${extractedData.landOwnershipType === 'propria' ? 'Terra Própria' : 'Terra de Terceiro'}\n`;
          if (extractedData.landOwnerName) assistantMessage += `• Proprietário: ${extractedData.landOwnerName}\n`;
          assistantMessage += "\n";
        }
        
        // Atividade rural
        if (extractedData.ruralActivitySince || extractedData.familyMembers) {
          assistantMessage += "**🌾 Atividade Rural:**\n";
          if (extractedData.ruralActivitySince) assistantMessage += `• Trabalha desde: ${extractedData.ruralActivitySince}\n`;
          if (extractedData.familyMembers && extractedData.familyMembers.length > 0) {
            assistantMessage += `• Membros da família: ${extractedData.familyMembers.join(", ")}\n`;
          }
          assistantMessage += "\n";
        }
        
        // Processo administrativo
        if (extractedData.raProtocol) {
          assistantMessage += "**📋 Processo Administrativo:**\n";
          if (extractedData.raProtocol) assistantMessage += `• Protocolo/NB: ${extractedData.raProtocol}\n`;
          if (extractedData.raRequestDate) assistantMessage += `• Data Requerimento: ${extractedData.raRequestDate}\n`;
          if (extractedData.raDenialDate) assistantMessage += `• Data Indeferimento: ${extractedData.raDenialDate}\n`;
          if (extractedData.raDenialReason) assistantMessage += `• Motivo: ${extractedData.raDenialReason}\n`;
          assistantMessage += "\n";
        }
      }

      if (missingFields.length > 0) {
        assistantMessage += `\n⚠️ **Campos faltantes (preencher manualmente):**\n`;
        const fieldLabels: Record<string, string> = {
          motherName: "Nome da mãe",
          motherCpf: "CPF da mãe",
          childName: "Nome da criança",
          childBirthDate: "Data de nascimento da criança"
        };
        missingFields.forEach(field => {
          assistantMessage += `• ${fieldLabels[field] || field}\n`;
        });
        assistantMessage += "\n";
      }
      
      // ✅ MENSAGEM INTELIGENTE SE CAMPOS CRÍTICOS FALTAM
      if (criticalMissing.length > 0) {
        assistantMessage += `\n⚠️ **ATENÇÃO! Não consegui extrair alguns dados importantes:**\n\n`;
        criticalMissing.forEach(f => assistantMessage += `• ${f}\n`);
        assistantMessage += `\n**Possíveis causas:**\n`;
        assistantMessage += `1. O documento necessário (certidão de nascimento, RG/CPF) não foi enviado ainda\n`;
        assistantMessage += `2. O documento foi enviado mas a qualidade da imagem está baixa\n`;
        assistantMessage += `3. O documento precisa ser reprocessado\n\n`;
        assistantMessage += `**Solução:**\n`;
        assistantMessage += `→ Clique no botão "🔄 Reprocessar Documentos" abaixo para tentar novamente\n`;
        assistantMessage += `→ Ou envie/reenvie os documentos necessários\n\n`;
      }
      
      assistantMessage += "\n✨ **Esses dados já foram preenchidos automaticamente no formulário!**\n";
      assistantMessage += "➡️ Clique em 'Próximo' para revisar e completar as informações.";

      setMessages(prev => [...prev, {
        role: "assistant",
        content: assistantMessage,
        extractedData,
      }]);

      // Mapear os campos da API para os campos do formulário
      const fieldMapping: Record<string, string> = {
        motherName: 'authorName',
        motherCpf: 'authorCpf',
        motherRg: 'authorRg',
        motherBirthDate: 'authorBirthDate',
        motherAddress: 'authorAddress',
        maritalStatus: 'authorMaritalStatus',
        childName: 'childName',
        childBirthDate: 'childBirthDate',
        fatherName: 'fatherName',
        landOwnerName: 'landOwnerName',
        landOwnerCpf: 'landOwnerCpf',
        landOwnerRg: 'landOwnerRg',
        landOwnershipType: 'landOwnershipType',
        ruralActivitySince: 'ruralActivitySince',
        familyMembers: 'familyMembers',
        raProtocol: 'raProtocol',
        raRequestDate: 'raRequestDate',
        raDenialDate: 'raDenialDate',
        raDenialReason: 'raDenialReason',
      };

      // Criar array de campos preenchidos usando os nomes do formulário
      const autoFilledFieldsList = Object.keys(extractedData)
        .map(key => fieldMapping[key] || key)
        .filter(field => field);

      // Atualizar dados do formulário com TODOS os campos extraídos
      updateData({
        ...data,
        caseId,
        // Dados da mãe
        authorName: extractedData.motherName || data.authorName,
        authorCpf: extractedData.motherCpf || data.authorCpf,
        authorRg: extractedData.motherRg || data.authorRg,
        authorBirthDate: extractedData.motherBirthDate || data.authorBirthDate,
        authorAddress: extractedData.motherAddress || data.authorAddress,
        authorMaritalStatus: extractedData.maritalStatus || data.authorMaritalStatus,
        // Dados da criança
        childName: extractedData.childName || data.childName,
        childBirthDate: extractedData.childBirthDate || data.childBirthDate,
        eventDate: extractedData.childBirthDate || data.eventDate,
        fatherName: extractedData.fatherName || data.fatherName,
        // Proprietário da terra
        landOwnerName: extractedData.landOwnerName || data.landOwnerName,
        landOwnerCpf: extractedData.landOwnerCpf || data.landOwnerCpf,
        landOwnerRg: extractedData.landOwnerRg || data.landOwnerRg,
        landOwnershipType: extractedData.landOwnershipType || data.landOwnershipType,
        // Atividade rural
        ruralActivitySince: extractedData.ruralActivitySince || data.ruralActivitySince,
        familyMembers: extractedData.familyMembers || data.familyMembers,
        // Processo administrativo
        hasRa: !!extractedData.raProtocol || data.hasRa,
        raProtocol: extractedData.raProtocol || data.raProtocol,
        raRequestDate: extractedData.raRequestDate || data.raRequestDate,
        raDenialDate: extractedData.raDenialDate || data.raDenialDate,
        raDenialReason: extractedData.raDenialReason || data.raDenialReason,
        // Metadados
        extractedData,
        missingFields,
        autoFilledFields: autoFilledFieldsList,
        documents: uploadedFiles.map(f => f.name),
      });

      // 🆕 SALVAR NO BANCO DE DADOS E DISPARAR PIPELINE
      if (caseId) {
        console.log('[CHAT] Salvando dados extraídos no banco...');
        console.log('[CHAT] Case ID:', caseId);
        console.log('[CHAT] Dados extraídos:', extractedData);
        
        try {
          const { error: updateError } = await supabase
            .from('cases')
            .update({
              author_name: extractedData.motherName || data.authorName || 'Processando...',
              author_cpf: extractedData.motherCpf || data.authorCpf || '00000000000',
              author_rg: extractedData.motherRg || data.authorRg,
              author_birth_date: extractedData.motherBirthDate || data.authorBirthDate,
              author_address: extractedData.motherAddress || data.authorAddress,
              author_marital_status: extractedData.maritalStatus || data.authorMaritalStatus,
              child_name: extractedData.childName || data.childName,
              child_birth_date: extractedData.childBirthDate || data.childBirthDate,
              event_date: extractedData.childBirthDate || data.eventDate || new Date().toISOString().split('T')[0],
              father_name: extractedData.fatherName || data.fatherName,
              land_owner_name: extractedData.landOwnerName || data.landOwnerName,
              land_owner_cpf: extractedData.landOwnerCpf || data.landOwnerCpf,
              land_owner_rg: extractedData.landOwnerRg || data.landOwnerRg,
              land_ownership_type: extractedData.landOwnershipType || data.landOwnershipType,
              rural_activity_since: extractedData.ruralActivitySince || data.ruralActivitySince,
              family_members: extractedData.familyMembers as any || data.familyMembers,
              has_ra: !!extractedData.raProtocol || data.hasRa,
              ra_protocol: extractedData.raProtocol || data.raProtocol,
              ra_request_date: extractedData.raRequestDate || data.raRequestDate,
              ra_denial_date: extractedData.raDenialDate || data.raDenialDate,
              ra_denial_reason: extractedData.raDenialReason || data.raDenialReason,
              updated_at: new Date().toISOString()
            })
            .eq('id', caseId);

          if (updateError) {
            console.error('[CHAT] Erro ao salvar no banco:', updateError);
            throw updateError;
          }

          console.log('[CHAT] ✅ Dados salvos no banco com sucesso');
          
          // 🆕 DISPARAR PIPELINE COMPLETO
          if (triggerFullPipeline) {
            console.log('[CHAT] Disparando pipeline completo...');
            try {
              await triggerFullPipeline('Dados extraídos via chat');
              console.log('[CHAT] ✅ Pipeline disparado com sucesso');
            } catch (pipelineError) {
              console.error('[CHAT] Erro ao disparar pipeline:', pipelineError);
              // Não vamos jogar erro aqui para não quebrar o fluxo
            }
          } else {
            console.warn('[CHAT] ⚠️ triggerFullPipeline não disponível');
          }
          
        } catch (dbError) {
          console.error('[CHAT] ❌ Erro crítico ao salvar no banco:', dbError);
          toast({
            title: "Erro ao salvar dados",
            description: "Os dados foram extraídos mas não foram salvos. Tente novamente.",
            variant: "destructive",
          });
        }
      } else {
        console.error('[CHAT] ❌ Case ID não encontrado após processamento');
      }

    } catch (error: any) {
      console.error("Erro ao processar documentos:", error);
      toast({
        title: "Erro ao processar documentos",
        description: error.message,
        variant: "destructive",
      });
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Ocorreu um erro ao processar os documentos. Por favor, tente novamente ou preencha as informações manualmente.",
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ✅ FUNÇÃO PARA REPROCESSAR TODOS OS DOCUMENTOS
  const handleReprocessAllDocuments = async () => {
    if (!data.caseId) {
      toast({
        title: "❌ Erro",
        description: "Caso não encontrado. Crie um caso primeiro.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "🔄 Reprocessando TODOS os documentos com IA... Aguarde alguns segundos."
    }]);

    try {
      // Buscar todos os documentos do caso
      const { data: allDocs, error: docsError } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', data.caseId);

      if (docsError) throw docsError;

      if (!allDocs || allDocs.length === 0) {
        toast({
          title: "⚠️ Aviso",
          description: "Nenhum documento encontrado para reprocessar.",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      console.log(`[REPROCESS] Reprocessando ${allDocs.length} documentos...`);

      // Processar novamente TODOS os documentos
      const { data: extractionResult, error: extractionError } = await supabase.functions.invoke(
        "process-documents-with-ai",
        {
          body: {
            caseId: data.caseId,
            documentIds: allDocs.map(d => d.id)
          }
        }
      );

      if (extractionError) throw extractionError;

      // Aguardar processamento em background
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Buscar dados extraídos
      const { data: extractions, error: extractionsError } = await supabase
        .from('extractions')
        .select('*')
        .eq('case_id', data.caseId)
        .order('extracted_at', { ascending: false })
        .limit(1);

      if (extractionsError) throw extractionsError;

      if (extractions && extractions.length > 0) {
        const latestExtraction = extractions[0];
        const extractedData: any = latestExtraction.auto_filled_fields || latestExtraction.entities || {};
        const missingFields = latestExtraction.missing_fields || [];

        console.log('[REPROCESS] Dados reprocessados:', extractedData);

        updateData({
          ...extractedData as any,
          caseId: data.caseId
        });

        toast({
          title: "✅ Reprocessamento concluído!",
          description: `${allDocs.length} documento(s) reprocessado(s).`
        });

        // Verificar campos críticos
        const criticalMissing = [];
        if (!(extractedData as any).childName) criticalMissing.push('Nome da criança');
        if (!(extractedData as any).childBirthDate) criticalMissing.push('Data de nascimento da criança');

        let messageContent = `✅ **Reprocessamento concluído!**\n\n`;
        messageContent += `📋 **${allDocs.length} documento(s) reprocessado(s)**\n\n`;
        
        if (Object.keys(extractedData).length > 0) {
          messageContent += "**Dados atualizados:**\n";
          Object.entries(extractedData)
            .filter(([_, value]) => value && value !== '')
            .slice(0, 10)
            .forEach(([key, value]) => {
              messageContent += `• ${key}: ${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}\n`;
            });
          messageContent += "\n";
        }

        if (criticalMissing.length > 0) {
          messageContent += `⚠️ **Ainda faltando:** ${criticalMissing.join(', ')}\n\n`;
          messageContent += `Se o problema persistir, tente reenviar os documentos necessários (certidão de nascimento, RG/CPF).`;
        } else {
          messageContent += '✅ Todos os campos críticos foram preenchidos!';
        }

        setMessages(prev => [...prev, {
          role: "assistant",
          content: messageContent
        }]);

        // Disparar pipeline completo
        if (triggerFullPipeline) {
          console.log('[REPROCESS] Disparando pipeline completo...');
          try {
            await triggerFullPipeline('Documentos reprocessados');
            console.log('[REPROCESS] ✅ Pipeline disparado');
          } catch (pipelineError) {
            console.error('[REPROCESS] Erro ao disparar pipeline:', pipelineError);
          }
        }
      }
    } catch (error) {
      console.error('[REPROCESS] Erro:', error);
      toast({
        title: "❌ Erro ao reprocessar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Ocorreu um erro ao reprocessar os documentos. Por favor, tente novamente."
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Gravando áudio",
        description: "Fale agora. Clique novamente para parar.",
      });
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do navegador.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    
    // Add temporary message in chat
    const transcribingMessageIndex = messages.length;
    setMessages(prev => [...prev, { 
      role: "assistant", 
      content: "🎤 Transcrevendo áudio..." 
    }]);
    
    toast({
      title: "Transcrevendo áudio...",
      description: "Aguarde enquanto processamos sua gravação.",
    });
    
    try {
      console.log('Transcribing audio...');
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Call voice-to-text function
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio }
      });

      if (error) throw error;

      console.log('Transcription result:', data);
      
      if (data.text) {
        const transcribedText = data.text;
        
        // Remove temporary transcribing message
        setMessages(prev => prev.filter((_, idx) => idx !== transcribingMessageIndex));
        
        // Add user message with transcribed text
        setMessages(prev => [...prev, { 
          role: "user", 
          content: transcribedText 
        }]);
        
        // Detect special situation from transcribed text
        await detectSpecialSituation(transcribedText);
        
        // Add assistant confirmation
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "✅ Áudio transcrito e registrado! Há mais alguma informação que gostaria de adicionar?"
        }]);
        
        toast({
          title: "✅ Áudio transcrito com sucesso!",
          description: "A informação foi registrada no chat.",
        });
        
        setUserInput("");
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      
      // Remove temporary transcribing message on error
      setMessages(prev => prev.filter((_, idx) => idx !== transcribingMessageIndex));
      
      toast({
        title: "Erro ao transcrever áudio",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const detectSpecialSituation = async (text: string) => {
    try {
      const { data: detectionResult, error } = await supabase.functions.invoke(
        'detect-special-situation',
        { body: { text } }
      );
      
      if (error) throw error;
      
      if (detectionResult.isException && detectionResult.confidence > 0.6) {
        const newException = {
          type: detectionResult.type,
          description: text,
          voiceTranscribed: true,
        };
        
        updateData({
          hasSpecialSituation: true,
          specialNotes: text,
          exceptions: [...(data.exceptions || []), newException],
        });
        
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ **Situação especial detectada:** ${detectionResult.typeName}\n\n` +
                   `Esta informação será incluída automaticamente na petição inicial.\n\n` +
                   `Descrição registrada: "${text}"`,
        }]);
      }
    } catch (error) {
      console.error('Erro ao detectar situação especial:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    setMessages(prev => [...prev, { role: "user", content: userInput }]);
    
    // Detectar situação especial
    await detectSpecialSituation(userInput);
    
    let response = "Obrigado pela informação! ";
    response += "Há mais alguma informação que você gostaria de adicionar?";
    
    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setUserInput("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Chat Inteligente</h2>
        <p className="text-muted-foreground">
          Envie os documentos e deixe a IA extrair as informações automaticamente
        </p>
      </div>

      <Card className="p-4">
        <ScrollArea className="h-96 pr-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{message.content}</p>
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm">Processando documentos...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {uploadedFiles.length > 0 && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            <strong>{uploadedFiles.length} arquivo(s) carregado(s):</strong>
            <ul className="mt-2 space-y-1">
              {uploadedFiles.map((file, idx) => (
                <li key={idx} className="text-sm flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                    <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(idx)}
                    className="h-6 w-6 p-0 hover:bg-destructive/10"
                    title="Remover documento"
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || isRecording}
          className="flex-shrink-0"
        >
          <Upload className="h-4 w-4 mr-2" />
          Documentos
        </Button>

        <Button
          variant={isRecording ? "destructive" : isTranscribing ? "secondary" : "outline"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing || isTranscribing}
          className="flex-shrink-0"
        >
          {isRecording ? (
            <>
              <Mic className="h-4 w-4 mr-2 animate-pulse" />
              Parar
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Transcrevendo
            </>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        <Input
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isProcessing && !isTranscribing && handleSendMessage()}
          placeholder="Digite ou grave informações complementares..."
          disabled={isProcessing || isRecording || isTranscribing}
        />

        <Button
          onClick={handleSendMessage}
          disabled={!userInput.trim() || isProcessing || isRecording || isTranscribing}
          className="flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>

        {/* ✅ BOTÃO DE REPROCESSAR DOCUMENTOS */}
        {data.caseId && (
          <Button 
            onClick={handleReprocessAllDocuments}
            disabled={isProcessing}
            variant="secondary"
            className="gap-2 flex-shrink-0"
            title="Reprocessar todos os documentos do caso com IA"
          >
            <RefreshCw className="h-4 w-4" />
            Reprocessar
          </Button>
        )}
      </div>

      <div className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 inline mr-1" />
          Tamanho máximo por arquivo: 200MB
        </div>
        
        <Button
          onClick={onComplete}
          disabled={!data.extractedData && uploadedFiles.length === 0}
        >
          Próximo
        </Button>
      </div>
    </div>
  );
};
