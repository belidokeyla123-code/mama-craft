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
          .single();

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
    setIsProcessing(true);

    try {
      // ✅ PROTEÇÃO: Garantir que caseId existe
      const activeCaseId = data.caseId || crypto.randomUUID();
      if (!data.caseId) {
        console.warn('[StepChatInteligente] ⚠️ caseId estava undefined, gerando e salvando...');
        updateData({ caseId: activeCaseId });
      }

      // 🔥 CORREÇÃO CRÍTICA: Criar registro em cases ANTES de qualquer outra operação
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

      if (caseError) {
        console.error('❌ [Erro Crítico] Não foi possível criar o caso:', caseError);
        throw new Error(`Erro ao criar caso: ${caseError.message}`);
      }

      console.log(`✅ [Case Ready] ID: ${activeCaseId} - Caso criado/verificado com sucesso`);

      // ✅ Garantir que existe case_assignment
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
      }

      // ⚡ OTIMIZAÇÃO: Uploads e inserts PARALELOS no banco + storage
      const uploadPromises = files.map(async (file, idx) => {
        const sanitizedFileName = sanitizeFileName(file.name);
        console.log(`[Upload ${idx + 1}/${files.length}] "${file.name}" → "${sanitizedFileName}"`);
        
        const fileName = `${activeCaseId}/${Date.now()}_${idx}_${sanitizedFileName}`;
        
        // Upload to Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("case-documents")
          .upload(fileName, file);

        if (uploadError) throw new Error(`Erro upload ${file.name}: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("case-documents")
          .getPublicUrl(fileName);

        // ✅ CORREÇÃO CRÍTICA: Salvar documento no banco
        const { data: docData, error: docError } = await supabase
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
          .single();

        if (docError) {
          console.error(`❌ Erro ao salvar documento ${file.name}:`, docError);
          throw new Error(`Erro ao salvar ${file.name}: ${docError.message}`);
        }

        console.log(`✅ [DB Save ${idx + 1}/${files.length}] ${sanitizedFileName} salvo com ID: ${docData.id}`);

        return {
          url: urlData.publicUrl,
          name: file.name,
          type: file.type,
          documentId: docData.id, // ✅ Guardar ID do documento
        };
      });

      // Aguardar todos os uploads em paralelo
      const uploadResults = await Promise.all(uploadPromises);
      const documentIds = uploadResults.map(r => r.documentId);

      console.log(`🚀 [Uploads Completos] ${uploadResults.length} documentos salvos. IDs: ${documentIds.join(', ')}`);

      // ✅ Adicionar à fila de processamento
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

      if (queueError) {
        console.error('[Queue Error]:', queueError);
      }

      // ✅ Mostrar feedback imediato
      const processingMessage: Message = {
        role: "assistant",
        content: `✅ **${files.length} documentos recebidos e salvos!**\n\n🤖 Estou analisando agora:\n${files.map(f => `• ${f.name}`).join('\n')}\n\n⏱️ Isso pode levar alguns segundos. Você pode sair e voltar depois, a análise continuará em background!`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, processingMessage]);

      // ✅ USAR EDGE FUNCTION CORRETO QUE FAZ ANÁLISE REAL
      console.log(`🤖 [IA] Chamando process-documents-with-ai com ${documentIds.length} documentos...`);

      const { data: aiResponse, error: aiError } = await supabase.functions.invoke(
        "process-documents-with-ai", // ✅ Edge function correto
        {
          body: {
            caseId: activeCaseId,
            documentIds: documentIds, // ✅ Passar IDs dos documentos
          },
        }
      );

      if (aiError) {
        console.error('[AI Error]:', aiError);
        throw aiError;
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
    } catch (error) {
      console.error("Error processing files:", error);
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

  const handleComplete = () => {
    if (!casePayload) {
      toast({
        title: "Análise incompleta",
        description: "Por favor, envie os documentos e complete a análise antes de prosseguir.",
        variant: "destructive",
      });
      return;
    }

    // Save final state
    updateData({
      ...data,
      chatAnalysis: casePayload,
      chatCompleted: true,
    });

    toast({
      title: "Chat concluído!",
      description: "Avançando para a próxima etapa...",
    });

    onComplete();
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
