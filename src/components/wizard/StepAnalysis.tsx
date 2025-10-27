import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Scale, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TimelineChart } from "@/components/case/TimelineChart";

interface StepAnalysisProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface LegalAnalysis {
  qualidade_segurada: {
    tipo: string;
    comprovado: boolean;
    detalhes: string;
  };
  carencia: {
    necessaria: boolean;
    cumprida: boolean;
    meses_faltantes: number;
    detalhes: string;
  };
  cnis_analysis?: {
    periodos_urbanos: Array<any>;
    periodos_rurais: Array<any>;
    beneficios_anteriores: Array<any>;
    tempo_reconhecido_inss: { anos: number; meses: number };
  };
  timeline: Array<{
    periodo: string;
    tipo: "urbano" | "rural" | "beneficio" | "lacuna";
    status: "reconhecido" | "a_comprovar";
    detalhes?: string;
  }>;
  rmi: {
    valor: number;
    base_calculo: string;
    situacao_especial: boolean;
  };
  valor_causa: number;
  probabilidade_exito: {
    score: number;
    nivel: string;
    justificativa: string[];
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  recomendacoes: string[];
}

export const StepAnalysis = ({ data, updateData }: StepAnalysisProps) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);

  useEffect(() => {
    if (data.caseId) {
      performAnalysis();
    }
  }, [data.caseId]);

  const performAnalysis = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('analyze-case-legal', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429') || result?.code === 'RATE_LIMIT') {
          toast.error("Rate limit atingido. Aguarde 30 segundos e tente novamente.");
          return;
        }
        if (error.message?.includes('402') || result?.code === 'NO_CREDITS') {
          toast.error("Créditos Lovable AI esgotados. Adicione mais créditos.");
          return;
        }
        if (error.message?.includes('408') || result?.code === 'TIMEOUT') {
          toast.error("Timeout: Análise demorou muito. Tente com menos documentos.");
          return;
        }
        throw error;
      }

      if (result) {
        setAnalysis(result);
        toast.success("Análise jurídica concluída!");
      }
    } catch (error) {
      console.error('Erro ao analisar caso:', error);
      toast.error('Erro ao realizar análise jurídica');
    } finally {
      setLoading(false);
    }
  };

  const getProbabilityColor = (nivel: string) => {
    switch (nivel) {
      case 'alta': return 'text-green-600';
      case 'media': return 'text-yellow-600';
      case 'baixa': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Scale className="h-7 w-7 text-primary" />
          Análise Jurídica Completa
        </h2>
        <p className="text-muted-foreground">
          Análise de CNIS, carência, RMI, valor da causa e probabilidade de êxito
        </p>
      </div>

      <Button onClick={performAnalysis} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Analisando...
          </>
        ) : (
          "Reanalisar"
        )}
      </Button>

      {loading ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Analisando documentação e CNIS...</p>
              <p className="text-sm text-muted-foreground">
                Verificando qualidade de segurada, carência, RMI e valor da causa
              </p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 60 segundos</p>
            </div>
          </div>
        </Card>
      ) : analysis ? (
        <>
          {/* Probabilidade de Êxito */}
          <Card className="p-6 border-2 border-primary">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold mb-1">Probabilidade de Êxito</h3>
                <p className="text-sm text-muted-foreground">
                  Baseado na análise completa da documentação
                </p>
              </div>
              <Badge variant="outline" className={`text-2xl px-4 py-2 ${getProbabilityColor(analysis.probabilidade_exito.nivel)}`}>
                {analysis.probabilidade_exito.score}%
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Pontos Fortes
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.probabilidade_exito.pontos_fortes.map((ponto, index) => (
                    <li key={index}>{ponto}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Pontos Fracos
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.probabilidade_exito.pontos_fracos.map((ponto, index) => (
                    <li key={index}>{ponto}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Justificativa</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.probabilidade_exito.justificativa.map((just, index) => (
                  <li key={index}>{just}</li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Cards de Informações */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Perfil</p>
              <Badge variant="outline" className="text-base">
                {analysis.qualidade_segurada.tipo === "especial" ? "Segurada Especial" : "Segurada Urbana"}
              </Badge>
            </Card>
            
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Carência
              </p>
              <Badge variant={analysis.carencia.cumprida ? "default" : "destructive"}>
                {analysis.carencia.cumprida ? "Cumprida" : `Faltam ${analysis.carencia.meses_faltantes} meses`}
              </Badge>
            </Card>

            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                RMI
              </p>
              <p className="text-lg font-semibold">
                R$ {analysis.rmi.valor.toFixed(2)}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Valor da Causa</p>
              <p className="text-lg font-semibold">
                R$ {analysis.valor_causa.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* Qualidade de Segurada */}
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-3">Qualidade de Segurada</h3>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={analysis.qualidade_segurada.comprovado ? "default" : "destructive"}>
                {analysis.qualidade_segurada.comprovado ? "Comprovada" : "Não Comprovada"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {analysis.qualidade_segurada.tipo}
              </span>
            </div>
            <p className="text-sm">{analysis.qualidade_segurada.detalhes}</p>
          </Card>

          {/* Timeline de Contribuição */}
          {analysis.timeline.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-4">Timeline de Contribuição</h3>
              <TimelineChart events={analysis.timeline} />
            </Card>
          )}

          {/* Análise de CNIS */}
          {analysis.cnis_analysis && (
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-3">Análise do CNIS</h3>
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-2">Tempo Reconhecido pelo INSS</p>
                  <Badge variant="secondary" className="text-base">
                    {analysis.cnis_analysis.tempo_reconhecido_inss.anos} anos e {analysis.cnis_analysis.tempo_reconhecido_inss.meses} meses
                  </Badge>
                </div>

                {analysis.cnis_analysis.beneficios_anteriores.length > 0 && (
                  <div>
                    <p className="font-medium mb-2">Benefícios Anteriores</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {analysis.cnis_analysis.beneficios_anteriores.map((ben: any, index: number) => (
                        <li key={index}>{ben.tipo} - {ben.data}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recomendações */}
          {analysis.recomendacoes.length > 0 && (
            <Card className="p-6 bg-blue-50 dark:bg-blue-950">
              <h3 className="text-lg font-bold mb-3">Recomendações</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.recomendacoes.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Clique em "Reanalisar" para iniciar a análise jurídica completa
        </Card>
      )}
    </div>
  );
};
