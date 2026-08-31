import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useRealtimeUserStatus } from "@/hooks/useRealtimeUserStatus";
import { fetchUserStatuses, upsertMyStatus } from "@/services/api";
import type { CollaboratorStatus, DbUserStatus } from "@/types/database";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "neutral" | "brand" | "info" | "ausencia";

const statusConfig: Record<CollaboratorStatus, { label: string; dot: string; tone: Tone }> = {
  online: { label: "Online", dot: "bg-forest-500", tone: "success" },
  plantao: { label: "Plantão", dot: "bg-forest-700", tone: "brand" },
  almoco: { label: "Almoço", dot: "bg-amber-500", tone: "warning" },
  offline: { label: "Offline", dot: "bg-ink/30", tone: "neutral" },
  folga: { label: "Folga", dot: "bg-sky-500", tone: "info" },
  ferias: { label: "Férias", dot: "bg-violet-500", tone: "ausencia" },
};

// Ordem de exibição: Online sempre primeiro, depois a prioridade pedida
const ORDEM: Record<CollaboratorStatus, number> = {
  online: 0,
  plantao: 1,
  almoco: 2,
  folga: 3,
  offline: 4,
  ferias: 5,
};

// Status que representam "presente/trabalhando" para fins de checagem de divergência
const STATUS_ATIVO: CollaboratorStatus[] = ["online", "plantao"];

function dentroDoHorario(horaAtual: string, inicio: string | null, fim: string | null) {
  if (!inicio || !fim) return null; // sem jornada cadastrada, não dá para avaliar
  return horaAtual >= inicio.slice(0, 5) && horaAtual <= fim.slice(0, 5);
}

function divergencia(s: DbUserStatus): string | null {
  const agora = new Date().toTimeString().slice(0, 5);
  const dentro = dentroDoHorario(agora, s.horario_inicio, s.horario_fim);
  if (dentro === null) return null;

  const ativo = STATUS_ATIVO.includes(s.status);
  if (dentro && !ativo && s.status !== "almoco") {
    return `Marcado como "${statusConfig[s.status].label}" dentro do horário previsto (${s.horario_inicio?.slice(0, 5)}–${s.horario_fim?.slice(0, 5)}).`;
  }
  if (!dentro && ativo) {
    return `Status alterado manualmente, fora do horário previsto (${s.horario_inicio?.slice(0, 5)}–${s.horario_fim?.slice(0, 5)}).`;
  }
  return null;
}

function StatusPopover({
  atual,
  onEscolher,
  onFechar,
}: {
  atual: CollaboratorStatus;
  onEscolher: (s: CollaboratorStatus) => void;
  onFechar: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-sand-line bg-sand-surface p-1.5 shadow-float">
      {(Object.entries(statusConfig) as [CollaboratorStatus, (typeof statusConfig)[CollaboratorStatus]][]).map(
        ([valor, cfg]) => (
          <button
            key={valor}
            onClick={() => {
              onEscolher(valor);
              onFechar();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-sand-bg",
              valor === atual && "bg-sand-bg"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </button>
        )
      )}
    </div>
  );
}

function CardSkeletonColaborador() {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sand-line/70" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3 w-2/3 animate-pulse rounded bg-sand-line/70" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-sand-line/50" />
      </div>
    </Card>
  );
}

export function CollaboratorsOnline() {
  useRealtimeUserStatus();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { mostrarErro } = useToast();
  const [popoverAberto, setPopoverAberto] = useState<string | null>(null);

  const { data: statuses, isLoading } = useQuery({
    queryKey: ["user-statuses"],
    queryFn: fetchUserStatuses,
  });

  const ordenados = useMemo(() => {
    return [...(statuses ?? [])].sort((a, b) => ORDEM[a.status] - ORDEM[b.status]);
  }, [statuses]);

  async function alterarStatus(userId: string, status: CollaboratorStatus) {
    try {
      await upsertMyStatus(userId, status);
      queryClient.invalidateQueries({ queryKey: ["user-statuses"] });
    } catch (err) {
      mostrarErro(
        err instanceof Error ? `Não foi possível atualizar o status: ${err.message}` : "Não foi possível atualizar o status."
      );
    }
  }

  return (
    <div>
      {popoverAberto && (
        <div className="fixed inset-0 z-10" onClick={() => setPopoverAberto(null)} />
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-ink">Colaboradores</h2>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeletonColaborador key={i} />
          ))}
        </div>
      ) : ordenados.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador na sua equipe ainda."
          description="Assim que colaboradores forem cadastrados, o status de cada um aparece aqui."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AnimatePresence initial={false}>
            {ordenados.map((s) => {
              const cfg = statusConfig[s.status];
              const podeEditar = user && (user.id === s.user_id || user.perfil === "administrador");
              const alerta = divergencia(s);
              return (
                <motion.div
                  key={s.id}
                  layout
                  layoutId={s.id}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Card className="relative flex items-center gap-3 border-sand-line p-4 transition-colors hover:bg-sand-subtle">
                    <Avatar nome={s.users?.nome ?? "?"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{s.users?.nome}</p>
                      <p className="truncate text-xs text-ink/50">
                        {s.horario_inicio && s.horario_fim
                          ? `${s.horario_inicio.slice(0, 5)} – ${s.horario_fim.slice(0, 5)}`
                          : s.users?.cargo}
                      </p>
                    </div>

                    <div className="absolute right-3 top-3 flex items-center gap-1">
                      {alerta && (
                        <span title={alerta} className="text-amber-600">
                          <AlertTriangle size={13} />
                        </span>
                      )}
                      <div className="relative">
                        <button
                          disabled={!podeEditar}
                          onClick={() => podeEditar && setPopoverAberto((p) => (p === s.id ? null : s.id))}
                          className={cn(
                            "flex items-center gap-0.5 rounded-full",
                            podeEditar && "cursor-pointer"
                          )}
                        >
                          <Badge tone={cfg.tone} className="gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                            {cfg.label}
                            {podeEditar && <ChevronDown size={10} />}
                          </Badge>
                        </button>
                        {popoverAberto === s.id && (
                          <StatusPopover
                            atual={s.status}
                            onEscolher={(novo) => alterarStatus(s.user_id, novo)}
                            onFechar={() => setPopoverAberto(null)}
                          />
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
