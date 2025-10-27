import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export default function SuccessPatternAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [totalCases, setTotalCases] = useState(0);
  const [loading, setLoading] = useState(false);

  const generateAnalysis = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-case-analysis');

      if (error) {
        if (error.message?.includes('429')) {
          toast.error('Limite de requisições atingido. Aguarde alguns instantes.');
        } else if (error.message?.includes('402')) {
          toast.error('Créditos esgotados. Adicione créditos no painel Lovable.');
        } else {
          throw error;
        }
        return;
      }

      setAnalysis(data.analysis);
      setTotalCases(data.totalCasesAnalyzed || 0);
      toast.success('Análise de padrões concluída!');
    } catch (error) {
      console.error('Erro ao gerar análise:', error);
      toast.error('Erro ao analisar casos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold">Análise de Padrões de Sucesso</h3>
          {totalCases > 0 && (
            <Badge variant="outline" className="ml-2">
              {totalCases} casos analisados
            </Badge>
          )}
        </div>
        <Button 
          onClick={generateAnalysis} 
          disabled={loading}
          className="gap-2"
          variant="success"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analisar Casos Ganhos
            </>
          )}
        </Button>
      </div>

      {analysis ? (
        <div className="prose prose-sm max-w-none">
          <div className="p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mb-3 text-green-600">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-4 text-emerald-600">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
                p: ({ children }) => <p className="mb-2 text-foreground">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-foreground">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-green-600">{children}</strong>,
              }}
            >
              {analysis}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-lg font-medium mb-2">Meta: 100% de Procedência</p>
          <p className="text-muted-foreground mb-4">
            Analise os casos ganhos e descubra a fórmula do sucesso
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 max-w-md mx-auto text-left">
            <li>✓ Identifica padrões em casos ganhos</li>
            <li>✓ Descobre documentação decisiva</li>
            <li>✓ Revela requisitos essenciais</li>
            <li>✓ Cria protocolo de sucesso replicável</li>
          </ul>
        </div>
      )}
    </Card>
  );
}
