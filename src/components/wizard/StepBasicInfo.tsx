import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Sparkles, User, Calendar, MapPin, AlertTriangle, Plus, Trash2, RefreshCw } from "lucide-react";
import { CaseData, RuralPeriod, UrbanPeriod } from "@/pages/NewCase";
import { getSalarioMinimoHistory, getSalarioMinimoByDate } from "@/lib/salarioMinimo";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StepBasicInfoProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepBasicInfo = ({ data, updateData }: StepBasicInfoProps) => {
  const autoFilledFields = data.autoFilledFields || [];
  const missingFields = data.missingFields || [];

  const isAutoFilled = (fieldName: string) => {
    return autoFilledFields.includes(fieldName);
  };

  const FieldBadge = ({ fieldName }: { fieldName: string }) => {
    if (isAutoFilled(fieldName)) {
      return (
        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
          <Sparkles className="h-3 w-3 mr-1" /> Auto-preenchido
        </Badge>
      );
    }
    if (data.missingFields?.includes(fieldName)) {
      return (
        <Badge variant="outline" className="ml-2 text-red-600 border-red-600">
          <AlertTriangle className="h-3 w-3 mr-1" /> Preencher
        </Badge>
      );
    }
    return null;
  };

  // Calcular histórico do salário mínimo quando a data de nascimento da criança mudar
  useEffect(() => {
    if (data.childBirthDate) {
      const birthYear = new Date(data.childBirthDate).getFullYear();
      const currentYear = new Date().getFullYear();
      const history = getSalarioMinimoHistory(birthYear, currentYear);
      const currentSalario = history[history.length - 1]?.value || 1412.00;
      
      updateData({ 
        salarioMinimoHistory: history,
        salarioMinimoRef: currentSalario
      });
    }
  }, [data.childBirthDate]);

  const addRuralPeriod = () => {
    const newPeriod: RuralPeriod = {
      startDate: "",
      endDate: "",
      location: "",
      withWhom: "",
      activities: ""
    };
    updateData({ 
      ruralPeriods: [...(data.ruralPeriods || []), newPeriod] 
    });
  };

  const removeRuralPeriod = (index: number) => {
    const updated = data.ruralPeriods?.filter((_, i) => i !== index) || [];
    updateData({ ruralPeriods: updated });
  };

  const updateRuralPeriod = (index: number, field: keyof RuralPeriod, value: string) => {
    const updated = [...(data.ruralPeriods || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ ruralPeriods: updated });
  };

  const addUrbanPeriod = () => {
    const newPeriod: UrbanPeriod = {
      startDate: "",
      endDate: "",
      details: ""
    };
    updateData({ 
      urbanPeriods: [...(data.urbanPeriods || []), newPeriod] 
    });
  };

  const removeUrbanPeriod = (index: number) => {
    const updated = data.urbanPeriods?.filter((_, i) => i !== index) || [];
    updateData({ urbanPeriods: updated });
  };

  const updateUrbanPeriod = (index: number, field: keyof UrbanPeriod, value: string) => {
    const updated = [...(data.urbanPeriods || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ urbanPeriods: updated });
  };

  const handleReprocessDocuments = async () => {
    if (!data.caseId) {
      toast.error("ID do caso não encontrado");
      return;
    }

    try {
      toast.loading("Re-processando documentos com IA...");
      
      // Buscar documentos do caso
      const { data: documents, error: docsError } = await supabase
        .from("documents")
        .select("id")
        .eq("case_id", data.caseId);

      if (docsError) throw docsError;

      if (!documents || documents.length === 0) {
        toast.error("Nenhum documento encontrado");
        return;
      }

      const documentIds = documents.map(doc => doc.id);

      // Chamar edge function
      const { data: result, error } = await supabase.functions.invoke("process-documents-with-ai", {
        body: { caseId: data.caseId, documentIds }
      });

      if (error) throw error;

      toast.success("Documentos re-processados com sucesso!");
      window.location.reload(); // Recarregar para pegar novos dados
    } catch (error) {
      console.error("Erro ao re-processar documentos:", error);
      toast.error("Falha ao re-processar documentos");
    }
  };

  // Alertas para campos críticos vazios
  const criticalFieldsEmpty = {
    childName: !data.childName,
    childBirthDate: !data.childBirthDate,
    authorName: !data.authorName,
    authorCpf: !data.authorCpf,
  };

  const hasCriticalMissing = Object.values(criticalFieldsEmpty).some(v => v);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Informações Básicas</h2>
          <p className="text-muted-foreground">
            Revise e complete os dados extraídos dos documentos
          </p>
        </div>
        
        {data.caseId && (
          <Button 
            onClick={handleReprocessDocuments}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Re-processar Documentos
          </Button>
        )}
      </div>

      {/* ALERTA DE CAMPOS CRÍTICOS FALTANTES */}
      {hasCriticalMissing && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Atenção! Campos críticos não preenchidos</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ml-4 mt-2">
              {criticalFieldsEmpty.childName && <li>Nome da criança está vazio (verifique certidão de nascimento)</li>}
              {criticalFieldsEmpty.childBirthDate && <li>Data de nascimento da criança está vazia</li>}
              {criticalFieldsEmpty.authorName && <li>Nome da autora/mãe está vazio</li>}
              {criticalFieldsEmpty.authorCpf && <li>CPF da autora/mãe está vazio</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* SEÇÃO 1: IDENTIFICAÇÃO DA AUTORA (MÃE) */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Identificação da Autora (Mãe)
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="authorName">
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <FieldBadge fieldName="authorName" />
            </div>
            <Input
              id="authorName"
              value={data.authorName}
              onChange={(e) => updateData({ authorName: e.target.value })}
              placeholder="Maria da Silva"
              className={isAutoFilled('authorName') ? 'border-green-500' : ''}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="authorCpf">
                CPF <span className="text-destructive">*</span>
              </Label>
              <FieldBadge fieldName="authorCpf" />
            </div>
            <Input
              id="authorCpf"
              value={data.authorCpf}
              onChange={(e) => updateData({ authorCpf: e.target.value })}
              placeholder="000.000.000-00"
              maxLength={14}
              className={isAutoFilled('authorCpf') ? 'border-green-500' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorRg">RG</Label>
            <Input
              id="authorRg"
              value={data.authorRg || ""}
              onChange={(e) => updateData({ authorRg: e.target.value })}
              placeholder="12.345.678-9"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorBirthDate">Data de Nascimento</Label>
            <Input
              id="authorBirthDate"
              type="date"
              value={data.authorBirthDate || ""}
              onChange={(e) => updateData({ authorBirthDate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorMaritalStatus">Estado Civil *</Label>
            <Select
              value={data.authorMaritalStatus || ""}
              onValueChange={(value) => updateData({ authorMaritalStatus: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solteira">Solteira</SelectItem>
                <SelectItem value="casada">Casada</SelectItem>
                <SelectItem value="uniao_estavel">União Estável</SelectItem>
                <SelectItem value="divorciada">Divorciada</SelectItem>
                <SelectItem value="viuva">Viúva</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="authorAddress" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Endereço Completo
          </Label>
          <Textarea
            id="authorAddress"
            value={data.authorAddress || ""}
            onChange={(e) => updateData({ authorAddress: e.target.value })}
            placeholder="Rua/Sítio, número, bairro, cidade - UF"
            rows={2}
          />
        </div>
      </Card>

      {/* SEÇÃO 2: DADOS DA CRIANÇA */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Dados da Criança</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="childName">Nome do Filho/Filha *</Label>
              <FieldBadge fieldName="childName" />
            </div>
            <Input
              id="childName"
              value={data.childName || ""}
              onChange={(e) => updateData({ childName: e.target.value })}
              placeholder="João da Silva"
              className={autoFilledFields.includes('childName') ? 'border-green-500' : ''}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <Label htmlFor="childBirthDate">Data de Nascimento *</Label>
              <FieldBadge fieldName="childBirthDate" />
            </div>
            <Input
              id="childBirthDate"
              type="date"
              value={data.childBirthDate || data.eventDate}
              onChange={(e) => {
                updateData({ 
                  childBirthDate: e.target.value,
                  eventDate: e.target.value 
                });
              }}
              className={autoFilledFields.includes('childBirthDate') ? 'border-green-500' : ''}
            />
            <p className="text-xs text-muted-foreground">
              Esta é a "Data do Evento"
            </p>
          </div>
          
          <div className="space-y-2 col-span-2">
            <Label htmlFor="fatherName">Nome do Pai</Label>
            <Input
              id="fatherName"
              value={data.fatherName || ""}
              onChange={(e) => updateData({ fatherName: e.target.value })}
              placeholder="José da Silva"
            />
          </div>
        </div>
      </Card>

      {/* SEÇÃO 3: PERFIL DA SEGURADA */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Perfil da Segurada</h3>
        <RadioGroup
          value={data.profile}
          onValueChange={(value: "especial" | "urbana") =>
            updateData({ profile: value })
          }
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="especial" id="especial" />
            <Label htmlFor="especial" className="font-normal cursor-pointer">
              Segurada Especial (Rural/Economia Familiar)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="urbana" id="urbana" />
            <Label htmlFor="urbana" className="font-normal cursor-pointer">
              Segurada Urbana
            </Label>
          </div>
        </RadioGroup>
      </Card>

      {/* SEÇÃO 4: PROPRIETÁRIO DA TERRA (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Proprietário da Terra</h3>
          
          <div className="space-y-4">
            <div>
              <Label>Tipo de Propriedade *</Label>
              <RadioGroup
                value={data.landOwnershipType || ""}
                onValueChange={(value: "propria" | "terceiro") =>
                  updateData({ landOwnershipType: value })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="propria" id="propria" />
                  <Label htmlFor="propria" className="font-normal cursor-pointer">
                    Terra Própria
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="terceiro" id="terceiro" />
                  <Label htmlFor="terceiro" className="font-normal cursor-pointer">
                    Terra de Terceiro
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {data.landOwnershipType === 'terceiro' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="landOwnerName">Nome do Proprietário *</Label>
                  <Input
                    id="landOwnerName"
                    value={data.landOwnerName || ""}
                    onChange={(e) => updateData({ landOwnerName: e.target.value })}
                    placeholder="Nome do proprietário"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landOwnerCpf">CPF do Proprietário</Label>
                  <Input
                    id="landOwnerCpf"
                    value={data.landOwnerCpf || ""}
                    onChange={(e) => updateData({ landOwnerCpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landOwnerRg">RG do Proprietário</Label>
                  <Input
                    id="landOwnerRg"
                    value={data.landOwnerRg || ""}
                    onChange={(e) => updateData({ landOwnerRg: e.target.value })}
                    placeholder="12.345.678-9"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* SEÇÃO 5: PERÍODOS DE ATIVIDADE RURAL (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Períodos de Atividade Rural</h3>
            <Button onClick={addRuralPeriod} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Período
            </Button>
          </div>
          
          <div className="space-y-4">
            {(data.ruralPeriods || []).map((period, idx) => (
              <div key={idx} className="p-4 border rounded-lg bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Período {idx + 1}</h4>
                  <Button
                    onClick={() => removeRuralPeriod(idx)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Início *</Label>
                    <Input
                      type="date"
                      value={period.startDate}
                      onChange={(e) => updateRuralPeriod(idx, 'startDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Fim (deixe vazio se ainda ativo)</Label>
                    <Input
                      type="date"
                      value={period.endDate || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'endDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label>Local (Sítio/Fazenda/Município) *</Label>
                    <Input
                      value={period.location}
                      onChange={(e) => updateRuralPeriod(idx, 'location', e.target.value)}
                      placeholder="Ex: Sítio São José, Município X - UF"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Com quem morava</Label>
                    <Input
                      value={period.withWhom || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'withWhom', e.target.value)}
                      placeholder="Ex: com minha mãe, com meu esposo"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Atividades desenvolvidas</Label>
                    <Input
                      value={period.activities || ""}
                      onChange={(e) => updateRuralPeriod(idx, 'activities', e.target.value)}
                      placeholder="Ex: lavoura, criação de gado"
                    />
                  </div>
                </div>
              </div>
            ))}
            
            {(!data.ruralPeriods || data.ruralPeriods.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum período rural cadastrado. Clique em "Adicionar Período" para começar.
              </p>
            )}
          </div>
          
          <div className="space-y-2 mt-4">
            <Label htmlFor="familyMembers">Quem mora com ela atualmente?</Label>
            <Textarea
              id="familyMembers"
              value={data.familyMembers?.join(', ') || ""}
              onChange={(e) => updateData({ 
                familyMembers: e.target.value.split(',').map(m => m.trim()).filter(m => m) 
              })}
              placeholder="Ex: Esposo, 2 filhos menores, sogra..."
              rows={2}
            />
          </div>
        </Card>
      )}

      {/* SEÇÃO 6: PERÍODOS URBANOS (se houver) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold">Períodos Urbanos (se houver)</h3>
              <p className="text-sm text-muted-foreground">Períodos em que trabalhou em zona urbana</p>
            </div>
            <Button onClick={addUrbanPeriod} size="sm" variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Período Urbano
            </Button>
          </div>
          
          <div className="space-y-4">
            {(data.urbanPeriods || []).map((period, idx) => (
              <div key={idx} className="p-4 border rounded-lg bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Período Urbano {idx + 1}</h4>
                  <Button
                    onClick={() => removeUrbanPeriod(idx)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Início *</Label>
                    <Input
                      type="date"
                      value={period.startDate}
                      onChange={(e) => updateUrbanPeriod(idx, 'startDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Fim *</Label>
                    <Input
                      type="date"
                      value={period.endDate}
                      onChange={(e) => updateUrbanPeriod(idx, 'endDate', e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label>Detalhes (empresa, função, etc)</Label>
                    <Textarea
                      value={period.details}
                      onChange={(e) => updateUrbanPeriod(idx, 'details', e.target.value)}
                      placeholder="Ex: Trabalhou como vendedora na empresa X"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* SEÇÃO 7: REQUERIMENTO ADMINISTRATIVO */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Requerimento Administrativo</h3>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasRa"
              checked={data.hasRa}
              onCheckedChange={(checked) =>
                updateData({ hasRa: checked as boolean })
              }
            />
            <Label htmlFor="hasRa" className="cursor-pointer">
              Possui Requerimento Administrativo?
            </Label>
          </div>

          {data.hasRa && (
            <div className="ml-6 space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="raProtocol">Número do Protocolo (NB) *</Label>
                  <Input
                    id="raProtocol"
                    value={data.raProtocol || ""}
                    onChange={(e) => updateData({ raProtocol: e.target.value })}
                    placeholder="NB 000.000.000-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="raRequestDate">Data do Requerimento *</Label>
                  <Input
                    id="raRequestDate"
                    type="date"
                    value={data.raRequestDate || ""}
                    onChange={(e) => updateData({ raRequestDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="raDenialDate">Data do Indeferimento *</Label>
                  <Input
                    id="raDenialDate"
                    type="date"
                    value={data.raDenialDate || ""}
                    onChange={(e) => updateData({ raDenialDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="raDenialReason">Motivo do Indeferimento *</Label>
                <Textarea
                  id="raDenialReason"
                  value={data.raDenialReason || ""}
                  onChange={(e) => updateData({ raDenialReason: e.target.value })}
                  placeholder="Copie o motivo exato do processo administrativo..."
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* SEÇÃO 8: SALÁRIO MÍNIMO DE REFERÊNCIA COM HISTÓRICO */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Salário Mínimo de Referência</h3>
        
        {data.childBirthDate ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg">
              <div>
                <Label className="text-sm text-muted-foreground">Ano de Nascimento da Criança</Label>
                <p className="text-lg font-semibold">{new Date(data.childBirthDate).getFullYear()}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Salário Mínimo em {new Date(data.childBirthDate).getFullYear()}</Label>
                <p className="text-lg font-semibold">
                  R$ {getSalarioMinimoByDate(data.childBirthDate).toFixed(2)}
                </p>
              </div>
            </div>

            <div>
              <Label className="font-semibold mb-2 block">Projeção até {new Date().getFullYear()}:</Label>
              <div className="bg-muted/50 p-4 rounded-lg max-h-60 overflow-y-auto">
                <div className="space-y-1">
                  {(data.salarioMinimoHistory || []).map(item => (
                    <div key={item.year} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-sm">{item.year}</span>
                      <span className="font-mono text-sm font-medium">R$ {item.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <Label className="text-sm text-muted-foreground block mb-1">Salário Mínimo Atual ({new Date().getFullYear()})</Label>
              <p className="text-2xl font-bold text-primary">
                R$ {data.salarioMinimoRef.toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Preencha a data de nascimento da criança para calcular o histórico do salário mínimo
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
};