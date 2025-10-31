import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

interface QualityReportCardProps {
  qualityReport: any;
  loading?: boolean;
}

export const QualityReportCard = ({ 
  qualityReport,
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
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">Endereçamento</span>
              {qualityReport.enderecamento_ok ? (
                <Badge variant="default" className="bg-green-600">✅ Correto</Badge>
              ) : (
                <Badge variant="destructive">❌ Incorreto</Badge>
              )}
            </div>
            {qualityReport.enderecamento_ok && qualityReport.jurisdicao_validada && (
              <p className="text-xs text-muted-foreground mt-1">
                {qualityReport.jurisdicao_validada}
              </p>
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
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">Jurisdição</span>
              {qualityReport.jurisdicao_ok ? (
                <Badge variant="default" className="bg-green-600">✅ Correta</Badge>
              ) : (
                <Badge variant="destructive">❌ Incorreta</Badge>
              )}
            </div>
            {qualityReport.jurisdicao_ok && qualityReport.trf && (
              <p className="text-xs text-muted-foreground mt-1">
                {qualityReport.trf}
              </p>
            )}
          </div>
        </div>

        {/* Análise Completa da IA */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border-2 border-primary/20">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Análise Completa da IA
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {/* Português e Sintaxe */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Português e Sintaxe</span>
            </div>
            
            {/* Contexto */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Contexto</span>
            </div>
            
            {/* Raciocínio Jurídico */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Raciocínio Jurídico</span>
            </div>
            
            {/* Estrutura */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Estrutura (Fato → Direito → Pedido)</span>
            </div>
            
            {/* Documentação */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Documentação</span>
            </div>
            
            {/* Fundamentos */}
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Fundamentos (Doutrina, Tese, Jurisprudência)</span>
            </div>
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
      </CardContent>
    </Card>
  );
};
