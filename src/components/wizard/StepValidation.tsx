import { useState, useEffect } from "react";
import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, XCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { DocumentUploadInline } from "./DocumentUploadInline";
import { useTabSync } from "@/hooks/useTabSync";

interface StepValidationProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepValidation = ({ data, updateData }: StepValidationProps) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const { toast } = useToast();

  // ✅ FASE 3: Sincronização em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['validation-updated', 'documents-updated', 'documents-classified', 'processing-completed'],  // 🆕 NOVO
    onSync: (detail) => {
      console.log('[StepValidation] 🔄 Validação ou documentos atualizados, recarregando...');
      if (detail.timestamp && !isValidating) {
        handleValidate();
      }
    }
  });

  useEffect(() => {
    if (data.caseId) {
      // Carregar validação do banco primeiro
      loadValidationFromDB();
    }

    const handleRevalidate = () => {
      handleValidate();
    };
    
    window.addEventListener('revalidate-documents', handleRevalidate);
    
    return () => {
      window.removeEventListener('revalidate-documents', handleRevalidate);
    };
  }, [data.caseId]);

  const loadValidationFromDB = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: validation, error } = await supabase
        .from('document_validation')
        .select('*')
        .eq('case_id', data.caseId)
        .order('validated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && validation) {
        setValidationResult(validation);
        console.log('[StepValidation] ✅ Validação carregada do banco:', validation);
      } else if (!validation) {
        // Se não há validação salva, executar validação
        handleValidate();
      }
    } catch (error) {
      console.error('[StepValidation] Erro ao carregar validação:', error);
      handleValidate();
    }
  };

  const handleValidate = async () => {
    if (!data.caseId) return;
    
    setIsValidating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('validate-case-documents', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429') || result?.code === 'RATE_LIMIT') {
          toast({
            title: "Rate limit atingido",
            description: "Muitas requisições. Aguarde 30 segundos e tente novamente.",
            variant: "destructive",
          });
          return;
        }
        if (error.message?.includes('402') || result?.code === 'NO_CREDITS') {
          toast({
            title: "Créditos esgotados",
            description: "Adicione mais créditos Lovable AI em Settings.",
            variant: "destructive",
          });
          return;
        }
        if (error.message?.includes('408') || result?.code === 'TIMEOUT') {
          toast({
            title: "Timeout",
            description: "A validação demorou muito. Tente novamente.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      setValidationResult(result);
      
      toast({
        title: result.is_sufficient ? "Validação aprovada" : "Validação pendente",
        description: result.is_sufficient 
          ? "Documentação suficiente para prosseguir" 
          : "Adicione mais documentos",
      });

      // Pipeline agora é manual na aba Minuta
      if (result.is_sufficient) {
        sonnerToast.success('✅ Documentos suficientes! Vá para a aba Minuta e execute o Pipeline.');
      }
    } catch (error: any) {
      console.error('Erro na validação:', error);
      toast({
        title: "Erro na validação",
        description: error.message || "Erro desconhecido. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      // 1. Buscar documento para pegar file_path
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('file_path, file_name')
        .eq('id', documentId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // 2. Confirmar exclusão
      if (!confirm(`Excluir "${doc.file_name}"?`)) return;
      
      // 3. Excluir do storage
      await supabase.storage
        .from('case-documents')
        .remove([doc.file_path]);
      
      // 4. Excluir do banco
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);
      
      if (deleteError) throw deleteError;
      
      toast({
        title: "Documento excluído",
        description: `${doc.file_name} foi removido com sucesso.`,
      });
      
      // 5. Revalidar
      await handleValidate();
    } catch (error: any) {
      console.error('Erro ao excluir:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleQuickReclassify = async (docType: string) => {
    try {
      console.log('[RECLASSIFY] 🔄 Buscando documentos "outro" para reclassificar como:', docType);
      
      // Buscar documentos tipo "outro"
      const { data: outrosDocs } = await supabase
        .from('documents')
        .select('*')
        .eq('case_id', data.caseId)
        .eq('document_type', 'outro')
        .limit(5);
      
      if (!outrosDocs || outrosDocs.length === 0) {
        toast({
          title: "Nenhum documento encontrado",
          description: "Não há documentos não identificados para reclassificar.",
          variant: "default"
        });
        return;
      }

      // Mostrar lista de documentos "outro" para o usuário escolher
      sonnerToast.info(`Encontrados ${outrosDocs.length} documentos não identificados. Reprocessando como "${docType}"...`);

      // Reprocessar primeiro documento "outro" como o tipo desejado
      const { error } = await supabase.functions.invoke('analyze-single-document', {
        body: { 
          documentId: outrosDocs[0].id,
          caseId: data.caseId,
          forceDocType: docType
        }
      });

      if (error) throw error;

      toast({
        title: "✅ Documento reclassificado",
        description: `"${outrosDocs[0].file_name}" agora é "${docType}"`
      });

      // Revalidar
      setTimeout(() => handleValidate(), 2000);

    } catch (error: any) {
      console.error('[RECLASSIFY] Erro:', error);
      toast({
        title: "Erro ao reclassificar",
        description: error.message,
        variant: "destructive"
      });
    }
  };


  if (isValidating || !validationResult) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Validando documentação...</p>
            <p className="text-sm text-muted-foreground">
              Analisando {data.caseId ? 'seus documentos' : 'caso'} com IA...
            </p>
            <p className="text-xs text-muted-foreground">Isso pode levar até 20 segundos</p>
          </div>
        </div>
      </Card>
    );
  }

  const { score, is_sufficient, checklist, missing_docs, recommendations } = validationResult;


  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Score de Suficiência</h3>
          <div className="flex items-center gap-2">
            {is_sufficient ? (
              <CheckCircle className="h-6 w-6 text-success" />
            ) : (
              <XCircle className="h-6 w-6 text-destructive" />
            )}
            <span className="text-2xl font-bold">{score}/10</span>
          </div>
        </div>
        <Progress value={score * 10} className="h-3" />
      </Card>

      {checklist && checklist.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Checklist Documental</h3>
          <div className="space-y-2">
            {checklist.map((item: any, idx: number) => {
              const isOk = item.status === 'ok';
              const isCritical = item.importance === 'critical';
              const hasDocumentId = !!item.document_id;
              
              return (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between gap-3 p-3 border-l-4 rounded transition-all ${
                    isOk 
                      ? 'border-success bg-success/5' 
                      : isCritical 
                        ? 'border-destructive bg-destructive/5' 
                        : 'border-warning bg-warning/5'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {isOk ? (
                      <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.item}</p>
                      {hasDocumentId && isOk && (
                        <p className="text-xs text-success mt-1">
                          ✓ Documento enviado e validado
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={isOk ? "outline" : isCritical ? "destructive" : "secondary"} className={isOk ? "text-success border-success" : ""}>
                        {isOk ? "✓ Enviado" : "Faltante"}
                      </Badge>
                      <Badge variant={isCritical ? 'destructive' : 'secondary'}>
                        {item.importance}
                      </Badge>
                      
                      {/* Botão "Buscar em Outros" para documentos faltantes */}
                      {!isOk && item.status === 'missing' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleQuickReclassify(item.item)}
                          className="text-xs"
                        >
                          🔄 Buscar em "Outros"
                        </Button>
                      )}
                    </div>
                  </div>
                
                  {/* Botão de exclusão se documento presente */}
                  {hasDocumentId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteDocument(item.document_id)}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  
                   {/* Botão de upload se documento faltante */}
                   {!hasDocumentId && (item.importance === 'critical' || item.importance === 'high') && data.caseId && (
                    <DocumentUploadInline 
                      caseId={data.caseId}
                      suggestedDocType={item.item}
                      onUploadComplete={async () => {
                        sonnerToast.info('Documento enviado! Processando...');
                        // ⏳ Aguardar 5 segundos para processamento completo
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        await handleValidate();
                        sonnerToast.success('Checklist atualizado!');
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {missing_docs && missing_docs.length > 0 && (
        <Card className="p-6 border-destructive">
          <h3 className="text-lg font-semibold mb-4 text-destructive">Documentos Faltantes</h3>
          <div className="space-y-4">
            {missing_docs.map((doc: any, idx: number) => (
              <div key={idx} className="border-l-4 border-destructive pl-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{doc.doc_type}</span>
                    <Badge variant="destructive">{doc.importance}</Badge>
                  </div>
                  
      {(doc.importance === 'critical' || doc.importance === 'high') && data.caseId && (
        <DocumentUploadInline 
          caseId={data.caseId}
          suggestedDocType={doc.doc_type}
          onUploadComplete={async () => {
            sonnerToast.info('Documento enviado! Processando...');
            // ⏳ Aguardar 5 segundos para processamento completo
            await new Promise(resolve => setTimeout(resolve, 5000));
            await handleValidate();
            sonnerToast.success('Checklist atualizado!');
          }}
        />
      )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">{doc.reason}</p>
                {doc.impact && (
                  <p className="text-sm text-destructive">{doc.impact}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button 
          onClick={handleValidate} 
          disabled={isValidating}
          className="gap-2"
        >
          {isValidating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Atualizando...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </>
          )}
        </Button>
      </div>

    </div>
  );
};
