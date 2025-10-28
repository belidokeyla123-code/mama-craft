import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mapDocumentTypeToEnum, sanitizeFileName } from "@/lib/documentTypeMapper";

interface DocumentUploadInlineProps {
  caseId: string;
  suggestedDocType?: string;
  onUploadComplete?: () => void;
}

export const DocumentUploadInline = ({ 
  caseId, 
  suggestedDocType,
  onUploadComplete 
}: DocumentUploadInlineProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const insertedDocIds: string[] = [];
      
      for (const file of files) {
        // Sanitizar nome do arquivo
        const sanitizedName = sanitizeFileName(file.name);
        const timestamp = Date.now();
        const fileName = `${caseId}/${timestamp}_${sanitizedName}`;
        
        // Upload para storage
        const { error: uploadError } = await supabase.storage
          .from('case-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Mapear tipo de documento para enum válido
        const mappedDocType = mapDocumentTypeToEnum(suggestedDocType || 'outro');

        // Registrar documento no banco e capturar ID
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

      // Aguardar processamento antes de chamar callback
      if (onUploadComplete) {
        setTimeout(() => {
          onUploadComplete();
        }, 5000);
      }
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast.error(error.message || 'Erro ao enviar documentos');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-300">
      <div className="flex items-center justify-between">
      <div className="flex-1">
          {uploadedFiles.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
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
            disabled={uploading}
          />
          <label htmlFor={`inline-upload-${caseId}`}>
            <Button 
              variant="outline" 
              className="gap-2" 
              asChild
              disabled={uploading}
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
                    Adicionar Documento
                  </>
                )}
              </span>
            </Button>
          </label>
        </div>
      </div>
    </Card>
  );
};
