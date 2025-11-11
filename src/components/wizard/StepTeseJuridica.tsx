import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Scale, Loader2, CheckCircle2, ChevronDown, Edit2, Save, X } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTabSync } from "@/hooks/useTabSync";

interface StepTeseJuridicaProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface TeseJuridica {
  titulo: string;
  tese_completa: string;
  fundamentacao_legal: string[];
  fundamentacao_jurisprudencial: string[];
  links_jurisprudencias?: string[];
  tecnica_persuasao: string;
  score_persuasao: number;
}

export const StepTeseJuridica = ({ data, updateData }: StepTeseJuridicaProps) => {
  const [loading, setLoading] = useState(false);
  const [teses, setTeses] = useState<TeseJuridica[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<Set<string>>(new Set());
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [hasCache, setHasCache] = useState(false);

  // ✅ FASE 3: Sincronização em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['teses-updated', 'jurisprudence-updated'],
    onSync: (detail) => {
      console.log('[StepTeseJuridica] 🔄 Teses atualizadas remotamente, recarregando...');
      if (detail.timestamp && !loading) {
        loadCachedTeses();
      }
    }
  });

  useEffect(() => {
    if (data.caseId) {
      loadCachedTeses();
    }
  }, [data.caseId]);

  // Auto-gerar teses se não houver cache
  useEffect(() => {
    if (!loading && !teses && data.caseId) {
      const timer = setTimeout(() => {
        generateTeses();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [teses, data.caseId, loading]);

  const loadCachedTeses = async () => {
    if (!data.caseId) return;
    
    console.log('[TESES] 🔍 Carregando teses do banco...');
    
    try {
      const { data: cached, error } = await supabase
        .from('teses_juridicas')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (cached?.teses) {
        setTeses(cached.teses as any);
        setSelectedTitles(new Set(cached.selected_ids || []));
        setHasCache(true);
        console.log('[TESES] ✅ Teses carregadas do cache:', {
          total: (cached.teses as any[]).length,
          selected: cached.selected_ids?.length || 0
        });
      } else {
        console.log('[TESES] ℹ️ Nenhuma tese em cache, geração será executada');
        setHasCache(false);
      }
    } catch (error) {
      console.error('[TESES] ❌ Erro ao carregar cache:', error);
      setHasCache(false);
    }
  };

  const generateTeses = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      // Buscar jurisprudências selecionadas
      const { data: jurisResults } = await supabase
        .from('jurisprudence_results')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!jurisResults) {
        toast.error('Busque jurisprudências primeiro');
        setLoading(false);
        return;
      }

      const { data: result, error } = await supabase.functions.invoke('generate-tese-juridica', {
        body: { 
          caseId: data.caseId,
          selectedJurisprudencias: (jurisResults.results as any).jurisprudencias || [],
          selectedSumulas: (jurisResults.results as any).sumulas || [],
          selectedDoutrinas: (jurisResults.results as any).doutrinas || []
        }
      });

      if (error) {
        if (error.message?.includes('429')) {
          toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
        } else if (error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Adicione créditos na sua conta.');
        } else {
          toast.error('Erro ao gerar teses');
        }
        throw error;
      }

      // Verificar se é 202 Accepted (background task)
      if (result?.status === 'generating') {
        toast.info('🔄 Gerando teses jurídicas...', {
          description: 'Acompanhe o progresso aqui. Isso pode levar alguns minutos.',
          duration: 5000
        });

        // Iniciar polling
        const pollInterval = setInterval(async () => {
          const { data: teseData } = await supabase
            .from('teses_juridicas')
            .select('*')
            .eq('case_id', data.caseId)
            .single();

          if (teseData?.teses) {
            const tesesArray = teseData.teses as any[];
            const statusObj = tesesArray.find(t => t.status);
            
            if (statusObj?.status === 'completed') {
              clearInterval(pollInterval);
              const validTeses = tesesArray.filter(t => !t.status);
              setTeses(validTeses);
              setHasCache(true);
              setLoading(false);
              toast.success('✅ Teses jurídicas geradas com sucesso!');
            } else if (statusObj?.status === 'error') {
              clearInterval(pollInterval);
              setLoading(false);
              toast.error('❌ Erro ao gerar teses: ' + statusObj.error);
            }
          }
        }, 3000); // Poll a cada 3 segundos

        // Timeout de segurança de 3 minutos
        setTimeout(() => {
          clearInterval(pollInterval);
          if (loading) {
            setLoading(false);
            toast.error('⏱️ Tempo limite excedido. Tente novamente.');
          }
        }, 180000);
        
        return;
      }

      // Resposta síncrona (fallback)
      if (result?.teses) {
        setTeses(result.teses);
        setHasCache(true);
      }
      setLoading(false);

    } catch (error: any) {
      console.error('Erro ao gerar teses:', error);
      setLoading(false);
    }
  };

  const toggleSelection = async (titulo: string) => {
    const newSet = new Set(selectedTitles);
    if (newSet.has(titulo)) {
      newSet.delete(titulo);
    } else {
      newSet.add(titulo);
    }
    setSelectedTitles(newSet);
    
    // Salvar seleções
    if (data.caseId) {
      await supabase
        .from('teses_juridicas')
        .update({ selected_ids: Array.from(newSet) })
        .eq('case_id', data.caseId);
    }
  };

  const startEdit = (tese: TeseJuridica) => {
    setEditingTitle(tese.titulo);
    setEditedText(tese.tese_completa);
  };

  const saveEdit = async () => {
    if (!editingTitle) return;
    
    const updatedTeses = teses.map(t => 
      t.titulo === editingTitle 
        ? { ...t, tese_completa: editedText }
        : t
    );
    
    setTeses(updatedTeses);
    
    // Salvar no banco
    if (data.caseId) {
      await supabase
        .from('teses_juridicas')
        .update({ teses: updatedTeses as any })
        .eq('case_id', data.caseId);
    }
    
    setEditingTitle(null);
  };

  const cancelEdit = () => {
    setEditingTitle(null);
    setEditedText("");
  };

  const TeseCard = ({ tese }: { tese: TeseJuridica }) => {
    const isSelected = selectedTitles.has(tese.titulo);
    const isEditing = editingTitle === tese.titulo;
    
    return (
      <Card className={`p-6 hover:shadow-lg transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <Badge variant="outline" className="text-xs">
              {tese.score_persuasao}% persuasivo
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {tese.tecnica_persuasao}
            </Badge>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex gap-2">
            {!isEditing ? (
              <Button size="sm" variant="ghost" onClick={() => startEdit(tese)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={saveEdit}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        
        <h4 className="font-bold text-lg mb-3">{tese.titulo}</h4>
        
        {isEditing ? (
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="min-h-[200px] mb-3 font-serif"
          />
        ) : (
          <div className="p-4 bg-muted/30 rounded-lg mb-3 text-sm font-serif leading-relaxed">
            {tese.tese_completa}
          </div>
        )}
        
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline mb-2">
            <ChevronDown className="h-4 w-4" />
            Ver fundamentação
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 p-3 bg-muted/20 rounded">
              <div>
                <p className="font-semibold text-sm mb-1">Fundamentação Legal:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {tese.fundamentacao_legal.map((fund, idx) => (
                    <li key={idx}>{fund}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">Fundamentação Jurisprudencial:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {tese.fundamentacao_jurisprudencial.map((fund, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span>{fund}</span>
                      {tese.links_jurisprudencias?.[idx] && (
                        <a 
                          href={tese.links_jurisprudencias[idx]} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          [ver link]
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          onClick={() => toggleSelection(tese.titulo)}
          className="mt-3"
        >
          {isSelected ? "Selecionada para Petição" : "Adicionar à Petição"}
        </Button>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Scale className="h-7 w-7 text-primary" />
          Construção de Tese Jurídica
        </h2>
        <p className="text-muted-foreground">
          IA especializada em argumentação persuasiva, PNL, retórica e formatação ABNT
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={generateTeses} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Gerando teses...
            </>
          ) : hasCache ? (
            "Gerar Novas Teses"
          ) : (
            "Gerar Teses Argumentativas"
          )}
        </Button>
        {selectedTitles.size > 0 && (
          <Badge variant="outline" className="px-3 py-2">
            {selectedTitles.size} selecionadas
          </Badge>
        )}
      </div>

      {loading ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Construindo teses jurídicas persuasivas...</p>
              <p className="text-sm text-muted-foreground">
                Aplicando técnicas de PNL, retórica clássica e argumentação forense
              </p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 60 segundos</p>
            </div>
          </div>
        </Card>
      ) : teses.length > 0 ? (
        <div className="space-y-4">
          {teses.map((tese, index) => (
            <TeseCard key={index} tese={tese} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Clique em "Gerar Teses Argumentativas" para construir argumentos jurídicos persuasivos
        </Card>
      )}
    </div>
  );
};
