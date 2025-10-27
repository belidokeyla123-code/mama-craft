import { CaseData } from "@/pages/NewCase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, CheckCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface StepDraftProps {
  data: CaseData;
  updateData: (data: Partial<CaseData>) => void;
}

export const StepDraft = ({ data, updateData }: StepDraftProps) => {
  const [copied, setCopied] = useState(false);

  const generateExceptionLegalText = (exceptions?: Array<{ type: string; description: string }>) => {
    if (!exceptions || exceptions.length === 0) return '';
    
    return exceptions.map(exc => {
      switch(exc.type) {
        case 'obito_filho':
          return `\n**SITUAÇÃO ESPECIAL - ÓBITO DO FILHO:**\n\nImportante ressaltar que, embora o filho tenha falecido, o direito ao salário-maternidade persiste, conforme jurisprudência consolidada do STJ (REsp 1.452.732/SP), uma vez que o fato gerador do benefício é o parto, independentemente da sobrevivência do nascituro.\n\nDescrição: ${exc.description}`;
        
        case 'gemeos':
          return `\n**SITUAÇÃO ESPECIAL - PARTO MÚLTIPLO:**\n\nTrata-se de caso de parto múltiplo (gêmeos), o que, segundo jurisprudência pacífica, pode ensejar o pagamento de salário-maternidade em dobro, considerando a duplicidade de eventos geradores.\n\nDescrição: ${exc.description}`;
        
        case 'prematuridade':
          return `\n**SITUAÇÃO ESPECIAL - PREMATURIDADE:**\n\nO parto ocorreu de forma prematura, conforme documentação anexa, o que não afasta o direito ao benefício, visto que a lei não estabelece idade gestacional mínima.\n\nDescrição: ${exc.description}`;
        
        default:
          return `\n**SITUAÇÃO ESPECIAL:**\n\n${exc.description}`;
      }
    }).join('\n');
  };

  const mockDraft = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ FEDERAL DA VARA ÚNICA DE [CIDADE]/[UF]

SALÁRIO-MATERNIDADE

${data.authorName}, brasileira, ${data.authorMaritalStatus || "estado civil"}, portadora do CPF ${data.authorCpf}${data.authorRg ? `, RG ${data.authorRg}` : ''}, residente e domiciliada ${data.authorAddress || "endereço"}, vem, por intermédio de seu advogado, com fundamento nos artigos 71 e seguintes da Lei 8.213/91, propor a presente

AÇÃO DE CONCESSÃO DE SALÁRIO-MATERNIDADE

em face do INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS, pelos fatos e fundamentos jurídicos a seguir expostos:

I - DOS FATOS

A autora é ${data.profile === "especial" ? "segurada especial" : "segurada urbana"} e teve ${data.eventType === "parto" ? `parto de ${data.childName || "seu filho"}` : data.eventType} em ${data.childBirthDate || data.eventDate}.${data.fatherName ? ` O pai da criança é ${data.fatherName}.` : ''}
${data.hasSpecialSituation && data.specialNotes ? generateExceptionLegalText(data.exceptions) : ''}
${data.profile === "especial" && data.ruralActivitySince ? `\n\nA autora desenvolve atividade rural desde ${data.ruralActivitySince}${data.landOwnershipType === 'terceiro' && data.landOwnerName ? `, em regime de economia familiar, em terra de propriedade de ${data.landOwnerName}` : ''}.` : ''}
${data.hasRa && data.raProtocol ? `\n\nA autora requereu administrativamente o benefício sob o protocolo ${data.raProtocol} em ${data.raRequestDate}, sendo indeferido em ${data.raDenialDate} sob o fundamento de: "${data.raDenialReason}".` : ''}

[Análise detalhada será gerada pela IA nas próximas fases]

II - DO DIREITO

[Fundamentos legais e jurisprudência serão inseridos aqui]

III - DOS PEDIDOS

Diante do exposto, requer:

a) A concessão do benefício de salário-maternidade;${data.exceptions?.some(e => e.type === 'gemeos') ? '\na.1) Considerando o parto múltiplo (gêmeos), o pagamento em dobro do benefício;' : ''}
b) O pagamento das parcelas de 120 dias no valor de R$ ${data.salarioMinimoRef.toFixed(2)} cada;
c) Valor da causa: R$ ${(data.salarioMinimoRef * 4).toFixed(2)};
d) A citação do INSS.

Termos em que,
Pede deferimento.

[Cidade], [Data]

[Advogado]
OAB/[UF] [número]`;

  const handleCopy = () => {
    navigator.clipboard.writeText(mockDraft);
    setCopied(true);
    toast.success("Minuta copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    toast.info("Download DOCX será implementado nas próximas fases");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" />
          Minuta da Petição Inicial
        </h2>
        <p className="text-muted-foreground">
          Preview e exportação da petição gerada
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleCopy} className="gap-2">
          {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado!" : "Copiar"}
        </Button>
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Baixar DOCX
        </Button>
      </div>

      <Card className="p-6">
        <div className="bg-muted/30 p-6 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-[600px] overflow-y-auto">
          {mockDraft}
        </div>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        Esta é uma versão simplificada. A geração completa com seu template DOCX será implementada nas próximas fases.
      </div>
    </div>
  );
};
