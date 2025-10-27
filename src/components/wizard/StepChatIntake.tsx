import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Send, FileText, CheckCircle, AlertCircle, Loader2, Mic } from "lucide-react";

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
  const [userInput, setUserInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede 200MB`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });
    
    setUploadedFiles(prev => [...prev, ...validFiles]);
    
    if (validFiles.length > 0) {
      processDocuments(validFiles);
    }
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

      // Upload dos arquivos para o Storage
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${caseId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
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

      // Chamar edge function para extrair informações
      const { data: extractionResult, error: extractionError } = await supabase.functions.invoke(
        "process-documents-with-ai",
        {
          body: {
            caseId,
            documentIds: documents.map(d => d.id),
          },
        }
      );

      if (extractionError) throw extractionError;

      // Atualizar mensagens com o resultado
      const extractedData = extractionResult.extractedData || {};
      const missingFields = extractionResult.missingFields || [];

      console.log("Dados extraídos:", extractedData);
      console.log("Campos faltantes:", missingFields);

      let assistantMessage = `✅ **Documentos processados com sucesso!**\n\n`;
      assistantMessage += `📄 **${extractionResult.documentsProcessed || uploadedFiles.length} documento(s) analisado(s)**\n\n`;
      
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
      
      assistantMessage += "\n✨ **Esses dados já foram preenchidos automaticamente no formulário!**\n";
      assistantMessage += "➡️ Clique em 'Próximo' para revisar e completar as informações.";

      setMessages(prev => [...prev, {
        role: "assistant",
        content: assistantMessage,
        extractedData,
      }]);

      // Atualizar dados do formulário com TODOS os campos extraídos
      updateData({
        ...data,
        caseId,
        // Dados da mãe
        authorName: extractedData.motherName || data.authorName,
        authorCPF: extractedData.motherCpf || data.authorCPF,
        authorRG: extractedData.motherRg || data.authorRG,
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
        landOwnerCPF: extractedData.landOwnerCpf || data.landOwnerCPF,
        landOwnerRG: extractedData.landOwnerRg || data.landOwnerRG,
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
        autoFilledFields: Object.keys(extractedData),
        documents: uploadedFiles.map(f => f.name),
      });

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
    setIsProcessing(true);
    
    try {
      // Converter blob para base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // Chamar edge function para transcrição
        const { data: transcriptionResult, error } = await supabase.functions.invoke(
          'voice-to-text',
          { body: { audio: base64Audio } }
        );
        
        if (error) throw error;
        
        const transcribedText = transcriptionResult.text;
        setUserInput(transcribedText);
        
        toast({
          title: "Áudio transcrito",
          description: "O texto foi inserido no campo de mensagem.",
        });
        
        // Detectar situação especial automaticamente
        await detectSpecialSituation(transcribedText);
      };
    } catch (error: any) {
      console.error('Erro na transcrição:', error);
      toast({
        title: "Erro na transcrição",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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
                <li key={idx} className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
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
          variant={isRecording ? "destructive" : "outline"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className="flex-shrink-0"
        >
          <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />
        </Button>

        <Input
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isProcessing && handleSendMessage()}
          placeholder="Digite ou grave informações complementares..."
          disabled={isProcessing || isRecording}
        />

        <Button
          onClick={handleSendMessage}
          disabled={!userInput.trim() || isProcessing || isRecording}
          className="flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
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
