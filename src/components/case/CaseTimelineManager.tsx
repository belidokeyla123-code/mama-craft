import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Check, Edit, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const FASES_PROCESSUAIS = [
  { id: 'distribuida', label: 'Distribuída', description: 'Processo protocolado e distribuído' },
  { id: 'citacao_inss', label: 'Citação do INSS', description: 'INSS foi notificado' },
  { id: 'contestacao', label: 'Contestação', description: 'INSS apresentou defesa' },
  { id: 'impugnacao', label: 'Impugnação/Réplica', description: 'Resposta à contestação' },
  { id: 'despacho_saneador', label: 'Despacho Saneador', description: 'Juiz organiza o processo' },
  { id: 'especificacao_provas', label: 'Especificação de Provas', description: 'Partes indicam provas' },
  { id: 'juntada_documentos', label: 'Juntada de Documentos', description: 'Documentos complementares' },
  { id: 'audiencia_instrucao', label: 'Audiência de Instrução', description: 'Oitiva de testemunhas' },
  { id: 'alegacoes_finais', label: 'Alegações Finais', description: 'Considerações finais' },
  { id: 'acordo', label: 'Acordo', description: 'Acordo entre as partes' },
  { id: 'sentenca', label: 'Sentença', description: 'Decisão do juiz' },
];

interface TimelineEvent {
  id: string;
  fase: string;
  data_fase: string;
  observacoes?: string;
  concluida: boolean;
  ordem: number;
}

interface Props {
  caseId: string;
}

export default function CaseTimelineManager({ caseId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editData, setEditData] = useState({ date: '', observacoes: '' });

  useEffect(() => {
    loadTimeline();
  }, [caseId]);

  const loadTimeline = async () => {
    try {
      const { data, error } = await supabase
        .from('case_timeline')
        .select('*')
        .eq('case_id', caseId)
        .order('ordem', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Erro ao carregar timeline:', error);
      toast.error('Erro ao carregar timeline');
    } finally {
      setLoading(false);
    }
  };

  const toggleFase = async (faseId: string) => {
    const existingEvent = events.find(e => e.fase === faseId);
    
    try {
      if (existingEvent) {
        // Toggle concluída
        const { error } = await supabase
          .from('case_timeline')
          .update({ concluida: !existingEvent.concluida })
          .eq('id', existingEvent.id);

        if (error) throw error;
      } else {
        // Criar nova fase
        const ordem = events.length;
        const { error } = await supabase
          .from('case_timeline')
          .insert({
            case_id: caseId,
            fase: faseId as any,
            data_fase: new Date().toISOString().split('T')[0],
            concluida: true,
            ordem,
          });

        if (error) throw error;
      }

      await loadTimeline();
    } catch (error) {
      console.error('Erro ao atualizar fase:', error);
      toast.error('Erro ao atualizar fase');
    }
  };

  const openEditDialog = (faseId: string) => {
    const event = events.find(e => e.fase === faseId);
    if (event) {
      setEditData({
        date: event.data_fase,
        observacoes: event.observacoes || '',
      });
    } else {
      setEditData({
        date: new Date().toISOString().split('T')[0],
        observacoes: '',
      });
    }
    setEditingPhase(faseId);
  };

  const saveEdit = async () => {
    if (!editingPhase) return;

    try {
      const existingEvent = events.find(e => e.fase === editingPhase);

      if (existingEvent) {
        const { error } = await supabase
          .from('case_timeline')
          .update({
            data_fase: editData.date,
            observacoes: editData.observacoes,
          })
          .eq('id', existingEvent.id);

        if (error) throw error;
      } else {
        const ordem = events.length;
        const { error } = await supabase
          .from('case_timeline')
          .insert({
            case_id: caseId,
            fase: editingPhase as any,
            data_fase: editData.date,
            observacoes: editData.observacoes,
            concluida: true,
            ordem,
          });

        if (error) throw error;
      }

      setEditingPhase(null);
      await loadTimeline();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar fase');
    }
  };

  const isFaseConcluida = (faseId: string) => {
    return events.find(e => e.fase === faseId)?.concluida || false;
  };

  const getFaseDate = (faseId: string) => {
    const event = events.find(e => e.fase === faseId);
    return event?.data_fase ? format(new Date(event.data_fase), 'dd/MM/yyyy', { locale: ptBR }) : null;
  };

  const concluidasCount = events.filter(e => e.concluida).length;
  const progress = (concluidasCount / FASES_PROCESSUAIS.length) * 100;

  if (loading) {
    return <div className="text-muted-foreground">Carregando timeline...</div>;
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Timeline Processual</h3>
          <Badge variant="outline" className="text-sm">
            {concluidasCount}/{FASES_PROCESSUAIS.length} fases
          </Badge>
        </div>

        <div className="space-y-2 mb-4">
          {FASES_PROCESSUAIS.map((fase) => {
            const concluida = isFaseConcluida(fase.id);
            const dataFase = getFaseDate(fase.id);

            return (
              <div
                key={fase.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={concluida}
                  onCheckedChange={() => toggleFase(fase.id)}
                />
                <div className="flex-1">
                  <p className={`font-medium ${concluida ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {fase.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{fase.description}</p>
                </div>
                {concluida && dataFase && (
                  <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                    <Check className="h-3 w-3" />
                    {dataFase}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(fase.id)}
                  className="h-8 w-8"
                >
                  {concluida ? <Edit className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </div>

        <div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground mt-2">
            Progresso: {progress.toFixed(0)}% concluído
          </p>
        </div>
      </Card>

      <Dialog open={!!editingPhase} onOpenChange={() => setEditingPhase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar Fase: {FASES_PROCESSUAIS.find(f => f.id === editingPhase)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Data da Fase</Label>
              <Input
                type="date"
                value={editData.date}
                onChange={(e) => setEditData({ ...editData, date: e.target.value })}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={editData.observacoes}
                onChange={(e) => setEditData({ ...editData, observacoes: e.target.value })}
                placeholder="Adicione observações sobre esta fase..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPhase(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
