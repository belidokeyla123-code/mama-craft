import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PasteDataInlineProps {
  extractionType: "terra" | "processo_administrativo";
  onDataExtracted: (data: any) => void;
  placeholder?: string;
}

export const PasteDataInline = ({ 
  extractionType, 
  onDataExtracted,
  placeholder = "Cole aqui o texto do documento..." 
}: PasteDataInlineProps) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExtract = async () => {
    if (!text.trim()) {
      toast.error("Por favor, cole algum texto primeiro");
      return;
    }

    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('extract-data-from-text', {
        body: { text, extractionType }
      });

      if (error) throw error;

      if (result?.success && result?.data) {
        onDataExtracted(result.data);
        toast.success("Dados extraídos com sucesso!");
        setText(""); // Limpar textarea
      } else {
        throw new Error("Nenhum dado foi extraído");
      }
    } catch (error: any) {
      console.error('Erro ao extrair dados:', error);
      toast.error('Erro ao extrair dados do texto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-200 dark:border-blue-800">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <Sparkles className="h-4 w-4" />
          Opção 2: Colar Texto e Extrair com IA
        </div>
        
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="font-mono text-sm"
        />
        
        <Button 
          onClick={handleExtract} 
          disabled={loading || !text.trim()}
          className="w-full gap-2"
          variant="outline"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Extraindo dados...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Extrair Dados com IA
            </>
          )}
        </Button>
        
        <p className="text-xs text-muted-foreground">
          Cole o texto do documento (pode ser print, cópia de PDF, etc) e a IA vai extrair as informações automaticamente
        </p>
      </div>
    </Card>
  );
};
