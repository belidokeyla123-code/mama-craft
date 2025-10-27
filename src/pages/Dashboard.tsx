import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Clock, CheckCircle2, AlertCircle, FolderOpen } from "lucide-react";

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
];

const statusConfig = {
  intake: { label: "Intake", color: "bg-muted text-muted-foreground", icon: FileText },
  pending_docs: { label: "Pendente", color: "bg-warning text-warning-foreground", icon: AlertCircle },
  ready: { label: "Pronta", color: "bg-primary text-primary-foreground", icon: Clock },
  drafted: { label: "Concluída", color: "bg-success text-success-foreground", icon: CheckCircle2 },
};

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Meus Casos</h1>
            <p className="text-muted-foreground">Gestão de processos de salário-maternidade</p>
          </div>
          <Link to="/novo-caso">
            <Button size="lg" variant="accent" className="gap-2">
              <Plus className="h-5 w-5" />
              Novo Caso
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total</p>
                <p className="text-3xl font-bold text-foreground">{mockCases.length}</p>
              </div>
              <FolderOpen className="h-10 w-10 text-primary/60" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Concluídas</p>
                <p className="text-3xl font-bold text-success">
                  {mockCases.filter((c) => c.status === "drafted").length}
                </p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-success/60" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Em Análise</p>
                <p className="text-3xl font-bold text-primary">
                  {mockCases.filter((c) => c.status === "ready").length}
                </p>
              </div>
              <Clock className="h-10 w-10 text-primary/60" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pendentes</p>
                <p className="text-3xl font-bold text-warning">
                  {mockCases.filter((c) => c.status === "pending_docs").length}
                </p>
              </div>
              <AlertCircle className="h-10 w-10 text-warning/60" />
            </div>
          </Card>
        </div>

        {/* Cases List */}
        <div className="space-y-4">
          {mockCases.map((caso) => {
            const StatusIcon = statusConfig[caso.status as keyof typeof statusConfig].icon;
            return (
              <Card
                key={caso.id}
                className="p-6 bg-card border-border hover:shadow-lg transition-smooth cursor-pointer group"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-4 mb-3">
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

                    {/* Progress Bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Progresso</span>
                        <span>{caso.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-accent transition-all duration-500"
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

        {mockCases.length === 0 && (
          <Card className="p-12 text-center bg-gradient-card border-border/50">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Nenhum caso cadastrado</h3>
            <p className="text-muted-foreground mb-6">Comece criando seu primeiro caso</p>
            <Link to="/novo-caso">
              <Button variant="accent" size="lg" className="gap-2">
                <Plus className="h-5 w-5" />
                Criar Primeiro Caso
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
