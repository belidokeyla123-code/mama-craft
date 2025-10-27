import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Trash2, Download, Eye, Loader2, FolderDown, Upload, Plus } from "lucide-react";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";
import JSZip from "jszip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  uploaded_at: string;
}

interface StepDocumentsManagerProps {
  caseId: string;
  caseName?: string;
  onDocumentsChange?: () => void;
}

export const StepDocumentsManager = ({ caseId, caseName, onDocumentsChange }: StepDocumentsManagerProps) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadDocuments = async () => {
    if (!caseId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("case_id", caseId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar documentos:", error);
      toast({
        title: "Erro ao carregar documentos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [caseId]);

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      // Buscar o documento para pegar o file_path
      const { data: doc, error: fetchError } = await supabase
        .from("documents")
        .select("file_path")
        .eq("id", deleteId)
        .single();

      if (fetchError) throw fetchError;

      // Excluir do storage
      const { error: storageError } = await supabase.storage
        .from("case-documents")
        .remove([doc.file_path]);

      if (storageError) {
        console.warn("Aviso ao excluir do storage:", storageError);
      }

      // Excluir do banco
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", deleteId);

      if (dbError) throw dbError;

      toast({
        title: "Documento excluído",
        description: "O documento foi removido com sucesso.",
      });

      // Recarregar lista
      await loadDocuments();
      
      // Notificar componente pai
      if (onDocumentsChange) {
        onDocumentsChange();
      }
    } catch (error: any) {
      console.error("Erro ao excluir documento:", error);
      toast({
        title: "Erro ao excluir documento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("case-documents")
        .download(doc.file_path);

      if (error) throw error;

      // Criar URL temporária e baixar
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: `Baixando ${doc.file_name}...`,
      });
    } catch (error: any) {
      console.error("Erro ao baixar documento:", error);
      toast({
        title: "Erro ao baixar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadAll = async () => {
    if (documents.length === 0) return;
    
    setIsDownloadingAll(true);
    
    try {
      const zip = new JSZip();
      const folderName = caseName || `caso_${caseId.slice(0, 8)}`;
      const folder = zip.folder(folderName);
      
      if (!folder) throw new Error("Erro ao criar pasta no ZIP");
      
      // Download de todos os documentos
      for (const doc of documents) {
        try {
          const { data, error } = await supabase.storage
            .from("case-documents")
            .download(doc.file_path);
          
          if (error) throw error;
          
          // Adicionar ao ZIP
          folder.file(doc.file_name, data);
        } catch (error) {
          console.error(`Erro ao baixar ${doc.file_name}:`, error);
        }
      }
      
      // Gerar e baixar o ZIP
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download concluído",
        description: `${documents.length} documento(s) baixados em ${folderName}.zip`,
      });
    } catch (error: any) {
      console.error("Erro ao criar ZIP:", error);
      toast({
        title: "Erro ao baixar todos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      // Converter PDFs em imagens
      const processedFiles: File[] = [];
      for (const file of files) {
        if (isPDF(file)) {
          const { images } = await convertPDFToImages(file, 10);
          processedFiles.push(...images);
        } else {
          processedFiles.push(file);
        }
      }

      // Upload para o storage
      const uploadPromises = processedFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileName = `${caseName || `caso_${caseId.slice(0, 8)}`}/${timestamp}_${randomId}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("case-documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Salvar no banco
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

      const uploadedDocs = await Promise.all(uploadPromises);

      // Chamar edge function para processar com IA
      const { data: processingResult, error: processingError } = await supabase.functions.invoke(
        "process-documents-with-ai",
        {
          body: {
            caseId,
            documentIds: uploadedDocs.map(d => d.id),
          },
        }
      );

      if (processingError) {
        console.error('Erro ao processar com IA:', processingError);
      }

      toast({
        title: "Documentos enviados",
        description: `${uploadedDocs.length} documento(s) enviado(s) e processado(s) com IA`,
      });

      // Recarregar lista
      await loadDocuments();
      if (onDocumentsChange) onDocumentsChange();

    } catch (error: any) {
      console.error("Erro ao enviar documentos:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocumentTypeBadge = (type: string) => {
    const types: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      CERTIDAO_NASCIMENTO: { label: "Certidão", variant: "default" },
      IDENTIFICACAO: { label: "RG/CPF", variant: "secondary" },
      COMPROVANTE_RESIDENCIA: { label: "Comprovante", variant: "outline" },
      AUTODECLARACAO_RURAL: { label: "Rural", variant: "default" },
      DOCUMENTO_TERRA: { label: "Terra", variant: "secondary" },
      PROCESSO_ADMINISTRATIVO: { label: "Processo", variant: "destructive" },
      OUTROS: { label: "Outro", variant: "outline" },
    };

    const config = types[type] || types.OUTROS;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Carregando documentos...</span>
        </div>
      </Card>
    );
  }

  if (!caseId) {
    return (
      <Alert>
        <AlertDescription>
          Aguardando criação do caso para exibir documentos.
        </AlertDescription>
      </Alert>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">Nenhum documento enviado</h3>
        <p className="text-muted-foreground mb-4">
          Adicione documentos para continuar com o processo
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button onClick={handleUploadClick} disabled={isUploading} className="gap-2">
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Adicionar Documentos
            </>
          )}
        </Button>
      </Card>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Documentos Enviados</h3>
              <Badge variant="outline" className="mt-1">{documents.length} arquivo(s)</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Adicionar Mais
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownloadAll}
                disabled={isDownloadingAll || documents.length === 0}
                variant="outline"
                className="gap-2"
              >
                {isDownloadingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparando ZIP...
                  </>
                ) : (
                  <>
                    <FolderDown className="h-4 w-4" />
                    Baixar Todos
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>•</span>
                      <span>{new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  {getDocumentTypeBadge(doc.document_type)}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(doc)}
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(doc.id)}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
