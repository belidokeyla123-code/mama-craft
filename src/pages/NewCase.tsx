import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StepChatIntake } from "@/components/wizard/StepChatIntake";
import { StepBasicInfo } from "@/components/wizard/StepBasicInfo";
import { StepDocumentsManager } from "@/components/wizard/StepDocumentsManager";
import { StepValidation } from "@/components/wizard/StepValidation";
import { StepAnalysis } from "@/components/wizard/StepAnalysis";
import { StepJurisprudence } from "@/components/wizard/StepJurisprudence";
import { StepDraft } from "@/components/wizard/StepDraft";
import { toast } from "sonner";

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
  
  // Evento
  eventType: "parto" | "adocao" | "guarda";
  eventDate: string;
  
  // Perfil
  profile: "especial" | "urbana";
  
  // Proprietário da terra
  landOwnerName?: string;
  landOwnerCpf?: string;
  landOwnerRg?: string;
  landOwnershipType?: "propria" | "terceiro";
  
  // Atividade rural
  ruralActivitySince?: string;
  familyMembers?: string[];
  
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
  
  // Documentos
  documents: File[];
  
  // Outros dados gerados pelo processo
  caseId?: string;
  validationScore?: number;
  isDocSufficient?: boolean;
  extractedData?: any;
  missingFields?: string[];
  autoFilledFields?: string[];
}

const STEPS = [
  { id: 0, name: "Chat Inteligente" },
  { id: 1, name: "Informações Básicas" },
  { id: 2, name: "Documentos" },
  { id: 3, name: "Validação" },
  { id: 4, name: "Análise" },
  { id: 5, name: "Jurisprudência" },
  { id: 6, name: "Minuta" },
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
    hasRa: false,
    salarioMinimoRef: 1412.00,
    documents: [],
  });

  const progress = ((currentStep) / (STEPS.length - 1)) * 100;

  const updateCaseData = (data: Partial<CaseData>) => {
    setCaseData(prev => ({ ...prev, ...data }));
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        // Chat - não precisa validação, usuário avança quando quiser
        return true;
      case 1:
        return caseData.authorName && caseData.authorCpf && caseData.eventDate;
      case 2:
        return caseData.documents.length > 0;
      case 3:
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
        return <StepChatIntake data={caseData} updateData={updateCaseData} onComplete={handleNext} />;
      case 1:
        return <StepBasicInfo data={caseData} updateData={updateCaseData} />;
      case 2:
        return caseData.caseId ? (
          <StepDocumentsManager 
            caseId={caseData.caseId}
            onDocumentsChange={() => {
              console.log("Documentos atualizados");
            }}
          />
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            Aguardando criação do caso...
          </div>
        );
      case 3:
        return <StepValidation data={caseData} updateData={updateCaseData} />;
      case 4:
        return <StepAnalysis data={caseData} updateData={updateCaseData} />;
      case 5:
        return <StepJurisprudence data={caseData} updateData={updateCaseData} />;
      case 6:
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
            <div className="flex justify-between items-center">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                      currentStep > step.id
                        ? "bg-success border-success text-success-foreground"
                        : currentStep === step.id
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-16 h-0.5 mx-2 ${
                        currentStep > step.id ? "bg-success" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between">
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`text-sm ${
                    currentStep >= step.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.name}
                </div>
              ))}
            </div>
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
