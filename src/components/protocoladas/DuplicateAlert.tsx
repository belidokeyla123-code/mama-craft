import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DuplicateAlertProps {
  authorName: string;
  authorCpf: string;
  benefitType?: string;
  currentCaseId?: string;
}

interface SimilarCase {
  id: string;
  author_name: string;
  author_cpf: string;
  status: string;
  created_at: string;
  event_date: string;
}

export default function DuplicateAlert({ authorName, authorCpf, benefitType, currentCaseId }: DuplicateAlertProps) {
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDuplicates();
  }, [authorName, authorCpf]);

  const checkDuplicates = async () => {
    if (!authorName && !authorCpf) {
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('cases')
        .select('id, author_name, author_cpf, status, created_at, event_date')
        .or(`author_cpf.eq.${authorCpf},author_name.ilike.%${authorName}%`)
        .in('status', ['protocolada', 'em_audiencia', 'acordo', 'sentenca'])
        .order('created_at', { ascending: false });

      // Excluir o caso atual se estiver editando
      if (currentCaseId) {
        query = query.neq('id', currentCaseId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setSimilarCases(data || []);
    } catch (error) {
      console.error('Erro ao verificar duplicatas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (similarCases.length === 0) {
    return null;
  }

  // Classificar casos similares
  const acordos = similarCases.filter(c => c.status === 'acordo');
  const emAndamento = similarCases.filter(c => c.status === 'protocolada' || c.status === 'em_audiencia');

  const getAlertType = () => {
    if (acordos.length > 0) {
      return 'success';
    }
    if (emAndamento.length > 0) {
      return 'info';
    }
    return 'default';
  };

  const getAlertMessage = () => {
    if (acordos.length > 0) {
      return {
        title: "⚠️ Atenção: Caso Similar com Acordo Anterior",
        description: `Encontramos ${acordos.length} caso(s) anterior(es) com ACORDO para ${authorName}. Considere usar como precedente!`,
        icon: CheckCircle2,
        color: "text-green-600"
      };
    }

    if (emAndamento.length > 0) {
      return {
        title: "⚠️ Possível Duplicidade",
        description: `Existe(m) ${emAndamento.length} caso(s) em andamento para ${authorName}. Verifique antes de protocolar!`,
        icon: AlertTriangle,
        color: "text-orange-600"
      };
    }

    return {
      title: "Casos Similares Encontrados",
      description: `Encontramos ${similarCases.length} caso(s) similar(es).`,
      icon: AlertTriangle,
      color: "text-blue-600"
    };
  };

  const alertInfo = getAlertMessage();
  const Icon = alertInfo.icon;

  return (
    <Alert className={`mb-6 border-2 ${
      acordos.length > 0 
        ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
        : 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
    }`}>
      <Icon className={`h-5 w-5 ${alertInfo.color}`} />
      <AlertTitle className="font-bold">{alertInfo.title}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{alertInfo.description}</p>
        
        <div className="space-y-2">
          {similarCases.slice(0, 3).map((caso) => (
            <div key={caso.id} className="flex items-center justify-between p-2 bg-background rounded border">
              <div className="flex-1">
                <p className="font-medium text-sm">{caso.author_name}</p>
                <p className="text-xs text-muted-foreground">
                  CPF: {caso.author_cpf} • Protocolo: {new Date(caso.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {caso.status === 'acordo' && (
                  <Badge className="bg-green-600">Acordo</Badge>
                )}
                {(caso.status === 'protocolada' || caso.status === 'em_audiencia') && (
                  <Badge variant="outline">Em Andamento</Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => window.open(`/caso/${caso.id}`, '_blank')}>
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          
          {similarCases.length > 3 && (
            <p className="text-sm text-muted-foreground text-center">
              + {similarCases.length - 3} caso(s) similar(es)
            </p>
          )}
        </div>

        {acordos.length > 0 && (
          <div className="mt-3 p-3 bg-green-100 dark:bg-green-900/20 rounded border border-green-300 dark:border-green-700">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              💡 Dica: Informe ao juiz sobre o(s) precedente(s) favorável(is) antes da distribuição para otimizar o processo!
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
