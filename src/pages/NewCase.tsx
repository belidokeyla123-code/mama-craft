import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, FileText, MessageSquare, FileEdit, Gavel, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StepValidation } from "@/components/wizard/StepValidation";
import { StepAnalysis } from "@/components/wizard/StepAnalysis";
import { StepJurisprudence } from "@/components/wizard/StepJurisprudence";
import { StepTeseJuridica } from "@/components/wizard/StepTeseJuridica";
import { StepDraft } from "@/components/wizard/StepDraft";
import { toast } from "sonner";
import { useCasePipeline } from "@/hooks/useCasePipeline";
import { useChatSync } from "@/hooks/useChatSync";

export interface RuralPeriod {
  startDate: string;
  endDate?: string;
  location: string;
  withWhom?: string;
  activities?: string;
}

export interface UrbanPeriod {
  startDate: string;
  endDate: string;
  details: string;
}

export interface SchoolPeriod {
  instituicao: string;
  periodo_inicio: string;
  periodo_fim: string;
  serie_ano: string;
  localizacao: string;
  observacoes?: string;
}

export interface HealthDeclarationUbs {
  unidade_saude?: string;
  tratamento_desde?: string;
  tipo_tratamento?: string;
  localizacao_ubs?: string;
  observacoes?: string;
}

export interface CaseData {
  // Identificação da autora
  authorName: string;
  authorCpf: string;
  authorRg?: string;
  authorBirthDate?: string;
  authorAddress?: string;
  authorMaritalStatus?: string;
  
  // Dados da criança
  childName?: string;
  childBirthDate?: string;
  fatherName?: string;
  
  // Dados do cônjuge
  spouseName?: string;
  spouseCpf?: string;
  marriageDate?: string;
  
  // Dados previdenciários
  nit?: string;
  birthCity?: string;
  birthState?: string;
  
  // Evento
  eventType: "parto" | "adocao" | "guarda";
  eventDate: string;
  
  // Perfil
  profile: "especial" | "urbana";
  
  // Tipo de peça
  petitionType?: string;
  
  // Proprietário da terra
  landOwnerName?: string;
  landOwnerCpf?: string;
  landOwnerRg?: string;
  landOwnershipType?: "propria" | "terceiro";
  
  // Dados detalhados da terra
  landArea?: number;
  landTotalArea?: number;
  landExploitedArea?: number;
  landITR?: string;
  landPropertyName?: string;
  landMunicipality?: string;
  landCessionType?: string;
  
  // Atividades rurais detalhadas
  ruralActivitiesPlanting?: string;
  ruralActivitiesBreeding?: string;
  
  // Atividade rural (agora com períodos estruturados)
  ruralActivitySince?: string;
  ruralPeriods?: RuralPeriod[];
  urbanPeriods?: UrbanPeriod[];
  familyMembers?: string[];
  
  // Novos campos para histórico escolar e declaração de saúde
  schoolHistory?: SchoolPeriod[];
  healthDeclarationUbs?: HealthDeclarationUbs;
  
  // RA
  hasRa: boolean;
  raProtocol?: string;
  raRequestDate?: string;
  raDenialDate?: string;
  raDenialReason?: string;
  
  // Exceções/Situações Especiais
  specialNotes?: string;
  hasSpecialSituation?: boolean;
  exceptions?: Array<{
    type: string;
    description: string;
    voiceTranscribed: boolean;
  }>;
  
  // Referência
  salarioMinimoRef: number;
  salarioMinimoHistory?: Array<{ year: number; value: number }>;
  valorCausa?: number;
  
  // Documentos
  documents: File[];
  
  // Outros dados gerados pelo processo
  caseId?: string;
  validationScore?: number;
  isDocSufficient?: boolean;
  extractedData?: any;
  missingFields?: string[];
  autoFilledFields?: string[];
  
  // Análise do CNIS
  cnisAnalysis?: {
    periodos_urbanos?: Array<{inicio: string; fim: string; empregador: string}>;
    periodos_rurais?: Array<{inicio: string; fim: string; detalhes: string}>;
    beneficios_anteriores?: Array<{tipo: string; data: string}>;
    tempo_reconhecido_inss?: {anos: number; meses: number};
  };
  
  // Benefícios manuais (adicionados pelo usuário)
  manualBenefits?: Array<{
    inicio: string;      // YYYY-MM-DD
    fim: string;         // YYYY-MM-DD
    tipo: string;        // Ex: "Salário-maternidade", "Auxílio-doença rural"
    numero_beneficio?: string; // Opcional
  }>;
  
  // Dados do Chat Inteligente
  chatAnalysis?: any;
  chatCompleted?: boolean;
  documentUrls?: string[];  // URLs dos documentos no storage
  
  // Dados da Análise
  analysisReport?: any;
  
  // Dados da Jurisprudência
  jurisprudenceData?: any;
  
  // Dados da Tese
  thesisData?: any;
  
  // Minuta
  minuta?: string;
  
  // Diagnóstico JUIZ
  diagnosticoJuiz?: any;
}

const STEPS = [
  { id: 0, name: "Validação" },
  { id: 1, name: "Análise" },
  { id: 2, name: "Jurisprudência" },
  { id: 3, name: "Teses" },
  { id: 4, name: "Minuta" },
];

const NewCase = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0); // Começa no chat
  const [caseData, setCaseData] = useState<CaseData>({
    authorName: "",
    authorCpf: "",
    eventType: "parto",
    eventDate: "",
    profile: "especial",
    petitionType: "peticao_inicial",
    hasRa: false,
    salarioMinimoRef: 1412.00,
    ruralPeriods: [],
    urbanPeriods: [],
    salarioMinimoHistory: [],
    documents: [],
  });

  // ✅ FASE 2: Hook de pipeline centralizado
  const { status, isStale, checkPipelineStatus } = useCasePipeline(caseData.caseId || '');

  // ✅ FASE 2: Hook de sincronização em tempo real
  useChatSync(caseData.caseId || '');

  const progress = ((currentStep) / (STEPS.length - 1)) * 100;

  // Atualizar status quando mudar de aba ou caseId
  useEffect(() => {
    if (caseData.caseId) {
      checkPipelineStatus();
    }
  }, [currentStep, caseData.caseId]);

  // ✅ FASE 2: Escutar evento global de sincronização e refazer query
  useEffect(() => {
    const handleCaseUpdate = (e: CustomEvent) => {
      console.log('[NewCase] 📡 Caso atualizado via chat, atualizando dados...', e.detail);
      checkPipelineStatus();
      
      // Atualizar dados locais do caso
      if (e.detail?.data) {
        setCaseData(prev => ({ ...prev, ...e.detail.data }));
      }
    };
    
    const handleDocumentsUpdate = () => {
      console.log('[NewCase] 📄 Documentos atualizados, refazendo validação...');
      checkPipelineStatus();
    };

    const handleAnalysisUpdate = () => {
      console.log('[NewCase] 📊 Análise atualizada, refazendo queries...');
      checkPipelineStatus();
    };
    
    window.addEventListener('case-updated', handleCaseUpdate as any);
    window.addEventListener('documents-updated', handleDocumentsUpdate as any);
    window.addEventListener('analysis-updated', handleAnalysisUpdate as any);
    
    return () => {
      window.removeEventListener('case-updated', handleCaseUpdate as any);
      window.removeEventListener('documents-updated', handleDocumentsUpdate as any);
      window.removeEventListener('analysis-updated', handleAnalysisUpdate as any);
    };
  }, [checkPipelineStatus]);

  const updateCaseData = (data: Partial<CaseData>) => {
    setCaseData(prev => ({ ...prev, ...data }));
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        // Chat - não precisa validação, usuário avança quando quiser
        return true;
      case 1:
        // Validação
        return caseData.isDocSufficient === true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (canGoNext()) {
      if (currentStep < STEPS.length) {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      toast.error("Preencha todos os campos obrigatórios");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepValidation data={caseData} updateData={updateCaseData} />;
      case 1:
        return <StepAnalysis data={caseData} updateData={updateCaseData} />;
      case 2:
        return <StepJurisprudence data={caseData} updateData={updateCaseData} />;
      case 3:
        return <StepTeseJuridica data={caseData} updateData={updateCaseData} />;
      case 4:
        return <StepDraft data={caseData} updateData={updateCaseData} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Novo Caso</h1>
            <p className="text-muted-foreground">
              Siga os passos para criar uma nova petição
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <Card className="p-6 mb-6">
          <div className="space-y-4">
            {/* Grid de 6 colunas - números alinhados com labels */}
            <div className="grid grid-cols-6 gap-1 pb-4">
              {STEPS.map((step, idx) => {
                // ✅ FASE 5: Mapear status de cada step
                const stepKey = ['chat', 'validacao', 'analise', 'jurisprudencia', 'teses', 'peticao'][idx];
                const stepStatus = status[stepKey as keyof typeof status];
                const stepIsStale = isStale[stepKey as keyof typeof isStale];
                
                return (
                  <div key={step.id} className="flex flex-col items-center gap-1">
                    {/* Círculo numerado */}
                    <button
                      onClick={() => setCurrentStep(step.id)}
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all relative ${
                        currentStep > step.id
                          ? "bg-success border-success text-success-foreground cursor-pointer hover:opacity-80"
                          : currentStep === step.id
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border text-muted-foreground cursor-pointer hover:border-primary"
                      }`}
                    >
                      {stepStatus === 'running' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : stepStatus === 'error' ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : currentStep > step.id ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <span className="text-base font-bold">{step.id + 1}</span>
                      )}
                      {/* Badge de desatualizado */}
                      {stepIsStale && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-background" />
                      )}
                    </button>
                    
                    {/* Label alinhado embaixo + Status badges */}
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => setCurrentStep(step.id)}
                        className={`text-xs hover:text-primary transition-colors text-center leading-none px-0.5 ${
                          currentStep >= step.id
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        {step.name}
                      </button>
                      
                      {/* ✅ FASE 5: Badges de status */}
                      <div className="flex gap-1">
                        {stepStatus === 'complete' && !stepIsStale && (
                          <Badge variant="default" className="text-[10px] px-1 py-0 h-4 bg-green-600">✓</Badge>
                        )}
                        {stepIsStale && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-orange-600 border-orange-600">!</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Progress value={progress} className="h-2" />
          </div>
        </Card>

        {/* Step Content */}
        <Card className="p-8 mb-6">{renderStep()}</Card>

        {/* Navigation Buttons */}
        {currentStep > 0 && (
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="gap-2"
            >
              {currentStep === STEPS.length - 1 ? "Finalizar" : "Próximo"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewCase;
