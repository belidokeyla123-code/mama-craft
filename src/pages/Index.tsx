import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Scale, 
  FileCheck, 
  Brain, 
  Gavel, 
  FileText, 
  Shield, 
  Zap,
  CheckCircle2,
  ArrowRight
} from "lucide-react";

export default function Index() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-hero text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
        
        <div className="container mx-auto px-4 py-20 lg:py-32 relative z-10 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-2 mb-6">
                <Shield className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-accent">Sistema Jurídico Especializado</span>
              </div>
              
              <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
                Lobo Previdenciário
              </h1>
              
              <p className="text-xl text-primary-foreground/90 mb-8 leading-relaxed">
                Análise inteligente e automatizada de processos de <strong className="text-accent">salário-maternidade</strong> com 
                validação documental rigorosa, jurisprudência e geração de minutas profissionais.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/dashboard">
                  <Button size="lg" variant="accent" className="w-full sm:w-auto gap-2 text-lg px-8 py-6">
                    Começar Agora
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8 py-6 bg-white/10 hover:bg-white/20 border-white/30 text-white">
                  Saiba Mais
                </Button>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
              <Card className="relative bg-card/95 backdrop-blur border-border/50 p-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-12 w-12 rounded-lg bg-gradient-accent flex items-center justify-center">
                    <Scale className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Análise Completa</h3>
                    <p className="text-sm text-muted-foreground">Segurada Especial Rural</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Documentação validada</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Carência comprovada</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Jurisprudência anexada</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                    <span>Minuta gerada</span>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border">
                  <div className="text-xs text-muted-foreground mb-2">Progresso</div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-full bg-gradient-accent animate-pulse" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Processamento Completo e Inteligente
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Do upload à minuta final, cada etapa é validada com rigor técnico e jurídico
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <FileCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Validação Documental</h3>
              <p className="text-muted-foreground">
                Travas rigorosas por perfil (especial/urbana) garantem documentação completa antes da análise
              </p>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Análise com IA</h3>
              <p className="text-muted-foreground">
                Extração de dados via OCR, verificação de requisitos e cálculo de carência automatizados
              </p>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <Gavel className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Jurisprudência RAG</h3>
              <p className="text-muted-foreground">
                Busca semântica em STJ, TNU, TRFs com súmulas e precedentes ranqueados por relevância
              </p>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Minuta Profissional</h3>
              <p className="text-muted-foreground">
                Geração .DOCX preservando seu modelo Keyla Belido™ com todos os placeholders preenchidos
              </p>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Workflow Otimizado</h3>
              <p className="text-muted-foreground">
                6 etapas guiadas com checklists personalizados e pendências destacadas em tempo real
              </p>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50 hover:shadow-lg transition-smooth group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-smooth">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">Conformidade LGPD</h3>
              <p className="text-muted-foreground">
                Dados criptografados, auditoria completa e consentimento explícito em todas as etapas
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Como Funciona
            </h2>
            <p className="text-lg text-muted-foreground">
              Workflow em 6 etapas validadas
            </p>
          </div>

          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { step: 1, title: "Intake", desc: "Upload de documentos" },
              { step: 2, title: "Validação", desc: "Travas documentais" },
              { step: 3, title: "Análise", desc: "Requisitos legais" },
              { step: 4, title: "Jurisprudência", desc: "RAG de precedentes" },
              { step: 5, title: "Minuta", desc: "Geração .DOCX" },
              { step: 6, title: "Export", desc: "Entrega final" },
            ].map((item) => (
              <Card key={item.step} className="p-4 bg-card border-border/50 text-center hover:shadow-md transition-smooth">
                <div className="h-12 w-12 rounded-full bg-gradient-accent text-accent-foreground font-bold text-xl flex items-center justify-center mx-auto mb-3 shadow-accent">
                  {item.step}
                </div>
                <h4 className="font-semibold text-sm mb-1 text-foreground">{item.title}</h4>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-hero text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40" />
        
        <div className="container mx-auto px-4 text-center relative z-10 max-w-4xl">
          <h2 className="text-3xl lg:text-5xl font-bold mb-6">
            Pronto para transformar sua prática previdenciária?
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Análise rigorosa, documentação impecável e minutas profissionais em minutos
          </p>
          <Link to="/dashboard">
            <Button size="lg" variant="accent" className="gap-2 text-lg px-8 py-6 shadow-accent">
              Acessar Dashboard
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
