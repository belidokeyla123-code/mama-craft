import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Props {
  currentStats: any;
  previousStats: any;
  monthlyData: any[];
}

export default function AIInsights({ currentStats, previousStats, monthlyData }: Props) {
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-financial-insights', {
        body: { currentStats, previousStats, monthlyData }
      });

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

      setInsights(data.insights);
      toast.success('Insights gerados com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar insights:', error);
      toast.error('Erro ao gerar insights. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Insights & Análise Estratégica com IA</h3>
        </div>
        <Button 
          onClick={generateInsights} 
          disabled={loading}
          className="gap-2"
          variant="accent"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Gerar Insights
            </>
          )}
        </Button>
      </div>

      {insights ? (
        <div className="prose prose-sm max-w-none">
          <div className="p-4 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-xl font-bold mb-3 text-purple-600">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mb-2 mt-4 text-blue-600">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3">{children}</h3>,
                p: ({ children }) => <p className="mb-2 text-foreground">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-foreground">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-purple-600">{children}</strong>,
              }}
            >
              {insights}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Brain className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-muted-foreground mb-4">
            Clique em "Gerar Insights" para receber uma análise completa com:
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 max-w-md mx-auto text-left">
            <li>✓ Diagnóstico da performance atual</li>
            <li>✓ Insights estratégicos personalizados</li>
            <li>✓ Metas e projeções tipo DRE</li>
            <li>✓ Ações práticas para aumentar resultados</li>
          </ul>
        </div>
      )}
    </Card>
  );
}
