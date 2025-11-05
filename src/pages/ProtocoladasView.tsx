import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FinancialDashboard from "@/components/dashboard/FinancialDashboard";
import CaseTimelineManager from "@/components/case/CaseTimelineManager";
import AcordoSentencaForm from "@/components/case/AcordoSentencaForm";
import AdvancedFilters, { FilterValues } from "@/components/protocoladas/AdvancedFilters";
import ExportButton from "@/components/protocoladas/ExportButton";
import InsightsPanel from "@/components/protocoladas/InsightsPanel";
import FinancialManager from "@/components/protocoladas/FinancialManager";

interface Case {
  id: string;
  author_name: string;
  author_cpf: string;
  status: string;
  created_at: string;
  event_date: string;
  tipo_conclusao?: string;
  data_conclusao?: string;
  data_protocolo?: string;
  valor_causa?: number;
  valor_honorarios?: number;
}

export default function ProtocoladasView() {
  const navigate = useNavigate();
  const [allCases, setAllCases] = useState<Case[]>([]);
  const [filteredCases, setFilteredCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          case_financial(*)
        `)
        .eq('status', 'protocolada')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Mesclar dados financeiros
      const casesWithFinancial = (data || []).map(c => ({
        ...c,
        valor_causa: c.case_financial?.[0]?.valor_causa,
        valor_honorarios: c.case_financial?.[0]?.valor_honorarios,
        data_protocolo: c.case_financial?.[0]?.data_protocolo,
      }));
      
      setAllCases(casesWithFinancial);
      setFilteredCases(casesWithFinancial);
    } catch (error) {
      console.error('Erro ao carregar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filters: FilterValues) => {
    let filtered = [...allCases];

    // Busca por nome ou CPF
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.author_name?.toLowerCase().includes(term) ||
        c.author_cpf?.includes(term)
      );
    }

    // Filtro por status
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(c => c.status === filters.status);
    }

    // Filtro por valor
    if (filters.minValue) {
      const min = parseFloat(filters.minValue);
      filtered = filtered.filter(c => (c.valor_causa || 0) >= min);
    }

    if (filters.maxValue) {
      const max = parseFloat(filters.maxValue);
      filtered = filtered.filter(c => (c.valor_causa || 0) <= max);
    }

    // Filtro por data
    if (filters.dateFrom) {
      filtered = filtered.filter(c => 
        new Date(c.created_at) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      filtered = filtered.filter(c => 
        new Date(c.created_at) <= new Date(filters.dateTo)
      );
    }

    setFilteredCases(filtered);
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
          <ExportButton data={filteredCases} filename="casos_protocolados" />
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="casos">Casos ({filteredCases.length})</TabsTrigger>
            <TabsTrigger value="insights">Insights & Estratégia</TabsTrigger>
          </TabsList>

          {/* Tab: Dashboard Financeiro */}
          <TabsContent value="dashboard" className="space-y-6">
            <FinancialDashboard />
          </TabsContent>

          {/* Tab: Lista de Casos */}
          <TabsContent value="casos" className="space-y-6">
            <AdvancedFilters onFilterChange={handleFilterChange} />

            {loading ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">Carregando casos...</p>
              </Card>
            ) : filteredCases.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Nenhum caso encontrado</p>
                <p className="text-muted-foreground">
                  Ajuste os filtros ou aguarde novos casos protocolados
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {filteredCases.map((caso) => (
                  <Card key={caso.id} className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold">{caso.author_name}</h3>
                        <p className="text-sm text-muted-foreground">CPF: {caso.author_cpf}</p>
                        <p className="text-sm text-muted-foreground">
                          Data do Evento: {new Date(caso.event_date).toLocaleDateString('pt-BR')}
                        </p>
                        {caso.valor_causa && (
                          <p className="text-sm font-medium text-green-600 mt-1">
                            Valor da Causa: R$ {caso.valor_causa.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-base">
                        {caso.status === 'protocolada' && 'Protocolada'}
                        {caso.status === 'acordo' && 'Acordo'}
                        {caso.status === 'sentenca' && 'Sentença'}
                      </Badge>
                    </div>

                    {/* Timeline Processual */}
                    <CaseTimelineManager caseId={caso.id} />

                    {/* Gestão Financeira */}
                    {selectedCaseId === caso.id && (
                      <div className="mt-4">
                        <FinancialManager 
                          caseId={caso.id} 
                          onUpdate={loadCases}
                        />
                      </div>
                    )}

                    {/* Botões de Ação */}
                    <div className="flex gap-2 mt-4">
                      <AcordoSentencaForm caseId={caso.id} onSuccess={loadCases} />
                      <Button 
                        variant="outline" 
                        onClick={() => setSelectedCaseId(selectedCaseId === caso.id ? null : caso.id)}
                      >
                        {selectedCaseId === caso.id ? 'Ocultar' : 'Gestão Financeira'}
                      </Button>
                      <Button variant="outline" onClick={() => navigate(`/novo-caso?id=${caso.id}`)}>
                        Ver Detalhes Completos
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab: Insights & Estratégia */}
          <TabsContent value="insights" className="space-y-6">
            <InsightsPanel cases={allCases} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
