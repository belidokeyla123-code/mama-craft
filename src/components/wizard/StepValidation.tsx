import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StepValidationProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepValidation = ({ data, updateData }: StepValidationProps) => {
  // Mock - será substituído por lógica real
  const validationScore = data.validationScore || 0;
  const threshold = 7;
  const isSufficient = validationScore >= threshold;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Validação Documental</h2>
        <p className="text-muted-foreground">
          Verificando suficiência probatória antes da análise jurídica
        </p>
      </div>

      {/* Score Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Score de Suficiência</h3>
          <div className="flex items-center gap-2">
            {isSufficient ? (
              <CheckCircle className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-destructive" />
            )}
            <span className="text-2xl font-bold">
              {validationScore}/{threshold}
            </span>
          </div>
        </div>
        <Progress value={(validationScore / 10) * 100} className="h-3" />
        <p className="text-sm text-muted-foreground mt-2">
          {isSufficient
            ? "Documentação suficiente para prosseguir"
            : "Documentação insuficiente - adicione mais provas"}
        </p>
      </Card>

      {/* Status Alert */}
      {isSufficient ? (
        <Alert className="border-success">
          <CheckCircle className="h-4 w-4 text-success" />
          <AlertDescription>
            ✅ Documentação aprovada! Você pode prosseguir para a análise jurídica.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Documentação Insuficiente</strong>
            <p className="mt-2">
              Adicione mais documentos na etapa anterior antes de continuar.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="text-center text-sm text-muted-foreground">
        Esta é uma versão simplificada. A validação completa será implementada nas próximas fases.
      </div>
    </div>
  );
};
