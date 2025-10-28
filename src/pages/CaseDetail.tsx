import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StepChatIntake } from "@/components/wizard/StepChatIntake";
import { StepBasicInfo } from "@/components/wizard/StepBasicInfo";
import { StepDocumentsManager } from "@/components/wizard/StepDocumentsManager";
import { StepValidation } from "@/components/wizard/StepValidation";
import { StepAnalysis } from "@/components/wizard/StepAnalysis";
import { StepJurisprudence } from "@/components/wizard/StepJurisprudence";
import { StepTeseJuridica } from "@/components/wizard/StepTeseJuridica";
import { StepDraft } from "@/components/wizard/StepDraft";
import { StepInstrucaoConcentrada } from "@/components/wizard/StepInstrucaoConcentrada";
import type { CaseData } from "./NewCase";

const STEPS = [
  { id: 0, name: "Chat Inteligente" },
  { id: 1, name: "Informações Básicas" },
  { id: 2, name: "Documentos" },
  { id: 3, name: "Instrução Concentrada" },
  { id: 4, name: "Validação" },
  { id: 5, name: "Análise" },
  { id: 6, name: "Jurisprudência" },
  { id: 7, name: "Tese Jurídica" },
  { id: 8, name: "Minuta" },
];

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1); // Começa nas informações básicas
  const [caseData, setCaseData] = useState<CaseData>({
    authorName: "",
    authorCpf: "",
    eventType: "parto",
    eventDate: "",
    profile: "especial",
    hasRa: false,
    salarioMinimoRef: 1412.0,
    documents: [],
    caseId: id,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCaseData();
  }, [id]);

  const loadCaseData = async () => {
    if (!id) return;

    try {
      // Carregar dados do caso
      const { data: caseDetails, error: caseError } = await supabase
        .from("cases")
        .select("*")
        .eq("id", id)
        .single();

      if (caseError) throw caseError;

      // Carregar validação
      const { data: validation } = await supabase
        .from("document_validation")
        .select("*")
        .eq("case_id", id)
        .maybeSingle();

      // Carregar análise
      const { data: analysis } = await supabase
        .from("case_analysis")
        .select("*")
        .eq("case_id", id)
        .maybeSingle();

      // Carregar extrações
      const { data: extractions } = await supabase
        .from("extractions")
        .select("*")
        .eq("case_id", id);

      // Mapear dados do banco para CaseData
      const mappedData: CaseData = {
        caseId: caseDetails.id,
        authorName: caseDetails.author_name,
        authorCpf: caseDetails.author_cpf,
        authorRg: caseDetails.author_rg || undefined,
        authorBirthDate: caseDetails.author_birth_date || undefined,
        authorAddress: caseDetails.author_address || undefined,
        authorMaritalStatus: caseDetails.author_marital_status || undefined,
        childName: caseDetails.child_name || undefined,
        childBirthDate: caseDetails.child_birth_date || undefined,
        fatherName: caseDetails.father_name || undefined,
        eventType: caseDetails.event_type,
        eventDate: caseDetails.event_date,
        profile: caseDetails.profile,
        landOwnerName: caseDetails.land_owner_name || undefined,
        landOwnerCpf: caseDetails.land_owner_cpf || undefined,
        landOwnerRg: caseDetails.land_owner_rg || undefined,
        landOwnershipType: (caseDetails.land_ownership_type === "propria" || caseDetails.land_ownership_type === "terceiro") 
          ? caseDetails.land_ownership_type 
          : undefined,
        ruralActivitySince: caseDetails.rural_activity_since || undefined,
        familyMembers: caseDetails.family_members as string[] || undefined,
        hasRa: caseDetails.has_ra,
        raProtocol: caseDetails.ra_protocol || undefined,
        raRequestDate: caseDetails.ra_request_date || undefined,
        raDenialDate: caseDetails.ra_denial_date || undefined,
        raDenialReason: caseDetails.ra_denial_reason || undefined,
        specialNotes: caseDetails.special_notes || undefined,
        hasSpecialSituation: caseDetails.has_special_situation,
        salarioMinimoRef: caseDetails.salario_minimo_ref,
        documents: [], // Documentos já estão no banco
        validationScore: validation?.score,
        isDocSufficient: validation?.is_sufficient,
        extractedData: extractions?.[0]?.entities,
        missingFields: extractions?.[0]?.missing_fields,
        autoFilledFields: Object.keys(extractions?.[0]?.auto_filled_fields || {}),
      };

      setCaseData(mappedData);
    } catch (error: any) {
      console.error("Erro ao carregar dados do caso:", error);
      toast({
        title: "Erro ao carregar caso",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateCaseData = async (data: Partial<CaseData>) => {
    setCaseData((prev) => ({ ...prev, ...data }));

    // Auto-salvar no banco
    if (!id) return;

    try {
      const updateData: any = {};
      if (data.authorName !== undefined) updateData.author_name = data.authorName;
      if (data.authorCpf !== undefined) updateData.author_cpf = data.authorCpf;
      if (data.authorRg !== undefined) updateData.author_rg = data.authorRg;
      if (data.authorBirthDate !== undefined) updateData.author_birth_date = data.authorBirthDate;
      if (data.authorAddress !== undefined) updateData.author_address = data.authorAddress;
      if (data.authorMaritalStatus !== undefined) updateData.author_marital_status = data.authorMaritalStatus;
      if (data.childName !== undefined) updateData.child_name = data.childName;
      if (data.childBirthDate !== undefined) updateData.child_birth_date = data.childBirthDate;
      if (data.fatherName !== undefined) updateData.father_name = data.fatherName;
      if (data.eventType !== undefined) updateData.event_type = data.eventType;
      if (data.eventDate !== undefined) updateData.event_date = data.eventDate;
      if (data.profile !== undefined) updateData.profile = data.profile;
      if (data.landOwnerName !== undefined) updateData.land_owner_name = data.landOwnerName;
      if (data.landOwnerCpf !== undefined) updateData.land_owner_cpf = data.landOwnerCpf;
      if (data.landOwnerRg !== undefined) updateData.land_owner_rg = data.landOwnerRg;
      if (data.landOwnershipType !== undefined) updateData.land_ownership_type = data.landOwnershipType;
      if (data.ruralActivitySince !== undefined) updateData.rural_activity_since = data.ruralActivitySince;
      if (data.familyMembers !== undefined) updateData.family_members = data.familyMembers;
      if (data.hasRa !== undefined) updateData.has_ra = data.hasRa;
      if (data.raProtocol !== undefined) updateData.ra_protocol = data.raProtocol;
      if (data.raRequestDate !== undefined) updateData.ra_request_date = data.raRequestDate;
      if (data.raDenialDate !== undefined) updateData.ra_denial_date = data.raDenialDate;
      if (data.raDenialReason !== undefined) updateData.ra_denial_reason = data.raDenialReason;
      if (data.specialNotes !== undefined) updateData.special_notes = data.specialNotes;
      if (data.hasSpecialSituation !== undefined) updateData.has_special_situation = data.hasSpecialSituation;
      if (data.salarioMinimoRef !== undefined) updateData.salario_minimo_ref = data.salarioMinimoRef;

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from("cases")
          .update(updateData)
          .eq("id", id);

        if (error) throw error;
      }
    } catch (error: any) {
      console.error("Erro ao salvar dados:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const progress = (currentStep / (STEPS.length - 1)) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepChatIntake
            data={caseData}
            updateData={updateCaseData}
            onComplete={handleNext}
          />
        );
      case 1:
        return <StepBasicInfo data={caseData} updateData={updateCaseData} />;
      case 2:
        return id ? (
          <StepDocumentsManager
            caseId={id}
            caseName={caseData.authorName}
            onDocumentsChange={loadCaseData}
          />
        ) : null;
      case 3:
        return <StepInstrucaoConcentrada data={caseData} updateData={updateCaseData} />;
      case 4:
        return <StepValidation data={caseData} updateData={updateCaseData} />;
      case 5:
        return <StepAnalysis data={caseData} updateData={updateCaseData} />;
      case 6:
        return <StepJurisprudence data={caseData} updateData={updateCaseData} />;
      case 7:
        return <StepTeseJuridica data={caseData} updateData={updateCaseData} />;
      case 8:
        return <StepDraft data={caseData} updateData={updateCaseData} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!caseData.caseId) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Caso não encontrado</h2>
          <p className="text-muted-foreground mb-4">
            O caso solicitado não existe.
          </p>
          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
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
            <h1 className="text-3xl font-bold text-foreground">
              {caseData.authorName}
            </h1>
            <p className="text-muted-foreground">Caso #{id?.slice(0, 8)}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <Card className="p-6 mb-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                      currentStep > step.id
                        ? "bg-success border-success text-success-foreground cursor-pointer hover:opacity-80"
                        : currentStep === step.id
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-muted-foreground cursor-pointer hover:border-primary"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </button>
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
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={`text-sm hover:text-primary transition-colors ${
                    currentStep >= step.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.name}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Step Content */}
        <Card className="p-8 mb-6">{renderStep()}</Card>

        {/* Navigation Buttons */}
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
            disabled={currentStep === STEPS.length - 1}
            className="gap-2"
          >
            Próximo
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
