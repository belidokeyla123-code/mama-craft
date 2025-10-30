import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface SyncStatusIndicatorProps {
  caseId: string;
  stage: 'validacao' | 'analise' | 'jurisprudencia' | 'teses' | 'peticao';
}

/**
 * ✅ FASE 6: Indicador visual de sincronização em tempo real
 * 
 * Mostra o status de cada estágio (synced, stale, missing) e permite
 * reprocessamento manual se necessário.
 */
export const SyncStatusIndicator = ({ caseId, stage }: SyncStatusIndicatorProps) => {
  const [status, setStatus] = useState<'synced' | 'stale' | 'missing'>('synced');
  const [isReprocessing, setIsReprocessing] = useState(false);
  
  useEffect(() => {
    const checkStatus = async () => {
      if (!caseId) return;
      
      const tableMap = {
        validacao: 'document_validation',
        analise: 'case_analysis',
        jurisprudencia: 'jurisprudence_results',
        teses: 'teses_juridicas',
        peticao: 'drafts'
      };
      
      try {
        const { data } = await supabase
          .from(tableMap[stage] as any)
          .select('*')
          .eq('case_id', caseId)
          .maybeSingle();
        
        if (!data) {
          setStatus('missing');
        } else if ((data as any).is_stale === true) {
          setStatus('stale');
        } else {
          setStatus('synced');
        }
      } catch (error) {
        console.error('[SYNC-INDICATOR] Erro ao verificar status:', error);
      }
    };
    
    checkStatus();
    
    // Verificar a cada 5 segundos
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [caseId, stage]);
  
  const handleReprocess = async () => {
    setIsReprocessing(true);
    
    const functionMap = {
      validacao: 'validate-case-documents',
      analise: 'analyze-case-legal',
      jurisprudencia: 'search-jurisprudence',
      teses: 'generate-tese-juridica',
      peticao: 'generate-petition'
    };
    
    const labelMap = {
      validacao: 'Validação',
      analise: 'Análise',
      jurisprudencia: 'Jurisprudência',
      teses: 'Teses',
      peticao: 'Petição'
    };
    
    try {
      toast.info(`🔄 Reprocessando ${labelMap[stage]}...`);
      
      await supabase.functions.invoke(functionMap[stage], { 
        body: { caseId } 
      });
      
      toast.success(`✅ ${labelMap[stage]} atualizada!`);
      
      // Recarregar status após 2 segundos
      setTimeout(() => setIsReprocessing(false), 2000);
    } catch (error: any) {
      console.error('[SYNC-INDICATOR] Erro ao reprocessar:', error);
      toast.error(`Erro ao reprocessar ${labelMap[stage]}`);
      setIsReprocessing(false);
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      {status === 'synced' && (
        <Badge variant="outline" className="bg-success/10 text-success border-success">
          <CheckCircle className="h-3 w-3 mr-1" />
          Sincronizado
        </Badge>
      )}
      
      {status === 'stale' && (
        <>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning">
            <AlertCircle className="h-3 w-3 mr-1" />
            Desatualizado
          </Badge>
          <Button 
            size="sm" 
            variant="ghost"
            onClick={handleReprocess}
            disabled={isReprocessing}
            className="h-7 px-2"
          >
            {isReprocessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
      
      {status === 'missing' && (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Não Processado
        </Badge>
      )}
    </div>
  );
};