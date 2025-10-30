import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFullPipelineOrchestration } from '@/hooks/useFullPipelineOrchestration';
import { Progress } from '@/components/ui/progress';
import { PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';

interface PipelineReplicateButtonProps {
  caseId: string;
  caseName?: string;
}

export const PipelineReplicateButton = ({ caseId, caseName }: PipelineReplicateButtonProps) => {
  const { runFullPipeline, isRunning, currentStep, progress } = useFullPipelineOrchestration();

  const handleReplicate = async () => {
    await runFullPipeline(caseId, false);
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isRunning ? (
            <PlayCircle className="h-5 w-5 animate-pulse text-primary" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          )}
          Estrutura Completa do Caso
        </CardTitle>
        <CardDescription>
          {caseName && `Caso: ${caseName} • `}
          Execute todas as etapas automaticamente: validação, análise, jurisprudência, teses e minuta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{currentStep || 'Processando...'}</span>
              <span className="text-primary font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleReplicate}
            disabled={isRunning}
            className="flex-1"
            size="lg"
          >
            {isRunning ? (
              <>
                <PlayCircle className="mr-2 h-4 w-4 animate-pulse" />
                Processando Pipeline...
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 h-4 w-4" />
                Executar Pipeline Completo
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>Este processo pode levar alguns minutos. Aguarde até a conclusão.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
