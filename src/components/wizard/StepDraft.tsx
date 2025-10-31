import { CaseData } from "@/pages/NewCase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, Download, Copy, CheckCheck, Loader2, AlertTriangle, Target, MapPin, Sparkles, X, CheckCircle2, Shield, AlertCircle, Lightbulb, Check, Trash2, RefreshCw, Zap, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun, Header, Footer, BorderStyle } from "docx";
import jsPDF from 'jspdf';
import advocaciaBelido from '@/assets/advocacia-belido-logo.png';
import whatsappIcon from '@/assets/whatsapp-icon.png';
import emailIcon from '@/assets/email-icon.png';
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractPlaceholders, generatePlaceholderList } from "@/lib/templatePlaceholders";
import { useAutoCorrection } from "@/hooks/useAutoCorrection";
import { AutoCorrectionProgress } from "@/components/correction/AutoCorrectionProgress";
import { CorrectionHistory } from "@/components/correction/CorrectionHistory";
import { DiffDialog } from "@/components/wizard/DiffDialog";
import { ProgressCard } from "@/components/wizard/ProgressCard";
import { useTabSync } from "@/hooks/useTabSync";
import { QualityReportCard } from "@/components/petition/QualityReportCard";

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
  const [analyzingRegional, setAnalyzingRegional] = useState(false);
  const [analyzingAppellate, setAnalyzingAppellate] = useState(false);
  const [appellateAnalysis, setAppellateAnalysis] = useState<any>(null);
  const [adaptingRegional, setAdaptingRegional] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isProtocoling, setIsProtocoling] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [applyingJudgeCorrections, setApplyingJudgeCorrections] = useState(false);
  const [applyingRegionalAdaptations, setApplyingRegionalAdaptations] = useState(false);
  const [correctionAttempts, setCorrectionAttempts] = useState(0);
  const MAX_CORRECTION_ATTEMPTS = 2;
  const [applyingIndividualSuggestion, setApplyingIndividualSuggestion] = useState<number | null>(null);
  const [applyingIndividualAdaptation, setApplyingIndividualAdaptation] = useState<number | null>(null);
  const [applyingIndividualAppellateAdaptation, setApplyingIndividualAppellateAdaptation] = useState<number | null>(null);
  const [qualityReport, setQualityReport] = useState<any>(null);
  const [selectedBrechas, setSelectedBrechas] = useState<number[]>([]);
  const [selectedAdaptations, setSelectedAdaptations] = useState<number[]>([]);
  const [selectedAppellateAdaptations, setSelectedAppellateAdaptations] = useState<number[]>([]);
  
  // 🆕 VALIDAÇÃO DE RECOMENDAÇÕES DA ANÁLISE
  const [recomendacoesValidacao, setRecomendacoesValidacao] = useState<any[]>([]);
  
  // 🆕 ESTADOS PARA SISTEMA DE CORREÇÃO CRITERIOSA
  const [tentativaAtual, setTentativaAtual] = useState(1);
  const [ultimaValidacao, setUltimaValidacao] = useState<any>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [petitionBefore, setPetitionBefore] = useState('');
  const [petitionAfter, setPetitionAfter] = useState('');

  // ✅ FASE 5: Estados para painel de pré-requisitos
  const [prerequisitesCheck, setPrerequisitesCheck] = useState({
    hasDocs: false,
    hasValidation: false,
    hasAnalysis: false,
    hasJurisprudence: false,
    analysisStale: false,
    jurisprudenceStale: false
  });

  // 🆕 Hook de Auto-Correção
  const autoCorrection = useAutoCorrection(data.caseId || '');

  // ✅ FASE 3: Sincronização em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['draft-updated', 'case-updated', 'analysis-updated', 'teses-updated'],
    onSync: (detail) => {
      console.log('[StepDraft] 🔄 Minuta ou dados atualizados remotamente, recarregando...');
      if (detail.timestamp && !loading && data.caseId) {
        // Recarregar petição do cache
        loadQualityReport();
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🆕 FUNÇÕES AUXILIARES PARA VALIDAÇÃO CRITERIOSA
  // ═══════════════════════════════════════════════════════════════
  
  const extrairPalavrasChave = (texto: string): string[] => {
    const stopwords = ['o', 'a', 'de', 'da', 'do', 'que', 'e', 'para', 'com', 'em', 'por', 'na', 'no'];
    const palavras = texto
      .toLowerCase()
      .replace(/[^\w\sçáàâãéêíóôõú]/g, '')
      .split(/\s+/)
      .filter(p => p.length > 3 && !stopwords.includes(p));
    
    return [...new Set(palavras)];
  };
  
  const extractAllDocReferences = (petition: string, documentos: any[]): string[] => {
    const nomesMencionados = documentos
      .map(d => d.nome)
      .filter(nome => petition.toLowerCase().includes(nome.toLowerCase()));
    return nomesMencionados;
  };
  
  const validateSpecificCorrections = (
    petitionCorrigida: string,
    correcoesSolicitadas: {
      brechas: any[],
      pontos_fracos: any[],
      recomendacoes: any[]
    },
    documentosExtraidos: any[]
  ): {
    success: boolean;
    detalhes: {
      brechas_corrigidas: number;
      brechas_faltando: any[];
      pontos_fracos_corrigidos: number;
      pontos_fracos_faltando: any[];
      recomendacoes_aplicadas: number;
      recomendacoes_faltando: any[];
      documentos_corretos: boolean;
      documentos_faltando: string[];
    }
  } => {
    const resultado = {
      brechas_corrigidas: 0,
      brechas_faltando: [],
      pontos_fracos_corrigidos: 0,
      pontos_fracos_faltando: [],
      recomendacoes_aplicadas: 0,
      recomendacoes_faltando: [],
      documentos_corretos: true,
      documentos_faltando: []
    };
    
    // Validar brechas
    correcoesSolicitadas.brechas?.forEach((brecha: any, i: number) => {
      let corrigida = false;
      
      switch(brecha.tipo) {
        case 'probatoria':
          const citaDocumentos = /comprovante|autodeclaração|certidão|documento/i.test(petitionCorrigida);
          corrigida = citaDocumentos;
          break;
          
        case 'argumentativa':
          const palavrasChave = extrairPalavrasChave(brecha.sugestao || '');
          corrigida = palavrasChave.some(palavra => 
            petitionCorrigida.toLowerCase().includes(palavra.toLowerCase())
          );
          break;
          
        case 'juridica':
          const temCitacaoLegal = /art\.|lei|súmula|tema|decreto/i.test(petitionCorrigida);
          corrigida = temCitacaoLegal;
          break;
      }
      
      if (corrigida) {
        resultado.brechas_corrigidas++;
      } else {
        resultado.brechas_faltando.push({
          numero: i + 1,
          tipo: brecha.tipo,
          descricao: brecha.descricao
        });
      }
    });
    
    // Validar pontos fracos
    correcoesSolicitadas.pontos_fracos?.forEach((ponto: any, i: number) => {
      const texto = typeof ponto === 'string' ? ponto : (ponto.descricao || ponto.problema || '');
      const palavrasChave = extrairPalavrasChave(texto);
      
      const melhorado = palavrasChave.length > 0 && palavrasChave.some(palavra =>
        petitionCorrigida.toLowerCase().includes(palavra.toLowerCase())
      );
      
      if (melhorado) {
        resultado.pontos_fracos_corrigidos++;
      } else {
        resultado.pontos_fracos_faltando.push({
          numero: i + 1,
          problema: texto
        });
      }
    });
    
    // Validar recomendações
    correcoesSolicitadas.recomendacoes?.forEach((rec: any, i: number) => {
      const texto = typeof rec === 'string' ? rec : rec.texto;
      const palavrasChave = extrairPalavrasChave(texto);
      
      const aplicada = palavrasChave.length > 0 && palavrasChave.some(palavra =>
        petitionCorrigida.toLowerCase().includes(palavra.toLowerCase())
      );
      
      if (aplicada) {
        resultado.recomendacoes_aplicadas++;
      } else {
        resultado.recomendacoes_faltando.push({
          numero: i + 1,
          recomendacao: texto
        });
      }
    });
    
    // Validar documentos
    const docsMencionados = extractAllDocReferences(petitionCorrigida, documentosExtraidos);
    const docsCorretos = documentosExtraidos.map((d: any) => d.nome);
    
    docsCorretos.forEach((docCorreto: string) => {
      if (!docsMencionados.some(mencionado => mencionado.toLowerCase() === docCorreto.toLowerCase())) {
        resultado.documentos_corretos = false;
        resultado.documentos_faltando.push(docCorreto);
      }
    });
    
    // Calcular sucesso geral
    const totalCorrecoes = 
      correcoesSolicitadas.brechas.length +
      correcoesSolicitadas.pontos_fracos.length +
      correcoesSolicitadas.recomendacoes.length;
      
    const totalCorrigido = 
      resultado.brechas_corrigidas +
      resultado.pontos_fracos_corrigidos +
      resultado.recomendacoes_aplicadas;
    
    const success = (
      totalCorrigido === totalCorrecoes &&
      resultado.documentos_corretos
    );
    
    return { success, detalhes: resultado };
  };
  
  const validateQuickly = async () => {
    if (!petition) {
      toast.warning('Nenhuma petição para validar');
      return;
    }
    
    const validationChecks = {
      tem_enderecamento: /JUIZADO ESPECIAL FEDERAL|VARA FEDERAL/i.test(petition),
      tem_valor_causa: /R\$\s*\d+[.,]\d{2}/.test(petition),
      sem_placeholders: !/\[.*?\]/.test(petition),
      tem_provas: /comprovante|autodeclaração|certidão/i.test(petition)
    };
    
    const totalOk = Object.values(validationChecks).filter(Boolean).length;
    const percentage = (totalOk / 4) * 100;
    
    if (percentage === 100) {
      toast.success('✅ Validação Rápida: 100% OK!', {
        description: 'Todos os critérios básicos foram atendidos'
      });
    } else {
      const problemas = Object.entries(validationChecks)
        .filter(([_, ok]) => !ok)
        .map(([key, _]) => key.replace('tem_', '').replace('sem_', 'sem ').replace(/_/g, ' '));
      toast.warning(`⚠️ Validação: ${percentage}%`, {
        description: `Problemas: ${problemas.join(', ')}`
      });
    }
  };
  
  const salvarHistoricoDetalhado = async (
    result: any,
    validacao: any,
    tentativas: number,
    sucesso: boolean,
    totalBrechas: number,
    totalPontosFracos: number,
    totalRecomendacoes: number
  ) => {
    await supabase.from('correction_history').insert({
      case_id: data.caseId,
      correction_type: sucesso ? 'iterative_fix_success' : 'iterative_fix_partial',
      module: 'quality_control_criterioso',
      changes_summary: JSON.stringify({
        tentativas_usadas: tentativas,
        sucesso_completo: sucesso,
        brechas: {
          total: totalBrechas,
          corrigidas: validacao.detalhes.brechas_corrigidas,
          faltando: validacao.detalhes.brechas_faltando.length
        },
        pontos_fracos: {
          total: totalPontosFracos,
          corrigidos: validacao.detalhes.pontos_fracos_corrigidos,
          faltando: validacao.detalhes.pontos_fracos_faltando.length
        },
        recomendacoes: {
          total: totalRecomendacoes,
          aplicadas: validacao.detalhes.recomendacoes_aplicadas,
          faltando: validacao.detalhes.recomendacoes_faltando.length
        },
        documentos_corretos: validacao.detalhes.documentos_corretos,
        timestamp: new Date().toISOString()
      }),
      before_content: petition.substring(0, 500),
      after_content: result.petition_corrigida.substring(0, 500),
      confidence_score: sucesso ? 100 : 70,
      auto_applied: true
    });
  };

  // ✅ CORREÇÃO #1: Verificar e regeração automática de petição com placeholders
  useEffect(() => {
    const checkAndRegeneratePetition = async () => {
      if (!data.caseId) return;
      
      try {
        // Buscar petição do cache com payload completo
        const { data: draft } = await supabase
          .from('drafts')
          .select('*')
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
            
            // ✅ CARREGAR ANÁLISES SALVAS DO PAYLOAD
            const draftData = draft as any;
            if (draftData.judge_analysis) {
              setJudgeAnalysis(draftData.judge_analysis as JudgeAnalysis);
              console.log('[DRAFT] ✅ Judge Analysis carregada do payload');
            }
            
            if (draftData.regional_adaptation) {
              setRegionalAdaptation(draftData.regional_adaptation as RegionalAdaptation);
              console.log('[DRAFT] ✅ Regional Adaptation carregada do payload');
            }
            
            if (draftData.appellate_analysis) {
              setAppellateAnalysis(draftData.appellate_analysis);
              console.log('[DRAFT] ✅ Appellate Analysis carregada do payload');
            }
            
            // 🆕 CARREGAR VALIDAÇÃO DE RECOMENDAÇÕES DO PAYLOAD
            if (draftData.payload?.recomendacoes_validacao) {
              setRecomendacoesValidacao(draftData.payload.recomendacoes_validacao);
              console.log('[DRAFT] ✅ Validação de recomendações carregada:', draftData.payload.recomendacoes_validacao.length);
            }
            
            // ✅ Carregar relatório de qualidade
            await loadQualityReport();
          }
        }
      } catch (error) {
        console.error('[DRAFT] Erro ao verificar cache:', error);
      }
      
      // Carregar template também
      await loadExistingTemplate();
      
      // 🔥 GARANTIR SALÁRIO CORRETO AO CARREGAR
      await ensureCorrectSalarioMinimo();
      
      // ✅ FASE 5: Verificar pré-requisitos ao carregar
      await checkPrerequisites();
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

  // ═══════════════════════════════════════════════════════════════
  // 🔥 FUNÇÃO PARA REVALIDAR QUALITY REPORT APÓS CORREÇÕES
  // ═══════════════════════════════════════════════════════════════
  const revalidateQualityReport = async () => {
    if (!petition || !data.caseId) return;
    
    console.log('[REVALIDATE-QR] 🔍 Iniciando validação e correção automática...');
    toast.info('🔍 Validando qualidade da petição...');
    
    try {
      // Buscar dados atualizados do caso
      const { data: caseData } = await supabase
        .from('cases')
        .select('*')
        .eq('id', data.caseId)
        .single();
      
      if (!caseData) {
        console.error('[REVALIDATE-QR] Caso não encontrado');
        return;
      }
      
      // Buscar análise atualizada
      const { data: analysisData } = await supabase
        .from('case_analysis')
        .select('*')
        .eq('case_id', data.caseId)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Buscar Quality Report existente para pegar jurisdição validada
      const { data: existingQR } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('case_id', data.caseId)
        .eq('document_type', 'petition')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // ═════════════════════════════════════════════════════
      // 🔥 REVALIDAR CADA ASPECTO DO QUALITY REPORT
      // ═════════════════════════════════════════════════════
      
      const valorCausa = analysisData?.valor_causa || caseData.valor_causa || 0;
      const limiteJuizado = 1412 * 60; // 60 salários mínimos
      const isJuizado = valorCausa <= limiteJuizado;
      
      // 1. Verificar endereçamento usando jurisdição VALIDADA (não birth_city)
      const jurisdicaoValidada = existingQR?.jurisdicao_validada as { subsecao?: string; uf?: string } | null;
      const subsecao = jurisdicaoValidada?.subsecao || caseData.birth_city || '';
      const uf = jurisdicaoValidada?.uf || caseData.birth_state || '';
      
      console.log('[REVALIDATE-QR] 🔍 Verificando endereçamento:', { subsecao, uf });
      
      // Verificar se petição contém TANTO a subseção QUANTO a UF correta
      const subsecaoRegex = new RegExp(subsecao.replace(/[-\s]/g, '[-\\s]*'), 'i');
      const ufPattern = `/${uf}`;
      const subsecaoPresente = subsecaoRegex.test(petition);
      const ufPresente = petition.toUpperCase().includes(ufPattern.toUpperCase());
      
      const enderecamentoOk = subsecaoPresente && ufPresente;
      
      // 2. Verificar jurisdição (DEVE ter subsecao E uf corretos)
      const jurisdicaoOk = enderecamentoOk;
      
      // 3. Verificar campos obrigatórios
      const camposObrigatorios = ['RG', 'CPF', 'endereço', 'cidade', 'estado'];
      const camposFaltantes = camposObrigatorios.filter(campo => {
        const regex = new RegExp(`\\[${campo}\\]`, 'gi');
        return regex.test(petition);
      });
      const dadosCompletos = camposFaltantes.length === 0;
      
      // 4. Verificar valor da causa (aceitar formato brasileiro)
      const valorCausaFormatado = valorCausa.toLocaleString('pt-BR', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }); // Ex: "4.848,00"
      
      const valorCausaValidado = valorCausa > 0 && (
        petition.includes(valorCausaFormatado) || 
        petition.includes(`R$ ${valorCausaFormatado}`) ||
        petition.includes(valorCausa.toFixed(0)) // Aceitar sem decimais também
      );
      
      console.log('[REVALIDATE-QR] ✅ Detalhes da validação:', {
        valor_causa: valorCausa,
        valor_causa_formatado: valorCausaFormatado,
        valor_causa_validado: valorCausaValidado,
        petition_includes_valor: petition.includes(valorCausaFormatado),
        enderecamento_ok: enderecamentoOk,
        jurisdicao_ok: jurisdicaoOk
      });
      
      // 5. Determinar status geral
      const issues: any[] = [];
      
      if (!enderecamentoOk) {
        issues.push({
          tipo: 'ENDEREÇAMENTO',
          gravidade: 'MÉDIO',
          problema: 'Endereçamento não encontrado na petição',
          acao: 'Verificar qualificação inicial'
        });
      }
      
      if (!valorCausaValidado) {
        issues.push({
          tipo: 'VALOR_CAUSA',
          gravidade: 'MÉDIO',
          problema: 'Valor da causa ausente ou incorreto',
          acao: 'Verificar cálculos'
        });
      }
      
      if (!dadosCompletos) {
        issues.push({
          tipo: 'DADOS_INCOMPLETOS',
          gravidade: 'ALTO',
          problema: `Campos faltantes: ${camposFaltantes.join(', ')}`,
          acao: 'Preencher dados faltantes na aba Informações Básicas'
        });
      }
      
      const statusGeral = issues.length === 0 ? 'aprovado' : 
                          issues.some(i => i.gravidade === 'CRÍTICO') ? 'requer_revisao' : 
                          'aprovado_com_avisos';
      
      // ═════════════════════════════════════════════════════
      // 🔥 ATUALIZAR QUALITY REPORT NO BANCO
      // ═════════════════════════════════════════════════════
      
      const { error: updateError } = await supabase
        .from('quality_reports')
        .update({
          status: statusGeral,
          enderecamento_ok: enderecamentoOk,
          dados_completos: dadosCompletos,
          campos_faltantes: camposFaltantes,
          jurisdicao_ok: jurisdicaoOk,
          competencia: isJuizado ? 'juizado' : 'vara',
          valor_causa_validado: valorCausaValidado,
          valor_causa_referencia: valorCausa,
          issues: issues,
          generated_at: new Date().toISOString()
        })
        .eq('case_id', data.caseId)
        .eq('document_type', 'petition');
      
      if (updateError) {
        console.error('[REVALIDATE-QR] Erro ao atualizar:', updateError);
      } else {
        console.log('[REVALIDATE-QR] ✅ Quality Report atualizado:', {
          status: statusGeral,
          enderecamento_ok: enderecamentoOk,
          jurisdicao_ok: jurisdicaoOk,
          valor_causa_validado: valorCausaValidado,
          dados_completos: dadosCompletos
        });
        
        // 🤖 SE DETECTOU PROBLEMAS, CORRIGIR AUTOMATICAMENTE
        // 🤖 SEMPRE CORRIGIR AUTOMATICAMENTE (não apenas se detectar problemas básicos)
        console.log('[REVALIDATE-QR] 🤖 Iniciando correção automática...');
        toast.info('🤖 Analisando português e documentos...');

        try {
          const { data: autoFixData, error: autoFixError } = await supabase.functions.invoke('auto-fix-quality', {
            body: {
              caseId: data.caseId,
              qualityReport: {
                enderecamento_ok: enderecamentoOk,
                jurisdicao_ok: jurisdicaoOk,
                valor_causa_validado: valorCausaValidado,
                dados_completos: dadosCompletos,
                campos_faltantes: camposFaltantes,
                valor_causa_referencia: valorCausa,
                status: statusGeral,
                issues
              }
            }
          });
          
          if (autoFixError) throw autoFixError;
          
          if (autoFixData?.success) {
            const corrections = autoFixData.corrections_applied || [];
            
            console.log('[REVALIDATE-QR] ✅ Correções aplicadas:', corrections);
            
            // Mostrar toast com resumo
            if (corrections.length > 0) {
              const correctionsText = corrections.map((c: any) => c.module).join(', ');
              toast.success(`✅ ${corrections.length} correção(ões) aplicada(s)`, {
                description: `Corrigido: ${correctionsText}`,
                duration: 6000
              });
            } else {
              toast.success('✅ Análise completa! Nenhum problema detectado.', {
                duration: 5000
              });
            }
            
            // Recarregar quality report
            await loadQualityReport();
            
          } else {
            toast.warning('⚠️ Algumas correções não puderam ser aplicadas automaticamente');
          }
          
        } catch (autoFixError: any) {
          console.error('[REVALIDATE-QR] Erro na correção automática:', autoFixError);
          toast.error('Erro ao aplicar correções automáticas: ' + (autoFixError.message || 'Erro desconhecido'));
        }
      }
      
    } catch (error) {
      console.error('[REVALIDATE-QR] Erro na revalidação:', error);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 🔥 FUNÇÃO PARA RECALCULAR VALOR DA CAUSA COM ANO CORRETO
  // ═══════════════════════════════════════════════════════════════
  const recalculateValorCausa = async () => {
    if (!data.caseId) return;
    
    try {
      // Buscar dados do caso
      const { data: caseData } = await supabase
        .from('cases')
        .select('child_birth_date, event_date, salario_minimo_history')
        .eq('id', data.caseId)
        .single();
      
      if (!caseData) return;
      
      // Determinar ano do fato gerador
      const fatoGeradorDate = caseData.child_birth_date || caseData.event_date;
      const fatoGeradorYear = new Date(fatoGeradorDate).getFullYear();
      
      // Buscar salário mínimo correto
      const salarioMinimoHistory = (caseData.salario_minimo_history as any[]) || [];
      const salarioMinimoCorreto = salarioMinimoHistory.find(
        (h: any) => h.year === fatoGeradorYear
      )?.value;
      
      if (!salarioMinimoCorreto) {
        toast.error('Salário mínimo do ano não encontrado');
        return;
      }
      
      // Calcular valor da causa correto
      const valorCausaCorreto = salarioMinimoCorreto * 4;
      
      console.log('[RECALC] Recalculando valor da causa:', {
        ano: fatoGeradorYear,
        salario_minimo: salarioMinimoCorreto,
        valor_causa: valorCausaCorreto
      });
      
      // Atualizar no banco (cases)
      const { error } = await supabase
        .from('cases')
        .update({
          salario_minimo_ref: salarioMinimoCorreto,
          valor_causa: valorCausaCorreto
        })
        .eq('id', data.caseId);
      
      if (error) throw error;
      
      // 🔥 ATUALIZAR TAMBÉM NA CASE_ANALYSIS
      const { error: analysisError } = await supabase
        .from('case_analysis')
        .update({ valor_causa: valorCausaCorreto })
        .eq('case_id', data.caseId);

      if (analysisError) {
        console.warn('[RECALC] Não foi possível atualizar case_analysis:', analysisError);
        // Não bloquear - case_analysis pode não existir ainda
      }
      
      // Atualizar petição substituindo valores incorretos
      if (petition) {
        const salarioIncorreto = 1518.00; // Salário de 2025
        const valorCausaIncorreto = salarioIncorreto * 4;
        
        let petitionCorrigida = petition
          .replace(new RegExp(`R\\$\\s*${salarioIncorreto.toFixed(2).replace('.', ',')}`, 'g'), 
                   `R$ ${salarioMinimoCorreto.toFixed(2).replace('.', ',')}`)
          .replace(new RegExp(`R\\$\\s*${valorCausaIncorreto.toFixed(2).replace('.', ',')}`, 'g'), 
                   `R$ ${valorCausaCorreto.toFixed(2).replace('.', ',')}`);
        
        setPetition(petitionCorrigida);
        
        // Salvar no banco
        await supabase.from('drafts').insert([{
          case_id: data.caseId,
          markdown_content: petitionCorrigida,
          payload: { 
            recalculated_valor_causa: true,
            old_salario: salarioIncorreto,
            new_salario: salarioMinimoCorreto,
            timestamp: new Date().toISOString() 
          } as any
        }]);
      }
      
      toast.success(`✅ Valor da causa recalculado! Ano base: ${fatoGeradorYear}, Salário: R$ ${salarioMinimoCorreto.toFixed(2)}`, {
        duration: 5000
      });
      
      // Revalidar Quality Report
      await revalidateQualityReport();
      
    } catch (error: any) {
      console.error('[RECALC] Erro:', error);
      toast.error('Erro ao recalcular: ' + error.message);
    }
  };

  // 🔥 CORREÇÃO #5: Garantir que salário mínimo está correto ao carregar
  const ensureCorrectSalarioMinimo = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: caseData } = await supabase
        .from('cases')
        .select('child_birth_date, event_date, salario_minimo_history, salario_minimo_ref')
        .eq('id', data.caseId)
        .single();
      
      if (!caseData) return;
      
      const fatoGeradorDate = caseData.child_birth_date || caseData.event_date;
      const fatoGeradorYear = new Date(fatoGeradorDate).getFullYear();
      const salarioCorreto = (caseData.salario_minimo_history as any[])?.find(
        (h: any) => h.year === fatoGeradorYear
      )?.value;
      
      // Se o salário no banco está errado, corrigir automaticamente
      if (salarioCorreto && caseData.salario_minimo_ref !== salarioCorreto) {
        console.log('[ENSURE-SM] Corrigindo salário mínimo:', {
          atual: caseData.salario_minimo_ref,
          correto: salarioCorreto
        });
        
        await supabase
          .from('cases')
          .update({ 
            salario_minimo_ref: salarioCorreto,
            valor_causa: salarioCorreto * 4
          })
          .eq('id', data.caseId);
          
        // Atualizar também na case_analysis
        await supabase
          .from('case_analysis')
          .update({ valor_causa: salarioCorreto * 4 })
          .eq('case_id', data.caseId);
      }
    } catch (error) {
      console.error('[ENSURE-SM] Erro:', error);
    }
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

  // ✅ FASE 5: Função para verificar pré-requisitos
  const checkPrerequisites = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', data.caseId);
      
      const { data: validation } = await supabase
        .from('document_validation')
        .select('is_sufficient')
        .eq('case_id', data.caseId)
        .order('validated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('id, is_stale')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      const { data: juris } = await supabase
        .from('jurisprudence_results')
        .select('selected_ids, is_stale')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      setPrerequisitesCheck({
        hasDocs: (docs?.length || 0) > 0,
        hasValidation: validation?.is_sufficient || false,
        hasAnalysis: !!analysis,
        hasJurisprudence: (juris?.selected_ids as any[])?.length > 0 || false,
        analysisStale: analysis?.is_stale || false,
        jurisprudenceStale: juris?.is_stale || false
      });
    } catch (error) {
      console.error('[PREREQUISITES] Erro ao verificar:', error);
    }
  };

  // ✅ FASE 4: VALIDAÇÃO PRÉ-GERAÇÃO DE PETIÇÃO
  const validateBeforeGeneration = async (): Promise<{ valid: boolean; errors: string[] }> => {
    const errors: string[] = [];
    
    if (!data.caseId) {
      errors.push('❌ ID do caso não encontrado');
      return { valid: false, errors };
    }
    
    try {
      // 1. Verificar documentos
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', data.caseId);
      
      if (!docs || docs.length === 0) {
        errors.push('❌ Nenhum documento anexado');
      }
      
      // 2. Verificar validação
      const { data: validation } = await supabase
        .from('document_validation')
        .select('is_sufficient')
        .eq('case_id', data.caseId)
        .order('validated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!validation || !validation.is_sufficient) {
        errors.push('❌ Validação de documentos não aprovada');
      }
      
      // 3. Verificar análise
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('id, is_stale')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      if (!analysis) {
        errors.push('❌ Análise jurídica não realizada');
      } else if (analysis.is_stale) {
        errors.push('⚠️ Análise desatualizada. Clique em "Reanalisar"');
      }
      
      // 4. Verificar jurisprudência
      const { data: juris } = await supabase
        .from('jurisprudence_results')
        .select('selected_ids, is_stale')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      if (!juris) {
        errors.push('⚠️ Busca de jurisprudência não realizada (recomendado)');
      } else if ((juris.selected_ids as any[])?.length === 0) {
        errors.push('⚠️ Nenhuma jurisprudência selecionada (recomendado)');
      } else if (juris.is_stale) {
        errors.push('⚠️ Jurisprudências desatualizadas. Busque novamente');
      }
      
      // 5. Verificar teses
      const { data: teses } = await supabase
        .from('teses_juridicas')
        .select('id, is_stale')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      if (teses?.is_stale) {
        errors.push('⚠️ Teses desatualizadas. Gere novamente');
      }
      
    } catch (error) {
      console.error('[VALIDATION] Erro:', error);
      errors.push('❌ Erro ao validar pré-requisitos');
    }
    
    return {
      valid: errors.filter(e => e.startsWith('❌')).length === 0,
      errors
    };
  };

  const generatePetition = async () => {
    if (!data.caseId) return;
    
    // ✅ FASE 4: VALIDAR ANTES DE GERAR
    const { valid, errors } = await validateBeforeGeneration();
    
    if (!valid) {
      toast.error('Não é possível gerar a petição', {
        description: (
          <ul className="list-disc ml-4 mt-2 space-y-1">
            {errors.map((err, i) => <li key={i} className="text-xs">{err}</li>)}
          </ul>
        ),
        duration: 10000
      });
      return;
    }
    
    // Avisos (não bloqueiam geração)
    const warnings = errors.filter(e => e.startsWith('⚠️'));
    if (warnings.length > 0) {
      toast.warning('Avisos sobre a geração', {
        description: (
          <ul className="list-disc ml-4 mt-2 space-y-1">
            {warnings.map((warn, i) => <li key={i} className="text-xs">{warn}</li>)}
          </ul>
        ),
        duration: 8000
      });
    }
    
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
        
        // 🆕 SALVAR VALIDAÇÃO DE RECOMENDAÇÕES
        if (result?.recomendacoes_validacao) {
          setRecomendacoesValidacao(result.recomendacoes_validacao);
          console.log('[DRAFT] ✅ Validação de recomendações salva:', result.recomendacoes_validacao.length);
        }
        
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

  const analyzeWithJudgeModule = async (isRevalidation = false, forcedPetition?: string) => {
    let petitionToAnalyze: string;
    
    if (forcedPetition) {
      console.log('[JUDGE] 🎯 Usando petition forçada (bypass DB):', {
        length: forcedPetition.length,
        source: 'forced'
      });
      petitionToAnalyze = forcedPetition;
    } else {
      // 🔍 Buscar a última draft do banco (GARANTIR FRESH - Invalidar Cache)
      const timestamp = Date.now();
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
        length: latestDraft?.markdown_content?.length,
        stateLength: petition.length,
        match: latestDraft?.markdown_content?.length === petition.length,
        invalidationTimestamp: timestamp
      });
      
      if (fetchError) {
        console.error('[JUDGE] Erro ao buscar draft:', fetchError);
        return;
      }
      
      petitionToAnalyze = latestDraft?.markdown_content || petition;
    }
    
    if (!petitionToAnalyze) {
      toast.error("Gere a petição primeiro");
      return;
    }

    // Sincronizar estado local com versão do banco se diferente  
    if (!forcedPetition && petitionToAnalyze && petitionToAnalyze !== petition) {
      setPetition(petitionToAnalyze);
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
        } else {
          // 🔥 APLICAR AUTOMATICAMENTE AS CORREÇÕES se houver problemas identificados
          const hasIssues = (
            (result.brechas && result.brechas.length > 0) ||
            (result.pontos_fracos && result.pontos_fracos.length > 0) ||
            (result.recomendacoes && result.recomendacoes.length > 0)
          );
          
          // ✅ NÃO aplicar correções automaticamente em revalidações
          if (hasIssues && !isRevalidation) {
            toast.loading("🔧 Aplicando correções automaticamente...", { id: 'auto-apply' });
            
            // Aguardar um momento para garantir que o estado foi atualizado
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
              console.log('[JUDGE] 🔧 Aplicando correções automaticamente...');
              
              const { data: correctionResult, error: correctionError } = await supabase.functions.invoke('apply-judge-corrections', {
                body: {
                  petition: petitionToAnalyze,
                  judgeAnalysis: result
                }
              });
              
              if (correctionError) {
                console.error('[JUDGE] Erro ao aplicar correções:', correctionError);
                toast.error('Erro ao aplicar correções: ' + correctionError.message, { id: 'auto-apply' });
                return;
              }
              
              if (correctionResult?.petition_corrigida) {
                setPetition(correctionResult.petition_corrigida);
                
                // Salvar no banco
                await supabase.from('drafts').insert([{
                  case_id: data.caseId,
                  markdown_content: correctionResult.petition_corrigida,
                  judge_analysis: result as any,
                  payload: { 
                    corrected_by_judge: true, 
                    judge_analysis: result,
                    all_corrections_applied: true,
                    auto_applied: true,
                    timestamp: new Date().toISOString() 
                  } as any
                }]);
                
                // Limpar problemas após aplicação
                setJudgeAnalysis(prev => prev ? { 
                  ...prev, 
                  brechas: [],
                  pontos_fracos: [],
                  recomendacoes: [],
                  risco_improcedencia: 0
                } : prev);
                
                toast.success("✅ Análise concluída e correções aplicadas automaticamente!", { id: 'auto-apply' });
                
                // Flash visual
                setTimeout(() => {
                  const el = document.querySelector('[data-petition-content]');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('ring-4', 'ring-green-500', 'transition-all');
                    setTimeout(() => el.classList.remove('ring-4', 'ring-green-500'), 2000);
                  }
                }, 300);
              }
            } catch (autoApplyError: any) {
              console.error('[JUDGE] Erro na aplicação automática:', autoApplyError);
              toast.error('Erro ao aplicar correções automaticamente', { id: 'auto-apply' });
            }
          } else {
            toast.success("✅ Análise concluída! Petição perfeita, sem correções necessárias.");
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

    // Prioridade 1: birth_state (validado e salvo)
    // Prioridade 2: Extrair do endereço (formato variado)
    // Prioridade 3: Extrair de birth_city (formato "Cidade-UF")
    // Nunca usar 'SP' como fallback!
    let estado = data.birthState?.toUpperCase() || '';

    if (!estado) {
      // Tentar extrair do endereço (aceita: "Porto Velho/RO", "Porto Velho-RO", "Porto Velho, RO")
      const addressMatch = data.authorAddress?.match(/[,/-]\s*([A-Z]{2})\b/i);
      if (addressMatch) {
        estado = addressMatch[1].toUpperCase();
      }
    }

    if (!estado && data.birthCity) {
      // Tentar extrair de birth_city (formato "Porto Velho-RO")
      const cityMatch = data.birthCity.match(/[/-]\s*([A-Z]{2})\b/i);
      if (cityMatch) {
        estado = cityMatch[1].toUpperCase();
      }
    }

    if (!estado) {
      toast.error('❌ Não foi possível identificar o estado. Verifique os dados do caso.');
      return;
    }

    console.log('[ADAPT-REGIONAL] Estado identificado:', estado, {
      birthState: data.birthState,
      authorAddress: data.authorAddress,
      birthCity: data.birthCity
    });
    
    setAdaptingRegional(true);
    try {
      // 🔥 BUSCAR VERSÃO MAIS RECENTE (com correções do juiz se houver)
      const { petition: latestPetition, hasJudgeCorrections } = await getLatestPetitionVersion();
      
      console.log('[ADAPT-REGION] Adaptando:', 
        hasJudgeCorrections ? 'PETIÇÃO CORRIGIDA' : 'PETIÇÃO ORIGINAL'
      );
      
      const { data: result, error } = await supabase.functions.invoke('adapt-petition-regional', {
        body: { petition: latestPetition, estado }
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


  const handleCopy = () => {
    navigator.clipboard.writeText(petition);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const handleDownloadDOCX = async () => {
    if (!petition) return;
    
    try {
      // Função auxiliar para converter imagem em base64
      const imageToBase64 = async (imageUrl: string): Promise<string> => {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      };

      // Converter assets para base64
      const logoBase64 = await imageToBase64(advocaciaBelido);
      const whatsappBase64 = await imageToBase64(whatsappIcon);
      const emailBase64 = await imageToBase64(emailIcon);

      // CABEÇALHO com logo "Advocacia Belido"
      const header = new Header({
        children: [
          // Logo centralizado
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: 'png',
                data: logoBase64,
                transformation: {
                  width: 220,
                  height: 73
                }
              })
            ],
            spacing: { after: 200 }
          }),
          // Linha separadora dourada
          new Paragraph({
            border: {
              bottom: {
                color: "B8860B",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 12
              }
            },
            spacing: { after: 300 }
          })
        ]
      });

      // RODAPÉ com informações de contato
      const footer = new Footer({
        children: [
          // Linha separadora dourada superior
          new Paragraph({
            border: {
              top: {
                color: "B8860B",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 12
              }
            },
            spacing: { before: 100, after: 150 }
          }),
          // CUIABÁ/MT
          new Paragraph({
            children: [
              new TextRun({ text: 'Cuiabá/MT: ', bold: true, size: 18 }),
              new TextRun({ 
                text: 'Travessa Desembargador Ferreira Mendes, 233, 8º andar, sala 81, Master Center, Centro Sul, CEP: 78.020-200', 
                size: 18 
              })
            ],
            spacing: { after: 100 }
          }),
          // Telefones Cuiabá com ícones WhatsApp
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: whatsappBase64,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: ' (65) 9.8134-0174   ', size: 18 }),
              new ImageRun({
                type: 'png',
                data: whatsappBase64,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: ' (65) 3623-5561', size: 18 })
            ],
            spacing: { after: 150 }
          }),
          // BOA VISTA/RR
          new Paragraph({
            children: [
              new TextRun({ text: 'Boa Vista/RR: ', bold: true, size: 18 }),
              new TextRun({ 
                text: 'Rua Jair Alves dos Reis, 118, sala 1, Bairro: Jardim Floresta, CEP: 69.312-148', 
                size: 18 
              })
            ],
            spacing: { after: 100 }
          }),
          // Telefones Boa Vista com ícones WhatsApp
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: whatsappBase64,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: ' (95) 3626-1438   ', size: 18 }),
              new ImageRun({
                type: 'png',
                data: whatsappBase64,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: ' (95) 99158-3636', size: 18 })
            ],
            spacing: { after: 150 }
          }),
          // E-mail com ícone
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: emailBase64,
                transformation: { width: 14, height: 14 }
              }),
              new TextRun({ text: ' advbelido@gmail.com', size: 18 })
            ],
            spacing: { after: 100 }
          })
        ]
      });

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
                top: 1700,    // ~3cm (espaço para cabeçalho)
                bottom: 2200, // ~3.9cm (espaço para rodapé)
                left: 1134,   // ~2cm
                right: 1134   // ~2cm
              }
            }
          },
          headers: {
            default: header
          },
          footers: {
            default: footer
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

      // Função para adicionar cabeçalho
      const addHeader = () => {
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // Logo "Advocacia Belido" centralizado
        const logoWidth = 70;
        const logoHeight = 23;
        const centerX = (pageWidth - logoWidth) / 2;
        
        doc.addImage(advocaciaBelido, 'PNG', centerX, 10, logoWidth, logoHeight);
        
        // Linha dourada separadora
        doc.setDrawColor(184, 134, 11);
        doc.setLineWidth(0.5);
        doc.line(20, 38, pageWidth - 20, 38);
      };

      // Função para adicionar rodapé
      const addFooter = (pageNumber: number, totalPages: number) => {
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const footerStartY = pageHeight - 40;
        
        // Linha dourada separadora superior
        doc.setDrawColor(184, 134, 11);
        doc.setLineWidth(0.5);
        doc.line(20, footerStartY, pageWidth - 20, footerStartY);
        
        // Configuração de fonte
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        
        let currentY = footerStartY + 5;
        
        // CUIABÁ/MT
        doc.setFont('helvetica', 'bold');
        doc.text('Cuiabá/MT:', 20, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text('Travessa Desembargador Ferreira Mendes, 233, 8º andar, sala 81, Master Center, Centro Sul, CEP: 78.020-200', 38, currentY, { maxWidth: pageWidth - 58 });
        
        currentY += 4;
        
        // Telefones Cuiabá com ícones WhatsApp
        doc.addImage(whatsappIcon, 'PNG', 20, currentY - 2.5, 3, 3);
        doc.text('(65) 9.8134-0174', 24, currentY);
        doc.addImage(whatsappIcon, 'PNG', 55, currentY - 2.5, 3, 3);
        doc.text('(65) 3623-5561', 59, currentY);
        
        currentY += 6;
        
        // BOA VISTA/RR
        doc.setFont('helvetica', 'bold');
        doc.text('Boa Vista/RR:', 20, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text('Rua Jair Alves dos Reis, 118, sala 1, Bairro: Jardim Floresta, CEP: 69.312-148', 38, currentY, { maxWidth: pageWidth - 58 });
        
        currentY += 4;
        
        // Telefones Boa Vista com ícones WhatsApp
        doc.addImage(whatsappIcon, 'PNG', 20, currentY - 2.5, 3, 3);
        doc.text('(95) 3626-1438', 24, currentY);
        doc.addImage(whatsappIcon, 'PNG', 55, currentY - 2.5, 3, 3);
        doc.text('(95) 99158-3636', 59, currentY);
        
        currentY += 6;
        
        // E-MAIL com ícone
        doc.addImage(emailIcon, 'PNG', 20, currentY - 2.5, 3, 3);
        doc.text('advbelido@gmail.com', 24, currentY);
        
        // Número da página (canto direito)
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 40, currentY);
      };

      // Adicionar cabeçalho na primeira página
      addHeader();

      // Configurar fonte e margens
      doc.setFontSize(12);
      doc.setFont('times', 'normal');
      doc.setTextColor(0, 0, 0);
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margins = { 
        top: 45,  // Depois do cabeçalho
        left: 30, 
        right: 20,
        bottom: 45 // Antes do rodapé
      };
      const maxWidth = pageWidth - margins.left - margins.right;
      const usableHeight = pageHeight - margins.top - margins.bottom;

      // Adicionar texto com quebra de linha
      const lines = doc.splitTextToSize(petition, maxWidth);
      let y = margins.top;

      lines.forEach((line: string) => {
        if (y > pageHeight - margins.bottom) {
          doc.addPage();
          addHeader();
          y = margins.top;
        }
        doc.text(line, margins.left, y);
        y += 7; // Espaçamento 1.5 linhas
      });

      // Adicionar rodapé em TODAS as páginas
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

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
          const lengthDiff = result.petition_corrigida.length - currentPetition.length;
          const percentChange = Math.abs((lengthDiff / currentPetition.length) * 100);
          
          console.log(`[CORRECTIONS] Lote ${batchNum} - Mudança: ${lengthDiff} chars (${percentChange.toFixed(1)}%)`);
          
          // 🆕 Se mudança for muito pequena, alertar
          if (Math.abs(lengthDiff) < 50) {
            console.warn(`[CORRECTIONS] ⚠️ Lote ${batchNum}: Mudança muito pequena (${lengthDiff} chars)`);
            toast.warning(`⚠️ Lote ${batchNum}: Correção foi muito conservadora`, { duration: 3000 });
          }
          
          currentPetition = result.petition_corrigida;
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
          judge_analysis: {
            ...judgeAnalysis,
            brechas: brechasRestantes,
            risco_improcedencia: riscoAtual
          } as any,
          payload: { 
            selected_corrections: selectedBrechasData.map(b => b.descricao),
            corrections_applied: true,
            brechas_corrigidas: selectedBrechas.length,
            risco_reduzido_para: riscoAtual
          }
        })
        .select()
        .single();

      if (saveError) {
        console.error('[CORRECTIONS] Erro ao salvar:', saveError);
        throw saveError;
      }

      console.log('[CORRECTIONS] ✅ Salvo no banco - ID:', savedDraft.id);
      console.log('[CORRECTIONS] ✅ Timestamp:', savedDraft.generated_at);
      console.log('[CORRECTIONS] ✅ Petition length:', currentPetition.length);
      
      // Limpar seleção
      setSelectedBrechas([]);
      
      toast.success(
        `✅ ${totalSelected} correção(ões) aplicadas e salvas! Risco reduzido para ${riscoAtual}%`,
        { duration: 4000 }
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
      
      // ❌ NÃO re-analisar automaticamente - deixar usuário decidir
      
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

  // Função para excluir brechas selecionadas
  const deleteSelectedBrechas = () => {
    if (!judgeAnalysis || selectedBrechas.length === 0) {
      toast.error('Nenhuma brecha selecionada para excluir.');
      return;
    }
    
    console.log('[DELETE-BRECHAS] Excluindo brechas:', selectedBrechas);
    
    // Remover brechas selecionadas do array
    const brechasRestantes = judgeAnalysis.brechas.filter(
      (_, idx) => !selectedBrechas.includes(idx)
    );
    
    // Calcular redução do risco
    const brechasExcluidas = judgeAnalysis.brechas.filter(
      (_, idx) => selectedBrechas.includes(idx)
    );
    
    const reducaoTotal = brechasExcluidas.reduce((acc, brecha) => {
      const reducao = brecha.gravidade === 'alta' ? 15 : 
                     brecha.gravidade === 'media' ? 10 : 5;
      return acc + reducao;
    }, 0);
    
    const novoRisco = Math.max(0, judgeAnalysis.risco_improcedencia - reducaoTotal);
    
    // Atualizar estado
    setJudgeAnalysis({
      ...judgeAnalysis,
      brechas: brechasRestantes,
      risco_improcedencia: novoRisco
    });
    
    toast.success(`✅ ${selectedBrechas.length} brecha(s) excluída(s). Risco reduzido para ${novoRisco}%`);
    
    // Limpar seleção
    setSelectedBrechas([]);
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
    
    // 🔥 VALIDAR SE HÁ BRECHAS SELECIONADAS
    if (!selectedBrechas || selectedBrechas.length === 0) {
      toast.error('❌ Selecione pelo menos uma brecha para aplicar correções');
      return;
    }
    
    console.log('[APPLY-CORRECTIONS] Iniciando aplicação de correções...');
    console.log('[APPLY-CORRECTIONS] Petition length:', petition?.length);
    console.log('[APPLY-CORRECTIONS] Brechas selecionadas:', selectedBrechas.length);
    
    setApplyingJudgeCorrections(true);
    
    try {
      // Filtrar apenas as brechas selecionadas (por índice)
      const brechasSelecionadas = selectedBrechas.map(idx => judgeAnalysis.brechas[idx]);
      
      console.log('[APPLY-CORRECTIONS] Aplicando correções para:', 
        brechasSelecionadas.map((b: any) => b.tipo)
      );
      
      // 🔥 CHAMAR EDGE FUNCTION PARA APLICAR CORREÇÕES
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition: petition,
          judgeAnalysis: {
            brechas: brechasSelecionadas,
            pontos_fortes: judgeAnalysis.pontos_fortes || [],
            pontos_fracos: judgeAnalysis.pontos_fracos || [],
            recomendacoes: judgeAnalysis.recomendacoes || []
          },
          caseId: data.caseId
        }
      });
      
      if (error) {
        console.error('[APPLY-CORRECTIONS] Erro no edge function:', error);
        throw error;
      }
      
      if (!result?.petition_corrigida) {
        throw new Error('Nenhuma petição corrigida retornada');
      }
      
      console.log('[APPLY-CORRECTIONS] ✅ Correções aplicadas pela IA');
      console.log('[APPLY-CORRECTIONS] Length antes:', petition.length);
      console.log('[APPLY-CORRECTIONS] Length depois:', result.petition_corrigida.length);
      console.log('[APPLY-CORRECTIONS] Diferença:', result.petition_corrigida.length - petition.length);
      
      // 🔥 ATUALIZAR ESTADO DA PETIÇÃO
      setPetition(result.petition_corrigida);
      
      // 🔥 SALVAR NO BANCO COM INSERT (não upsert)
      const { error: saveError } = await supabase.from('drafts').insert([{
        case_id: data.caseId,
        markdown_content: result.petition_corrigida,
        judge_analysis: judgeAnalysis as any,
        payload: { 
          corrected_by_judge: true,
          judge_analysis: judgeAnalysis,
          applied_brechas: brechasSelecionadas.map((b: any) => b.tipo),
          timestamp: new Date().toISOString() 
        } as any
      }]);
      
      if (saveError) {
        console.error('[APPLY-CORRECTIONS] Erro ao salvar:', saveError);
      } else {
        console.log('[APPLY-CORRECTIONS] ✅ Petição corrigida salva no banco');
      }
      
      // 🔥 REMOVER BRECHAS APLICADAS DO ESTADO (filtrar por índice)
      const brechasRestantes = judgeAnalysis.brechas.filter(
        (_, idx) => !selectedBrechas.includes(idx)
      );
      
      // Calcular nova pontuação de risco
      const reducaoTotal = brechasSelecionadas.reduce((acc: number, brecha: any) => {
        const reducao = brecha.gravidade === 'alta' ? 20 : 
                        brecha.gravidade === 'media' ? 10 : 5;
        return acc + reducao;
      }, 0);
      
      const novoRisco = Math.max(0, judgeAnalysis.risco_improcedencia - reducaoTotal);
      
      // 🔥 ATUALIZAR ESTADO DO judgeAnalysis
      setJudgeAnalysis({
        ...judgeAnalysis,
        brechas: brechasRestantes,
        risco_improcedencia: novoRisco
      });
      
      // 🔥 LIMPAR SELEÇÃO
      setSelectedBrechas([]);
      
      // 🔥 FEEDBACK VISUAL
      toast.success(`✅ ${brechasSelecionadas.length} correção(ões) aplicada(s)! Risco reduzido para ${novoRisco}%`, {
        duration: 5000
      });
      
      // Flash verde na petição
      setTimeout(() => {
        const el = document.querySelector('[data-petition-content]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('ring-4', 'ring-green-500', 'transition-all');
          setTimeout(() => el.classList.remove('ring-4', 'ring-green-500'), 2000);
        }
      }, 300);
      
    } catch (error: any) {
      console.error('[APPLY-CORRECTIONS] Erro ao aplicar correções:', error);
      toast.error('Erro ao aplicar correções: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setApplyingJudgeCorrections(false);
    }
    
    // 🔥 REVALIDAR QUALITY REPORT APÓS APLICAR CORREÇÕES
    await revalidateQualityReport();
  };

  // ═══════════════════════════════════════════════════════════════
  // 🔥 FUNÇÃO PARA CORRIGIR CONTRADIÇÕES DAS ABAS AUTOMATICAMENTE
  // ═══════════════════════════════════════════════════════════════
  const fixTabContradictions = async () => {
    if (!petition || !judgeAnalysis?.validacao_abas) {
      toast.error('Análise do Módulo Juiz não encontrada');
      return;
    }
    
    // Filtrar apenas abas com status diferente de "OK"
    const abasComProblemas = Object.entries(judgeAnalysis.validacao_abas)
      .filter(([_, info]: [string, any]) => info.status !== 'OK')
      .map(([aba, info]: [string, any]) => ({
        aba,
        status: info.status,
        problemas: info.problemas || []
      }));
    
    if (abasComProblemas.length === 0) {
      toast.success('✅ Nenhuma contradição encontrada!');
      return;
    }
    
    console.log('[FIX-TABS] 🔍 Corrigindo contradições de', abasComProblemas.length, 'abas');
    
    setApplyingJudgeCorrections(true);
    
    try {
      // ═══ FASE 1: BUSCAR DOCUMENTOS DO BANCO ═══
      console.log('[FIX-TABS] 📄 Buscando documentos do caso...');
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('id, document_type, file_name, file_path')
        .eq('case_id', data.caseId)
        .order('uploaded_at', { ascending: true });
      
      if (docsError) {
        console.error('[FIX-TABS] Erro ao buscar documentos:', docsError);
      }
      
      // ═══ FASE 2: CRIAR MAPEAMENTO DETALHADO DOS DOCUMENTOS ═══
      const documentosExtraidos = (documents || []).map((doc, index) => ({
        numero: `Doc. ${String(index + 1).padStart(2, '0')}`,
        tipo: doc.document_type,
        nome: doc.file_name,
        id: doc.id
      }));
      
      console.log('[FIX-TABS] 📋 Documentos mapeados:', documentosExtraidos.length);
      
      // ═══ FASE 2: CRIAR INSTRUÇÕES ESPECÍFICAS E DETALHADAS ═══
      const instrucoesPorProblema = abasComProblemas.flatMap(aba => 
        aba.problemas.map(problema => {
          // Identificar tipo de problema e criar instrução específica
          let instrucaoEspecifica = problema;
          
          // Se o problema é sobre documentos, adicionar tabela completa
          if (problema.toLowerCase().includes('documento') || 
              problema.toLowerCase().includes('doc.') ||
              problema.toLowerCase().includes('numeração')) {
            
            const tabelaDocumentos = documentosExtraidos.map(doc => 
              `- ${doc.numero}: ${doc.nome} (Tipo: ${doc.tipo})`
            ).join('\n');
            
            instrucaoEspecifica = `
**PROBLEMA DETECTADO NA ABA ${aba.aba.toUpperCase()}:**
${problema}

**DOCUMENTOS CORRETOS (extraídos do sistema):**
${tabelaDocumentos}

**AÇÃO OBRIGATÓRIA:**
1. Localize a seção "Das Provas" ou onde os documentos são listados
2. Reescreva COMPLETAMENTE listando EXATAMENTE esses ${documentosExtraidos.length} documentos na ordem acima
3. Certifique-se de que TODOS os documentos estão mencionados
4. Use a numeração correta (Doc. 01, Doc. 02, etc.)
5. NÃO invente documentos que não existem
6. NÃO use números que não correspondem à lista acima
7. Cite documentos específicos ao argumentar (ex: "conforme Doc. 03, 04 e 07 anexos")`;
          }
          
          return {
            descricao: instrucaoEspecifica,
            secao: aba.aba,
            gravidade: aba.status === 'CRÍTICO' ? 'alta' : 'media'
          };
        })
      );
      
      // Construir análise consolidada com instruções detalhadas
      const analysisConsolidada = {
        brechas: instrucoesPorProblema
          .filter(i => i.gravidade === 'alta')
          .map(i => ({
            tipo: 'probatoria',
            descricao: i.descricao,
            gravidade: 'alta',
            localizacao: i.secao,
            sugestao: 'Aplicar a correção detalhada acima'
          })),
        pontos_fracos: instrucoesPorProblema
          .filter(i => i.gravidade === 'media')
          .map(i => ({
            descricao: i.descricao,
            secao: i.secao,
            recomendacao: 'Corrigir conforme instruções específicas'
          })),
        recomendacoes: abasComProblemas.map(aba => 
          `Revisar e corrigir todos os problemas identificados na aba ${aba.aba.toUpperCase()}`
        )
      };
      
      console.log('[FIX-TABS] 📝 Instruções construídas:', {
        brechas: analysisConsolidada.brechas.length,
        pontosFracos: analysisConsolidada.pontos_fracos.length,
        recomendacoes: analysisConsolidada.recomendacoes.length
      });
      
      // ═══ FASE 3: CHAMAR EDGE FUNCTION COM CONTEXTO COMPLETO ═══
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition: petition,
          judgeAnalysis: analysisConsolidada,
          caseId: data.caseId,
          contextDocuments: documentosExtraidos  // 🆕 NOVO!
        }
      });
      
      if (error) {
        console.error('[FIX-TABS] Erro:', error);
        throw error;
      }
      
      if (!result?.petition_corrigida) {
        throw new Error('Nenhuma petição corrigida retornada');
      }
      
      const lengthDiff = result.petition_corrigida.length - petition.length;
      const percentChange = ((lengthDiff / petition.length) * 100).toFixed(1);
      
      console.log('[FIX-TABS] ✅ Contradições corrigidas');
      console.log('[FIX-TABS] Length antes:', petition.length);
      console.log('[FIX-TABS] Length depois:', result.petition_corrigida.length);
      console.log('[FIX-TABS] Diferença:', lengthDiff, `(${percentChange}%)`);
      
      // ═══ FASE 5: VALIDAÇÃO PÓS-CORREÇÃO ═══
      const extractDocReferences = (text: string): string[] => {
        const regex = /Doc\.\s*(\d{1,2})/gi;
        const matches = text.matchAll(regex);
        return Array.from(matches, m => `Doc. ${m[1].padStart(2, '0')}`);
      };
      
      const docsMencionados = extractDocReferences(result.petition_corrigida);
      const docsCorretos = documentosExtraidos.map(d => d.numero);
      const docsIncorretos = docsMencionados.filter(ref => !docsCorretos.includes(ref));
      
      if (docsIncorretos.length > 0) {
        console.warn('[FIX-TABS] ⚠️ Documentos incorretos ainda citados:', docsIncorretos);
        toast.warning(`Correção aplicada mas ${docsIncorretos.length} referência(s) ainda incorreta(s)`, {
          description: 'Pode ser necessária revisão manual'
        });
      }
      
      // Atualizar estado
      setPetition(result.petition_corrigida);
      
      // ═══ FASE 8: SALVAR HISTÓRICO DE CORREÇÃO ═══
      await supabase.from('correction_history').insert({
        case_id: data.caseId,
        correction_type: 'cross_tab_alignment',
        module: 'quality_control_all_tabs',
        changes_summary: JSON.stringify({
          abas_corrigidas: abasComProblemas.map(a => a.aba),
          total_problemas: instrucoesPorProblema.length,
          documentos_realinhados: documentosExtraidos.length,
          mudanca_tamanho: lengthDiff
        }),
        before_content: petition.substring(0, 500),
        after_content: result.petition_corrigida.substring(0, 500),
        confidence_score: docsIncorretos.length === 0 ? 95 : 75,
        auto_applied: true
      });
      
      // Salvar nova versão no banco
      await supabase.from('drafts').insert([{
        case_id: data.caseId,
        markdown_content: result.petition_corrigida,
        payload: { 
          corrected_tabs: true,
          tabs_corrigidas: abasComProblemas.map(a => a.aba),
          documentos_alinhados: documentosExtraidos.length,
          timestamp: new Date().toISOString() 
        } as any
      }]);
      
      // ═══ FASE 7: FEEDBACK VISUAL DETALHADO ═══
      toast.success('✅ Contradições corrigidas com sucesso!', {
        description: `
          • ${abasComProblemas.length} aba(s) corrigida(s)
          • ${documentosExtraidos.length} documentos realinhados
          • ${lengthDiff > 0 ? 'Conteúdo expandido' : 'Conteúdo otimizado'} (${percentChange}%)
          ${docsIncorretos.length === 0 ? '• Validação 100% OK' : ''}
        `,
        duration: 7000
      });

      // 🔥 FASE 8: REVALIDAÇÃO INTELIGENTE (SEM LOOP INFINITO)
      
      // ✅ VERIFICAR LIMITE DE TENTATIVAS
      if (correctionAttempts >= MAX_CORRECTION_ATTEMPTS) {
        console.warn('[FIX-TABS] ⚠️ Limite de tentativas atingido, pulando revalidação');
        toast.warning('Correções aplicadas. Revisão manual recomendada para validação final.', {
          duration: 6000
        });
        setCorrectionAttempts(0); // Reset para próxima vez
        return;
      }
      
      setCorrectionAttempts(prev => prev + 1);
      console.log(`[FIX-TABS] 🔄 Iniciando revalidação (tentativa ${correctionAttempts + 1}/${MAX_CORRECTION_ATTEMPTS})...`);
      toast.info('🔄 Revalidando status das abas...', { id: 'revalidating' });
      
      try {
        // 1️⃣ Reanalise com Módulo Juiz para atualizar status
        console.log('[FIX-TABS] 📊 Reanalisando com Módulo Juiz...');
        await analyzeWithJudgeModule(true, result.petition_corrigida);
        
        // 2️⃣ Se jurisprudência tinha problema, buscar novamente
        const needsJurisprudence = abasComProblemas.some(a => a.aba === 'jurisprudencia');
        if (needsJurisprudence) {
          console.log('[FIX-TABS] 📚 Buscando jurisprudência atualizada...');
          try {
            await supabase.functions.invoke('queue-jurisprudence', {
              body: { caseId: data.caseId }
            });
          } catch (jError) {
            console.warn('[FIX-TABS] Erro ao buscar jurisprudência:', jError);
          }
        }
        
        // 3️⃣ Recarregar Quality Report
        await loadQualityReport();
        
        toast.success('✅ Status atualizados com sucesso!', { 
          id: 'revalidating',
          duration: 3000 
        });
      } catch (revalError) {
        console.error('[FIX-TABS] Erro na revalidação:', revalError);
        toast.warning('Correções aplicadas mas status podem não estar atualizados', { 
          id: 'revalidating' 
        });
      }
      
    } catch (error: any) {
      console.error('[FIX-TABS] ❌ Erro ao corrigir:', error);
      toast.error('Erro ao corrigir contradições', {
        description: error.message || 'Erro desconhecido'
      });
    } finally {
      setApplyingJudgeCorrections(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // BUSCAR ÚLTIMA VERSÃO DA PETIÇÃO (COM TODAS AS MODIFICAÇÕES)
  // ════════════════════════════════════════════════════════════
  const getLatestPetitionVersion = async (): Promise<{
    petition: string;
    hasJudgeCorrections: boolean;
    hasRegionalAdaptations: boolean;
    hasAppellateAdaptations: boolean;
  }> => {
    try {
      const { data: latestDraft } = await supabase
        .from('drafts')
        .select('*')
        .eq('case_id', data.caseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!latestDraft) {
        console.log('[LATEST-VERSION] Nenhuma versão salva, usando state local');
        return {
          petition: petition,
          hasJudgeCorrections: false,
          hasRegionalAdaptations: false,
          hasAppellateAdaptations: false
        };
      }
      
      const payload = latestDraft.payload as any;
      
      console.log('[LATEST-VERSION] Versão encontrada:', {
        id: latestDraft.id,
        corrected_by_judge: payload?.corrected_by_judge,
        regional_adaptations: payload?.regional_adaptations_applied,
        appellate_adaptations: payload?.appellate_adaptations_applied
      });
      
      return {
        petition: latestDraft.markdown_content || petition,
        hasJudgeCorrections: !!payload?.corrected_by_judge,
        hasRegionalAdaptations: !!payload?.regional_adaptations_applied,
        hasAppellateAdaptations: !!payload?.appellate_adaptations_applied
      };
    } catch (error) {
      console.error('[LATEST-VERSION] Erro ao buscar:', error);
      return {
        petition: petition,
        hasJudgeCorrections: false,
        hasRegionalAdaptations: false,
        hasAppellateAdaptations: false
      };
    }
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
        
        // ✅ Salvar imediatamente no banco (INSERT ao invés de UPSERT)
        const { data: savedDraft, error: saveError } = await supabase
          .from('drafts')
          .insert([{
            case_id: data.caseId,
            markdown_content: result.petition_corrigida,
            payload: { 
              corrected_by_judge: true, 
              judge_analysis: judgeAnalysis,
              all_corrections_applied: true,
              timestamp: new Date().toISOString() 
            } as any
          }])
          .select()
          .single();
        
        if (saveError) {
          console.error('[APPLY-CORRECTIONS] Erro ao salvar:', saveError);
        } else {
          console.log('[APPLY-CORRECTIONS] ✅ Salvo no banco - ID:', savedDraft.id);
        }
        
        // Reduzir risco e LIMPAR todas as brechas
        const newRisk = Math.max(0, (judgeAnalysis.risco_improcedencia || 0) - 15);
        setJudgeAnalysis(prev => prev ? { 
          ...prev, 
          brechas: [], // Limpar todas as brechas
          risco_improcedencia: newRisk 
        } : prev);
        
        toast.success(`✅ Todas as correções aplicadas e salvas! Risco reduzido para ${newRisk}%.`);

        // ✅ Feedback visual melhorado
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
        
        // ❌ NÃO re-analisar automaticamente - deixar usuário decidir
        
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
      // 🔥 BUSCAR VERSÃO MAIS RECENTE (com correções do juiz + adaptações regionais)
      const { 
        petition: latestPetition, 
        hasJudgeCorrections, 
        hasRegionalAdaptations 
      } = await getLatestPetitionVersion();
      
      console.log('[APPELLATE] Analisando versão:', {
        hasJudgeCorrections,
        hasRegionalAdaptations,
        length: latestPetition.length
      });
      
      const judgeAnalysisToUse = judgeAnalysis;
      
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
            petition: latestPetition,
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
      toast.success('✅ Análise recursiva concluída!');
    } catch (error: any) {
      console.error('[APPELLATE] Erro:', error);
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
          regional_adaptation: regionalAdaptation as any,
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
    if (!regionalAdaptation?.adaptacoes_sugeridas || regionalAdaptation.adaptacoes_sugeridas.length === 0) {
      toast.error('Nenhuma adaptação disponível');
      return;
    }

    setApplyingRegionalAdaptations(true);
    try {
      // 🔥 BUSCAR VERSÃO MAIS RECENTE (com correções do juiz se houver)
      const { petition: latestPetition, hasJudgeCorrections } = await getLatestPetitionVersion();
      
      console.log('[REGIONAL] Aplicando adaptações sobre:', 
        hasJudgeCorrections ? 'PETIÇÃO JÁ CORRIGIDA PELO JUIZ' : 'PETIÇÃO ORIGINAL'
      );
      
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition: latestPetition,
          judgeAnalysis: {
            brechas: [],
            pontos_fortes: [],
            pontos_fracos: [],
            recomendacoes: regionalAdaptation.adaptacoes_sugeridas.map(a => a.adaptacao)
          }
        }
      });

      if (error) {
        console.error('[REGIONAL] Erro ao aplicar:', error);
        throw error;
      }

      if (result?.petition_corrigida) {
        console.log('[REGIONAL] Petição corrigida recebida:', result.petition_corrigida.length, 'chars');
        setPetition(result.petition_corrigida);
        
        // ✅ Manter flags anteriores + adicionar nova flag
        const { data: savedDraft, error: saveError } = await supabase
          .from('drafts')
          .insert({
            case_id: data.caseId,
            markdown_content: result.petition_corrigida,
            regional_adaptation: {
              ...regionalAdaptation,
              adaptacoes_sugeridas: [] // Lista vazia = tudo aplicado
            } as any,
            payload: { 
              corrected_by_judge: hasJudgeCorrections,
              regional_adaptations_applied: true,
              trf: regionalAdaptation.trf,
              timestamp: new Date().toISOString()
            }
          })
          .select()
          .single();
        
        if (saveError) {
          console.error('[REGIONAL] Erro ao salvar:', saveError);
        } else {
          console.log('[REGIONAL] ✅ Salvo com flags:', {
            corrected_by_judge: hasJudgeCorrections,
            regional_adaptations_applied: true
          });
        }
        
        toast.success(`✅ ${regionalAdaptation.adaptacoes_sugeridas.length} adaptações regionais aplicadas!`);
        
        // 🔥 LIMPAR LISTA DE ADAPTAÇÕES (JÁ FORAM APLICADAS)
        setRegionalAdaptation({
          ...regionalAdaptation,
          adaptacoes_sugeridas: [] // Lista vazia = tudo aplicado
        });
        setSelectedAdaptations([]); // Limpar seleção
        
        // Flash visual
        setTimeout(() => {
          const el = document.querySelector('[data-petition-content]');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('ring-4', 'ring-blue-500', 'transition-all');
            setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 2000);
          }
        }, 300);
      } else {
        console.warn('[REGIONAL] Resposta sem petition_corrigida');
        toast.error('Erro: resposta sem conteúdo');
      }
    } catch (error: any) {
      console.error('[REGIONAL] Erro geral:', error);
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingRegionalAdaptations(false);
    }
  };

  const applySingleAppellateAdaptation = async (adaptacao: any, index: number) => {
    setApplyingIndividualAppellateAdaptation(index);
    try {
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition,
          judgeAnalysis: {
            brechas: [],
            pontos_fortes: [],
            pontos_fracos: [],
            recomendacoes: [adaptacao.adaptacao]
          }
        }
      });

      if (error) throw error;

      if (result?.petition_corrigida) {
        setPetition(result.petition_corrigida);
        
        await supabase.from('drafts').insert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          appellate_analysis: appellateAnalysis as any,
          payload: { appellate_adaptation: adaptacao.tipo }
        });
        
        toast.success(`✅ Adaptação "${adaptacao.tipo}" aplicada!`);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setApplyingIndividualAppellateAdaptation(null);
    }
  };

  const applyAppellateAdaptations = async () => {
    if (!appellateAnalysis?.adaptacoes_regionais || appellateAnalysis.adaptacoes_regionais.length === 0) {
      toast.error('Nenhuma adaptação recursiva disponível');
      return;
    }

    setApplyingRegionalAdaptations(true);
    try {
      // 🔥 BUSCAR VERSÃO MAIS RECENTE (com correções do juiz + adaptações regionais)
      const { 
        petition: latestPetition, 
        hasJudgeCorrections, 
        hasRegionalAdaptations 
      } = await getLatestPetitionVersion();
      
      console.log('[APPELLATE-APPLY] Aplicando sobre:', {
        hasJudgeCorrections,
        hasRegionalAdaptations
      });
      
      const { data: result, error } = await supabase.functions.invoke('apply-judge-corrections', {
        body: {
          petition: latestPetition,
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
        
        // ✅ Manter todas as flags anteriores + adicionar nova
        await supabase.from('drafts').insert({
          case_id: data.caseId,
          markdown_content: result.petition_corrigida,
          appellate_analysis: {
            ...appellateAnalysis,
            adaptacoes_regionais: [] // Lista vazia = tudo aplicado
          } as any,
          payload: { 
            corrected_by_judge: hasJudgeCorrections,
            regional_adaptations_applied: hasRegionalAdaptations,
            appellate_adaptations_applied: true,
            timestamp: new Date().toISOString()
          }
        });
        
        toast.success(`✅ ${appellateAnalysis?.adaptacoes_regionais?.length || 0} adaptações do tribunal aplicadas!`);
        
        // 🔥 LIMPAR LISTA DE ADAPTAÇÕES (JÁ FORAM APLICADAS)
        setAppellateAnalysis({
          ...appellateAnalysis,
          adaptacoes_regionais: [] // Lista vazia = tudo aplicado
        });
        setSelectedAppellateAdaptations([]); // Limpar seleção
        
        // Flash visual
        setTimeout(() => {
          const el = document.querySelector('[data-petition-content]');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('ring-4', 'ring-purple-500', 'transition-all');
            setTimeout(() => el.classList.remove('ring-4', 'ring-purple-500'), 2000);
          }
        }, 300);
      }
    } catch (error: any) {
      console.error('[APPELLATE-APPLY] Erro:', error);
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
      {/* ✅ FASE 5: PAINEL DE PRÉ-REQUISITOS */}
      {!petition && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" />
              Pré-requisitos para Geração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              {prerequisitesCheck.hasDocs ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              )}
              <span className={prerequisitesCheck.hasDocs ? 'text-green-600' : 'text-red-600'}>
                Documentos anexados
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {prerequisitesCheck.hasValidation ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              )}
              <span className={prerequisitesCheck.hasValidation ? 'text-green-600' : 'text-red-600'}>
                Validação aprovada
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {prerequisitesCheck.hasAnalysis ? (
                prerequisitesCheck.analysisStale ? (
                  <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                )
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              )}
              <span className={
                prerequisitesCheck.hasAnalysis ? 
                  (prerequisitesCheck.analysisStale ? 'text-orange-600' : 'text-green-600') : 
                  'text-red-600'
              }>
                Análise jurídica {prerequisitesCheck.analysisStale && '(desatualizada)'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {prerequisitesCheck.hasJurisprudence ? (
                prerequisitesCheck.jurisprudenceStale ? (
                  <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                )
              ) : (
                <Lightbulb className="h-4 w-4 text-gray-400 flex-shrink-0" />
              )}
              <span className={
                prerequisitesCheck.hasJurisprudence ? 
                  (prerequisitesCheck.jurisprudenceStale ? 'text-orange-600' : 'text-green-600') : 
                  'text-muted-foreground'
              }>
                Jurisprudência selecionada {prerequisitesCheck.jurisprudenceStale && '(desatualizada)'} (recomendado)
              </span>
            </div>
            
            {!prerequisitesCheck.hasDocs || !prerequisitesCheck.hasValidation || !prerequisitesCheck.hasAnalysis ? (
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Complete as abas anteriores antes de gerar a petição
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      )}

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
      <QualityReportCard
        qualityReport={qualityReport}
        loading={loading}
      />

      {/* 🆕 VALIDAÇÃO DE RECOMENDAÇÕES DA ANÁLISE */}
      {recomendacoesValidacao.length > 0 && (
        <Card className="p-6 mt-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            Validação de Recomendações da Análise
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Verificação automática de que todas as recomendações da análise jurídica foram refletidas na petição
          </p>
          
          <div className="space-y-3">
            {recomendacoesValidacao.map((rec, i) => (
              <div 
                key={i}
                className={`p-4 rounded-lg border-2 transition-all ${
                  rec.atendida 
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {rec.atendida ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1">{rec.recomendacao}</p>
                    
                    {rec.atendida ? (
                      <div className="mt-2 text-xs space-y-1">
                        <p className="text-green-700 dark:text-green-300">
                          <strong>Onde:</strong> {rec.onde}
                        </p>
                        <p className="text-green-700 dark:text-green-300">
                          <strong>Como:</strong> {rec.como}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs">
                        <p className="text-red-700 dark:text-red-300">
                          <strong>Motivo:</strong> {rec.motivo}
                        </p>
                        <Badge variant="destructive" className="mt-2 text-xs">
                          Ação necessária
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-primary/10 dark:bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <strong>Resumo:</strong> {recomendacoesValidacao.filter(r => r.atendida).length} de {recomendacoesValidacao.length} recomendações atendidas
              {recomendacoesValidacao.filter(r => r.atendida).length === recomendacoesValidacao.length && (
                <span className="ml-2 text-green-600 dark:text-green-400">✓ Todas atendidas!</span>
              )}
            </p>
          </div>
        </Card>
      )}

      {/* Ações da Petição */}
      <div className="flex flex-wrap items-center gap-3">
        {/* ✅ CORREÇÃO #5: Botão para limpar cache e regerar */}
        <Button 
          onClick={clearCacheAndRegenerate} 
          variant="destructive" 
          disabled={loading || !petition} 
          className="gap-2 hidden"
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
              
              {/* 🔥 BOTÃO PARA CORRIGIR CONTRADIÇÕES */}
              {Object.values(judgeAnalysis.validacao_abas).some((info: any) => info.status !== 'OK') && (
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={fixTabContradictions}
                    disabled={applyingJudgeCorrections}
                    className="gap-2 bg-orange-600 hover:bg-orange-700"
                  >
                    {applyingJudgeCorrections ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Corrigindo...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Corrigir Todas as Contradições Automaticamente
                      </>
                    )}
                  </Button>
                </div>
              )}
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={validateQuickly} disabled={!petition}>
                    <Check className="h-4 w-4 mr-2" />
                    🔍 Validar Rápido
                  </Button>
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
                  {judgeAnalysis.brechas?.length > 0 && (
                    <>
                      <Button 
                        onClick={() => {
                          if (window.confirm(`Tem certeza que deseja excluir ${selectedBrechas.length} brecha(s) selecionada(s)? Esta ação não pode ser desfeita.`)) {
                            deleteSelectedBrechas();
                          }
                        }}
                        disabled={selectedBrechas.length === 0}
                        variant="destructive"
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir {selectedBrechas.length > 0 ? `${selectedBrechas.length} ` : ''}Selecionada(s)
                      </Button>
                      
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
                    </>
                  )}
                  
                  {/* Botão Re-analisar - sempre visível */}
                  <Button 
                    onClick={() => analyzeWithJudgeModule(true)} 
                    variant="outline"
                    disabled={analyzingJudge}
                    className="gap-2"
                  >
                    {analyzingJudge ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Re-analisando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Re-analisar Petição
                      </>
                    )}
                  </Button>
                </div>
                
                {(judgeAnalysis.brechas?.length ?? 0) === 0 && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">✅ Petição Sem Brechas</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Não foram identificadas brechas nesta versão da petição. Você pode re-analisar quando quiser usando o botão acima.
                    </AlertDescription>
                  </Alert>
                )}

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
                {(judgeAnalysis.brechas?.length ?? 0) > 0 && (
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
                      checked={selectedBrechas.length === (judgeAnalysis.brechas?.length ?? 0) && (judgeAnalysis.brechas?.length ?? 0) > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedBrechas(judgeAnalysis.brechas?.map((_, i) => i) ?? []);
                        } else {
                          setSelectedBrechas([]);
                        }
                      }}
                    />
                    <Label htmlFor="select-all-brechas" className="font-medium cursor-pointer text-sm">
                      {selectedBrechas.length === (judgeAnalysis.brechas?.length ?? 0) && (judgeAnalysis.brechas?.length ?? 0) > 0
                        ? "Desmarcar Todas" 
                        : "Selecionar Todas"}
                    </Label>
                  </div>
                  
                  <Badge variant="secondary" className="text-xs">
                    {selectedBrechas.length} de {judgeAnalysis.brechas?.length ?? 0} selecionada(s)
                  </Badge>
                </div>

                {judgeAnalysis.brechas?.map((brecha, index) => (
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
                      {judgeAnalysis.pontos_fortes?.map((ponto, index) => (
                        <li key={index}>{ponto}</li>
                      ))}
                    </ul>
                  </Card>
                  <Card className="p-4">
                    <h4 className="font-semibold text-red-600 mb-2">Pontos Fracos</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {judgeAnalysis.pontos_fracos?.map((ponto, index) => (
                        <li key={index}>{ponto}</li>
                      ))}
                    </ul>
                  </Card>
                </div>

                {/* Recomendações */}
                {(judgeAnalysis.recomendacoes?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Recomendações</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {judgeAnalysis.recomendacoes?.map((rec, index) => (
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
      {petition && data.petitionType === 'recurso_apelacao' && (
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

                {/* Adaptações Sugeridas com seleção e exclusão */}
                {regionalAdaptation.adaptacoes_sugeridas.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Adaptações Sugeridas por Seção</h4>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            if (selectedAdaptations.length === regionalAdaptation.adaptacoes_sugeridas.length) {
                              setSelectedAdaptations([]);
                            } else {
                              setSelectedAdaptations(regionalAdaptation.adaptacoes_sugeridas.map((_, i) => i));
                            }
                          }}
                        >
                          {selectedAdaptations.length === regionalAdaptation.adaptacoes_sugeridas.length ? 'Desmarcar' : 'Selecionar'} Todas
                        </Button>
                        {selectedAdaptations.length > 0 && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              const remaining = regionalAdaptation.adaptacoes_sugeridas.filter((_, i) => !selectedAdaptations.includes(i));
                              setRegionalAdaptation({ ...regionalAdaptation, adaptacoes_sugeridas: remaining });
                              setSelectedAdaptations([]);
                              toast.success(`${selectedAdaptations.length} adaptação(ões) excluída(s)`);
                            }}
                          >
                            Excluir Selecionadas ({selectedAdaptations.length})
                          </Button>
                        )}
                      </div>
                    </div>
                    {regionalAdaptation.adaptacoes_sugeridas.map((adapt, index) => (
                      <Card key={index} className="p-4 border-l-4 border-blue-500">
                        <div className="flex items-start gap-3">
                          <Checkbox 
                            checked={selectedAdaptations.includes(index)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedAdaptations([...selectedAdaptations, index]);
                              } else {
                                setSelectedAdaptations(selectedAdaptations.filter(i => i !== index));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
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
                          </div>
                        </div>
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
      {petition && data.petitionType === 'recurso_apelacao' && (
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

                {/* Adaptações Regionais com seleção e exclusão */}
                {appellateAnalysis.adaptacoes_regionais?.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Adaptações Recursivas Sugeridas</h4>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            if (selectedAppellateAdaptations.length === appellateAnalysis.adaptacoes_regionais.length) {
                              setSelectedAppellateAdaptations([]);
                            } else {
                              setSelectedAppellateAdaptations(appellateAnalysis.adaptacoes_regionais.map((_: any, i: number) => i));
                            }
                          }}
                        >
                          {selectedAppellateAdaptations.length === appellateAnalysis.adaptacoes_regionais.length ? 'Desmarcar' : 'Selecionar'} Todas
                        </Button>
                        {selectedAppellateAdaptations.length > 0 && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => {
                              const remaining = appellateAnalysis.adaptacoes_regionais.filter((_: any, i: number) => !selectedAppellateAdaptations.includes(i));
                              setAppellateAnalysis({ ...appellateAnalysis, adaptacoes_regionais: remaining });
                              setSelectedAppellateAdaptations([]);
                              toast.success(`${selectedAppellateAdaptations.length} adaptação(ões) excluída(s)`);
                            }}
                          >
                            Excluir Selecionadas ({selectedAppellateAdaptations.length})
                          </Button>
                        )}
                      </div>
                    </div>
                    {appellateAnalysis.adaptacoes_regionais.map((adapt: any, index: number) => (
                      <Card key={index} className="p-4 border-l-4 border-purple-500">
                        <div className="flex items-start gap-3">
                          <Checkbox 
                            checked={selectedAppellateAdaptations.includes(index)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedAppellateAdaptations([...selectedAppellateAdaptations, index]);
                              } else {
                                setSelectedAppellateAdaptations(selectedAppellateAdaptations.filter(i => i !== index));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <Badge variant="outline" className="mb-2">{adapt.tipo}</Badge>
                            <p className="text-sm mb-2">{adapt.adaptacao}</p>
                            <p className="text-xs text-muted-foreground mb-3">
                              <strong>Justificativa:</strong> {adapt.justificativa}
                            </p>
                            
                            <Button
                              size="sm"
                              onClick={() => applySingleAppellateAdaptation(adapt, index)}
                              disabled={applyingIndividualAppellateAdaptation !== null}
                              className="gap-2 w-full"
                              variant="outline"
                            >
                              {applyingIndividualAppellateAdaptation === index ? (
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
                          </div>
                        </div>
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

                {/* 🔥 ANÁLISE DE RISCO DE INADMISSIBILIDADE */}
                {appellateAnalysis.admissibilidade && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Card de Percentual Atendido */}
                    <Card className="p-4 bg-green-50 dark:bg-green-950">
                      <h4 className="font-semibold text-green-800 dark:text-green-200 mb-3">
                        ✅ Requisitos de Admissibilidade
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Requisitos Atendidos</span>
                          <Badge className="bg-green-600">
                            {appellateAnalysis.admissibilidade.percentual_atendido}%
                          </Badge>
                        </div>
                        <Progress 
                          value={appellateAnalysis.admissibilidade.percentual_atendido} 
                          className="h-3" 
                        />
                        <ul className="list-disc list-inside space-y-1 text-xs mt-3">
                          {appellateAnalysis.admissibilidade.requisitos_atendidos?.map((req: string, i: number) => (
                            <li key={i} className="text-green-700 dark:text-green-300">{req}</li>
                          ))}
                        </ul>
                      </div>
                    </Card>

                    {/* Card de Risco de Inadmissibilidade */}
                    <Card className={`p-4 ${
                      appellateAnalysis.admissibilidade.risco_inadmissibilidade > 30 
                        ? 'bg-red-50 dark:bg-red-950' 
                        : appellateAnalysis.admissibilidade.risco_inadmissibilidade > 15
                        ? 'bg-yellow-50 dark:bg-yellow-950'
                        : 'bg-blue-50 dark:bg-blue-950'
                    }`}>
                      <h4 className={`font-semibold mb-3 ${
                        appellateAnalysis.admissibilidade.risco_inadmissibilidade > 30 
                          ? 'text-red-800 dark:text-red-200' 
                          : appellateAnalysis.admissibilidade.risco_inadmissibilidade > 15
                          ? 'text-yellow-800 dark:text-yellow-200'
                          : 'text-blue-800 dark:text-blue-200'
                      }`}>
                        ⚠️ Risco de Inadmissibilidade
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Probabilidade de Rejeição do Recurso</span>
                          <Badge variant={
                            appellateAnalysis.admissibilidade.risco_inadmissibilidade > 30 
                              ? 'destructive' 
                              : appellateAnalysis.admissibilidade.risco_inadmissibilidade > 15
                              ? 'default'
                              : 'secondary'
                          }>
                            {appellateAnalysis.admissibilidade.risco_inadmissibilidade}%
                          </Badge>
                        </div>
                        <Progress 
                          value={appellateAnalysis.admissibilidade.risco_inadmissibilidade} 
                          className="h-3" 
                        />
                        {appellateAnalysis.admissibilidade.requisitos_faltantes?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold mb-2">Requisitos Faltantes:</p>
                            <ul className="list-disc list-inside space-y-1 text-xs">
                              {appellateAnalysis.admissibilidade.requisitos_faltantes.map((req: string, i: number) => (
                                <li key={i} className="text-red-700 dark:text-red-300">{req}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
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
                <CheckCheck className="h-5 w-5" />
                Protocolar Ação
              </>
            )}
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
