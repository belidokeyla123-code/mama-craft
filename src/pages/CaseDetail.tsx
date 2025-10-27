import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Loader2, FileText, User, Calendar, MapPin } from "lucide-react";
import { StepDocumentsManager } from "@/components/wizard/StepDocumentsManager";
import type { Json } from "@/integrations/supabase/types";

interface CaseDetails {
  id: string;
  author_name: string;
  author_cpf: string;
  author_rg?: string;
  author_birth_date?: string;
  author_address?: string;
  author_marital_status?: string;
  child_name?: string;
  child_birth_date?: string;
  father_name?: string;
  event_date: string;
  profile: string;
  status: string;
  created_at: string;
  updated_at: string;
  land_ownership_type?: string;
  land_owner_name?: string;
  land_owner_cpf?: string;
  land_owner_rg?: string;
  rural_activity_since?: string;
  family_members?: Json;
  has_ra: boolean;
  ra_protocol?: string;
  ra_request_date?: string;
  ra_denial_date?: string;
  ra_denial_reason?: string;
  salario_minimo_ref: number;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReprocessing, setIsReprocessing] = useState(false);

  useEffect(() => {
    loadCaseDetails();
  }, [id]);

  const loadCaseDetails = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCaseDetails(data);
    } catch (error: any) {
      console.error("Erro ao carregar caso:", error);
      toast({
        title: "Erro ao carregar caso",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReprocessDocuments = async () => {
    if (!id) return;

    setIsReprocessing(true);

    try {
      // Buscar IDs dos documentos
      const { data: documents, error: docsError } = await supabase
        .from("documents")
        .select("id")
        .eq("case_id", id);

      if (docsError) throw docsError;

      if (!documents || documents.length === 0) {
        toast({
          title: "Nenhum documento encontrado",
          description: "Adicione documentos antes de processar.",
          variant: "destructive",
        });
        return;
      }

      // Chamar edge function para reprocessar
      const { data, error } = await supabase.functions.invoke("process-documents-with-ai", {
        body: {
          caseId: id,
          documentIds: documents.map((d) => d.id),
        },
      });

      if (error) throw error;

      toast({
        title: "Documentos reprocessados",
        description: "As informações foram atualizadas no formulário.",
      });

      // Recarregar dados do caso
      await loadCaseDetails();
    } catch (error: any) {
      console.error("Erro ao reprocessar documentos:", error);
      toast({
        title: "Erro ao processar documentos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseDetails) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Caso não encontrado</h2>
          <p className="text-muted-foreground mb-4">O caso solicitado não existe.</p>
          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{caseDetails.author_name}</h1>
              <p className="text-muted-foreground">Caso #{id?.slice(0, 8)}</p>
            </div>
          </div>
          
          <Button
            onClick={handleReprocessDocuments}
            disabled={isReprocessing}
            className="gap-2"
          >
            {isReprocessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Preencher com Documentos
              </>
            )}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="space-y-6">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          {/* Aba de Informações */}
          <TabsContent value="info" className="space-y-6">
            {/* Dados da Autora */}
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Autora (Mãe)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Nome Completo</p>
                  <p className="font-medium">{caseDetails.author_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">CPF</p>
                  <p className="font-medium">{caseDetails.author_cpf}</p>
                </div>
                {caseDetails.author_rg && (
                  <div>
                    <p className="text-muted-foreground">RG</p>
                    <p className="font-medium">{caseDetails.author_rg}</p>
                  </div>
                )}
                {caseDetails.author_birth_date && (
                  <div>
                    <p className="text-muted-foreground">Data de Nascimento</p>
                    <p className="font-medium">
                      {new Date(caseDetails.author_birth_date).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                )}
                {caseDetails.author_marital_status && (
                  <div>
                    <p className="text-muted-foreground">Estado Civil</p>
                    <p className="font-medium capitalize">{caseDetails.author_marital_status}</p>
                  </div>
                )}
                {caseDetails.author_address && (
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Endereço</p>
                    <p className="font-medium">{caseDetails.author_address}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Dados da Criança */}
            {caseDetails.child_name && (
              <Card className="p-6">
                <h3 className="text-xl font-semibold mb-4">Criança</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Nome</p>
                    <p className="font-medium">{caseDetails.child_name}</p>
                  </div>
                  {caseDetails.child_birth_date && (
                    <div>
                      <p className="text-muted-foreground">Data de Nascimento</p>
                      <p className="font-medium">
                        {new Date(caseDetails.child_birth_date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  )}
                  {caseDetails.father_name && (
                    <div>
                      <p className="text-muted-foreground">Nome do Pai</p>
                      <p className="font-medium">{caseDetails.father_name}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Perfil */}
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Perfil e Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-muted-foreground mb-2">Perfil</p>
                  <Badge variant="outline" className="text-base">
                    {caseDetails.profile === "especial" ? "Segurada Especial" : "Segurada Urbana"}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground mb-2">Status</p>
                  <Badge className="text-base capitalize">{caseDetails.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">SM Referência</p>
                  <p className="text-lg font-semibold">
                    R$ {caseDetails.salario_minimo_ref.toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>

            {/* RA */}
            {caseDetails.has_ra && (
              <Card className="p-6">
                <h3 className="text-xl font-semibold mb-4">Requerimento Administrativo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {caseDetails.ra_protocol && (
                    <div>
                      <p className="text-muted-foreground">Protocolo (NB)</p>
                      <p className="font-medium">{caseDetails.ra_protocol}</p>
                    </div>
                  )}
                  {caseDetails.ra_request_date && (
                    <div>
                      <p className="text-muted-foreground">Data do Requerimento</p>
                      <p className="font-medium">
                        {new Date(caseDetails.ra_request_date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  )}
                  {caseDetails.ra_denial_date && (
                    <div>
                      <p className="text-muted-foreground">Data do Indeferimento</p>
                      <p className="font-medium">
                        {new Date(caseDetails.ra_denial_date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  )}
                  {caseDetails.ra_denial_reason && (
                    <div className="md:col-span-2">
                      <p className="text-muted-foreground">Motivo</p>
                      <p className="font-medium">{caseDetails.ra_denial_reason}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Aba de Documentos */}
          <TabsContent value="documents">
            <StepDocumentsManager 
              caseId={id!} 
              caseName={caseDetails.author_name}
              onDocumentsChange={loadCaseDetails}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
