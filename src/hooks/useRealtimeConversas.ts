import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em public.crisp_conversations via Supabase Realtime.
 * O Dashboard, Atendimentos e Performance atualizam sozinhos quando o n8n
 * grava uma conversa, sem precisar recarregar a página.
 *
 * As invalidações são agrupadas (throttle de INVALIDATE_MS): o n8n escreve em
 * crisp_conversations o tempo todo, e cada invalidação refaz agregações
 * pesadas em TODA aba aberta. Sem isso, 1 escrita = 6 RPCs por aba — foi o
 * que saturou o compute do Supabase (ver CLAUDE.md, 2026-09-21).
 */
const INVALIDATE_MS = 30_000;

export function useRealtimeConversas() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const invalidar = () => {
      timer = null;
      queryClient.invalidateQueries({ queryKey: ["dashboard-atendimento"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-evolucao"] });
      queryClient.invalidateQueries({ queryKey: ["atendente-performance"] });
      queryClient.invalidateQueries({ queryKey: ["distribuicao-conversas"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-filtradas"] });
      queryClient.invalidateQueries({ queryKey: ["conversas-nota-baixa"] });
    };

    const channel = sb
      .channel("crisp-conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crisp_conversations" },
        () => {
          if (!timer) timer = setTimeout(invalidar, INVALIDATE_MS);
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [queryClient]);
}
