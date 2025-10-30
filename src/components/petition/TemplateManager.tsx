import { Button } from "@/components/ui/button";
import { Upload, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface TemplateManagerProps {
  templateFile: File | null;
  onUpload: (file: File) => void;
  onDownload: () => void;
  onRemove: () => void;
}

export const TemplateManager = ({ 
  templateFile, 
  onUpload, 
  onDownload, 
  onRemove 
}: TemplateManagerProps) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.docx')) {
        toast.error('Apenas arquivos .docx são permitidos');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Arquivo muito grande (máximo 5MB)');
        return;
      }
      onUpload(file);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!templateFile ? (
        <div>
          <input
            type="file"
            accept=".docx"
            onChange={handleFileSelect}
            className="hidden"
            id="template-upload"
          />
          <label htmlFor="template-upload">
            <Button variant="outline" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                Enviar Modelo
              </span>
            </Button>
          </label>
        </div>
      ) : (
        <>
          <Button 
            onClick={onDownload}
            variant="outline" 
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar Modelo
          </Button>
          <Button 
            onClick={onRemove}
            variant="outline" 
            size="icon"
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};
