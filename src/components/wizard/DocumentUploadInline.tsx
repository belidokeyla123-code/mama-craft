import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
      for (const file of files) {
        // Upload para storage
        const fileName = `${caseId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('case-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Registrar documento no banco
        const { error: insertError } = await supabase
          .from('documents')
          .insert([{
            case_id: caseId,
            file_name: file.name,
            file_path: fileName,
            document_type: (suggestedDocType || 'OUTROS') as any,
            mime_type: file.type,
            file_size: file.size
          }]);

        if (insertError) throw insertError;

        setUploadedFiles(prev => [...prev, file.name]);
      }

      // Processar com IA
      const { error: processError } = await supabase.functions.invoke('process-documents-with-ai', {
        body: { caseId }
      });

      if (processError) {
        console.error('Erro ao processar:', processError);
        toast.warning("Documentos enviados mas processamento falhou. Tente reprocessar.");
      } else {
        toast.success(`${files.length} documento(s) enviado(s) e processado(s)!`);
      }

      onUploadComplete?.();
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
          {suggestedDocType && (
            <p className="text-sm font-medium mb-2">
              Adicione: {suggestedDocType}
            </p>
          )}
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
