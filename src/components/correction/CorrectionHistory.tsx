import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CorrectionHistoryProps {
  caseId: string;
}

interface Correction {
  id: string;
  correction_type: string;
  module: string;
  changes_summary: any;
  applied_at: string;
  confidence_score: number;
  validation_status: string;
  auto_applied: boolean;
  reverted_at?: string;
}

export const CorrectionHistory = ({ caseId }: CorrectionHistoryProps) => {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadCorrections();
  }, [caseId]);

  const loadCorrections = async () => {
    try {
      const { data, error } = await supabase
        .from('correction_history')
        .select('*')
        .eq('case_id', caseId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      setCorrections(data || []);
    } catch (error: any) {
      console.error('[CORRECTION-HISTORY] Erro ao carregar:', error);
      toast.error('Erro ao carregar histórico de correções');
    } finally {
      setLoading(false);
    }
  };

  const revertCorrection = async (correctionId: string) => {
    try {
      toast.loading('Revertendo correção...', { id: 'revert' });

      const { error } = await supabase
        .from('correction_history')
        .update({
          reverted_at: new Date().toISOString(),
          validation_status: 'rejected'
        })
        .eq('id', correctionId);

      if (error) throw error;

      await loadCorrections();
      toast.success('Correção revertida com sucesso!', { id: 'revert' });
    } catch (error: any) {
      console.error('[CORRECTION-HISTORY] Erro ao reverter:', error);
      toast.error('Erro ao reverter correção', { id: 'revert' });
    }
  };

  const getCorrectionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      quality_report: 'Controle de Qualidade',
      judge: 'Módulo Juiz',
      regional: 'Adaptação Regional',
      appellate: 'Análise Recursiva'
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Correções</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (corrections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Correções</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nenhuma correção aplicada ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Histórico de Correções</CardTitle>
          <Badge variant="outline">{corrections.length} correções</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {corrections.map((correction) => (
              <Collapsible
                key={correction.id}
                open={expandedId === correction.id}
                onOpenChange={() => setExpandedId(expandedId === correction.id ? null : correction.id)}
              >
                <Card className={`border ${correction.reverted_at ? 'opacity-50' : ''}`}>
                  <CollapsibleTrigger asChild>
                    <div className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{getCorrectionTypeLabel(correction.correction_type)}</span>
                            {correction.auto_applied && (
                              <Badge variant="outline" className="text-xs">AUTO</Badge>
                            )}
                            {correction.reverted_at && (
                              <Badge variant="destructive" className="text-xs">REVERTIDA</Badge>
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground">
                            {correction.module} • {new Date(correction.applied_at).toLocaleString('pt-BR')}
                          </p>

                          <div className="flex items-center gap-2 text-xs">
                            <span className={`font-medium ${getConfidenceColor(correction.confidence_score)}`}>
                              Confiança: {correction.confidence_score}%
                            </span>
                            {correction.validation_status === 'approved' && (
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            )}
                            {correction.validation_status === 'pending' && (
                              <AlertTriangle className="h-3 w-3 text-yellow-600" />
                            )}
                          </div>
                        </div>

                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === correction.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="p-3 pt-0 space-y-3">
                      {/* Resumo das Mudanças */}
                      {correction.changes_summary && (
                        <div className="p-2 bg-muted rounded-lg">
                          <p className="text-xs font-medium mb-1">Resumo:</p>
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(correction.changes_summary, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Ações */}
                      {!correction.reverted_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => revertCorrection(correction.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reverter Correção
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
