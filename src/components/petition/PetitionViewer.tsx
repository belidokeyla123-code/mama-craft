import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Info, Lock } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFinalizeVersion } from "@/hooks/useFinalizeVersion";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface PetitionViewerProps {
  petition: string;
  qualityReport?: any;
  caseId?: string;
  currentDraftId?: string;
}

export const PetitionViewer = ({ petition, qualityReport, caseId, currentDraftId }: PetitionViewerProps) => {
  const [isFinal, setIsFinal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [petitionContent, setPetitionContent] = useState(petition);
  const [isSaving, setIsSaving] = useState(false);
  const { finalizeVersion } = useFinalizeVersion();

  // Atualizar conteúdo quando a prop petition mudar
  useEffect(() => {
    setPetitionContent(petition);
  }, [petition]);

  // Verificar se é versão final
  useEffect(() => {
    const checkIfFinal = async () => {
      if (!caseId || !currentDraftId) return;
      
      const { data } = await supabase
        .from('drafts')
        .select('is_final')
        .eq('id', currentDraftId)
        .maybeSingle();
      
      if (data) {
        setIsFinal(data.is_final || false);
      }
    };
    
    checkIfFinal();
  }, [caseId, currentDraftId]);

  // Configuração da barra de ferramentas do ReactQuill
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['clean']
    ]
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'align',
    'list', 'bullet',
    'indent'
  ];

  // Debounce para auto-save (2 segundos)
  useEffect(() => {
    if (!currentDraftId || isFinal || petitionContent === petition) return;
    
    const timer = setTimeout(async () => {
      setIsSaving(true);
      
      const { error } = await supabase
        .from('drafts')
        .update({ markdown_content: petitionContent })
        .eq('id', currentDraftId);
      
      if (!error) {
        toast.success('💾 Petição salva automaticamente', { duration: 2000 });
      } else {
        console.error('Erro ao salvar:', error);
      }
      
      setIsSaving(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [petitionContent, currentDraftId, isFinal, petition]);

  const handleFinalize = async () => {
    if (!caseId || !currentDraftId) return;
    
    const confirmed = window.confirm(
      '🔒 Tem certeza que deseja marcar esta como VERSÃO FINAL?\n\n' +
      'Esta ação irá:\n' +
      '✅ Congelar esta versão (não poderá mais editar)\n' +
      '✅ Bloquear reprocessamentos automáticos\n' +
      '✅ Torná-la pronta para protocolar\n\n' +
      'Você poderá descongelar depois se necessário.'
    );
    
    if (!confirmed) return;
    
    setIsLoading(true);
    try {
      await finalizeVersion(caseId, currentDraftId);
      setIsFinal(true);
      toast.success('✅ Versão final salva com sucesso!');
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      toast.error('Erro ao finalizar versão');
    } finally {
      setIsLoading(false);
    }
  };

  if (!petition) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <Info className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">
              A petição será gerada aqui após a análise dos documentos
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {caseId && currentDraftId && (
        <div className="flex items-center justify-between">
          {isFinal ? (
            <Badge variant="default" className="gap-2 bg-green-600 hover:bg-green-700">
              <Lock className="h-3 w-3" />
              Versão Final Congelada
            </Badge>
          ) : (
            <Button
              onClick={handleFinalize}
              disabled={isLoading}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              Salvar Versão Final
            </Button>
          )}
        </div>
      )}

      {qualityReport && (
        <Card className={
          qualityReport.status === 'aprovado' 
            ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
            : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
        }>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {qualityReport.status === 'aprovado' ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Qualidade: Aprovada</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span>Qualidade: Atenção Necessária</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qualityReport.status === 'atencao' && qualityReport.issues && (
              <ul className="space-y-1 text-sm">
                {qualityReport.issues.map((issue: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-yellow-600">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Petição Gerada</span>
            {isSaving && (
              <span className="text-sm text-green-600 font-normal flex items-center gap-2">
                <span className="animate-pulse">💾</span>
                Salvando...
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative">
            <ReactQuill
              theme="snow"
              value={petitionContent}
              onChange={setPetitionContent}
              modules={modules}
              formats={formats}
              readOnly={isFinal}
              className="quill-editor"
              placeholder="A petição será gerada aqui..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
