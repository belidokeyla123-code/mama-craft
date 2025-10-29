import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Download, Copy, CheckCheck, Loader2, AlertTriangle, Target, MapPin, Upload, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { extractPlaceholders, generatePlaceholderList } from "@/lib/templatePlaceholders";

interface StepDraftProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface JudgeAnalysis {
  brechas: Array<{
    tipo: string;
    descricao: string;
    gravidade: string;
    localizacao: string;
    sugestao: string;
  }>;
  pontos_fortes: string[];
  pontos_fracos: string[];
  risco_improcedencia: number;
  recomendacoes: string[];
  validacao_abas?: {
    validacao?: { status: string; problemas: string[] };
    analise?: { status: string; problemas: string[] };
    jurisprudencia?: { status: string; problemas: string[] };
    teses?: { status: string; problemas: string[] };
    peticao?: { status: string; problemas: string[] };
  };
}

interface RegionalAdaptation {
  trf: string;
  tendencias: string[];
  estilo_preferido: string;
  jurisprudencias_locais_sugeridas: Array<{
    numero: string;
    tese: string;
    motivo: string;
  }>;
  adaptacoes_sugeridas: Array<{
    secao: string;
    adaptacao: string;
    justificativa: string;
  }>;
  petition_adaptada?: string;
}

export const StepDraft = ({ data, updateData }: StepDraftProps) => {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [petition, setPetition] = useState("");
  const [judgeAnalysis, setJudgeAnalysis] = useState<JudgeAnalysis | null>(null);
  const [regionalAdaptation, setRegionalAdaptation] = useState<RegionalAdaptation | null>(null);
  const [analyzingJudge, setAnalyzingJudge] = useState(false);
  const [analyzingAppellate, setAnalyzingAppellate] = useState(false);
  const [appellateAnalysis, setAppellateAnalysis] = useState<any>(null);
  const [adaptingRegional, setAdaptingRegional] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isProtocoling, setIsProtocoling] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [applyingJudgeCorrections, setApplyingJudgeCorrections] = useState(false);
  const [applyingRegionalAdaptations, setApplyingRegionalAdaptations] = useState(false);
  const [applyingIndividualSuggestion, setApplyingIndividualSuggestion] = useState<number | null>(null);
  const [applyingIndividualAdaptation, setApplyingIndividualAdaptation] = useState<number | null>(null);

  // Carregar do cache ao entrar na aba
  useEffect(() => {
    if (data.caseId && !petition) {
      loadCachedDraft();
    }
  }, [data.caseId]);

  const loadCachedDraft = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: draftData, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('case_id', data.caseId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (draftData?.markdown_content) {
        setPetition(draftData.markdown_content);
        setHasCache(true);
        console.log('[DRAFT] Carregado do cache');
      }
    } catch (error) {
      console.error('Erro ao carregar cache:', error);
    }
  };

  // Atualizar status para "drafted" quando a minuta estiver pronta
  useEffect(() => {
    const updateStatus = async () => {
      if (data.caseId) {
        await supabase
          .from("cases")
          .update({ status: "drafted" })
          .eq("id", data.caseId);
        
        console.log(`[DRAFT] Status do caso ${data.caseId} atualizado para "drafted"`);
      }
    };
    
    updateStatus();
  }, [data.caseId]);

  const generatePetition = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('generate-petition', {
        body: { 
          caseId: data.caseId,
          selectedJurisprudencias: [] // TODO: passar jurisprudências selecionadas
        }
      });

      if (error) throw error;

      // Corrigir bug: aceitar tanto "petition" quanto "petitionText"
      const petitionContent = result?.petition || result?.petitionText;
      if (petitionContent) {
        setPetition(petitionContent);
        setHasCache(true);
      }
    } catch (error) {
      console.error('Erro ao gerar petição:', error);
      toast.error('Erro ao gerar petição');
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithJudgeModule = async () => {
    if (!petition) {
      toast.error("Gere a petição primeiro");
      return;
    }

    setAnalyzingJudge(true);
    try {
      // 1. Buscar informações básicas do caso
      const { data: caseInfo } = await supabase
        .from('cases')
        .select('*')
        .eq('id', data.caseId)
        .single();

      // 2. Buscar TODOS os documentos + extrações
      const { data: documents } = await supabase
        .from('documents')
        .select(`
          *,
          extractions(*)
        `)
        .eq('case_id', data.caseId);

      // 3. Buscar análise jurídica
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();

      // 4. Buscar jurisprudências selecionadas
      const { data: jurisprudence } = await supabase
        .from('jurisprudence_results')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();

      // 5. Buscar tese jurídica
      const { data: tese } = await supabase
        .from('teses_juridicas')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();

      // 6. Chamar edge function com TODOS os dados
      const { data: result, error } = await supabase.functions.invoke('analyze-petition-judge-view', {
        body: {
          petition,
          caseInfo,
          documents: documents || [],
          analysis: analysis || null,
          jurisprudence: jurisprudence || null,
          tese: tese || null
        }
      });

      if (error) throw error;

      if (result) {
        setJudgeAnalysis(result);
      }
    } catch (error: any) {
      console.error('Erro ao analisar petição:', error);
      toast.error('Erro na análise do juiz: ' + error.message);
    } finally {
      setAnalyzingJudge(false);
    }
  };

  const adaptToRegion = async () => {
    if (!petition) {
      toast.error("Gere a petição primeiro");
      return;
    }

    const estado = data.authorAddress?.match(/[A-Z]{2}$/)?.[0] || 'SP';
    
    setAdaptingRegional(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('adapt-petition-regional', {
        body: { petition, estado }
      });

      if (error) throw error;

      if (result) {
        setRegionalAdaptation(result);
        if (result.petition_adaptada) {
          setPetition(result.petition_adaptada);
        }
      }
    } catch (error) {
      console.error('Erro ao adaptar petição:', error);
      toast.error('Erro ao adaptar petição regionalmente');
    } finally {
      setAdaptingRegional(false);
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        toast.error('Por favor, envie apenas arquivos .docx');
        return;
      }
      setTemplateFile(file);
      toast.info("Funcionalidade de merge com template será implementada em breve");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(petition);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPlaceholders = async () => {
    if (!data.caseId) {
      toast.error("ID do caso não encontrado");
      return;
    }
    
    try {
      // Buscar análise jurídica
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      // Extrair placeholders
      const placeholders = extractPlaceholders(data, analysis);
      const content = generatePlaceholderList(placeholders);
      
      // Download
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `placeholders_${data.authorName || 'caso'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Erro ao gerar placeholders:', error);
      toast.error('Erro ao gerar lista de placeholders');
    }
  };

  const handleDownload = () => {
    toast.info("Download DOCX com formatação ABNT será implementado em breve");
  };

  const getSeverityColor = (gravidade: string) => {
    switch (gravidade) {
      case 'alta': return 'destructive';
      case 'media': return 'default';
      case 'baixa': return 'secondary';
      default: return 'outline';
    }
  };

  const applySingleSuggestion = async (brecha: any, index: number) => {
    setApplyingIndividualSuggestion(index);
    try {
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition,
          judgeAnalysis: {
            brechas: [brecha], // Apenas uma brecha
            pontos_fortes: [],
            pontos_fracos: [],
            recomendacoes: []
          }
        }
      });

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        // Salvar versão atualizada
        await supabase.from('drafts').insert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { single_correction: brecha.descricao }
        });
      }
    } catch (error: any) {
      console.error('Erro ao aplicar sugestão individual:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingIndividualSuggestion(null);
    }
  };

  const applyJudgeCorrections = async () => {
    if (!petition || !judgeAnalysis) return;
    
    setApplyingJudgeCorrections(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: { petition, judgeAnalysis }
      });

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        // Salvar versão corrigida no banco
        await supabase.from('drafts').insert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { corrected_by_judge: true, timestamp: new Date().toISOString() }
        });
      }
    } catch (error) {
      console.error('Erro ao aplicar correções:', error);
      toast.error('Erro ao aplicar correções do juiz');
    } finally {
      setApplyingJudgeCorrections(false);
    }
  };

  const analyzeWithAppellateModule = async () => {
    setAnalyzingAppellate(true);
    try {
      // Buscar TODOS os dados contextuais
      const { data: caseInfo } = await supabase
        .from('cases')
        .select('*')
        .eq('id', data.caseId)
        .single();

      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('case_id', data.caseId);

      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: jurisprudence } = await supabase
        .from('jurisprudence_results')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();

      const { data: tese } = await supabase
        .from('drafts')
        .select('*')
        .eq('case_id', data.caseId)
        .maybeSingle();

      const { data: result, error } = await supabase.functions.invoke(
        'analyze-petition-appellate',
        {
          body: {
            petition,
            caseInfo,
            documents: documents || [],
            analysis: analysis || null,
            jurisprudence: jurisprudence || null,
            tese: tese || null,
            judgeAnalysis: judgeAnalysis || null
          }
        }
      );

      if (error) throw error;

      setAppellateAnalysis(result);
    } catch (error: any) {
      console.error('Erro no módulo tribunal:', error);
      toast.error('Erro na análise recursiva: ' + error.message);
    } finally {
      setAnalyzingAppellate(false);
    }
  };

  const applySingleAdaptation = async (adaptacao: any, index: number) => {
    setApplyingIndividualAdaptation(index);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        'apply-judge-corrections',
        {
          body: {
            petition,
            judgeAnalysis: {
              brechas: [],
              pontos_fortes: [],
              pontos_fracos: [],
              recomendacoes: [adaptacao.adaptacao]
            }
          }
        }
      );

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        await supabase.from('drafts').insert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { regional_adaptation: adaptacao.tipo }
        });
      }
    } catch (error: any) {
      console.error('Erro:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingIndividualAdaptation(null);
    }
  };

  const handleSaveFinal = async () => {
    if (!petition || !data.caseId) return;
    
    try {
      // Marcar como versão final
      await supabase.from('drafts').insert({
        case_id: data.caseId,
        markdown_content: petition,
        payload: { final_version: true, timestamp: new Date().toISOString() }
      });
    } catch (error) {
      console.error('Erro ao salvar versão final:', error);
      toast.error("Erro ao salvar versão final");
    }
  };

  const handleProtocolar = async () => {
    if (!data.caseId) return;
    
    setIsProtocoling(true);
    try {
      // 1. Buscar valor da causa da análise
      const { data: analysisData } = await supabase
        .from('case_analysis')
        .select('valor_causa')
        .eq('case_id', data.caseId)
        .single();
      
      const valorCausa = analysisData?.valor_causa || 0;
      const valorHonorarios = valorCausa * 0.30; // 30% de honorários
      const valorCliente = valorCausa * 0.70; // 70% para cliente
      
      // 2. Atualizar status do caso
      const { error: caseError } = await supabase
        .from('cases')
        .update({ 
          status: 'protocolada',
          updated_at: new Date().toISOString()
        })
        .eq('id', data.caseId);
      
      if (caseError) throw caseError;
      
      // 3. Criar registro financeiro
      const { error: finError } = await supabase
        .from('case_financial')
        .insert({
          case_id: data.caseId,
          status: 'protocolada',
          valor_causa: valorCausa,
          percentual_honorarios: 30.0,
          valor_honorarios: valorHonorarios,
          valor_cliente: valorCliente,
          data_protocolo: new Date().toISOString().split('T')[0],
          observacoes: 'Protocolada via sistema'
        });
      
      if (finError) throw finError;
      
      // Redirecionar para aba de protocoladas
      setTimeout(() => {
        window.location.href = '/protocoladas';
      }, 1000);
    } catch (error: any) {
      console.error('Erro ao protocolar:', error);
      toast.error("Erro ao protocolar: " + error.message);
    } finally {
      setIsProtocoling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Petição Inicial Completa
          </h2>
          <p className="text-muted-foreground">
            Petição gerada com formatação ABNT, persuasão e análise crítica
          </p>
        </div>
        <Button onClick={generatePetition} disabled={loading} className="gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : hasCache ? (
            <>
              <Sparkles className="h-4 w-4" />
              Gerar Nova Versão
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Gerar Petição
            </>
          )}
        </Button>
      </div>

      {/* Ações da Petição */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleDownload} variant="outline" disabled={!petition} className="gap-2">
          <Download className="h-4 w-4" />
          Baixar DOCX
        </Button>
        <Button onClick={handleDownloadPlaceholders} variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Baixar Lista
        </Button>
        <div>
          <input
            type="file"
            accept=".docx"
            onChange={handleTemplateUpload}
            className="hidden"
            id="template-upload"
          />
          <label htmlFor="template-upload">
            <Button variant="outline" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                Enviar Modelo
              </span>
            </Button>
          </label>
        </div>
        {templateFile && (
          <Badge variant="secondary" className="px-3 py-2">
            {templateFile.name}
          </Badge>
        )}
        <Button 
          onClick={handleProtocolar}
          disabled={!petition || isProtocoling}
          className="gap-2 bg-success hover:bg-success/90"
        >
          {isProtocoling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Protocolando...
            </>
          ) : (
            <>
              <CheckCheck className="h-4 w-4" />
              Protocolar Ação
            </>
          )}
        </Button>
      </div>

      {/* Petição Gerada */}
      {loading ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Gerando petição inicial completa...</p>
            <p className="text-sm text-muted-foreground">
              Aplicando técnicas de PNL, formatação ABNT e argumentação persuasiva
            </p>
          </div>
        </Card>
      ) : petition ? (
        <Card className="p-6">
          <div className="flex justify-end mb-3">
            <Button 
              onClick={handleCopy} 
              variant="outline" 
              size="sm"
              disabled={!petition} 
              className="gap-2"
            >
              {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar Petição"}
            </Button>
          </div>
          <div className="bg-muted/30 p-6 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-[600px] overflow-y-auto">
            {petition}
          </div>

          {/* 🆕 VALIDAÇÃO DE ABAS DO MÓDULO JUIZ */}
          {judgeAnalysis?.validacao_abas && (
            <Card className="p-6 mt-6">
              <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                🔍 Controle de Qualidade - Todas as Abas
              </h4>
              <div className="space-y-4">
                {Object.entries(judgeAnalysis.validacao_abas).map(([aba, info]: [string, any]) => {
                  const statusColor = 
                    info.status === 'OK' ? 'bg-green-100 text-green-800 border-green-300' : 
                    info.status === 'ATENÇÃO' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 
                    'bg-red-100 text-red-800 border-red-300';
                  
                  return (
                    <div key={aba} className="border-l-4 pl-4 py-2" style={{ borderColor: info.status === 'OK' ? '#22c55e' : info.status === 'ATENÇÃO' ? '#eab308' : '#ef4444' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={statusColor}>
                          {aba.toUpperCase()}
                        </Badge>
                        <span className="font-semibold text-sm">{info.status}</span>
                      </div>
                      {info.problemas && info.problemas.length > 0 && (
                        <ul className="text-sm text-muted-foreground ml-2 space-y-1">
                          {info.problemas.map((problema: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{problema}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </Card>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Clique em "Gerar Nova Versão" para criar a petição inicial
        </Card>
      )}

      {/* Seção 2: Módulo Juiz */}
      {petition && (
        <Card className="p-6 border-2 border-orange-200 dark:border-orange-900">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Target className="h-6 w-6 text-orange-600" />
                  <div>
                    <h3 className="text-xl font-bold">Módulo Juiz - Análise Crítica</h3>
                    <p className="text-sm text-muted-foreground">
                      Identifique brechas e pontos fracos antes do protocolo
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={analyzeWithJudgeModule} disabled={analyzingJudge}>
                  {analyzingJudge ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    "Analisar como Juiz"
                  )}
                </Button>
              </div>
            </CollapsibleTrigger>

            {judgeAnalysis && (
              <CollapsibleContent className="mt-6 space-y-4">
                {/* Botão Aplicar Correções */}
                <div className="flex justify-end">
                  <Button 
                    onClick={applyJudgeCorrections}
                    disabled={applyingJudgeCorrections}
                    className="gap-2 bg-orange-600 hover:bg-orange-700"
                  >
                    {applyingJudgeCorrections ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aplicando...
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4" />
                        Aplicar Correções Automaticamente
                      </>
                    )}
                  </Button>
                </div>

                {/* Risco de Improcedência */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Risco de Improcedência</p>
                    <Badge variant={judgeAnalysis.risco_improcedencia > 50 ? 'destructive' : 'default'}>
                      {judgeAnalysis.risco_improcedencia}%
                    </Badge>
                  </div>
                  <Progress value={judgeAnalysis.risco_improcedencia} className="h-2" />
                </div>

                {/* Brechas Identificadas */}
                {judgeAnalysis.brechas.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Brechas Identificadas
                    </h4>
                    {judgeAnalysis.brechas.map((brecha, index) => (
                      <Card key={index} className="p-4 border-l-4" style={{
                        borderLeftColor: brecha.gravidade === 'alta' ? 'hsl(var(--destructive))' : 
                                       brecha.gravidade === 'media' ? 'hsl(var(--warning))' : 
                                       'hsl(var(--muted))'
                      }}>
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant={getSeverityColor(brecha.gravidade) as any}>
                            {brecha.tipo} - {brecha.gravidade}
                          </Badge>
                        </div>
                        <p className="font-medium mb-1">{brecha.descricao}</p>
                        <p className="text-sm text-muted-foreground mb-2">
                          Local: {brecha.localizacao}
                        </p>
                        <div className="bg-muted/50 p-3 rounded mt-2">
                          <p className="text-sm mb-3">
                            <strong>Sugestão:</strong> {brecha.sugestao}
                          </p>
                          
                          {/* Botão Individual */}
                          <Button
                            size="sm"
                            onClick={() => applySingleSuggestion(brecha, index)}
                            disabled={applyingIndividualSuggestion !== null}
                            className="gap-2 w-full"
                            variant="outline"
                          >
                            {applyingIndividualSuggestion === index ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Aplicando...
                              </>
                            ) : (
                              <>
                                <CheckCheck className="h-3 w-3" />
                                Aplicar esta Sugestão
                              </>
                            )}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pontos Fortes e Fracos */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h4 className="font-semibold text-green-600 mb-2">Pontos Fortes</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {judgeAnalysis.pontos_fortes.map((ponto, index) => (
                        <li key={index}>{ponto}</li>
                      ))}
                    </ul>
                  </Card>
                  <Card className="p-4">
                    <h4 className="font-semibold text-red-600 mb-2">Pontos Fracos</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {judgeAnalysis.pontos_fracos.map((ponto, index) => (
                        <li key={index}>{ponto}</li>
                      ))}
                    </ul>
                  </Card>
                </div>

                {/* Recomendações */}
                {judgeAnalysis.recomendacoes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Recomendações</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {judgeAnalysis.recomendacoes.map((rec, index) => (
                        <li key={index}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleContent>
            )}
          </Collapsible>
        </Card>
      )}

      {/* Seção 3: Módulo Tribunal */}
      {petition && (
        <Card className="p-6 border-2 border-blue-200 dark:border-blue-900">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <MapPin className="h-6 w-6 text-blue-600" />
                  <div>
                    <h3 className="text-xl font-bold">Módulo Tribunal - Adaptação Regional</h3>
                    <p className="text-sm text-muted-foreground">
                      Adapte a petição ao estilo e entendimento do tribunal local
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={adaptToRegion} disabled={adaptingRegional}>
                  {adaptingRegional ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adaptando...
                    </>
                  ) : (
                    "Adaptar para Região"
                  )}
                </Button>
              </div>
            </CollapsibleTrigger>

            {regionalAdaptation && (
              <CollapsibleContent className="mt-6 space-y-4">
                {/* Botões individuais aplicam as adaptações - sem botão global */}

                {/* Identificação do TRF */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-lg px-4 py-2">
                    {regionalAdaptation.trf}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Tribunal Regional Federal identificado
                  </p>
                </div>

                {/* Tendências do Tribunal */}
                {regionalAdaptation.tendencias.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Tendências do {regionalAdaptation.trf}</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {regionalAdaptation.tendencias.map((tend, index) => (
                        <li key={index}>{tend}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Estilo Preferido */}
                <Card className="p-4 bg-blue-50 dark:bg-blue-950">
                  <h4 className="font-semibold mb-2">Estilo Argumentativo Preferido</h4>
                  <p className="text-sm">{regionalAdaptation.estilo_preferido}</p>
                </Card>

                {/* Jurisprudências Locais */}
                {regionalAdaptation.jurisprudencias_locais_sugeridas.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">Jurisprudências Locais Recomendadas</h4>
                    {regionalAdaptation.jurisprudencias_locais_sugeridas.map((juris, index) => (
                      <Card key={index} className="p-4">
                        <p className="text-sm font-medium mb-1">{juris.numero}</p>
                        <p className="text-sm mb-2">{juris.tese}</p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Por que usar:</strong> {juris.motivo}
                        </p>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Adaptações Sugeridas */}
                {regionalAdaptation.adaptacoes_sugeridas.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">Adaptações Sugeridas por Seção</h4>
                    {regionalAdaptation.adaptacoes_sugeridas.map((adapt, index) => (
                      <Card key={index} className="p-4">
                        <Badge variant="outline" className="mb-2">{adapt.secao}</Badge>
                        <p className="text-sm mb-2">{adapt.adaptacao}</p>
                        <p className="text-xs text-muted-foreground">
                          <strong>Justificativa:</strong> {adapt.justificativa}
                        </p>
                      </Card>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            )}
          </Collapsible>
        </Card>
      )}

      {/* Ações Finais */}
      {petition && (
        <div className="flex gap-3">
          <Button size="lg" onClick={handleSaveFinal} disabled={!petition} className="gap-2">
            <CheckCheck className="h-5 w-5" />
            Salvar Versão Final
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={handleProtocolar} 
            disabled={!petition || isProtocoling}
            className="gap-2"
          >
            {isProtocoling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Protocolando...
              </>
            ) : (
              "Marcar como Protocolada"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
