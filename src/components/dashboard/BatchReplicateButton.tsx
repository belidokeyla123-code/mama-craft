import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PlayCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CaseToProcess {
  id: string;
  author_name: string;
  status: string;
  processing?: boolean;
  completed?: boolean;
  error?: string;
}

export const BatchReplicateButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [cases, setCases] = useState<CaseToProcess[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingCases, setIsLoadingCases] = useState(false);

  const loadCases = async () => {
    setIsLoadingCases(true);
    try {
      // Buscar casos que não estão em "protocolada" ou "ready_to_protocolo"
      const { data, error } = await supabase
        .from('cases')
        .select('id, author_name, status')
        .not('status', 'in', '("protocolada","ready_to_protocolo")')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setCases((data || []).map(c => ({
        id: c.id,
        author_name: c.author_name,
        status: c.status,
        processing: false,
        completed: false,
      })));
    } catch (error: any) {
      console.error('[BATCH] Erro ao carregar casos:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setIsLoadingCases(false);
    }
  };

  const processAllCases = async () => {
    if (cases.length === 0) {
      toast.error('Nenhum caso para processar');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Processando ${cases.length} casos...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < cases.length; i++) {
      const currentCase = cases[i];
      
      // Marcar como processando
      setCases(prev => prev.map((c, idx) => 
        idx === i ? { ...c, processing: true, completed: false, error: undefined } : c
      ));

      try {
        console.log(`[BATCH] Processando caso ${i + 1}/${cases.length}: ${currentCase.author_name}`);
        
        const { data: result, error } = await supabase.functions.invoke('replicate-case-structure', {
          body: { caseId: currentCase.id, forceReprocess: false }
        });

        if (error) throw error;

        if (result?.success) {
          successCount++;
          setCases(prev => prev.map((c, idx) => 
            idx === i ? { ...c, processing: false, completed: true } : c
          ));
        } else {
          throw new Error(result?.message || 'Falha desconhecida');
        }
      } catch (error: any) {
        errorCount++;
        console.error(`[BATCH] Erro no caso ${currentCase.author_name}:`, error);
        setCases(prev => prev.map((c, idx) => 
          idx === i ? { ...c, processing: false, completed: false, error: error.message } : c
        ));
      }

      // Aguardar 2 segundos entre casos para evitar rate limit
      if (i < cases.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setIsProcessing(false);
    toast.success(`✅ Processamento concluído: ${successCount} sucesso, ${errorCount} erros`, { id: toastId });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (open && cases.length === 0) {
        loadCases();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2">
          <PlayCircle className="h-5 w-5" />
          Replicar Estrutura em Lote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Replicar Estrutura Completa em Lote</DialogTitle>
          <DialogDescription>
            Execute o pipeline completo (validação → análise → jurisprudência → teses → minuta) em múltiplos casos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoadingCases ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : cases.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">Nenhum caso pendente encontrado</p>
              <Button onClick={loadCases} variant="outline" className="mt-4">
                Recarregar
              </Button>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Casos a Processar ({cases.length})</CardTitle>
                  <CardDescription>
                    Clique em "Processar Todos" para iniciar o pipeline em cada caso
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-2">
                      {cases.map((c, idx) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {c.processing ? (
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            ) : c.completed ? (
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : c.error ? (
                              <XCircle className="h-5 w-5 text-destructive" />
                            ) : (
                              <div className="h-5 w-5 rounded-full border-2 border-muted" />
                            )}
                            <div>
                              <p className="font-medium">{c.author_name}</p>
                              {c.error && (
                                <p className="text-xs text-destructive mt-1">{c.error}</p>
                              )}
                            </div>
                          </div>
                          <Badge variant={c.completed ? 'default' : 'outline'}>
                            {c.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsOpen(false);
                    setCases([]);
                  }}
                  disabled={isProcessing}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={processAllCases}
                  disabled={isProcessing || cases.length === 0}
                  className="gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Processar Todos ({cases.length})
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
