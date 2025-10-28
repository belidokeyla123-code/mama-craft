import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  periodo: string;
  tipo: "urbano" | "rural" | "beneficio" | "lacuna";
  status: "reconhecido" | "a_comprovar";
  detalhes?: string;
}

interface TimelineChartProps {
  events: TimelineEvent[];
}

export const TimelineChart = ({ events }: TimelineChartProps) => {
  // Garantir que events seja sempre um array
  const safeEvents = events || [];
  
  const getTypeColor = (tipo: string) => {
    const colors: Record<string, string> = {
      urbano: "bg-blue-500",
      rural: "bg-green-500",
      beneficio: "bg-purple-500",
      lacuna: "bg-gray-300",
    };
    return colors[tipo] || "bg-gray-300";
  };

  const getTypeLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      urbano: "Urbano",
      rural: "Rural",
      beneficio: "Benefício",
      lacuna: "Lacuna",
    };
    return labels[tipo] || tipo;
  };

  const getStatusBadge = (status: string) => {
    if (status === "reconhecido") {
      return <Badge variant="default" className="text-xs">Reconhecido</Badge>;
    }
    return <Badge variant="outline" className="text-xs">A Comprovar</Badge>;
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Linha do Tempo de Contribuição</h3>
      
      <div className="space-y-4">
        {safeEvents.length > 0 ? (
          safeEvents.map((event, index) => (
            <div key={index} className="flex items-start gap-4">
              <div className={`w-3 h-3 rounded-full ${getTypeColor(event.tipo)} flex-shrink-0 mt-1.5`}></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{event.periodo}</span>
                  <Badge variant="secondary" className="text-xs">
                    {getTypeLabel(event.tipo)}
                  </Badge>
                  {getStatusBadge(event.status)}
                </div>
                {event.detalhes && (
                  <p className="text-sm text-muted-foreground">{event.detalhes}</p>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum evento na timeline disponível
          </p>
        )}
      </div>

      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-semibold mb-2">Legenda:</h4>
        <div className="flex flex-wrap gap-3 text-sm">
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
            <span>Benefício Recebido</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <span>Lacuna (sem contribuição)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
