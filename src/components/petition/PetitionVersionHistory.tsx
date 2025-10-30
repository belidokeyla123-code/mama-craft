import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { History, RotateCcw, FileText } from "lucide-react";
import { usePetitionVersions, PetitionVersion } from "@/hooks/usePetitionVersions";
import { toast } from "sonner";

interface PetitionVersionHistoryProps {
  caseId: string;
  onRestore?: (content: string) => void;
}

export const PetitionVersionHistory = ({ caseId, onRestore }: PetitionVersionHistoryProps) => {
  const { versions, loading, getVersionDescription, restoreVersion, compareVersions } = usePetitionVersions(caseId);
  const [selectedVersion, setSelectedVersion] = useState<PetitionVersion | null>(null);
  const [comparing, setComparing] = useState(false);

  const handleRestore = async (version: PetitionVersion) => {
    const restored = await restoreVersion(version);
    if (restored) {
      toast.success(`✅ Versão ${version.version} restaurada!`);
      if (onRestore) {
        onRestore(version.markdown_content);
      }
    } else {
      toast.error('Erro ao restaurar versão');
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <History className="h-4 w-4" />
          Ver Histórico ({versions.length})
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Histórico de Versões da Petição</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : versions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma versão encontrada</p>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-3 pr-4">
              {versions.map((version) => (
                <Card key={version.id} className="relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            v{version.version}
                          </Badge>
                          
                          {version.version === versions[0].version && (
                            <Badge className="bg-green-600">Atual</Badge>
                          )}
                          
                          <span className="text-xs text-muted-foreground">
                            {new Date(version.generated_at).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        <p className="text-sm font-medium">
                          {getVersionDescription(version)}
                        </p>

                        {version.changes_summary && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {version.changes_summary.added_chars > 0 && (
                              <span className="text-green-600">
                                +{version.changes_summary.added_chars} chars
                              </span>
                            )}
                            {version.changes_summary.removed_chars > 0 && (
                              <span className="text-red-600">
                                -{version.changes_summary.removed_chars} chars
                              </span>
                            )}
                            <span>
                              ({version.changes_summary.char_diff_percent}% de diferença)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedVersion(version)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        
                        {version.version !== versions[0].version && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(version)}
                            className="text-blue-600"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {selectedVersion?.id === version.id && (
                      <div className="mt-4 pt-4 border-t">
                        <ScrollArea className="h-[200px]">
                          <div className="prose prose-sm max-w-none">
                            {version.markdown_content.split('\n').slice(0, 20).map((line, i) => (
                              <p key={i} className="text-xs mb-1">{line}</p>
                            ))}
                            {version.markdown_content.split('\n').length > 20 && (
                              <p className="text-xs text-muted-foreground">...</p>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
