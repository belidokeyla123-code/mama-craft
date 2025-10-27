import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  caseId: string;
  onSuccess?: () => void;
}

export default function AcordoSentencaForm({ caseId, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [tipoConclusao, setTipoConclusao] = useState<'acordo' | 'sentenca_procedente' | 'sentenca_improcedente'>('acordo');
  const [valorTotal, setValorTotal] = useState('');
  const [percentualHonorarios, setPercentualHonorarios] = useState(30);
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);

  const valorTotalNum = parseFloat(valorTotal) || 0;
  const valorHonorarios = (valorTotalNum * percentualHonorarios) / 100;
  const valorCliente = valorTotalNum - valorHonorarios;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleSave = async () => {
    if (tipoConclusao !== 'sentenca_improcedente' && valorTotalNum <= 0) {
      toast.error('Informe o valor total');
      return;
    }

    setLoading(true);
    try {
      // Atualizar ou criar registro financeiro
      const financialData: any = {
        case_id: caseId,
        tipo_conclusao: tipoConclusao,
        status: tipoConclusao === 'acordo' ? 'acordo' : 'sentenca',
        observacoes,
      };

      if (tipoConclusao !== 'sentenca_improcedente') {
        financialData.valor_causa = valorTotalNum;
        financialData.valor_recebido = valorTotalNum;
        financialData.valor_cliente = valorCliente;
        financialData.valor_honorarios = valorHonorarios;
        financialData.percentual_honorarios = percentualHonorarios;
        financialData.data_recebimento = dataRecebimento;
      }

      // Verificar se já existe registro financeiro
      const { data: existing } = await supabase
        .from('case_financial')
        .select('id')
        .eq('case_id', caseId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('case_financial')
          .update(financialData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('case_financial')
          .insert(financialData);

        if (error) throw error;
      }

      // Atualizar status do caso
      let newStatus: 'protocolada' | 'acordo' | 'sentenca' | 'em_audiencia' = 'protocolada';
      if (tipoConclusao === 'acordo') newStatus = 'acordo';
      else if (tipoConclusao === 'sentenca_procedente') newStatus = 'sentenca';

      const { error: statusError } = await supabase
        .from('cases')
        .update({ status: newStatus as any })
        .eq('id', caseId);

      if (statusError) console.error('Erro ao atualizar status:', statusError);

      toast.success('Conclusão registrada com sucesso!');
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao registrar conclusão');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTipoConclusao('acordo');
    setValorTotal('');
    setPercentualHonorarios(30);
    setDataRecebimento(new Date().toISOString().split('T')[0]);
    setObservacoes('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="lg" className="gap-2">
          <DollarSign className="h-5 w-5" />
          Registrar Acordo/Sentença
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Conclusão do Processo</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tipo de Conclusão */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Tipo de Conclusão</Label>
            <RadioGroup value={tipoConclusao} onValueChange={(value: any) => setTipoConclusao(value)}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="acordo" id="acordo" />
                <Label htmlFor="acordo" className="cursor-pointer flex-1">
                  <span className="font-medium">Acordo</span>
                  <p className="text-sm text-muted-foreground">Acordo entre as partes</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="sentenca_procedente" id="sentenca_procedente" />
                <Label htmlFor="sentenca_procedente" className="cursor-pointer flex-1">
                  <span className="font-medium">Sentença Procedente</span>
                  <p className="text-sm text-muted-foreground">Decisão favorável do juiz</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50">
                <RadioGroupItem value="sentenca_improcedente" id="sentenca_improcedente" />
                <Label htmlFor="sentenca_improcedente" className="cursor-pointer flex-1">
                  <span className="font-medium">Sentença Improcedente</span>
                  <p className="text-sm text-muted-foreground">Derrota - Pedido negado</p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Valores (apenas se não for improcedente) */}
          {tipoConclusao !== 'sentenca_improcedente' && (
            <>
              <div>
                <Label htmlFor="valorTotal" className="text-base font-semibold">Valor Total</Label>
                <Input
                  id="valorTotal"
                  type="number"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="text-lg mt-2"
                />
              </div>

              <div>
                <Label className="text-base font-semibold">
                  Percentual de Honorários: <span className="text-primary">{percentualHonorarios}%</span>
                </Label>
                <Slider
                  value={[percentualHonorarios]}
                  onValueChange={([val]) => setPercentualHonorarios(val)}
                  min={20}
                  max={40}
                  step={1}
                  className="mt-3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 p-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg border-2 border-green-500/20">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Valor Cliente</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(valorCliente)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Seus Honorários</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(valorHonorarios)}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="dataRecebimento" className="text-base font-semibold">Data de Recebimento</Label>
                <Input
                  id="dataRecebimento"
                  type="date"
                  value={dataRecebimento}
                  onChange={(e) => setDataRecebimento(e.target.value)}
                  className="mt-2"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="observacoes" className="text-base font-semibold">Observações</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes do acordo/sentença..."
              rows={4}
              className="mt-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
