import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mapDocumentTypeToEnum, sanitizeFileName } from "@/lib/documentTypeMapper";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";

interface DocumentUploadInlineProps {
  caseId: string;
  suggestedDocType?: string;
  onUploadComplete?: () => void;
  // Props para customizar aparência do botão
  buttonText?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  showProgress?: boolean; // Se deve mostrar Card com progresso ou só botão
}

export const DocumentUploadInline = ({ 
  caseId, 
  suggestedDocType,
  onUploadComplete,
  buttonText = "📎 Adicionar Documento",
  buttonVariant = "outline",
  buttonSize = "default",
  disabled = false,
  showProgress = true
}: DocumentUploadInlineProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'converting' | 'processing' | 'done'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // ⚡ Polling otimizado para aguardar extrações
  const pollForExtractions = async (
    docIds: string[], 
    maxWaitMs: number = 10000 // ⚡ Reduzido de 30s para 10s
  ): Promise<boolean> => {
    const startTime = Date.now();
    const pollInterval = 500; // ⚡ Reduzido de 2s para 500ms
    
    setUploadState('processing');
    
    while (Date.now() - startTime < maxWaitMs) {
      const { data: extractions } = await supabase
        .from('extractions')
        .select('id')
        .in('document_id', docIds);
      
      // ✅ Todas as extrações criadas!
      if (extractions && extractions.length === docIds.length) {
        console.log('✅ Processamento concluído');
        setUploadState('done');
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.warn('⚠️ Timeout aguardando extrações');
    return false;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // 🔒 DEDUPLICAÇÃO: Verificar arquivos existentes antes de processar
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('file_name')
      .eq('case_id', caseId);
    
    const existingFileNames = new Set(existingDocs?.map(d => d.file_name) || []);
    const filesToProcess = files.filter(file => {
      if (existingFileNames.has(file.name)) {
        console.log(`⚠️ Arquivo ${file.name} já existe. Pulando...`);
        toast.warning(`${file.name} já foi enviado anteriormente`);
        return false;
      }
      return true;
    });

    if (filesToProcess.length === 0) {
      toast.info('Nenhum arquivo novo para processar');
      return;
    }

    console.log(`[UPLOAD] ${filesToProcess.length} arquivo(s) novo(s) será(ão) processado(s)`);

    setUploading(true);
    setUploadState('uploading');
    try {
      const insertedDocIds: string[] = [];
      let pdfDocId: string | null = null; // ID do PDF original
      
      for (const file of filesToProcess) {
        // 🔥 DETECTAR E CONVERTER PDFs (com retry e fallback)
        if (isPDF(file)) {
          console.log(`[PDF→PNG] Detectado PDF: ${file.name}`);
          setUploadState('converting');
          toast.info(`Convertendo ${file.name} em páginas...`);
          
          let conversionSuccess = false;
          let images: File[] = [];
          let originalFileName = '';

          // 🔄 RETRY: Tentar conversão até 2 vezes
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const result = await convertPDFToImages(file);
              images = result.images;
              originalFileName = result.originalFileName;
              console.log(`[PDF→PNG] ✅ ${images.length} páginas convertidas (tentativa ${attempt})`);
              conversionSuccess = true;
              break;
            } catch (error) {
              console.error(`[PDF→PNG] ❌ Tentativa ${attempt}/2 falhou:`, error);
              if (attempt === 2) {
                console.warn(`[PDF→PNG] ⚠️ Conversão falhou. Enviando PDF original...`);
                toast.warning(`Conversão de ${file.name} falhou. Enviando arquivo original.`);
                conversionSuccess = false;
              } else {
                console.log(`[PDF→PNG] Aguardando 1s antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }

          if (!conversionSuccess) {
            // 🔄 FALLBACK: Enviar PDF original sem conversão
            setUploadState('uploading');
            const timestamp = Date.now();
            const sanitizedFileName = sanitizeFileName(file.name);
            const filePath = `${caseId}/${timestamp}_${sanitizedFileName}`;

            const { error: uploadError } = await supabase.storage
              .from('case-documents')
              .upload(filePath, file);

            if (uploadError) {
              console.error(`[UPLOAD] Erro ao enviar PDF:`, uploadError);
              toast.error(`Erro ao enviar ${file.name}`);
              continue;
            }

            const mappedDocType = mapDocumentTypeToEnum(suggestedDocType || 'outro');
            const { data: docData, error: docError } = await supabase
              .from('documents')
              .insert({
                case_id: caseId,
                file_name: file.name,
                file_path: filePath,
                document_type: mappedDocType as any,
                mime_type: file.type,
                file_size: file.size,
              })
              .select()
              .single();

            if (docError) {
              console.error('[UPLOAD] Erro ao salvar documento:', docError);
              toast.error(`Erro ao salvar ${file.name}`);
              continue;
            }

            insertedDocIds.push(docData.id);
            console.log(`[UPLOAD] ✓ PDF original enviado: ${file.name}`);
            continue;
          }
          
          // Se chegou aqui, conversão foi bem sucedida
          setUploadState('uploading');
          console.log(`[PDF→PNG] ✅ ${images.length} páginas convertidas`);
            
          // Salvar PDF original primeiro (para referência)
          const sanitizedPdfName = sanitizeFileName(file.name);
          const pdfTimestamp = Date.now();
          const pdfFileName = `${caseId}/${pdfTimestamp}_${sanitizedPdfName}`;
          
          const { error: pdfUploadError } = await supabase.storage
            .from('case-documents')
            .upload(pdfFileName, file);

          if (pdfUploadError) throw pdfUploadError;
          
          // Registrar PDF no banco
          const mappedDocType = mapDocumentTypeToEnum(suggestedDocType || 'outro');
          const { data: pdfDoc, error: pdfInsertError } = await supabase
            .from('documents')
            .insert([{
              case_id: caseId,
              file_name: sanitizedPdfName,
              file_path: pdfFileName,
              document_type: mappedDocType as any,
              mime_type: 'application/pdf',
              file_size: file.size
            }])
            .select('id')
            .single();

          if (pdfInsertError) throw pdfInsertError;
          if (pdfDoc) pdfDocId = pdfDoc.id;
          
          setUploadState('uploading');
          
          // Fazer upload de cada PNG com progresso
          setProgress({ current: 0, total: images.length });
          
          for (let i = 0; i < images.length; i++) {
            const image = images[i];
            setProgress({ current: i + 1, total: images.length });
            
            const sanitizedImageName = sanitizeFileName(image.name);
            const imageTimestamp = Date.now();
            const imageFileName = `${caseId}/${imageTimestamp}_${sanitizedImageName}`;
            
            // Upload PNG para storage
            const { error: imageUploadError } = await supabase.storage
              .from('case-documents')
              .upload(imageFileName, image);

            if (imageUploadError) throw imageUploadError;

            // Registrar PNG no banco com parent_document_id
            const { data: imageDoc, error: imageInsertError } = await supabase
              .from('documents')
              .insert([{
                case_id: caseId,
                file_name: sanitizedImageName,
                file_path: imageFileName,
                document_type: mappedDocType as any,
                mime_type: 'image/png',
                file_size: image.size,
                parent_document_id: pdfDocId // Link para PDF original
              }])
              .select('id')
              .single();

            if (imageInsertError) throw imageInsertError;
            if (imageDoc) insertedDocIds.push(imageDoc.id);
          }
          
          setProgress({ current: 0, total: 0 });
          
          setUploadedFiles(prev => [...prev, `${originalFileName} (${images.length} páginas)`]);
          toast.success(`${images.length} páginas convertidas de ${originalFileName}`);
        } else {
          // Processar arquivos não-PDF normalmente
          const sanitizedName = sanitizeFileName(file.name);
          const timestamp = Date.now();
          const fileName = `${caseId}/${timestamp}_${sanitizedName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('case-documents')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const mappedDocType = mapDocumentTypeToEnum(suggestedDocType || 'outro');
          const { data: doc, error: insertError } = await supabase
            .from('documents')
            .insert([{
              case_id: caseId,
              file_name: sanitizedName,
              file_path: fileName,
              document_type: mappedDocType as any,
              mime_type: file.type || 'application/octet-stream',
              file_size: file.size
            }])
            .select('id')
            .single();

          if (insertError) throw insertError;
          if (doc) insertedDocIds.push(doc.id);
          setUploadedFiles(prev => [...prev, file.name]);
        }
      }

      // Processar com IA passando os IDs dos documentos
      const { error: processError } = await supabase.functions.invoke('process-documents-with-ai', {
        body: { 
          caseId,
          documentIds: insertedDocIds
        }
      });

      if (processError) {
        console.error('Erro ao processar:', processError);
        toast.warning("Documentos enviados mas processamento falhou. Tente reprocessar.");
      }

      // Aguardar extrações serem criadas antes de chamar callback
      if (insertedDocIds.length > 0) {
        const success = await pollForExtractions(insertedDocIds);
        
        // Trigger revalidação automática
        await supabase.functions.invoke('validate-case-documents', {
          body: { caseId: caseId }
        });
        
        // Force UI refresh
        window.dispatchEvent(new CustomEvent('revalidate-documents'));
        
        if (success) {
          toast.success('Documentos processados e validados!');
        } else {
          toast.warning('Processamento demorou mais que o esperado');
        }
        
        if (onUploadComplete) {
          onUploadComplete();
        }
      }
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast.error(error.message || 'Erro ao enviar documentos');
    } finally {
      setUploading(false);
      setUploadState('idle');
    }
  };

  return showProgress ? (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-300">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {uploadState === 'converting' && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Convertendo PDF em páginas PNG... 📄→🖼️
            </div>
          )}
          {uploadState === 'uploading' && progress.total > 0 && (
            <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando página {progress.current} de {progress.total}...
            </div>
          )}
          {uploadState === 'processing' && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extraindo informações com IA... 🤖
            </div>
          )}
          {uploadState === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
              <CheckCircle className="h-4 w-4" />
              ✅ Processamento concluído!
            </div>
          )}
          {uploadedFiles.length > 0 && uploadState === 'idle' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
              <CheckCircle className="h-4 w-4" />
              {uploadedFiles.length} arquivo(s) enviado(s)
            </div>
          )}
        </div>
        <div>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            onChange={handleFileUpload}
            className="hidden"
            id={`inline-upload-${caseId}`}
            disabled={uploading || disabled}
          />
          <label htmlFor={`inline-upload-${caseId}`}>
            <Button 
              variant={buttonVariant}
              size={buttonSize}
              className="gap-2" 
              asChild
              disabled={uploading || disabled}
            >
              <span>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {buttonText}
                  </>
                )}
              </span>
            </Button>
          </label>
        </div>
      </div>
    </Card>
  ) : (
    <div className="inline-flex">
      <input
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.docx"
        onChange={handleFileUpload}
        className="hidden"
        id={`inline-upload-${caseId}`}
        disabled={uploading || disabled}
      />
      <label htmlFor={`inline-upload-${caseId}`}>
        <Button 
          variant={buttonVariant}
          size={buttonSize}
          className="gap-2" 
          asChild
          disabled={uploading || disabled}
        >
          <span>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              buttonText
            )}
          </span>
        </Button>
      </label>
    </div>
  );
};
