import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Trash2, Download, Eye, Loader2, FolderDown, Upload, Plus, RefreshCw, AlertTriangle } from "lucide-react";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";
import { reconvertImagesToPDF, groupDocumentsByOriginalName } from "@/lib/imagesToPdf";
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
  const [downloadProgress, setDownloadProgress] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
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
        .order("file_name", { ascending: true });

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
    setDownloadProgress("Iniciando download...");
    
    try {
      const zip = new JSZip();
      const folderName = caseName || `caso_${caseId.slice(0, 8)}`;
      const folder = zip.folder(folderName);
      
      if (!folder) throw new Error("Erro ao criar pasta no ZIP");
      
      // Agrupar documentos por nome original
      setDownloadProgress("Agrupando documentos...");
      const grouped = groupDocumentsByOriginalName(documents);
      const groupKeys = Object.keys(grouped);
      
      let processedCount = 0;
      let reconvertedPDFs = 0;
      let individualFiles = 0;
      
      for (const [originalName, docs] of Object.entries(grouped)) {
        processedCount++;
        setDownloadProgress(`Processando ${processedCount}/${groupKeys.length}: ${originalName}...`);
        
        if (docs.length > 1 && docs[0].mime_type?.includes('image')) {
          // É um PDF convertido em múltiplas páginas - reconverter para PDF único
          console.log(`Reconvertendo ${docs.length} páginas para ${originalName}.pdf`);
          
          const imageBlobs: Blob[] = [];
          const sortedDocs = docs.sort((a, b) => (a.pageNum || 0) - (b.pageNum || 0));
          
          for (const doc of sortedDocs) {
            const { data, error } = await supabase.storage
              .from("case-documents")
              .download(doc.file_path);
            
            if (error) throw error;
            imageBlobs.push(data);
          }
          
          // Reconverter imagens para PDF
          const pdfBlob = await reconvertImagesToPDF(imageBlobs, originalName);
          folder.file(`${originalName}.pdf`, pdfBlob);
          reconvertedPDFs++;
          
        } else {
          // Documento individual - adicionar como está
          const doc = docs[0];
          const { data, error } = await supabase.storage
            .from("case-documents")
            .download(doc.file_path);
          
          if (error) throw error;
          folder.file(doc.file_name, data);
          individualFiles++;
        }
      }
      
      // Gerar e baixar o ZIP
      setDownloadProgress("Compactando arquivos...");
      const blob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "✅ Download Concluído",
        description: `${groupKeys.length} documento(s) • ${reconvertedPDFs} PDF(s) reagrupados • ${individualFiles} arquivo(s) individuais`,
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
      setDownloadProgress("");
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress("Iniciando upload...");
    
    try {
      // Converter PDFs em imagens
      const processedFiles: File[] = [];
      let fileIndex = 0;
      
      for (const file of files) {
        fileIndex++;
        if (isPDF(file)) {
          setUploadProgress(`Convertendo ${file.name}...`);
          const { images } = await convertPDFToImages(file, 10);
          processedFiles.push(...images);
        } else {
          processedFiles.push(file);
        }
      }

      // Upload para o storage
      setUploadProgress(`Enviando ${processedFiles.length} arquivo(s)...`);
      const uploadPromises = processedFiles.map(async (file, idx) => {
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

      // FASE 2: Adicionar à fila de processamento
      setUploadProgress("Adicionando à fila de processamento...");
      
      // Verificar se já existe entrada na fila
      const { data: existingQueue } = await supabase
        .from('processing_queue')
        .select('id')
        .eq('case_id', caseId)
        .maybeSingle();

      if (existingQueue) {
        // Atualizar entrada existente
        const { error: queueError } = await supabase
          .from('processing_queue')
          .update({
            status: 'queued',
            updated_at: new Date().toISOString()
          })
          .eq('case_id', caseId);
        
        if (queueError) {
          console.error('Erro ao atualizar fila:', queueError);
          throw queueError;
        }
      } else {
        // Criar nova entrada
        const { error: queueError } = await supabase
          .from('processing_queue')
          .insert({
            case_id: caseId,
            status: 'queued'
          });

        if (queueError) {
          console.error('Erro ao adicionar à fila:', queueError);
          throw queueError;
        }
      }

      toast({
        title: "📥 Documentos adicionados à fila",
        description: `${uploadedDocs.length} documento(s) enviado(s). Processamento iniciará em breve.`,
      });

      // Recarregar lista imediatamente
      await loadDocuments();
      
      // Polling para verificar status na fila
      const pollInterval = setInterval(async () => {
        const { data: queue } = await supabase
          .from('processing_queue')
          .select('status, completed_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (queue?.status === 'completed') {
          clearInterval(pollInterval);
          await loadDocuments();
          if (onDocumentsChange) onDocumentsChange();
          toast({
            title: "✅ Processamento concluído!",
            description: "Dados extraídos com IA. Confira a aba de Informações Básicas.",
          });
        } else if (queue?.status === 'failed') {
          clearInterval(pollInterval);
          toast({
            title: "❌ Erro no processamento",
            description: "Tente enviar os documentos novamente.",
            variant: "destructive"
          });
        }
      }, 5000); // Verificar a cada 5 segundos
      
      // Timeout de segurança: parar polling após 3 minutos
      setTimeout(() => {
        clearInterval(pollInterval);
        console.log('[POLLING] Timeout atingido');
      }, 180000);

    } catch (error: any) {
      console.error("Erro ao enviar documentos:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReclassify = async () => {
    if (!caseId || documents.length === 0) {
      toast({
        title: "Sem documentos",
        description: "Adicione documentos antes de reclassificar.",
        variant: "destructive"
      });
      return;
    }
    
    setIsReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('reclassify-documents', {
        body: { caseId }
      });
      
      if (error) throw error;

      toast({
        title: "✅ Reclassificação concluída",
        description: data.message || `${data.reclassified} documento(s) reclassificado(s)`,
      });

      await loadDocuments();
      if (onDocumentsChange) onDocumentsChange();

    } catch (error: any) {
      console.error("Erro ao reclassificar:", error);
      toast({
        title: "Erro ao reclassificar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleReprocess = async () => {
    if (!caseId || documents.length === 0) {
      toast({
        title: "Sem documentos",
        description: "Adicione documentos antes de atualizar.",
        variant: "destructive"
      });
      return;
    }
    
    setIsReprocessing(true);
    try {
      const { error } = await supabase.functions.invoke('queue-validation', {
        body: { caseId }
      });
      
      if (error) throw error;

      toast({
        title: "📥 Documentos na fila",
        description: "Processamento será iniciado em breve. Você pode navegar livremente.",
      });

      const pollInterval = setInterval(async () => {
        const { data: queue } = await supabase
          .from('processing_queue')
          .select('status, completed_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (queue?.status === 'completed') {
          clearInterval(pollInterval);
          await loadDocuments();
          if (onDocumentsChange) onDocumentsChange();
          toast({
            title: "✅ Atualização concluída!",
            description: "Documentos reprocessados com sucesso.",
          });
        } else if (queue?.status === 'failed') {
          clearInterval(pollInterval);
          toast({
            title: "❌ Erro no processamento",
            description: "Tente novamente.",
            variant: "destructive"
          });
        }
      }, 5000);
      
      setTimeout(() => clearInterval(pollInterval), 180000);

    } catch (error: any) {
      console.error("Erro ao reprocessar:", error);
      toast({
        title: "Erro ao reprocessar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocumentTypeBadge = (type: string) => {
    const typeUpper = type?.toUpperCase() || "OUTROS";
    
    const types: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
      CERTIDAO_NASCIMENTO: { label: "Certidão", variant: "default" },
      CERTIDAO: { label: "Certidão", variant: "default" },
      IDENTIFICACAO: { label: "RG/CPF", variant: "secondary" },
      COMPROVANTE_RESIDENCIA: { label: "Comprovante", variant: "outline" },
      COMPROV_RESID: { label: "Comprovante", variant: "outline" },
      AUTODECLARACAO_RURAL: { label: "Rural", variant: "default" },
      DECL_SINDICAL: { label: "Rural", variant: "default" },
      DOCUMENTO_TERRA: { label: "Terra", variant: "secondary" },
      ITR: { label: "ITR", variant: "secondary" },
      CCIR: { label: "CCIR", variant: "secondary" },
      PROCESSO_ADMINISTRATIVO: { label: "Processo", variant: "destructive" },
      PROCURACAO: { label: "Procuração", variant: "outline" },
      CNIS: { label: "CNIS", variant: "default" },
      OUTROS: { label: "Outro", variant: "destructive", className: "bg-destructive/20 text-destructive border-destructive" },
      OUTRO: { label: "Outro", variant: "destructive", className: "bg-destructive/20 text-destructive border-destructive" },
    };

    const config = types[typeUpper] || types.OUTROS;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  // Agrupar páginas de PDFs usando a função de agrupamento
  const grouped = groupDocumentsByOriginalName(documents);
  
  const groupedDocuments = Object.entries(grouped).reduce((acc, [key, docs]) => {
    // Verificar se é um grupo de páginas (tem pageNum e originalName)
    const isPageGroup = docs.length > 1 && docs[0]?.pageNum !== undefined && docs[0]?.originalName;
    
    if (isPageGroup) {
      // É um grupo de páginas de PDF
      const originalName = docs[0].originalName;
      acc[key] = {
        isGroup: true,
        groupName: `${originalName}.pdf (${docs.length} páginas)`,
        docs: docs.sort((a, b) => (a.pageNum || 0) - (b.pageNum || 0))
      };
    } else {
      // Documento individual
      const doc = docs[0];
      if (doc?.id) {
        acc[doc.id] = {
          isGroup: false,
          docs: [doc]
        };
      }
    }
    return acc;
  }, {} as Record<string, { isGroup: boolean; groupName?: string; docs: any[] }>);

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

  // Calcular porcentagem de documentos "OUTROS"
  const outrosCount = documents.filter(doc => 
    doc.document_type?.toUpperCase() === 'OUTROS' || 
    doc.document_type?.toUpperCase() === 'OUTRO'
  ).length;
  const outrosPercentage = documents.length > 0 ? (outrosCount / documents.length) * 100 : 0;
  const hasHighOutrosPercentage = outrosPercentage > 30;

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
          {/* Alerta inteligente se muitos documentos são "OUTROS" */}
          {hasHighOutrosPercentage && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <strong>Atenção:</strong> {outrosCount} de {documents.length} documentos ({outrosPercentage.toFixed(0)}%) estão classificados como "OUTROS". 
                Clique em <strong>"🔄 Corrigir Classificação"</strong> para reclassificar automaticamente.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Documentos Enviados</h3>
              <Badge variant="outline" className="mt-1">{documents.length} arquivo(s)</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleReclassify}
                disabled={isReprocessing}
                variant={hasHighOutrosPercentage ? "default" : "outline"}
                className={hasHighOutrosPercentage ? "gap-2 bg-amber-500 hover:bg-amber-600 text-white" : "gap-2"}
                title={hasHighOutrosPercentage 
                  ? "⚠️ Recomendado: Muitos documentos estão como 'OUTROS'. Clique para reclassificar automaticamente." 
                  : "Corrigir classificação dos documentos baseado nos nomes dos arquivos"}
              >
                {isReprocessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reclassificando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    {hasHighOutrosPercentage ? "🔄 Corrigir Classificação" : "Reclassificar"}
                  </>
                )}
              </Button>
              <Button
                onClick={handleReprocess}
                disabled={isReprocessing}
                variant="outline"
                className="gap-2"
                title="Reprocessar documentos com IA"
              >
                {isReprocessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                  </>
                )}
              </Button>
              <Button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploadProgress || "Enviando..."}
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
                    {downloadProgress || "Preparando..."}
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

          <div className="space-y-3">
            {Object.entries(groupedDocuments).map(([key, group]) => {
              if (group.isGroup) {
                // Grupo de páginas de PDF
                return (
                  <div key={key} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{group.groupName}</span>
                        <Badge variant="outline">Convertido de PDF</Badge>
                      </div>
                    </div>
                    <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
                      {group.docs
                        .sort((a, b) => a.pageNum - b.pageNum)
                        .map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 rounded text-sm"
                          >
                            <span className="text-muted-foreground">{doc.file_name}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(doc)}
                                className="h-7 w-7 p-0"
                                title="Baixar"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteId(doc.id)}
                                className="h-7 w-7 p-0"
                                title="Excluir"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              } else {
                // Documento individual
                const doc = group.docs[0];
                return (
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
                );
              }
            })}
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
