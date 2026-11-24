import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Atualiza sozinho o Dashboard/Performance do Overview a cada 2 min, só com a aba visível;
 * voltando pra aba depois disso, atualiza uma vez na hora.
 *
 * Até 2026-11-24 era o Realtime de crisp_conversations (useRealtimeConversas, com throttle de
 * 30 s): cada gravação do n8n passava pelo Realtime (1,7 milhão de consultas) e a aba escondida
 * continuava refazendo as agregações pesadas (~22 h de banco desde 20/08). A tabela saiu da
 * publicação supabase_realtime (supabase/sql/2026-11-24_limpeza_e_desempenho.sql).
 */
const INTERVALO_MS = 120_000;

export function useAtualizacaoOverview() {
  const queryClient = useQueryClient();
  const ultima = useRef(Date.now());

  useEffect(() => {
    const invalidar = () => {
      ultima.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ["dashboard-atendimento"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-evolucao"] });
      queryClient.invalidateQueries({ queryKey: ["atendente-performance"] });
      queryClient.invalidateQueries({ queryKey: ["distribuicao-conversas"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-filtradas"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-nota-baixa"] });
    };
    const visivel = () => document.visibilityState === "visible";
    const timer = setInterval(() => {
      if (visivel()) invalidar();
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (visivel() && Date.now() - ultima.current >= INTERVALO_MS) invalidar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [queryClient]);
}
