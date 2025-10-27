import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CaseData } from "@/pages/NewCase";
import { User, Calendar, MapPin, Phone } from "lucide-react";

interface StepBasicInfoProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepBasicInfo = ({ data, updateData }: StepBasicInfoProps) => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Informações Básicas</h2>
        <p className="text-muted-foreground">
          Preencha os dados da autora e do evento
        </p>
      </div>

      {/* Identificação da Autora */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Identificação da Autora
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="authorName">
              Nome Completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorName"
              value={data.authorName}
              onChange={(e) => updateData({ authorName: e.target.value })}
              placeholder="Maria da Silva"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorCpf">
              CPF <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorCpf"
              value={data.authorCpf}
              onChange={(e) => updateData({ authorCpf: e.target.value })}
              placeholder="000.000.000-00"
              maxLength={14}
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
            <Label htmlFor="authorMaritalStatus">Estado Civil</Label>
            <Input
              id="authorMaritalStatus"
              value={data.authorMaritalStatus || ""}
              onChange={(e) => updateData({ authorMaritalStatus: e.target.value })}
              placeholder="Solteira"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="authorAddress" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Endereço
          </Label>
          <Textarea
            id="authorAddress"
            value={data.authorAddress || ""}
            onChange={(e) => updateData({ authorAddress: e.target.value })}
            placeholder="Rua/Sítio, número, bairro, cidade - UF"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="authorPhone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Telefone
            </Label>
            <Input
              id="authorPhone"
              value={data.authorPhone || ""}
              onChange={(e) => updateData({ authorPhone: e.target.value })}
              placeholder="(00) 0000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorWhatsapp">WhatsApp</Label>
            <Input
              id="authorWhatsapp"
              value={data.authorWhatsapp || ""}
              onChange={(e) => updateData({ authorWhatsapp: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
        </div>
      </div>

      {/* Evento */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Evento (Parto/Adoção/Guarda)
        </h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Tipo de Evento <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={data.eventType}
              onValueChange={(value: "parto" | "adocao" | "guarda") =>
                updateData({ eventType: value })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="parto" id="parto" />
                <Label htmlFor="parto" className="font-normal cursor-pointer">
                  Parto
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="adocao" id="adocao" />
                <Label htmlFor="adocao" className="font-normal cursor-pointer">
                  Adoção
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="guarda" id="guarda" />
                <Label htmlFor="guarda" className="font-normal cursor-pointer">
                  Guarda
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventDate">
                Data do Evento <span className="text-destructive">*</span>
              </Label>
              <Input
                id="eventDate"
                type="date"
                value={data.eventDate}
                onChange={(e) => updateData({ eventDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dum">
                DUM (Data da Última Menstruação)
              </Label>
              <Input
                id="dum"
                type="date"
                value={data.dum || ""}
                onChange={(e) => updateData({ dum: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Opcional - para validação do período gestacional
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Perfil */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Perfil da Segurada</h3>
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
      </div>

      {/* Requerimento Administrativo */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasRa"
            checked={data.hasRa}
            onCheckedChange={(checked) =>
              updateData({ hasRa: checked as boolean })
            }
          />
          <Label htmlFor="hasRa" className="font-semibold cursor-pointer">
            Possui Requerimento Administrativo (RA)?
          </Label>
        </div>

        {data.hasRa && (
          <div className="ml-6 space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="raProtocol">Número do Protocolo</Label>
                <Input
                  id="raProtocol"
                  value={data.raProtocol || ""}
                  onChange={(e) => updateData({ raProtocol: e.target.value })}
                  placeholder="NB 000.000.000-0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="raRequestDate">Data do Requerimento</Label>
                <Input
                  id="raRequestDate"
                  type="date"
                  value={data.raRequestDate || ""}
                  onChange={(e) => updateData({ raRequestDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="raDenialDate">Data do Indeferimento</Label>
                <Input
                  id="raDenialDate"
                  type="date"
                  value={data.raDenialDate || ""}
                  onChange={(e) => updateData({ raDenialDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="raDenialReason">Motivo do Indeferimento</Label>
              <Textarea
                id="raDenialReason"
                value={data.raDenialReason || ""}
                onChange={(e) => updateData({ raDenialReason: e.target.value })}
                placeholder="Ex: ausência de início de prova material"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>

      {/* Salário Mínimo de Referência */}
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
