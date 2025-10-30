import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2 } from "lucide-react";
import { CaseData } from "@/pages/NewCase";

interface StepBasicInfoBenefitsProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepBasicInfoBenefits = ({ data, updateData }: StepBasicInfoBenefitsProps) => {
  const [manualBenefits, setManualBenefits] = useState<Array<{
    inicio: string;
    fim: string;
    tipo: string;
    numero_beneficio?: string;
  }>>(data.manualBenefits || []);

  const addManualBenefit = () => {
    const newBenefit = {
      inicio: '',
      fim: '',
      tipo: '',
      numero_beneficio: ''
    };
    const updated = [...manualBenefits, newBenefit];
    setManualBenefits(updated);
    updateData({ manualBenefits: updated });
  };

  const removeManualBenefit = (index: number) => {
    const updated = manualBenefits.filter((_, i) => i !== index);
    setManualBenefits(updated);
    updateData({ manualBenefits: updated });
  };

  const updateManualBenefit = (index: number, field: string, value: string) => {
    const updated = [...manualBenefits];
    updated[index] = { ...updated[index], [field]: value };
    setManualBenefits(updated);
    updateData({ manualBenefits: updated });
  };

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Label className="text-sm font-semibold">Benefícios Recebidos (Adicionar Manualmente)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione benefícios que não foram detectados automaticamente no CNIS
          </p>
        </div>
        <Button 
          type="button" 
          size="sm"
          onClick={addManualBenefit}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Benefício
        </Button>
      </div>

      {manualBenefits.length > 0 && (
        <div className="space-y-3">
          {manualBenefits.map((benefit, index) => (
            <Card key={index} className="p-4 bg-blue-50 dark:bg-blue-950">
              <div className="flex justify-between items-start mb-3">
                <Label className="text-sm font-semibold">Benefício #{index + 1}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeManualBenefit(index)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Tipo */}
                <div>
                  <Label className="text-xs">Tipo de Benefício *</Label>
                  <Select
                    value={benefit.tipo}
                    onValueChange={(value) => updateManualBenefit(index, 'tipo', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Salário-maternidade">Salário-maternidade</SelectItem>
                      <SelectItem value="Auxílio-doença rural">Auxílio-doença rural</SelectItem>
                      <SelectItem value="Aposentadoria rural">Aposentadoria rural</SelectItem>
                      <SelectItem value="Pensão por morte">Pensão por morte</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Número */}
                <div>
                  <Label className="text-xs">Número do Benefício (opcional)</Label>
                  <Input
                    type="text"
                    value={benefit.numero_beneficio || ''}
                    onChange={(e) => updateManualBenefit(index, 'numero_beneficio', e.target.value)}
                    placeholder="Ex: 123.456.789-0"
                  />
                </div>

                {/* Data Início */}
                <div>
                  <Label className="text-xs">Data de Início *</Label>
                  <Input
                    type="date"
                    value={benefit.inicio}
                    onChange={(e) => updateManualBenefit(index, 'inicio', e.target.value)}
                  />
                </div>

                {/* Data Fim */}
                <div>
                  <Label className="text-xs">Data de Fim *</Label>
                  <Input
                    type="date"
                    value={benefit.fim}
                    onChange={(e) => updateManualBenefit(index, 'fim', e.target.value)}
                  />
                </div>
              </div>

              {/* Preview */}
              {benefit.inicio && benefit.fim && (
                <div className="mt-3 p-2 bg-white dark:bg-slate-900 rounded text-xs">
                  <strong>Período:</strong> {new Date(benefit.inicio).toLocaleDateString('pt-BR')} até {new Date(benefit.fim).toLocaleDateString('pt-BR')}
                  {benefit.tipo && ` - ${benefit.tipo}`}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {manualBenefits.length === 0 && (
        <Alert>
          <AlertDescription>
            Nenhum benefício adicionado manualmente. Use o botão acima para adicionar.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};