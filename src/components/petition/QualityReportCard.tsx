import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, RefreshCw, Calculator } from "lucide-react";

interface QualityReportCardProps {
  qualityReport: any;
  onRevalidate: () => void;
  onRecalculate: () => void;
  loading?: boolean;
}

export const QualityReportCard = ({ 
  qualityReport, 
  onRevalidate, 
  onRecalculate,
  loading 
}: QualityReportCardProps) => {
  if (!qualityReport) return null;

  const statusConfig = {
    aprovado: { 
      color: 'bg-green-600', 
      icon: CheckCircle2, 
      label: '✅ Aprovado' 
    },
    aprovado_com_avisos: { 
      color: 'bg-yellow-600', 
      icon: AlertTriangle, 
      label: '⚠️ Aprovado com Avisos' 
    },
    requer_revisao: { 
      color: 'bg-red-600', 
      icon: AlertTriangle, 
      label: '❌ Requer Revisão' 
    }
  };

  const config = statusConfig[qualityReport.status as keyof typeof statusConfig] || statusConfig.aprovado;
  const StatusIcon = config.icon;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Controle de Qualidade</CardTitle>
          <Badge className={config.color}>{config.label}</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid gap-3">
          {/* Endereçamento */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Endereçamento</span>
            {qualityReport.enderecamento_ok ? (
              <Badge variant="default" className="bg-green-600">✅ Correto</Badge>
            ) : (
              <Badge variant="destructive">❌ Incorreto</Badge>
            )}
          </div>

          {/* Dados Completos */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Dados Completos</span>
            {qualityReport.dados_completos ? (
              <Badge variant="default" className="bg-green-600">✅ Todos preenchidos</Badge>
            ) : (
              <Badge variant="secondary">
                ⚠️ {qualityReport.campos_faltantes?.length || 0} campos faltando
              </Badge>
            )}
          </div>

          {/* Valor da Causa */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Valor da Causa</span>
            {qualityReport.valor_causa_validado ? (
              <div className="flex flex-col items-end gap-1">
                <Badge variant="default" className="bg-green-600">
                  ✅ R$ {qualityReport.valor_causa_referencia?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {qualityReport.competencia === 'juizado' 
                    ? '📋 Juizado Especial Federal'
                    : '⚖️ Vara Federal'}
                </span>
              </div>
            ) : (
              <Badge variant="destructive">❌ Valor incorreto</Badge>
            )}
          </div>

          {/* Jurisdição */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="font-medium">Jurisdição</span>
            {qualityReport.jurisdicao_ok ? (
              <Badge variant="default" className="bg-green-600">✅ Correta</Badge>
            ) : (
              <Badge variant="destructive">❌ Incorreta</Badge>
            )}
          </div>
        </div>

        {/* Issues */}
        {qualityReport.issues && qualityReport.issues.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold mb-2">Problemas detectados:</p>
              <ul className="list-disc list-inside space-y-1">
                {qualityReport.issues.map((issue: any, i: number) => (
                  <li key={i} className="text-sm">
                    <strong>{issue.tipo}:</strong> {issue.problema}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={onRevalidate}
            variant="outline"
            size="sm"
            className="gap-2 flex-1"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            🔧 Validar e Corrigir
          </Button>
          
          <Button
            onClick={onRecalculate}
            variant="outline"
            size="sm"
            className="gap-2 flex-1"
            disabled={loading}
          >
            <Calculator className="h-4 w-4" />
            Recalcular
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
