import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, Scale, Download, Loader2, CheckCircle2, ChevronDown, BookOpen } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StepJurisprudenceProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface Jurisprudencia {
  tipo: string;
  tribunal: string;
  numero_processo?: string;
  relator?: string;
  data_julgamento?: string;
  tese_fixada?: string;
  ementa_completa?: string;
  trecho_chave?: string;
  link?: string;
  relevancia: number;
  por_que_relevante?: string;
  selected?: boolean;
}

interface Sumula {
  tribunal: string;
  numero: string;
  tipo: string;
  texto_completo: string;
  texto_resumido?: string;
  link?: string;
  relevancia: number;
  como_aplicar?: string;
  selected?: boolean;
}

interface Doutrina {
  autor: string;
  obra: string;
  editora?: string;
  ano?: number;
  pagina?: string;
  citacao_literal: string;
  contexto?: string;
  relevancia: number;
  por_que_citar?: string;
  selected?: boolean;
}

interface TeseJuridica {
  titulo: string;
  descricao: string;
  fundamentacao: string[];
  como_usar_na_peticao: string;
  relevancia: number;
  selected?: boolean;
}

export const StepJurisprudence = ({ data, updateData }: StepJurisprudenceProps) => {
  const [loading, setLoading] = useState(false);
  const [jurisprudencias, setJurisprudencias] = useState<Jurisprudencia[]>([]);
  const [sumulas, setSumulas] = useState<Sumula[]>([]);
  const [doutrinas, setDoutrinas] = useState<Doutrina[]>([]);
  const [teses, setTeses] = useState<TeseJuridica[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasCache, setHasCache] = useState(false);

  // Carregar do cache ao entrar na aba
  useEffect(() => {
    if (data.caseId) {
      loadCachedResults();
    }
  }, [data.caseId]);

  // Auto-buscar jurisprudência se não houver cache
  useEffect(() => {
    if (!loading && jurisprudencias.length === 0 && data.caseId && !hasCache) {
      const timer = setTimeout(() => {
        searchJurisprudence();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [jurisprudencias, data.caseId, loading, hasCache]);

  // Salvar seleções automaticamente (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (data.caseId && selectedIds.size > 0) {
        try {
          console.log('[JURISPRUDENCE] Salvando seleções:', Array.from(selectedIds));
          await supabase
            .from('jurisprudence_results')
            .update({ selected_ids: Array.from(selectedIds) })
            .eq('case_id', data.caseId);
          console.log('[JURISPRUDENCE] Seleções salvas com sucesso');
        } catch (error) {
          console.error('Erro ao salvar seleções:', error);
        }
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [selectedIds, data.caseId]);

  const loadCachedResults = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: cached, error } = await supabase
        .from('jurisprudence_results')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (cached?.results) {
        const results = cached.results as any;
        setJurisprudencias(results.jurisprudencias || []);
        setSumulas(results.sumulas || []);
        setDoutrinas(results.doutrinas || []);
        setTeses(results.teses_juridicas_aplicaveis || []);
        setSelectedIds(new Set((cached.selected_ids as any) || []));
        setHasCache(true);
        console.log('[JURISPRUDENCE] Carregado do cache');
      }
    } catch (error) {
      console.error('Erro ao carregar cache:', error);
    }
  };

  const searchJurisprudence = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      // Chamar DIRETAMENTE a busca (sem fila)
      const { data: result, error } = await supabase.functions.invoke('search-jurisprudence', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429')) {
          toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
        } else if (error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Adicione créditos na sua conta.');
        } else if (error.message?.includes('timeout')) {
          toast.error('Busca demorou muito. Tente novamente.');
        } else {
          toast.error('Erro ao buscar jurisprudências');
        }
        throw error;
      }

      setJurisprudencias(result.jurisprudencias || []);
      setSumulas(result.sumulas || []);
      setDoutrinas(result.doutrinas || []);
      setTeses(result.teses_juridicas_aplicaveis || []);
      
      // Salvar no cache
      await supabase
        .from('jurisprudence_results')
        .upsert({
          case_id: data.caseId,
          results: result,
          selected_ids: Array.from(selectedIds),
          created_at: new Date().toISOString()
        });
      
      setHasCache(true);

    } catch (error: any) {
      console.error('Erro ao buscar jurisprudências:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const JurisCard = ({ juris }: { juris: Jurisprudencia }) => {
    const id = juris.numero_processo || `${juris.tribunal}_${juris.tese_fixada?.substring(0, 20)}`;
    const isSelected = selectedIds.has(id);
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{juris.tribunal}</Badge>
            <Badge variant="outline" className="text-xs">
              {Math.round(juris.relevancia)}% relevante
            </Badge>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex gap-2">
            {juris.link && (
              <a href={juris.link} target="_blank" rel="noopener noreferrer" 
                className="text-primary hover:underline flex items-center gap-1 text-sm">
                <ExternalLink className="h-4 w-4" />
                Ver íntegra
              </a>
            )}
          </div>
        </div>
        
        {juris.numero_processo && (
          <p className="text-sm text-muted-foreground mb-2">
            Processo: {juris.numero_processo}
            {juris.relator && ` - ${juris.relator}`}
          </p>
        )}
        
        <p className="font-medium mb-2">{juris.tese_fixada}</p>
        
        {juris.ementa_completa && (
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline mb-2">
              <ChevronDown className="h-4 w-4" />
              Ver ementa completa
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 bg-muted rounded text-sm mb-2">
                {juris.ementa_completa}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        
        {juris.por_que_relevante && (
          <p className="text-sm text-muted-foreground mb-3">
            <strong>Aplicação:</strong> {juris.por_que_relevante}
          </p>
        )}
        
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(id)}
        >
          {isSelected ? "Selecionada" : "Adicionar à Petição"}
        </Button>
      </Card>
    );
  };

  const SumulaCard = ({ sumula }: { sumula: Sumula }) => {
    const id = `${sumula.tribunal}_${sumula.numero}`;
    const isSelected = selectedIds.has(id);
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{sumula.tribunal}</Badge>
            <Badge variant="default">{sumula.numero}</Badge>
            {sumula.tipo === 'vinculante' && <Badge variant="destructive">Vinculante</Badge>}
            <Badge variant="outline" className="text-xs">
              {Math.round(sumula.relevancia)}% relevante
            </Badge>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          {sumula.link && (
            <a href={sumula.link} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 text-sm">
              <ExternalLink className="h-4 w-4" />
              Ver íntegra
            </a>
          )}
        </div>
        
        <div className="p-4 bg-muted/50 rounded mb-3">
          <p className="text-sm font-medium">{sumula.texto_completo}</p>
        </div>
        
        {sumula.como_aplicar && (
          <p className="text-sm text-muted-foreground mb-3">
            <strong>Como aplicar:</strong> {sumula.como_aplicar}
          </p>
        )}
        
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(id)}
        >
          {isSelected ? "Selecionada" : "Adicionar à Petição"}
        </Button>
      </Card>
    );
  };

  const DoutrinaCard = ({ doutrina }: { doutrina: Doutrina }) => {
    const id = `${doutrina.autor}_${doutrina.obra}`;
    const isSelected = selectedIds.has(id);
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">
              {Math.round(doutrina.relevancia)}% relevante
            </Badge>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
        </div>
        
        <p className="font-bold mb-1">{doutrina.autor}</p>
        <p className="text-sm text-muted-foreground mb-3">
          {doutrina.obra}
          {doutrina.editora && `, ${doutrina.editora}`}
          {doutrina.ano && `, ${doutrina.ano}`}
          {doutrina.pagina && ` - ${doutrina.pagina}`}
        </p>
        
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded mb-3 border-l-4 border-blue-500">
          <p className="text-sm italic">"{doutrina.citacao_literal}"</p>
        </div>
        
        {doutrina.por_que_citar && (
          <p className="text-sm text-muted-foreground mb-3">
            <strong>Por que citar:</strong> {doutrina.por_que_citar}
          </p>
        )}
        
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(id)}
        >
          {isSelected ? "Selecionada" : "Adicionar à Petição"}
        </Button>
      </Card>
    );
  };

  const TeseCard = ({ tese }: { tese: TeseJuridica }) => {
    const id = tese.titulo;
    const isSelected = selectedIds.has(id);
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">
              {Math.round(tese.relevancia)}% relevante
            </Badge>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
        </div>
        
        <h4 className="font-bold text-lg mb-2">{tese.titulo}</h4>
        <p className="text-sm mb-3">{tese.descricao}</p>
        
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline mb-2">
            <ChevronDown className="h-4 w-4" />
            Ver fundamentação
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-3 bg-muted rounded mb-2">
              <p className="text-sm font-medium mb-2">Fundamentação:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {tese.fundamentacao.map((fund, idx) => (
                  <li key={idx}>{fund}</li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
        
        <div className="p-3 bg-green-50 dark:bg-green-950 rounded mb-3">
          <p className="text-sm">
            <strong>Como usar na petição:</strong> {tese.como_usar_na_peticao}
          </p>
        </div>
        
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(id)}
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
          Jurisprudências, Súmulas e Doutrinas
        </h2>
        <p className="text-muted-foreground">
          Fontes jurídicas reais e relevantes para fundamentar a petição
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={searchJurisprudence} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Buscando...
            </>
          ) : hasCache ? (
            "Buscar Novamente"
          ) : (
            "Buscar Jurisprudências"
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
              <p className="text-lg font-medium">Pesquisando fontes jurídicas...</p>
              <p className="text-sm text-muted-foreground">
                Buscando jurisprudências, súmulas, doutrinas e teses aplicáveis
              </p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 15 segundos</p>
            </div>
          </div>
        </Card>
      ) : (jurisprudencias.length > 0 || sumulas.length > 0 || doutrinas.length > 0 || teses.length > 0) ? (
        <Tabs defaultValue="jurisprudencias" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="jurisprudencias">
              Jurisprudências ({jurisprudencias.length})
            </TabsTrigger>
            <TabsTrigger value="sumulas">
              Súmulas ({sumulas.length})
            </TabsTrigger>
            <TabsTrigger value="doutrinas">
              Doutrinas ({doutrinas.length})
            </TabsTrigger>
            <TabsTrigger value="precedentes">
              Precedentes (0)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jurisprudencias" className="space-y-4 mt-6">
            {jurisprudencias.length > 0 ? (
              jurisprudencias.map((juris, index) => (
                <JurisCard key={index} juris={juris} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma jurisprudência encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sumulas" className="space-y-4 mt-6">
            {sumulas.length > 0 ? (
              sumulas.map((sumula, index) => (
                <SumulaCard key={index} sumula={sumula} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma súmula encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="doutrinas" className="space-y-4 mt-6">
            {doutrinas.length > 0 ? (
              doutrinas.map((doutrina, index) => (
                <DoutrinaCard key={index} doutrina={doutrina} />
              ))
            ) : (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma doutrina encontrada
              </Card>
            )}
          </TabsContent>

          <TabsContent value="precedentes" className="space-y-4 mt-6">
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum precedente vinculante encontrado para este caso específico
            </Card>
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
