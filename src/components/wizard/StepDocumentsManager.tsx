import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Trash2, Download, Eye, Loader2 } from "lucide-react";
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
  onDocumentsChange?: () => void;
}

export const StepDocumentsManager = ({ caseId, onDocumentsChange }: StepDocumentsManagerProps) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription>
          Nenhum documento enviado ainda. Use o Chat Inteligente para fazer upload dos documentos.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Documentos Enviados</h3>
            <Badge variant="outline">{documents.length} arquivo(s)</Badge>
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
