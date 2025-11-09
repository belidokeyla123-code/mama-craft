import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Baby, Calendar, Briefcase, Heart, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";

interface TimelineEvent {
  date: string; // ISO date string
  type: "birth" | "rural_period" | "urban_period" | "benefit" | "birth_event" | "milestone";
  title: string;
  description?: string;
  duration?: { start: string; end: string }; // Para períodos
  status?: "confirmed" | "pending" | "missing";
}

interface TimelineChartEnhancedProps {
  events: TimelineEvent[];
  birthDate?: string;
  eventDate?: string; // Data do parto
}

export const TimelineChartEnhanced = ({ events, birthDate, eventDate }: TimelineChartEnhancedProps) => {
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

  // Processar eventos e calcular posições
  const processedTimeline = useMemo(() => {
    if (!events || events.length === 0) return null;

    // Adicionar eventos de marco se disponíveis
    const allEvents: TimelineEvent[] = [...events];
    
    if (birthDate) {
      allEvents.push({
        date: birthDate,
        type: "birth",
        title: "Nascimento",
        description: "Data de nascimento da segurada",
        status: "confirmed"
      });
    }

    if (eventDate) {
      allEvents.push({
        date: eventDate,
        type: "birth_event",
        title: "Parto",
        description: "Data do evento gerador (parto)",
        status: "confirmed"
      });
    }

    // Ordenar por data
    const sorted = allEvents
      .filter(e => e.date || e.duration?.start)
      .sort((a, b) => {
        const dateA = new Date(a.date || a.duration!.start);
        const dateB = new Date(b.date || b.duration!.start);
        return dateA.getTime() - dateB.getTime();
      });

    if (sorted.length === 0) return null;

    // Calcular escala de tempo
    const firstDate = new Date(sorted[0].date || sorted[0].duration!.start);
    const lastDate = eventDate 
      ? new Date(eventDate) 
      : new Date(sorted[sorted.length - 1].date || sorted[sorted.length - 1].duration!.end || sorted[sorted.length - 1].date);
    
    const totalDays = Math.max((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24), 365);

    // Calcular posições relativas (0-100%)
    const positioned = sorted.map(event => {
      const eventDate = new Date(event.date || event.duration!.start);
      const daysSinceStart = (eventDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      const position = (daysSinceStart / totalDays) * 100;

      let width = 0;
      if (event.duration) {
        const endDate = new Date(event.duration.end);
        const durationDays = (endDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
        width = (durationDays / totalDays) * 100;
      }

      return {
        ...event,
        position: Math.max(0, Math.min(100, position)),
        width: Math.max(0, Math.min(100 - position, width))
      };
    });

    return {
      events: positioned,
      startDate: firstDate,
      endDate: lastDate,
      totalYears: Math.ceil(totalDays / 365)
    };
  }, [events, birthDate, eventDate]);

  if (!processedTimeline) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">📅 Linha do Tempo</h3>
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum evento disponível para exibir
        </p>
      </Card>
    );
  }

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      birth: "bg-pink-500",
      rural_period: "bg-green-500",
      urban_period: "bg-blue-500",
      benefit: "bg-purple-500",
      birth_event: "bg-red-500",
      milestone: "bg-yellow-500"
    };
    return colors[type] || "bg-gray-400";
  };

  const getEventIcon = (type: string) => {
    const icons: Record<string, any> = {
      birth: Baby,
      rural_period: Heart,
      urban_period: Briefcase,
      benefit: Calendar,
      birth_event: Baby,
      milestone: AlertCircle
    };
    const Icon = icons[type] || Calendar;
    return <Icon className="w-4 h-4" />;
  };

  const getStatusBadge = (status?: string) => {
    if (status === "confirmed") {
      return <Badge variant="default" className="text-xs">✓ Confirmado</Badge>;
    }
    if (status === "pending") {
      return <Badge variant="secondary" className="text-xs">⏳ Pendente</Badge>;
    }
    if (status === "missing") {
      return <Badge variant="destructive" className="text-xs">✗ Faltando</Badge>;
    }
    return null;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">📅 Linha do Tempo Detalhada</h3>
        <p className="text-sm text-muted-foreground">
          Período: {formatDate(processedTimeline.startDate.toISOString())} até {formatDate(processedTimeline.endDate.toISOString())}
          {" "}({processedTimeline.totalYears} {processedTimeline.totalYears === 1 ? 'ano' : 'anos'})
        </p>
      </div>

      {/* Timeline Visual */}
      <div className="relative h-32 bg-muted/20 rounded-lg mb-6 overflow-hidden">
        {/* Linha base */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border"></div>

        {/* Eventos */}
        <TooltipProvider>
          {processedTimeline.events.map((event, index) => {
            const isPeriod = event.width > 0;
            
            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 cursor-pointer transition-all ${
                      hoveredEvent === index ? 'z-20 scale-110' : 'z-10'
                    }`}
                    style={{
                      left: `${event.position}%`,
                      width: isPeriod ? `${event.width}%` : 'auto'
                    }}
                    onMouseEnter={() => setHoveredEvent(index)}
                    onMouseLeave={() => setHoveredEvent(null)}
                  >
                    {isPeriod ? (
                      // Barra para períodos
                      <div className={`h-6 ${getEventColor(event.type)} rounded opacity-80 hover:opacity-100`}></div>
                    ) : (
                      // Ponto para eventos pontuais
                      <div className={`w-8 h-8 ${getEventColor(event.type)} rounded-full flex items-center justify-center text-white shadow-lg`}>
                        {getEventIcon(event.type)}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                    )}
                    {event.duration ? (
                      <p className="text-xs">
                        {formatDate(event.duration.start)} até {formatDate(event.duration.end)}
                      </p>
                    ) : (
                      <p className="text-xs">{formatDate(event.date)}</p>
                    )}
                    {event.status && getStatusBadge(event.status)}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Lista de eventos */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold mb-2">Eventos Detalhados:</h4>
        {processedTimeline.events.map((event, index) => (
          <div 
            key={index} 
            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
              hoveredEvent === index ? 'bg-muted' : 'hover:bg-muted/50'
            }`}
            onMouseEnter={() => setHoveredEvent(index)}
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <div className={`w-8 h-8 ${getEventColor(event.type)} rounded-full flex items-center justify-center text-white flex-shrink-0`}>
              {getEventIcon(event.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{event.title}</span>
                {event.status && getStatusBadge(event.status)}
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
              )}
              {event.duration ? (
                <p className="text-xs text-muted-foreground">
                  📅 {formatDate(event.duration.start)} → {formatDate(event.duration.end)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  📅 {formatDate(event.date)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-semibold mb-3">Legenda:</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
            <span>Nascimento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Período Rural</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Período Urbano</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span>Benefício</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Parto</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Marco Importante</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
