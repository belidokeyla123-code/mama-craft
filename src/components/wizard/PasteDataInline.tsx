import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PasteDataInlineProps {
  extractionType: "terra" | "processo_administrativo" | "historico_escolar" | "declaracao_saude_ubs";
  onDataExtracted: (data: any) => void;
  placeholder?: string;
}

export const PasteDataInline = ({ 
  extractionType, 
  onDataExtracted,
  placeholder = "Cole aqui o texto do documento ou CTRL+V uma imagem (print)..." 
}: PasteDataInlineProps) => {
  const [text, setText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Se for imagem
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        
        // Converter para base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setImageBase64(base64);
          setText(""); // Limpar texto se houver
          toast.success("Imagem colada! Clique em 'Extrair Dados' para processar.");
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
  };

  const handleExtract = async () => {
    if (!text.trim() && !imageBase64) {
      toast.error("Por favor, cole algum texto ou imagem primeiro");
      return;
    }

    setLoading(true);
    try {
      const payload: any = { extractionType };
      
      if (imageBase64) {
        payload.image = imageBase64;
      } else {
        payload.text = text;
      }
      
      const { data: result, error } = await supabase.functions.invoke('extract-data-from-text', {
        body: payload
      });

      if (error) throw error;

      if (result?.success && result?.data) {
        onDataExtracted(result.data);
        toast.success("Dados extraídos com sucesso!");
        setText("");
        setImageBase64(null);
      } else {
        throw new Error("Nenhum dado foi extraído");
      }
    } catch (error: any) {
      console.error('Erro ao extrair dados:', error);
      toast.error('Erro ao extrair dados');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-2 border-blue-200 dark:border-blue-800">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <Sparkles className="h-4 w-4" />
          Opção 2: Colar Texto ou Imagem (Print) e Extrair com IA
        </div>
        
        {imageBase64 ? (
          <div className="relative border-2 border-dashed border-blue-300 rounded-lg p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImageBase64(null)}
              className="absolute top-1 right-1 h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
            <img 
              src={imageBase64} 
              alt="Preview" 
              className="max-h-48 mx-auto rounded"
            />
            <p className="text-xs text-center mt-2 text-muted-foreground">
              Imagem colada - pronta para extrair
            </p>
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={6}
            className="font-mono text-sm"
          />
        )}
        
        <Button 
          onClick={handleExtract} 
          disabled={loading || (!text.trim() && !imageBase64)}
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
        
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <p>
            Cole TEXTO copiado OU CTRL+V uma IMAGEM (print de tela). A IA vai analisar e extrair as informações automaticamente.
          </p>
        </div>
      </div>
    </Card>
  );
};