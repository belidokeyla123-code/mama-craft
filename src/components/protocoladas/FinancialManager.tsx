import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FinancialManagerProps {
  caseId: string;
  initialData?: any;
  onUpdate?: () => void;
}

export default function FinancialManager({ caseId, initialData, onUpdate }: FinancialManagerProps) {
  const [formData, setFormData] = useState({
    // Receita
    valor_recebido: initialData?.valor_recebido || "",
    data_recebimento: initialData?.data_recebimento || "",
    forma_pagamento: initialData?.forma_pagamento || "pix",
    banco: initialData?.banco || "",
    agencia: initialData?.agencia || "",
    conta: initialData?.conta || "",
    
    // Custeio
    custas_processuais: initialData?.custas_processuais || "",
    pericias: initialData?.pericias || "",
    diligencias: initialData?.diligencias || "",
    outros_custos: initialData?.outros_custos || "",
    descricao_outros: initialData?.descricao_outros || "",
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calcularTotais = () => {
    const valorRecebido = parseFloat(formData.valor_recebido) || 0;
    const custas = parseFloat(formData.custas_processuais) || 0;
    const pericias = parseFloat(formData.pericias) || 0;
    const diligencias = parseFloat(formData.diligencias) || 0;
    const outros = parseFloat(formData.outros_custos) || 0;

    const totalCusteio = custas + pericias + diligencias + outros;
    const lucroLiquido = valorRecebido - totalCusteio;
    const margemLucro = valorRecebido > 0 ? (lucroLiquido / valorRecebido * 100) : 0;

    return {
      valorRecebido,
      totalCusteio,
      lucroLiquido,
      margemLucro: margemLucro.toFixed(1)
    };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const totais = calcularTotais();

      const { error } = await supabase
        .from('case_financial')
        .upsert({
          case_id: caseId,
          ...formData,
          valor_recebido: totais.valorRecebido,
          total_custeio: totais.totalCusteio,
          lucro_liquido: totais.lucroLiquido,
          margem_lucro: parseFloat(totais.margemLucro),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'case_id'
        });

      if (error) throw error;

      toast.success("Dados financeiros salvos com sucesso!");
      onUpdate?.();
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar dados financeiros");
    } finally {
      setIsSaving(false);
    }
  };

  const totais = calcularTotais();

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <DollarSign className="h-5 w-5" />
        Gestão Financeira Completa
      </h3>

      {/* RECEITA */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-green-600" />
          <h4 className="font-semibold text-green-600">Receita</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Valor Recebido (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.valor_recebido}
              onChange={(e) => handleChange('valor_recebido', e.target.value)}
            />
          </div>

          <div>
            <Label>Data de Recebimento</Label>
            <Input
              type="date"
              value={formData.data_recebimento}
              onChange={(e) => handleChange('data_recebimento', e.target.value)}
            />
          </div>

          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={formData.forma_pagamento} onValueChange={(value) => handleChange('forma_pagamento', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="ted">TED</SelectItem>
                <SelectItem value="doc">DOC</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Banco</Label>
            <Input
              placeholder="Ex: Banco do Brasil"
              value={formData.banco}
              onChange={(e) => handleChange('banco', e.target.value)}
            />
          </div>

          <div>
            <Label>Agência</Label>
            <Input
              placeholder="0000"
              value={formData.agencia}
              onChange={(e) => handleChange('agencia', e.target.value)}
            />
          </div>

          <div>
            <Label>Conta</Label>
            <Input
              placeholder="00000-0"
              value={formData.conta}
              onChange={(e) => handleChange('conta', e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      {/* CUSTEIO */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-5 w-5 text-red-600" />
          <h4 className="font-semibold text-red-600">Custeio</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Custas Processuais (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.custas_processuais}
              onChange={(e) => handleChange('custas_processuais', e.target.value)}
            />
          </div>

          <div>
            <Label>Perícias (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.pericias}
              onChange={(e) => handleChange('pericias', e.target.value)}
            />
          </div>

          <div>
            <Label>Diligências (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.diligencias}
              onChange={(e) => handleChange('diligencias', e.target.value)}
            />
          </div>

          <div>
            <Label>Outros Custos (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0,00"
              value={formData.outros_custos}
              onChange={(e) => handleChange('outros_custos', e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Descrição de Outros Custos</Label>
            <Input
              placeholder="Ex: Cópias, autenticações, etc."
              value={formData.descricao_outros}
              onChange={(e) => handleChange('descricao_outros', e.target.value)}
            />
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      {/* RESUMO FINANCEIRO */}
      <div className="bg-muted/50 p-4 rounded-lg mb-6">
        <h4 className="font-semibold mb-3">Resumo Financeiro</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Receita Bruta</p>
            <p className="text-lg font-bold text-green-600">
              R$ {totais.valorRecebido.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Custeio Total</p>
            <p className="text-lg font-bold text-red-600">
              R$ {totais.totalCusteio.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lucro Líquido</p>
            <p className={`text-lg font-bold ${totais.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {totais.lucroLiquido.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margem de Lucro</p>
            <div className="flex items-center gap-1">
              <p className={`text-lg font-bold ${parseFloat(totais.margemLucro) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totais.margemLucro}%
              </p>
              {parseFloat(totais.margemLucro) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
          </div>
        </div>

        {parseFloat(totais.margemLucro) < 50 && totais.valorRecebido > 0 && (
          <div className="mt-3 p-2 bg-orange-100 dark:bg-orange-900/20 rounded border border-orange-300">
            <p className="text-xs text-orange-800 dark:text-orange-200">
              ⚠️ Margem de lucro abaixo de 50%. Considere revisar os custos ou estratégia de precificação.
            </p>
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? "Salvando..." : "Salvar Dados Financeiros"}
      </Button>
    </Card>
  );
}
