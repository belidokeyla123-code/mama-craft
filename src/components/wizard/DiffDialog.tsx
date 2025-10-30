import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petitionBefore: string;
  petitionAfter: string;
  validationResult: any;
  tentativasUsadas: number;
  totalBrechas: number;
  totalPontosFracos: number;
  totalRecomendacoes: number;
}

export const DiffDialog = ({
  open,
  onOpenChange,
  petitionBefore,
  petitionAfter,
  validationResult,
  tentativasUsadas,
  totalBrechas,
  totalPontosFracos,
  totalRecomendacoes
}: DiffDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📋 Mudanças Aplicadas</DialogTitle>
          <DialogDescription>
            Compare a petição antes e depois das correções
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4">
          {/* ANTES */}
          <div>
            <h4 className="font-bold mb-2 text-red-600">❌ Antes:</h4>
            <ScrollArea className="h-96 border rounded p-3 bg-red-50">
              <pre className="text-xs whitespace-pre-wrap">
                {petitionBefore.substring(0, 2000)}...
              </pre>
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">
              Tamanho: {petitionBefore.length} caracteres
            </p>
          </div>
          
          {/* DEPOIS */}
          <div>
            <h4 className="font-bold mb-2 text-green-600">✅ Depois:</h4>
            <ScrollArea className="h-96 border rounded p-3 bg-green-50">
              <pre className="text-xs whitespace-pre-wrap">
                {petitionAfter.substring(0, 2000)}...
              </pre>
            </ScrollArea>
            <p className="text-xs text-muted-foreground mt-2">
              Tamanho: {petitionAfter.length} caracteres 
              ({((petitionAfter.length - petitionBefore.length) / petitionBefore.length * 100).toFixed(1)}%)
            </p>
          </div>
        </div>
        
        {/* RESUMO DAS MUDANÇAS */}
        {validationResult && (
          <Card className="mt-4 p-4 bg-blue-50">
            <h4 className="font-bold mb-2">📝 Resumo das Correções:</h4>
            <ul className="space-y-1 text-sm">
              <li>• <strong>Brechas corrigidas:</strong> {validationResult.detalhes.brechas_corrigidas}/{totalBrechas}</li>
              <li>• <strong>Pontos fracos fortalecidos:</strong> {validationResult.detalhes.pontos_fracos_corrigidos}/{totalPontosFracos}</li>
              <li>• <strong>Recomendações implementadas:</strong> {validationResult.detalhes.recomendacoes_aplicadas}/{totalRecomendacoes}</li>
              <li>• <strong>Documentos citados corretamente:</strong> {validationResult.detalhes.documentos_corretos ? '✅ Sim' : '⚠️ Parcial'}</li>
              <li>• <strong>Tentativas necessárias:</strong> {tentativasUsadas}/3</li>
            </ul>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};
