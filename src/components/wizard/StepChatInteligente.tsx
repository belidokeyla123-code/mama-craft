import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Send, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CaseData } from "@/pages/NewCase";

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadedFiles((prev) => [...prev, ...files]);
    
    const fileNames = files.map((f) => f.name).join(", ");
    const userMessage: Message = {
      role: "user",
      content: `📎 Arquivos enviados: ${fileNames}`,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    processFilesWithAI(files);
  };

  const processFilesWithAI = async (files: File[]) => {
    setIsProcessing(true);

    try {
      // Upload files to Supabase Storage
      const uploadedUrls: string[] = [];
      
      for (const file of files) {
        const fileName = `${data.caseId}/${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
      }

      // Call AI to analyze documents
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke(
        "analyze-documents-chat",
        {
          body: {
            caseId: data.caseId,
            files: uploadedUrls.map((url, idx) => ({
              url,
              name: files[idx].name,
              type: files[idx].type,
            })),
            conversationHistory: messages.slice(-5), // Last 5 messages for context
          },
        }
      );

      if (aiError) throw aiError;

      const assistantMessage: Message = {
        role: "assistant",
        content: aiResponse.analysis || "✅ Documentos recebidos e analisados!",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update case payload if provided
      if (aiResponse.casePayload) {
        setCasePayload(aiResponse.casePayload);
        updateData({
          ...data,
          chatAnalysis: aiResponse.casePayload,
          documents: [...(data.documents || []), ...files],
          documentUrls: [...(data.documentUrls || []), ...uploadedUrls],
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

      {/* Status Card */}
      {casePayload && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Análise em andamento</p>
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
