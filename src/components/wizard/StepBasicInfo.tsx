import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Sparkles, User, Calendar, MapPin, AlertTriangle, Plus, Trash2, RefreshCw, FileText, Loader2, Brain, Baby, Heart, Tractor, Building, Home, PlusCircle, Save, Stethoscope } from "lucide-react";
import { CaseData, RuralPeriod, UrbanPeriod } from "@/pages/NewCase";
import { getSalarioMinimoHistory, getSalarioMinimoByDate } from "@/lib/salarioMinimo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DocumentUploadInline } from "./DocumentUploadInline";
import { PasteDataInline } from "./PasteDataInline";
import { StepBasicInfoBenefits } from "./StepBasicInfoBenefits";
import { useCacheInvalidation } from "@/hooks/useCacheInvalidation";
import { useCaseOrchestration } from "@/hooks/useCaseOrchestration";
import { useTabSync } from "@/hooks/useTabSync";

interface StepBasicInfoProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

// Função auxiliar para calcular tempo entre datas
const calcularTempo = (inicio: string, fim: string) => {
  const start = new Date(inicio);
  const end = new Date(fim);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const anos = Math.floor(diffDays / 365);
  const meses = Math.floor((diffDays % 365) / 30);
  
  if (anos > 0 && meses > 0) return `${anos}a ${meses}m`;
  if (anos > 0) return `${anos} ano(s)`;
  return `${meses} mês(es)`;
};

export const StepBasicInfo = ({ data, updateData }: StepBasicInfoProps) => {
  const autoFilledFields = data.autoFilledFields || [];
  const missingFields = data.missingFields || [];
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  
  // ✅ CORREÇÃO #7: Detectar campos críticos faltantes
  const hasCriticalMissingFields = !data.authorRg || !data.authorCpf || !data.authorAddress;

  // Sistema de orquestração para disparar pipeline completo
  const { triggerFullPipeline } = useCaseOrchestration({ 
    caseId: data.caseId || '', 
    enabled: true 
  });

  // Invalidar caches quando campos críticos mudarem
  useCacheInvalidation({
    caseId: data.caseId || '',
    triggerType: 'basic_info',
    watchFields: [data.profile, data.eventType, data.hasRa],
  });

  // ✅ FASE 3: Sincronização em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['case-updated', 'extractions-updated', 'benefits-updated'],
    onSync: (detail) => {
      console.log('[StepBasicInfo] 🔄 Dados atualizados remotamente, recarregando...');
      // Recarregar dados quando houver mudanças remotas
      if (detail.timestamp && data.caseId) {
        // Trigger reload via re-mounting do useEffect que carrega os dados
        window.location.reload(); // Reload simplificado por enquanto
      }
    }
  });

  // ✅ CORREÇÃO #3: Estado para benefícios anteriores
  const [benefitHistory, setBenefitHistory] = useState<any[]>([]);
  const [cnisAnalysis, setCnisAnalysis] = useState<any>(null);
  const [birthStateAI, setBirthStateAI] = useState<any>(null);
  const [aiValidation, setAiValidation] = useState<any>(null);
  const [validatingWithAI, setValidatingWithAI] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const isAutoFilled = (fieldName: string) => {
    return autoFilledFields.includes(fieldName);
  };

  const FieldBadge = ({ fieldName }: { fieldName: string }) => {
    if (isAutoFilled(fieldName)) {
      return (
        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
          <Sparkles className="h-3 w-3 mr-1" /> Auto-preenchido
        </Badge>
      );
    }
    if (data.missingFields?.includes(fieldName)) {
      return (
        <Badge variant="outline" className="ml-2 text-red-600 border-red-600">
          <AlertTriangle className="h-3 w-3 mr-1" /> Preencher
        </Badge>
      );
    }
    return null;
  };

  // Auto-save com debounce - salva automaticamente após 2s sem mudanças
  useEffect(() => {
    if (!data.caseId) return;
    
    setIsSaving(true);
    const timeoutId = setTimeout(async () => {
      try {
        const cleanDate = (dateStr: any) => {
          if (!dateStr) return null;
          const str = String(dateStr).toLowerCase().trim();
          if (['n/a', 'não identificado', 'não', 'vazio', 'não informado'].some(inv => str.includes(inv))) {
            return null;
          }
          return dateStr;
        };

        await supabase.from('cases').update({
          author_name: data.authorName,
          author_cpf: data.authorCpf,
          author_rg: data.authorRg,
          author_birth_date: cleanDate(data.authorBirthDate),
          author_address: data.authorAddress,
          author_marital_status: data.authorMaritalStatus,
          child_name: data.childName,
          child_birth_date: cleanDate(data.childBirthDate),
          father_name: data.fatherName,
          profile: data.profile,
          event_type: data.eventType,
          event_date: cleanDate(data.eventDate),
          petition_type: data.petitionType,
          land_owner_name: data.landOwnerName,
          land_owner_cpf: data.landOwnerCpf,
          land_owner_rg: data.landOwnerRg,
          land_ownership_type: data.landOwnershipType,
          land_property_name: data.landPropertyName,
          land_municipality: data.landMunicipality,
          rural_activity_since: cleanDate(data.ruralActivitySince),
          rural_periods: data.ruralPeriods as any,
          urban_periods: data.urbanPeriods as any,
          family_members: data.familyMembers as any,
          manual_benefits: data.manualBenefits as any,
          has_ra: data.hasRa,
          ra_protocol: data.raProtocol,
          ra_request_date: cleanDate(data.raRequestDate),
          ra_denial_date: cleanDate(data.raDenialDate),
          ra_denial_reason: data.raDenialReason,
          salario_minimo_ref: data.salarioMinimoRef,
          updated_at: new Date().toISOString(),
        }).eq('id', data.caseId);

        setIsSaving(false);
      } catch (error) {
        console.error('[AUTO-SAVE] Erro:', error);
        setIsSaving(false);
      }
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [
    data.authorName, data.authorCpf, data.authorRg, data.authorBirthDate,
    data.childName, data.childBirthDate, data.fatherName, data.eventDate,
    data.profile, data.eventType, data.hasRa, data.raProtocol,
    data.landOwnerName, data.landOwnerCpf, data.landOwnershipType,
    data.ruralPeriods, data.urbanPeriods, data.salarioMinimoRef,
    data.manualBenefits, data.petitionType,
  ]);

  // ✅ CORREÇÃO #3: Carregar benefícios anteriores
  useEffect(() => {
    const loadBenefitHistory = async () => {
      if (!data.caseId) return;
      
      const { data: benefits, error } = await supabase
        .from('benefit_history')
        .select('*')
        .eq('case_id', data.caseId)
        .order('start_date', { ascending: false });

      if (error) {
        console.error('[BENEFIT_HISTORY] Erro ao carregar:', error);
        return;
      }

      if (benefits && benefits.length > 0) {
        console.log('[BENEFIT_HISTORY] ✅ Carregados:', benefits.length);
        setBenefitHistory(benefits);
      }
    };

    loadBenefitHistory();
  }, [data.caseId]);

  // IA Contributiva: Validar dados básicos
  const validateWithAI = async () => {
    if (!data.caseId) return;
    
    // ✅ EXTRAIR UF DO BIRTH_CITY OU ENDEREÇO
    let cityToValidate = data.birthCity || '';
    let ufToValidate = data.birthState || '';
    
    // Se birth_city tem formato "Cidade-UF", extrair
    if (!ufToValidate && cityToValidate) {
      const match = cityToValidate.match(/([^-/]+)[\s-/]*(RO|AC|AM|RR|PA|AP|TO|MA|PI|CE|RN|PB|PE|AL|SE|BA|MG|ES|RJ|SP|PR|SC|RS|MS|MT|GO|DF)/i);
      if (match) {
        cityToValidate = match[1].trim();
        ufToValidate = match[2]?.toUpperCase() || '';
      }
    }
    
    // Se ainda não tem UF, tentar extrair do endereço
    if (!ufToValidate && data.authorAddress) {
      const addressMatch = data.authorAddress.match(/[,/-]\s*(RO|AC|AM|RR|PA|AP|TO|MA|PI|CE|RN|PB|PE|AL|SE|BA|MG|ES|RJ|SP|PR|SC|RS|MS|MT|GO|DF)/i);
      if (addressMatch) {
        ufToValidate = addressMatch[1].toUpperCase();
      }
    }
    
    if (!cityToValidate || !ufToValidate) {
      toast.error("Preencha a cidade de nascimento e o endereço completo com UF");
      return;
    }
    
    console.log('🔍 Validando jurisdição com:', { cityToValidate, ufToValidate, address: data.authorAddress });
    
    setValidatingWithAI(true);
    try {
      const { data: validation, error } = await supabase.functions.invoke('validate-jurisdiction', {
        body: { 
          city: cityToValidate, 
          uf: ufToValidate,
          address: data.authorAddress 
        }
      });

      if (!error && validation) {
        setAiValidation(validation);
        
        // ✅ SALVAR UF NO BANCO SE NÃO EXISTIR
        if (!data.birthState && ufToValidate) {
          updateData({ birthState: ufToValidate });
        }
        
        toast.success(`Jurisdição validada: ${validation.subsecao}`);
      } else {
        console.error('Erro ao validar jurisdição:', error);
        toast.error("Erro ao validar jurisdição");
      }
    } catch (err) {
      console.error('Erro na validação:', err);
      toast.error("Erro ao validar jurisdição");
    } finally {
      setValidatingWithAI(false);
    }
  };

  // Executar validação quando dados mudarem
  useEffect(() => {
    if (data.birthCity && data.authorAddress) {
      validateWithAI();
    }
  }, [data.birthCity, data.authorAddress]);

  // ✅ Carregar análise do CNIS e popular campos automaticamente
  useEffect(() => {
    const loadCnisAnalysis = async () => {
      if (!data.caseId) return;
      
      const { data: analysis } = await supabase
        .from('case_analysis')
        .select('draft_payload')
        .eq('case_id', data.caseId)
        .maybeSingle();
      
      if (analysis?.draft_payload) {
        const payload = analysis.draft_payload as any;
        const cnisAnalysis = payload.cnis_analysis;
        
        if (cnisAnalysis) {
          setCnisAnalysis(cnisAnalysis);
          
          // ✅ POPULAR PERÍODOS URBANOS AUTOMATICAMENTE DO CNIS
          if (cnisAnalysis.periodos_urbanos?.length > 0 && (!data.urbanPeriods || data.urbanPeriods.length === 0)) {
            const urbanPeriods = cnisAnalysis.periodos_urbanos.map((p: any) => ({
              startDate: p.inicio,
              endDate: p.fim,
              details: `Empregador: ${p.empregador || 'Não informado'}`
            }));
            
            updateData({ urbanPeriods });
            toast.success(`✅ ${urbanPeriods.length} período(s) urbano(s) adicionado(s) do CNIS`);
          }
          
          // ✅ POPULAR PERÍODOS RURAIS DO CNIS (mesclar com existentes)
          if (cnisAnalysis.periodos_rurais?.length > 0) {
            const ruralPeriodsFromCnis = cnisAnalysis.periodos_rurais.map((p: any) => ({
              startDate: p.inicio,
              endDate: p.fim,
              location: 'Conforme CNIS',
              activities: p.detalhes || 'Atividade rural'
            }));
            
            // Verificar se já existem períodos para não duplicar
            if (!data.ruralPeriods || data.ruralPeriods.length === 0) {
              updateData({ ruralPeriods: ruralPeriodsFromCnis });
              toast.success(`✅ ${ruralPeriodsFromCnis.length} período(s) rural(is) adicionado(s) do CNIS`);
            }
          }
        }
      }
    };
    
    loadCnisAnalysis();
  }, [data.caseId]);

  // Carregar períodos rurais E urbanos automaticamente das extrações
  useEffect(() => {
    const loadPeriodsFromExtractions = async () => {
      if (!data.caseId) return;
      // Só carregar se ainda não tem períodos
      if ((data.ruralPeriods?.length || 0) > 0 && (data.urbanPeriods?.length || 0) > 0) return;

      try {
        const { data: extractions, error } = await supabase
          .from("extractions")
          .select("*")
          .eq("case_id", data.caseId)
          .order("extracted_at", { ascending: false });

        if (error) throw error;

        let foundRuralPeriods: RuralPeriod[] = [];
        let foundUrbanPeriods: UrbanPeriod[] = [];
        
        for (const extraction of extractions || []) {
          // Buscar em periodos_rurais (campo direto)
          if (extraction.periodos_rurais && Array.isArray(extraction.periodos_rurais) && extraction.periodos_rurais.length > 0) {
            foundRuralPeriods = [...foundRuralPeriods, ...extraction.periodos_rurais as unknown as RuralPeriod[]];
          }
          
          // Buscar também em entities.ruralPeriods e entities.urbanPeriods
          if (extraction.entities && typeof extraction.entities === 'object') {
            const entities = extraction.entities as any;
            
            if (entities.ruralPeriods && Array.isArray(entities.ruralPeriods) && entities.ruralPeriods.length > 0) {
              foundRuralPeriods = [...foundRuralPeriods, ...entities.ruralPeriods];
            }
            
            if (entities.urbanPeriods && Array.isArray(entities.urbanPeriods) && entities.urbanPeriods.length > 0) {
              foundUrbanPeriods = [...foundUrbanPeriods, ...entities.urbanPeriods];
            }
          }
        }

        if (foundRuralPeriods.length > 0 || foundUrbanPeriods.length > 0) {
          console.log('[AUTO-FILL] Períodos encontrados:', {
            rural: foundRuralPeriods.length,
            urban: foundUrbanPeriods.length
          });
          
          // Mesclar com períodos existentes (não sobrescrever)
          updateData({ 
            ruralPeriods: foundRuralPeriods.length > 0 
              ? [...(data.ruralPeriods || []), ...foundRuralPeriods]
              : data.ruralPeriods,
            urbanPeriods: foundUrbanPeriods.length > 0 
              ? [...(data.urbanPeriods || []), ...foundUrbanPeriods]
              : data.urbanPeriods
          });
          
          toast.success(
            `✅ ${foundRuralPeriods.length + foundUrbanPeriods.length} período(s) carregado(s) automaticamente da autodeclaração`,
            { duration: 5000 }
          );
        }
      } catch (error) {
        console.error("Erro ao carregar períodos:", error);
      }
    };

    loadPeriodsFromExtractions();
  }, [data.caseId]);

  // Calcular histórico do salário mínimo quando a data de nascimento da criança mudar
  useEffect(() => {
    if (data.childBirthDate) {
      const birthYear = new Date(data.childBirthDate).getFullYear();
      const currentYear = new Date().getFullYear();
      const history = getSalarioMinimoHistory(birthYear, currentYear);
      const currentSalario = history[history.length - 1]?.value || 1412.00;
      
      // Calcular valor da causa (4 meses de salário-maternidade)
      const valorCausa = currentSalario * 4;
      
      updateData({ 
        salarioMinimoHistory: history,
        salarioMinimoRef: currentSalario,
        valorCausa: valorCausa
      });
    }
  }, [data.childBirthDate]);

  const addRuralPeriod = () => {
    const newPeriod: RuralPeriod = {
      startDate: "",
      endDate: "",
      location: "",
      withWhom: "",
      activities: ""
    };
    updateData({ 
      ruralPeriods: [...(data.ruralPeriods || []), newPeriod] 
    });
  };

  const removeRuralPeriod = (index: number) => {
    const updated = data.ruralPeriods?.filter((_, i) => i !== index) || [];
    updateData({ ruralPeriods: updated });
  };

  const updateRuralPeriod = (index: number, field: keyof RuralPeriod, value: string) => {
    const updated = [...(data.ruralPeriods || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ ruralPeriods: updated });
  };

  const addUrbanPeriod = () => {
    const newPeriod: UrbanPeriod = {
      startDate: "",
      endDate: "",
      details: ""
    };
    updateData({ 
      urbanPeriods: [...(data.urbanPeriods || []), newPeriod] 
    });
  };

  const removeUrbanPeriod = (index: number) => {
    const updated = data.urbanPeriods?.filter((_, i) => i !== index) || [];
    updateData({ urbanPeriods: updated });
  };

  const updateUrbanPeriod = (index: number, field: keyof UrbanPeriod, value: string) => {
    const updated = [...(data.urbanPeriods || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ urbanPeriods: updated });
  };

  // ✅ REANÁLISE INDIVIDUAL DE DOCUMENTOS
  const reanalyzeSingleDocument = async (docType: string) => {
    if (!data.caseId) return;
    
    setIsReanalyzing(true);
    toast.info(`🔄 Reprocessando ${docType}...`, { id: 'reanalyze' });
    
    try {
      // Buscar documento do tipo específico
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', data.caseId)
        .eq('document_type', docType as any)
        .order('uploaded_at', { ascending: false })
        .limit(1);
      
      if (!docs || docs.length === 0) {
        toast.error(`Nenhum documento de ${docType} encontrado`, { id: 'reanalyze' });
        setIsReanalyzing(false);
        return;
      }
      
      // Chamar analyze-single-document
      const { data: result, error } = await supabase.functions.invoke('analyze-single-document', {
        body: {
          documentId: docs[0].id,
          caseId: data.caseId,
          forceDocType: docType as any
        }
      });
      
      if (error) throw error;
      
      if (result?.extracted) {
        // Atualizar dados localmente
        if (docType === 'historico_escolar') {
          updateData({ schoolHistory: result.extracted.school_history });
          await syncWithOtherTabs();
        }
        if (docType === 'declaracao_saude_ubs') {
          updateData({ healthDeclarationUbs: result.extracted.health_declaration_ubs });
          await syncWithOtherTabs();
        }
        if (docType === 'documento_terra') {
          updateData({
            landOwnerName: result.extracted.landOwnerName,
            landOwnerCpf: result.extracted.landOwnerCpf,
            landOwnerRg: result.extracted.landOwnerRg,
            landArea: result.extracted.landArea,
            landTotalArea: result.extracted.landTotalArea,
            landExploitedArea: result.extracted.landExploitedArea,
            landPropertyName: result.extracted.landPropertyName,
            landMunicipality: result.extracted.landMunicipality,
            landITR: result.extracted.landITR,
            landCessionType: result.extracted.landCessionType,
            landOwnershipType: result.extracted.landOwnershipType
          });
          await syncWithOtherTabs();
        }
        if (docType === 'autodeclaracao_rural') {
          updateData({
            ruralPeriods: result.extracted.rural_periods || [],
            familyMembers: result.extracted.family_members || [],
            landOwnerName: result.extracted.landOwnerName || data.landOwnerName,
            landOwnerCpf: result.extracted.landOwnerCpf || data.landOwnerCpf,
            landOwnerRg: result.extracted.landOwnerRg || data.landOwnerRg
          });
          await syncWithOtherTabs();
        }
        
        toast.success(`✅ ${docType} reanalisado!`, { id: 'reanalyze' });
      }
    } catch (error) {
      console.error('Erro ao reanalisar:', error);
      toast.error('Erro ao reanalisar documento', { id: 'reanalyze' });
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleReprocessDocuments = async () => {
    if (!data.caseId) {
      toast.error("ID do caso não encontrado");
      return;
    }

    setIsReprocessing(true);
    toast.info("🔄 Re-processando documentos...", { id: 'reprocess' });

    try {
      // Buscar documentos do caso
      const { data: documents, error: docsError } = await supabase
        .from("documents")
        .select("id")
        .eq("case_id", data.caseId);

      if (docsError) throw docsError;

      if (!documents || documents.length === 0) {
        toast.error("Nenhum documento encontrado", { id: 'reprocess' });
        setIsReprocessing(false);
        return;
      }

      const documentIds = documents.map(doc => doc.id);

      toast.info(`🔄 Processando ${documentIds.length} documento(s)...`, { id: 'reprocess' });

      // Chamar edge function
      const { data: result, error } = await supabase.functions.invoke("process-documents-with-ai", {
        body: { caseId: data.caseId, documentIds }
      });

      if (error) throw error;
      
      toast.success("✅ Documentos re-processados! Sincronizando análise...", { id: 'reprocess' });
      
      // Disparar pipeline completo
      await triggerFullPipeline('Re-processamento de documentos');
      
      toast.success("✅ Tudo atualizado! Recarregando...", { id: 'reprocess' });
      
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error("Erro ao re-processar documentos:", error);
      toast.error("❌ Falha ao re-processar documentos", { id: 'reprocess' });
      setIsReprocessing(false);
    }
  };

  // ✅ SINCRONIZAÇÃO COM OUTRAS ABAS
  const syncWithOtherTabs = async () => {
    if (!data.caseId) return;
    
    // Invalidar análise
    await supabase.from('case_analysis').update({ is_stale: true }).eq('case_id', data.caseId);
    
    // Disparar evento global
    window.dispatchEvent(new CustomEvent('case-updated', { 
      detail: { caseId: data.caseId, source: 'basic_info' } 
    }));
    
    console.log('[SYNC] ✅ Abas sincronizadas');
  };

  const handleSaveSection = async () => {
    if (!data.caseId) {
      toast.error("ID do caso não encontrado");
      return;
    }

    setIsSaving(true);
    
    try {
      // 🆕 Função de limpeza robusta de datas
      const cleanDateField = (dateValue: string | undefined | null): string | null => {
        if (!dateValue || dateValue === '') return null;
        
        // Lista de valores inválidos conhecidos
        const invalidValues = [
          'N/A', 'n/a', 'Não identificado', 'não identificado',
          'Não disponível', 'não disponível', 'Não encontrado', 'não encontrado'
        ];
        
        if (invalidValues.some(invalid => dateValue.includes(invalid))) {
          console.warn(`[SAVE] Removendo valor inválido: "${dateValue}"`);
          return null;
        }
        
        // Detectar textos explicativos
        const lowerValue = dateValue.toLowerCase();
        const invalidPhrases = [
          'não é possível', 'não foi possível', 'não consta',
          'vazio', 'indisponível', 'não está', 'documento não contém'
        ];
        
        if (invalidPhrases.some(phrase => lowerValue.includes(phrase))) {
          console.warn(`[SAVE] Removendo texto explicativo: "${dateValue}"`);
          return null;
        }
        
        // Validar formato YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateValue)) {
          console.warn(`[SAVE] Formato inválido: "${dateValue}"`);
          return null;
        }
        
        // Validar se é uma data real
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          console.warn(`[SAVE] Data inválida: "${dateValue}"`);
          return null;
        }
        
        return dateValue;
      };

      // Atualizar caso no banco COM VALIDAÇÃO
      const { error } = await supabase
        .from('cases')
        .update({
          author_name: data.authorName,
          author_cpf: data.authorCpf,
          author_rg: data.authorRg,
          author_birth_date: cleanDateField(data.authorBirthDate),
          author_marital_status: data.authorMaritalStatus,
          author_address: data.authorAddress,
          child_name: data.childName,
          child_birth_date: cleanDateField(data.childBirthDate),
          father_name: data.fatherName,
          event_date: cleanDateField(data.eventDate),
          profile: data.profile,
          petition_type: data.petitionType,
          rural_periods: data.ruralPeriods as any,
          urban_periods: data.urbanPeriods as any,
          land_owner_name: data.landOwnerName,
          land_owner_cpf: data.landOwnerCpf,
          land_owner_rg: data.landOwnerRg,
          land_ownership_type: data.landOwnershipType,
          land_property_name: data.landPropertyName,
          land_municipality: data.landMunicipality,
          land_area: data.landArea,
          land_total_area: data.landTotalArea,
          land_exploited_area: data.landExploitedArea,
          land_cession_type: data.landCessionType,
          land_itr: data.landITR,
          rural_activities_planting: data.ruralActivitiesPlanting,
          rural_activities_breeding: data.ruralActivitiesBreeding,
          rural_activity_since: cleanDateField(data.ruralActivitySince),
          school_history: data.schoolHistory as any,
          health_declaration_ubs: data.healthDeclarationUbs as any,
          has_ra: data.hasRa,
          ra_protocol: data.raProtocol,
          ra_request_date: cleanDateField(data.raRequestDate),
          ra_denial_date: cleanDateField(data.raDenialDate),
          ra_denial_reason: data.raDenialReason,
          spouse_name: data.spouseName,
          spouse_cpf: data.spouseCpf,
          marriage_date: cleanDateField(data.marriageDate),
          nit: data.nit,
          birth_city: data.birthCity,
          birth_state: data.birthState,
          special_notes: data.specialNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.caseId);

      if (error) throw error;
      
      toast.success("✅ Dados salvos com sucesso!");
      
      // Disparar pipeline completo para sincronizar com todas as abas
      toast.info('🔄 Sincronizando com análise, jurisprudência e petição...', { 
        id: 'sync',
        duration: 10000 
      });

      await triggerFullPipeline('Informações básicas atualizadas');

      toast.success('✅ Tudo sincronizado! Validação, análise, jurisprudência e petição atualizadas.', { 
        id: 'sync',
        duration: 5000 
      });
      
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("❌ Falha ao salvar informações");
    } finally {
      setIsSaving(false);
    }
  };

  // Alertas para campos críticos vazios
  const criticalFieldsEmpty = {
    childName: !data.childName,
    childBirthDate: !data.childBirthDate,
    authorName: !data.authorName,
    authorCpf: !data.authorCpf,
  };

  const hasCriticalMissing = Object.values(criticalFieldsEmpty).some(v => v);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Informações Básicas</h2>
          <p className="text-muted-foreground">
            Revise e complete os dados extraídos dos documentos
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isSaving && (
            <Badge variant="outline" className="animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Salvando...
            </Badge>
          )}
          {!isSaving && (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Tudo salvo
            </Badge>
          )}
          
          {data.caseId && (
            <Button 
              onClick={handleReprocessDocuments}
              variant="outline"
              className="gap-2"
              disabled={isReprocessing}
            >
              <RefreshCw className={`h-4 w-4 ${isReprocessing ? 'animate-spin' : ''}`} />
              {isReprocessing ? "Re-processando..." : "Re-processar Documentos"}
            </Button>
          )}
        </div>
      </div>

      {/* ALERTA DE CAMPOS CRÍTICOS FALTANTES */}
      {hasCriticalMissing && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Atenção! Campos críticos não preenchidos</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ml-4 mt-2">
              {criticalFieldsEmpty.childName && <li>Nome da criança está vazio (verifique certidão de nascimento)</li>}
              {criticalFieldsEmpty.childBirthDate && <li>Data de nascimento da criança está vazia</li>}
              {criticalFieldsEmpty.authorName && <li>Nome da autora/mãe está vazio</li>}
              {criticalFieldsEmpty.authorCpf && <li>CPF da autora/mãe está vazio</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* IA CONTRIBUTIVA: VALIDAÇÃO DE DADOS */}
      {aiValidation && (
        <Alert className={
          aiValidation.confianca === 'alta' ? 'border-green-500 bg-green-50' :
          aiValidation.confianca === 'media' ? 'border-yellow-500 bg-yellow-50' :
          'border-red-500 bg-red-50'
        }>
          <Brain className={`h-4 w-4 ${
            aiValidation.confianca === 'alta' ? 'text-green-600' :
            aiValidation.confianca === 'media' ? 'text-yellow-600' :
            'text-red-600'
          }`} />
          <AlertTitle className="font-semibold flex items-center gap-2">
            🤖 IA Contributiva
            <Badge variant={
              aiValidation.confianca === 'alta' ? 'default' :
              aiValidation.confianca === 'media' ? 'secondary' :
              'destructive'
            }>
              Confiança: {aiValidation.confianca}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            {aiValidation.confianca === 'alta' ? (
              <div className="text-green-800">
                <p className="font-semibold">✅ Dados validados com sucesso!</p>
                <div className="mt-2 text-sm">
                  <p><strong>Jurisdição:</strong> {aiValidation.subsecao}/{aiValidation.uf}</p>
                  {aiValidation.observacao && (
                    <p className="mt-1"><strong>Observação:</strong> {aiValidation.observacao}</p>
                  )}
                  {aiValidation.fonte && aiValidation.fonte !== 'dados do caso' && (
                    <p className="mt-2 text-xs">
                      <strong>Fonte:</strong>{' '}
                      <a 
                        href={aiValidation.fonte} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {aiValidation.fonte}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className={aiValidation.confianca === 'media' ? 'text-yellow-800' : 'text-red-800'}>
                <p className="font-semibold">
                  {aiValidation.confianca === 'media' ? '⚠️ ' : '🔴 '}
                  {aiValidation.observacao || 'Dados precisam de verificação'}
                </p>
                <div className="mt-2 text-sm">
                  {aiValidation.subsecao && (
                    <p><strong>Jurisdição sugerida:</strong> {aiValidation.subsecao}/{aiValidation.uf}</p>
                  )}
                </div>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ✅ CORREÇÃO #3: SEÇÃO DE BENEFÍCIOS ANTERIORES */}
      {benefitHistory.length > 0 && (
        <Alert className="border-blue-500 bg-blue-50">
          <FileText className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900 font-semibold">
            📋 Histórico de Benefícios Anteriores ({benefitHistory.length})
          </AlertTitle>
          <AlertDescription className="text-blue-800 mt-3">
            <div className="space-y-3">
              {benefitHistory.map((benefit, idx) => {
                const isOverlapping = data.childBirthDate && benefit.end_date &&
                  Math.abs(
                    new Date(benefit.end_date).getTime() - 
                    new Date(data.childBirthDate).getTime()
                  ) < 120 * 24 * 60 * 60 * 1000; // 120 dias

                return (
                  <Card key={idx} className={`p-4 ${isOverlapping ? 'border-red-500 bg-red-50' : 'bg-white'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-mono">
                            NB {benefit.nb}
                          </Badge>
                          <Badge variant={benefit.status === 'concedido' ? 'default' : 'secondary'}>
                            {benefit.status}
                          </Badge>
                          {isOverlapping && (
                            <Badge variant="destructive" className="text-xs">
                              ⚠️ Mesmo evento
                            </Badge>
                          )}
                        </div>
                        <p className="font-semibold text-sm">{benefit.benefit_type}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Período: {benefit.start_date || 'Não informado'} até {benefit.end_date || 'atual'}
                        </p>
                      </div>
                    </div>
                    {isOverlapping && (
                      <Alert className="mt-3 border-red-500 bg-red-100">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-xs text-red-900">
                          <strong>⚠️ ATENÇÃO:</strong> Este benefício pode estar relacionado ao mesmo evento de parto.
                          Risco de indeferimento por duplicidade. Verificar com cuidado na análise jurídica.
                        </AlertDescription>
                      </Alert>
                    )}
                  </Card>
                );
              })}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* SEÇÃO 1: IDENTIFICAÇÃO DA AUTORA (MÃE) */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Identificação da Autora (Mãe)
        </h3>
        
        {/* ✅ CORREÇÃO #7: Alerta visual para campos críticos faltantes */}
        {hasCriticalMissingFields && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ Dados críticos não encontrados!</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ml-4 mt-2 space-y-1">
                {!data.authorRg && <li><strong>RG da autora:</strong> Verifique se a procuração foi enviada e re-processe os documentos</li>}
                {!data.authorCpf && <li><strong>CPF da autora:</strong> Campo obrigatório não preenchido</li>}
                {!data.authorAddress && <li><strong>Endereço da autora:</strong> Necessário para a petição</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="authorName">
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <FieldBadge fieldName="authorName" />
            </div>
            <Input
              id="authorName"
              value={data.authorName}
              onChange={(e) => updateData({ authorName: e.target.value })}
              placeholder="Maria da Silva"
              className={isAutoFilled('authorName') ? 'border-green-500' : ''}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="authorCpf">
                CPF <span className="text-destructive">*</span>
              </Label>
              <FieldBadge fieldName="authorCpf" />
            </div>
            <Input
              id="authorCpf"
              value={data.authorCpf}
              onChange={(e) => updateData({ authorCpf: e.target.value })}
              placeholder="000.000.000-00"
              maxLength={14}
              className={isAutoFilled('authorCpf') ? 'border-green-500' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorRg">RG</Label>
            <Input
              id="authorRg"
              value={data.authorRg || ""}
              onChange={(e) => updateData({ authorRg: e.target.value })}
              placeholder="12.345.678-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorBirthDate">Data de Nascimento</Label>
            <Input
              id="authorBirthDate"
              type="date"
              value={data.authorBirthDate || ""}
              onChange={(e) => updateData({ authorBirthDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorMaritalStatus">Estado Civil *</Label>
            <Select
              value={data.authorMaritalStatus || ""}
              onValueChange={(value) => updateData({ authorMaritalStatus: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solteira">Solteira</SelectItem>
                <SelectItem value="casada">Casada</SelectItem>
                <SelectItem value="uniao_estavel">União Estável</SelectItem>
                <SelectItem value="divorciada">Divorciada</SelectItem>
                <SelectItem value="viuva">Viúva</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="authorAddress" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Endereço Completo
          </Label>
          <Textarea
            id="authorAddress"
            value={data.authorAddress || ""}
            onChange={(e) => updateData({ authorAddress: e.target.value })}
            placeholder="Rua/Sítio, número, bairro, cidade - UF"
            rows={2}
          />
        </div>
        
        <div className="flex justify-end mt-6 pt-4 border-t">
          <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
            {isSaving ? "⏳ Salvando..." : "💾 Salvar Identificação"}
          </Button>
        </div>
      </Card>

      {/* SEÇÃO 2: DADOS DA CRIANÇA */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Dados da Criança</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="childName">Nome do Filho/Filha *</Label>
              <FieldBadge fieldName="childName" />
            </div>
            <Input
              id="childName"
              value={data.childName || ""}
              onChange={(e) => updateData({ childName: e.target.value })}
              placeholder="João da Silva"
              className={autoFilledFields.includes('childName') ? 'border-green-500' : ''}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="childBirthDate">Data de Nascimento *</Label>
              <FieldBadge fieldName="childBirthDate" />
            </div>
            <Input
              id="childBirthDate"
              type="date"
              value={data.childBirthDate || data.eventDate}
              onChange={(e) => {
                updateData({ 
                  childBirthDate: e.target.value,
                  eventDate: e.target.value 
                });
              }}
              className={autoFilledFields.includes('childBirthDate') ? 'border-green-500' : ''}
            />
            <p className="text-xs text-muted-foreground">
              Esta é a "Data do Evento"
            </p>
          </div>
          
          <div className="space-y-2 col-span-2">
            <Label htmlFor="fatherName">Nome do Pai</Label>
            <Input
              id="fatherName"
              value={data.fatherName || ""}
              onChange={(e) => updateData({ fatherName: e.target.value })}
              placeholder="José da Silva"
            />
          </div>
        </div>
        
        <div className="flex justify-end mt-6 pt-4 border-t">
          <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
            {isSaving ? "⏳ Salvando..." : "💾 Salvar Dados da Criança"}
          </Button>
        </div>
      </Card>

      {/* SEÇÃO CNIS - CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CNIS - Cadastro Nacional de Informações Sociais
          </h3>
        </div>
        
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Importância do CNIS</AlertTitle>
          <AlertDescription>
            Se o CNIS estiver vazio, isso REFORÇA que a autora não teve vínculos urbanos e comprova a condição de segurada especial rural.
            Se houver períodos no CNIS, eles serão analisados automaticamente.
          </AlertDescription>
        </Alert>

        {/* Análise do CNIS (se existir) */}
        {data.cnisAnalysis && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <h4 className="font-semibold mb-2">Análise do CNIS</h4>
              
              {/* Períodos Urbanos */}
              {data.cnisAnalysis.periodos_urbanos && data.cnisAnalysis.periodos_urbanos.length > 0 && (
                <div className="mb-4">
                  <Label className="text-sm font-semibold">Períodos Urbanos Identificados</Label>
                  <div className="space-y-2 mt-2">
                    {data.cnisAnalysis.periodos_urbanos.map((periodo: any, idx: number) => (
                      <Card key={idx} className="p-3 bg-blue-50 dark:bg-blue-950">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{periodo.empregador}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(periodo.inicio).toLocaleDateString('pt-BR')} até {new Date(periodo.fim).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <Badge>{calcularTempo(periodo.inicio, periodo.fim)}</Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Períodos Rurais no CNIS */}
              {data.cnisAnalysis.periodos_rurais && data.cnisAnalysis.periodos_rurais.length > 0 && (
                <div className="mb-4">
                  <Label className="text-sm font-semibold">Períodos Rurais Reconhecidos pelo INSS</Label>
                  <div className="space-y-2 mt-2">
                    {data.cnisAnalysis.periodos_rurais.map((periodo: any, idx: number) => (
                      <Card key={idx} className="p-3 bg-green-50 dark:bg-green-950">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm">{periodo.detalhes}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(periodo.inicio).toLocaleDateString('pt-BR')} até {new Date(periodo.fim).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-green-100 dark:bg-green-900">
                            {calcularTempo(periodo.inicio, periodo.fim)}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Benefícios Anteriores */}
              {data.cnisAnalysis.beneficios_anteriores && data.cnisAnalysis.beneficios_anteriores.length > 0 && (
                <div className="mb-4">
                  <Label className="text-sm font-semibold">Benefícios Anteriores de Maternidade</Label>
                  <Alert className="mt-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      Encontrados {data.cnisAnalysis.beneficios_anteriores.length} benefício(s) anterior(es) de salário-maternidade.
                      Isso COMPROVA atividade rural reconhecida pelo INSS!
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2 mt-2">
                    {data.cnisAnalysis.beneficios_anteriores.map((beneficio: any, idx: number) => (
                      <Card key={idx} className="p-3">
                        <p className="text-sm">
                          <strong>{beneficio.tipo}</strong> em {new Date(beneficio.data).toLocaleDateString('pt-BR')}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Tempo Reconhecido */}
              {data.cnisAnalysis.tempo_reconhecido_inss && (
                <div>
                  <Label className="text-sm font-semibold">Tempo Total Reconhecido pelo INSS</Label>
                  <Card className="p-3 mt-2 bg-primary/5">
                    <p className="text-lg font-bold">
                      {data.cnisAnalysis.tempo_reconhecido_inss.anos} anos e {data.cnisAnalysis.tempo_reconhecido_inss.meses} meses
                    </p>
                  </Card>
                </div>
              )}

              {/* CNIS Vazio - Reforço */}
              {(!data.cnisAnalysis.periodos_urbanos || data.cnisAnalysis.periodos_urbanos.length === 0) &&
               (!data.cnisAnalysis.periodos_rurais || data.cnisAnalysis.periodos_rurais.length === 0) && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>CNIS Vazio - Ponto Forte do Caso</AlertTitle>
                  <AlertDescription>
                    A ausência de vínculos no CNIS REFORÇA a condição de segurada especial rural, 
                    demonstrando que a autora exerceu exclusivamente atividade rural em regime de economia familiar.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* SEÇÃO 3: PERFIL DA SEGURADA */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Perfil da Segurada</h3>
        <RadioGroup
          value={data.profile}
          onValueChange={(value: "especial" | "urbana") =>
            updateData({ profile: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="especial" id="especial" />
            <Label htmlFor="especial" className="font-normal cursor-pointer">
              Segurada Especial (Rural/Economia Familiar)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="urbana" id="urbana" />
            <Label htmlFor="urbana" className="font-normal cursor-pointer">
              Segurada Urbana
            </Label>
          </div>
        </RadioGroup>
        
        <div className="flex justify-end mt-6 pt-4 border-t">
          <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
            {isSaving ? "⏳ Salvando..." : "💾 Salvar Perfil"}
          </Button>
        </div>
      </Card>

      {/* NOVO: Histórico Escolar */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold">Histórico Escolar</h3>
            {data.schoolHistory && data.schoolHistory.length > 0 ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Analisado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                <AlertCircle className="h-3 w-3 mr-1" /> Pendente
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {data.schoolHistory && data.schoolHistory.length > 0 && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => reanalyzeSingleDocument('historico_escolar')}
                disabled={isReanalyzing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                Reanalisar Documento
              </Button>
            )}
            
            {/* ✅ Botão para buscar documento existente e analisar */}
            {(!data.schoolHistory || data.schoolHistory.length === 0) && (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={async () => {
                  const { data: docs } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('case_id', data.caseId)
                    .eq('document_type', 'historico_escolar' as any)
                    .order('uploaded_at', { ascending: false })
                    .limit(1);
                  
                  if (docs && docs.length > 0) {
                    await reanalyzeSingleDocument('historico_escolar');
                  } else {
                    toast.info('Nenhum histórico escolar encontrado. Faça o upload primeiro.');
                  }
                }}
                disabled={isReanalyzing}
              >
                <FileText className="h-4 w-4 mr-2" />
                Analisar Documento Existente
              </Button>
            )}
          </div>
        </div>
        
        {data.caseId && (
          <DocumentUploadInline 
            caseId={data.caseId}
            suggestedDocType="historico_escolar"
            onUploadComplete={async () => {
              toast.success("Documento enviado! Aguarde processamento...");
              setTimeout(() => window.location.reload(), 3000);
            }}
          />
        )}

        {(!data.schoolHistory || data.schoolHistory.length === 0) ? (
          <Alert className="border-orange-400">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">Histórico escolar não adicionado</p>
              <p className="text-sm">Se houver histórico de escola rural, adicione o documento acima ou cole o texto abaixo:</p>
              <div className="mt-3">
                <PasteDataInline 
                  extractionType="historico_escolar"
                  placeholder="Cole o texto do histórico escolar ou CTRL+V um print..."
                  onDataExtracted={(extractedData) => {
                    const newHistory = extractedData.school_history || [];
                    updateData({
                      schoolHistory: [...(data.schoolHistory || []), ...newHistory]
                    });
                  }}
                />
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            {data.schoolHistory.map((period: any, index: number) => (
              <Card key={index} className="p-3 bg-purple-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <p className="font-medium">{period.instituicao}</p>
                    <p className="text-sm text-muted-foreground">
                      {period.serie_ano} • {period.periodo_inicio} a {period.periodo_fim}
                    </p>
                    <p className="text-sm">
                      <Badge variant="outline">{period.localizacao}</Badge>
                    </p>
                    {period.observacoes && (
                      <p className="text-xs text-muted-foreground">{period.observacoes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newHistory = [...(data.schoolHistory || [])];
                      newHistory.splice(index, 1);
                      updateData({ schoolHistory: newHistory });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t">
          <Button onClick={handleSaveSection} disabled={isSaving}>
            {isSaving ? "⏳ Salvando..." : "💾 Salvar Histórico Escolar"}
          </Button>
        </div>
      </Card>

      {/* NOVO: Declaração de Saúde UBS */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold">Declaração de Saúde (UBS)</h3>
            {data.healthDeclarationUbs && Object.keys(data.healthDeclarationUbs).length > 0 ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Analisado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                <AlertCircle className="h-3 w-3 mr-1" /> Pendente
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {data.healthDeclarationUbs && Object.keys(data.healthDeclarationUbs).length > 0 && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => reanalyzeSingleDocument('declaracao_saude_ubs')}
                disabled={isReanalyzing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                Reanalisar Documento
              </Button>
            )}
            
            {/* ✅ Botão para buscar documento existente e analisar */}
            {(!data.healthDeclarationUbs || Object.keys(data.healthDeclarationUbs).length === 0) && (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={async () => {
                  const { data: docs } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('case_id', data.caseId)
                    .eq('document_type', 'declaracao_saude_ubs' as any)
                    .order('uploaded_at', { ascending: false })
                    .limit(1);
                  
                  if (docs && docs.length > 0) {
                    await reanalyzeSingleDocument('declaracao_saude_ubs');
                  } else {
                    toast.info('Nenhum documento de declaração de saúde encontrado. Faça o upload primeiro.');
                  }
                }}
                disabled={isReanalyzing}
              >
                <FileText className="h-4 w-4 mr-2" />
                Analisar Documento Existente
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {data.caseId && (
            <DocumentUploadInline 
              caseId={data.caseId}
              suggestedDocType="declaracao_saude_ubs"
              onUploadComplete={async () => {
                toast.success("Documento enviado! Aguarde processamento...");
                setTimeout(() => window.location.reload(), 3000);
              }}
            />
          )}
        </div>

        {(!data.healthDeclarationUbs || Object.keys(data.healthDeclarationUbs).length === 0) ? (
          <Alert className="border-orange-400">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-2">Declaração de saúde não adicionada</p>
              <p className="text-sm">Se houver declaração de UBS rural, adicione o documento acima ou cole o texto abaixo:</p>
              <div className="mt-3">
                <PasteDataInline 
                  extractionType="declaracao_saude_ubs"
                  placeholder="Cole o texto da declaração de saúde ou CTRL+V um print..."
                  onDataExtracted={(extractedData) => {
                    updateData({
                      healthDeclarationUbs: extractedData.health_declaration_ubs || {}
                    });
                  }}
                />
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Unidade de Saúde</Label>
                <p className="text-sm">{data.healthDeclarationUbs.unidade_saude || 'Não informado'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Atendimento desde</Label>
                <p className="text-sm">{data.healthDeclarationUbs.tratamento_desde || 'Não informado'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Tipo de Tratamento</Label>
                <p className="text-sm">{data.healthDeclarationUbs.tipo_tratamento || 'Não informado'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Localização</Label>
                <p className="text-sm">
                  <Badge variant="outline">{data.healthDeclarationUbs.localizacao_ubs || 'Não informado'}</Badge>
                </p>
              </div>
              {data.healthDeclarationUbs.observacoes && (
                <div className="col-span-2">
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-xs text-muted-foreground">{data.healthDeclarationUbs.observacoes}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateData({ healthDeclarationUbs: {} })}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir Declaração
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4 pt-4 border-t">
          <Button onClick={handleSaveSection} disabled={isSaving}>
            {isSaving ? "⏳ Salvando..." : "💾 Salvar Declaração de Saúde"}
          </Button>
        </div>
      </Card>

      {/* SEÇÃO 4: PROPRIETÁRIO DA TERRA (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Proprietário da Terra</h3>
          
          <div className="space-y-4">
            <div>
              <Label>Tipo de Propriedade *</Label>
              <RadioGroup
                value={data.landOwnershipType || ""}
                onValueChange={(value: "propria" | "terceiro") =>
                  updateData({ landOwnershipType: value })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="propria" id="propria" />
                  <Label htmlFor="propria" className="font-normal cursor-pointer">
                    Terra Própria
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="terceiro" id="terceiro" />
                  <Label htmlFor="terceiro" className="font-normal cursor-pointer">
                    Terra de Terceiro
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {data.landOwnershipType === 'terceiro' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="landOwnerName">Nome do Proprietário *</Label>
                  <Input
                    id="landOwnerName"
                    value={data.landOwnerName || ""}
                    onChange={(e) => updateData({ landOwnerName: e.target.value })}
                    placeholder="Nome do proprietário"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landOwnerCpf">CPF do Proprietário</Label>
                  <Input
                    id="landOwnerCpf"
                    value={data.landOwnerCpf || ""}
                    onChange={(e) => updateData({ landOwnerCpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landOwnerRg">RG do Proprietário</Label>
                  <Input
                    id="landOwnerRg"
                    value={data.landOwnerRg || ""}
                    onChange={(e) => updateData({ landOwnerRg: e.target.value })}
                    placeholder="12.345.678-9"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* SEÇÃO 4.5: DADOS DA TERRA (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6 bg-green-50/50 dark:bg-green-950/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-green-600" />
              <h3 className="text-xl font-semibold">Dados da Terra / Propriedade Rural</h3>
              {(data.landArea || data.landPropertyName || data.landMunicipality) ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Extraído
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  <AlertCircle className="h-3 w-3 mr-1" /> Pendente
                </Badge>
              )}
            </div>
            
            <div className="flex gap-2">
              {(data.landArea || data.landPropertyName || data.landMunicipality) && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => reanalyzeSingleDocument('documento_terra')}
                  disabled={isReanalyzing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                  Reanalisar Documento
                </Button>
              )}
              
              {(!data.landArea && !data.landPropertyName && !data.landMunicipality) && (
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={async () => {
                    const { data: docs } = await supabase
                      .from('documents')
                      .select('id')
                      .eq('case_id', data.caseId)
                      .eq('document_type', 'documento_terra' as any)
                      .order('uploaded_at', { ascending: false })
                      .limit(1);
                    
                    if (docs && docs.length > 0) {
                      await reanalyzeSingleDocument('documento_terra');
                    } else {
                      toast.info('Nenhum documento da terra encontrado. Faça o upload primeiro.');
                    }
                  }}
                  disabled={isReanalyzing}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Analisar Documento Existente
                </Button>
              )}
            </div>
          </div>
          
          {/* Alerta se dados da terra não foram extraídos COM UPLOAD INLINE */}
          {(!data.landArea && !data.landPropertyName && !data.landMunicipality) && (
            <Alert className="mb-4 border-orange-500">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle>Dados da terra não extraídos</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>As informações da propriedade rural não foram extraídas automaticamente dos documentos.</p>
                <p className="text-sm font-medium">Você pode:</p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  <li>Preencher manualmente os campos abaixo, OU</li>
                  <li>Adicionar novamente o documento da terra (ITR, matrícula, escritura, comodato) para extração automática:</li>
                </ul>
                {data.caseId && (
                  <>
                    <DocumentUploadInline 
                      caseId={data.caseId}
                      suggestedDocType="documento_terra"
                      onUploadComplete={async () => {
                        toast.success("Documento enviado! Aguarde processamento...");
                        setTimeout(() => window.location.reload(), 3000);
                      }}
                    />
                    
                    <div className="mt-4">
                      <PasteDataInline 
                        extractionType="terra"
                        placeholder="Cole aqui o texto do documento da terra (ITR, matrícula, escritura, etc)..."
                        onDataExtracted={(extractedData) => {
                          // Atualizar os campos automaticamente
                          updateData({
                            landArea: extractedData.landArea || data.landArea,
                            landTotalArea: extractedData.landTotalArea || data.landTotalArea,
                            landExploitedArea: extractedData.landExploitedArea || data.landExploitedArea,
                            landCessionType: extractedData.landCessionType || data.landCessionType,
                            landITR: extractedData.landITR || data.landITR,
                            landPropertyName: extractedData.landPropertyName || data.landPropertyName,
                            landMunicipality: extractedData.landMunicipality || data.landMunicipality,
                            landOwnerName: extractedData.landOwnerName || data.landOwnerName,
                          });
                        }}
                      />
                    </div>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Área cedida */}
            <div className="space-y-2">
              <Label htmlFor="landArea">Área Cedida (hectares)</Label>
              <Input
                id="landArea"
                type="number"
                step="0.01"
                value={data.landArea || ""}
                onChange={(e) => updateData({ landArea: parseFloat(e.target.value) || undefined })}
                placeholder="Ex: 52.17"
              />
            </div>

            {/* Área total */}
            <div className="space-y-2">
              <Label htmlFor="landTotalArea">Área Total (hectares)</Label>
              <Input
                id="landTotalArea"
                type="number"
                step="0.01"
                value={data.landTotalArea || ""}
                onChange={(e) => updateData({ landTotalArea: parseFloat(e.target.value) || undefined })}
                placeholder="Ex: 52.0"
              />
            </div>

            {/* Área explorada */}
            <div className="space-y-2">
              <Label htmlFor="landExploitedArea">Área Explorada (hectares)</Label>
              <Input
                id="landExploitedArea"
                type="number"
                step="0.01"
                value={data.landExploitedArea || ""}
                onChange={(e) => updateData({ landExploitedArea: parseFloat(e.target.value) || undefined })}
                placeholder="Ex: 10.0"
              />
            </div>

            {/* Forma de cessão */}
            <div className="space-y-2">
              <Label htmlFor="landCessionType">Forma de Cessão</Label>
              <Input
                id="landCessionType"
                value={data.landCessionType || ""}
                onChange={(e) => updateData({ landCessionType: e.target.value })}
                placeholder="Ex: COMODATO, Arrendamento"
              />
            </div>

            {/* Registro ITR */}
            <div className="space-y-2">
              <Label htmlFor="landITR">Registro ITR</Label>
              <Input
                id="landITR"
                value={data.landITR || ""}
                onChange={(e) => updateData({ landITR: e.target.value })}
                placeholder="NÃO POSSUI ou número do ITR"
              />
            </div>

            {/* Nome da propriedade */}
            <div className="space-y-2">
              <Label htmlFor="landPropertyName">Nome da Propriedade</Label>
              <Input
                id="landPropertyName"
                value={data.landPropertyName || ""}
                onChange={(e) => updateData({ landPropertyName: e.target.value })}
                placeholder="Ex: Sítio Santa Rita"
              />
            </div>

            {/* Município */}
            <div className="space-y-2 col-span-full">
              <Label htmlFor="landMunicipality">Município/UF do Imóvel</Label>
              <Input
                id="landMunicipality"
                value={data.landMunicipality || ""}
                onChange={(e) => updateData({ landMunicipality: e.target.value })}
                placeholder="Ex: Porto Velho/RO"
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h4 className="font-semibold mb-4">Atividades Rurais Desenvolvidas</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Atividades de plantio */}
              <div className="space-y-2">
                <Label htmlFor="ruralActivitiesPlanting">Plantio / Culturas</Label>
                <Textarea
                  id="ruralActivitiesPlanting"
                  value={data.ruralActivitiesPlanting || ""}
                  onChange={(e) => updateData({ ruralActivitiesPlanting: e.target.value })}
                  placeholder="Ex: CAFÉ, CACAU, BANANA, MANDIOCA, MILHO, ARROZ"
                  rows={3}
                />
              </div>

              {/* Atividades de criação */}
              <div className="space-y-2">
                <Label htmlFor="ruralActivitiesBreeding">Criação de Animais</Label>
                <Textarea
                  id="ruralActivitiesBreeding"
                  value={data.ruralActivitiesBreeding || ""}
                  onChange={(e) => updateData({ ruralActivitiesBreeding: e.target.value })}
                  placeholder="Ex: GALINHA E PORCO, GADO"
                  rows={3}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end mt-6 pt-4 border-t">
            <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
              {isSaving ? "⏳ Salvando..." : "💾 Salvar Dados da Terra"}
            </Button>
          </div>
        </Card>
      )}

      {/* SEÇÃO 5: PERÍODOS DE ATIVIDADE RURAL (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Tractor className="h-5 w-5 text-green-600" />
              <h3 className="text-xl font-semibold">Períodos de Atividade Rural</h3>
              {(data.ruralPeriods && data.ruralPeriods.length > 0) ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {data.ruralPeriods.length} período(s)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  <AlertCircle className="h-3 w-3 mr-1" /> Nenhum período
                </Badge>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button onClick={addRuralPeriod} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Período
              </Button>
              
              <Button 
                size="sm" 
                variant="outline"
                onClick={async () => {
                  const { data: docs } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('case_id', data.caseId)
                    .eq('document_type', 'autodeclaracao_rural' as any)
                    .order('uploaded_at', { ascending: false })
                    .limit(1);
                  
                  if (docs && docs.length > 0) {
                    await reanalyzeSingleDocument('autodeclaracao_rural');
                    toast.success('Analisando autodeclaração rural...');
                  } else {
                    toast.info('Nenhuma autodeclaração rural encontrada. Faça o upload primeiro.');
                  }
                }}
                disabled={isReanalyzing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
                Analisar Autodeclaração
              </Button>
            </div>
          </div>
          
          {/* Upload da autodeclaração rural */}
          {(!data.ruralPeriods || data.ruralPeriods.length === 0) && data.caseId && (
            <Alert className="mb-4 border-blue-400">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <p className="font-medium mb-2">Nenhum período rural cadastrado</p>
                <p className="text-sm mb-3">Adicione a autodeclaração rural para extração automática dos períodos:</p>
                <DocumentUploadInline 
                  caseId={data.caseId}
                  suggestedDocType="autodeclaracao_rural"
                  onUploadComplete={async () => {
                    toast.success("Documento enviado! Aguarde processamento...");
                    setTimeout(() => window.location.reload(), 3000);
                  }}
                />
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            {(data.ruralPeriods || []).map((period, idx) => (
              <div key={idx} className="p-4 border rounded-lg bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Período {idx + 1}</h4>
                  <Button
                    onClick={() => removeRuralPeriod(idx)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Início *</Label>
                    <Input
                      type="date"
                      value={period.startDate}
                      onChange={(e) => updateRuralPeriod(idx, 'startDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Fim (deixe vazio se ainda ativo)</Label>
                    <Input
                      type="date"
                      value={period.endDate || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'endDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label>Local (Sítio/Fazenda/Município) *</Label>
                    <Input
                      value={period.location}
                      onChange={(e) => updateRuralPeriod(idx, 'location', e.target.value)}
                      placeholder="Ex: Sítio São José, Município X - UF"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Com quem morava</Label>
                    <Input
                      value={period.withWhom || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'withWhom', e.target.value)}
                      placeholder="Ex: com minha mãe, com meu esposo"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Atividades desenvolvidas</Label>
                    <Input
                      value={period.activities || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'activities', e.target.value)}
                      placeholder="Ex: lavoura, criação de gado"
                    />
                  </div>
                </div>
              </div>
            ))}
            
            {(!data.ruralPeriods || data.ruralPeriods.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum período rural cadastrado. Clique em "Adicionar Período" para começar.
              </p>
            )}
          </div>
          
          <div className="space-y-2 mt-4">
            <Label htmlFor="familyMembers">Quem mora com ela atualmente?</Label>
            <Textarea
              id="familyMembers"
              value={
                Array.isArray(data.familyMembers) 
                  ? data.familyMembers.map((member: any) => {
                      // Se for objeto com name e relationship, formatar
                      if (typeof member === 'object' && member.name) {
                        return `${member.name} (${member.relationship || 'não especificado'})`;
                      }
                      // Se for string simples, retornar diretamente
                      return String(member);
                    }).join(', ')
                  : ""
              }
              onChange={(e) => {
                const membersText = e.target.value;
                // Salvar como array de strings simples
                const membersArray = membersText.split(',').map(m => m.trim()).filter(m => m);
                updateData({ familyMembers: membersArray as any });
              }}
              placeholder="Ex: Esposo, 2 filhos menores, sogra..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Digite os membros da família separados por vírgula
            </p>
          </div>

          <div className="flex justify-end mt-4 pt-4 border-t">
            <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
              {isSaving ? "⏳ Salvando..." : "💾 Salvar Períodos Rurais"}
            </Button>
          </div>
        </Card>
      )}

      {/* SEÇÃO 6: PERÍODOS URBANOS (se houver) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold">Períodos Urbanos (se houver)</h3>
              <p className="text-sm text-muted-foreground">Períodos em que trabalhou em zona urbana</p>
            </div>
            <Button onClick={addUrbanPeriod} size="sm" variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Período Urbano
            </Button>
          </div>
          
          <div className="space-y-4">
            {(data.urbanPeriods || []).map((period, idx) => (
              <div key={idx} className="p-4 border rounded-lg bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Período Urbano {idx + 1}</h4>
                  <Button
                    onClick={() => removeUrbanPeriod(idx)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Início *</Label>
                    <Input
                      type="date"
                      value={period.startDate}
                      onChange={(e) => updateUrbanPeriod(idx, 'startDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Fim *</Label>
                    <Input
                      type="date"
                      value={period.endDate}
                      onChange={(e) => updateUrbanPeriod(idx, 'endDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label>Detalhes (empresa, função, etc)</Label>
                    <Textarea
                      value={period.details}
                      onChange={(e) => updateUrbanPeriod(idx, 'details', e.target.value)}
                      placeholder="Ex: Trabalhou como vendedora na empresa X"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex justify-end mt-6 pt-4 border-t">
            <Button onClick={handleSaveSection} disabled={isSaving} className="gap-2">
              {isSaving ? "⏳ Salvando..." : "💾 Salvar Períodos Urbanos"}
            </Button>
          </div>
        </Card>
      )}

      {/* SEÇÃO 7: REQUERIMENTO ADMINISTRATIVO */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold">Requerimento Administrativo</h3>
          </div>
          {data.hasRa && data.caseId && (
            <DocumentUploadInline 
              caseId={data.caseId}
              suggestedDocType="processo_administrativo"
              onUploadComplete={async () => {
                toast.success("Documento enviado! Aguarde processamento...");
                setTimeout(() => window.location.reload(), 3000);
              }}
            />
          )}
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasRa"
              checked={data.hasRa}
              onCheckedChange={(checked) =>
                updateData({ hasRa: checked as boolean })
              }
            />
            <Label htmlFor="hasRa" className="cursor-pointer">
              Possui Requerimento Administrativo?
            </Label>
          </div>

          {data.hasRa && (
            <div className="space-y-4">
              {(!data.raProtocol || !data.raRequestDate || !data.raDenialDate || !data.raDenialReason) && (
                <Alert className="border-orange-400">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Dados do RA não extraídos</p>
                    <p className="text-sm">Preencha manualmente ou cole o processo administrativo abaixo:</p>
                    <div className="mt-3">
                      <PasteDataInline 
                        extractionType="processo_administrativo"
                        placeholder="Cole aqui o texto do processo administrativo (indeferimento, protocolo, etc)..."
                        onDataExtracted={(extractedData) => {
                          updateData({
                            raProtocol: extractedData.raProtocol || data.raProtocol,
                            raRequestDate: extractedData.raRequestDate || data.raRequestDate,
                            raDenialDate: extractedData.raDenialDate || data.raDenialDate,
                            raDenialReason: extractedData.raDenialReason || data.raDenialReason,
                          });
                        }}
                      />
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="raProtocol">Número do Protocolo (NB) *</Label>
                  <Input
                    id="raProtocol"
                    value={data.raProtocol || ""}
                    onChange={(e) => updateData({ raProtocol: e.target.value })}
                    placeholder="NB 000.000.000-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="raRequestDate">Data do Requerimento *</Label>
                  <Input
                    id="raRequestDate"
                    type="date"
                    value={data.raRequestDate || ""}
                    onChange={(e) => updateData({ raRequestDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="raDenialDate">Data do Indeferimento *</Label>
                  <Input
                    id="raDenialDate"
                    type="date"
                    value={data.raDenialDate || ""}
                    onChange={(e) => updateData({ raDenialDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="raDenialReason">Motivo do Indeferimento *</Label>
                <Textarea
                  id="raDenialReason"
                  value={data.raDenialReason || ""}
                  onChange={(e) => updateData({ raDenialReason: e.target.value })}
                  placeholder="Copie o motivo exato do processo administrativo..."
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>

        {data.hasRa && (
          <div className="flex justify-end mt-4 pt-4 border-t">
            <Button onClick={handleSaveSection} disabled={isSaving}>
              {isSaving ? "⏳ Salvando..." : "💾 Salvar Requerimento Administrativo"}
            </Button>
          </div>
        )}
      </Card>

      {/* BENEFÍCIOS MANUAIS */}
      <StepBasicInfoBenefits data={data} updateData={updateData} />

      {/* SEÇÃO 8: SALÁRIO MÍNIMO DE REFERÊNCIA COM HISTÓRICO */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Salário Mínimo de Referência</h3>
        
        {data.childBirthDate ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg">
              <div>
                <Label className="text-sm text-muted-foreground">Ano de Nascimento da Criança</Label>
                <p className="text-lg font-semibold">{new Date(data.childBirthDate).getFullYear()}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Salário Mínimo em {new Date(data.childBirthDate).getFullYear()}</Label>
                <p className="text-lg font-semibold">
                  R$ {getSalarioMinimoByDate(data.childBirthDate).toFixed(2)}
                </p>
              </div>
            </div>

            <div>
              <Label className="font-semibold mb-2 block">Projeção até {new Date().getFullYear()}:</Label>
              <div className="bg-muted/50 p-4 rounded-lg max-h-60 overflow-y-auto">
                <div className="space-y-1">
                  {(data.salarioMinimoHistory || []).map(item => (
                    <div key={item.year} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-sm">{item.year}</span>
                      <span className="font-mono text-sm font-medium">R$ {item.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <Label className="text-sm text-muted-foreground block mb-1">Salário Mínimo Atual ({new Date().getFullYear()})</Label>
              <p className="text-2xl font-bold text-primary">
                R$ {data.salarioMinimoRef.toFixed(2)}
              </p>
            </div>

            {/* VALOR DA CAUSA */}
            {data.valorCausa && (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border-2 border-green-200 dark:border-green-800 mt-4">
                <Label className="text-sm text-muted-foreground block mb-1">
                  Valor da Causa Estimado (4 meses de salário-maternidade)
                </Label>
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                  R$ {data.valorCausa.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cálculo: R$ {data.salarioMinimoRef.toFixed(2)} × 4 meses
                </p>
              </div>
            )}
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Preencha a data de nascimento da criança para calcular o histórico do salário mínimo
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
};
