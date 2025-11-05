import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, Award, AlertTriangle, Lightbulb } from "lucide-react";

interface InsightsPanelProps {
  cases: any[];
}

export default function InsightsPanel({ cases }: InsightsPanelProps) {
  // Calcular métricas
  const totalCases = cases.length;
  const acordos = cases.filter(c => c.status === 'acordo').length;
  const sentencasProcedentes = cases.filter(c => c.status === 'sentenca' || c.tipo_conclusao === 'sentenca_procedente').length;
  const derrotas = cases.filter(c => c.tipo_conclusao === 'sentenca_improcedente').length;
  
  const taxaSucesso = totalCases > 0 ? ((acordos + sentencasProcedentes) / totalCases * 100).toFixed(1) : 0;
  const taxaAcordo = totalCases > 0 ? (acordos / totalCases * 100).toFixed(1) : 0;
  const taxaDerrota = totalCases > 0 ? (derrotas / totalCases * 100).toFixed(1) : 0;

  // Análise de padrões
  const getSuccessPatterns = () => {
    const patterns = [];
    
    if (parseFloat(taxaAcordo as string) > 50) {
      patterns.push({
        icon: Award,
        title: "Alta Taxa de Acordos",
        description: `${taxaAcordo}% dos casos terminam em acordo. Sua estratégia de negociação está funcionando!`,
        type: "success"
      });
    }

    if (parseFloat(taxaSucesso as string) > 70) {
      patterns.push({
        icon: Target,
        title: "Excelente Taxa de Sucesso",
        description: `${taxaSucesso}% de casos bem-sucedidos. Continue com essa abordagem!`,
        type: "success"
      });
    }

    if (parseFloat(taxaDerrota as string) > 20) {
      patterns.push({
        icon: AlertTriangle,
        title: "Atenção: Taxa de Derrotas Elevada",
        description: `${taxaDerrota}% de derrotas. Revise a estratégia de seleção de casos.`,
        type: "warning"
      });
    }

    // Análise de tempo médio
    const casesComDuracao = cases.filter(c => c.data_conclusao && c.data_protocolo);
    if (casesComDuracao.length > 0) {
      const duracaoMedia = casesComDuracao.reduce((sum, c) => {
        const inicio = new Date(c.data_protocolo).getTime();
        const fim = new Date(c.data_conclusao).getTime();
        return sum + (fim - inicio);
      }, 0) / casesComDuracao.length;

      const diasMedias = Math.round(duracaoMedia / (1000 * 60 * 60 * 24));
      
      if (diasMedias < 180) {
        patterns.push({
          icon: TrendingUp,
          title: "Resolução Rápida",
          description: `Tempo médio de ${diasMedias} dias. Casos estão sendo resolvidos rapidamente!`,
          type: "success"
        });
      }
    }

    return patterns;
  };

  const patterns = getSuccessPatterns();

  // Estratégia EMA (Estratégia de Maximização de Acordos)
  const getEMAStrategy = () => {
    const strategies = [];

    if (acordos > sentencasProcedentes) {
      strategies.push({
        title: "Foco em Acordos",
        description: "Seus melhores resultados vêm de acordos. Invista em negociação pré-processual.",
        priority: "high"
      });
    }

    if (sentencasProcedentes > acordos) {
      strategies.push({
        title: "Força em Sentenças",
        description: "Você tem boa taxa de sentenças procedentes. Continue com a estratégia processual robusta.",
        priority: "high"
      });
    }

    if (parseFloat(taxaDerrota as string) > 15) {
      strategies.push({
        title: "Triagem Mais Rigorosa",
        description: "Considere critérios mais rígidos na seleção de casos para reduzir derrotas.",
        priority: "medium"
      });
    }

    return strategies;
  };

  const emaStrategies = getEMAStrategy();

  return (
    <div className="space-y-6">
      {/* Métricas Principais */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5" />
          Análise de Performance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
            <p className="text-2xl font-bold text-green-600">{taxaSucesso}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Taxa de Acordos</p>
            <p className="text-2xl font-bold text-blue-600">{taxaAcordo}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Sentenças Procedentes</p>
            <p className="text-2xl font-bold text-purple-600">{sentencasProcedentes}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Taxa de Derrotas</p>
            <p className="text-2xl font-bold text-red-600">{taxaDerrota}%</p>
          </div>
        </div>
      </Card>

      {/* Padrões de Sucesso */}
      {patterns.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Padrões Identificados
          </h3>
          <div className="space-y-3">
            {patterns.map((pattern, index) => {
              const Icon = pattern.icon;
              return (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Icon className={`h-5 w-5 mt-0.5 ${pattern.type === 'success' ? 'text-green-600' : 'text-orange-600'}`} />
                  <div className="flex-1">
                    <p className="font-medium">{pattern.title}</p>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Estratégia EMA */}
      {emaStrategies.length > 0 && (
        <Card className="p-6 border-2 border-purple-200 dark:border-purple-900">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Estratégia EMA (Estratégia de Maximização de Acordos)
          </h3>
          <div className="space-y-3">
            {emaStrategies.map((strategy, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <Badge variant={strategy.priority === 'high' ? 'default' : 'secondary'} className="mt-0.5">
                  {strategy.priority === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                </Badge>
                <div className="flex-1">
                  <p className="font-medium">{strategy.title}</p>
                  <p className="text-sm text-muted-foreground">{strategy.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
