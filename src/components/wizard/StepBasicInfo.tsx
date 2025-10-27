import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { CaseData } from "@/pages/NewCase";
import { User, Calendar, MapPin, Check, AlertTriangle } from "lucide-react";

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Informações Básicas</h2>
        <p className="text-muted-foreground">
          Revise e complete os dados extraídos dos documentos
        </p>
      </div>

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

      {/* SEÇÃO 5: ATIVIDADE RURAL (apenas se especial) */}
      {data.profile === "especial" && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4">Atividade Rural</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ruralActivitySince">Desde quando desenvolve atividade rural? *</Label>
              <Input
                id="ruralActivitySince"
                type="date"
                value={data.ruralActivitySince || ""}
                onChange={(e) => updateData({ ruralActivitySince: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Ou digite "desde nascimento" se aplicável
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="familyMembers">Quem mora com ela?</Label>
              <Textarea
                id="familyMembers"
                value={data.familyMembers?.join(', ') || ""}
                onChange={(e) => updateData({ 
                  familyMembers: e.target.value.split(',').map(m => m.trim()) 
                })}
                placeholder="Ex: Esposo, 2 filhos menores, sogra..."
                rows={2}
              />
            </div>
          </div>
        </Card>
      )}

      {/* SEÇÃO 6: REQUERIMENTO ADMINISTRATIVO */}
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

      {/* SEÇÃO 7: SALÁRIO MÍNIMO DE REFERÊNCIA */}
      <div className="space-y-2">
        <Label htmlFor="salarioMinimoRef">
          Salário Mínimo de Referência (R$)
        </Label>
        <Input
          id="salarioMinimoRef"
          type="number"
          step="0.01"
          value={data.salarioMinimoRef}
          onChange={(e) =>
            updateData({ salarioMinimoRef: parseFloat(e.target.value) })
          }
        />
        <p className="text-xs text-muted-foreground">
          Valor vigente na data do evento (padrão: R$ 1.412,00)
        </p>
      </div>
    </div>
  );
};
