import { CaseData } from "@/pages/NewCase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Download, Copy, CheckCheck, Loader2, AlertTriangle, Target, MapPin, Upload, Sparkles, X, CheckCircle2, Shield, AlertCircle, Lightbulb, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import jsPDF from 'jspdf';
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
  const [qualityReport, setQualityReport] = useState<any>(null);
  const [selectedBrechas, setSelectedBrechas] = useState<number[]>([]);

  // ✅ CORREÇÃO #1: Verificar e regeração automática de petição com placeholders
  useEffect(() => {
    const checkAndRegeneratePetition = async () => {
      if (!data.caseId) return;
      
      try {
        // Buscar petição do cache
        const { data: draft } = await supabase
          .from('drafts')
          .select('markdown_content, generated_at')
          .eq('case_id', data.caseId)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (draft?.markdown_content) {
          // Verificar se tem placeholders
          const hasPlaceholders = 
            draft.markdown_content.includes('[CIDADE/UF]') ||
            draft.markdown_content.includes('[estado civil]') ||
            draft.markdown_content.includes('[RG]') ||
            draft.markdown_content.includes('[número]') ||
            draft.markdown_content.includes('[endereço]') ||
            draft.markdown_content.includes('[A SER DISTRIBUÍDO]');
          
          // ✅ CORREÇÃO #5: Verificar se a cidade está errada
          const wrongCity = 
            draft.markdown_content.includes('SÃO PAULO/SP') && 
            !data.authorAddress?.toUpperCase().includes('SÃO PAULO');

          if (wrongCity) {
            console.error('🔴 PETIÇÃO COM CIDADE ERRADA - Porto Velho → São Paulo');
            toast.error('Cidade incorreta na petição! Regerando automaticamente...');
            setPetition('');
            setHasCache(false);
            await generatePetition();
            return;
          }
          
          if (hasPlaceholders) {
            console.warn('🔴 [DRAFT] PETIÇÃO DESATUALIZADA COM PLACEHOLDERS - Regerando automaticamente...');
            toast.warning('⚠️ Petição desatualizada detectada. Regerando automaticamente...', { 
              id: 'regen',
              duration: 5000 
            });
            
            // Limpar cache e forçar regeração
            setPetition('');
            setHasCache(false);
            
            // Regerar
            await generatePetition();
            toast.success('✅ Petição regerada com sucesso!', { id: 'regen' });
          } else {
            // Cache válido, carregar
          setPetition(draft.markdown_content);
          setHasCache(true);
          console.log('[DRAFT] ✅ Carregado do cache (sem placeholders)');
          
          // ✅ Carregar relatório de qualidade
          await loadQualityReport();
        }
      }
    } catch (error) {
      console.error('[DRAFT] Erro ao verificar cache:', error);
    }
    
    // Carregar template também
    await loadExistingTemplate();
  };
  
  const loadQualityReport = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: report, error } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('case_id', data.caseId)
        .eq('document_type', 'petition')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && report) {
        setQualityReport(report);
        console.log('[QUALITY] Relatório carregado:', report);
      }
    } catch (error) {
      console.error('[QUALITY] Erro ao carregar relatório:', error);
    }
  };
    
    if (data.caseId && !petition) {
      checkAndRegeneratePetition();
    }
  }, [data.caseId]);

  const loadQualityReport = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: report, error } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('case_id', data.caseId)
        .eq('document_type', 'petition')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && report) {
        setQualityReport(report);
        console.log('[QUALITY] Relatório carregado:', report);
      }
    } catch (error) {
      console.error('[QUALITY] Erro ao carregar relatório:', error);
    }
  };

  // ✅ CORREÇÃO #5: Função para limpar cache e regerar tudo
  const clearCacheAndRegenerate = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      console.log('[DRAFT] 🗑️ Limpando cache de petição...');
      
      // Deletar petição antiga
      await supabase
        .from('drafts')
        .delete()
        .eq('case_id', data.caseId);
      
      setPetition('');
      setHasCache(false);
      toast.success('🗑️ Cache limpo. Regerando...', { id: 'clear' });
      
      // Gerar nova
      await generatePetition();
      toast.success('✅ Petição regerada com sucesso!', { id: 'clear' });
    } catch (error) {
      console.error('[DRAFT] Erro ao limpar cache:', error);
      toast.error('❌ Erro ao limpar cache');
    } finally {
      setLoading(false);
    }
  };

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
        console.log('[DRAFT] ✅ Carregado do cache');
      }
    } catch (error) {
      console.error('[DRAFT] Erro ao carregar cache:', error);
    }
  };

  const loadExistingTemplate = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: caseData } = await supabase
        .from('cases')
        .select('template_url')
        .eq('id', data.caseId)
        .maybeSingle();

      if (caseData?.template_url) {
        // Criar objeto File simulado para exibir controles
        setTemplateFile(new File([], 'modelo.docx', { 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
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
        
        // Carregar relatório de qualidade
        await loadQualityReport();
      }
    } catch (error) {
      console.error('Erro ao gerar petição:', error);
      toast.error('Erro ao gerar petição');
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithJudgeModule = async (isRevalidation = false) => {
    // 🔍 Buscar a última draft do banco (FORÇAR FRESH)
    const { data: latestDraft, error: fetchError } = await supabase
      .from('drafts')
      .select('markdown_content, id, generated_at')
      .eq('case_id', data.caseId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[JUDGE] 🔍 Draft buscada:', {
      id: latestDraft?.id,
      timestamp: latestDraft?.generated_at,
      length: latestDraft?.markdown_content?.length
    });

    if (fetchError) {
      console.error('[JUDGE] Erro ao buscar draft:', fetchError);
    }
    
    const petitionToAnalyze = latestDraft?.markdown_content || petition;
    
    if (!petitionToAnalyze) {
      toast.error("Gere a petição primeiro");
      return;
    }

    // Sincronizar estado local com versão do banco se diferente
    if (latestDraft?.markdown_content && latestDraft.markdown_content !== petition) {
      setPetition(latestDraft.markdown_content);
    }

    if (isRevalidation) {
      toast.loading("🔍 Revalidando petição corrigida...", { id: 'judge-revalidation' });
    } else {
      setAnalyzingJudge(true);
    }
    
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

      // 6. Chamar edge function com TODOS os dados (usando versão do banco)
      const { data: result, error } = await supabase.functions.invoke('analyze-petition-judge-view', {
        body: {
          petition: petitionToAnalyze,
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
        
        // Feedback diferenciado para re-análise
        if (isRevalidation) {
          if (result.brechas.length === 0) {
            toast.success("✅ Validação concluída! Nenhuma brecha detectada. Risco: 0%", 
              { id: 'judge-revalidation', duration: 6000 });
          } else {
            toast.warning(`⚠️ ${result.brechas.length} nova(s) brecha(s) detectada(s) após correção.`, 
              { id: 'judge-revalidation', duration: 6000 });
          }
        }
      }
    } catch (error: any) {
      console.error('Erro ao analisar petição:', error);
      if (isRevalidation) {
        toast.error('Erro na revalidação: ' + error.message, { id: 'judge-revalidation' });
      } else {
        toast.error('Erro na análise do juiz: ' + error.message);
      }
    } finally {
      if (!isRevalidation) {
        setAnalyzingJudge(false);
      }
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

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      toast.error('Por favor, envie apenas arquivos .docx');
      return;
    }

    try {
      // 1. Upload para Storage
      const fileName = `${data.caseId}/${Date.now()}_template.docx`;
      const { error: uploadError } = await supabase.storage
        .from('case-templates')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Obter URL pública
      const { data: publicUrl } = supabase.storage
        .from('case-templates')
        .getPublicUrl(fileName);

      // 3. Salvar URL no banco
      await supabase
        .from('cases')
        .update({ template_url: publicUrl.publicUrl })
        .eq('id', data.caseId);

      setTemplateFile(file);
      toast.success('Modelo enviado com sucesso!');

    } catch (error) {
      console.error('Erro ao enviar modelo:', error);
      toast.error('Erro ao enviar modelo');
    }
  };

  const handleDownloadTemplate = async () => {
    if (!data.caseId) return;
    
    try {
      // Buscar URL do template
      const { data: caseData } = await supabase
        .from('cases')
        .select('template_url')
        .eq('id', data.caseId)
        .maybeSingle();

      if (!caseData?.template_url) {
        toast.error('Modelo não encontrado');
        return;
      }

      // Fazer download
      window.open(caseData.template_url, '_blank');
      
    } catch (error) {
      console.error('Erro ao baixar modelo:', error);
      toast.error('Erro ao baixar modelo');
    }
  };

  const handleRemoveTemplate = async () => {
    if (!data.caseId) return;
    
    try {
      // 1. Buscar URL atual
      const { data: caseData } = await supabase
        .from('cases')
        .select('template_url')
        .eq('id', data.caseId)
        .maybeSingle();

      if (caseData?.template_url) {
        // 2. Extrair path do Storage
        const path = caseData.template_url.split('/case-templates/')[1];
        
        // 3. Deletar do Storage
        await supabase.storage
          .from('case-templates')
          .remove([path]);
      }

      // 4. Limpar do banco
      await supabase
        .from('cases')
        .update({ template_url: null })
        .eq('id', data.caseId);

      // 5. Limpar estado local
      setTemplateFile(null);
      toast.success('Modelo removido com sucesso');

    } catch (error) {
      console.error('Erro ao remover modelo:', error);
      toast.error('Erro ao remover modelo');
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

  const handleDownloadDOCX = async () => {
    if (!petition) return;
    
    try {
      // Converter markdown para DOCX com formatação ABNT
      const lines = petition.split('\n');
      const paragraphs = lines.map(line => {
        if (line.startsWith('# ')) {
          return new Paragraph({
            text: line.replace('# ', ''),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120 }
          });
        } else if (line.startsWith('## ')) {
          return new Paragraph({
            text: line.replace('## ', ''),
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.LEFT,
            spacing: { before: 200, after: 100 }
          });
        } else {
          return new Paragraph({
            text: line,
            spacing: { line: 360 }, // 1.5 linhas (ABNT)
            alignment: AlignmentType.JUSTIFIED
          });
        }
      });

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1134, // 2cm (ABNT)
                right: 1134,
                bottom: 1134,
                left: 1134
              }
            }
          },
          children: paragraphs
        }]
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `peticao_${data.authorName || 'caso'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('✅ DOCX baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar DOCX:', error);
      toast.error('Erro ao gerar DOCX');
    }
  };

  const handleDownloadPDF = () => {
    if (!petition) return;
    
    try {
      const doc = new jsPDF({
        format: 'a4',
        unit: 'mm'
      });

      // Configurar fonte e margens ABNT
      doc.setFontSize(12);
      const pageWidth = doc.internal.pageSize.getWidth();
      const margins = { top: 20, left: 30, right: 20 };
      const maxWidth = pageWidth - margins.left - margins.right;

      // Adicionar texto com quebra de linha
      const lines = doc.splitTextToSize(petition, maxWidth);
      let y = margins.top;

      lines.forEach((line: string) => {
        if (y > 280) {
          doc.addPage();
          y = margins.top;
        }
        doc.text(line, margins.left, y);
        y += 7; // Espaçamento 1.5 linhas
      });

      doc.save(`peticao_${data.authorName || 'caso'}.pdf`);
      toast.success('✅ PDF baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
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
        
        // 1. Remover a brecha corrigida da lista
        const brechasRestantes = judgeAnalysis.brechas.filter((_, i) => i !== index);
        
        // 2. Calcular redução de risco baseada na gravidade
        const reducao = brecha.gravidade === 'alta' ? 15 : 
                        brecha.gravidade === 'media' ? 10 : 5;
        const riscoAnterior = judgeAnalysis.risco_improcedencia;
        const novoRisco = Math.max(0, riscoAnterior - reducao);
        
        // 3. Atualizar o estado judgeAnalysis
        setJudgeAnalysis({
          ...judgeAnalysis,
          brechas: brechasRestantes,
          risco_improcedencia: novoRisco
        });
        
        // 4. Feedback visual forte
        toast.success(
          `✅ Correção aplicada!\n📉 Risco: ${riscoAnterior}% → ${novoRisco}%\n📋 ${brechasRestantes.length} brecha(s) restante(s)`,
          { duration: 5000 }
        );
        
        // 5. Scroll e flash verde na petição
        setTimeout(() => {
          const el = document.querySelector('[data-petition-content]');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('ring-4', 'ring-green-500', 'transition-all');
            setTimeout(() => el.classList.remove('ring-4', 'ring-green-500'), 2000);
          }
        }, 300);
        
        // 6. Se foi a última brecha, parabenizar e RE-ANALISAR automaticamente
        if (brechasRestantes.length === 0) {
          setTimeout(() => {
            toast.success("🎉 Todas as brechas corrigidas! Petição fortificada!", 
              { duration: 6000 });
            
            // ✨ VALIDAÇÃO AUTOMÁTICA: Re-análise para confirmar 0% de risco
            setTimeout(() => {
              toast.info("🔍 Validando correções com o Módulo Juiz...", { duration: 3000 });
              
              setTimeout(() => {
                analyzeWithJudgeModule(true); // Re-análise automática
              }, 1500);
            }, 2000);
          }, 1000);
        }
        
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

  const applySelectedCorrections = async () => {
    if (selectedBrechas.length === 0) {
      toast.error("Selecione pelo menos uma brecha para corrigir");
      return;
    }
    if (!judgeAnalysis) return;

    // 🚀 OTIMIZAÇÃO: Se selecionou TODAS, usar método otimizado
    if (selectedBrechas.length === judgeAnalysis.brechas.length) {
      setSelectedBrechas([]); // Limpar seleção
      return applyJudgeCorrections(); // Delegar para função original (mais rápida)
    }

    setApplyingJudgeCorrections(true);
    
    try {
      const totalSelected = selectedBrechas.length;
      
      // ✅ Coletar todas as brechas selecionadas
      const selectedBrechasData = selectedBrechas.map(idx => judgeAnalysis.brechas[idx]);
      
      // 🆕 ESTRATÉGIA DE LOTES: Processar em pares para evitar timeout
      const BATCH_SIZE = 2; // Processar 2 brechas por vez
      let currentPetition = petition;
      
      console.log('[CORRECTIONS] 🔧 Iniciando aplicação de correções');
      console.log('[CORRECTIONS] Total de brechas:', totalSelected);
      console.log('[CORRECTIONS] Case ID:', data.caseId);
      console.log('[CORRECTIONS] Petition length ANTES:', petition.length);
      console.log('[CORRECTIONS] Tamanho dos lotes:', BATCH_SIZE);
      
      toast.info(`⚙️ Aplicando ${totalSelected} correção(ões)...`, { duration: 3000 });
      
      // Processar em lotes
      for (let i = 0; i < selectedBrechasData.length; i += BATCH_SIZE) {
        const batch = selectedBrechasData.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(selectedBrechasData.length / BATCH_SIZE);
        
        console.log(`[CORRECTIONS] Processando lote ${batchNum}/${totalBatches}:`, batch.map(b => b.tipo));
        
        if (totalSelected > 2) {
          toast.info(`⚙️ Lote ${batchNum}/${totalBatches}: ${batch.map(b => b.tipo).join(', ')}`, { 
            duration: 2000 
          });
        }
        
        // ✅ Invocar edge function com este lote
        const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
          body: {
            petition: currentPetition, // Usar versão mais recente
            judgeAnalysis: {
              brechas: batch,
              pontos_fortes: [],
              pontos_fracos: [],
              recomendacoes: []
            }
          }
        });
        
        console.log(`[CORRECTIONS] Lote ${batchNum} concluído:`, result ? 'OK' : 'NULL');
        
        if (error) throw error;
        
        if (result?.petition_corrigida) {
          console.log('[CORRECTIONS] Petition length DEPOIS do lote:', result.petition_corrigida.length);
          currentPetition = result.petition_corrigida; // Atualizar para próximo lote
          setPetition(currentPetition);
        }
      }
      
      // Atualizar petition final
      setPetition(currentPetition);
      
      // Calcular redução de risco
      const reducaoTotal = selectedBrechasData.reduce((acc, brecha) => {
        const reducao = brecha.gravidade === 'alta' ? 15 : 
                       brecha.gravidade === 'media' ? 10 : 5;
        return acc + reducao;
      }, 0);
      
      const riscoAtual = Math.max(0, judgeAnalysis.risco_improcedencia - reducaoTotal);
      
      // Remover brechas aplicadas
      const brechasRestantes = judgeAnalysis.brechas.filter(
        (_, idx) => !selectedBrechas.includes(idx)
      );
      
      // Atualizar estado
      setJudgeAnalysis({
        ...judgeAnalysis,
        brechas: brechasRestantes,
        risco_improcedencia: riscoAtual
      });
      
      // Salvar a versão final no banco de dados E CONFIRMAR O ID
      const { data: savedDraft, error: saveError } = await supabase
        .from('drafts')
        .insert({
          case_id: data.caseId,
          markdown_content: currentPetition,
          payload: { selected_corrections: selectedBrechasData.map(b => b.descricao) }
        })
        .select()
        .single();

      if (saveError) {
        console.error('[CORRECTIONS] Erro ao salvar:', saveError);
        throw saveError;
      }

      console.log('[CORRECTIONS] ✅ Salvo no banco - ID:', savedDraft.id);
      console.log('[CORRECTIONS] ✅ Timestamp:', savedDraft.generated_at);
      
      // Limpar seleção
      setSelectedBrechas([]);
      
      toast.success(
        `✅ ${totalSelected} correção(ões) aplicadas e salvas!\n🔍 Re-analisando...`,
        { duration: 5000 }
      );
      
      // Flash verde
      setTimeout(() => {
        const el = document.querySelector('[data-petition-content]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('ring-4', 'ring-green-500', 'transition-all');
          setTimeout(() => el.classList.remove('ring-4', 'ring-green-500'), 2000);
        }
      }, 300);
      
      // ✅ SEMPRE RE-ANALISAR (delay aumentado para garantir propagação)
      setTimeout(() => {
        toast.info("🔍 Validando correções com o Módulo Juiz...", { duration: 3000 });
        setTimeout(() => analyzeWithJudgeModule(true), 2500); // 2.5s em vez de 1.5s
      }, 2000);
      
    } catch (error: any) {
      console.error('Erro ao aplicar correções selecionadas:', error);
      
      // 🆕 Mensagens de erro específicas
      if (error.message?.includes('TIMEOUT') || error.message?.includes('408')) {
        toast.error('⏱️ Tempo limite excedido. Tente selecionar menos brechas por vez.', {
          duration: 6000
        });
      } else if (error.message?.includes('429')) {
        toast.error('🚫 Limite de requisições atingido. Aguarde alguns segundos.', {
          duration: 6000
        });
      } else {
        toast.error('Erro ao aplicar correções: ' + error.message);
      }
    } finally {
      setApplyingJudgeCorrections(false);
    }
  };

  const applyJudgeCorrections = async () => {
    if (!petition || !judgeAnalysis) {
      console.log('[APPLY-CORRECTIONS] Faltam dados:', { 
        hasPetition: !!petition, 
        hasJudgeAnalysis: !!judgeAnalysis 
      });
      toast.error('Dados insuficientes. Gere a petição e analise com o Módulo Juiz primeiro.');
      return;
    }
    
    console.log('[APPLY-CORRECTIONS] Iniciando aplicação de correções...');
    console.log('[APPLY-CORRECTIONS] Petition length:', petition?.length);
    console.log('[APPLY-CORRECTIONS] Petition preview:', petition?.substring(0, 100));
    console.log('[APPLY-CORRECTIONS] JudgeAnalysis:', JSON.stringify(judgeAnalysis, null, 2).substring(0, 500));
    console.log('[APPLY-CORRECTIONS] Número de brechas:', judgeAnalysis?.brechas?.length || 0);
    
    setApplyingJudgeCorrections(true);
    
    try {
      console.log('[APPLY-CORRECTIONS] Chamando edge function apply-judge-corrections...');
      const startTime = Date.now();
      
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition,
          judgeAnalysis
        }
      });
      
      const endTime = Date.now();
      console.log('[APPLY-CORRECTIONS] Resposta recebida em', endTime - startTime, 'ms');
      console.log('[APPLY-CORRECTIONS] Error?', error);
      console.log('[APPLY-CORRECTIONS] Result?', result);

      if (error) {
        console.error('[APPLY-CORRECTIONS] Erro da função:', error);
        
        // Tratamento específico de erros
        if (error.message?.includes('timeout') || error.message?.includes('408')) {
          toast.error("Timeout: A aplicação das correções demorou muito. Tente novamente.");
        } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          toast.error("Rate Limit: Muitas requisições. Aguarde alguns segundos.");
        } else if (error.message?.includes('credits') || error.message?.includes('402')) {
          toast.error("Créditos Lovable AI esgotados. Adicione mais créditos.");
        } else {
          throw error;
        }
        return;
      }

      console.log('[APPLY-CORRECTIONS] Resultado recebido:', { 
        hasResult: !!result, 
        hasPetitionCorrigida: !!result?.petition_corrigida 
      });

      if (result?.petition_corrigida) {
        const oldLength = petition.length;
        const newLength = result.petition_corrigida.length;
        const diff = newLength - oldLength;
        
        console.log('[APPLY-CORRECTIONS] Aplicando correções...', { oldLength, newLength, diff });
        
        setPetition(result.petition_corrigida);
        
        // Salvar versão corrigida no banco com judge_analysis para integração com Módulo Tribunal
        const { error: upsertError } = await supabase.from('drafts').upsert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { 
            corrected_by_judge: true, 
            judge_analysis: judgeAnalysis,
            timestamp: new Date().toISOString() 
          } as any
        });
        
        if (upsertError) {
          console.error('[APPLY-CORRECTIONS] Erro ao salvar draft:', upsertError);
        }
        
        // Reduzir risco após aplicar correções
        const newRisk = Math.max(0, (judgeAnalysis.risco_improcedencia || 0) - 15);
        setJudgeAnalysis(prev => prev ? { ...prev, risco_improcedencia: newRisk } : prev);
        
        toast.success(`✅ ${judgeAnalysis.brechas?.length || 0} correções aplicadas! Petição ${diff > 0 ? 'ampliada' : 'otimizada'} em ${Math.abs(diff)} caracteres. Risco reduzido para ${newRisk}%.`);

        // ✅ CORREÇÃO #2: Feedback visual melhorado
        setTimeout(() => {
          const petitionElement = document.querySelector('[data-petition-content]');
          if (petitionElement) {
            petitionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Flash visual
            petitionElement.classList.add('ring-4', 'ring-green-500', 'animate-pulse');
            setTimeout(() => {
              petitionElement.classList.remove('ring-4', 'ring-green-500', 'animate-pulse');
            }, 2000);
          }
        }, 300);
        
        // ✨ VALIDAÇÃO AUTOMÁTICA: Re-análise após aplicar todas as correções
        setTimeout(() => {
          toast.info("🔍 Validando correções com o Módulo Juiz...", { duration: 3000 });
          
          setTimeout(() => {
            analyzeWithJudgeModule(true); // Re-análise automática
          }, 1500);
        }, 2500);
      } else {
        console.warn('[APPLY-CORRECTIONS] Resposta sem petition_corrigida:', result);
        toast.error("A função retornou, mas sem conteúdo de petição corrigida.");
      }
    } catch (error: any) {
      console.error('[APPLY-CORRECTIONS] Erro geral:', error);
      toast.error(`Erro ao aplicar correções: ${error.message || "Erro desconhecido"}`);
    } finally {
      setApplyingJudgeCorrections(false);
      console.log('[APPLY-CORRECTIONS] Processo finalizado');
    }
  };

  const analyzeWithAppellateModule = async () => {
    setAnalyzingAppellate(true);
    try {
      // Buscar petição corrigida do banco (se existir)
      const { data: latestDraft } = await supabase
        .from('drafts')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Usar petição corrigida se disponível
      const draftPayload = latestDraft?.payload as any;
      const petitionToUse = draftPayload?.corrected_by_judge 
        ? latestDraft.markdown_content 
        : petition;
      
      const judgeAnalysisToUse = draftPayload?.judge_analysis || judgeAnalysis;
      
      console.log('[TRIBUNAL] Usando petição:', draftPayload?.corrected_by_judge ? 'CORRIGIDA' : 'ORIGINAL');
      console.log('[TRIBUNAL] Judge analysis disponível:', !!judgeAnalysisToUse);
      
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
            petition: petitionToUse,
            caseInfo,
            documents: documents || [],
            analysis: analysis || null,
            jurisprudence: jurisprudence || null,
            tese: tese || null,
            judgeAnalysis: judgeAnalysisToUse
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

  const applyRegionalAdaptations = async () => {
    setApplyingRegionalAdaptations(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition,
          judgeAnalysis: {
            brechas: [],
            pontos_fortes: [],
            pontos_fracos: [],
            recomendacoes: regionalAdaptation?.adaptacoes_sugeridas.map(a => a.adaptacao) || []
          }
        }
      });

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        await supabase.from('drafts').upsert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { regional_adaptations_applied: true }
        });
        
        toast.success(`✅ ${regionalAdaptation?.adaptacoes_sugeridas.length || 0} adaptações regionais aplicadas!`);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingRegionalAdaptations(false);
    }
  };

  const applyAppellateAdaptations = async () => {
    setApplyingRegionalAdaptations(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition,
          judgeAnalysis: {
            brechas: [],
            pontos_fortes: [],
            pontos_fracos: [],
            recomendacoes: appellateAnalysis?.adaptacoes_regionais?.map((a: any) => a.sugestao) || []
          }
        }
      });

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        await supabase.from('drafts').upsert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          payload: { appellate_adaptations_applied: true }
        });
        
        toast.success(`✅ ${appellateAnalysis?.adaptacoes_regionais?.length || 0} adaptações do tribunal aplicadas!`);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingRegionalAdaptations(false);
    }
  };

  const handleSaveFinal = async () => {
    if (!petition || !data.caseId) return;
    
    try {
      toast.info('Salvando versão final e gerando documentos...');
      
      // Marcar como versão final
      const { data: savedDraft } = await supabase.from('drafts').insert({
        case_id: data.caseId,
        markdown_content: petition,
        payload: { final_version: true, timestamp: new Date().toISOString() }
      }).select().single();

      if (savedDraft) {
        toast.success('✅ Versão final salva com sucesso!');
      }
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
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <FileText className="h-7 w-7 text-primary" />
          Petição Inicial Completa
          <Button onClick={generatePetition} disabled={loading} className="gap-2 ml-4">
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
        </h2>
      </div>

      {/* ✅ CONTROLE DE QUALIDADE */}
      {qualityReport && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              🤖 Controle de Qualidade - IA Devolutiva
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium">Status Geral</span>
                <Badge variant={
                  qualityReport.status === 'aprovado' ? 'default' :
                  qualityReport.status === 'corrigido_automaticamente' ? 'secondary' :
                  'destructive'
                }>
                  {qualityReport.status === 'aprovado' ? '✅ Aprovado' :
                   qualityReport.status === 'corrigido_automaticamente' ? '⚡ Corrigido Automaticamente' :
                   '⚠️ Requer Revisão'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium">Endereçamento</span>
                {qualityReport.enderecamento_ok ? (
                  <Badge variant="default" className="bg-green-600">✅ Correto</Badge>
                ) : (
                  <Badge variant="destructive">❌ Corrigido pela IA</Badge>
                )}
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium">Dados Completos</span>
                {qualityReport.dados_completos ? (
                  <Badge variant="default" className="bg-green-600">✅ Todos preenchidos</Badge>
                ) : (
                  <Badge variant="secondary">⚠️ {qualityReport.campos_faltantes?.length || 0} campos faltando</Badge>
                )}
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium">Jurisdição (validada online)</span>
                <Badge variant={
                  qualityReport.jurisdicao_confianca === 'alta' ? 'default' :
                  qualityReport.jurisdicao_confianca === 'media' ? 'secondary' :
                  'outline'
                }>
                  {qualityReport.jurisdicao_confianca === 'alta' ? '✅ Alta confiança' :
                   qualityReport.jurisdicao_confianca === 'media' ? '⚠️ Média confiança' :
                   '📍 Baixa confiança'}
                </Badge>
              </div>
              
              {qualityReport.jurisdicao_validada && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    Jurisdição Validada:
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Subseção:</strong> {qualityReport.jurisdicao_validada.subsecao}/{qualityReport.jurisdicao_validada.uf}
                  </p>
                  {qualityReport.jurisdicao_validada.observacao && (
                    <p className="text-sm text-blue-800 mt-1">
                      <strong>Observação:</strong> {qualityReport.jurisdicao_validada.observacao}
                    </p>
                  )}
                  {qualityReport.fonte && qualityReport.fonte !== 'dados do caso' && (
                    <p className="text-xs text-blue-600 mt-2">
                      <strong>Fonte:</strong>{' '}
                      <a 
                        href={qualityReport.fonte} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {qualityReport.fonte}
                      </a>
                    </p>
                  )}
                </div>
              )}
              
              {qualityReport.issues && qualityReport.issues.length > 0 && (
                <Alert variant={qualityReport.issues.some((i: any) => i.gravidade === 'CRÍTICO') ? 'destructive' : 'default'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Problemas Detectados e Corrigidos</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc ml-4 mt-2 text-sm">
                      {qualityReport.issues.map((issue: any, idx: number) => (
                        <li key={idx}>
                          <strong>{issue.tipo}:</strong> {issue.problema}
                          {issue.acao && <span className="text-green-600 ml-2">({issue.acao})</span>}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações da Petição */}
      <div className="flex flex-wrap items-center gap-3">
        {/* ✅ CORREÇÃO #5: Botão para limpar cache e regerar */}
        <Button 
          onClick={clearCacheAndRegenerate} 
          variant="destructive" 
          disabled={loading || !petition} 
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Limpar Cache & Regerar Tudo
        </Button>
        
        <Button onClick={handleDownloadDOCX} variant="outline" disabled={!petition} className="gap-2">
          <Download className="h-4 w-4" />
          Baixar DOCX
        </Button>
        <Button onClick={handleDownloadPDF} variant="outline" disabled={!petition} className="gap-2">
          <Download className="h-4 w-4" />
          Baixar PDF
        </Button>
        <Button onClick={handleDownloadPlaceholders} variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Baixar Lista
        </Button>
        {!templateFile ? (
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
        ) : (
          <>
            <Button 
              onClick={handleDownloadTemplate}
              variant="outline" 
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Baixar Modelo
            </Button>
            <Button
              onClick={handleRemoveTemplate}
              variant="ghost"
              size="icon"
              className="h-10 w-10"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
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
          <div 
            className="bg-muted/30 p-6 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-[600px] overflow-y-auto"
            data-petition-content
          >
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
                <Button variant="outline" onClick={() => analyzeWithJudgeModule()} disabled={analyzingJudge}>
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
                {/* ✅ CORREÇÃO #2: Badge de status atualizado */}
                {applyingJudgeCorrections && (
                  <Badge className="animate-pulse bg-green-600 mb-4">
                    ⚡ Aplicando correções na petição...
                  </Badge>
                )}
                
                {/* Botão Aplicar Correções */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button 
                    onClick={applySelectedCorrections}
                    disabled={selectedBrechas.length === 0 || applyingJudgeCorrections}
                    className="gap-2 bg-orange-600 hover:bg-orange-700"
                  >
                    {applyingJudgeCorrections ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aplicando {selectedBrechas.length} correções...
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4" />
                        Aplicar {selectedBrechas.length > 0 ? `${selectedBrechas.length} ` : ''}Correção(ões) Selecionada(s)
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
                {/* Controles Globais de Seleção */}
                <div className="flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="flex items-center gap-4">
                    <Checkbox 
                      id="select-all-brechas"
                      checked={selectedBrechas.length === judgeAnalysis.brechas.length && judgeAnalysis.brechas.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedBrechas(judgeAnalysis.brechas.map((_, i) => i));
                        } else {
                          setSelectedBrechas([]);
                        }
                      }}
                    />
                    <Label htmlFor="select-all-brechas" className="font-medium cursor-pointer text-sm">
                      {selectedBrechas.length === judgeAnalysis.brechas.length && judgeAnalysis.brechas.length > 0
                        ? "Desmarcar Todas" 
                        : "Selecionar Todas"}
                    </Label>
                  </div>
                  
                  <Badge variant="secondary" className="text-xs">
                    {selectedBrechas.length} de {judgeAnalysis.brechas.length} selecionada(s)
                  </Badge>
                </div>

                {judgeAnalysis.brechas.map((brecha, index) => (
                  <Card key={index} className="p-4 border-l-4" style={{
                    borderLeftColor: brecha.gravidade === 'alta' ? 'hsl(var(--destructive))' : 
                                   brecha.gravidade === 'media' ? 'hsl(var(--warning))' : 
                                   'hsl(var(--muted))'
                  }}>
                    <div className="flex items-start gap-3">
                      {/* Checkbox de Seleção */}
                      <Checkbox 
                        id={`brecha-${index}`}
                        checked={selectedBrechas.includes(index)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedBrechas([...selectedBrechas, index]);
                          } else {
                            setSelectedBrechas(selectedBrechas.filter(i => i !== index));
                          }
                        }}
                        className="mt-1"
                      />
                      
                      {/* Conteúdo da Brecha */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            {brecha.gravidade === 'alta' && <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
                            {brecha.gravidade === 'media' && <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />}
                            {brecha.gravidade === 'baixa' && <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />}
                            <div className="flex-1">
                              <h4 className="font-semibold text-sm">{brecha.tipo}</h4>
                              <p className="text-sm text-muted-foreground mt-1">{brecha.descricao}</p>
                            </div>
                          </div>
                          <Badge variant={
                            brecha.gravidade === 'alta' ? 'destructive' : 
                            brecha.gravidade === 'media' ? 'default' : 
                            'secondary'
                          }>
                            {brecha.gravidade.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          <strong>Local:</strong> {brecha.localizacao}
                        </p>
                        
                        <div className="bg-muted/50 p-3 rounded">
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
                                <Check className="h-3 w-3" />
                                Aplicar esta Sugestão
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
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
                {/* ✅ CORREÇÃO #1: Botão Global Aplicar Todas as Adaptações */}
                <div className="flex justify-end gap-2">
                  <Button 
                    onClick={applyRegionalAdaptations}
                    disabled={applyingRegionalAdaptations}
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    {applyingRegionalAdaptations ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aplicando adaptações...
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4" />
                        Aplicar Todas as Adaptações Regionais
                      </>
                    )}
                  </Button>
                </div>

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

                {/* ✅ CORREÇÃO #1: Adaptações Sugeridas com botões individuais */}
                {regionalAdaptation.adaptacoes_sugeridas.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">Adaptações Sugeridas por Seção</h4>
                    {regionalAdaptation.adaptacoes_sugeridas.map((adapt, index) => (
                      <Card key={index} className="p-4 border-l-4 border-blue-500">
                        <Badge variant="outline" className="mb-2">{adapt.secao}</Badge>
                        <p className="text-sm mb-2">{adapt.adaptacao}</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          <strong>Justificativa:</strong> {adapt.justificativa}
                        </p>
                        
                        <Button
                          size="sm"
                          onClick={() => applySingleAdaptation(adapt, index)}
                          disabled={applyingIndividualAdaptation !== null}
                          className="gap-2 w-full"
                          variant="outline"
                        >
                          {applyingIndividualAdaptation === index ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Aplicando...
                            </>
                          ) : (
                            <>
                              <CheckCheck className="h-3 w-3" />
                              Aplicar esta Adaptação
                            </>
                          )}
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            )}
          </Collapsible>
        </Card>
      )}

      {/* ✅ CORREÇÃO #3: Módulo Tribunal Recursivo (Appellate) */}
      {petition && (
        <Card className="p-6 border-2 border-purple-200 dark:border-purple-900">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-purple-600" />
                  <div>
                    <h3 className="text-xl font-bold">Módulo Tribunal - Análise Recursiva Preventiva</h3>
                    <p className="text-sm text-muted-foreground">
                      Análise desembargadora para prever recursos e fortalecer argumentos
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={analyzeWithAppellateModule} disabled={analyzingAppellate}>
                  {analyzingAppellate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    "Analisar Recursivamente"
                  )}
                </Button>
              </div>
            </CollapsibleTrigger>

            {appellateAnalysis && (
              <CollapsibleContent className="mt-6 space-y-4">
                {/* Botão Global Aplicar Todas as Adaptações */}
                <div className="flex justify-end gap-2">
                  <Button 
                    onClick={applyAppellateAdaptations}
                    disabled={applyingRegionalAdaptations}
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    {applyingRegionalAdaptations ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Aplicando adaptações...
                      </>
                    ) : (
                      <>
                        <CheckCheck className="h-4 w-4" />
                        Aplicar Todas as Adaptações do Tribunal
                      </>
                    )}
                  </Button>
                </div>

                {/* Adaptações Regionais */}
                {appellateAnalysis.adaptacoes_regionais?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">Adaptações Regionais Sugeridas</h4>
                    {appellateAnalysis.adaptacoes_regionais.map((adapt: any, index: number) => (
                      <Card key={index} className="p-4 border-l-4 border-purple-500">
                        <Badge variant="outline" className="mb-2">{adapt.tipo}</Badge>
                        <p className="text-sm mb-2">{adapt.sugestao}</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          <strong>Justificativa:</strong> {adapt.justificativa}
                        </p>
                        
                        <Button
                          size="sm"
                          onClick={() => applySingleAdaptation(adapt, index)}
                          disabled={applyingIndividualAdaptation !== null}
                          className="gap-2 w-full"
                          variant="outline"
                        >
                          {applyingIndividualAdaptation === index ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Aplicando...
                            </>
                          ) : (
                            <>
                              <CheckCheck className="h-3 w-3" />
                              Aplicar esta Adaptação
                            </>
                          )}
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pontos a Reforçar */}
                {appellateAnalysis.pontos_a_reforcar?.length > 0 && (
                  <Card className="p-4 bg-yellow-50 dark:bg-yellow-950">
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Pontos a Reforçar</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {appellateAnalysis.pontos_a_reforcar.map((ponto: string, index: number) => (
                        <li key={index}>{ponto}</li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Jurisprudências Relevantes */}
                {appellateAnalysis.jurisprudencias_relevantes?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Jurisprudências Relevantes para o TRF</h4>
                    {appellateAnalysis.jurisprudencias_relevantes.map((juris: any, index: number) => (
                      <Card key={index} className="p-3 border-l-4 border-blue-500">
                        <p className="text-xs font-medium text-blue-600 mb-1">{juris.tribunal}</p>
                        <p className="text-sm mb-1"><strong>{juris.numero}</strong></p>
                        <p className="text-sm">{juris.tese}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Avaliação de Risco de Recurso */}
                {appellateAnalysis.risco_recurso && (
                  <Card className="p-4 bg-red-50 dark:bg-red-950">
                    <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">🎯 Avaliação de Risco de Recurso</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Probabilidade de Recurso</span>
                        <Badge variant="destructive">{appellateAnalysis.risco_recurso.probabilidade}%</Badge>
                      </div>
                      <Progress value={appellateAnalysis.risco_recurso.probabilidade} className="h-2" />
                      <p className="text-sm text-muted-foreground">{appellateAnalysis.risco_recurso.motivo}</p>
                    </div>
                  </Card>
                )}

                {/* Recomendação Executiva */}
                {appellateAnalysis.recomendacao_executiva && (
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertTitle>Recomendação Executiva</AlertTitle>
                    <AlertDescription>
                      {appellateAnalysis.recomendacao_executiva}
                    </AlertDescription>
                  </Alert>
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
