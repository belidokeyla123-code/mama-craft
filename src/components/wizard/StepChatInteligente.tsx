import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Upload, Send, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CaseData } from "@/pages/NewCase";
import { sanitizeFileName } from "@/lib/documentTypeMapper";
import { useChatProcessing } from "@/hooks/useChatProcessing";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB em bytes

const formatFileSize = (bytes: number): string => {
  return (bytes / (1024 * 1024)).toFixed(2);
};

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface StepChatInteligenteProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
  onComplete: () => void;
}

export const StepChatInteligente = ({ data, updateData, onComplete }: StepChatInteligenteProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 Olá! Sou sua Advogada Previdenciária especialista em **Salário-Maternidade Rural** com mais de 20 anos de experiência.\n\nVou te ajudar a construir uma **Ação de Concessão de Salário-Maternidade** completa, desde a análise dos documentos até a minuta final.\n\n📋 **Para começar, envie:**\n- Documentos de identificação (RG, CPF)\n- Certidão de nascimento da criança\n- Provas de atividade rural (CAF/DAP, notas fiscais, declarações)\n- CNIS\n- Comprovante de residência\n\nOu me conte sobre o caso que vou te orientar! 😊",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [casePayload, setCasePayload] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { status: processingStatus, progress, currentDocument } = useChatProcessing(data.caseId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ✅ Monitorar conclusão do processamento em background
  useEffect(() => {
    if (processingStatus === 'completed' && !casePayload && data.caseId) {
      // Buscar dados extraídos quando processamento concluir
      const fetchExtractedData = async () => {
        const { data: caseData } = await supabase
          .from('cases')
          .select('*')
          .eq('id', data.caseId)
          .maybeSingle(); // ✅ Trocar .single() por .maybeSingle()

        if (caseData && caseData.author_name !== 'Aguardando análise do chat') {
          const payload = {
            identificacao: {
              nome: caseData.author_name,
              cpf: caseData.author_cpf,
            },
            evento_gerador: {
              tipo: caseData.event_type,
              data: caseData.event_date,
            },
            crianca: {
              nome: caseData.child_name,
              data_nascimento: caseData.child_birth_date,
            },
            conclusao_previa: caseData.author_name ? 'Apto' : 'Inapto',
          };

          setCasePayload(payload);
          updateData({
            ...data,
            authorName: caseData.author_name,
            authorCpf: caseData.author_cpf,
            eventDate: caseData.event_date,
            chatAnalysis: payload,
          });

          const completedMessage: Message = {
            role: "assistant",
            content: `🎉 **Processamento em background concluído!**\n\n✅ Todos os documentos foram analisados.\n📊 Dados extraídos e salvos com sucesso.`,
            timestamp: new Date(),
          };

          setMessages((prev) => [...prev, completedMessage]);
        }
      };

      fetchExtractedData();
    }
  }, [processingStatus, casePayload, data.caseId]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // ✅ VALIDAÇÃO: Filtrar arquivos por tamanho
    const validFiles: File[] = [];
    const rejectedFiles: Array<{ name: string; size: number }> = [];

    files.forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        rejectedFiles.push({ name: file.name, size: file.size });
      } else {
        validFiles.push(file);
      }
    });

    // ❌ Se houver arquivos rejeitados, mostrar feedback
    if (rejectedFiles.length > 0) {
      const rejectedList = rejectedFiles
        .map((f) => `• ${f.name} (${formatFileSize(f.size)}MB)`)
        .join("\n");

      toast({
        title: "❌ Arquivos muito grandes",
        description: (
          <div className="space-y-2">
            <p>Os seguintes arquivos excedem o limite de 200MB:</p>
            <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
              {rejectedList}
            </pre>
            {validFiles.length > 0 && (
              <p className="text-green-600 font-semibold">
                ✅ {validFiles.length} arquivo(s) válido(s) serão enviados
              </p>
            )}
          </div>
        ),
        variant: "destructive",
        duration: 8000,
      });

      // Mensagem no chat
      const rejectionMessage: Message = {
        role: "assistant",
        content: `⚠️ **Atenção:** ${rejectedFiles.length} arquivo(s) foram rejeitados por excederem 200MB.\n\n${rejectedList}\n\n${
          validFiles.length > 0 
            ? `✅ Vou processar os ${validFiles.length} arquivo(s) válidos.` 
            : "❌ Nenhum arquivo válido para processar."
        }`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, rejectionMessage]);
    }

    // ✅ Se não houver arquivos válidos, parar aqui
    if (validFiles.length === 0) {
      event.target.value = "";
      return;
    }

    // ✅ Processar apenas arquivos válidos
    setUploadedFiles((prev) => [...prev, ...validFiles]);
    
    const fileNames = validFiles.map((f) => f.name).join(", ");
    const userMessage: Message = {
      role: "user",
      content: `📎 Arquivos enviados: ${fileNames}`,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    processFilesWithAI(validFiles);

    event.target.value = "";
  };

  const processFilesWithAI = async (files: File[]) => {
    // ⚡ ALERTA VISUAL IMEDIATO NA TELA
    const alertDiv = document.createElement('div');
    alertDiv.id = 'debug-alert';
    alertDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:red;color:white;padding:40px;z-index:99999;font-size:24px;font-weight:bold;border:5px solid yellow;box-shadow:0 0 50px rgba(255,0,0,0.8);text-align:center;min-width:400px;';
    alertDiv.textContent = '🔴 INICIANDO PROCESSAMENTO';
    document.body.appendChild(alertDiv);
    
    console.log('🔴🔴🔴 [1] === INICIO ABSOLUTO ===', new Date().toISOString());
    console.log('🔴🔴🔴 [1.1] Files recebidos:', files.length, files);
    
    setIsProcessing(true);
    console.log('🔴🔴🔴 [2] setIsProcessing(true) executado');

    try {
      console.log('🔴🔴🔴 [3] === DENTRO DO TRY BLOCK ===');
      alertDiv.textContent = '🔴 DENTRO DO TRY';
      await new Promise(r => setTimeout(r, 500)); // Pausa para ver o alerta
      
      const activeCaseId = data.caseId || crypto.randomUUID();
      console.log('🔴🔴🔴 [4] activeCaseId:', activeCaseId);
      alertDiv.textContent = `🔴 CASE ID: ${activeCaseId.slice(0,8)}...`;
      
      if (!data.caseId) {
        console.warn('[StepChatInteligente] ⚠️ caseId estava undefined, gerando e salvando...');
        updateData({ caseId: activeCaseId });
      }

      // 🔥 CORREÇÃO CRÍTICA: Criar registro em cases ANTES de qualquer outra operação
      console.log('🔴🔴🔴 [5] === TENTANDO UPSERT EM CASES ===');
      alertDiv.textContent = '🔴 SALVANDO CASO NA BASE...';
      await new Promise(r => setTimeout(r, 300));
      
      try {
        const { error: caseError } = await supabase
          .from('cases')
          .upsert({
            id: activeCaseId,
            author_name: 'Aguardando análise do chat',
            author_cpf: '000.000.000-00',
            event_date: new Date().toISOString().split('T')[0],
            event_type: 'parto',
            profile: 'especial',
            status: 'intake',
            started_with_chat: true,
          }, {
            onConflict: 'id'
          })
          .select()
          .maybeSingle();

        console.log('🔴🔴🔴 [6] UPSERT COMPLETO');
        console.log('🔴🔴🔴 [6.1] caseError:', caseError);

        if (caseError) {
          console.error('🔴🔴🔴 [ERRO CRÍTICO NO UPSERT]:', caseError);
          alertDiv.textContent = '❌ ERRO AO SALVAR CASO: ' + caseError.message;
          alertDiv.style.background = 'darkred';
          throw new Error(`Erro ao criar caso: ${caseError.message}`);
        }

        console.log('🔴🔴🔴 [7] ✅ CASO SALVO COM SUCESSO');
        alertDiv.textContent = '✅ CASO SALVO';
        alertDiv.style.background = 'green';
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error('🔴🔴🔴 [EXCEPTION em UPSERT cases]:', e);
        throw e;
      }

      // ✅ Garantir que existe case_assignment
      console.log('🔴🔴🔴 [8] === BUSCANDO USUÁRIO ===');
      alertDiv.textContent = '🔴 VERIFICANDO USUÁRIO...';
      alertDiv.style.background = 'red';
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔴🔴🔴 [9] User ID:', user?.id);
      
      if (user) {
        try {
          const { error: assignError } = await supabase
            .from('case_assignments')
            .insert({ 
              case_id: activeCaseId, 
              user_id: user.id 
            })
            .select()
            .maybeSingle();
          
          if (assignError && !assignError.message.includes('duplicate')) {
            console.error('[Assignment Error]:', assignError);
          }
        } catch (e) {
          console.error('🔴🔴🔴 [EXCEPTION em case_assignment]:', e);
        }
      }

      // ⚡ OTIMIZAÇÃO: Uploads e inserts PARALELOS no banco + storage
      console.log('🔴🔴🔴 [10] === INICIANDO UPLOADS ===');
      alertDiv.textContent = `🔴 FAZENDO UPLOAD DE ${files.length} ARQUIVOS...`;
      await new Promise(r => setTimeout(r, 300));
      
      const uploadPromises = files.map(async (file, idx) => {
        console.log(`🔴🔴🔴 [11.${idx}] === ARQUIVO ${idx + 1}/${files.length}: ${file.name} ===`);
        
        const sanitizedFileName = sanitizeFileName(file.name);
        console.log(`🔴 [9.${idx}.1] Arquivo sanitizado: "${sanitizedFileName}"`);
        
        const fileName = `${activeCaseId}/${Date.now()}_${idx}_${sanitizedFileName}`;
        
        let urlData: any;
        let docData: any;
        
        // Upload to Storage com proteção individual
        try {
          console.log(`🔴🔴🔴 [12.${idx}] UPLOAD STORAGE: ${fileName}`);
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("case-documents")
            .upload(fileName, file);

          console.log(`🔴🔴🔴 [13.${idx}] Upload storage completo. Erro?`, uploadError);

          if (uploadError) {
            console.error(`🔴🔴🔴 [ERRO UPLOAD STORAGE ${idx}]:`, uploadError);
            throw new Error(`Erro upload ${file.name}: ${uploadError.message}`);
          }

          const result = supabase.storage
            .from("case-documents")
            .getPublicUrl(fileName);
          
          urlData = result.data;
          
          console.log(`🔴🔴🔴 [14.${idx}] URL pública obtida para ${file.name}`);
        } catch (e) {
          console.error(`🔴🔴🔴 [EXCEPTION UPLOAD STORAGE ${idx}]:`, e);
          alertDiv.textContent = `❌ ERRO UPLOAD ${file.name}`;
          alertDiv.style.background = 'darkred';
          throw e;
        }

        // ✅ CORREÇÃO CRÍTICA: Salvar documento no banco com tratamento robusto
        try {
          console.log(`🔴🔴🔴 [15.${idx}] === INSERT DB: ${sanitizedFileName} ===`);

          const { data: insertData, error: docError } = await supabase
            .from('documents')
            .insert({
              case_id: activeCaseId,
              file_name: sanitizedFileName,
              file_path: fileName,
              file_size: file.size,
              mime_type: file.type,
              document_type: 'outro', // Será reclassificado depois
            })
            .select()
            .maybeSingle();

          docData = insertData;

          console.log(`🔴🔴🔴 [16.${idx}] Insert DB completo. Erro?`, docError);
          console.log(`🔴🔴🔴 [16.${idx}.1] Dados retornados?`, !!docData);

          if (docError) {
            console.error(`🔴🔴🔴 [ERRO DB ${idx}] Erro ao salvar documento:`, docError);
            console.error(`🔴🔴🔴 [ERRO DB ${idx}] JSON:`, JSON.stringify(docError, null, 2));
            
            // Se for erro de RLS, mostrar mensagem específica
            if (docError.code === 'PGRST301' || docError.message.includes('RLS')) {
              throw new Error(`Erro de permissão RLS ao salvar ${file.name}. Verifique as políticas.`);
            }
            
            throw new Error(`Erro ao salvar ${file.name} no banco: ${docError.message}`);
          }

          if (!docData) {
            console.error(`❌ [DB ERROR] Documento ${file.name} não retornou dados após INSERT`);
            throw new Error(`Falha ao salvar ${file.name}: nenhum dado retornado`);
          }

          console.log(`🔴🔴🔴 [17.${idx}] ✅ DOCUMENTO SALVO: ${sanitizedFileName} (ID: ${docData.id})`);
        } catch (e) {
          console.error(`🔴🔴🔴 [EXCEPTION DB INSERT ${idx}]:`, e);
          alertDiv.textContent = `❌ ERRO SALVAR DB ${file.name}`;
          alertDiv.style.background = 'darkred';
          throw e;
        }

        return {
          url: urlData.publicUrl,
          name: file.name,
          type: file.type,
          documentId: docData.id,
        };
      });

      // Aguardar todos os uploads em paralelo
      console.log('🔴🔴🔴 [18] === AGUARDANDO PROMISE.ALL ===');
      alertDiv.textContent = '🔴 AGUARDANDO UPLOADS...';
      const uploadResults = await Promise.all(uploadPromises);
      console.log('🔴🔴🔴 [19] ✅ PROMISE.ALL COMPLETO!', { count: uploadResults.length });
      alertDiv.textContent = `✅ ${uploadResults.length} ARQUIVOS SALVOS!`;
      alertDiv.style.background = 'green';
      await new Promise(r => setTimeout(r, 500));
      
      const documentIds = uploadResults.map(r => r.documentId);
      console.log('🔴🔴🔴 [20] Document IDs:', documentIds);

      console.log(`🚀 [Uploads Completos] ${uploadResults.length} documentos salvos. IDs: ${documentIds.join(', ')}`);

      // ✅ Adicionar à fila de processamento
      console.log('🔴🔴🔴 [21] === CRIANDO PROCESSING_QUEUE ===');
      alertDiv.textContent = '🔴 CRIANDO FILA DE PROCESSAMENTO...';
      alertDiv.style.background = 'red';
      
      try {
        const { error: queueError } = await supabase
          .from('processing_queue')
          .insert({
            case_id: activeCaseId,
            status: 'processing',
            job_type: 'chat_analysis',
            document_ids: documentIds,
            total_documents: documentIds.length,
            processed_documents: 0,
          });

        console.log('🔴🔴🔴 [22] Queue criado. Erro?', queueError);

        if (queueError) {
          console.error('[Queue Error]:', queueError);
        }
      } catch (e) {
        console.error('🔴🔴🔴 [EXCEPTION em processing_queue]:', e);
      }

      // ✅ Mostrar feedback imediato
      const processingMessage: Message = {
        role: "assistant",
        content: `✅ **${files.length} documentos recebidos e salvos!**\n\n🤖 Estou analisando agora:\n${files.map(f => `• ${f.name}`).join('\n')}\n\n⏱️ Isso pode levar alguns segundos. Você pode sair e voltar depois, a análise continuará em background!`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, processingMessage]);

      // ✅ USAR EDGE FUNCTION CORRETO QUE FAZ ANÁLISE REAL
      console.log('🔴🔴🔴 [23] === CHAMANDO EDGE FUNCTION ===');
      alertDiv.textContent = '🔴 PROCESSANDO COM IA...';
      await new Promise(r => setTimeout(r, 300));

      let aiResponse: any;
      
      try {
        console.log('🔴🔴🔴 [24] Invocando process-documents-with-ai...');
        const { data: responseData, error: aiError } = await supabase.functions.invoke(
          "process-documents-with-ai",
          {
            body: {
              caseId: activeCaseId,
              documentIds: documentIds,
            },
          }
        );

        aiResponse = responseData;

        console.log('🔴🔴🔴 [25] Edge function RETORNOU');
        console.log('🔴🔴🔴 [25.1] aiError:', aiError);
        console.log('🔴🔴🔴 [25.2] aiResponse:', aiResponse);

        if (aiError) {
          console.error('🔴🔴🔴 [ERRO EDGE FUNCTION]:', aiError);
          alertDiv.textContent = '❌ ERRO IA: ' + aiError.message;
          alertDiv.style.background = 'darkred';
          throw aiError;
        }
        
        console.log('🔴🔴🔴 [26] ✅ EDGE FUNCTION SUCESSO');
        alertDiv.textContent = '✅ IA PROCESSADA!';
        alertDiv.style.background = 'green';
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.error('🔴🔴🔴 [EXCEPTION EDGE FUNCTION]:', e);
        alertDiv.textContent = '❌ EXCEÇÃO IA';
        alertDiv.style.background = 'darkred';
        throw e;
      }

      // ✅ Processar resposta da IA
      if (aiResponse?.extractedData) {
        const finalMessage: Message = {
          role: "assistant",
          content: `✅ **Análise completa!**\n\n📊 Dados extraídos dos documentos:\n• Nome: ${aiResponse.extractedData.motherName || 'não identificado'}\n• CPF: ${aiResponse.extractedData.motherCpf || 'não identificado'}\n• Criança: ${aiResponse.extractedData.childName || 'não identificado'}\n\n${aiResponse.observations?.length > 0 ? `\n⚠️ **Observações:**\n${aiResponse.observations.join('\n')}` : ''}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, finalMessage]);

        // Criar payload estruturado
        const payload = {
          identificacao: {
            nome: aiResponse.extractedData.motherName,
            cpf: aiResponse.extractedData.motherCpf,
          },
          evento_gerador: {
            tipo: data.eventType || 'parto',
            data: aiResponse.extractedData.childBirthDate || data.eventDate,
          },
          crianca: {
            nome: aiResponse.extractedData.childName,
            data_nascimento: aiResponse.extractedData.childBirthDate,
          },
          conclusao_previa: aiResponse.extractedData.motherName ? 'Apto' : 'Inapto',
        };

        setCasePayload(payload);
        
        // ✅ CORREÇÃO CRÍTICA: Salvar dados extraídos NO BANCO imediatamente
        const { error: updateError } = await supabase
          .from('cases')
          .update({
            author_name: aiResponse.extractedData.motherName || 'Não identificado',
            author_cpf: aiResponse.extractedData.motherCpf || null,
            child_name: aiResponse.extractedData.childName || null,
            child_birth_date: aiResponse.extractedData.childBirthDate || null,
            event_date: aiResponse.extractedData.childBirthDate || data.eventDate,
            special_notes: JSON.stringify(payload), // Salvar chatAnalysis
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeCaseId);

        if (updateError) {
          console.error('❌ Erro ao atualizar caso:', updateError);
          // Não bloquear o fluxo, apenas logar
        } else {
          console.log(`✅ [Case Updated] Dados extraídos salvos no banco para caso ${activeCaseId}`);
        }
        
        updateData({
          ...data,
          authorName: aiResponse.extractedData.motherName || data.authorName || "",
          authorCpf: aiResponse.extractedData.motherCpf || data.authorCpf || "",
          eventDate: aiResponse.extractedData.childBirthDate || data.eventDate || "",
          chatAnalysis: payload,
          documents: [...(data.documents || []), ...files],
        });
      }

      toast({
        title: "Documentos analisados!",
        description: "A IA analisou seus documentos com sucesso.",
      });
      
      console.log('🔴🔴🔴 [27] === PROCESSO FINALIZADO COM SUCESSO ===');
      alertDiv.textContent = '✅✅✅ SUCESSO TOTAL!';
      alertDiv.style.background = 'darkgreen';
      setTimeout(() => alertDiv.remove(), 3000);
      
    } catch (error) {
      console.error('🔴🔴🔴🔴🔴 [=== ERRO NO CATCH PRINCIPAL ===]');
      console.error('🔴🔴🔴 [ERROR OBJECT]:', error);
      console.error('🔴🔴🔴 [ERROR MESSAGE]:', error instanceof Error ? error.message : 'N/A');
      console.error('🔴🔴🔴 [STACK]:', error instanceof Error ? error.stack : 'N/A');
      console.error('🔴🔴🔴 [TIPO]:', typeof error, error?.constructor?.name);
      
      const alertDiv2 = document.getElementById('debug-alert');
      if (alertDiv2) {
        alertDiv2.textContent = '❌❌❌ ERRO: ' + ((error as Error)?.message || 'Desconhecido');
        alertDiv2.style.background = 'darkred';
        setTimeout(() => alertDiv2.remove(), 5000);
      }
      
      toast({
        title: "Erro ao processar documentos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });

      const errorMessage: Message = {
        role: "assistant",
        content: "❌ Desculpe, houve um erro ao processar os documentos. Por favor, tente novamente.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsProcessing(true);

    try {
      const { data: aiResponse, error } = await supabase.functions.invoke(
        "analyze-documents-chat",
        {
          body: {
            caseId: data.caseId,
            message: inputMessage,
            conversationHistory: [...messages, userMessage].slice(-10),
            currentPayload: casePayload,
          },
        }
      );

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: aiResponse.response || "Entendi! Como posso te ajudar mais?",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update case payload if provided
      if (aiResponse.casePayload) {
        setCasePayload(aiResponse.casePayload);
        updateData({
          ...data,
          chatAnalysis: aiResponse.casePayload,
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Erro ao enviar mensagem",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });

      const errorMessage: Message = {
        role: "assistant",
        content: "❌ Desculpe, houve um erro. Por favor, tente novamente.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (!casePayload) {
      toast({
        title: "Análise incompleta",
        description: "Por favor, envie os documentos e complete a análise antes de prosseguir.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // ✅ 1. Salvar estado final no state
      updateData({
        ...data,
        chatAnalysis: casePayload,
        chatCompleted: true,
      });

      // ✅ 2. Garantir que dados estão no banco
      const { error: finalUpdateError } = await supabase
        .from('cases')
        .update({
          special_notes: JSON.stringify(casePayload),
          status: 'validating', // Avançar status
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.caseId);

      if (finalUpdateError) {
        console.error('❌ Erro ao salvar estado final:', finalUpdateError);
        throw finalUpdateError;
      }

      console.log('✅ [Final State] Dados salvos no banco');

      // ✅ 3. Disparar pipeline completo (análise → jurisprudência → teses → minuta)
      console.log('🚀 [Pipeline] Iniciando pipeline completo...');
      
      const { error: pipelineError } = await supabase.functions.invoke(
        'replicate-case-structure',
        {
          body: {
            caseId: data.caseId,
            forceReprocess: false,
          }
        }
      );

      if (pipelineError) {
        console.error('❌ Erro ao disparar pipeline:', pipelineError);
        // Não bloquear, continuar mesmo assim
      } else {
        console.log('✅ [Pipeline] Pipeline iniciado com sucesso');
      }

      toast({
        title: "✅ Chat concluído!",
        description: "Pipeline iniciado. Avançando para a próxima etapa...",
      });

      // ✅ 4. Avançar para próxima aba
      onComplete();

    } catch (error) {
      console.error('[handleComplete] Erro:', error);
      toast({
        title: "Erro ao concluir",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Chat Inteligente</h2>
        <p className="text-muted-foreground">
          Converse com a IA especializada em Salário-Maternidade Rural e envie seus documentos
        </p>
      </div>

      {/* Processing Status */}
      {processingStatus === 'processing' && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <p className="font-semibold text-blue-900">🤖 Análise em andamento...</p>
              </div>
              <p className="text-sm text-blue-700 font-medium">{Math.round(progress)}%</p>
            </div>
            <Progress value={progress} className="h-2" />
            {currentDocument && (
              <p className="text-xs text-blue-600">Processando: {currentDocument}</p>
            )}
          </div>
        </Card>
      )}

      {/* Pipeline Status */}
      {data.chatCompleted && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">✅ Chat Concluído!</p>
              <p className="text-sm text-green-700">
                Pipeline iniciado. Você pode avançar para as próximas etapas.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Status Card */}
      {casePayload && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Análise concluída</p>
              <p className="text-sm text-green-700">
                {casePayload.conclusao_previa === "Apto" && "✅ Caso apto para prosseguir"}
                {casePayload.conclusao_previa === "Apto_com_ressalvas" && "⚠️ Caso apto com ressalvas"}
                {casePayload.conclusao_previa === "Inapto" && "❌ Caso necessita de complementações"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Chat Messages */}
      <Card className="p-4 h-[500px] overflow-y-auto">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                <div className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Arquivos enviados ({uploadedFiles.length})
          </h3>
          <div className="space-y-1">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                {file.name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Input Area */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="h-4 w-4 mr-2" />
            Enviar Documentos
          </Button>
        </div>

        <div className="flex gap-2">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Digite sua mensagem... (Enter para enviar)"
            className="min-h-[80px]"
            disabled={isProcessing}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isProcessing}
            size="icon"
            className="h-[80px] w-[80px]"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handleComplete}
          disabled={!casePayload || isProcessing}
          size="lg"
        >
          Concluir e Avançar
        </Button>
      </div>
    </div>
  );
};
