import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Plus, FileText, Clock, CheckCircle2, AlertCircle, FolderOpen, Scale } from "lucide-react";

const mockCases = [
  {
    id: "1",
    autora: "Maria da Silva Santos",
    status: "drafted",
    benefit: "SM",
    profile: "segurada_especial",
    eventDate: "2025-01-05",
    createdAt: "2025-01-20",
    progress: 100,
  },
  {
    id: "2",
    autora: "Ana Paula Oliveira",
    status: "pending_docs",
    benefit: "SM",
    profile: "urbana",
    eventDate: "2024-12-15",
    createdAt: "2025-01-18",
    progress: 40,
    missingDocs: ["Certidão de Nascimento", "CAF ou DAP"],
    pendingReason: "Score de suficiência documental = 4/7",
  },
  {
    id: "3",
    autora: "Josefa Maria dos Santos",
    status: "ready",
    benefit: "SM",
    profile: "segurada_especial",
    eventDate: "2024-11-22",
    createdAt: "2025-01-15",
    progress: 75,
  },
  {
    id: "4",
    autora: "Francisca Oliveira Lima",
    status: "protocolada",
    benefit: "SM",
    profile: "segurada_especial",
    eventDate: "2024-10-10",
    createdAt: "2024-12-01",
    progress: 100,
    protocolDate: "2025-01-10",
    valorCausa: 12500.00,
  },
];

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

type FilterStatus = "all" | "drafted" | "ready" | "pending_docs" | "protocolada";

export default function Dashboard() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const filteredCases = filterStatus === "all" 
    ? mockCases 
    : mockCases.filter(c => c.status === filterStatus);

  const totalCases = mockCases.length;
  const concluidas = mockCases.filter(c => c.status === "drafted").length;
  const emAnalise = mockCases.filter(c => c.status === "ready").length;
  const pendentes = mockCases.filter(c => c.status === "pending_docs").length;
  const protocoladas = mockCases.filter(c => c.status === "protocolada" || c.status === "em_audiencia" || c.status === "acordo" || c.status === "sentenca").length;

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Meus Casos</h1>
            <p className="text-muted-foreground">Gestão de processos de salário-maternidade</p>
          </div>
          <Link to="/novo-caso">
            <Button size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Novo Caso
            </Button>
          </Link>
        </div>

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
            const StatusIcon = statusConfig[caso.status as keyof typeof statusConfig].icon;
            const isPending = caso.status === "pending_docs";
            
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
                          {caso.autora}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span>Caso #{caso.id}</span>
                          <span>•</span>
                          <span>Evento: {new Date(caso.eventDate).toLocaleDateString("pt-BR")}</span>
                          <span>•</span>
                          <span className="capitalize">{caso.profile.replace("_", " ")}</span>
                        </div>
                      </div>
                      <Badge
                        className={`${
                          statusConfig[caso.status as keyof typeof statusConfig].color
                        } flex items-center gap-1 px-3 py-1`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig[caso.status as keyof typeof statusConfig].label}
                      </Badge>
                    </div>

                    {/* Detalhes para casos pendentes */}
                    {isPending && caso.missingDocs && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Documentos Faltantes:</AlertTitle>
                        <AlertDescription>
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            {caso.missingDocs.map((doc, idx) => (
                              <li key={idx} className="text-sm">✗ {doc}</li>
                            ))}
                          </ul>
                          <p className="text-xs mt-2 opacity-80">
                            Motivo: {caso.pendingReason}
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Detalhes para casos protocoladas */}
                    {caso.status === "protocolada" && caso.protocolDate && (
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>📅 Protocolada em: {new Date(caso.protocolDate).toLocaleDateString("pt-BR")}</p>
                        {caso.valorCausa && (
                          <p>💰 Valor da causa: {caso.valorCausa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                        )}
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Progresso</span>
                        <span>{caso.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                          style={{ width: `${caso.progress}%` }}
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
      </div>
    </div>
  );
}
