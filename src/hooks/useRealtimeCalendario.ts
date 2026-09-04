import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABELAS = [
  "calendar_leave_requests",
  "calendar_saturday_oncall",
  "calendar_oncall",
  "calendar_vacations",
  "calendar_day_entries",
];

export function useRealtimeCalendario() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb.channel("calendario-changes");
    TABELAS.forEach((tabela) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => {
        queryClient.invalidateQueries({ queryKey: ["calendario"] });
      });
    });
    channel.subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient]);
}
