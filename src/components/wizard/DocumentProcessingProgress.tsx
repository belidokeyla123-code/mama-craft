import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, FileText } from "lucide-react";
import { useDocumentQueueProgress } from "@/hooks/useDocumentQueueProgress";

interface DocumentProcessingProgressProps {
  caseId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export const DocumentProcessingProgress = ({
  caseId,
  onComplete,
  onError,
}: DocumentProcessingProgressProps) => {
  const { queueProgress } = useDocumentQueueProgress(caseId);

  // Call callbacks when status changes
  React.useEffect(() => {
    if (queueProgress.status === 'completed' && onComplete) {
      onComplete();
    }
    if (queueProgress.status === 'failed' && onError) {
      onError(queueProgress.error || 'Erro desconhecido');
    }
  }, [queueProgress.status, onComplete, onError, queueProgress.error]);

  if (queueProgress.status === 'idle') {
    return null;
  }

  const getStatusIcon = () => {
    switch (queueProgress.status) {
      case 'processing':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (queueProgress.status) {
      case 'processing':
        return 'Processando documentos...';
      case 'completed':
        return 'Todos os documentos foram processados!';
      case 'failed':
        return 'Erro ao processar documentos';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (queueProgress.status) {
      case 'processing':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      default:
        return '';
    }
  };

  return (
    <Card className={`p-4 mb-4 ${getStatusColor()}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <p className="font-medium text-sm">{getStatusText()}</p>
            {queueProgress.status === 'processing' && queueProgress.currentDocument && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <FileText className="h-3 w-3" />
                {queueProgress.currentDocument}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {queueProgress.processedDocuments}/{queueProgress.totalDocuments}
            </p>
            <p className="text-xs text-muted-foreground">documentos</p>
          </div>
        </div>

        {/* Progress Bar */}
        {queueProgress.status === 'processing' && (
          <div className="space-y-1">
            <Progress value={queueProgress.progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {queueProgress.progress}%
            </p>
          </div>
        )}

        {/* Error Message */}
        {queueProgress.status === 'failed' && queueProgress.error && (
          <p className="text-xs text-red-600 mt-2">{queueProgress.error}</p>
        )}

        {/* Success Message */}
        {queueProgress.status === 'completed' && (
          <p className="text-xs text-green-600 mt-2">
            ✅ Extração e classificação concluídas. Os dados foram atualizados automaticamente.
          </p>
        )}
      </div>
    </Card>
  );
};
