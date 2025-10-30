import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * ✅ FASE 2: Hook para sincronização em tempo real do chat com outras abas
 * 
 * Escuta mudanças na tabela 'cases' e dispara eventos globais para forçar refresh
 * em todos os componentes que dependem dos dados do caso.
 */
export const useChatSync = (caseId: string) => {
  useEffect(() => {
    if (!caseId) return;

    console.log('[CHAT-SYNC] 🔄 Iniciando sincronização COMPLETA em tempo real para caso:', caseId);

    // ✅ FASE 1: ESCUTAR TODAS AS TABELAS RELEVANTES
    const channel = supabase
      .channel(`case-${caseId}`)
      // Tabela: cases
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cases',
          filter: `id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📡 Caso atualizado:', payload.new);
          window.dispatchEvent(new CustomEvent('case-updated', { 
            detail: { caseId, data: payload.new, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: documents (INSERT e UPDATE)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'documents',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📄 Novo documento adicionado:', payload.new);
          window.dispatchEvent(new CustomEvent('documents-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📝 Documento atualizado:', payload.new);
          window.dispatchEvent(new CustomEvent('documents-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: case_analysis
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'case_analysis',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📊 Análise atualizada:', payload.new);
          window.dispatchEvent(new CustomEvent('analysis-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: extractions
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'extractions',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 🔍 Extração atualizada:', payload.new);
          window.dispatchEvent(new CustomEvent('extractions-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: benefit_history
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'benefit_history',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 💰 Benefícios atualizados:', payload.new);
          window.dispatchEvent(new CustomEvent('benefits-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: document_validation
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_validation',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] ✅ Validação atualizada:', payload.new);
          window.dispatchEvent(new CustomEvent('validation-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: jurisprudence_results
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jurisprudence_results',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] ⚖️ Jurisprudência atualizada:', payload.new);
          window.dispatchEvent(new CustomEvent('jurisprudence-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: teses_juridicas
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teses_juridicas',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📚 Teses atualizadas:', payload.new);
          window.dispatchEvent(new CustomEvent('teses-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: drafts
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drafts',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📝 Minuta atualizada:', payload.new);
          window.dispatchEvent(new CustomEvent('draft-updated', { 
            detail: { caseId, timestamp: Date.now() } 
          }));
        }
      )
      // Tabela: processing_queue (para saber quando processamento termina)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_queue',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] ⚙️ Status de processamento:', payload.new);
          
          const status = (payload.new as any)?.status;
          if (status === 'completed') {
            window.dispatchEvent(new CustomEvent('processing-completed', { 
              detail: { caseId, timestamp: Date.now() } 
            }));
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[CHAT-SYNC] 🛑 Desconectando sincronização');
      supabase.removeChannel(channel);
    };
  }, [caseId]);
};
