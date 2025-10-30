import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { useFinalizeVersion } from "@/hooks/useFinalizeVersion";
import { supabase } from "@/integrations/supabase/client";

interface PetitionViewerProps {
  petition: string;
  qualityReport?: any;
  caseId?: string;
  currentDraftId?: string;
}

export const PetitionViewer = ({ petition, qualityReport, caseId, currentDraftId }: PetitionViewerProps) => {
  const { finalizeVersion } = useFinalizeVersion();
  const [isFinal, setIsFinal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Verificar se já é final ao carregar
  useEffect(() => {
    const checkIfFinal = async () => {
      if (!caseId || !currentDraftId) return;
      
      const { data } = await supabase
        .from('drafts')
        .select('is_final')
        .eq('id', currentDraftId)
        .single();
      
      if (data) {
        setIsFinal(data.is_final || false);
      }
    };
    
    checkIfFinal();
  }, [caseId, currentDraftId]);

  const handleFinalize = async () => {
    if (!caseId || !currentDraftId) return;
    
    const confirmed = window.confirm(
      '⚠️ ATENÇÃO: Ao salvar como versão final, você NÃO poderá mais modificar esta minuta automaticamente sem descongelá-la.\n\nDeseja continuar?'
    );
    
    if (!confirmed) return;
    
    setIsLoading(true);
    const success = await finalizeVersion(caseId, currentDraftId);
    if (success) {
      setIsFinal(true);
    }
    setIsLoading(false);
  };

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
      {/* Botão Salvar Versão Final */}
      {caseId && currentDraftId && (
        <div className="flex justify-end">
          {isFinal ? (
            <Badge variant="outline" className="gap-2 py-2 px-4">
              <Lock className="h-4 w-4" />
              Versão Final Congelada
            </Badge>
          ) : (
            <Button 
              onClick={handleFinalize}
              disabled={isLoading}
              variant="default"
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              {isLoading ? 'Salvando...' : 'Salvar Versão Final'}
            </Button>
          )}
        </div>
      )}

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
