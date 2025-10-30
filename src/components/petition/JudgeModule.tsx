import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shield, Sparkles, Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface JudgeAnalysis {
  brechas: Array<{
    tipo: string;
    descricao: string;
    gravidade: string;
    localizacao: string;
    sugestao: string;
  }>;
  pontos_fortes: string[];
  pontos_fracos: string[];
  risco_improcedencia: number;
  recomendacoes: string[];
}

interface JudgeModuleProps {
  judgeAnalysis: JudgeAnalysis | null;
  analyzing: boolean;
  applying: boolean;
  selectedBrechas: number[];
  onAnalyze: () => void;
  onApplyCorrections: () => void;
  onApplySingle: (index: number) => void;
  onToggleBrecha: (index: number) => void;
}

export const JudgeModule = ({
  judgeAnalysis,
  analyzing,
  applying,
  selectedBrechas,
  onAnalyze,
  onApplyCorrections,
  onApplySingle,
  onToggleBrecha
}: JudgeModuleProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const getRiskColor = (risk: number) => {
    if (risk <= 20) return 'text-green-600';
    if (risk <= 40) return 'text-yellow-600';
    if (risk <= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getSeverityVariant = (severity: string): "default" | "destructive" | "secondary" => {
    if (severity === 'alta') return 'destructive';
    if (severity === 'media') return 'secondary';
    return 'default';
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-purple-200">
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Módulo Juiz - Análise Crítica</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {judgeAnalysis && (
                  <Badge variant="outline" className="bg-purple-50">
                    {judgeAnalysis.brechas.length} brechas
                  </Badge>
                )}
                <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {!judgeAnalysis ? (
              <Button 
                onClick={onAnalyze} 
                className="w-full gap-2"
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analisar com Módulo Juiz
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                {/* Risk Assessment */}
                <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Risco de Improcedência</span>
                    <span className={`text-2xl font-bold ${getRiskColor(judgeAnalysis.risco_improcedencia)}`}>
                      {judgeAnalysis.risco_improcedencia}%
                    </span>
                  </div>
                  <Progress value={judgeAnalysis.risco_improcedencia} className="h-2" />
                </div>

                {/* Brechas */}
                {judgeAnalysis.brechas.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Brechas Detectadas ({judgeAnalysis.brechas.length})</h4>
                      {selectedBrechas.length > 0 && (
                        <Button
                          onClick={onApplyCorrections}
                          size="sm"
                          className="gap-2"
                          disabled={applying}
                        >
                          {applying ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Aplicar {selectedBrechas.length} Selecionadas
                        </Button>
                      )}
                    </div>

                    {judgeAnalysis.brechas.map((brecha, index) => (
                      <Card key={index} className="border-l-4 border-l-red-500">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`brecha-${index}`}
                              checked={selectedBrechas.includes(index)}
                              onCheckedChange={() => onToggleBrecha(index)}
                            />
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={getSeverityVariant(brecha.gravidade)}>
                                  {brecha.tipo}
                                </Badge>
                                <Badge variant="outline">{brecha.gravidade}</Badge>
                              </div>
                              <p className="text-sm font-medium">{brecha.descricao}</p>
                              <p className="text-xs text-muted-foreground">📍 {brecha.localizacao}</p>
                              <div className="p-2 bg-green-50 rounded text-xs">
                                <strong>Sugestão:</strong> {brecha.sugestao}
                              </div>
                              <Button
                                onClick={() => onApplySingle(index)}
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                Aplicar Apenas Esta
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pontos Fortes/Fracos */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-green-600">✅ Pontos Fortes</h4>
                    <ul className="text-sm space-y-1">
                      {judgeAnalysis.pontos_fortes.map((ponto, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span>•</span>
                          <span>{ponto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-semibold text-amber-600">⚠️ Pontos Fracos</h4>
                    <ul className="text-sm space-y-1">
                      {judgeAnalysis.pontos_fracos.map((ponto, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span>•</span>
                          <span>{ponto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recomendações */}
                {judgeAnalysis.recomendacoes.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold mb-2">💡 Recomendações</h4>
                    <ul className="text-sm space-y-1">
                      {judgeAnalysis.recomendacoes.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
