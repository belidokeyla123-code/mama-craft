import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ManualReclassifyDialogProps {
  document: {
    id: string;
    file_name: string;
    document_type: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const DOCUMENT_TYPES = [
  { value: "procuracao", label: "Procuração" },
  { value: "certidao_nascimento", label: "Certidão de Nascimento" },
  { value: "identificacao", label: "RG/CPF" },
  { value: "autodeclaracao_rural", label: "Autodeclaração Rural" },
  { value: "cnis", label: "CNIS" },
  { value: "documento_terra", label: "Documento da Terra" },
  { value: "processo_administrativo", label: "Processo Administrativo" },
  { value: "comprovante_residencia", label: "Comprovante de Residência" },
  { value: "ficha_atendimento", label: "Ficha de Atendimento" },
  { value: "carteira_pescador", label: "Carteira de Pescador" },
  { value: "outro", label: "Outro" },
];

export const ManualReclassifyDialog = ({
  document,
  open,
  onOpenChange,
  onSuccess,
}: ManualReclassifyDialogProps) => {
  const [selectedType, setSelectedType] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!document) return;
    
    if (!selectedType) {
      toast.error("Selecione um tipo de documento");
      return;
    }

    if (selectedType === "outro" && !customName.trim()) {
      toast.error("Digite um nome para o documento");
      return;
    }

    setIsLoading(true);
    try {
      // Sempre usar o selectedType do enum
      // O customName será mostrado visualmente mas armazenado em outro campo se necessário
      const { error } = await supabase
        .from("documents")
        .update({ document_type: selectedType as any })
        .eq("id", document.id);

      if (error) throw error;

      const displayName = selectedType === "outro" ? customName.trim() : selectedType;
      toast.success(`Documento reclassificado como "${displayName}"`);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao reclassificar:", error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reclassificar Documento</DialogTitle>
          <DialogDescription>
            Altere a classificação do documento: <strong>{document?.file_name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo de Documento</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
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

          {selectedType === "outro" && (
            <div className="space-y-2">
              <Label>Nome do Documento</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Histórico Escolar, Ficha Funcional..."
              />
              <p className="text-xs text-muted-foreground">
                Digite um nome descritivo para este documento
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
