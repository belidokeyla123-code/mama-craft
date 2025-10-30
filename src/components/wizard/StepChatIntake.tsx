import { useState, useRef, useEffect } from "react";
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
  const [failedPdfs, setFailedPdfs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // Sistema de orquestração para disparar pipeline completo
  const { triggerFullPipeline } = useCaseOrchestration({ 
    caseId: data.caseId || '', 
    enabled: !!data.caseId 
  });

  // ✅ CORREÇÃO #6: Chamar migração automática ao montar
  useEffect(() => {
    const migrateBenefits = async () => {
      if (!data.caseId) return;
      
      console.log('[CHAT] 🔄 Migrando benefícios de extrações para benefit_history');
      
      try {
        const { data: result, error } = await supabase.functions.invoke(
          'migrate-extractions-to-history',
          { body: { caseId: data.caseId } }
        );

        if (error) {
          console.error('[CHAT] ⚠️ Erro na migração:', error);
          return;
        }

        if (result?.migratedCount > 0) {
          console.log(`[CHAT] ✅ ${result.migratedCount} benefício(s) migrado(s)`);
          toast({
            title: "Benefícios anteriores detectados",
            description: `${result.migratedCount} benefício(s) carregado(s) dos documentos`,
          });
        }
      } catch (error) {
        console.error('[CHAT] Erro na migração:', error);
      }
    };

    migrateBenefits();
  }, [data.caseId]);

  // ✅ CORREÇÃO #2: Detectar PDFs não processados
  useEffect(() => {
    const detectUnprocessedPdfs = async () => {
      if (!data.caseId) return;
      
      try {
        // Buscar documentos PDF sem extrações
        const { data: docs, error } = await supabase
          .from('documents')
          .select(`
            file_name,
            extractions (count)
          `)
          .eq('case_id', data.caseId)
          .or('mime_type.eq.application/pdf,file_name.ilike.%.pdf');

        if (error) throw error;

        // Filtrar PDFs que não foram processados (extraction_count = 0)
        const unprocessedPdfs = docs
          ?.filter((doc: any) => {
            const count = doc.extractions?.[0]?.count || 0;
            return count === 0;
          })
          .map((doc: any) => doc.file_name) || [];

        if (unprocessedPdfs.length > 0) {
          console.log('[CHAT] ⚠️ PDFs não processados:', unprocessedPdfs);
          setFailedPdfs(unprocessedPdfs);
        }
      } catch (error) {
        console.error('[CHAT] Erro ao detectar PDFs não processados:', error);
      }
    };

    detectUnprocessedPdfs();
  }, [data.caseId]);

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

  // Helper para labels de tipos de documentos
  const getDocTypeLabel = (docType: string): string => {
    const labels: Record<string, string> = {
      'certidao_nascimento': '📄 Certidão de Nascimento',
      'processo_administrativo': '📋 Processo INSS',
      'autodeclaracao_rural': '🌾 Autodeclaração Rural',
      'documento_terra': '🏡 Documento da Terra',
      'identificacao': '🪪 Identificação',
      'comprovante_residencia': '🏠 Comprovante de Residência',
      'procuracao': '📝 Procuração',
      'cnis': '📊 CNIS',
      'historico_escolar': '📚 Histórico Escolar',
      'declaracao_saude_ubs': '🏥 Declaração de Saúde',
      'outro': '📎 Outro Documento'
    };
    return labels[docType] || '📎 Documento';
  };

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
            petition_type: data.petitionType || "peticao_inicial",
          })
          .select()
          .single();

        if (error) throw error;
        caseId = newCase.id;
        updateData({ caseId });
      }

      // Função para normalizar nome de arquivo (remove extensão, sufixo de página, truncation DOS 8.3)
      const normalizeFileName = (name: string): string => {
        let base = name.replace(/\.(pdf|png|jpg|jpeg|docx)$/i, '');
        base = base.replace(/_pagina_\d+$/i, '');
        base = base.replace(/~\d+/g, '');
        return base.toLowerCase().trim();
      };

      // Buscar TODOS os documentos existentes
      const { data: existingDocs, error: checkError } = await supabase
        .from("documents")
        .select("file_name")
        .eq("case_id", caseId);

      if (checkError) throw checkError;

      // Criar set de nomes base normalizados
      const existingBaseNames = new Set(
        existingDocs?.map(d => normalizeFileName(d.file_name)) || []
      );

      console.log('[DEDUPE] Documentos existentes (normalizados):', Array.from(existingBaseNames));

      // Filtrar arquivos que não existem
      const filesToUpload = files.filter(file => {
        const normalizedName = normalizeFileName(file.name);
        
        if (existingBaseNames.has(normalizedName)) {
          console.warn(`[DEDUPE] ❌ "${file.name}" é duplicata de arquivo já enviado`);
          toast({
            title: "Documento duplicado",
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

      // 🆕 PROCESSAMENTO SEQUENCIAL: Arquivo por arquivo
      console.log("[SEQUENTIAL] 🚀 Iniciando processamento sequencial de", filesToUpload.length, "arquivos");
      
      // Buscar nome da autora para criar a pasta
      const { data: caseInfo, error: caseError } = await supabase
        .from("cases")
        .select("author_name")
        .eq("id", caseId)
        .single();

      if (caseError) throw caseError;
      
      const clientFolderName = caseInfo.author_name || `caso_${caseId.slice(0, 8)}`;
      
      let extractedData: any = {};
      let processedCount = 0;
      
      // 🔄 LOOP SEQUENCIAL: Processar cada arquivo individualmente
      for (const file of filesToUpload) {
        try {
          processedCount++;
          console.log(`[SEQUENTIAL] 📄 Processando arquivo ${processedCount}/${filesToUpload.length}: ${file.name}`);
          
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `📄 [${processedCount}/${filesToUpload.length}] Processando: ${file.name}...`
          }]);
          
          // 🔄 CONVERTER PDF EM IMAGENS (no cliente)
          let filesToProcess: File[] = [file];
          
          if (isPDF(file)) {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `📄 Convertendo PDF "${file.name}" em imagens para OCR...`
            }]);
            
            try {
              console.log(`[PDF] Convertendo "${file.name}" em imagens...`);
              const { images } = await convertPDFToImages(file);
              filesToProcess = images;
              
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `✅ PDF convertido: ${images.length} página(s) pronta(s) para análise`
              }]);
              
              console.log(`[PDF] ✅ ${images.length} imagens geradas de "${file.name}"`);
            } catch (conversionError: any) {
              console.error('[PDF] ❌ Erro na conversão:', conversionError);
              throw new Error(`Erro ao converter PDF "${file.name}": ${conversionError.message}`);
            }
          }
          
          // Para cada página/imagem, processar IMEDIATAMENTE
          for (let i = 0; i < filesToProcess.length; i++) {
            const pageFile = filesToProcess[i];
            const pageNum = filesToProcess.length > 1 ? ` (página ${i + 1}/${filesToProcess.length})` : '';
            
            console.log(`[SEQUENTIAL] 📤 Fazendo upload${pageNum}...`);
            
            // Upload para o Storage
            const fileExt = pageFile.name.split('.').pop();
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(7);
            const fileName = `${clientFolderName}/${timestamp}_${randomId}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
              .from("case-documents")
              .upload(fileName, pageFile);

            if (uploadError) throw uploadError;

            // Salvar registro do documento
            const { data: doc, error: docError } = await supabase
              .from("documents")
              .insert({
                case_id: caseId,
                file_name: pageFile.name,
                file_path: fileName,
                file_size: pageFile.size,
                mime_type: pageFile.type,
                document_type: "outro" as any, // ✅ Será atualizado após análise
              })
              .select()
              .single();

            if (docError) throw docError;
            
            console.log(`[SEQUENTIAL] ✓ Upload completo, ID: ${doc.id}`);
            
            // 🤖 ANÁLISE IMEDIATA deste documento
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `🔍 Analisando${pageNum}...`
            }]);
            
            console.log(`[SEQUENTIAL] 🤖 Chamando IA para análise individual...`);
            
            // ✅ CORREÇÃO #4: Verificar se já foi analisado para evitar duplicações
            const { data: existingExtraction } = await supabase
              .from('extractions')
              .select('id')
              .eq('document_id', doc.id)
              .maybeSingle();

            if (existingExtraction) {
              console.log(`[SEQUENTIAL] ⏭️ Documento ${doc.id} já analisado, pulando...`);
              continue;
            }
            
            const { data: analysisResult, error: analysisError } = await supabase.functions.invoke(
              "analyze-single-document",
              {
                body: {
                  documentId: doc.id,
                  caseId: caseId
                }
              }
            );
            
            if (analysisError) {
              console.error(`[SEQUENTIAL] ⚠️ Erro na análise${pageNum}:`, analysisError);
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `⚠️ Erro ao analisar${pageNum}: ${analysisError.message}`
              }]);
            } else {
              console.log(`[SEQUENTIAL] ✅ Análise concluída${pageNum}:`, analysisResult);
              
              // ✅ ATUALIZAR DOCUMENT_TYPE após análise
              if (analysisResult?.docType && analysisResult.docType !== 'outro') {
                await supabase
                  .from('documents')
                  .update({ document_type: analysisResult.docType })
                  .eq('id', doc.id);
                console.log(`[SEQUENTIAL] ✅ Tipo de documento atualizado: ${analysisResult.docType}`);
              }
              
              // Merge dos dados extraídos
              if (analysisResult?.extracted) {
                extractedData = { ...extractedData, ...analysisResult.extracted };
              }
              
              // Mostrar feedback específico
              const docTypeLabel = getDocTypeLabel(analysisResult?.docType || 'outro');
              const confidence = analysisResult?.confidence || 'medium';
              const confidenceEmoji = confidence === 'high' ? '✅' : confidence === 'medium' ? '⚠️' : '❌';
              
              // 🆕 Mostrar novo nome do arquivo se foi renomeado
              const renameInfo = analysisResult?.extracted?.newFileName 
                ? `\n📝 Renomeado para: \`${analysisResult.extracted.newFileName}\``
                : '';
              
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `${confidenceEmoji} ${docTypeLabel}${pageNum} - Dados extraídos (confiança: ${confidence})${renameInfo}`
              }]);
              
              // 🆕 APRESENTAÇÃO ESTILO CHATGPT: Dados estruturados + transcrição
              if (analysisResult?.extracted && Object.keys(analysisResult.extracted).length > 0) {
                const extracted = analysisResult.extracted;
                
                let friendlyMessage = `📋 **Documento analisado: ${pageFile.name}**\n\n`;
                
                // DADOS DO PROCESSO ADMINISTRATIVO (se houver)
                if (extracted.raProtocol || extracted.raRequestDate || extracted.raDenialReason) {
                  friendlyMessage += `📑 **PROCESSO ADMINISTRATIVO (INSS)**\n`;
                  if (extracted.raProtocol) friendlyMessage += `• Protocolo/NB: **${extracted.raProtocol}**\n`;
                  if (extracted.benefitType) friendlyMessage += `• Benefício: ${extracted.benefitType}\n`;
                  if (extracted.raRequestDate) friendlyMessage += `• Data do Requerimento: ${extracted.raRequestDate}\n`;
                  if (extracted.raDenialDate) friendlyMessage += `• Data do Indeferimento: ${extracted.raDenialDate}\n`;
                  if (extracted.raDenialReason) friendlyMessage += `• Motivo: *"${extracted.raDenialReason}"*\n`;
                  friendlyMessage += '\n';
                }
                
                // DADOS DA AUTORA/MÃE
                if (extracted.motherName || extracted.motherCpf || extracted.fullName) {
                  friendlyMessage += `👤 **AUTORA (Mãe)**\n`;
                  if (extracted.motherName || extracted.fullName) friendlyMessage += `• Nome: **${extracted.motherName || extracted.fullName}**\n`;
                  if (extracted.motherCpf || extracted.cpf) friendlyMessage += `• CPF: ${extracted.motherCpf || extracted.cpf}\n`;
                  if (extracted.motherRg || extracted.rg) friendlyMessage += `• RG: ${extracted.motherRg || extracted.rg}\n`;
                  if (extracted.motherBirthDate || extracted.birthDate) friendlyMessage += `• Data de Nascimento: ${extracted.motherBirthDate || extracted.birthDate}\n`;
                  if (extracted.motherAddress || extracted.address) friendlyMessage += `• Endereço: ${extracted.motherAddress || extracted.address}\n`;
                  friendlyMessage += '\n';
                }
                
                // DADOS DA CRIANÇA
                if (extracted.childName || extracted.childBirthDate) {
                  friendlyMessage += `👶 **CRIANÇA**\n`;
                  if (extracted.childName) friendlyMessage += `• Nome: **${extracted.childName}**\n`;
                  if (extracted.childBirthDate) friendlyMessage += `• Data de Nascimento: ${extracted.childBirthDate}\n`;
                  if (extracted.birthCity) friendlyMessage += `• Cidade de Nascimento: ${extracted.birthCity}\n`;
                  if (extracted.fatherName) friendlyMessage += `• Pai: ${extracted.fatherName}\n`;
                  if (extracted.registryNumber) friendlyMessage += `• Matrícula: ${extracted.registryNumber}\n`;
                  if (extracted.registryDate) friendlyMessage += `• Data do Registro: ${extracted.registryDate}\n`;
                  friendlyMessage += '\n';
                }
                
                // PROPRIEDADE RURAL
                if (extracted.landOwnerName || extracted.landArea || extracted.landLocation) {
                  friendlyMessage += `🏡 **PROPRIEDADE RURAL**\n`;
                  if (extracted.landOwnerName) friendlyMessage += `• Proprietário: ${extracted.landOwnerName}\n`;
                  if (extracted.landOwnerCpf) friendlyMessage += `• CPF do Proprietário: ${extracted.landOwnerCpf}\n`;
                  if (extracted.landArea) friendlyMessage += `• Área: ${extracted.landArea}\n`;
                  if (extracted.landLocation) friendlyMessage += `• Localização: ${extracted.landLocation}\n`;
                  friendlyMessage += '\n';
                }
                
                // ATIVIDADE RURAL
                if (extracted.ruralActivitySince || (extracted.ruralPeriods && extracted.ruralPeriods.length > 0)) {
                  friendlyMessage += `🌾 **ATIVIDADE RURAL**\n`;
                  if (extracted.ruralActivitySince) friendlyMessage += `• Trabalha no campo desde: ${extracted.ruralActivitySince}\n`;
                  if (extracted.ruralPeriods && extracted.ruralPeriods.length > 0) {
                    friendlyMessage += `• Períodos declarados:\n`;
                    extracted.ruralPeriods.forEach((period: any, idx: number) => {
                      friendlyMessage += `  ${idx + 1}. ${period.startDate || '?'} a ${period.endDate || 'atual'} - ${period.location || ''}\n`;
                    });
                  }
                  if (extracted.familyMembersDetailed && extracted.familyMembersDetailed.length > 0) {
                    friendlyMessage += `• Membros da família: ${extracted.familyMembersDetailed.map((m: any) => m.name).join(", ")}\n`;
                  }
                  friendlyMessage += '\n';
                }
                
                // PROCURAÇÃO
                if (extracted.attorneyName || extracted.oabNumber) {
                  friendlyMessage += `📝 **PROCURAÇÃO**\n`;
                  if (extracted.attorneyName) friendlyMessage += `• Advogado: ${extracted.attorneyName}\n`;
                  if (extracted.oabNumber) friendlyMessage += `• OAB: ${extracted.oabNumber}\n`;
                  if (extracted.signatureDate) friendlyMessage += `• Data: ${extracted.signatureDate}\n`;
                  friendlyMessage += '\n';
                }
                
                // TRANSCRIÇÃO COMPLETA (colapsável, últimos 800 caracteres)
                if (analysisResult?.extractedText && analysisResult.extractedText.length > 100) {
                  const transcription = analysisResult.extractedText;
                  const preview = transcription.length > 800 
                    ? `...${transcription.slice(-800)}` 
                    : transcription;
                  
                  friendlyMessage += `\n---\n\n📄 **Transcrição Completa** *(${transcription.length} caracteres)*:\n\n\`\`\`\n${preview}\n\`\`\`\n`;
                }
                
                setMessages(prev => [...prev, {
                  role: "assistant",
                  content: friendlyMessage
                }]);
              } else if (analysisResult?.extractedText) {
                // Fallback: só tem transcrição, sem dados estruturados
                setMessages(prev => [...prev, {
                  role: "assistant",
                  content: `📄 **Transcrição do documento "${pageFile.name}":**\n\n\`\`\`\n${analysisResult.extractedText.substring(0, 800)}${analysisResult.extractedText.length > 800 ? '...' : ''}\n\`\`\`\n\n✅ Dados processados`
                }]);
              }
            }
          }
          
        } catch (error: any) {
          console.error(`[SEQUENTIAL] ❌ Erro ao processar ${file.name}:`, error);
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `❌ Erro ao processar ${file.name}: ${error.message}`
          }]);
        }
      }
      
      // Atualizar status do caso para "ready"
      await supabase
        .from("cases")
        .update({ status: "ready" })
        .eq("id", caseId);
      
      console.log(`[SEQUENTIAL] ✅ Processamento sequencial concluído!`);
      
      // Buscar caso atualizado
      const { data: updatedCase } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single();

      if (updatedCase) {
        console.log('[SEQUENTIAL] Caso final:', updatedCase);
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
      assistantMessage += `📄 **${processedCount} documento(s) analisado(s)**\n\n`;
      
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
          // ✅ CORREÇÃO #1: Buscar dados ATUAIS antes de atualizar
          const { data: currentCase } = await supabase
            .from('cases')
            .select('author_cpf, author_name, author_birth_date, mother_cpf, father_cpf')
            .eq('id', caseId)
            .single();

          console.log('[CHAT] Dados atuais do banco:', currentCase);
          
          const { error: updateError } = await supabase
            .from('cases')
            .update({
              // ✅ Priorizar: extractedData.authorCpf > banco > data.authorCpf > fallback
              author_name: extractedData.authorName || currentCase?.author_name || data.authorName || 'Processando...',
              author_cpf: extractedData.authorCpf || currentCase?.author_cpf || data.authorCpf || '00000000000',
              author_rg: extractedData.authorRg || data.authorRg,
              author_birth_date: extractedData.authorBirthDate || currentCase?.author_birth_date || data.authorBirthDate,
              author_address: extractedData.authorAddress || data.authorAddress,
              author_marital_status: extractedData.maritalStatus || data.authorMaritalStatus,
              
              // ✅ SEPARAR: CPFs da mãe/pai (não confundir com autora)
              mother_cpf: extractedData.motherCpf || data.motherCpf,
              father_cpf: extractedData.fatherCpf || data.fatherCpf,
              
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
          
          // ✅ FASE 2: DISPARAR SYNC APÓS EXTRAÇÃO
          console.log('[CHAT] ✅ Dados salvos, disparando sync...');
          
          // Disparar evento de sincronização para outras abas
          window.dispatchEvent(new CustomEvent('case-updated', { 
            detail: { caseId, source: 'chat-extraction' } 
          }));
          
          // Invalidar cache downstream
          await supabase
            .from('case_analysis')
            .update({ is_stale: true })
            .eq('case_id', caseId);
          
          // ✅ FASE 3: SALVAR BENEFÍCIOS ANTERIORES EM BENEFIT_HISTORY
          if (extractedData.raProtocol && extractedData.raRequestDate) {
            const { data: existing } = await supabase
              .from('benefit_history')
              .select('id')
              .eq('case_id', caseId)
              .eq('nb', extractedData.raProtocol)
              .maybeSingle();
            
            if (!existing) {
              await supabase
                .from('benefit_history')
                .insert({
                  case_id: caseId,
                  nb: extractedData.raProtocol,
                  benefit_type: extractedData.benefitType || 'Salário-Maternidade',
                  start_date: extractedData.raRequestDate,
                  end_date: extractedData.raDenialDate,
                  status: 'negado'
                });
              
              console.log('[CHAT] ✅ Benefício anterior salvo');
            }
          }
          
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
    const startTime = Date.now();
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "🔄 Reprocessando TODOS os documentos com IA... Aguarde alguns segundos."
    }]);

    try {
      // Buscar todos os documentos do caso
      const { data: allDocs, error: docsError } = await supabase
        .from('documents')
        .select('id, file_name')
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

      console.log(`[REPROCESS] Reprocessando ${allDocs.length} documentos em paralelo...`);

      // PROCESSAMENTO PARALELO OTIMIZADO (máximo 15 por vez - 3x mais rápido!)
      const CONCURRENT_LIMIT = 15;
      const allExtractedData: any = {};
      let processedCount = 0;

      // Dividir em chunks para processamento paralelo controlado
      const skippedPdfs: string[] = [];
      
      for (let i = 0; i < allDocs.length; i += CONCURRENT_LIMIT) {
        const chunk = allDocs.slice(i, i + CONCURRENT_LIMIT);
        
        // Processar chunk em paralelo
        const chunkPromises = chunk.map(async (doc) => {
          try {
            const { data: result, error } = await supabase.functions.invoke(
              'analyze-single-document',
              {
                body: {
                  documentId: doc.id,
                  caseId: data.caseId
                }
              }
            );

            if (error) {
              console.error(`[REPROCESS] Erro em ${doc.file_name}:`, error);
              return null;
            }

            processedCount++;
            
            // Detectar PDFs pulados
            if (result.skipped) {
              skippedPdfs.push(doc.file_name);
              console.log(`[REPROCESS] ${processedCount}/${allDocs.length} - ${doc.file_name} ⊘ (PDF pulado)`);
            } else {
              console.log(`[REPROCESS] ${processedCount}/${allDocs.length} - ${doc.file_name} ✓`);
            }

            return {
              docType: result.docType,
              extracted: result.extracted || {},
              skipped: result.skipped || false
            };
          } catch (err) {
            console.error(`[REPROCESS] Falha em ${doc.file_name}:`, err);
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);

        // Mesclar dados extraídos (exceto os pulados)
        chunkResults.forEach((result) => {
          if (result && result.extracted && !result.skipped) {
            Object.assign(allExtractedData, result.extracted);
          }
        });
      }

      console.log('[REPROCESS] ✅ Todos os documentos processados:', allExtractedData);
      
      // Informar sobre PDFs pulados
      if (skippedPdfs.length > 0) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ ${skippedPdfs.length} PDF(s) antigo(s) foram pulados:\n${skippedPdfs.map(f => `• ${f}`).join('\n')}\n\n💡 Para processar PDFs, faça re-upload - eles serão automaticamente convertidos em imagens.`
        }]);
      }

      // Atualizar dados do caso com os dados extraídos
      if (allExtractedData.childName) {
        updateData({
          childName: allExtractedData.childName,
          childBirthDate: allExtractedData.childBirthDate,
          authorName: allExtractedData.motherName || data.authorName,
          authorCpf: allExtractedData.motherCpf || data.authorCpf,
          fatherName: allExtractedData.fatherName,
          caseId: data.caseId
        });
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      toast({
        title: "✅ Reprocessamento concluído!",
        description: `${processedCount} documentos analisados em ${totalTime}s`,
      });

      // Verificar campos críticos
      const criticalMissing = [];
      if (!allExtractedData.childName) criticalMissing.push('Nome da criança');
      if (!allExtractedData.childBirthDate) criticalMissing.push('Data de nascimento da criança');

      let messageContent = `✅ **Reprocessamento concluído em ${totalTime}s!**\n\n`;
      messageContent += `📋 **${processedCount}/${allDocs.length} documento(s) processado(s)**\n\n`;
      
      if (Object.keys(allExtractedData).length > 0) {
        messageContent += "**Dados atualizados:**\n";
        Object.entries(allExtractedData)
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
        
        // ✅ FASE 6: SALVAR TRANSCRIÇÃO EM CASE_EXCEPTIONS PARA AUDITORIA
        if (data.caseId) {
          try {
            // Upload do áudio para storage
            const audioFileName = `audio_${Date.now()}.webm`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('case-documents')
              .upload(`${data.caseId}/${audioFileName}`, audioBlob);
            
            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage
                .from('case-documents')
                .getPublicUrl(`${data.caseId}/${audioFileName}`);
              
              // Salvar transcrição para auditoria
              await supabase
                .from('case_exceptions')
                .insert({
                  case_id: data.caseId,
                  exception_type: 'voice_transcription',
                  description: transcribedText,
                  voice_transcribed: true
                });
              
              console.log('[CHAT] ✅ Transcrição salva para auditoria');
            }
          } catch (error) {
            console.error('[CHAT] Erro ao salvar transcrição:', error);
            // Não interromper o fluxo se houver erro na auditoria
          }
        }
        
        // Remove temporary transcribing message
        setMessages(prev => prev.filter((_, idx) => idx !== transcribingMessageIndex));
        
        // Add user message with transcribed text
        setMessages(prev => [...prev, { 
          role: "user", 
          content: transcribedText 
        }]);
        
        // Detect special situation from transcribed text
        await detectSpecialSituation(transcribedText);
        
        // ✅ PROCESSAR TRANSCRIÇÃO COM IA (igual handleSendMessage)
        if (data.caseId) {
          console.log('[AUDIO] Processando transcrição com IA...');
          
          const { data: result, error } = await supabase.functions.invoke(
            'process-chat-message',
            { body: { caseId: data.caseId, messageText: transcribedText } }
          );

          if (error) {
            console.error('[AUDIO] Erro ao processar:', error);
          } else if (result?.extracted) {
            console.log('[AUDIO] Informações extraídas:', result.extracted);
            
            // Mostrar resumo
            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `📊 **Dados extraídos do áudio:**\n${result.extracted.summary}\n\n✅ Campos atualizados: ${result.updatedFields?.length || 0}\n📝 Registros: ${result.insertedRecords || 0}` 
            }]);

            // Disparar pipeline se houver mudanças
            if ((result.updatedFields?.length > 0 || result.insertedRecords > 0) && triggerFullPipeline) {
              console.log('[AUDIO] Disparando pipeline após extração...');
              await triggerFullPipeline('Informação extraída de áudio');
            }
            
            // ✅ DISPARAR EVENTO DE SINCRONIZAÇÃO
            window.dispatchEvent(new CustomEvent('case-updated', { 
              detail: { caseId: data.caseId, source: 'audio-extraction' } 
            }));
          }
        }
        
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

    const messageText = userInput;
    setMessages(prev => [...prev, { role: "user", content: messageText }]);
    setUserInput("");
    setIsProcessing(true);
    
    try {
      // Detectar situação especial
      await detectSpecialSituation(messageText);
      
      // Se há um caseId, processar a mensagem com IA
      if (data.caseId) {
        console.log('[CHAT] Processando mensagem com IA...');
        
        const { data: result, error } = await supabase.functions.invoke(
          'process-chat-message',
          { body: { caseId: data.caseId, messageText } }
        );

        if (error) {
          console.error('[CHAT] Erro ao processar mensagem:', error);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `⚠️ Erro ao processar: ${error.message}` 
          }]);
        } else if (result?.extracted) {
          console.log('[CHAT] Informações extraídas:', result.extracted);
          
          // Mostrar resumo amigável
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `✅ ${result.extracted.summary}\n\n📊 Campos atualizados: ${result.updatedFields?.length || 0}\n📝 Registros criados: ${result.insertedRecords || 0}` 
          }]);

          // Se houver mudanças significativas, disparar pipeline
          if (result.updatedFields?.length > 0 || result.insertedRecords > 0) {
            console.log('[CHAT] Disparando pipeline completo...');
            toast({
              title: "Informações atualizadas",
              description: "Reprocessando análise com novos dados...",
            });
            
            await triggerFullPipeline('Informação manual adicionada no chat');
          }
        } else {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Obrigado pela informação! Há mais alguma informação que você gostaria de adicionar?" 
          }]);
        }
      } else {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Obrigado pela informação! Por favor, adicione documentos para criar o caso." 
        }]);
      }
    } catch (error: any) {
      console.error('[CHAT] Erro:', error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `❌ Erro: ${error.message}` 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Chat Inteligente</h2>
        <p className="text-muted-foreground">
          Envie os documentos e deixe a IA extrair as informações automaticamente
        </p>
      </div>

      {/* ✅ FASE 4: Painel de Status Visual */}
      {data.caseId && (
        <>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className={data.childName ? 'text-green-600' : 'text-red-600'}>
                  👶 Criança: {data.childName ? '✅' : '❌'}
                </span>
                <span className={data.authorName && data.authorName !== 'Processando...' ? 'text-green-600' : 'text-red-600'}>
                  👤 Mãe: {data.authorName && data.authorName !== 'Processando...' ? '✅' : '❌'}
                </span>
                <span className={data.authorCpf && data.authorCpf !== '00000000000' ? 'text-green-600' : 'text-red-600'}>
                  🪪 CPF: {data.authorCpf && data.authorCpf !== '00000000000' ? '✅' : '❌'}
                </span>
                <span className={data.raProtocol ? 'text-green-600' : 'text-muted-foreground'}>
                  📋 RA: {data.raProtocol ? '✅' : '⚪'}
                </span>
              </div>
            </AlertDescription>
          </Alert>

          <Button
            onClick={async () => {
              if (!data.caseId) return;
              
              // Buscar documentos importantes que precisam reprocessamento
              const { data: docs } = await supabase
                .from('documents')
                .select('id, file_name, document_type')
                .eq('case_id', data.caseId)
                .in('document_type', ['procuracao', 'identificacao', 'processo_administrativo']);
              
              if (!docs || docs.length === 0) {
                toast({
                  title: "Nenhum documento encontrado",
                  description: "Envie procuração, RG e processo administrativo primeiro",
                  variant: "destructive",
                });
                return;
              }
              
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `🔄 Reprocessando ${docs.length} documento(s): ${docs.map(d => d.file_name).join(', ')}`
              }]);
              
              setIsProcessing(true);
              
              // Reprocessar cada documento
              for (const doc of docs) {
                const { error } = await supabase.functions.invoke('analyze-single-document', {
                  body: {
                    caseId: data.caseId,
                    documentId: doc.id,
                    forceDocType: doc.document_type
                  }
                });
                
                if (error) {
                  console.error(`Erro ao reprocessar ${doc.file_name}:`, error);
                }
              }
              
              setIsProcessing(false);
              
              // Aguardar 2s e forçar refresh
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('case-updated', { 
                  detail: { caseId: data.caseId, source: 'reprocess-important-docs' } 
                }));
                
                setMessages(prev => [...prev, {
                  role: "assistant",
                  content: `✅ Documentos reprocessados! Verifique a aba "Informações Básicas"`
                }]);
              }, 2000);
            }}
            variant="outline"
            className="w-full"
            disabled={isProcessing}
          >
            🔄 Reprocessar Procuração, RG e Processo Administrativo
          </Button>
        </>
      )}

      {/* ✅ CORREÇÃO #2: Alerta de PDFs não processados */}
      {failedPdfs.length > 0 && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <p className="font-medium mb-2 text-amber-900 dark:text-amber-100">
              ⚠️ {failedPdfs.length} PDF(s) não foram processados
            </p>
            <ul className="text-sm space-y-1 mb-3 text-amber-800 dark:text-amber-200">
              {failedPdfs.map((pdf, idx) => (
                <li key={idx}>📄 {pdf}</li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-600 text-amber-900 hover:bg-amber-100 dark:text-amber-100"
              onClick={async () => {
                try {
                  setIsProcessing(true);
                  const { data: result, error } = await supabase.functions.invoke('reconvert-failed-pdfs', {
                    body: { caseId: data.caseId }
                  });
                  
                  if (error) {
                    toast({
                      title: "Erro ao reconverter",
                      description: error.message,
                      variant: "destructive",
                    });
                  } else {
                    toast({
                      title: "PDFs reconvertendo",
                      description: `${result.reprocessed} PDFs sendo reconvertidos...`,
                    });
                    setFailedPdfs([]);
                    
                    // Recarregar após 3 segundos
                    setTimeout(() => {
                      window.location.reload();
                    }, 3000);
                  }
                } catch (error: any) {
                  toast({
                    title: "Erro",
                    description: error.message,
                    variant: "destructive",
                  });
                } finally {
                  setIsProcessing(false);
                }
              }}
            >
              🔄 Reconverter PDFs
            </Button>
          </AlertDescription>
        </Alert>
      )}

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


      {/* Cole Prints com Ctrl+V - Versão Compacta */}
      <div className="p-1.5">
        <PasteDataInline
          extractionType="processo_administrativo"
          onDataExtracted={(extractedData) => {
            console.log('[CHAT] Dados extraídos via Ctrl+V:', extractedData);
            
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `✅ Dados extraídos via Ctrl+V com sucesso!`
            }]);
            
            const updates: any = {};
            if (extractedData.raProtocol) updates.raProtocol = extractedData.raProtocol;
            if (extractedData.childName) updates.childName = extractedData.childName;
            if (extractedData.childBirthDate) updates.childBirthDate = extractedData.childBirthDate;
            if (extractedData.motherName) updates.motherName = extractedData.motherName;
            if (extractedData.motherCpf) updates.motherCpf = extractedData.motherCpf;
            if (extractedData.landOwnerCpf) updates.landOwnerCpf = extractedData.landOwnerCpf;
            if (extractedData.landOwnerRg) updates.landOwnerRg = extractedData.landOwnerRg;
            if (extractedData.landOwnerName) updates.landOwnerName = extractedData.landOwnerName;
            
            if (Object.keys(updates).length > 0) {
              updateData(updates);
              toast({ title: `${Object.keys(updates).length} campo(s) atualizado(s)` });
            }
          }}
          placeholder="Ctrl+V para colar print ou texto..."
        />
      </div>

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
          onClick={async () => {
            if (!data.caseId) return;
            setIsProcessing(true);
            const { data: result, error } = await supabase.functions.invoke('check-case-completeness', {
              body: { caseId: data.caseId }
            });
            if (error) {
              toast({ title: "Erro", description: error.message, variant: "destructive" });
            } else if (result.complete) {
              toast({ title: "Completo!", description: "Todas informações preenchidas" });
            } else {
              toast({ title: "Verificado", description: `${result.reanalyzedDocuments} docs reprocessados` });
              window.dispatchEvent(new CustomEvent('case-updated'));
            }
            setIsProcessing(false);
          }}
          variant="outline"
          disabled={isProcessing || !data.caseId}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Verificar
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
