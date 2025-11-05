import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Send, FileText, CheckCircle, AlertCircle, Loader2, Mic, X, RefreshCw } from "lucide-react";
import { convertPDFToImages, isPDF } from "@/lib/pdfToImages";
import { useCaseOrchestration } from "@/hooks/useCaseOrchestration";
import { useTabSync } from "@/hooks/useTabSync";
import { DocumentUploadInline } from "./DocumentUploadInline";
import { PasteDataInline } from "./PasteDataInline";
import { UnfreezeConfirmDialog } from "./UnfreezeConfirmDialog";
import { useUnfreeze } from "@/hooks/useUnfreeze";

interface Message {
  role: "assistant" | "user";
  content: string;
  extractedData?: any;
}

interface StepChatIntakeProps {
  data: any;
  updateData: (data: any) => void;
  onComplete: () => void;
}

export const StepChatIntake = ({ data, updateData, onComplete }: StepChatIntakeProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Vou te ajudar a criar uma nova petição de salário-maternidade. Para começar, faça upload dos documentos da cliente (certidões, comprovantes, documentos de identificação, etc.). Você também pode usar o microfone para narrar informações especiais.",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [failedPdfs, setFailedPdfs] = useState<string[]>([]);
  const [showUnfreezeDialog, setShowUnfreezeDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // Sistema de orquestração para disparar pipeline completo
  const { triggerFullPipeline } = useCaseOrchestration({ 
    caseId: data.caseId || '', 
    enabled: !!data.caseId 
  });

  const { unfreezeCase } = useUnfreeze();

  // ✅ CORREÇÃO #6: Chamar migração automática ao montar
  useEffect(() => {
    const migrateBenefits = async () => {
      if (!data.caseId) return;
      
      console.log('[CHAT] 🔄 Migrando benefícios de extrações para benefit_history');
      
      try {
        const { data: result, error } = await supabase.functions.invoke(
          'migrate-extractions-to-history',
          { body: { caseId: data.caseId } }
        );

        if (error) {
          console.error('[CHAT] ⚠️ Erro na migração:', error);
          return;
        }

        if (result?.migratedCount > 0) {
          console.log(`[CHAT] ✅ ${result.migratedCount} benefício(s) migrado(s)`);
          toast({
            title: "Benefícios anteriores detectados",
            description: `${result.migratedCount} benefício(s) carregado(s) dos documentos`,
          });
        }
      } catch (error) {
        console.error('[CHAT] Erro na migração:', error);
      }
    };

    migrateBenefits();
  }, [data.caseId]);

  // ✅ MUDANÇA 10: DELETADO - useEffect problemático que causava loop de erro
  // Este código foi removido porque causava toasts infinitos de erro
  // A conversão de PDFs agora é automática no frontend durante o upload

  // 🆕 DEBUG: Log quando o componente monta e quando há caseId
  console.log('[CHAT INTAKE] Componente montado');
  console.log('[CHAT INTAKE] Case ID atual:', data.caseId);
  console.log('[CHAT INTAKE] triggerFullPipeline disponível:', !!triggerFullPipeline);
  console.log('[CHAT INTAKE] Dados atuais:', {
    authorName: data.authorName,
    authorCpf: data.authorCpf,
    childName: data.childName,
    childBirthDate: data.childBirthDate
  });

  // ✅ MUDANÇA 7: Carregar dados existentes do banco ao montar o componente
  useEffect(() => {
    const loadExistingData = async () => {
      if (!data.caseId) return;
      
      // Buscar dados do caso
      const { data: caseData, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', data.caseId)
        .single();
      
      if (error || !caseData) return;
      
      // Verificar se há dados relevantes preenchidos
      const hasData = caseData.author_name || caseData.author_cpf || 
                      caseData.author_rg || caseData.author_address ||
                      caseData.child_name || caseData.child_birth_date;
      
      if (hasData && messages.length === 0) {
        // Criar mensagem resumindo dados existentes
        const summary = [];
        if (caseData.author_name) summary.push(`👤 Nome: ${caseData.author_name}`);
        if (caseData.author_cpf) summary.push(`🆔 CPF: ${caseData.author_cpf}`);
        if (caseData.author_rg) summary.push(`📋 RG: ${caseData.author_rg}`);
        if (caseData.author_address) summary.push(`📍 Endereço: ${caseData.author_address}`);
        if (caseData.child_name) summary.push(`👶 Filho: ${caseData.child_name}`);
        if (caseData.child_birth_date) summary.push(`🎂 Nascimento: ${new Date(caseData.child_birth_date).toLocaleDateString('pt-BR')}`);
        
        setMessages([{
          role: 'assistant',
          content: `📊 **Dados já cadastrados:**\n\n${summary.join('\n')}\n\n✅ Essas informações foram extraídas dos documentos ou cadastradas manualmente. Você pode enviar mais documentos ou fazer perguntas sobre o caso!`
        }]);
      }
    };
    
    loadExistingData();
  }, [data.caseId]); // Executa quando caseId muda

  // ✅ MUDANÇA 8: Escutar atualizações de outras abas em tempo real
  useTabSync({
    caseId: data.caseId || '',
    events: ['case-updated', 'extractions-updated', 'benefits-updated'],
    onSync: async (detail) => {
      console.log('[CHAT] 🔄 Dados atualizados em outra aba, recarregando...');
      
      // Recarregar dados do banco
      const { data: freshData, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', data.caseId)
        .single();
      
      if (error || !freshData) return;
      
      // Atualizar estado local via updateData
      updateData({
        authorName: freshData.author_name,
        authorCpf: freshData.author_cpf,
        authorRg: freshData.author_rg,
        authorAddress: freshData.author_address,
        childName: freshData.child_name,
        childBirthDate: freshData.child_birth_date,
        fatherName: freshData.father_name,
        // ... outros campos relevantes
      });
      
      // Adicionar mensagem visual no chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🔄 Dados atualizados! Mudanças feitas em outra aba foram sincronizadas.`
      }]);
    }
  });

  /**
   * ⚡ FASE 2: Compressão adaptativa de imagens
   * Reduz tamanho de imagens grandes para acelerar upload e análise
   */
  const compressImageForAI = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Compressão adaptativa baseada no tamanho do arquivo
        let MAX_SIZE: number;
        if (file.size > 1024 * 1024) {
          MAX_SIZE = 1024; // Imagens >1MB: reduzir para 1024px
        } else if (file.size > 500 * 1024) {
          MAX_SIZE = 1536; // Imagens 500KB-1MB: reduzir para 1536px
        } else {
          // <500KB: não comprimir
          resolve(file);
          return;
        }
        
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > MAX_SIZE) {
          height = (height * MAX_SIZE) / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = (width * MAX_SIZE) / height;
          height = MAX_SIZE;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converter para blob com qualidade 0.7
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Falha ao comprimir imagem'));
          }
        }, file.type, 0.7);
      };
      
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Helper para labels de tipos de documentos
  const getDocTypeLabel = (docType: string): string => {
    const labels: Record<string, string> = {
      'certidao_nascimento': '📄 Certidão de Nascimento',
      'processo_administrativo': '📋 Processo INSS',
      'autodeclaracao_rural': '🌾 Autodeclaração Rural',
      'documento_terra': '🏡 Documento da Terra',
      'identificacao': '🪪 Identificação',
      'comprovante_residencia': '🏠 Comprovante de Residência',
      'procuracao': '📝 Procuração',
      'cnis': '📊 CNIS',
      'historico_escolar': '📚 Histórico Escolar',
      'declaracao_saude_ubs': '🏥 Declaração de Saúde',
      'outro': '📎 Outro Documento'
    };
    return labels[docType] || '📎 Documento';
  };

  // 🔒 Validar e garantir que case_assignment existe antes de upload
  const ensureCaseAssignment = async (caseId: string, userId: string): Promise<boolean> => {
    try {
      console.log('[ASSIGNMENT] 🔍 Verificando case_assignment...', { caseId, userId });

      // 1. Verificar se já existe
      const { data: existing, error: checkError } = await supabase
        .from('case_assignments')
        .select('id')
        .eq('case_id', caseId)
        .eq('user_id', userId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('[ASSIGNMENT] ❌ Erro ao verificar:', checkError);
        throw checkError;
      }

      if (existing) {
        console.log('[ASSIGNMENT] ✅ Assignment já existe:', existing.id);
        return true;
      }

      // 2. Criar se não existir (com RETURNING *)
      console.log('[ASSIGNMENT] ➕ Criando assignment...');
      const { data: assignment, error: insertError } = await supabase
        .from('case_assignments')
        .insert({
          case_id: caseId,
          user_id: userId
        })
        .select('id')
        .single();

      // Se erro 23505 (duplicate), buscar existente
      if (insertError) {
        if (insertError.code === '23505') {
          console.log('[ASSIGNMENT] ℹ️ Assignment já existe, buscando...');
          const { data: existing, error: fetchError } = await supabase
            .from('case_assignments')
            .select('id')
            .eq('case_id', caseId)
            .eq('user_id', userId)
            .single();
          
          if (fetchError || !existing) {
            console.error('[ASSIGNMENT] ❌ Erro ao buscar existente:', fetchError);
            throw new Error('Falha ao validar assignment existente');
          }
          
          console.log('[ASSIGNMENT] ✅ Assignment existente validado:', existing.id);
          return true;
        }
        
        // Outro erro - lançar
        console.error('[ASSIGNMENT] ❌ Erro ao criar:', insertError);
        throw new Error(`Falha ao atribuir caso: ${insertError.message}`);
      }

      console.log('[ASSIGNMENT] ✅ Assignment criado:', assignment.id);
      return true;

    } catch (error) {
      console.error('[ASSIGNMENT] ❌ Erro crítico:', error);
      return false;
    }
  };

  /**
   * 🎯 FASE 1: Consolidar TODAS as extrações de documentos do caso
   * Faz merge inteligente de arrays, objetos e campos simples
   */
  const consolidateAllExtractions = async (caseId: string) => {
    console.log('[Consolidation] Iniciando consolidação de extrações para caso:', caseId);
    
    // Buscar TODAS as extrações do caso
    const { data: extractions, error } = await supabase
      .from('extractions')
      .select('entities, auto_filled_fields, periodos_rurais')
      .eq('case_id', caseId)
      .order('extracted_at', { ascending: true }); // Mais antigas primeiro

    if (error) {
      console.error('[Consolidation] Erro ao buscar extrações:', error);
      return null;
    }

    if (!extractions || extractions.length === 0) {
      console.log('[Consolidation] Nenhuma extração encontrada');
      return null;
    }

    console.log(`[Consolidation] Consolidando ${extractions.length} extrações`);

    // Objeto final consolidado
    const consolidated: any = {
      // Campos simples
      author_name: null,
      author_cpf: null,
      author_rg: null,
      author_birth_date: null,
      author_address: null,
      author_phone: null,
      mother_cpf: null,
      father_cpf: null,
      father_name: null,
      spouse_name: null,
      spouse_cpf: null,
      marriage_date: null,
      nit: null,
      birth_city: null,
      birth_state: null,
      
      // Arrays para merge
      school_history: [],
      rural_periods: [],
      urban_periods: [],
      manual_benefits: [],
      
      // Objeto para merge
      health_declaration_ubs: {},
    };

    // Iterar sobre TODAS as extrações
    for (const extraction of extractions) {
      const entities = (extraction.entities || {}) as any;
      const autoFilled = (extraction.auto_filled_fields || {}) as any;
      const periodosRurais = (extraction.periodos_rurais || []) as any[];

      // ═══════════════════════════════════════════════════════════
      // ESTRATÉGIA 1: Campos Simples - "Primeiro não-nulo vence"
      // ═══════════════════════════════════════════════════════════
      
      // Nome e identificação
      if (!consolidated.author_name && entities.nome_completo) {
        consolidated.author_name = entities.nome_completo;
      }
      if (!consolidated.author_cpf && entities.cpf) {
        consolidated.author_cpf = entities.cpf;
      }
      if (!consolidated.author_rg && entities.rg) {
        consolidated.author_rg = entities.rg;
      }
      if (!consolidated.author_birth_date && entities.data_nascimento) {
        consolidated.author_birth_date = entities.data_nascimento;
      }
      
      // Endereço e contato
      if (!consolidated.author_address && entities.endereco) {
        consolidated.author_address = entities.endereco;
      }
      if (!consolidated.author_phone && entities.telefone) {
        consolidated.author_phone = entities.telefone;
      }
      
      // Pais e cônjuge
      if (!consolidated.mother_cpf && entities.cpf_mae) {
        consolidated.mother_cpf = entities.cpf_mae;
      }
      if (!consolidated.father_cpf && entities.cpf_pai) {
        consolidated.father_cpf = entities.cpf_pai;
      }
      if (!consolidated.father_name && entities.nome_pai) {
        consolidated.father_name = entities.nome_pai;
      }
      if (!consolidated.spouse_name && entities.nome_conjuge) {
        consolidated.spouse_name = entities.nome_conjuge;
      }
      if (!consolidated.spouse_cpf && entities.cpf_conjuge) {
        consolidated.spouse_cpf = entities.cpf_conjuge;
      }
      if (!consolidated.marriage_date && entities.data_casamento) {
        consolidated.marriage_date = entities.data_casamento;
      }
      
      // Previdência
      if (!consolidated.nit && entities.nit) {
        consolidated.nit = entities.nit;
      }
      if (!consolidated.birth_city && entities.cidade_nascimento) {
        consolidated.birth_city = entities.cidade_nascimento;
      }
      if (!consolidated.birth_state && entities.estado_nascimento) {
        consolidated.birth_state = entities.estado_nascimento;
      }

      // ═══════════════════════════════════════════════════════════
      // ESTRATÉGIA 2: Arrays - Merge Inteligente com Deduplicação
      // ═══════════════════════════════════════════════════════════
      
      // HISTÓRICO ESCOLAR
      if (entities.historico_escolar && Array.isArray(entities.historico_escolar)) {
        consolidated.school_history.push(...entities.historico_escolar);
      }
      
      // PERÍODOS RURAIS (3 fontes possíveis)
      if (periodosRurais && Array.isArray(periodosRurais)) {
        consolidated.rural_periods.push(...periodosRurais);
      }
      if (entities.periodos_rurais && Array.isArray(entities.periodos_rurais)) {
        consolidated.rural_periods.push(...entities.periodos_rurais);
      }
      if (autoFilled.rural_periods && Array.isArray(autoFilled.rural_periods)) {
        consolidated.rural_periods.push(...autoFilled.rural_periods);
      }
      
      // PERÍODOS URBANOS
      if (entities.periodos_urbanos && Array.isArray(entities.periodos_urbanos)) {
        consolidated.urban_periods.push(...entities.periodos_urbanos);
      }
      if (autoFilled.urban_periods && Array.isArray(autoFilled.urban_periods)) {
        consolidated.urban_periods.push(...autoFilled.urban_periods);
      }
      
      // BENEFÍCIOS MANUAIS
      if (entities.beneficios && Array.isArray(entities.beneficios)) {
        consolidated.manual_benefits.push(...entities.beneficios);
      }
      if (autoFilled.manual_benefits && Array.isArray(autoFilled.manual_benefits)) {
        consolidated.manual_benefits.push(...autoFilled.manual_benefits);
      }

      // ═══════════════════════════════════════════════════════════
      // ESTRATÉGIA 3: Objeto - Deep Merge
      // ═══════════════════════════════════════════════════════════
      
      // DECLARAÇÃO DE SAÚDE UBS
      if (entities.declaracao_saude_ubs && typeof entities.declaracao_saude_ubs === 'object') {
        consolidated.health_declaration_ubs = {
          ...consolidated.health_declaration_ubs,
          ...entities.declaracao_saude_ubs
        };
      }
      if (autoFilled.health_declaration_ubs && typeof autoFilled.health_declaration_ubs === 'object') {
        consolidated.health_declaration_ubs = {
          ...consolidated.health_declaration_ubs,
          ...autoFilled.health_declaration_ubs
        };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PÓS-PROCESSAMENTO: Deduplicação e Ordenação
    // ═══════════════════════════════════════════════════════════
    
    // HISTÓRICO ESCOLAR: Remover duplicatas por ano + escola
    if (consolidated.school_history.length > 0) {
      const uniqueSchool = new Map();
      consolidated.school_history.forEach((entry: any) => {
        const key = `${entry.ano}-${entry.escola}`;
        if (!uniqueSchool.has(key)) {
          uniqueSchool.set(key, entry);
        }
      });
      consolidated.school_history = Array.from(uniqueSchool.values())
        .sort((a: any, b: any) => (a.ano || 0) - (b.ano || 0)); // Ordenar por ano
    }
    
    // PERÍODOS RURAIS: Remover duplicatas por data_inicio + data_fim
    if (consolidated.rural_periods.length > 0) {
      const uniqueRural = new Map();
      consolidated.rural_periods.forEach((period: any) => {
        const key = `${period.data_inicio}-${period.data_fim}`;
        if (!uniqueRural.has(key)) {
          uniqueRural.set(key, period);
        }
      });
      consolidated.rural_periods = Array.from(uniqueRural.values())
        .sort((a: any, b: any) => {
          const dateA = new Date(a.data_inicio || '1900-01-01');
          const dateB = new Date(b.data_inicio || '1900-01-01');
          return dateA.getTime() - dateB.getTime();
        });
    }
    
    // PERÍODOS URBANOS: Remover duplicatas
    if (consolidated.urban_periods.length > 0) {
      const uniqueUrban = new Map();
      consolidated.urban_periods.forEach((period: any) => {
        const key = `${period.data_inicio}-${period.data_fim}`;
        if (!uniqueUrban.has(key)) {
          uniqueUrban.set(key, period);
        }
      });
      consolidated.urban_periods = Array.from(uniqueUrban.values())
        .sort((a: any, b: any) => {
          const dateA = new Date(a.data_inicio || '1900-01-01');
          const dateB = new Date(b.data_inicio || '1900-01-01');
          return dateA.getTime() - dateB.getTime();
        });
    }
    
    // BENEFÍCIOS: Remover duplicatas por NB
    if (consolidated.manual_benefits.length > 0) {
      const uniqueBenefits = new Map();
      consolidated.manual_benefits.forEach((benefit: any) => {
        const key = benefit.nb || benefit.benefit_type;
        if (!uniqueBenefits.has(key)) {
          uniqueBenefits.set(key, benefit);
        }
      });
      consolidated.manual_benefits = Array.from(uniqueBenefits.values());
    }

    console.log('[Consolidation] Dados consolidados:', {
      campos_simples: Object.keys(consolidated).filter(k => consolidated[k] && !Array.isArray(consolidated[k]) && typeof consolidated[k] !== 'object'),
      school_history_count: consolidated.school_history.length,
      rural_periods_count: consolidated.rural_periods.length,
      urban_periods_count: consolidated.urban_periods.length,
      manual_benefits_count: consolidated.manual_benefits.length,
      has_health_declaration: Object.keys(consolidated.health_declaration_ubs).length > 0
    });

    return consolidated;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles: File[] = [];
    
    for (const file of files) {
      // Validação de tamanho
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede 200MB`,
          variant: "destructive",
        });
        continue;
      }
      
      // Verificar duplicatas na sessão atual
      if (uploadedFiles.some(f => f.name === file.name)) {
        toast({
          title: "Documento duplicado",
          description: `"${file.name}" já foi adicionado`,
          variant: "destructive",
        });
        continue;
      }
      
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) return;
    
    setUploadedFiles(prev => [...prev, ...validFiles]);
    processDocuments(validFiles);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== index));
    toast({
      title: "Documento removido",
      description: "O arquivo foi removido da lista",
    });
  };

  const processDocuments = async (files: File[]) => {
    console.log('[ProcessDocuments] ═══════════════════════════════════════════');
    console.log('[ProcessDocuments] Iniciando processamento de documentos');
    console.log('[ProcessDocuments] Files:', files.length);
    console.log('[ProcessDocuments] Existing case ID:', data.caseId);
    console.log('[ProcessDocuments] ═══════════════════════════════════════════');
    
    // Verificar se existe versão final antes de processar
    if (data.caseId) {
      const { data: finalDraft } = await supabase
        .from('drafts')
        .select('id, is_final')
        .eq('case_id', data.caseId)
        .eq('is_final', true)
        .maybeSingle();

      if (finalDraft) {
        console.log('[CHAT] ⚠️ Versão final detectada, solicitando confirmação');
        setPendingFiles(files);
        setShowUnfreezeDialog(true);
        return;
      }
    }

    setIsProcessing(true);
    
    try {
      // Verificar sessão e roles
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[CHAT] 🔐 Auth Session:', {
        authenticated: !!session,
        userId: session?.user?.id,
        email: session?.user?.email
      });

      if (!session) {
        throw new Error('Não autenticado. Faça login novamente.');
      }

      // Verificar roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);
      
      console.log('[CHAT] 👤 User Roles:', { roles, rolesError });

      // 🔒 VALIDAÇÃO CRÍTICA: Garantir case_assignment antes de qualquer upload
      if (data.caseId) {
        console.log('[CHAT] 🔒 Validando case_assignment antes do upload...');
        const assignmentValid = await ensureCaseAssignment(data.caseId, session.user.id);
        
        if (!assignmentValid) {
          throw new Error('Não foi possível atribuir o caso ao usuário. Tente novamente.');
        }
        
        console.log('[CHAT] ✅ Case_assignment validado - prosseguindo com upload');
      }

      // Criar um caso temporário se não existir
      let caseId = data.caseId;
      if (!caseId) {
        console.log('[CHAT] 📝 Tentando INSERT em cases...');
        
        const insertPayload = {
          author_name: "Processando...",
          author_cpf: "00000000000",
          event_date: new Date().toISOString().split('T')[0],
          status: "intake" as const,
          started_with_chat: true,
          petition_type: "peticao_inicial"
        };
        
        console.log('[CHAT] 📦 Insert Payload:', insertPayload);
        
        // Usar RETURNING * para obter caso completo imediatamente
        const { data: newCase, error: insertError } = await supabase
          .from("cases")
          .insert(insertPayload)
          .select('*')
          .single();

        console.log('[CHAT] ✅ Insert Result:', { 
          success: !insertError,
          caseId: newCase?.id,
          error: insertError ? {
            message: insertError.message,
            code: insertError.code,
          } : null
        });

        if (insertError) throw insertError;

        caseId = newCase.id;
        console.log('[CHAT] ✅ Caso completo carregado:', newCase);
        updateData({ caseId });

        // 🔒 Garantir case_assignment usando função validada
        console.log('[CHAT] 🔒 Garantindo case_assignment para novo caso...');
        const assignmentValid = await ensureCaseAssignment(caseId, session.user.id);
        
        if (!assignmentValid) {
          throw new Error('Falha ao atribuir caso ao usuário');
        }
        
        console.log('[CHAT] ✅ Case_assignment validado - pronto para upload');
      }

      // Função para normalizar nome de arquivo (remove extensão, sufixo de página, truncation DOS 8.3)
      const normalizeFileName = (name: string): string => {
        let base = name.replace(/\.(pdf|png|jpg|jpeg|docx)$/i, '');
        base = base.replace(/_pagina_\d+$/i, '');
        base = base.replace(/~\d+/g, '');
        return base.toLowerCase().trim();
      };

      // Buscar TODOS os documentos existentes
      const { data: existingDocs, error: checkError } = await supabase
        .from("documents")
        .select("file_name")
        .eq("case_id", caseId);

      if (checkError) throw checkError;

      // Criar set de nomes base normalizados
      const existingBaseNames = new Set(
        existingDocs?.map(d => normalizeFileName(d.file_name)) || []
      );

      console.log('[DEDUPE] Documentos existentes (normalizados):', Array.from(existingBaseNames));

      // Filtrar arquivos que não existem
      const filesToUpload = files.filter(file => {
        const normalizedName = normalizeFileName(file.name);
        
        if (existingBaseNames.has(normalizedName)) {
          console.warn(`[DEDUPE] ❌ "${file.name}" é duplicata de arquivo já enviado`);
          toast({
            title: "Documento duplicado",
            description: `"${file.name}" já foi enviado anteriormente`,
            variant: "destructive",
          });
          return false;
        }
        
        return true;
      });

      if (filesToUpload.length === 0) {
        toast({
          title: "Nenhum documento novo",
          description: "Todos os arquivos já foram enviados",
        });
        return;
      }

      // Avisar sobre duplicatas ignoradas
      if (files.length > filesToUpload.length) {
        const duplicatedCount = files.length - filesToUpload.length;
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ ${duplicatedCount} documento(s) duplicado(s) foram ignorados.`
        }]);
      }

      /**
       * 🚀 FASE 2.2: Processar um único documento (upload + insert + análise)
       */
      const processOneDocument = async (
        file: File,
        index: number,
        total: number,
        caseId: string,
        clientFolderName: string,
        existingDocsSet: Set<string>
      ): Promise<{ 
        success: boolean; 
        fileName: string; 
        extracted?: any; 
        error?: any 
      }> => {
        try {
          console.log(`[PARALLEL] 📄 [${index + 1}/${total}] Processando: ${file.name}`);
          
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `📄 [${index + 1}/${total}] Processando: ${file.name}...`
          }]);
          
          // 🔄 CONVERTER PDF EM IMAGENS (se necessário)
          let filesToProcess: File[] = [file];
          
          if (isPDF(file)) {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `📄 Convertendo PDF "${file.name}" em imagens...`
            }]);
            
            try {
              console.log(`[PDF] Convertendo "${file.name}" em imagens...`);
              const { images } = await convertPDFToImages(file);
              filesToProcess = images;
              
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `✅ PDF convertido: ${images.length} página(s)`
              }]);
              
              console.log(`[PDF] ✅ ${images.length} imagens geradas`);
            } catch (conversionError: any) {
              console.error('[PDF] ❌ Erro na conversão:', conversionError);
              throw new Error(`Erro ao converter PDF: ${conversionError.message}`);
            }
          }
          
          // Processar cada página/imagem
          const extractedFromAllPages: any[] = [];
          
          for (let i = 0; i < filesToProcess.length; i++) {
            const pageFile = filesToProcess[i];
            const pageNum = filesToProcess.length > 1 ? ` (pág. ${i + 1}/${filesToProcess.length})` : '';
            
            // ⚡ Compressão adaptativa
            let fileToUpload = pageFile;
            const isPng = pageFile.type === 'image/png' || pageFile.name.toLowerCase().endsWith('.png');
            const isJpg = pageFile.type === 'image/jpeg' || pageFile.name.toLowerCase().endsWith('.jpg');
            
            if ((isPng || isJpg) && pageFile.size > 500 * 1024) {
              try {
                const compressed = await compressImageForAI(pageFile);
                fileToUpload = compressed;
                console.log(`[COMPRESS] ✓ ${pageFile.name}: ${(pageFile.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
              } catch (err) {
                console.warn('[COMPRESS] ⚠️ Falha, usando original:', err);
              }
            }
            
            // 📤 UPLOAD
            const fileExt = pageFile.name.split('.').pop();
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(7);
            const fileName = `${clientFolderName}/${timestamp}_${randomId}.${fileExt}`;
            console.log(`[PARALLEL] 📤 Upload${pageNum}: ${fileName}`);
            
            const { error: uploadError } = await supabase.storage
              .from("case-documents")
              .upload(fileName, fileToUpload);
            
            if (uploadError) {
              console.error('[PARALLEL] ❌ Erro no upload:', uploadError);
              throw uploadError;
            }
            
            // 💾 INSERT documento (com RETURNING *)
            const { data: doc, error: docError } = await supabase
              .from("documents")
              .insert({
                case_id: caseId,
                file_name: pageFile.name,
                file_path: fileName,
                file_size: pageFile.size,
                mime_type: pageFile.type,
                document_type: "outro" as any,
              })
              .select('*')
              .single();
            
            if (docError) {
              console.error('[PARALLEL] ❌ Erro no INSERT:', docError);
              throw docError;
            }
            
            console.log(`[PARALLEL] ✓ Documento inserido, ID: ${doc.id}`);
            
            // 🤖 ANÁLISE COM IA
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `🔍 Analisando${pageNum}...`
            }]);
            
            // Verificar se já foi analisado
            const { data: existingExtraction } = await supabase
              .from('extractions')
              .select('id')
              .eq('document_id', doc.id)
              .maybeSingle();
            
            if (existingExtraction) {
              console.log(`[PARALLEL] ⏭️ Documento ${doc.id} já analisado, pulando...`);
              continue;
            }
            
            // Chamar análise
            const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
              "analyze-single-document",
              { body: { documentId: doc.id } }
            );
            
            if (analysisError) {
              console.error(`[PARALLEL] ❌ Erro na análise:`, analysisError);
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `⚠️ Erro ao analisar${pageNum}: ${analysisError.message}`
              }]);
            } else {
              console.log(`[PARALLEL] ✅ Análise concluída${pageNum}`);
              
              if (analysisData?.extracted_entities) {
                extractedFromAllPages.push(analysisData.extracted_entities);
              }
              
              // Atualizar tipo de documento
              if (analysisData?.docType && analysisData.docType !== 'outro') {
                await supabase
                  .from('documents')
                  .update({ document_type: analysisData.docType })
                  .eq('id', doc.id);
              }
              
              const docTypeLabel = getDocTypeLabel(analysisData?.docType || 'outro');
              const confidence = analysisData?.confidence || 'medium';
              const confidenceEmoji = confidence === 'high' ? '✅' : confidence === 'medium' ? '⚠️' : '❌';
              
              setMessages(prev => [...prev, {
                role: "assistant",
                content: `${confidenceEmoji} ${docTypeLabel}${pageNum} - Dados extraídos (confiança: ${confidence})`
              }]);
            }
          }
          
          // Mesclar dados extraídos de todas as páginas
          const mergedExtracted = extractedFromAllPages.reduce((acc, curr) => ({
            ...acc,
            ...curr
          }), {});
          
          return {
            success: true,
            fileName: file.name,
            extracted: mergedExtracted
          };
          
        } catch (error: any) {
          console.error(`[PARALLEL] ❌ Erro em ${file.name}:`, error);
          
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `❌ Erro ao processar "${file.name}": ${error.message}`
          }]);
          
          return {
            success: false,
            fileName: file.name,
            error: error.message
          };
        }
      };

      // 🚀 PROCESSAMENTO PARALELO: Todos os documentos simultaneamente
      console.log(`[PARALLEL] 🚀 Iniciando processamento paralelo de ${filesToUpload.length} documento(s)`);
      
      const clientFolderName = caseId;
      
      const uploadPromises = filesToUpload.map((file, index) => 
        processOneDocument(
          file, 
          index, 
          filesToUpload.length, 
          caseId, 
          clientFolderName,
          existingBaseNames
        )
      );
      
      // Aguardar TODOS os uploads completarem
      const results = await Promise.all(uploadPromises);
      
      // Processar resultados
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      console.log(`[PARALLEL] 📊 Resultados: ${successCount} sucesso, ${failedCount} falhas`);
      
      if (successCount > 0) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `✅ ${successCount} documento(s) processado(s) com sucesso!`
        }]);
      }
      
      if (failedCount > 0) {
        const failedFiles = results
          .filter(r => !r.success)
          .map(r => r.fileName)
          .join(", ");
        
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ ${failedCount} documento(s) falharam: ${failedFiles}`
        }]);
      }
      
      // Consolidar dados extraídos
      let extractedData: any = {};
      results.forEach(result => {
        if (result.extracted) {
          extractedData = { ...extractedData, ...result.extracted };
        }
      });
      
      // 🆕 FASE 1: Consolidar extrações após processamento paralelo
      console.log('[PARALLEL] 🔄 Consolidando extrações...');
      const consolidatedData = await consolidateAllExtractions(caseId);
      
      if (consolidatedData) {
        // Atualizar tabela cases com dados consolidados
        const { error: updateError } = await supabase
          .from('cases')
          .update({
            author_name: consolidatedData.author_name,
            author_cpf: consolidatedData.author_cpf,
            author_rg: consolidatedData.author_rg,
            author_birth_date: consolidatedData.author_birth_date,
            author_address: consolidatedData.author_address,
            author_phone: consolidatedData.author_phone,
            mother_cpf: consolidatedData.mother_cpf,
            father_cpf: consolidatedData.father_cpf,
            father_name: consolidatedData.father_name,
            spouse_name: consolidatedData.spouse_name,
            spouse_cpf: consolidatedData.spouse_cpf,
            marriage_date: consolidatedData.marriage_date,
            nit: consolidatedData.nit,
            birth_city: consolidatedData.birth_city,
            birth_state: consolidatedData.birth_state,
            school_history: consolidatedData.school_history,
            rural_periods: consolidatedData.rural_periods,
            urban_periods: consolidatedData.urban_periods,
            manual_benefits: consolidatedData.manual_benefits,
            health_declaration_ubs: consolidatedData.health_declaration_ubs,
          })
          .eq('id', caseId);
        
        if (updateError) {
          console.error('[ProcessDocuments] ❌ Erro ao atualizar caso:', updateError);
        } else {
          console.log('[ProcessDocuments] ✅ Caso atualizado com sucesso');
        }
        
        // Atualizar dados locais
        extractedData = { ...extractedData, ...consolidatedData };
      }
      
      // 🆕 FASE 3: Disparar pipeline completo após upload
      console.log('[PARALLEL] 🚀 Disparando pipeline completo...');
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `🔄 Iniciando validação, análise jurídica, jurisprudência e tese...`
      }]);
      
      await triggerFullPipeline('Documentos adicionados via chat');
      
      // Atualizar status do caso para "ready"
      await supabase
        .from("cases")
        .update({ status: "ready" })
        .eq("id", caseId);
      
      console.log(`[PARALLEL] ✅ Processamento paralelo concluído!`);
      
      // Buscar caso atualizado
      const { data: updatedCase } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single();

      if (updatedCase) {
        console.log('[PARALLEL] Caso final:', updatedCase);
        if (updatedCase.author_name && updatedCase.author_name !== 'Processando...') {
          extractedData.motherName = updatedCase.author_name;
        }
        if (updatedCase.child_name) extractedData.childName = updatedCase.child_name;
        if (updatedCase.child_birth_date) extractedData.childBirthDate = updatedCase.child_birth_date;
      }

      const missingFields: string[] = [];
      if (!extractedData.motherName) missingFields.push('motherName');
      if (!extractedData.motherCpf) missingFields.push('motherCpf');
      if (!extractedData.childName) missingFields.push('childName');
      if (!extractedData.childBirthDate) missingFields.push('childBirthDate');

      console.log("Dados extraídos:", extractedData);
      console.log("Campos faltantes:", missingFields);

      // ✅ VERIFICAR CAMPOS CRÍTICOS FALTANTES
      const criticalMissing = [];
      if (!extractedData.childName) criticalMissing.push('Nome da criança');
      if (!extractedData.childBirthDate) criticalMissing.push('Data de nascimento da criança');
      if (!extractedData.motherName) criticalMissing.push('Nome da mãe');
      if (!extractedData.motherCpf) criticalMissing.push('CPF da mãe');

      let assistantMessage = `✅ **Documentos processados com sucesso!**\n\n`;
      assistantMessage += `📄 **${successCount} documento(s) analisado(s)**\n\n`;
      
      if (Object.keys(extractedData).length > 0) {
        assistantMessage += "**📋 Informações extraídas dos documentos:**\n\n";
        
        // Dados da mãe/autora
        if (extractedData.motherName || extractedData.motherCpf || extractedData.motherBirthDate) {
          assistantMessage += "**👤 Autora (Mãe):**\n";
          if (extractedData.motherName) assistantMessage += `• Nome: ${extractedData.motherName}\n`;
          if (extractedData.motherCpf) assistantMessage += `• CPF: ${extractedData.motherCpf}\n`;
          if (extractedData.motherRg) assistantMessage += `• RG: ${extractedData.motherRg}\n`;
          if (extractedData.motherBirthDate) assistantMessage += `• Data de Nascimento: ${extractedData.motherBirthDate}\n`;
          if (extractedData.motherAddress) assistantMessage += `• Endereço: ${extractedData.motherAddress}\n`;
          if (extractedData.maritalStatus) assistantMessage += `• Estado Civil: ${extractedData.maritalStatus}\n`;
          assistantMessage += "\n";
        }
        
        // Dados da criança
        if (extractedData.childName || extractedData.childBirthDate) {
          assistantMessage += "**👶 Criança:**\n";
          if (extractedData.childName) assistantMessage += `• Nome: ${extractedData.childName}\n`;
          if (extractedData.childBirthDate) assistantMessage += `• Data de Nascimento: ${extractedData.childBirthDate}\n`;
          if (extractedData.fatherName) assistantMessage += `• Pai: ${extractedData.fatherName}\n`;
          assistantMessage += "\n";
        }
        
        // Proprietário da terra
        if (extractedData.landOwnerName || extractedData.landOwnershipType) {
          assistantMessage += "**🏡 Propriedade Rural:**\n";
          if (extractedData.landOwnershipType) assistantMessage += `• Tipo: ${extractedData.landOwnershipType === 'propria' ? 'Terra Própria' : 'Terra de Terceiro'}\n`;
          if (extractedData.landOwnerName) assistantMessage += `• Proprietário: ${extractedData.landOwnerName}\n`;
          assistantMessage += "\n";
        }
        
        // Atividade rural
        if (extractedData.ruralActivitySince || extractedData.familyMembers) {
          assistantMessage += "**🌾 Atividade Rural:**\n";
          if (extractedData.ruralActivitySince) assistantMessage += `• Trabalha desde: ${extractedData.ruralActivitySince}\n`;
          if (extractedData.familyMembers && extractedData.familyMembers.length > 0) {
            assistantMessage += `• Membros da família: ${extractedData.familyMembers.join(", ")}\n`;
          }
          assistantMessage += "\n";
        }
        
        // Processo administrativo
        if (extractedData.raProtocol) {
          assistantMessage += "**📋 Processo Administrativo:**\n";
          if (extractedData.raProtocol) assistantMessage += `• Protocolo/NB: ${extractedData.raProtocol}\n`;
          if (extractedData.raRequestDate) assistantMessage += `• Data Requerimento: ${extractedData.raRequestDate}\n`;
          if (extractedData.raDenialDate) assistantMessage += `• Data Indeferimento: ${extractedData.raDenialDate}\n`;
          if (extractedData.raDenialReason) assistantMessage += `• Motivo: ${extractedData.raDenialReason}\n`;
          assistantMessage += "\n";
        }
      }

      if (missingFields.length > 0) {
        assistantMessage += `\n⚠️ **Campos faltantes (preencher manualmente):**\n`;
        const fieldLabels: Record<string, string> = {
          motherName: "Nome da mãe",
          motherCpf: "CPF da mãe",
          childName: "Nome da criança",
          childBirthDate: "Data de nascimento da criança"
        };
        missingFields.forEach(field => {
          assistantMessage += `• ${fieldLabels[field] || field}\n`;
        });
        assistantMessage += "\n";
      }
      
      // ✅ MENSAGEM INTELIGENTE SE CAMPOS CRÍTICOS FALTAM
      if (criticalMissing.length > 0) {
        assistantMessage += `\n⚠️ **ATENÇÃO! Não consegui extrair alguns dados importantes:**\n\n`;
        criticalMissing.forEach(f => assistantMessage += `• ${f}\n`);
        assistantMessage += `\n**Possíveis causas:**\n`;
        assistantMessage += `1. O documento necessário (certidão de nascimento, RG/CPF) não foi enviado ainda\n`;
        assistantMessage += `2. O documento foi enviado mas a qualidade da imagem está baixa\n`;
        assistantMessage += `3. O documento precisa ser reprocessado\n\n`;
        assistantMessage += `**Solução:**\n`;
        assistantMessage += `→ Clique no botão "🔄 Reprocessar Documentos" abaixo para tentar novamente\n`;
        assistantMessage += `→ Ou envie/reenvie os documentos necessários\n\n`;
      }
      
      assistantMessage += "\n✨ **Esses dados já foram preenchidos automaticamente no formulário!**\n";
      assistantMessage += "➡️ Clique em 'Próximo' para revisar e completar as informações.";

      setMessages(prev => [...prev, {
        role: "assistant",
        content: assistantMessage,
        extractedData,
      }]);

      // Mapear os campos da API para os campos do formulário
      const fieldMapping: Record<string, string> = {
        motherName: 'authorName',
        motherCpf: 'authorCpf',
        motherRg: 'authorRg',
        motherBirthDate: 'authorBirthDate',
        motherAddress: 'authorAddress',
        maritalStatus: 'authorMaritalStatus',
        childName: 'childName',
        childBirthDate: 'childBirthDate',
        fatherName: 'fatherName',
        landOwnerName: 'landOwnerName',
        landOwnerCpf: 'landOwnerCpf',
        landOwnerRg: 'landOwnerRg',
        landOwnershipType: 'landOwnershipType',
        ruralActivitySince: 'ruralActivitySince',
        familyMembers: 'familyMembers',
        raProtocol: 'raProtocol',
        raRequestDate: 'raRequestDate',
        raDenialDate: 'raDenialDate',
        raDenialReason: 'raDenialReason',
      };

      // Criar array de campos preenchidos usando os nomes do formulário
      const autoFilledFieldsList = Object.keys(extractedData)
        .map(key => fieldMapping[key] || key)
        .filter(field => field);

      // Atualizar dados do formulário com TODOS os campos extraídos
      updateData({
        ...data,
        caseId,
        // Dados da mãe
        authorName: extractedData.motherName || data.authorName,
        authorCpf: extractedData.motherCpf || data.authorCpf,
        authorRg: extractedData.motherRg || data.authorRg,
        authorBirthDate: extractedData.motherBirthDate || data.authorBirthDate,
        authorAddress: extractedData.motherAddress || data.authorAddress,
        authorMaritalStatus: extractedData.maritalStatus || data.authorMaritalStatus,
        // Dados da criança
        childName: extractedData.childName || data.childName,
        childBirthDate: extractedData.childBirthDate || data.childBirthDate,
        eventDate: extractedData.childBirthDate || data.eventDate,
        fatherName: extractedData.fatherName || data.fatherName,
        // Proprietário da terra
        landOwnerName: extractedData.landOwnerName || data.landOwnerName,
        landOwnerCpf: extractedData.landOwnerCpf || data.landOwnerCpf,
        landOwnerRg: extractedData.landOwnerRg || data.landOwnerRg,
        landOwnershipType: extractedData.landOwnershipType || data.landOwnershipType,
        // Atividade rural
        ruralActivitySince: extractedData.ruralActivitySince || data.ruralActivitySince,
        familyMembers: extractedData.familyMembers || data.familyMembers,
        // Processo administrativo
        hasRa: !!extractedData.raProtocol || data.hasRa,
        raProtocol: extractedData.raProtocol || data.raProtocol,
        raRequestDate: extractedData.raRequestDate || data.raRequestDate,
        raDenialDate: extractedData.raDenialDate || data.raDenialDate,
        raDenialReason: extractedData.raDenialReason || data.raDenialReason,
        // Metadados
        extractedData,
        missingFields,
        autoFilledFields: autoFilledFieldsList,
        documents: uploadedFiles.map(f => f.name),
      });

      // 🆕 SALVAR NO BANCO DE DADOS E DISPARAR PIPELINE
      if (caseId) {
        console.log('[CHAT] Salvando dados extraídos no banco...');
        console.log('[CHAT] Case ID:', caseId);
        console.log('[CHAT] Dados extraídos:', extractedData);
        
        try {
          console.log('[ProcessDocuments] Iniciando consolidação de TODAS as extrações');

          // 🎯 FASE 1: Consolidar TODAS as extrações (incluindo sessões anteriores)
          const consolidatedData = await consolidateAllExtractions(caseId);

          if (!consolidatedData) {
            console.warn('[ProcessDocuments] Falha na consolidação, usando dados locais apenas');
            // Fallback: usar apenas dados do batch atual
            const extractedDataLocal = extractedData;
            
            if (Object.keys(extractedDataLocal).length > 0) {
              console.log('[ProcessDocuments] Atualizando caso com dados do batch atual:', Object.keys(extractedDataLocal));
              
              const { error: caseError } = await supabase
                .from('cases')
                .update({
                  author_name: extractedDataLocal.authorName || data.authorName,
                  author_cpf: extractedDataLocal.authorCpf || data.authorCpf,
                  author_rg: extractedDataLocal.authorRg || data.authorRg,
                  author_birth_date: extractedDataLocal.authorBirthDate || data.authorBirthDate,
                  author_address: extractedDataLocal.authorAddress || data.authorAddress,
                  author_marital_status: extractedDataLocal.maritalStatus || data.authorMaritalStatus,
                  mother_cpf: extractedDataLocal.motherCpf || data.motherCpf,
                  father_cpf: extractedDataLocal.fatherCpf || data.fatherCpf,
                  child_name: extractedDataLocal.childName || data.childName,
                  child_birth_date: extractedDataLocal.childBirthDate || data.childBirthDate,
                  event_date: extractedDataLocal.childBirthDate || data.eventDate || new Date().toISOString().split('T')[0],
                  father_name: extractedDataLocal.fatherName || data.fatherName,
                  land_owner_name: extractedDataLocal.landOwnerName || data.landOwnerName,
                  land_owner_cpf: extractedDataLocal.landOwnerCpf || data.landOwnerCpf,
                  land_owner_rg: extractedDataLocal.landOwnerRg || data.landOwnerRg,
                  land_ownership_type: extractedDataLocal.landOwnershipType || data.landOwnershipType,
                  rural_activity_since: extractedDataLocal.ruralActivitySince || data.ruralActivitySince,
                  family_members: extractedDataLocal.familyMembers as any || data.familyMembers,
                  has_ra: !!extractedDataLocal.raProtocol || data.hasRa,
                  ra_protocol: extractedDataLocal.raProtocol || data.raProtocol,
                  ra_request_date: extractedDataLocal.raRequestDate || data.raRequestDate,
                  ra_denial_date: extractedDataLocal.raDenialDate || data.raDenialDate,
                  ra_denial_reason: extractedDataLocal.raDenialReason || data.raDenialReason,
                  updated_at: new Date().toISOString()
                })
                .eq('id', caseId);

              if (caseError) {
                console.error('[ProcessDocuments] Erro ao atualizar caso:', caseError);
                toast({
                  title: "Erro ao salvar",
                  description: "Erro ao salvar informações extraídas",
                  variant: "destructive",
                });
              }
            }
          } else {
            // Sucesso: usar dados consolidados de TODAS as sessões
            console.log('[ProcessDocuments] Atualizando caso com dados consolidados de todas as sessões');
            
            const { error: caseError } = await supabase
              .from('cases')
              .update(consolidatedData)
              .eq('id', caseId);

            if (caseError) {
              console.error('[ProcessDocuments] Erro ao atualizar caso com dados consolidados:', caseError);
              toast({
                title: "Erro ao salvar informações",
                description: "Erro ao consolidar dados extraídos",
                variant: "destructive",
              });
            } else {
              console.log('[ProcessDocuments] ✅ Caso atualizado com sucesso com dados consolidados');
              
              // Mostrar feedback ao usuário sobre o que foi consolidado
              const updatedFields = Object.keys(consolidatedData).filter(k => consolidatedData[k]);
              if (updatedFields.length > 0) {
                toast({
                  title: "Dados consolidados",
                  description: `${updatedFields.length} campos atualizados com sucesso`,
                });
              }
            }
          }

          console.log('[ProcessDocuments] ✅ Consolidação concluída');
          
          // ✅ FASE 2: DISPARAR SYNC APÓS EXTRAÇÃO
          console.log('[CHAT] ✅ Dados salvos, disparando sync...');
          
          // Disparar evento de sincronização para outras abas
          window.dispatchEvent(new CustomEvent('case-updated', { 
            detail: { caseId, source: 'chat-extraction' } 
          }));
          
          // Invalidar cache downstream
          await supabase
            .from('case_analysis')
            .update({ is_stale: true })
            .eq('case_id', caseId);
          
          // ✅ FASE 3: SALVAR BENEFÍCIOS ANTERIORES EM BENEFIT_HISTORY
          if (extractedData.raProtocol && extractedData.raRequestDate) {
            const { data: existing } = await supabase
              .from('benefit_history')
              .select('id')
              .eq('case_id', caseId)
              .eq('nb', extractedData.raProtocol)
              .maybeSingle();
            
            if (!existing) {
              await supabase
                .from('benefit_history')
                .insert({
                  case_id: caseId,
                  nb: extractedData.raProtocol,
                  benefit_type: extractedData.benefitType || 'Salário-Maternidade',
                  start_date: extractedData.raRequestDate,
                  end_date: extractedData.raDenialDate,
                  status: 'negado'
                });
              
              console.log('[CHAT] ✅ Benefício anterior salvo');
            }
          }
          
          // 🆕 DISPARAR PIPELINE COMPLETO
          if (triggerFullPipeline) {
            console.log('[CHAT] Disparando pipeline completo...');
            try {
              await triggerFullPipeline('Dados extraídos via chat');
              console.log('[CHAT] ✅ Pipeline disparado com sucesso');
            } catch (pipelineError) {
              console.error('[CHAT] Erro ao disparar pipeline:', pipelineError);
              // Não vamos jogar erro aqui para não quebrar o fluxo
            }
          } else {
            console.warn('[CHAT] ⚠️ triggerFullPipeline não disponível');
          }
          
        } catch (dbError) {
          console.error('[CHAT] ❌ Erro crítico ao salvar no banco:', dbError);
          toast({
            title: "Erro ao salvar dados",
            description: "Os dados foram extraídos mas não foram salvos. Tente novamente.",
            variant: "destructive",
          });
        }
      } else {
        console.error('[CHAT] ❌ Case ID não encontrado após processamento');
      }

    } catch (error: any) {
      console.error("Erro ao processar documentos:", error);
      toast({
        title: "Erro ao processar documentos",
        description: error.message,
        variant: "destructive",
      });
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Ocorreu um erro ao processar os documentos. Por favor, tente novamente ou preencha as informações manualmente.",
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ✅ FUNÇÃO PARA REPROCESSAR TODOS OS DOCUMENTOS
  const handleReprocessAllDocuments = async () => {
    if (!data.caseId) {
      toast({
        title: "❌ Erro",
        description: "Caso não encontrado. Crie um caso primeiro.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    const startTime = Date.now();
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "🔄 Reprocessando TODOS os documentos com IA... Aguarde alguns segundos."
    }]);

    try {
      // Buscar todos os documentos do caso
      const { data: allDocs, error: docsError } = await supabase
        .from('documents')
        .select('id, file_name')
        .eq('case_id', data.caseId);

      if (docsError) throw docsError;

      if (!allDocs || allDocs.length === 0) {
        toast({
          title: "⚠️ Aviso",
          description: "Nenhum documento encontrado para reprocessar.",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      console.log(`[REPROCESS] Reprocessando ${allDocs.length} documentos em paralelo...`);

      // PROCESSAMENTO PARALELO OTIMIZADO (máximo 15 por vez - 3x mais rápido!)
      const CONCURRENT_LIMIT = 15;
      const allExtractedData: any = {};
      let processedCount = 0;

      // Dividir em chunks para processamento paralelo controlado
      const skippedPdfs: string[] = [];
      
      for (let i = 0; i < allDocs.length; i += CONCURRENT_LIMIT) {
        const chunk = allDocs.slice(i, i + CONCURRENT_LIMIT);
        
        // Processar chunk em paralelo
        const chunkPromises = chunk.map(async (doc) => {
          try {
            const { data: result, error } = await supabase.functions.invoke(
              'analyze-single-document',
              {
                body: {
                  documentId: doc.id,
                  caseId: data.caseId
                }
              }
            );

            if (error) {
              console.error(`[REPROCESS] Erro em ${doc.file_name}:`, error);
              return null;
            }

            processedCount++;
            
            // Detectar PDFs pulados
            if (result.skipped) {
              skippedPdfs.push(doc.file_name);
              console.log(`[REPROCESS] ${processedCount}/${allDocs.length} - ${doc.file_name} ⊘ (PDF pulado)`);
            } else {
              console.log(`[REPROCESS] ${processedCount}/${allDocs.length} - ${doc.file_name} ✓`);
            }

            return {
              docType: result.docType,
              extracted: result.extracted || {},
              skipped: result.skipped || false
            };
          } catch (err) {
            console.error(`[REPROCESS] Falha em ${doc.file_name}:`, err);
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);

        // Mesclar dados extraídos (exceto os pulados)
        chunkResults.forEach((result) => {
          if (result && result.extracted && !result.skipped) {
            Object.assign(allExtractedData, result.extracted);
          }
        });
      }

      console.log('[REPROCESS] ✅ Todos os documentos processados:', allExtractedData);
      
      // Informar sobre PDFs pulados
      if (skippedPdfs.length > 0) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ ${skippedPdfs.length} PDF(s) antigo(s) foram pulados:\n${skippedPdfs.map(f => `• ${f}`).join('\n')}\n\n💡 Para processar PDFs, faça re-upload - eles serão automaticamente convertidos em imagens.`
        }]);
      }

      // Atualizar dados do caso com os dados extraídos
      if (allExtractedData.childName) {
        updateData({
          childName: allExtractedData.childName,
          childBirthDate: allExtractedData.childBirthDate,
          authorName: allExtractedData.motherName || data.authorName,
          authorCpf: allExtractedData.motherCpf || data.authorCpf,
          fatherName: allExtractedData.fatherName,
          caseId: data.caseId
        });
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      toast({
        title: "✅ Reprocessamento concluído!",
        description: `${processedCount} documentos analisados em ${totalTime}s`,
      });

      // Verificar campos críticos
      const criticalMissing = [];
      if (!allExtractedData.childName) criticalMissing.push('Nome da criança');
      if (!allExtractedData.childBirthDate) criticalMissing.push('Data de nascimento da criança');

      let messageContent = `✅ **Reprocessamento concluído em ${totalTime}s!**\n\n`;
      messageContent += `📋 **${processedCount}/${allDocs.length} documento(s) processado(s)**\n\n`;
      
      if (Object.keys(allExtractedData).length > 0) {
        messageContent += "**Dados atualizados:**\n";
        Object.entries(allExtractedData)
          .filter(([_, value]) => value && value !== '')
          .slice(0, 10)
          .forEach(([key, value]) => {
            messageContent += `• ${key}: ${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}\n`;
          });
        messageContent += "\n";
      }

      if (criticalMissing.length > 0) {
        messageContent += `⚠️ **Ainda faltando:** ${criticalMissing.join(', ')}\n\n`;
        messageContent += `Se o problema persistir, tente reenviar os documentos necessários (certidão de nascimento, RG/CPF).`;
      } else {
        messageContent += '✅ Todos os campos críticos foram preenchidos!';
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: messageContent
      }]);

      // Disparar pipeline completo
      if (triggerFullPipeline) {
        console.log('[REPROCESS] Disparando pipeline completo...');
        try {
          await triggerFullPipeline('Documentos reprocessados');
          console.log('[REPROCESS] ✅ Pipeline disparado');
        } catch (pipelineError) {
          console.error('[REPROCESS] Erro ao disparar pipeline:', pipelineError);
        }
      }

    } catch (error) {
      console.error('[REPROCESS] Erro:', error);
      toast({
        title: "❌ Erro ao reprocessar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Ocorreu um erro ao reprocessar os documentos. Por favor, tente novamente."
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      toast({
        title: "Gravando áudio",
        description: "Fale agora. Clique novamente para parar.",
      });
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      toast({
        title: "Erro ao acessar microfone",
        description: "Verifique as permissões do navegador.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    
    // Add temporary message in chat
    const transcribingMessageIndex = messages.length;
    setMessages(prev => [...prev, { 
      role: "assistant", 
      content: "🎤 Transcrevendo áudio..." 
    }]);
    
    toast({
      title: "Transcrevendo áudio...",
      description: "Aguarde enquanto processamos sua gravação.",
    });
    
    try {
      console.log('Transcribing audio...');
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Call voice-to-text function
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio }
      });

      if (error) throw error;

      console.log('Transcription result:', data);
      
      if (data.text) {
        const transcribedText = data.text;
        
        // ✅ FASE 6: SALVAR TRANSCRIÇÃO EM CASE_EXCEPTIONS PARA AUDITORIA
        if (data.caseId) {
          try {
            // Upload do áudio para storage
            const audioFileName = `audio_${Date.now()}.webm`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('case-documents')
              .upload(`${data.caseId}/${audioFileName}`, audioBlob);
            
            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage
                .from('case-documents')
                .getPublicUrl(`${data.caseId}/${audioFileName}`);
              
              // Salvar transcrição para auditoria
              await supabase
                .from('case_exceptions')
                .insert({
                  case_id: data.caseId,
                  exception_type: 'voice_transcription',
                  description: transcribedText,
                  voice_transcribed: true
                });
              
              console.log('[CHAT] ✅ Transcrição salva para auditoria');
            }
          } catch (error) {
            console.error('[CHAT] Erro ao salvar transcrição:', error);
            // Não interromper o fluxo se houver erro na auditoria
          }
        }
        
        // Remove temporary transcribing message
        setMessages(prev => prev.filter((_, idx) => idx !== transcribingMessageIndex));
        
        // Add user message with transcribed text
        setMessages(prev => [...prev, { 
          role: "user", 
          content: transcribedText 
        }]);
        
        // Detect special situation from transcribed text
        await detectSpecialSituation(transcribedText);
        
        // ✅ PROCESSAR TRANSCRIÇÃO COM IA (igual handleSendMessage)
        if (data.caseId) {
          console.log('[AUDIO] Processando transcrição com IA...');
          
          const { data: result, error } = await supabase.functions.invoke(
            'process-chat-message',
            { body: { caseId: data.caseId, messageText: transcribedText } }
          );

          if (error) {
            console.error('[AUDIO] Erro ao processar:', error);
          } else if (result?.extracted) {
            console.log('[AUDIO] Informações extraídas:', result.extracted);
            
            // Mostrar resumo
            setMessages(prev => [...prev, { 
              role: "assistant", 
              content: `📊 **Dados extraídos do áudio:**\n${result.extracted.summary}\n\n✅ Campos atualizados: ${result.updatedFields?.length || 0}\n📝 Registros: ${result.insertedRecords || 0}` 
            }]);

            // Disparar pipeline se houver mudanças
            if ((result.updatedFields?.length > 0 || result.insertedRecords > 0) && triggerFullPipeline) {
              console.log('[AUDIO] Disparando pipeline após extração...');
              await triggerFullPipeline('Informação extraída de áudio');
            }
            
            // ✅ DISPARAR EVENTO DE SINCRONIZAÇÃO
            window.dispatchEvent(new CustomEvent('case-updated', { 
              detail: { caseId: data.caseId, source: 'audio-extraction' } 
            }));
          }
        }
        
        // Add assistant confirmation
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "✅ Áudio transcrito e registrado! Há mais alguma informação que gostaria de adicionar?"
        }]);
        
        toast({
          title: "✅ Áudio transcrito com sucesso!",
          description: "A informação foi registrada no chat.",
        });
        
        setUserInput("");
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      
      // Remove temporary transcribing message on error
      setMessages(prev => prev.filter((_, idx) => idx !== transcribingMessageIndex));
      
      toast({
        title: "Erro ao transcrever áudio",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const detectSpecialSituation = async (text: string) => {
    try {
      const { data: detectionResult, error } = await supabase.functions.invoke(
        'detect-special-situation',
        { body: { text } }
      );
      
      if (error) throw error;
      
      if (detectionResult.isException && detectionResult.confidence > 0.6) {
        const newException = {
          type: detectionResult.type,
          description: text,
          voiceTranscribed: true,
        };
        
        updateData({
          hasSpecialSituation: true,
          specialNotes: text,
          exceptions: [...(data.exceptions || []), newException],
        });
        
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `⚠️ **Situação especial detectada:** ${detectionResult.typeName}\n\n` +
                   `Esta informação será incluída automaticamente na petição inicial.\n\n` +
                   `Descrição registrada: "${text}"`,
        }]);
      }
    } catch (error) {
      console.error('Erro ao detectar situação especial:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const messageText = userInput;
    setMessages(prev => [...prev, { role: "user", content: messageText }]);
    setUserInput("");
    setIsProcessing(true);
    
    try {
      // Detectar situação especial
      await detectSpecialSituation(messageText);
      
      // Se há um caseId, processar a mensagem com IA
      if (data.caseId) {
        console.log('[CHAT] Processando mensagem com IA...');
        
        const { data: result, error } = await supabase.functions.invoke(
          'process-chat-message',
          { body: { caseId: data.caseId, messageText } }
        );

        if (error) {
          console.error('[CHAT] Erro ao processar mensagem:', error);
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `⚠️ Erro ao processar: ${error.message}` 
          }]);
        } else if (result?.extracted) {
          console.log('[CHAT] Informações extraídas:', result.extracted);
          
          // Mostrar resumo amigável
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `✅ ${result.extracted.summary}\n\n📊 Campos atualizados: ${result.updatedFields?.length || 0}\n📝 Registros criados: ${result.insertedRecords || 0}` 
          }]);

          // Se houver mudanças significativas, disparar pipeline
          if (result.updatedFields?.length > 0 || result.insertedRecords > 0) {
            console.log('[CHAT] Disparando pipeline completo...');
            toast({
              title: "Informações atualizadas",
              description: "Reprocessando análise com novos dados...",
            });
            
            await triggerFullPipeline('Informação manual adicionada no chat');
          }
        } else {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "Obrigado pela informação! Há mais alguma informação que você gostaria de adicionar?" 
          }]);
        }
      } else {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Obrigado pela informação! Por favor, adicione documentos para criar o caso." 
        }]);
      }
    } catch (error: any) {
      console.error('[CHAT] Erro:', error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `❌ Erro: ${error.message}` 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Chat Inteligente</h2>
        <p className="text-muted-foreground">
          Envie os documentos e deixe a IA extrair as informações automaticamente
        </p>
      </div>

      {/* ✅ FASE 4: Painel de Status Visual */}
      {data.caseId && (
        <>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className={data.childName ? 'text-green-600' : 'text-red-600'}>
                  👶 Criança: {data.childName ? '✅' : '❌'}
                </span>
                <span className={data.authorName && data.authorName !== 'Processando...' ? 'text-green-600' : 'text-red-600'}>
                  👤 Mãe: {data.authorName && data.authorName !== 'Processando...' ? '✅' : '❌'}
                </span>
                <span className={data.authorCpf && data.authorCpf !== '00000000000' ? 'text-green-600' : 'text-red-600'}>
                  🪪 CPF: {data.authorCpf && data.authorCpf !== '00000000000' ? '✅' : '❌'}
                </span>
                <span className={data.raProtocol ? 'text-green-600' : 'text-muted-foreground'}>
                  📋 RA: {data.raProtocol ? '✅' : '⚪'}
                </span>
              </div>
            </AlertDescription>
          </Alert>
        </>
      )}

      {/* ✅ CORREÇÃO #2: Alerta de PDFs não processados */}
      {failedPdfs.length > 0 && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            <p className="font-medium mb-2 text-amber-900 dark:text-amber-100">
              ⚠️ {failedPdfs.length} PDF(s) não foram processados
            </p>
            <ul className="text-sm space-y-1 mb-3 text-amber-800 dark:text-amber-200">
              {failedPdfs.map((pdf, idx) => (
                <li key={idx}>📄 {pdf}</li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-600 text-amber-900 hover:bg-amber-100 dark:text-amber-100"
              onClick={async () => {
                try {
                  setIsProcessing(true);
                  const { data: result, error } = await supabase.functions.invoke('reconvert-failed-pdfs', {
                    body: { caseId: data.caseId }
                  });
                  
                  if (error) {
                    toast({
                      title: "Erro ao reconverter",
                      description: error.message,
                      variant: "destructive",
                    });
                  } else {
                    toast({
                      title: "PDFs reconvertendo",
                      description: `${result.reprocessed} PDFs sendo reconvertidos...`,
                    });
                    setFailedPdfs([]);
                    
                    // Recarregar após 3 segundos
                    setTimeout(() => {
                      window.location.reload();
                    }, 3000);
                  }
                } catch (error: any) {
                  toast({
                    title: "Erro",
                    description: error.message,
                    variant: "destructive",
                  });
                } finally {
                  setIsProcessing(false);
                }
              }}
            >
              🔄 Reconverter PDFs
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4">
        <ScrollArea className="h-96 pr-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{message.content}</p>
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm">Processando documentos...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>


      {/* Cole Prints com Ctrl+V - Versão Compacta */}
      <div className="p-1.5">
        <PasteDataInline
          extractionType="processo_administrativo"
          onDataExtracted={(extractedData) => {
            console.log('[CHAT] Dados extraídos via Ctrl+V:', extractedData);
            
            setMessages(prev => [...prev, {
              role: "assistant",
              content: `✅ Dados extraídos via Ctrl+V com sucesso!`
            }]);
            
            const updates: any = {};
            if (extractedData.raProtocol) updates.raProtocol = extractedData.raProtocol;
            if (extractedData.childName) updates.childName = extractedData.childName;
            if (extractedData.childBirthDate) updates.childBirthDate = extractedData.childBirthDate;
            if (extractedData.motherName) updates.motherName = extractedData.motherName;
            if (extractedData.motherCpf) updates.motherCpf = extractedData.motherCpf;
            if (extractedData.landOwnerCpf) updates.landOwnerCpf = extractedData.landOwnerCpf;
            if (extractedData.landOwnerRg) updates.landOwnerRg = extractedData.landOwnerRg;
            if (extractedData.landOwnerName) updates.landOwnerName = extractedData.landOwnerName;
            
            if (Object.keys(updates).length > 0) {
              updateData(updates);
              toast({ title: `${Object.keys(updates).length} campo(s) atualizado(s)` });
            }
          }}
          placeholder="Ctrl+V para colar print ou texto..."
        />
      </div>

      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || isRecording}
          className="flex-shrink-0"
        >
          <Upload className="h-4 w-4 mr-2" />
          Documentos
        </Button>
        
        <Button
          variant={isRecording ? "destructive" : isTranscribing ? "secondary" : "outline"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing || isTranscribing}
          className="flex-shrink-0"
        >
          {isRecording ? (
            <>
              <Mic className="h-4 w-4 mr-2 animate-pulse" />
              Parar
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Transcrevendo
            </>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        <Input
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isProcessing && !isTranscribing && handleSendMessage()}
          placeholder="Digite ou grave informações complementares..."
          disabled={isProcessing || isRecording || isTranscribing}
        />

        <Button
          onClick={handleSendMessage}
          disabled={!userInput.trim() || isProcessing || isRecording || isTranscribing}
          className="flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>

        {/* ✅ BOTÃO DE REPROCESSAR DOCUMENTOS */}
        {data.caseId && (
          <Button 
            onClick={handleReprocessAllDocuments}
            disabled={isProcessing}
            variant="secondary"
            className="gap-2 flex-shrink-0"
            title="Reprocessar todos os documentos do caso com IA"
          >
            <RefreshCw className="h-4 w-4" />
            Reprocessar
          </Button>
        )}
      </div>

      <div className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 inline mr-1" />
          Tamanho máximo por arquivo: 200MB
        </div>
        
        <Button
          onClick={onComplete}
          disabled={!data.extractedData && uploadedFiles.length === 0}
        >
          Próximo
        </Button>
      </div>

      {/* Diálogo de Confirmação para Descongelar */}
      <UnfreezeConfirmDialog
        open={showUnfreezeDialog}
        onOpenChange={setShowUnfreezeDialog}
        action="adicionar novos documentos"
        onConfirm={async () => {
          if (!data.caseId) return;
          
          const success = await unfreezeCase(data.caseId);
          if (success && pendingFiles.length > 0) {
            setShowUnfreezeDialog(false);
            // Continuar com o processamento
            await processDocuments(pendingFiles);
            setPendingFiles([]);
          }
        }}
      />
    </div>
  );
};
