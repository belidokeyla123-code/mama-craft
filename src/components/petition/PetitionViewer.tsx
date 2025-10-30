import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface PetitionViewerProps {
  petition: string;
  qualityReport?: any;
}

export const PetitionViewer = ({ petition, qualityReport }: PetitionViewerProps) => {
  if (!petition) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma petição gerada ainda</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quality Report Summary */}
      {qualityReport && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          {qualityReport.status === 'aprovado' ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-600">Qualidade Aprovada</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="font-medium text-amber-600">
                {qualityReport.issues?.length || 0} pontos de atenção
              </span>
            </>
          )}
          
          {qualityReport.valor_causa_validado && (
            <Badge variant="outline" className="ml-auto">
              R$ {qualityReport.valor_causa_referencia?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Badge>
          )}
        </div>
      )}

      {/* Petition Content */}
      <Card data-petition-content>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="p-6 prose prose-sm max-w-none">
              {petition.split('\n').map((line, i) => (
                <p key={i} className="mb-2 whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
