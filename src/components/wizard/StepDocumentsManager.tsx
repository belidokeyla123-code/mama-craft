import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Trash2, Download, Eye, Loader2, FolderDown, Upload, Plus, RefreshCw, AlertTriangle, Pencil, ChevronDown, ChevronUp, Wand2, History, Check } from "lucide-react";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";
import { reconvertImagesToPDF, groupDocumentsByOriginalName } from "@/lib/imagesToPdf";
import { getDocTypeDisplayInfo } from "@/lib/documentNaming";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ManualReclassifyDialog } from "./ManualReclassifyDialog";
import { useCacheInvalidation } from "@/hooks/useCacheInvalidation";
import { useCaseOrchestration } from "@/hooks/useCaseOrchestration";
import { useTabSync } from "@/hooks/useTabSync";
import { UnfreezeConfirmDialog } from "./UnfreezeConfirmDialog";
import { useUnfreeze } from "@/hooks/useUnfreeze";

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

  // ✅ Sistema de orquestração para invalidar caches e disparar pipelines
  const { triggerFullPipeline } = useCaseOrchestration({ 
    caseId: caseId || '', 
    enabled: true 
  });

  const { unfreezeCase } = useUnfreeze();

  // Invalidar caches quando documentos mudarem
  useCacheInvalidation({
    caseId: caseId || '',
    triggerType: 'documents',
    watchFields: [documents.length],
  });

  // ✅ MUDANÇA 6: Sincronização em tempo real com evento de classificação
  useTabSync({
    caseId: caseId || '',
    events: ['documents-updated', 'processing-completed', 'documents-classified'],
    onSync: (detail) => {
      console.log('[StepDocumentsManager] 🔄 Documentos ou processamento atualizados');
      if (detail.timestamp && !isLoading) {
        loadDocuments();
        if (onDocumentsChange) onDocumentsChange();
        toast({
          title: "✅ Documentos atualizados",
          description: "Lista de documentos atualizada em tempo real.",
        });
      }
    }
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showUnfreezeDialog, setShowUnfreezeDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [reclassifyDoc, setReclassifyDoc] = useState<Document | null>(null);
  
  // 🎯 Estados para conversão em massa de PDFs (melhorados)
  const [isConvertingPDFs, setIsConvertingPDFs] = useState(false);
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({
    current: 0,
    total: 0,
    fileName: '',
    currentPage: 0,
    totalPages: 0,
    successful: 0,
    failed: 0,
    failedFiles: [] as string[],
    currentRetry: 0,
    maxRetries: 2,
    deletedFiles: 0
  });
  
  // 🆕 Estados para melhorias avançadas
  const [selectedPDFs, setSelectedPDFs] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [removeOriginalPDFs, setRemoveOriginalPDFs] = useState(false);
  const [previewPDF, setPreviewPDF] = useState<{
    doc: Document;
    previewUrl: string | null;
    isLoading: boolean;
  } | null>(null);
  const [conversionHistory, setConversionHistory] = useState<any[]>([]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

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
      
      // 🆕 DISPARAR PIPELINE COMPLETO
      await triggerFullPipeline('Documento removido');
      
      // ✅ Disparar evento global para sincronizar todas as abas
      window.dispatchEvent(new CustomEvent('documents-updated', {
        detail: { 
          caseId,
          timestamp: Date.now(),
          action: 'delete'
        }
      }));
      
      // Notificar componente pai
      if (onDocumentsChange) {
        console.log('[StepDocumentsManager] 🔄 Propagando onDocumentsChange para pai (delete)');
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
        
        // ✅ MUDANÇA 11: Detectar se é PDF original ou imagens de PDF convertido
        const isPdfOriginal = docs.length === 1 && docs[0].mime_type === 'application/pdf';
        const isConvertedPdf = docs.length > 1 && docs[0].mime_type?.includes('image');
        
        if (isConvertedPdf) {
          // É um PDF que foi convertido em múltiplas imagens - reconverter para PDF único
          console.log(`Reconvertendo ${docs.length} imagens para ${originalName}.pdf`);
          
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
          // Documento individual (PDF original ou outro tipo) - adicionar como está
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

  // ✅ Função para verificar duplicatas por nome de arquivo
  const checkForDuplicates = (newFiles: File[]) => {
    const duplicates: string[] = [];
    const existingFileNames = documents
      .map(d => d.file_name.toLowerCase().trim());
    
    newFiles.forEach(file => {
      const fileName = file.name.toLowerCase().trim();
      
      // ⚠️ APENAS bloquear se for EXATAMENTE o mesmo nome
      // (Permitir variações como "comprovante.pdf" e "comprovante (1).pdf")
      const exactMatch = existingFileNames.find(existing => existing === fileName);
      
      if (exactMatch) {
        duplicates.push(file.name);
        console.warn('[UPLOAD] ⚠️ Duplicata exata encontrada:', fileName);
      }
    });
    
    return duplicates;
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    console.log('[UPLOAD] 📤 Arquivos selecionados:', files.map(f => f.name));

    // Verificar se existe versão final antes de fazer upload
    const { data: finalDraft } = await supabase
      .from('drafts')
      .select('id, is_final')
      .eq('case_id', caseId)
      .eq('is_final', true)
      .maybeSingle();

    if (finalDraft) {
      console.log('[UPLOAD] ⚠️ Versão final detectada, solicitando confirmação');
      setPendingFiles(files);
      setShowUnfreezeDialog(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Verificar duplicatas sempre
    const duplicates = checkForDuplicates(files);
    if (duplicates.length > 0) {
      console.error('[UPLOAD] ⚠️ DUPLICATAS BLOQUEADAS:', duplicates);
      toast({
        title: "⚠️ Documentos duplicados detectados",
        description: `Já existe: ${duplicates.join(', ')}`,
        variant: "destructive",
        duration: 8000
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    console.log('[UPLOAD] ✅ Nenhuma duplicata encontrada, iniciando upload...');

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
            document_type: "outro",  // ✅ Aguardar IA classificar (será reclassificado automaticamente)
          })
          .select()
          .single();

        if (docError) throw docError;
        return doc;
      });

      const uploadedDocs = await Promise.all(uploadPromises);

      // 🆕 PROCESSAR IMEDIATAMENTE COM IA (SEM FILA)
      setUploadProgress("Processando com IA...");
      
      const documentIds = uploadedDocs.map(doc => doc.id);
      
      const { error: processError } = await supabase.functions.invoke('process-documents-with-ai', {
        body: { 
          caseId, 
          documentIds 
        }
      });

      if (processError) {
        console.error('Erro ao processar:', processError);
        toast({
          title: "⚠️ Processamento falhou",
          description: "Documentos enviados mas processamento com IA falhou. Tente reprocessar.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "✅ Documentos processados!",
          description: `${uploadedDocs.length} documento(s) analisado(s) com IA.`
        });
      }

      // ✅ MUDANÇA 5: Aguardar classificação da IA e recarregar interface
      setUploadProgress("Aguardando classificação...");
      await new Promise(resolve => setTimeout(resolve, 3000)); // Aguardar 3s
      
      // Recarregar lista para pegar classificações atualizadas
      await loadDocuments();
      
      // 🆕 DISPARAR PIPELINE COMPLETO (Validação → Análise → Jurisprudência → Tese)
      setUploadProgress("Sincronizando análise...");
      await triggerFullPipeline('Novos documentos adicionados');
      
      console.log('[UPLOAD] ✅ Upload concluído com sucesso:', uploadedDocs);
      
      toast({
        title: "🔄 Sincronização completa",
        description: "Validação, análise, jurisprudência e tese atualizadas!"
      });

      // ✅ Disparar eventos globais para sincronizar todas as abas
      window.dispatchEvent(new CustomEvent('documents-updated', {
        detail: { 
          caseId,
          timestamp: Date.now(),
          action: 'upload'
        }
      }));
      
      // 🆕 Disparar evento de classificação concluída
      window.dispatchEvent(new CustomEvent('documents-classified', {
        detail: { 
          caseId,
          timestamp: Date.now()
        }
      }));

      if (onDocumentsChange) {
        console.log('[StepDocumentsManager] 🔄 Propagando onDocumentsChange para pai (upload)');
        onDocumentsChange();
      }

    } catch (error: any) {
      console.error('[UPLOAD] ❌ ERRO NO UPLOAD:', error);
      toast({
        title: "❌ Erro no upload",
        description: error.message || "Erro desconhecido ao enviar documentos",
        variant: "destructive",
        duration: 8000
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
      const { data, error } = await supabase.functions.invoke('reclassify-all-documents', {
        body: { caseId }
      });
      
      if (error) throw error;

      toast({
        title: "✅ Reclassificação concluída",
        description: data.message || `${data.reclassified} documento(s) reclassificado(s)`,
      });

      await loadDocuments();
      if (onDocumentsChange) onDocumentsChange();
      
      // 🆕 DISPARAR PIPELINE COMPLETO após reclassificação
      await triggerFullPipeline('Documentos reclassificados');

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

      // ✅ Disparar evento global para sincronizar todas as abas
      window.dispatchEvent(new CustomEvent('documents-updated', {
        detail: { 
          caseId,
          timestamp: Date.now(),
          action: 'reprocess'
        }
      }));

      // ✅ FASE 4: POLLING REMOVIDO - Agora usamos eventos em tempo real via useTabSync
      // O evento 'processing-completed' será disparado automaticamente quando o processamento terminar
      // e o useTabSync irá recarregar os documentos automaticamente

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

  // 📊 Calcular estimativa de storage
  const calculateStorageEstimate = (pdfs: Document[]) => {
    const totalPDFSize = pdfs.reduce((sum, pdf) => sum + (pdf.file_size || 0), 0);
    const estimatedImageSize = totalPDFSize * 4; // Fator conservador de 4x
    
    return {
      pdfSize: totalPDFSize,
      estimatedImageSize,
      totalEstimate: totalPDFSize + estimatedImageSize,
      expansionFactor: 4,
      pdfSizeMB: (totalPDFSize / (1024 * 1024)).toFixed(2),
      estimatedImageSizeMB: (estimatedImageSize / (1024 * 1024)).toFixed(2),
      totalEstimateMB: ((totalPDFSize + estimatedImageSize) / (1024 * 1024)).toFixed(2)
    };
  };

  // Detectar PDFs não convertidos (sem imagens filhas)
  const getUnconvertedPDFs = () => {
    return documents.filter(doc => {
      // É um PDF original (não é página de outro PDF)
      const isPdfFile = doc.mime_type === 'application/pdf';
      if (!isPdfFile) return false;
      
      // Verificar se tem imagens filhas (já foi convertido)
      const hasChildren = documents.some(child => 
        child.file_name.includes(doc.file_name.replace('.pdf', ''))
      );
      
      return !hasChildren;
    });
  };
  
  // 👁️ Gerar preview da primeira página do PDF
  const generatePDFPreview = async (doc: Document) => {
    setPreviewPDF({ doc, previewUrl: null, isLoading: true });
    
    try {
      console.log(`[PREVIEW] Gerando preview de: ${doc.file_name}`);
      
      const { data: pdfBlob, error: downloadError } = await supabase.storage
        .from("case-documents")
        .download(doc.file_path);
      
      if (downloadError || !pdfBlob) {
        throw new Error(`Erro ao baixar PDF: ${downloadError?.message}`);
      }
      
      const pdfFile = new File([pdfBlob], doc.file_name, { type: 'application/pdf' });
      const { images } = await convertPDFToImages(pdfFile, 1);
      
      if (images.length === 0) {
        throw new Error("Nenhuma imagem gerada");
      }
      
      const previewUrl = URL.createObjectURL(images[0]);
      setPreviewPDF({ doc, previewUrl, isLoading: false });
      
    } catch (error: any) {
      console.error(`[PREVIEW] Erro:`, error);
      toast({
        title: "Erro ao gerar preview",
        description: error.message,
        variant: "destructive"
      });
      setPreviewPDF(null);
    }
  };
  
  // 🔄 Conversão com retry automático
  const convertPDFWithRetry = async (
    pdfDoc: Document,
    retryCount: number = 0
  ): Promise<{ success: boolean; error?: string; images?: File[]; totalSize?: number }> => {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;
    
    try {
      const { data: pdfBlob, error: downloadError } = await supabase.storage
        .from("case-documents")
        .download(pdfDoc.file_path);
      
      if (downloadError || !pdfBlob) {
        throw new Error(`Erro ao baixar: ${downloadError?.message}`);
      }
      
      const pdfFile = new File([pdfBlob], pdfDoc.file_name, {
        type: 'application/pdf'
      });
      
      const { images } = await convertPDFToImages(pdfFile);
      
      if (images.length === 0) {
        throw new Error("Nenhuma imagem foi gerada");
      }
      
      const totalSize = images.reduce((sum, img) => sum + img.size, 0);
      
      return { success: true, images, totalSize };
      
    } catch (error: any) {
      console.error(`[CONVERT-RETRY] Tentativa ${retryCount + 1} falhou:`, error);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`[CONVERT-RETRY] Aguardando ${RETRY_DELAY_MS}ms antes de retry...`);
        
        setConversionProgress(prev => ({
          ...prev,
          currentRetry: retryCount + 1,
          maxRetries: MAX_RETRIES
        }));
        
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return convertPDFWithRetry(pdfDoc, retryCount + 1);
      }
      
      return { success: false, error: error.message };
    }
  };
  
  // 📝 Carregar histórico de conversões
  const loadConversionHistory = async () => {
    if (!caseId) return;
    
    try {
      const { data, error } = await supabase
        .from('document_conversions')
        .select(`
          *,
          documents!document_conversions_document_id_fkey(file_name)
        `)
        .eq('case_id', caseId)
        .order('started_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      setConversionHistory(data || []);
    } catch (error: any) {
      console.error('[HISTORY] Erro ao carregar:', error);
    }
  };
  
  // Carregar histórico quando montar o componente
  useEffect(() => {
    if (caseId) {
      loadConversionHistory();
    }
  }, [caseId]);

  const unconvertedPDFs = getUnconvertedPDFs();

  // ✅ Função de conversão em massa de PDFs antigos - VERSÃO MELHORADA
  const convertOldPDFsToImages = async () => {
    // Filtrar PDFs: se selectedPDFs fornecido, usar só esses, senão todos
    let pdfsToConvert = unconvertedPDFs;
    
    if (selectMode && selectedPDFs.size > 0) {
      pdfsToConvert = pdfsToConvert.filter(pdf => selectedPDFs.has(pdf.id));
    }
    
    if (pdfsToConvert.length === 0) {
      toast({
        title: "Nenhum PDF para converter",
        description: "Todos os PDFs já foram convertidos.",
      });
      return;
    }

    setIsConvertingPDFs(true);
    setShowConversionDialog(false); // Fechar dialog de confirmação
    setConversionProgress({
      current: 0,
      total: pdfsToConvert.length,
      fileName: '',
      currentPage: 0,
      totalPages: 0,
      successful: 0,
      failed: 0,
      failedFiles: [],
      currentRetry: 0,
      maxRetries: 2,
      deletedFiles: 0
    });

    const results = {
      successful: 0,
      failed: 0,
      failedFiles: [] as string[]
    };

    for (let i = 0; i < pdfsToConvert.length; i++) {
      const pdfDoc = pdfsToConvert[i];
      
      setConversionProgress(prev => ({
        ...prev,
        current: i + 1,
        fileName: pdfDoc.file_name,
        currentPage: 0,
        totalPages: 0,
        currentRetry: 0
      }));
      
      // 📝 Criar log inicial
      const startTime = Date.now();
      let logId: string | null = null;
      
      try {
        const { data: logEntry, error: logError } = await supabase
          .from('document_conversions')
          .insert({
            case_id: caseId,
            document_id: pdfDoc.id,
            status: 'processing',
            original_size_bytes: pdfDoc.file_size || 0
          })
          .select()
          .single();
        
        if (!logError && logEntry) {
          logId = logEntry.id;
        }
      } catch (logError) {
        console.error('[LOG] Erro ao criar log:', logError);
      }

      try {
        console.log(`[CONVERT] PDF ${i + 1}/${pdfsToConvert.length}: ${pdfDoc.file_name}`);
        
        // 🔄 Usar conversão com retry
        const conversionResult = await convertPDFWithRetry(pdfDoc);
        
        if (!conversionResult.success) {
          throw new Error(conversionResult.error || "Falha na conversão");
        }
        
        const { images, totalSize } = conversionResult;
        
        if (!images || images.length === 0) {
          throw new Error("Nenhuma imagem foi gerada");
        }
        
        console.log(`[CONVERT] ✅ ${images.length} página(s) convertida(s)`);
        
        setConversionProgress(prev => ({
          ...prev,
          totalPages: images.length
        }));

        // 4. Upload de cada imagem
        for (let pageIdx = 0; pageIdx < images.length; pageIdx++) {
          const imageFile = images[pageIdx];
          
          setConversionProgress(prev => ({
            ...prev,
            currentPage: pageIdx + 1
          }));

          const fileExt = imageFile.name.split('.').pop();
          const timestamp = Date.now();
          const randomId = Math.random().toString(36).substring(7);
          const fileName = `${caseName || `caso_${caseId.slice(0, 8)}`}/${timestamp}_${randomId}.${fileExt}`;

          // Upload para storage
          const { error: uploadError } = await supabase.storage
            .from("case-documents")
            .upload(fileName, imageFile);

          if (uploadError) throw uploadError;

          // Salvar no banco com parent_document_id
          const { error: docError } = await supabase
            .from("documents")
            .insert([{
              case_id: caseId,
              file_name: imageFile.name,
              file_path: fileName,
              file_size: imageFile.size,
              mime_type: imageFile.type,
              document_type: (pdfDoc.document_type || "outro") as any,
              parent_document_id: pdfDoc.id
            }]);

          if (docError) throw docError;
        }

        results.successful++;
        
        // 📝 Variável para rastrear arquivos deletados
        let deletedFilesCount = 0;
        
        // 📝 Atualizar log: SUCESSO
        if (logId) {
          const processingTime = Date.now() - startTime;
            
            await supabase
            .from('document_conversions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              pages_converted: images!.length,
              images_created: images!.length,
              processing_time_ms: processingTime,
              converted_size_bytes: totalSize || 0
            })
            .eq('id', logId);
        }
        
        // 🗑️ Remover PDF original E suas imagens filhas se solicitado
        if (removeOriginalPDFs) {
          try {
            console.log(`[DELETE] Removendo PDF e imagens filhas: ${pdfDoc.file_name}`);
            
            // 1️⃣ PRIMEIRO: Buscar TODAS as imagens filhas no banco
            const { data: childImages, error: fetchError } = await supabase
              .from("documents")
              .select("file_path")
              .eq("parent_document_id", pdfDoc.id);
            
            if (fetchError) {
              console.error('[DELETE] Erro ao buscar imagens filhas:', fetchError);
              throw fetchError;
            }
            
            // 2️⃣ SEGUNDO: Montar array de caminhos para deletar do storage
            const filesToDelete = [
              pdfDoc.file_path, // PDF original
              ...(childImages || []).map(img => img.file_path) // Todas as imagens
            ];
            
            console.log(`[DELETE] Deletando ${filesToDelete.length} arquivo(s) do storage`);
            
            // 3️⃣ TERCEIRO: Deletar TODOS os arquivos do storage
            const { error: storageError } = await supabase.storage
              .from("case-documents")
              .remove(filesToDelete);
            
            if (storageError) {
              console.error('[DELETE] Erro ao remover do storage:', storageError);
              throw storageError;
            }
            
            console.log(`[DELETE] ✅ ${filesToDelete.length} arquivo(s) removido(s) do storage`);
            
            // 4️⃣ POR ÚLTIMO: Deletar do banco (CASCADE cuidará dos registros)
            const { error: dbError } = await supabase
              .from("documents")
              .delete()
              .eq("id", pdfDoc.id);
            
            if (dbError) {
              console.error('[DELETE] Erro ao remover do banco:', dbError);
              throw dbError;
            }
            
            deletedFilesCount = filesToDelete.length;
            console.log(`[DELETE] ✅ PDF original e ${childImages?.length || 0} imagem(ns) removidos completamente`);
            
            // Atualizar contador global de arquivos deletados
            setConversionProgress(prev => ({
              ...prev,
              deletedFiles: (prev.deletedFiles || 0) + deletedFilesCount
            }));
            
          } catch (deleteError) {
            console.error('[DELETE] ❌ Erro ao remover PDF e imagens:', deleteError);
            // Continuar processamento mesmo se houver erro na exclusão
          }
        }
        
      } catch (error: any) {
        console.error(`Erro ao converter ${pdfDoc.file_name}:`, error);
        results.failed++;
        results.failedFiles.push(pdfDoc.file_name);
        
        // 📝 Atualizar log: FALHA
        if (logId) {
          const processingTime = Date.now() - startTime;
          await supabase
            .from('document_conversions')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: error.message,
              processing_time_ms: processingTime
            })
            .eq('id', logId);
        }
      }
    }

    // Atualizar progresso final
    setConversionProgress(prev => ({
      ...prev,
      successful: results.successful,
      failed: results.failed,
      failedFiles: results.failedFiles
    }));

    // Recarregar documentos e histórico
    await loadDocuments();
    await loadConversionHistory();
    
    // Limpar seleção
    setSelectedPDFs(new Set());
    setSelectMode(false);

    // Disparar pipeline completo
    await triggerFullPipeline('PDFs convertidos em massa');

    // Disparar evento global
    window.dispatchEvent(new CustomEvent('documents-updated', {
      detail: { 
        caseId,
        timestamp: Date.now(),
        action: 'bulk-pdf-conversion'
      }
    }));

    if (onDocumentsChange) onDocumentsChange();

    // Mostrar resultado final
    if (results.successful > 0 && results.failed === 0) {
      toast({
        title: "✅ Conversão concluída!",
        description: `${results.successful} PDF(s) convertido(s)${removeOriginalPDFs ? ' e originais removidos' : ''}`,
      });
    } else if (results.successful > 0 && results.failed > 0) {
      toast({
        title: "⚠️ Conversão parcial",
        description: `${results.successful} sucesso, ${results.failed} falha(s): ${results.failedFiles.slice(0, 2).join(', ')}${results.failedFiles.length > 2 ? '...' : ''}`,
        variant: "destructive"
      });
    } else {
      toast({
        title: "❌ Conversão falhou",
        description: `Todos os ${results.failed} PDF(s) falharam`,
        variant: "destructive"
      });
    }

    setIsConvertingPDFs(false);
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Documentos Enviados</h3>
                  <Badge variant="outline" className="mt-1">{documents.length} arquivo(s)</Badge>
                </div>
                
                {/* Badge de alerta para PDFs não convertidos */}
                {unconvertedPDFs.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {unconvertedPDFs.length} PDF(s) precisam conversão
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {/* Botão Ver Histórico */}
                {conversionHistory.length > 0 && (
                  <Button
                    onClick={() => setShowHistoryDialog(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <History className="h-4 w-4" />
                    Histórico ({conversionHistory.length})
                  </Button>
                )}
                
                {/* Botão Converter PDFs */}
                {unconvertedPDFs.length > 0 && (
                  <Button
                    onClick={() => setShowConversionDialog(true)}
                    disabled={isConvertingPDFs}
                    variant="outline"
                    className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                  >
                    {isConvertingPDFs ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Convertendo...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        Converter PDFs
                      </>
                    )}
                  </Button>
                )}
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
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-300">
                          ✓ Convertido
                        </Badge>
                        {(() => {
                          const firstDoc = group.docs[0];
                          const typeInfo = getDocTypeDisplayInfo(firstDoc?.document_type || 'outro');
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${typeInfo.color}`}>
                              <span>{typeInfo.icon}</span>
                              <span>{typeInfo.label}</span>
                            </span>
                          );
                        })()}
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
                              {/* NOVO: Botão de editar se for "OUTRO" */}
                              {(doc.document_type?.toUpperCase() === 'OUTRO' || 
                                doc.document_type?.toUpperCase() === 'OUTROS') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setReclassifyDoc(doc)}
                                  title="Editar classificação"
                                  className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              
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
                const isPdfNeedsConversion = doc.mime_type === 'application/pdf' && 
                  !documents.some(child => child.file_name.includes(doc.file_name.replace('.pdf', '')));
                
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${isPdfNeedsConversion ? 'border-amber-300 bg-amber-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{doc.file_name}</p>
                          {isPdfNeedsConversion && (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              Requer Conversão
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>{new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}</span>
                          <span>•</span>
                          {(() => {
                            const typeInfo = getDocTypeDisplayInfo(doc.document_type || 'outro');
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${typeInfo.color}`}>
                                <span>{typeInfo.icon}</span>
                                <span>{typeInfo.label}</span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {/* Botão de editar se for "OUTRO" */}
                      {(doc.document_type?.toUpperCase() === 'OUTRO' || doc.document_type?.toUpperCase() === 'OUTROS') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setReclassifyDoc(doc)}
                          title="Editar classificação"
                          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                       )}
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          const { data, error } = await supabase.functions.invoke(
                            'analyze-single-document',
                            {
                              body: {
                                documentId: doc.id,
                                caseId,
                                forceReprocess: true
                              }
                            }
                          );
                          
                          // ⚠️ Se for PDF, mostrar mensagem específica
                          if (data?.isPDF || error?.message?.includes('PDFs devem ser convertidos')) {
                            toast({
                              title: "❌ PDF detectado",
                              description: "Converta PDFs para imagens primeiro antes de reprocessar",
                              variant: "destructive"
                            });
                            return;
                          }
                          
                          if (!error && data?.success) {
                            toast({
                              title: "✅ Documento reprocessado",
                              description: data.newFileName || "Análise atualizada"
                            });
                            await loadDocuments();
                          } else {
                            toast({
                              title: "❌ Erro ao reprocessar",
                              description: error?.message || "Tente novamente",
                              variant: "destructive"
                            });
                          }
                        }}
                        title="Reprocessar este documento com IA"
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      
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

      <ManualReclassifyDialog
        document={reclassifyDoc}
        open={!!reclassifyDoc}
        onOpenChange={(open) => !open && setReclassifyDoc(null)}
        onSuccess={async () => {
          await loadDocuments();
          if (onDocumentsChange) onDocumentsChange();
        }}
      />

      {/* Diálogo de Confirmação para Descongelar */}
      <UnfreezeConfirmDialog
        open={showUnfreezeDialog}
        onOpenChange={setShowUnfreezeDialog}
        action="fazer upload de novos documentos"
        onConfirm={async () => {
          const success = await unfreezeCase(caseId);
          if (success && pendingFiles.length > 0) {
            setShowUnfreezeDialog(false);
            // Simular o evento de file select com os arquivos pendentes
            const dataTransfer = new DataTransfer();
            pendingFiles.forEach(file => dataTransfer.items.add(file));
            const fakeEvent = {
              target: { files: dataTransfer.files },
            } as React.ChangeEvent<HTMLInputElement>;
            
            await handleFileSelect(fakeEvent);
            setPendingFiles([]);
          }
        }}
      />

      {/* Dialog de Conversão em Massa de PDFs - VERSÃO MELHORADA */}
      <AlertDialog 
        open={showConversionDialog && !isConvertingPDFs} 
        onOpenChange={setShowConversionDialog}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Converter PDFs Antigos para Imagens</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                <strong>{unconvertedPDFs.length} PDF(s)</strong> precisam ser convertidos para imagens antes de serem processados pela IA.
              </p>
              
              {/* 📊 Estimativa de Storage */}
              {unconvertedPDFs.length > 0 && (() => {
                const estimate = calculateStorageEstimate(unconvertedPDFs);
                return (
                  <div className="bg-blue-50 p-4 rounded-md space-y-2 text-sm">
                    <p className="font-semibold text-blue-900">📊 Estimativa de Armazenamento:</p>
                    <div className="space-y-1 text-blue-800">
                      <p>• PDFs originais: <strong>{estimate.pdfSizeMB} MB</strong></p>
                      <p>• Imagens geradas: <strong>~{estimate.estimatedImageSizeMB} MB</strong> (estimado)</p>
                      <p>• Total após: <strong>~{estimate.totalEstimateMB} MB</strong></p>
                      {parseFloat(estimate.totalEstimateMB) > 100 && (
                        <p className="text-amber-600 font-medium">⚠️ Expansão de {estimate.expansionFactor}x no storage</p>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              <div className="bg-muted p-4 rounded-md space-y-3 text-sm">
                <p className="font-semibold">O que será feito:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Cada PDF será convertido em imagens (1 por página)</li>
                  <li>Imagens serão vinculadas ao PDF original via banco</li>
                  <li>Até 3 tentativas automáticas em caso de falha</li>
                  <li>Log completo de cada conversão salvo no histórico</li>
                  <li>Tempo estimado: ~{unconvertedPDFs.length * 10}s</li>
                </ul>
              </div>
              
              {/* 🗑️ Opção de Remover PDFs Originais */}
              <div className="flex items-start space-x-3 p-3 bg-amber-50 rounded border border-amber-200">
                <Checkbox 
                  id="remove-originals"
                  checked={removeOriginalPDFs}
                  onCheckedChange={(checked) => setRemoveOriginalPDFs(!!checked)}
                  className="mt-1"
                />
                <label htmlFor="remove-originals" className="text-sm cursor-pointer flex-1">
                  <span className="font-medium">Remover PDFs originais após conversão bem-sucedida</span>
                  <span className="text-xs text-amber-700 block mt-1">
                    ⚠️ Esta ação não pode ser desfeita. Economiza espaço de storage mantendo apenas as imagens processáveis.
                  </span>
                </label>
              </div>
              
              {removeOriginalPDFs && (
                <Alert className="bg-destructive/10 border-destructive/50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    ⚠️ <strong>Esta ação deletará permanentemente:</strong>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                      <li>Os PDFs originais ({unconvertedPDFs.length} arquivo{unconvertedPDFs.length !== 1 ? 's' : ''})</li>
                      <li>Todas as imagens convertidas (estimado: ~{unconvertedPDFs.length * 5} imagem{unconvertedPDFs.length * 5 !== 1 ? 'ns' : ''})</li>
                      <li><strong>Total: ~{unconvertedPDFs.length * 6} arquivo(s) serão removidos do storage</strong></li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Este processo não pode ser interrompido. Certifique-se de manter a página aberta.
                </AlertDescription>
              </Alert>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRemoveOriginalPDFs(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={convertOldPDFsToImages}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Iniciar Conversão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Progresso da Conversão - COM RETRY */}
      <AlertDialog open={isConvertingPDFs}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              Convertendo PDFs...
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso</span>
                  <span className="font-medium">
                    {conversionProgress.current}/{conversionProgress.total} PDFs
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-amber-600 h-full transition-all duration-300"
                    style={{ 
                      width: `${(conversionProgress.current / conversionProgress.total) * 100}%` 
                    }}
                  />
                </div>
              </div>

              {conversionProgress.fileName && (
                <div className="bg-muted p-3 rounded-md space-y-2">
                  <p className="text-sm font-medium truncate">
                    📄 {conversionProgress.fileName}
                  </p>
                  {conversionProgress.totalPages > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Página {conversionProgress.currentPage}/{conversionProgress.totalPages}
                    </p>
                  )}
                  {conversionProgress.currentRetry > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Tentativa {conversionProgress.currentRetry + 1} de {conversionProgress.maxRetries + 1}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-600" />
                  {conversionProgress.successful} sucesso
                </span>
                {conversionProgress.failed > 0 && (
                  <span className="text-destructive">❌ {conversionProgress.failed} falhas</span>
                )}
              </div>
              
              {removeOriginalPDFs && conversionProgress.deletedFiles > 0 && (
                <div className="text-xs text-muted-foreground">
                  🗑️ {conversionProgress.deletedFiles} arquivo(s) deletado(s) do storage
                </div>
              )}

              {conversionProgress.failedFiles.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Falhas:</strong> {conversionProgress.failedFiles.slice(0, 3).join(', ')}
                    {conversionProgress.failedFiles.length > 3 && ` e mais ${conversionProgress.failedFiles.length - 3}`}
                  </AlertDescription>
                </Alert>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {conversionProgress.current === conversionProgress.total && (
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => {
                setShowConversionDialog(false);
                setIsConvertingPDFs(false);
                setRemoveOriginalPDFs(false);
              }}>
                Concluir
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
      
      {/* 📊 Dialog de Histórico de Conversões */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Conversões de PDFs
            </DialogTitle>
            <DialogDescription>
              Registro completo de todas as conversões realizadas neste caso
            </DialogDescription>
          </DialogHeader>
          
          {conversionHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma conversão realizada ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PDF</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead className="text-right">Páginas</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionHistory.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium truncate max-w-[200px]">
                      {log.documents?.file_name || 'N/A'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.started_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {log.pages_converted || 0}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {log.processing_time_ms 
                        ? `${(log.processing_time_ms / 1000).toFixed(1)}s`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {log.status === 'completed' && (
                        <Badge variant="default" className="bg-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Sucesso
                        </Badge>
                      )}
                      {log.status === 'failed' && (
                        <Badge variant="destructive">
                          ❌ Falhou
                        </Badge>
                      )}
                      {log.status === 'processing' && (
                        <Badge variant="outline">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Processando
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 👁️ Dialog de Preview do PDF */}
      <Dialog 
        open={!!previewPDF} 
        onOpenChange={(open) => {
          if (!open && previewPDF?.previewUrl) {
            URL.revokeObjectURL(previewPDF.previewUrl);
          }
          setPreviewPDF(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview: {previewPDF?.doc.file_name}</DialogTitle>
            <DialogDescription>
              Primeira página do PDF
            </DialogDescription>
          </DialogHeader>
          
          {previewPDF?.isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Gerando preview...</span>
            </div>
          ) : previewPDF?.previewUrl ? (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-muted/30">
                <img 
                  src={previewPDF.previewUrl} 
                  alt="Preview"
                  className="w-full object-contain max-h-[60vh]"
                />
              </div>
              
              <DialogFooter className="gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (previewPDF?.previewUrl) {
                      URL.revokeObjectURL(previewPDF.previewUrl);
                    }
                    setPreviewPDF(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    if (previewPDF?.doc) {
                      setSelectedPDFs(new Set([previewPDF.doc.id]));
                      setSelectMode(true);
                    }
                    if (previewPDF?.previewUrl) {
                      URL.revokeObjectURL(previewPDF.previewUrl);
                    }
                    setPreviewPDF(null);
                    setShowConversionDialog(true);
                  }}
                  className="gap-2"
                >
                  <Wand2 className="h-4 w-4" />
                  Converter Este PDF
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
