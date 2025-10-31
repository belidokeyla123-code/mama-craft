import { useEffect, useState } from "react";
import { Calendar, Baby, Sprout, FileText, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTabSync } from "@/hooks/useTabSync";

interface TimelineEvent {
  date: Date;
  title: string;
  description: string;
  type: "birth" | "rural" | "admin" | "document";
  icon: any;
  documentType?: string;
}

interface CaseEventsTimelineProps {
  caseId: string;
}

export function CaseEventsTimeline({ caseId }: CaseEventsTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [carenciaDate, setCarenciaDate] = useState<Date | null>(null);
  const [carenciaMet, setCarenciaMet] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Sincronização em tempo real
  useTabSync({
    caseId: caseId || '',
    events: ['extractions-updated', 'documents-updated'],
    onSync: (detail) => {
      console.log('[CaseEventsTimeline] 🔄 Documentos atualizados, recarregando timeline...');
      if (detail.timestamp && !isLoading) {
        loadTimelineEvents();
      }
    }
  });

  useEffect(() => {
    loadTimelineEvents();
  }, [caseId]);

  const loadTimelineEvents = async () => {
    try {
      setIsLoading(true);

      // Buscar dados do caso
      const { data: caseData, error: caseError } = await supabase
        .from("cases")
        .select("child_birth_date, event_date, event_type")
        .eq("id", caseId)
        .single();

      if (caseError) throw caseError;

      // Buscar extrações
      const { data: extractions, error: extractionsError } = await supabase
        .from("extractions")
        .select("*, documents(document_type, file_name)")
        .eq("case_id", caseId);

      if (extractionsError) throw extractionsError;

      const timelineEvents: TimelineEvent[] = [];

      // 1. DATA DO PARTO (mais importante)
      let birth: Date | null = null;
      if (caseData?.child_birth_date) {
        birth = parseISO(caseData.child_birth_date);
        setBirthDate(birth);
        timelineEvents.push({
          date: birth,
          title: "📅 Data do Parto",
          description: format(birth, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
          type: "birth",
          icon: Baby,
        });

        // Calcular data de carência (10 meses antes do parto)
        const carencia = subMonths(birth, 10);
        setCarenciaDate(carencia);
      }

      // 2. PROCESSAR EXTRAÇÕES
      extractions?.forEach((extraction) => {
        const entities = (extraction.entities || {}) as Record<string, any>;
        const docType = extraction.documents?.document_type;
        const fileName = extraction.documents?.file_name || "Documento";

        // Data do Nascimento da Criança (certidão)
        if (entities.childBirthDate && docType === "certidao_nascimento") {
          const date = parseISO(String(entities.childBirthDate));
          if (!timelineEvents.some(e => e.type === "birth")) {
            timelineEvents.push({
              date,
              title: "👶 Nascimento",
              description: `${entities.childName || "Criança"} - ${format(date, "dd/MM/yyyy")}`,
              type: "birth",
              icon: Baby,
              documentType: "Certidão de Nascimento",
            });
          }
        }

        // Datas de Atividade Rural (documento da terra)
        if (docType === "documento_terra") {
          // Data de início da atividade rural
          if (entities.ruralActivityStartDate) {
            const date = parseISO(String(entities.ruralActivityStartDate));
            timelineEvents.push({
              date,
              title: "🌾 Início Atividade Rural",
              description: `${entities.landOwnerName || "Proprietário"} - ${format(date, "dd/MM/yyyy")}`,
              type: "rural",
              icon: Sprout,
              documentType: String(entities.documentType || "Documento da Terra"),
            });
          }

          // Data do documento (emissão)
          if (entities.documentDate) {
            const date = parseISO(String(entities.documentDate));
            timelineEvents.push({
              date,
              title: `📄 ${entities.documentType || "Documento da Terra"}`,
              description: `Emissão: ${format(date, "dd/MM/yyyy")} - ${entities.landLocation || ""}`,
              type: "document",
              icon: FileText,
              documentType: String(entities.documentType),
            });
          }
        }

        // Autodeclaração Rural
        if (docType === "autodeclaracao_rural") {
          if (entities.ruralActivityStartDate) {
            const date = parseISO(String(entities.ruralActivityStartDate));
            timelineEvents.push({
              date,
              title: "🌾 Início Atividade Rural (Autodeclaração)",
              description: `${entities.ruralLocation || ""} - ${format(date, "dd/MM/yyyy")}`,
              type: "rural",
              icon: Sprout,
              documentType: "Autodeclaração Rural",
            });
          }

          if (entities.declarationDate) {
            const date = parseISO(String(entities.declarationDate));
            timelineEvents.push({
              date,
              title: "📝 Autodeclaração Rural",
              description: `Declaração assinada em ${format(date, "dd/MM/yyyy")}`,
              type: "document",
              icon: FileText,
              documentType: "Autodeclaração",
            });
          }
        }

        // Processo Administrativo
        if (docType === "processo_administrativo") {
          if (entities.raRequestDate) {
            const date = parseISO(String(entities.raRequestDate));
            timelineEvents.push({
              date,
              title: "🏛️ Requerimento Administrativo",
              description: `Protocolo: ${entities.raProtocol || "N/A"} - ${format(date, "dd/MM/yyyy")}`,
              type: "admin",
              icon: FileText,
              documentType: "Processo Administrativo",
            });
          }

          if (entities.raDenialDate) {
            const date = parseISO(String(entities.raDenialDate));
            timelineEvents.push({
              date,
              title: "❌ Indeferimento Administrativo",
              description: `Negado em ${format(date, "dd/MM/yyyy")}`,
              type: "admin",
              icon: XCircle,
              documentType: "Indeferimento",
            });
          }
        }
      });

      // Ordenar eventos por data (mais antigo primeiro)
      timelineEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
      setEvents(timelineEvents);

      // Verificar se carência foi cumprida
      if (birth && carenciaDate) {
        const earliestRuralDate = timelineEvents
          .filter((e) => e.type === "rural")
          .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.date;

        if (earliestRuralDate) {
          const met = earliestRuralDate <= carenciaDate;
          setCarenciaMet(met);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar timeline:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timeline de Eventos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeline de Eventos do Caso
        </CardTitle>
        <CardDescription>
          Linha do tempo com todas as datas relevantes extraídas dos documentos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Data do Parto */}
          {birthDate && (
            <div className="p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Baby className="h-5 w-5 text-primary" />
                <span className="font-semibold">Data do Parto</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {format(birthDate, "dd/MM/yyyy")}
              </p>
            </div>
          )}

          {/* Carência Necessária */}
          {carenciaDate && (
            <div className="p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="font-semibold">Carência (10 meses antes)</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {format(carenciaDate, "dd/MM/yyyy")}
              </p>
            </div>
          )}

          {/* Status da Carência */}
          {carenciaMet !== null && (
            <div className="p-4 border rounded-lg bg-card">
              <div className="flex items-center gap-2 mb-2">
                {carenciaMet ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-semibold">Status da Carência</span>
              </div>
              <Badge variant={carenciaMet ? "default" : "destructive"} className="text-base">
                {carenciaMet ? "✅ Cumprida" : "❌ Não Cumprida"}
              </Badge>
            </div>
          )}
        </div>

        {/* Timeline Visual */}
        {events.length > 0 ? (
          <div className="relative space-y-4 pt-4">
            {/* Linha vertical */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

            {events.map((event, index) => {
              const Icon = event.icon;
              const isRural = event.type === "rural";
              const isBirth = event.type === "birth";

              return (
                <div key={index} className="relative flex items-start gap-4 pl-2">
                  {/* Ícone */}
                  <div
                    className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      isBirth
                        ? "bg-primary border-primary text-primary-foreground"
                        : isRural
                        ? "bg-success border-success text-success-foreground"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-foreground">{event.title}</h4>
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                        {event.documentType && (
                          <Badge variant="outline" className="mt-1">
                            {event.documentType}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(event.date, "dd/MM/yyyy")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum evento encontrado nos documentos.</p>
            <p className="text-sm">Faça upload e analise os documentos para ver a timeline.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
