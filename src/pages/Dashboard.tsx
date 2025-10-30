import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Plus, FileText, Clock, CheckCircle2, AlertCircle, FolderOpen, Scale, Loader2, Trash2, MessageSquare, FileEdit, Gavel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BatchReplicateButton } from "@/components/dashboard/BatchReplicateButton";

interface Case {
  id: string;
  author_name: string;
  status: string;
  profile: string;
  event_date: string;
  created_at: string;
  child_birth_date?: string;
  salario_minimo_ref: number;
  valor_causa?: number;
  petition_type?: string;
}

const statusConfig = {
  intake: { label: "Intake", color: "bg-muted text-muted-foreground", icon: FileText },
  pending_docs: { label: "Pendente", color: "bg-warning text-warning-foreground", icon: AlertCircle },
  ready: { label: "Em Análise", color: "bg-primary text-primary-foreground", icon: Clock },
  drafted: { label: "Concluída", color: "bg-success text-success-foreground", icon: CheckCircle2 },
  protocolada: { label: "Protocolada", color: "bg-accent text-accent-foreground", icon: Scale },
  em_audiencia: { label: "Em Audiência", color: "bg-purple-500 text-white", icon: Scale },
  acordo: { label: "Acordo", color: "bg-blue-500 text-white", icon: CheckCircle2 },
  sentenca: { label: "Sentença", color: "bg-green-600 text-white", icon: CheckCircle2 },
};

type FilterStatus = "all" | "drafted" | "ready" | "pending_docs" | "protocolada" | "intake";

const petitionTypeLabels: Record<string, string> = {
  peticao_inicial: "Petição Inicial",
  recurso_apelacao: "Recurso Nominado/Apelação",
  embargos: "Embargos",
  pilf: "PILF"
};

const petitionTypeIcons: Record<string, any> = {
  peticao_inicial: FileText,
  recurso_apelacao: MessageSquare,
  embargos: FileEdit,
  pilf: Gavel
};

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [caseToDelete, setCaseToDelete] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const petitionType = searchParams.get("type");

  useEffect(() => {
    loadCases();
  }, [petitionType]);

  const loadCases = async () => {
    try {
      let query = supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false });
      
      // Filtrar por tipo de peça se especificado
      if (petitionType) {
        query = query.eq("petition_type", petitionType);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCases(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar casos:", error);
      toast({
        title: "Erro ao carregar casos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!caseToDelete) return;

    try {
      // Buscar documentos do caso para excluir do storage
      const { data: documents } = await supabase
        .from("documents")
        .select("file_path")
        .eq("case_id", caseToDelete);

      // Excluir arquivos do storage
      if (documents && documents.length > 0) {
        const filePaths = documents.map((doc) => doc.file_path);
        await supabase.storage.from("case-documents").remove(filePaths);
      }

      // Excluir dados relacionados (as foreign keys com cascade devem fazer isso automaticamente)
      // Mas vamos garantir a exclusão manual de todas as tabelas relacionadas
      await supabase.from("extractions").delete().eq("case_id", caseToDelete);
      await supabase.from("documents").delete().eq("case_id", caseToDelete);
      await supabase.from("document_validation").delete().eq("case_id", caseToDelete);
      await supabase.from("case_analysis").delete().eq("case_id", caseToDelete);
      await supabase.from("case_jurisprudencias").delete().eq("case_id", caseToDelete);
      await supabase.from("drafts").delete().eq("case_id", caseToDelete);
      await supabase.from("case_timeline").delete().eq("case_id", caseToDelete);
      await supabase.from("case_exceptions").delete().eq("case_id", caseToDelete);
      await supabase.from("case_financial").delete().eq("case_id", caseToDelete);
      await supabase.from("timeline_events").delete().eq("case_id", caseToDelete);

      // Excluir o caso
      const { error } = await supabase
        .from("cases")
        .delete()
        .eq("id", caseToDelete);

      if (error) throw error;

      toast({
        title: "Caso excluído",
        description: "O caso foi excluído com sucesso.",
      });

      // Atualizar lista
      await loadCases();
    } catch (error: any) {
      console.error("Erro ao excluir caso:", error);
      toast({
        title: "Erro ao excluir caso",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCaseToDelete(null);
    }
  };

  const filteredCases = filterStatus === "all" 
    ? cases 
    : cases.filter(c => c.status === filterStatus);

  const totalCases = cases.length;
  const concluidas = cases.filter(c => c.status === "drafted").length;
  const emAnalise = cases.filter(c => c.status === "ready").length;
  const pendentes = cases.filter(c => c.status === "pending_docs").length;
  const protocoladas = cases.filter(c => c.status === "protocolada" || c.status === "em_audiencia" || c.status === "acordo" || c.status === "sentenca").length;

  const calculateProgress = (caseItem: Case) => {
    switch (caseItem.status) {
      case "intake": return 10;
      case "pending_docs": return 40;
      case "ready": return 70;
      case "drafted": return 100;
      case "protocolada": return 100;
      default: return 0;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar */}
        <DashboardSidebar />
        
        {/* Main Content */}
        <div className="flex-1 bg-gradient-subtle">
          {/* Header com Trigger da Sidebar */}
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto p-4 flex items-center gap-4">
              <SidebarTrigger />
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">Meus Casos</h1>
                <p className="text-sm text-muted-foreground">
                  {petitionType 
                    ? `${petitionTypeLabels[petitionType]} - Auxílio Maternidade` 
                    : "Todos os casos - Auxílio Maternidade"}
                </p>
              </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex gap-2">
              <Link to="/novo-caso">
                <Button size="lg" className="gap-2">
                  <Plus className="h-5 w-5" />
                  Novo Caso
                </Button>
              </Link>
              <BatchReplicateButton />
            </div>
          </div>
            </div>
          </div>
          
          {/* Conteúdo */}
          <div className="container mx-auto p-4 md:p-8">

        {/* Stats - Agora clicáveis */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card 
            className={`p-6 cursor-pointer hover:shadow-lg transition-smooth ${filterStatus === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilterStatus("all")}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total</p>
                <p className="text-3xl font-bold text-foreground">{totalCases}</p>
              </div>
              <FolderOpen className="h-10 w-10 text-primary/60" />
            </div>
          </Card>

          <Card 
            className={`p-6 cursor-pointer hover:shadow-lg transition-smooth ${filterStatus === "drafted" ? "ring-2 ring-success" : ""}`}
            onClick={() => setFilterStatus("drafted")}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Concluídas</p>
                <p className="text-3xl font-bold text-success">{concluidas}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-success/60" />
            </div>
          </Card>

          <Card 
            className={`p-6 cursor-pointer hover:shadow-lg transition-smooth ${filterStatus === "ready" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilterStatus("ready")}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Em Análise</p>
                <p className="text-3xl font-bold text-primary">{emAnalise}</p>
              </div>
              <Clock className="h-10 w-10 text-primary/60" />
            </div>
          </Card>

          <Card 
            className={`p-6 cursor-pointer hover:shadow-lg transition-smooth ${filterStatus === "pending_docs" ? "ring-2 ring-warning" : ""}`}
            onClick={() => setFilterStatus("pending_docs")}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pendentes</p>
                <p className="text-3xl font-bold text-warning">{pendentes}</p>
              </div>
              <AlertCircle className="h-10 w-10 text-warning/60" />
            </div>
          </Card>

          <Card 
            className="p-6 cursor-pointer hover:shadow-lg transition-smooth"
            onClick={() => navigate('/protocoladas')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Protocoladas</p>
                <p className="text-3xl font-bold text-green-600">{protocoladas}</p>
              </div>
              <Scale className="h-10 w-10 text-green-600/60" />
            </div>
          </Card>
        </div>

        {/* Active Filter Indicator */}
        {filterStatus !== "all" && (
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Filtrando por: <strong>{statusConfig[filterStatus].label}</strong>
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFilterStatus("all")}
            >
              Limpar filtro
            </Button>
          </div>
        )}

        {/* Cases List */}
        <div className="space-y-4">
          {filteredCases.map((caso) => {
            const StatusIcon = statusConfig[caso.status as keyof typeof statusConfig]?.icon || FileText;
            const statusStyle = statusConfig[caso.status as keyof typeof statusConfig];
            const progress = calculateProgress(caso);
            
            return (
              <Card
                key={caso.id}
                className="p-6 bg-card border-border hover:shadow-lg transition-smooth cursor-pointer group"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                     <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-smooth">
                          {caso.author_name}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground items-center">
                          <span>Caso #{caso.id.slice(0, 8)}</span>
                          <span>•</span>
                          <span>Evento: {new Date(caso.event_date).toLocaleDateString("pt-BR")}</span>
                          <span>•</span>
                          <span className="capitalize">{caso.profile === "especial" ? "Segurada Especial" : "Segurada Urbana"}</span>
                          {caso.petition_type && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="gap-1">
                                {(() => {
                                  const Icon = petitionTypeIcons[caso.petition_type];
                                  return Icon ? <Icon className="h-3 w-3" /> : null;
                                })()}
                                {petitionTypeLabels[caso.petition_type]}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                      {statusStyle && (
                        <Badge
                          className={`${statusStyle.color} flex items-center gap-1 px-3 py-1`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusStyle.label}
                        </Badge>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Progresso</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={`/caso/${caso.id}`}>
                      <Button variant="outline" size="sm">
                        Abrir Caso
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCaseToDelete(caso.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredCases.length === 0 && (
          <Card className="p-12 text-center">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Nenhum caso encontrado
            </h3>
            <p className="text-muted-foreground mb-6">
              {filterStatus === "all" 
                ? "Comece criando seu primeiro caso" 
                : `Nenhum caso com status "${statusConfig[filterStatus].label}"`}
            </p>
            <Link to="/novo-caso">
              <Button size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Criar Novo Caso
              </Button>
            </Link>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!caseToDelete} onOpenChange={() => setCaseToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O caso e todos os seus documentos e dados relacionados serão excluídos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
