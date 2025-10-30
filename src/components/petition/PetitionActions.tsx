import { Button } from "@/components/ui/button";
import { Download, Copy, FileText, CheckCheck } from "lucide-react";

interface PetitionActionsProps {
  petition: string;
  copied: boolean;
  onCopy: () => void;
  onDownloadDOCX: () => void;
  onDownloadPDF: () => void;
  onDownloadPlaceholders: () => void;
}

export const PetitionActions = ({
  petition,
  copied,
  onCopy,
  onDownloadDOCX,
  onDownloadPDF,
  onDownloadPlaceholders
}: PetitionActionsProps) => {
  if (!petition) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onCopy} variant="outline" className="gap-2">
        {copied ? (
          <>
            <CheckCheck className="h-4 w-4 text-green-600" />
            Copiado!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copiar
          </>
        )}
      </Button>
      
      <Button onClick={onDownloadDOCX} variant="outline" className="gap-2">
        <Download className="h-4 w-4" />
        Baixar DOCX
      </Button>
      
      <Button onClick={onDownloadPDF} variant="outline" className="gap-2">
        <Download className="h-4 w-4" />
        Baixar PDF
      </Button>
      
      <Button onClick={onDownloadPlaceholders} variant="outline" className="gap-2">
        <FileText className="h-4 w-4" />
        Baixar Lista
      </Button>
    </div>
  );
};
