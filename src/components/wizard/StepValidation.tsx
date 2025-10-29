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
import { useCacheInvalidation } from "@/hooks/useCacheInvalidation";

interface StepValidationProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepValidation = ({ data, updateData }: StepValidationProps) => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const { toast } = useToast();

  // Invalidar caches quando revalidar manualmente
  useCacheInvalidation({
    caseId: data.caseId || '',
    triggerType: 'validation',
    watchFields: [isValidating],
  });

  useEffect(() => {
    if (data.caseId && !validationResult) {
      handleValidate();
    }
  }, [data.caseId]);

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

      // Auto-disparar análise se documentos suficientes
      if (result.is_sufficient) {
        sonnerToast.info('Documentos suficientes! Iniciando análise jurídica...');
        
        setTimeout(async () => {
          try {
            await supabase.functions.invoke('analyze-case-legal', {
              body: { caseId: data.caseId }
            });
          } catch (error) {
            console.error('Erro na análise automática:', error);
          }
        }, 2000);
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

  const handleReconvertFailedPdfs = async () => {
    if (!data.caseId) return;
    
    setIsValidating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('reconvert-failed-pdfs', {
        body: { caseId: data.caseId }
      });

      if (error) throw error;

      if (result.reprocessed === 0) {
        sonnerToast.info('Todos os documentos já foram processados!');
      } else {
        sonnerToast.success(`${result.reprocessed} documento(s) sendo reprocessado(s)!`);
        
        // Aguardar 5 segundos e revalidar
        setTimeout(async () => {
          await handleValidate();
          sonnerToast.info('Checklist atualizado!');
        }, 5000);
      }
    } catch (error: any) {
      console.error('Erro ao reprocessar:', error);
      toast({
        title: "Erro ao reprocessar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // 🔄 Função para reprocessar TODOS os documentos em lotes de 3
  const handleReprocessAllDocuments = async () => {
    if (!data.caseId) return;
    
    setIsValidating(true);
    try {
      sonnerToast.info('Buscando documentos para reprocessamento...');
      
      // Buscar todos os PDFs originais (sem parent_document_id)
      const { data: allPdfs, error: fetchError } = await supabase
        .from('documents')
        .select('id, file_name')
        .eq('case_id', data.caseId)
        .is('parent_document_id', null)
        .order('uploaded_at', { ascending: true });
      
      if (fetchError) throw fetchError;
      
      if (!allPdfs || allPdfs.length === 0) {
        sonnerToast.info('Nenhum documento encontrado para reprocessar');
        return;
      }

      console.log(`[REPROCESS] Reprocessando ${allPdfs.length} documento(s)...`);
      sonnerToast.info(`Reprocessando ${allPdfs.length} documento(s) em lotes...`);

      // Processar em lotes de 3
      const batchSize = 3;
      let processedCount = 0;
      
      for (let i = 0; i < allPdfs.length; i += batchSize) {
        const batch = allPdfs.slice(i, i + batchSize);
        console.log(`[REPROCESS] Lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(allPdfs.length / batchSize)}`);
        
        const { error: invokeError } = await supabase.functions.invoke('process-documents-with-ai', {
          body: { 
            caseId: data.caseId,
            documentIds: batch.map(d => d.id)
          }
        });
        
        if (invokeError) {
          console.error('[REPROCESS] Erro no lote:', invokeError);
          sonnerToast.error(`Erro ao processar lote ${Math.floor(i / batchSize) + 1}`);
        } else {
          processedCount += batch.length;
          sonnerToast.info(`Processados ${processedCount}/${allPdfs.length} documentos...`);
        }
        
        // Aguardar 3 segundos entre lotes
        if (i + batchSize < allPdfs.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      sonnerToast.success(`${processedCount} documento(s) reprocessado(s)! Aguarde a validação...`);
      
      // Aguardar 8 segundos e revalidar
      setTimeout(async () => {
        await handleValidate();
        sonnerToast.info('Checklist atualizado!');
      }, 8000);
    } catch (error: any) {
      console.error('[REPROCESS] Erro:', error);
      toast({
        title: "Erro ao reprocessar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
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
            {checklist.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-3 p-3 border rounded">
                <div className="flex items-center gap-3 flex-1">
                  {item.document ? (
                    <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{item.item}</p>
                    {item.document && (
                      <p className="text-xs text-muted-foreground">
                        {item.document.file_name}
                      </p>
                    )}
                  </div>
                  <Badge variant={item.document ? "outline" : "destructive"} className={item.document ? "text-success border-success" : ""}>
                    {item.document ? "OK" : "Faltante"}
                  </Badge>
                  <Badge variant={item.importance === 'critical' ? 'destructive' : 'secondary'}>
                    {item.importance}
                  </Badge>
                </div>
                
                {/* Botão de exclusão se documento presente */}
                {item.document && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteDocument(item.document.id)}
                    className="flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                
                {/* Botão de upload se documento faltante */}
                {!item.document && (item.importance === 'critical' || item.importance === 'high') && data.caseId && (
                  <DocumentUploadInline 
                    caseId={data.caseId}
                    suggestedDocType={item.item}
                    onUploadComplete={async () => {
                      sonnerToast.info('Documento processado! Revalidando...');
                      await handleValidate();
                      sonnerToast.success('Checklist atualizado!');
                    }}
                  />
                )}
              </div>
            ))}
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
            sonnerToast.info('Documento processado! Revalidando...');
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

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleValidate} disabled={isValidating} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Validar Novamente
        </Button>
        <Button 
          onClick={handleReconvertFailedPdfs} 
          disabled={isValidating}
          variant="outline" 
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reprocessar Falhados
        </Button>
        <Button 
          onClick={handleReprocessAllDocuments} 
          disabled={isValidating}
          variant="outline" 
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reprocessar Tudo
        </Button>
      </div>

    </div>
  );
};
