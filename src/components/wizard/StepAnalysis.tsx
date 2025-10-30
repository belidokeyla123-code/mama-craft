import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Scale, Clock, FileQuestion, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TimelineChart } from "@/components/case/TimelineChart";
import { DocumentUploadInline } from "./DocumentUploadInline";
import { useCaseOrchestration } from "@/hooks/useCaseOrchestration";
import { useTabSync } from "@/hooks/useTabSync";

interface StepAnalysisProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

interface LegalAnalysis {
  qualidade_segurada: {
    tipo: string;
    comprovado: boolean;
    detalhes: string;
  };
  carencia: {
    necessaria: boolean;
    cumprida: boolean;
    meses_faltantes: number;
    detalhes: string;
  };
  cnis_analysis?: {
    periodos_urbanos: Array<any>;
    periodos_rurais: Array<any>;
    beneficios_anteriores: Array<any>;
    tempo_reconhecido_inss: { anos: number; meses: number };
    interpretacao?: string;
    analise_prospectiva?: string;
    impacto_futuro?: string;
  };
  timeline: Array<{
    periodo: string;
    tipo: "urbano" | "rural" | "beneficio" | "lacuna";
    status: "reconhecido" | "a_comprovar";
    detalhes?: string;
  }>;
  rmi: {
    valor: number;
    base_calculo: string;
    situacao_especial: boolean;
  };
  valor_causa: number;
  probabilidade_exito: {
    score: number;
    nivel: string;
    justificativa: string[];
    pontos_fortes: string[];
    pontos_fracos: string[];
  };
  recomendacoes: string[];
}

export const StepAnalysis = ({ data, updateData }: StepAnalysisProps) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [hasCache, setHasCache] = useState(false);
  const [docsChanged, setDocsChanged] = useState(false);

  // ✅ CORREÇÃO #4: Estado para benefícios sobrepostos
  const [benefitHistory, setBenefitHistory] = useState<any[]>([]);
  const [hasOverlappingBenefit, setHasOverlappingBenefit] = useState(false);

  // Hook de orquestração para disparar pipeline completo
  const { triggerFullPipeline } = useCaseOrchestration({
    caseId: data.caseId || '',
    enabled: !!data.caseId
  });

  // ✅ FASE 3: Sincronização em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['analysis-updated', 'extractions-updated', 'benefits-updated'],
    onSync: (detail) => {
      console.log('[StepAnalysis] 🔄 Análise atualizada remotamente, recarregando...');
      if (detail.timestamp && !loading) {
        loadCachedAnalysis();
      }
    }
  });

  // ✅ CORREÇÃO #4: Carregar benefícios e verificar sobreposição
  useEffect(() => {
    const loadBenefitHistory = async () => {
      if (!data.caseId) return;
      
      const { data: benefits, error } = await supabase
        .from('benefit_history')
        .select('*')
        .eq('case_id', data.caseId);

      if (error) {
        console.error('[BENEFIT_HISTORY] Erro:', error);
        return;
      }

      if (benefits && benefits.length > 0) {
        setBenefitHistory(benefits);
        
        // Verificar sobreposição com data de nascimento
        const childBirthDate = data.childBirthDate || data.eventDate;
        if (childBirthDate) {
          const overlapping = benefits.some(b => {
            if (!b.end_date) return false;
            const diff = Math.abs(
              new Date(b.end_date).getTime() - 
              new Date(childBirthDate).getTime()
            );
            return diff < 120 * 24 * 60 * 60 * 1000; // 120 dias
          });
          setHasOverlappingBenefit(overlapping);
        }
      }
    };

    loadBenefitHistory();
  }, [data.caseId, data.childBirthDate, data.eventDate]);

  // Carregar do cache ao entrar na aba
  useEffect(() => {
    if (data.caseId) {
      loadCachedAnalysis();
    }
  }, [data.caseId]);

  // Auto-executar análise se não houver cache
  useEffect(() => {
    if (!loading && !analysis && data.caseId) {
      const timer = setTimeout(() => {
        performAnalysis();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [analysis, data.caseId, loading]);

  const loadCachedAnalysis = async () => {
    if (!data.caseId) return;
    
    try {
      const { data: analysisData, error } = await supabase
        .from('case_analysis')
        .select('*')
        .eq('case_id', data.caseId)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (analysisData?.draft_payload) {
        setAnalysis(analysisData.draft_payload as unknown as LegalAnalysis);
        setHasCache(true);
        
        // Verificar se documentos mudaram
        const { data: currentDocs } = await supabase
          .from('documents')
          .select('id, uploaded_at')
          .eq('case_id', data.caseId);
        
        const currentHash = JSON.stringify(currentDocs);
        
        if (analysisData.last_document_hash && analysisData.last_document_hash !== currentHash) {
          setDocsChanged(true);
          toast.info('Novos documentos detectados. Clique em "Reanalisar" para atualizar.');
        }
        
        console.log('[ANALYSIS] Carregado do cache');
      }
    } catch (error) {
      console.error('Erro ao carregar cache:', error);
    }
  };

  const performAnalysis = async () => {
    if (!data.caseId) return;
    
    setLoading(true);
    try {
      // Chamar análise diretamente (sem fila)
      const { data: result, error } = await supabase.functions.invoke('analyze-case-legal', {
        body: { caseId: data.caseId }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429')) {
          toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
        } else if (error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Adicione créditos na sua conta.');
        } else if (error.message?.includes('timeout')) {
          toast.error('Análise demorou muito. Tente novamente.');
        } else {
          toast.error('Erro ao realizar análise jurídica');
        }
        throw error;
      }

      // Buscar resultado da análise no banco
      const { data: analysisData } = await supabase
        .from('case_analysis')
        .select('draft_payload')
        .eq('case_id', data.caseId)
        .single();
      
      if (analysisData?.draft_payload) {
        setAnalysis(analysisData.draft_payload as unknown as LegalAnalysis);
        setHasCache(true);
        setDocsChanged(false);
        
        // Auto-disparar busca de jurisprudência
        setTimeout(async () => {
          try {
            await supabase.functions.invoke('search-jurisprudence', {
              body: { caseId: data.caseId }
            });
          } catch (error) {
            console.error('Erro na busca automática de jurisprudência:', error);
          }
        }, 3000);
      } else {
        toast.warning("Análise executada mas resultado não encontrado.");
      }

    } catch (error: any) {
      console.error('Erro ao analisar caso:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProbabilityColor = (nivel: string) => {
    switch (nivel) {
      case 'alta': return 'text-green-600';
      case 'media': return 'text-yellow-600';
      case 'baixa': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Função para detectar tipo de documento a partir da recomendação
  const detectDocumentType = (recommendation: string): string | null => {
    const rec = recommendation.toLowerCase();
    
    const typeMap: Record<string, string> = {
      'processo administrativo': 'processo_administrativo',
      'cnis': 'cnis',
      'certidão de nascimento': 'certidao_nascimento',
      'certidão de casamento': 'certidao_casamento',
      'certidão de óbito': 'certidao_obito',
      'rg': 'identificacao',
      'cpf': 'identificacao',
      'identidade': 'identificacao',
      'comprovante de residência': 'comprovante_residencia',
      'comprovante de endereço': 'comprovante_residencia',
      'autodeclaração': 'autodeclaracao_rural',
      'declaração rural': 'autodeclaracao_rural',
      'sindicato': 'declaracao_sindicato_rural',
      'sindicato rural': 'declaracao_sindicato_rural',
      'ubs': 'declaracao_saude_ubs',
      'unidade básica de saúde': 'declaracao_saude_ubs',
      'unidade de saúde': 'declaracao_saude_ubs',
      'posto de saúde': 'declaracao_saude_ubs',
      'histórico escolar': 'historico_escolar',
      'escola': 'historico_escolar',
      'nota fiscal': 'nota_fiscal_produtor_rural',
      'produtor rural': 'nota_fiscal_produtor_rural',
      'itr': 'documento_terra',
      'ccir': 'documento_terra',
      'documento de terra': 'documento_terra',
      'escritura': 'documento_terra',
      'contrato de arrendamento': 'documento_terra',
      'contrato de parceria': 'documento_terra',
      'procuração': 'procuracao',
      'prontuário': 'prontuario_medico_parto',
      'prontuário médico': 'prontuario_medico_parto',
      'foto': 'fotos_propriedade',
      'fotos da propriedade': 'fotos_propriedade',
      'cartão de vacina': 'cartao_vacina'
    };
    
    const sortedEntries = Object.entries(typeMap).sort((a, b) => b[0].length - a[0].length);
    
    for (const [keyword, docType] of sortedEntries) {
      if (rec.includes(keyword)) {
        console.log(`🎯 Detectado tipo de documento: ${docType} (palavra-chave: "${keyword}")`);
        return docType;
      }
    }
    
    console.log('⚠️ Tipo de documento não detectado automaticamente');
    return null;
  };

  // Função para verificar se recomendação pede documento
  const needsDocumentUpload = (recommendation: string): boolean => {
    const keywords = [
      'juntar', 
      'solicitar', 
      'adicionar', 
      'anexar', 
      'incluir', 
      'apresentar', 
      'obter',
      'providenciar',
      'buscar',
      'requerer'
    ];
    const rec = recommendation.toLowerCase();
    return keywords.some(keyword => rec.includes(keyword));
  };

  // Componente para renderizar recomendação com botão de upload inteligente
  const RecommendationItem = ({ 
    recommendation, 
    index 
  }: { 
    recommendation: string; 
    index: number;
  }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const needsUpload = needsDocumentUpload(recommendation);
    const docType = detectDocumentType(recommendation);

    const handleUploadComplete = async () => {
      setIsProcessing(true);
      
      toast.success("📄 Documento enviado!", { 
        id: `upload-${index}`,
        description: "Processando e sincronizando análise..." 
      });
      
      try {
        console.log('🔄 Iniciando sincronização completa após upload...');
        
        // Disparar pipeline completo
        await triggerFullPipeline('Documento adicionado via recomendação');
        
        console.log('✅ Pipeline completo executado');
        
        // Recarregar análise atualizada
        toast.info("🔄 Recarregando análise...", { id: `reload-${index}` });
        await performAnalysis();
        
        toast.success("✅ Análise atualizada!", { 
          id: `reload-${index}`,
          description: "Todas as abas foram sincronizadas"
        });
        
      } catch (error) {
        console.error("❌ Erro ao processar documento:", error);
        toast.error("❌ Erro ao processar documento", {
          description: "Tente recarregar a página"
        });
      } finally {
        setIsProcessing(false);
      }
    };

    return (
      <li className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex-1 text-sm leading-relaxed">
          {recommendation}
        </div>
        
        {needsUpload && data.caseId && (
          <div className="flex-shrink-0">
            <DocumentUploadInline 
              caseId={data.caseId}
              suggestedDocType={docType || undefined}
              onUploadComplete={handleUploadComplete}
              buttonText="📎 Juntar"
              buttonVariant="outline"
              buttonSize="sm"
              disabled={isProcessing}
              showProgress={false}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Scale className="h-7 w-7 text-primary" />
          Análise Jurídica Completa
        </h2>
        <p className="text-muted-foreground">
          Análise de CNIS, carência, RMI, valor da causa e probabilidade de êxito
        </p>
      </div>

      {/* ✅ CORREÇÃO #4: Alerta de benefício sobreposto */}
      {hasOverlappingBenefit && (
        <Alert variant="destructive" className="border-red-600">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">
            🔴 ATENÇÃO: Benefício Anterior no Mesmo Evento
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              <p className="font-semibold">
                Foi detectado um benefício anterior cujo período coincide com a data do parto atual.
              </p>
              <div className="bg-red-100 p-3 rounded-md mt-2">
                <p className="text-sm"><strong>Risco:</strong> O INSS pode alegar duplicidade de benefício e indeferir o pedido.</p>
                <p className="text-sm mt-1"><strong>Estratégia:</strong> Verificar se o benefício anterior foi cessado antes do evento atual ou se trata-se de situação diferente (ex: aborto vs parto, gêmeos, etc).</p>
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold">Benefícios detectados:</p>
                <ul className="list-disc ml-6 text-sm mt-1">
                  {benefitHistory.map((b, idx) => (
                    <li key={idx}>
                      NB {b.nb}: {b.benefit_type} ({b.start_date} a {b.end_date || 'atual'})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={performAnalysis} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analisando...
            </>
          ) : hasCache ? (
            "Reanalisar"
          ) : (
            "Analisar Caso"
          )}
        </Button>
        {docsChanged && (
          <Badge variant="destructive" className="px-3 py-2">
            Novos documentos - reanálise recomendada
          </Badge>
        )}
      </div>

      {loading ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Analisando documentação e CNIS...</p>
              <p className="text-sm text-muted-foreground">
                Verificando qualidade de segurada, carência, RMI e valor da causa
              </p>
              <p className="text-xs text-muted-foreground">Isso pode levar até 60 segundos</p>
            </div>
          </div>
        </Card>
      ) : analysis ? (
        <>
          {/* Probabilidade de Êxito */}
          <Card className="p-6 border-2 border-primary">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold mb-1">Probabilidade de Êxito</h3>
                <p className="text-sm text-muted-foreground">
                  Baseado na análise completa da documentação
                </p>
              </div>
              <Badge variant="outline" className={`text-2xl px-4 py-2 ${getProbabilityColor(analysis.probabilidade_exito.nivel)}`}>
                {analysis.probabilidade_exito.score}%
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Pontos Fortes
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.probabilidade_exito.pontos_fortes?.map((ponto, index) => (
                    <li key={index}>{ponto}</li>
                  )) || <li>Nenhum ponto forte identificado</li>}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Pontos Fracos
                </h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.probabilidade_exito.pontos_fracos?.map((ponto, index) => (
                    <li key={index}>{ponto}</li>
                  )) || <li>Nenhum ponto fraco identificado</li>}
                </ul>
              </div>
            </div>

            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Justificativa</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.probabilidade_exito.justificativa?.map((just, index) => (
                  <li key={index}>{just}</li>
                )) || <li>Sem justificativa disponível</li>}
              </ul>
            </div>
          </Card>

          {/* Cards de Informações */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Perfil</p>
              <Badge variant="outline" className="text-base">
                {analysis.qualidade_segurada.tipo === "especial" ? "Segurada Especial" : "Segurada Urbana"}
              </Badge>
            </Card>
            
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Carência
              </p>
              <Badge variant={analysis.carencia.cumprida ? "default" : "destructive"}>
                {analysis.carencia.cumprida ? "Cumprida" : `Faltam ${analysis.carencia.meses_faltantes} meses`}
              </Badge>
            </Card>

            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                RMI
              </p>
              <p className="text-lg font-semibold">
                R$ {analysis.rmi.valor.toFixed(2)}
              </p>
            </Card>

            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Valor da Causa</p>
              <p className="text-lg font-semibold">
                R$ {analysis.valor_causa.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* Qualidade de Segurada */}
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-3">Qualidade de Segurada</h3>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={analysis.qualidade_segurada.comprovado ? "default" : "destructive"}>
                {analysis.qualidade_segurada.comprovado ? "Comprovada" : "Não Comprovada"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {analysis.qualidade_segurada.tipo}
              </span>
            </div>
            <p className="text-sm">{analysis.qualidade_segurada.detalhes}</p>
          </Card>

          {/* Timeline de Contribuição */}
          {analysis.timeline && analysis.timeline.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-4">Timeline de Contribuição</h3>
              <TimelineChart events={analysis.timeline} />
            </Card>
          )}

          {/* Análise de CNIS */}
          {analysis.cnis_analysis && (
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-3">Análise do CNIS</h3>
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-2">Tempo Reconhecido pelo INSS</p>
                  <Badge variant="secondary" className="text-base">
                    {analysis.cnis_analysis.tempo_reconhecido_inss.anos} anos e {analysis.cnis_analysis.tempo_reconhecido_inss.meses} meses
                  </Badge>
                  
                  {/* Interpretação */}
                  {analysis.cnis_analysis.interpretacao && (
                    <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">
                        ✅ {analysis.cnis_analysis.interpretacao}
                      </p>
                    </div>
                  )}
                </div>

                {/* Análise Prospectiva */}
                {analysis.cnis_analysis.analise_prospectiva && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <h4 className="font-semibold mb-2 text-blue-700 dark:text-blue-300">
                      📈 Análise Prospectiva
                    </h4>
                    <p className="text-sm">{analysis.cnis_analysis.analise_prospectiva}</p>
                  </div>
                )}

                {/* Impacto Futuro */}
                {analysis.cnis_analysis.impacto_futuro && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <h4 className="font-semibold mb-2 text-purple-700 dark:text-purple-300">
                      🎯 Impacto Estratégico
                    </h4>
                    <p className="text-sm">{analysis.cnis_analysis.impacto_futuro}</p>
                  </div>
                )}

                {/* Benefícios anteriores */}
                {analysis.cnis_analysis.beneficios_anteriores && analysis.cnis_analysis.beneficios_anteriores.length > 0 && (
                  <div>
                    <p className="font-medium mb-2">Benefícios Anteriores</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {analysis.cnis_analysis.beneficios_anteriores.map((ben: any, index: number) => (
                        <li key={index}>{ben.tipo} - {ben.data}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recomendações */}
          {analysis.recomendacoes && analysis.recomendacoes.length > 0 && (
            <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-2 border-blue-300">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-900 dark:text-blue-100">
                <Scale className="h-5 w-5" />
                Recomendações
                <span className="text-xs font-normal text-gray-500 ml-2">
                  (clique em "📎 Juntar" para adicionar documentos diretamente)
                </span>
              </h3>
              <ul className="space-y-3">
                {analysis.recomendacoes.map((rec, index) => (
                  <RecommendationItem 
                    key={index} 
                    recommendation={rec} 
                    index={index}
                  />
                ))}
              </ul>
            </Card>
          )}

          {/* Sugestões de Documentos Complementares */}
          {!analysis.carencia.cumprida && data.caseId && (
            <Card className="p-6 border-2 border-orange-200">
              <div className="flex items-start gap-3 mb-4">
                <FileQuestion className="h-6 w-6 text-orange-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-2">Documentos Sugeridos para Completar Carência</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Faltam {analysis.carencia.meses_faltantes} meses. Adicione documentos que comprovem atividade rural:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mb-4">
                    <li>Declaração da UBS/Posto de Saúde (ente público)</li>
                    <li>Declaração de sindicato rural atualizada</li>
                    <li>Notas fiscais de produtor rural</li>
                    <li>Fotos da propriedade com metadados (data/localização)</li>
                    <li>Documentos de terra (CCIR, ITR)</li>
                  </ul>
                </div>
              </div>
              <DocumentUploadInline 
                caseId={data.caseId}
                onUploadComplete={performAnalysis}
              />
            </Card>
          )}
        </>
      ) : (
        <Card className="p-8 text-center text-muted-foreground">
          Clique em "Reanalisar" para iniciar a análise jurídica completa
        </Card>
      )}
    </div>
  );
};
