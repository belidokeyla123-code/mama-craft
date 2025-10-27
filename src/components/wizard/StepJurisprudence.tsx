import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Scale, Download, Loader2, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StepJurisprudenceProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface Jurisprudencia {
  tribunal: string;
  numero_processo: string;
  tese: string;
  ementa: string;
  relevancia: number;
  link?: string;
  tipo: "jurisprudencia" | "sumula" | "tese" | "doutrina";
  selected?: boolean;
}

export const StepJurisprudence = ({ data, updateData }: StepJurisprudenceProps) => {
  const [loading, setLoading] = useState(false);
  const [jurisprudencias, setJurisprudencias] = useState<Jurisprudencia[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data.caseId) {
      searchJurisprudence();
    }
  }, [data.caseId]);

  const searchJurisprudence = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('search-jurisprudence', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429') || result?.code === 'RATE_LIMIT') {
          toast.error("Rate limit atingido. Aguarde 30 segundos e tente novamente.");
          return;
        }
        if (error.message?.includes('402') || result?.code === 'NO_CREDITS') {
          toast.error("Créditos Lovable AI esgotados. Adicione mais créditos.");
          return;
        }
        if (error.message?.includes('408') || result?.code === 'TIMEOUT') {
          toast.error("Timeout: Busca de jurisprudência demorou muito. Tente novamente.");
          return;
        }
        throw error;
      }

      if (result?.jurisprudencias) {
        setJurisprudencias(result.jurisprudencias);
        toast.success(`${result.jurisprudencias.length} jurisprudências encontradas`);
      }
    } catch (error) {
      console.error('Erro ao buscar jurisprudências:', error);
      toast.error('Erro ao buscar jurisprudências');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (processo: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(processo)) {
        newSet.delete(processo);
      } else {
        newSet.add(processo);
      }
      return newSet;
    });
  };

  const filterByType = (tipo: string) => {
    return jurisprudencias.filter(j => j.tipo === tipo);
  };

  const handleDownloadPDF = (juris: Jurisprudencia) => {
    toast.info("Download de PDF será implementado em breve");
  };

  const JurisCard = ({ juris }: { juris: Jurisprudencia }) => {
    const isSelected = selectedIds.has(juris.numero_processo);
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{juris.tribunal}</Badge>
            <Badge variant="outline" className="text-xs">
              {Math.round(juris.relevancia)}% relevante
            </Badge>
            {isSelected && (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex gap-2">
            {juris.link && (
              <a
                href={juris.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                Ver íntegra
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownloadPDF(juris)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-2">
          Processo: {juris.numero_processo}
        </p>
        <p className="font-medium mb-2">{juris.tese}</p>
        <p className="text-sm text-muted-foreground mb-3">{juris.ementa}</p>
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(juris.numero_processo)}
        >
          {isSelected ? "Selecionada" : "Adicionar à Petição"}
        </Button>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Scale className="h-7 w-7 text-primary" />
          Jurisprudência, Súmulas e Teses
        </h2>
        <p className="text-muted-foreground">
          Precedentes relevantes de STF, STJ, TNU e TRFs para fundamentar a petição
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={searchJurisprudence} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Buscando...
            </>
          ) : (
            "Buscar Novamente"
          )}
        </Button>
        <Badge variant="outline" className="px-3 py-2">
          {selectedIds.size} selecionadas
        </Badge>
      </div>

      {loading ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Buscando em STF, STJ, TNU e TRFs...</p>
              <p className="text-sm text-muted-foreground">
                Refinando busca para casos similares ao seu
              </p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 45 segundos</p>
            </div>
          </div>
        </Card>
      ) : jurisprudencias.length > 0 ? (
        <Tabs defaultValue="jurisprudencias" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="jurisprudencias">
              Jurisprudências ({filterByType('jurisprudencia').length})
            </TabsTrigger>
            <TabsTrigger value="sumulas">
              Súmulas ({filterByType('sumula').length})
            </TabsTrigger>
            <TabsTrigger value="teses">
              Teses ({filterByType('tese').length})
            </TabsTrigger>
            <TabsTrigger value="doutrinas">
              Doutrinas ({filterByType('doutrina').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jurisprudencias" className="space-y-4 mt-6">
            {filterByType('jurisprudencia').length > 0 ? (
              filterByType('jurisprudencia').map((juris, index) => (
                <JurisCard key={index} juris={juris} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma jurisprudência encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sumulas" className="space-y-4 mt-6">
            {filterByType('sumula').length > 0 ? (
              filterByType('sumula').map((juris, index) => (
                <JurisCard key={index} juris={juris} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma súmula encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="teses" className="space-y-4 mt-6">
            {filterByType('tese').length > 0 ? (
              filterByType('tese').map((juris, index) => (
                <JurisCard key={index} juris={juris} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma tese encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="doutrinas" className="space-y-4 mt-6">
            {filterByType('doutrina').length > 0 ? (
              filterByType('doutrina').map((juris, index) => (
                <JurisCard key={index} juris={juris} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma doutrina encontrada
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Clique em "Buscar Novamente" para iniciar a busca de jurisprudências
        </Card>
      )}
    </div>
  );
};
