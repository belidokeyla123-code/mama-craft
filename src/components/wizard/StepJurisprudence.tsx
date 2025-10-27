import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Scale } from "lucide-react";

interface StepJurisprudenceProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepJurisprudence = ({ data, updateData }: StepJurisprudenceProps) => {
  // Mock data - será substituído por busca real
  const mockJuris = [
    {
      tribunal: "TNU",
      processo: "PEDILEF 50574142120184047100",
      tese: "O início de prova material pode ser complementado pela prova testemunhal",
      link: "#",
    },
    {
      tribunal: "STJ",
      processo: "REsp 1.354.908/SP",
      tese: "Segurada especial: dispensada a carência para salário-maternidade",
      link: "#",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Scale className="h-7 w-7 text-primary" />
          Jurisprudência e Súmulas
        </h2>
        <p className="text-muted-foreground">
          Precedentes relevantes para fundamentar a petição
        </p>
      </div>

      <div className="space-y-4">
        {mockJuris.map((juris, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <Badge variant="secondary">{juris.tribunal}</Badge>
              <a
                href={juris.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                Ver íntegra
              </a>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Processo: {juris.processo}
            </p>
            <p className="font-medium">{juris.tese}</p>
          </Card>
        ))}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        A busca inteligente de jurisprudência será implementada nas próximas fases.
      </div>
    </div>
  );
};
