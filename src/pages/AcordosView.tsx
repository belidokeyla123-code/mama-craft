import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Search, FileText, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Acordo {
  id: string;
  case_id: string;
  author_name: string;
  author_cpf: string;
  data_recebimento: string;
  valor_recebido: number;
  valor_honorarios: number;
  valor_cliente: number;
  observacoes?: string;
}

export default function AcordosView() {
  const navigate = useNavigate();
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [filteredAcordos, setFilteredAcordos] = useState<Acordo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAcordos();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = acordos.filter(acordo => 
        acordo.author_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acordo.author_cpf.includes(searchTerm)
      );
      setFilteredAcordos(filtered);
    } else {
      setFilteredAcordos(acordos);
    }
  }, [searchTerm, acordos]);

  const loadAcordos = async () => {
    try {
      const { data, error } = await supabase
        .from('case_financial')
        .select(`
          *,
          cases!inner(author_name, author_cpf)
        `)
        .eq('tipo_conclusao', 'acordo')
        .order('data_recebimento', { ascending: false });

      if (error) throw error;
      
      const mapped = data?.map((item: any) => ({
        ...item,
        author_name: item.cases.author_name,
        author_cpf: item.cases.author_cpf
      })) || [];
      
      setAcordos(mapped);
      setFilteredAcordos(mapped);
    } catch (error) {
      console.error('Erro ao carregar acordos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterByPeriod = (period: 'hoje' | 'semana' | 'mes' | 'todas') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return filteredAcordos.filter(acordo => {
      const dataRecebimento = new Date(acordo.data_recebimento);
      
      if (period === 'hoje') {
        return dataRecebimento >= today;
      } else if (period === 'semana') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return dataRecebimento >= weekAgo;
      } else if (period === 'mes') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return dataRecebimento >= monthAgo;
      }
      return true;
    });
  };

  const AcordoCard = ({ acordo }: { acordo: Acordo }) => (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold">{acordo.author_name}</h3>
          <p className="text-sm text-muted-foreground">CPF: {acordo.author_cpf}</p>
          <p className="text-sm text-muted-foreground">
            Data: {new Date(acordo.data_recebimento).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <Badge variant="outline" className="bg-green-50">Acordo</Badge>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-sm text-muted-foreground">Valor Recebido</p>
          <p className="text-lg font-bold text-green-600">
            R$ {acordo.valor_recebido.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Honorários</p>
          <p className="text-lg font-bold">
            R$ {acordo.valor_honorarios.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Valor Cliente</p>
          <p className="text-lg font-bold">
            R$ {acordo.valor_cliente.toFixed(2)}
          </p>
        </div>
      </div>

      {acordo.observacoes && (
        <div className="p-3 bg-muted rounded mb-4">
          <p className="text-sm">{acordo.observacoes}</p>
        </div>
      )}

      <Button 
        variant="outline" 
        onClick={() => navigate(`/novo-caso?id=${acordo.case_id}`)}
      >
        Abrir Caso Completo
      </Button>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Gestão de Acordos</h1>
              <p className="text-muted-foreground">Acompanhe acordos e valores recebidos</p>
            </div>
          </div>
        </div>

        {/* Busca */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabs por Período */}
        <Tabs defaultValue="todas" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="hoje">
              Hoje ({filterByPeriod('hoje').length})
            </TabsTrigger>
            <TabsTrigger value="semana">
              Esta Semana ({filterByPeriod('semana').length})
            </TabsTrigger>
            <TabsTrigger value="mes">
              Este Mês ({filterByPeriod('mes').length})
            </TabsTrigger>
            <TabsTrigger value="todas">
              Todos ({filteredAcordos.length})
            </TabsTrigger>
          </TabsList>

          {['hoje', 'semana', 'mes', 'todas'].map(period => (
            <TabsContent key={period} value={period} className="space-y-4 mt-6">
              {loading ? (
                <Card className="p-12 text-center">
                  <p className="text-muted-foreground">Carregando acordos...</p>
                </Card>
              ) : filterByPeriod(period as any).length === 0 ? (
                <Card className="p-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Nenhum acordo registrado</p>
                  <p className="text-muted-foreground">
                    Os acordos aparecerão aqui conforme forem registrados
                  </p>
                </Card>
              ) : (
                filterByPeriod(period as any).map(acordo => (
                  <AcordoCard key={acordo.id} acordo={acordo} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
