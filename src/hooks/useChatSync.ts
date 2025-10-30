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

    console.log('[CHAT-SYNC] 🔄 Iniciando sincronização em tempo real para caso:', caseId);

    // ✅ ESCUTAR MUDANÇAS EM TEMPO REAL NA TABELA CASES
    const channel = supabase
      .channel(`case-${caseId}`)
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
          
          // Disparar evento customizado para outras abas escutarem
          window.dispatchEvent(new CustomEvent('case-updated', { 
            detail: { caseId, data: payload.new } 
          }));
        }
      )
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
          
          // Disparar evento para atualizar lista de documentos
          window.dispatchEvent(new CustomEvent('documents-updated', { 
            detail: { caseId } 
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'case_analysis',
          filter: `case_id=eq.${caseId}`
        },
        (payload) => {
          console.log('[CHAT-SYNC] 📊 Análise atualizada:', payload.new);
          
          // Disparar evento para atualizar análise
          window.dispatchEvent(new CustomEvent('analysis-updated', { 
            detail: { caseId } 
          }));
        }
      )
      .subscribe();

    return () => {
      console.log('[CHAT-SYNC] 🛑 Desconectando sincronização');
      supabase.removeChannel(channel);
    };
  }, [caseId]);
};
