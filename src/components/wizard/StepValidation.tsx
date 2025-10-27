import { useState, useEffect } from "react";
import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StepValidationProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepValidation = ({ data, updateData }: StepValidationProps) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (data.caseId && !validationResult) {
      handleValidate();
    }
  }, [data.caseId]);

  const handleValidate = async () => {
    if (!data.caseId) return;
    
    setIsValidating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('validate-case-documents', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429') || result?.code === 'RATE_LIMIT') {
          toast({
            title: "Rate limit atingido",
            description: "Muitas requisições. Aguarde 30 segundos e tente novamente.",
            variant: "destructive",
          });
          return;
        }
        if (error.message?.includes('402') || result?.code === 'NO_CREDITS') {
          toast({
            title: "Créditos esgotados",
            description: "Adicione mais créditos Lovable AI em Settings.",
            variant: "destructive",
          });
          return;
        }
        if (error.message?.includes('408') || result?.code === 'TIMEOUT') {
          toast({
            title: "Timeout",
            description: "A validação demorou muito. Tente novamente.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      setValidationResult(result);
      
      toast({
        title: result.is_sufficient ? "Validação aprovada" : "Validação pendente",
        description: result.is_sufficient 
          ? "Documentação suficiente para prosseguir" 
          : "Adicione mais documentos",
      });
    } catch (error: any) {
      console.error('Erro na validação:', error);
      toast({
        title: "Erro na validação",
        description: error.message || "Erro desconhecido. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  if (isValidating || !validationResult) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Validando documentação...</p>
            <p className="text-sm text-muted-foreground">
              Analisando {data.caseId ? 'seus documentos' : 'caso'} com IA...
            </p>
            <p className="text-xs text-muted-foreground">Isso pode levar até 45 segundos</p>
          </div>
        </div>
      </Card>
    );
  }

  const { score, is_sufficient, checklist, missing_docs, recommendations } = validationResult;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Score de Suficiência</h3>
          <div className="flex items-center gap-2">
            {is_sufficient ? (
              <CheckCircle className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-destructive" />
            )}
            <span className="text-2xl font-bold">{score}/10</span>
          </div>
        </div>
        <Progress value={score * 10} className="h-3" />
      </Card>

      {checklist && checklist.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Checklist Documental</h3>
          <div className="space-y-2">
            {checklist.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 p-3 border rounded">
                {item.status === 'ok' ? (
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                )}
                <span className="flex-1">{item.item}</span>
                <Badge variant={item.importance === 'critical' ? 'destructive' : 'secondary'}>
                  {item.importance}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {missing_docs && missing_docs.length > 0 && (
        <Card className="p-6 border-destructive">
          <h3 className="text-lg font-semibold mb-4 text-destructive">Documentos Faltantes</h3>
          <div className="space-y-4">
            {missing_docs.map((doc: any, idx: number) => (
              <div key={idx} className="border-l-4 border-destructive pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold">{doc.doc_type}</span>
                  <Badge variant="destructive">{doc.importance}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{doc.reason}</p>
                {doc.impact && (
                  <p className="text-sm text-destructive">{doc.impact}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Button onClick={handleValidate} disabled={isValidating} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Validar Novamente
        </Button>
      </div>
    </div>
  );
};
