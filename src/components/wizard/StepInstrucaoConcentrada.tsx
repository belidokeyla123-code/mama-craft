import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CaseData } from '@/pages/NewCase';

interface StepInstrucaoConcentradaProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepInstrucaoConcentrada = ({ data, updateData }: StepInstrucaoConcentradaProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validar tipo
    if (!file.type.startsWith('video/')) {
      toast.error('Apenas arquivos de vídeo são permitidos');
      return;
    }
    
    // Validar tamanho (máx 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Vídeo muito grande (máx 50MB)');
      return;
    }
    
    setIsAnalyzing(true);
    try {
      // Converter para base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise((resolve) => { reader.onload = resolve; });
      const base64Video = reader.result?.toString().split(',')[1];
      
      // Chamar edge function
      const { data: analysis, error } = await supabase.functions.invoke('analyze-video', {
        body: {
          caseId: data.caseId,
          videoFile: base64Video
        }
      });
      
      if (error) throw error;
      
      setVideoAnalysis(analysis);
      
      toast.success('Vídeo analisado com sucesso!');
    } catch (error: any) {
      console.error('Erro:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Video className="h-7 w-7" />
          Instrução Concentrada (Vídeos e Depoimentos)
        </h2>
        <p className="text-muted-foreground mb-6">
          Faça upload de vídeos mostrando a propriedade rural, atividades agrícolas, depoimentos, etc.
          A IA analisará o conteúdo e extrairá informações relevantes para a petição.
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoUpload}
        />
        
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          className="gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Analisando vídeo...
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              Fazer Upload de Vídeo
            </>
          )}
        </Button>
      </Card>
      
      {videoAnalysis && (
        <Card className="p-6 border-primary">
          <h3 className="text-xl font-bold mb-4">📹 Análise do Vídeo</h3>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold">Descrição:</h4>
              <p className="text-muted-foreground">{videoAnalysis.descricao_video}</p>
            </div>
            
            <div>
              <h4 className="font-semibold">Relevância para o Caso:</h4>
              <p className="text-muted-foreground">{videoAnalysis.relevancia_caso}</p>
            </div>
            
            {videoAnalysis.informacoes_extraidas && (
              <div>
                <h4 className="font-semibold">Informações Extraídas:</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Local: {videoAnalysis.informacoes_extraidas.local}</li>
                  <li>Atividades: {videoAnalysis.informacoes_extraidas.atividades?.join(', ')}</li>
                  {videoAnalysis.informacoes_extraidas.evidencias_rurais && (
                    <li>Evidências Rurais: {videoAnalysis.informacoes_extraidas.evidencias_rurais.join(', ')}</li>
                  )}
                </ul>
              </div>
            )}
            
            <div className="bg-primary/10 p-4 rounded">
              <h4 className="font-semibold">💡 Sugestão para Petição:</h4>
              <p className="text-sm">{videoAnalysis.sugestao_uso_peticao}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};