import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";

interface ProgressCardProps {
  show: boolean;
  tentativaAtual: number;
  maxTentativas: number;
  ultimaValidacao: any;
  totalBrechas: number;
  totalPontosFracos: number;
  totalRecomendacoes: number;
}

export const ProgressCard = ({
  show,
  tentativaAtual,
  maxTentativas,
  ultimaValidacao,
  totalBrechas,
  totalPontosFracos,
  totalRecomendacoes
}: ProgressCardProps) => {
  if (!show) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-[500px] p-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            🔧 Aplicando Correções Criteriosas
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* TENTATIVA ATUAL */}
          <div className="flex justify-between items-center">
            <span className="font-medium">Tentativa:</span>
            <Badge variant="default" className="text-lg">
              {tentativaAtual}/{maxTentativas}
            </Badge>
          </div>
          
          {/* BARRA DE PROGRESSO */}
          <Progress value={(tentativaAtual / maxTentativas) * 100} className="h-3" />
          
          {/* STATUS DA ÚLTIMA VALIDAÇÃO */}
          {ultimaValidacao && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>✅ Brechas:</span>
                <span className="font-bold">
                  {ultimaValidacao.detalhes.brechas_corrigidas}/{totalBrechas}
                </span>
              </div>
              <div className="flex justify-between">
                <span>✅ Pontos Fracos:</span>
                <span className="font-bold">
                  {ultimaValidacao.detalhes.pontos_fracos_corrigidos}/{totalPontosFracos}
                </span>
              </div>
              <div className="flex justify-between">
                <span>✅ Recomendações:</span>
                <span className="font-bold">
                  {ultimaValidacao.detalhes.recomendacoes_aplicadas}/{totalRecomendacoes}
                </span>
              </div>
              
              {tentativaAtual > 1 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Tentativa {tentativaAtual}: Corrigindo {
                      ultimaValidacao.detalhes.brechas_faltando.length +
                      ultimaValidacao.detalhes.pontos_fracos_faltando.length +
                      ultimaValidacao.detalhes.recomendacoes_faltando.length
                    } itens restantes...
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
