import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Clock, CheckCircle2, DollarSign } from "lucide-react";

export interface AIMetrics {
  function_name: string;
  avg_response_time: number;
  success_rate: number;
  total_calls: number;
  tokens_used: number;
  cost_estimate: number;
}

interface AIMetricsCardProps {
  metrics: AIMetrics[];
}

export const AIMetricsCard = ({ metrics }: AIMetricsCardProps) => {
  const totalCalls = metrics.reduce((sum, m) => sum + m.total_calls, 0);
  const avgSuccessRate = metrics.reduce((sum, m) => sum + m.success_rate, 0) / metrics.length;
  const totalCost = metrics.reduce((sum, m) => sum + m.cost_estimate, 0);
  const avgResponseTime = metrics.reduce((sum, m) => sum + m.avg_response_time, 0) / metrics.length;

  const getFunctionDisplayName = (name: string) => {
    const names: Record<string, string> = {
      'generate-petition': 'Geração de Petição',
      'analyze-case-legal': 'Análise Jurídica',
      'search-jurisprudence': 'Busca de Jurisprudência',
      'generate-tese-juridica': 'Geração de Teses',
      'analyze-petition-judge-view': 'Módulo Juiz',
      'validate-case-documents': 'Validação de Documentos'
    };
    return names[name] || name;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Métricas de IA
          </CardTitle>
          <Badge variant="outline">Últimos 30 dias</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Sparkles className="h-4 w-4" />
              Total de Chamadas
            </div>
            <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Taxa de Sucesso
            </div>
            <p className="text-2xl font-bold text-green-600">
              {avgSuccessRate.toFixed(1)}%
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              Tempo Médio
            </div>
            <p className="text-2xl font-bold">
              {(avgResponseTime / 1000).toFixed(1)}s
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="h-4 w-4" />
              Custo Estimado
            </div>
            <p className="text-2xl font-bold">
              R$ {totalCost.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Per Function */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Desempenho por Função</h4>
          
          {metrics.map((metric) => (
            <div key={metric.function_name} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {getFunctionDisplayName(metric.function_name)}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {metric.total_calls} calls
                  </Badge>
                  <span className="text-muted-foreground">
                    {(metric.avg_response_time / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Taxa de Sucesso</span>
                  <span>{metric.success_rate.toFixed(1)}%</span>
                </div>
                <Progress 
                  value={metric.success_rate} 
                  className="h-2"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Cost Breakdown */}
        <div className="p-3 bg-muted rounded-lg text-sm">
          <p className="font-medium mb-2">💡 Dica de Economia</p>
          <p className="text-muted-foreground">
            Use cache inteligente para reduzir chamadas repetidas. 
            Economia estimada: R$ {(totalCost * 0.3).toFixed(2)}/mês
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
