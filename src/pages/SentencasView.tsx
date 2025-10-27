import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Search, Scale, ThumbsUp, ThumbsDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Sentenca {
  id: string;
  case_id: string;
  author_name: string;
  author_cpf: string;
  data_recebimento: string;
  tipo_conclusao: 'sentenca_procedente' | 'sentenca_improcedente';
  valor_recebido?: number;
  observacoes?: string;
}

export default function SentencasView() {
  const navigate = useNavigate();
  const [sentencas, setSentencas] = useState<Sentenca[]>([]);
  const [filteredSentencas, setFilteredSentencas] = useState<Sentenca[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSentencas();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = sentencas.filter(sentenca => 
        sentenca.author_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sentenca.author_cpf.includes(searchTerm)
      );
      setFilteredSentencas(filtered);
    } else {
      setFilteredSentencas(sentencas);
    }
  }, [searchTerm, sentencas]);

  const loadSentencas = async () => {
    try {
      const { data, error } = await supabase
        .from('case_financial')
        .select(`
          *,
          cases!inner(author_name, author_cpf)
        `)
        .in('tipo_conclusao', ['sentenca_procedente', 'sentenca_improcedente'])
        .order('data_recebimento', { ascending: false });

      if (error) throw error;
      
      const mapped = data?.map((item: any) => ({
        ...item,
        author_name: item.cases.author_name,
        author_cpf: item.cases.author_cpf
      })) || [];
      
      setSentencas(mapped);
      setFilteredSentencas(mapped);
    } catch (error) {
      console.error('Erro ao carregar sentenças:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterByType = (tipo: 'procedente' | 'improcedente' | 'todas') => {
    if (tipo === 'procedente') {
      return filteredSentencas.filter(s => s.tipo_conclusao === 'sentenca_procedente');
    } else if (tipo === 'improcedente') {
      return filteredSentencas.filter(s => s.tipo_conclusao === 'sentenca_improcedente');
    }
    return filteredSentencas;
  };

  const SentencaCard = ({ sentenca }: { sentenca: Sentenca }) => {
    const isProcedente = sentenca.tipo_conclusao === 'sentenca_procedente';
    
    return (
      <Card className={`p-6 ${isProcedente ? 'border-green-200' : 'border-red-200'}`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold">{sentenca.author_name}</h3>
            <p className="text-sm text-muted-foreground">CPF: {sentenca.author_cpf}</p>
            <p className="text-sm text-muted-foreground">
              Data: {new Date(sentenca.data_recebimento).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <Badge 
            variant="outline" 
            className={isProcedente ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}
          >
            {isProcedente ? (
              <><ThumbsUp className="h-3 w-3 mr-1" /> Procedente</>
            ) : (
              <><ThumbsDown className="h-3 w-3 mr-1" /> Improcedente</>
            )}
          </Badge>
        </div>

        {isProcedente && sentenca.valor_recebido && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Valor Reconhecido</p>
            <p className="text-2xl font-bold text-green-600">
              R$ {sentenca.valor_recebido.toFixed(2)}
            </p>
          </div>
        )}

        {sentenca.observacoes && (
          <div className="p-3 bg-muted rounded mb-4">
            <p className="text-sm font-medium mb-1">Teor da Decisão:</p>
            <p className="text-sm">{sentenca.observacoes}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/novo-caso?id=${sentenca.case_id}`)}
          >
            Abrir Caso Completo
          </Button>
          {!isProcedente && (
            <Button variant="default">
              Preparar Recurso
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Gestão de Sentenças</h1>
              <p className="text-muted-foreground">Acompanhe resultados judiciais</p>
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

        {/* Tabs por Tipo */}
        <Tabs defaultValue="todas" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="procedente" className="text-green-600">
              Procedentes ({filterByType('procedente').length})
            </TabsTrigger>
            <TabsTrigger value="improcedente" className="text-red-600">
              Improcedentes ({filterByType('improcedente').length})
            </TabsTrigger>
            <TabsTrigger value="todas">
              Todas ({filteredSentencas.length})
            </TabsTrigger>
          </TabsList>

          {['procedente', 'improcedente', 'todas'].map(tipo => (
            <TabsContent key={tipo} value={tipo} className="space-y-4 mt-6">
              {loading ? (
                <Card className="p-12 text-center">
                  <p className="text-muted-foreground">Carregando sentenças...</p>
                </Card>
              ) : filterByType(tipo as any).length === 0 ? (
                <Card className="p-12 text-center">
                  <Scale className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Nenhuma sentença registrada</p>
                  <p className="text-muted-foreground">
                    As sentenças aparecerão aqui conforme forem prolatadas
                  </p>
                </Card>
              ) : (
                filterByType(tipo as any).map(sentenca => (
                  <SentencaCard key={sentenca.id} sentenca={sentenca} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
