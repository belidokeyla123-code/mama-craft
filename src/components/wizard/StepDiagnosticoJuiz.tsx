import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, FileText, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { CaseData } from "@/pages/NewCase";

interface StepDiagnosticoJuizProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface DiagnosticoReport {
  score_global: number;
  analise_prova_material: {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  analise_coerencia_temporal: {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  analise_tese_jurisprudencia: {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  analise_pedidos_calculistica: {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  analise_redacao_clareza: {
    score: number;
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  ajustes_obrigatorios: string[];
  ajustes_recomendados: string[];
  ajustes_opcionais: string[];
  recomendacao_final: string;
}

export const StepDiagnosticoJuiz = ({ data, updateData }: StepDiagnosticoJuizProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoReport | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Auto-start analysis if not done yet
    if (!data.diagnosticoJuiz && !isAnalyzing) {
      handleAnalyze();
    } else if (data.diagnosticoJuiz) {
      setDiagnostico(data.diagnosticoJuiz);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!data.minuta) {
      toast({
        title: "Minuta não encontrada",
        description: "Por favor, complete a etapa de Minuta antes de prosseguir.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data: response, error } = await supabase.functions.invoke(
        "diagnostico-juiz",
        {
          body: {
            caseId: data.caseId,
            chatAnalysis: data.chatAnalysis,
            analysisReport: data.analysisReport,
            jurisprudenceData: data.jurisprudenceData,
            thesisData: data.thesisData,
            minuta: data.minuta,
          },
        }
      );

      if (error) throw error;

      setDiagnostico(response.diagnostico);
      
      updateData({
        ...data,
        diagnosticoJuiz: response.diagnostico,
      });

      toast({
        title: "Diagnóstico concluído!",
        description: `Score global: ${response.diagnostico.score_global}/100`,
      });
    } catch (error) {
      console.error("Error analyzing:", error);
      toast({
        title: "Erro ao gerar diagnóstico",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (score >= 60) return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  if (isAnalyzing) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Diagnóstico JUIZ</h2>
          <p className="text-muted-foreground">
            Auditoria final da minuta com análise crítica e recomendações
          </p>
        </div>

        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <h3 className="text-lg font-semibold mb-2">Analisando minuta...</h3>
          <p className="text-muted-foreground">
            O Juiz Virtual está auditando todos os aspectos da petição
          </p>
        </Card>
      </div>
    );
  }

  if (!diagnostico) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Diagnóstico JUIZ</h2>
          <p className="text-muted-foreground">
            Auditoria final da minuta com análise crítica e recomendações
          </p>
        </div>

        <Card className="p-8 text-center">
          <Scale className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Pronto para análise</h3>
          <p className="text-muted-foreground mb-4">
            Clique no botão abaixo para iniciar a auditoria completa da minuta
          </p>
          <Button onClick={handleAnalyze} size="lg">
            Iniciar Diagnóstico
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Diagnóstico JUIZ</h2>
        <p className="text-muted-foreground">
          Auditoria final da minuta com análise crítica e recomendações
        </p>
      </div>

      {/* Score Global */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Score Global</h3>
          <div className={`text-6xl font-bold mb-4 ${getScoreColor(diagnostico.score_global)}`}>
            {diagnostico.score_global}
            <span className="text-2xl">/100</span>
          </div>
          <Progress value={diagnostico.score_global} className="h-3 mb-4" />
          <p className="text-sm text-muted-foreground">
            {diagnostico.score_global >= 80 && "✅ Minuta em excelente estado para protocolo"}
            {diagnostico.score_global >= 60 && diagnostico.score_global < 80 && "⚠️ Minuta necessita de ajustes recomendados"}
            {diagnostico.score_global < 60 && "❌ Minuta necessita de ajustes obrigatórios"}
          </p>
        </div>
      </Card>

      {/* Análises Detalhadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prova Material */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Prova Material</h4>
            <div className="flex items-center gap-2">
              {getScoreIcon(diagnostico.analise_prova_material.score)}
              <span className={`font-bold ${getScoreColor(diagnostico.analise_prova_material.score)}`}>
                {diagnostico.analise_prova_material.score}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {diagnostico.analise_prova_material.pontos_fortes.length > 0 && (
              <div>
                <p className="font-medium text-green-700">Pontos Fortes:</p>
                <ul className="list-disc list-inside text-green-600">
                  {diagnostico.analise_prova_material.pontos_fortes.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
            {diagnostico.analise_prova_material.pontos_fracos.length > 0 && (
              <div>
                <p className="font-medium text-red-700">Pontos Fracos:</p>
                <ul className="list-disc list-inside text-red-600">
                  {diagnostico.analise_prova_material.pontos_fracos.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        {/* Coerência Temporal */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Coerência Temporal</h4>
            <div className="flex items-center gap-2">
              {getScoreIcon(diagnostico.analise_coerencia_temporal.score)}
              <span className={`font-bold ${getScoreColor(diagnostico.analise_coerencia_temporal.score)}`}>
                {diagnostico.analise_coerencia_temporal.score}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {diagnostico.analise_coerencia_temporal.pontos_fortes.length > 0 && (
              <div>
                <p className="font-medium text-green-700">Pontos Fortes:</p>
                <ul className="list-disc list-inside text-green-600">
                  {diagnostico.analise_coerencia_temporal.pontos_fortes.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
            {diagnostico.analise_coerencia_temporal.pontos_fracos.length > 0 && (
              <div>
                <p className="font-medium text-red-700">Pontos Fracos:</p>
                <ul className="list-disc list-inside text-red-600">
                  {diagnostico.analise_coerencia_temporal.pontos_fracos.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        {/* Tese e Jurisprudência */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Tese e Jurisprudência</h4>
            <div className="flex items-center gap-2">
              {getScoreIcon(diagnostico.analise_tese_jurisprudencia.score)}
              <span className={`font-bold ${getScoreColor(diagnostico.analise_tese_jurisprudencia.score)}`}>
                {diagnostico.analise_tese_jurisprudencia.score}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {diagnostico.analise_tese_jurisprudencia.pontos_fortes.length > 0 && (
              <div>
                <p className="font-medium text-green-700">Pontos Fortes:</p>
                <ul className="list-disc list-inside text-green-600">
                  {diagnostico.analise_tese_jurisprudencia.pontos_fortes.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
            {diagnostico.analise_tese_jurisprudencia.pontos_fracos.length > 0 && (
              <div>
                <p className="font-medium text-red-700">Pontos Fracos:</p>
                <ul className="list-disc list-inside text-red-600">
                  {diagnostico.analise_tese_jurisprudencia.pontos_fracos.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        {/* Pedidos e Calculística */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Pedidos e Calculística</h4>
            <div className="flex items-center gap-2">
              {getScoreIcon(diagnostico.analise_pedidos_calculistica.score)}
              <span className={`font-bold ${getScoreColor(diagnostico.analise_pedidos_calculistica.score)}`}>
                {diagnostico.analise_pedidos_calculistica.score}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {diagnostico.analise_pedidos_calculistica.pontos_fortes.length > 0 && (
              <div>
                <p className="font-medium text-green-700">Pontos Fortes:</p>
                <ul className="list-disc list-inside text-green-600">
                  {diagnostico.analise_pedidos_calculistica.pontos_fortes.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
            {diagnostico.analise_pedidos_calculistica.pontos_fracos.length > 0 && (
              <div>
                <p className="font-medium text-red-700">Pontos Fracos:</p>
                <ul className="list-disc list-inside text-red-600">
                  {diagnostico.analise_pedidos_calculistica.pontos_fracos.map((ponto, idx) => (
                    <li key={idx}>{ponto}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Ajustes */}
      {diagnostico.ajustes_obrigatorios.length > 0 && (
        <Card className="p-4 border-red-200 bg-red-50">
          <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Ajustes Obrigatórios (A)
          </h4>
          <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
            {diagnostico.ajustes_obrigatorios.map((ajuste, idx) => (
              <li key={idx}>{ajuste}</li>
            ))}
          </ul>
        </Card>
      )}

      {diagnostico.ajustes_recomendados.length > 0 && (
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Ajustes Recomendados (B)
          </h4>
          <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
            {diagnostico.ajustes_recomendados.map((ajuste, idx) => (
              <li key={idx}>{ajuste}</li>
            ))}
          </ul>
        </Card>
      )}

      {diagnostico.ajustes_opcionais.length > 0 && (
        <Card className="p-4 border-blue-200 bg-blue-50">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Ajustes Opcionais (C)
          </h4>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
            {diagnostico.ajustes_opcionais.map((ajuste, idx) => (
              <li key={idx}>{ajuste}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recomendação Final */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10">
        <h4 className="font-semibold mb-2">Recomendação Final</h4>
        <p className="text-sm whitespace-pre-wrap">{diagnostico.recomendacao_final}</p>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleAnalyze}>
          Reanalizar
        </Button>
        <Button size="lg">
          Finalizar Caso
        </Button>
      </div>
    </div>
  );
};
