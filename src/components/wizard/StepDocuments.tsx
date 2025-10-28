import { useState, useCallback } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CaseData } from "@/pages/NewCase";
import { toast } from "sonner";

interface StepDocumentsProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface DocumentWithType extends File {
  documentType?: string;
}

const DOCUMENT_TYPES = [
  // ⭐ DOCUMENTOS OBRIGATÓRIOS
  { value: "PROCURACAO", label: "⭐ Procuração (OBRIGATÓRIO)", required: true },
  { value: "CERTIDAO", label: "⭐ Certidão de Nascimento (OBRIGATÓRIO)", required: true },
  { value: "RG_MAE", label: "⭐ RG da Mãe (OBRIGATÓRIO)", required: true },
  { value: "CPF_MAE", label: "⭐ CPF da Mãe (OBRIGATÓRIO)", required: true },
  
  // DOCUMENTOS IMPORTANTES
  { value: "CNIS", label: "CNIS - Cadastro Nacional de Informações Sociais" },
  { value: "AUTODECLARACAO", label: "Autodeclaração Rural" },
  { value: "PROCESSO_ADM", label: "Processo Administrativo / Indeferimento" },
  
  // PROVAS RURAIS
  { value: "CAF", label: "CAF - Cadastro de Atividade Rural" },
  { value: "DAP", label: "DAP - Declaração de Aptidão ao PRONAF" },
  { value: "NOTA_PRODUTOR", label: "Nota/Bloco de Produtor Rural" },
  { value: "ITR", label: "ITR - Imposto Territorial Rural" },
  { value: "CCIR", label: "CCIR - Certificado de Cadastro de Imóvel Rural" },
  { value: "DECL_SINDICAL", label: "Declaração de Sindicato Rural" },
  
  // OUTROS
  { value: "COMPROV_RESID", label: "Comprovante de Residência" },
  { value: "FOTOS", label: "Fotos da Propriedade/Atividade Rural" },
  { value: "OUTROS", label: "Outros Documentos" },
];

export const StepDocuments = ({ data, updateData }: StepDocumentsProps) => {
  const [documents, setDocuments] = useState<DocumentWithType[]>(data.documents || []);
  const [documentTypes, setDocumentTypes] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files).filter(file => {
      // Validar tamanho (máx 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} excede o tamanho máximo de 20MB`);
        return false;
      }
      // Validar tipo
      const validTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name} não é um tipo de arquivo válido`);
        return false;
      }
      return true;
    });

    if (newFiles.length > 0) {
      const updatedDocs = [...documents, ...newFiles];
      setDocuments(updatedDocs);
      updateData({ documents: updatedDocs });
    }
  }, [documents, updateData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const removeDocument = (index: number) => {
    const newDocs = documents.filter((_, i) => i !== index);
    setDocuments(newDocs);
    updateData({ documents: newDocs });
    
    // Remover tipo também
    const newTypes = { ...documentTypes };
    delete newTypes[documents[index].name];
    setDocumentTypes(newTypes);
  };

  const updateDocumentType = (fileName: string, type: string) => {
    setDocumentTypes(prev => ({ ...prev, [fileName]: type }));
  };

  const getMissingRequiredDocs = () => {
    const types = Object.values(documentTypes);
    const missing: string[] = [];

    // SEMPRE OBRIGATÓRIOS
    if (!types.includes("PROCURACAO")) missing.push("Procuração");
    if (!types.includes("CERTIDAO")) missing.push("Certidão de Nascimento");
    if (!types.includes("RG_MAE")) missing.push("RG da Mãe");
    if (!types.includes("CPF_MAE")) missing.push("CPF da Mãe");

    // Específico por perfil
    if (data.profile === "especial") {
      if (!types.includes("AUTODECLARACAO")) missing.push("Autodeclaração Rural");
      const hasProvaRural = types.some(t => 
        ["CAF", "DAP", "ITR", "CCIR", "NOTA_PRODUTOR", "DECL_SINDICAL"].includes(t)
      );
      if (!hasProvaRural) missing.push("Pelo menos 1 prova material rural");
    } else {
      if (!types.includes("CNIS")) missing.push("CNIS");
    }

    // Recomendados
    if (!types.includes("PROCESSO_ADM")) missing.push("Processo Administrativo (recomendado)");

    return missing;
  };

  const missingDocs = getMissingRequiredDocs();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Upload de Documentos</h2>
        <p className="text-muted-foreground">
          Adicione os documentos probatórios do caso. Cada arquivo deve ter seu tipo identificado.
        </p>
      </div>

      {missingDocs.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Documentos obrigatórios faltantes:</strong>
            <ul className="list-disc list-inside mt-2">
              {missingDocs.map((doc, i) => (
                <li key={i}>{doc}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Drag & Drop Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium mb-2">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          PDF, JPG, PNG, WEBP (máx 20MB por arquivo)
        </p>
        <input
          type="file"
          id="fileInput"
          className="hidden"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById("fileInput")?.click()}
        >
          Selecionar Arquivos
        </Button>
      </div>

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">
            Documentos Adicionados ({documents.length})
          </h3>
          {documents.map((file, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-start gap-4">
                <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`type-${index}`}>
                      Tipo do Documento <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={documentTypes[file.name] || ""}
                      onValueChange={(value) => updateDocumentType(file.name, value)}
                    >
                      <SelectTrigger id={`type-${index}`}>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDocument(index)}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {documents.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhum documento adicionado ainda. Adicione pelo menos um documento para continuar.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
