import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FinancialDashboard from "@/components/dashboard/FinancialDashboard";
import CaseTimelineManager from "@/components/case/CaseTimelineManager";
import AcordoSentencaForm from "@/components/case/AcordoSentencaForm";

interface Case {
  id: string;
  author_name: string;
  author_cpf: string;
  status: string;
  created_at: string;
  event_date: string;
}

export default function ProtocoladasView() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('status', 'protocolada')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCases(data || []);
    } catch (error) {
      console.error('Erro ao carregar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Gestão de Casos Protocolados</h1>
              <p className="text-muted-foreground">Acompanhe o andamento processual e financeiro</p>
            </div>
          </div>
        </div>

        {/* Dashboard Financeiro */}
        <FinancialDashboard />

        <Separator className="my-8" />

        {/* Lista de Casos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Casos em Andamento</h2>
            <Badge variant="outline" className="text-base">
              {cases.length} casos
            </Badge>
          </div>

          {loading ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">Carregando casos...</p>
            </Card>
          ) : cases.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Nenhum caso protocolado</p>
              <p className="text-muted-foreground">
                Os casos protocolados aparecerão aqui
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {cases.map((caso) => (
                <Card key={caso.id} className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold">{caso.author_name}</h3>
                      <p className="text-sm text-muted-foreground">CPF: {caso.author_cpf}</p>
                      <p className="text-sm text-muted-foreground">
                        Data do Evento: {new Date(caso.event_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-base">
                      Protocolada
                    </Badge>
                  </div>

                  {/* Timeline Processual */}
                  <CaseTimelineManager caseId={caso.id} />

                  {/* Botões de Ação */}
                  <div className="flex gap-2 mt-4">
                    <AcordoSentencaForm caseId={caso.id} onSuccess={loadCases} />
                    <Button variant="outline" onClick={() => navigate(`/novo-caso?id=${caso.id}`)}>
                      Ver Detalhes Completos
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
