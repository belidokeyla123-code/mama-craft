import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, XCircle, Clock } from "lucide-react";
import { AutoCorrectionState } from "@/hooks/useAutoCorrection";

interface AutoCorrectionProgressProps {
  state: AutoCorrectionState;
}

export const AutoCorrectionProgress = ({ state }: AutoCorrectionProgressProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-600';
      case 'running':
        return 'bg-blue-600';
      case 'failed':
        return 'bg-red-600';
      default:
        return 'bg-gray-400';
    }
  };

  const getElapsedTime = (startTime?: number, endTime?: number) => {
    if (!startTime) return '';
    const end = endTime || Date.now();
    const elapsed = Math.round((end - startTime) / 1000);
    return `${elapsed}s`;
  };

  const totalProgress = state.stages.filter(s => s.status === 'completed').length / state.stages.length * 100;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">🤖 Correção Automática em Andamento</CardTitle>
          <Badge variant="outline" className="bg-blue-50">
            {state.totalCorrections} correções aplicadas
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Geral */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Progresso Geral</span>
            <span className="text-muted-foreground">{Math.round(totalProgress)}%</span>
          </div>
          <Progress value={totalProgress} className="h-3" />
        </div>

        {/* Lista de Etapas */}
        <div className="space-y-3">
          {state.stages.map((stage, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                stage.status === 'running' ? 'bg-blue-50 dark:bg-blue-950' : 'bg-muted/50'
              }`}
            >
              <div className="mt-0.5">{getStatusIcon(stage.status)}</div>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${stage.status === 'running' ? 'text-blue-700 dark:text-blue-300' : ''}`}>
                    {stage.name}
                  </span>
                  {(stage.startTime || stage.endTime) && (
                    <span className="text-xs text-muted-foreground">
                      {getElapsedTime(stage.startTime, stage.endTime)}
                    </span>
                  )}
                </div>

                {stage.status === 'running' && stage.progress > 0 && (
                  <Progress value={stage.progress} className="h-1.5" />
                )}

                {stage.message && (
                  <p className="text-xs text-muted-foreground">{stage.message}</p>
                )}
              </div>

              <Badge variant="outline" className={getStatusColor(stage.status)}>
                {stage.status === 'completed' && '✓'}
                {stage.status === 'running' && '...'}
                {stage.status === 'failed' && '✗'}
                {stage.status === 'pending' && '○'}
              </Badge>
            </div>
          ))}
        </div>

        {/* Erro */}
        {state.error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              <strong>Erro:</strong> {state.error}
            </p>
          </div>
        )}

        {/* Estatísticas */}
        {!state.isRunning && totalProgress === 100 && (
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium">
              ✅ Pipeline concluído com sucesso!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {state.totalCorrections} correções aplicadas automaticamente
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
