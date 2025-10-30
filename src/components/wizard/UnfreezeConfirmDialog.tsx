import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, AlertTriangle } from "lucide-react";

interface UnfreezeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  action: string;
}

export const UnfreezeConfirmDialog = ({ 
  open, 
  onOpenChange, 
  onConfirm,
  action
}: UnfreezeConfirmDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
              <Lock className="h-6 w-6 text-amber-600 dark:text-amber-500" />
            </div>
            <AlertDialogTitle className="text-xl">
              Versão Final Detectada
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 text-base">
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Este caso possui uma versão final congelada.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Para {action}, a versão final será descongelada e uma nova análise será iniciada.
                </p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <p className="font-medium">O que acontecerá:</p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-muted-foreground">
                <li>A minuta atual será mantida no histórico</li>
                <li>Análise, jurisprudência e teses serão atualizadas</li>
                <li>Uma nova minuta será gerada</li>
                <li>Você poderá salvar como nova versão final depois</li>
              </ul>
            </div>

            <p className="text-sm font-medium">
              Deseja descongelar e continuar?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-amber-600 hover:bg-amber-700">
            Descongelar e Continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
