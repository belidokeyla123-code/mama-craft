import { useEffect, useRef } from 'react';

/**
 * ✅ FASE 2: Hook genérico para sincronização de abas em tempo real
 * 
 * Permite que cada aba "se inscreva" para receber atualizações específicas
 * e execute uma função de callback quando eventos acontecem.
 * 
 * @param caseId - ID do caso
 * @param events - Lista de eventos que esta aba deve escutar
 * @param onSync - Função a chamar quando evento acontece
 */

interface UseTabSyncOptions {
  caseId: string;
  events: string[];
  onSync: (detail: any) => void;
}

export const useTabSync = ({ caseId, events, onSync }: UseTabSyncOptions) => {
  const lastTimestampRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!caseId) return;

    const handleSync = (e: CustomEvent) => {
      const eventName = e.type;
      const timestamp = e.detail?.timestamp || Date.now();
      
      // ✅ FASE 5: Prevenir recarregamentos duplicados (cache simples)
      const lastTimestamp = lastTimestampRef.current[eventName];
      if (lastTimestamp && timestamp - lastTimestamp < 1000) {
        console.log(`[TAB-SYNC] ⏭️ Ignorando evento duplicado: ${eventName}`);
        return;
      }
      
      lastTimestampRef.current[eventName] = timestamp;
      
      console.log(`[TAB-SYNC] 🔄 Evento recebido: ${eventName} para caso ${caseId}`);
      console.log(`[TAB-SYNC] 📦 Detalhe do evento:`, e.detail);
      onSync(e.detail);
    };
    
    // Inscrever-se em todos os eventos especificados
    events.forEach(eventName => {
      window.addEventListener(eventName, handleSync as EventListener);
      console.log(`[TAB-SYNC] 📡 Inscrito no evento: ${eventName}`);
    });
    
    return () => {
      events.forEach(eventName => {
        window.removeEventListener(eventName, handleSync as EventListener);
      });
      console.log(`[TAB-SYNC] 🛑 Desinscrição completa`);
    };
  }, [caseId, events.join(',')]); // Dependências otimizadas
};
