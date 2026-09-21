import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em public.csat_results via Supabase Realtime e invalida
 * as queries do Analytics/CSAT — os cards e gráficos atualizam sozinhos
 * quando uma nova avaliação chega, sem precisar dar F5. Invalidações
 * agrupadas (throttle), mesmo motivo de useRealtimeConversas.
 */
const INVALIDATE_MS = 30_000;

export function useRealtimeCsat() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const invalidar = () => {
      timer = null;
      queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-evolucao"] });
      queryClient.invalidateQueries({ queryKey: ["operador-ranking"] });
      queryClient.invalidateQueries({ queryKey: ["distribuicao"] });
      queryClient.invalidateQueries({ queryKey: ["csat"] });
      queryClient.invalidateQueries({ queryKey: ["csat-planilha"] });
      queryClient.invalidateQueries({ queryKey: ["csat-dashboard"] });
    };

    const channel = sb
      .channel("csat-results-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "csat_results" },
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
