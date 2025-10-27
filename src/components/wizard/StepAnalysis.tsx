import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface StepAnalysisProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepAnalysis = ({ data, updateData }: StepAnalysisProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Análise Jurídica</h2>
        <p className="text-muted-foreground">
          Análise automatizada dos requisitos legais
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg font-medium">Analisando documentação...</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            A IA está verificando qualidade de segurada, carência, RMI e valor da causa.
            <br />
            Será implementado nas próximas fases.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Perfil</p>
          <Badge variant="outline" className="text-base">
            {data.profile === "especial" ? "Segurada Especial" : "Segurada Urbana"}
          </Badge>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">SM Referência</p>
          <p className="text-lg font-semibold">
            R$ {data.salarioMinimoRef.toFixed(2)}
          </p>
        </Card>
      </div>
    </div>
  );
};
