import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Star, StarOff, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/formatDuration";
import { cn } from "@/lib/utils";
import { fetchAtendimentoTimeline, type AtendimentoComMetricas, type AtendimentoTimelineEntry } from "@/services/api";

const GAP_LABEL: Record<"fila" | "resolvido", string> = {
  fila: "Sem atendente (fila)",
  resolvido: "Sem atendente (resolvido, aguardando reabertura)",
};
const GAP_AINDA_ATIVO: Record<"fila" | "resolvido", string> = {
  fila: "agora (ainda em fila)",
  resolvido: "agora (ainda aguardando reabertura)",
};

function labelDoTrecho(t: AtendimentoTimelineEntry) {
  return t.tipo === "atendente" ? t.atendente ?? "—" : GAP_LABEL[t.tipo];
}

function aindaAtivoDoTrecho(t: AtendimentoTimelineEntry) {
  return t.tipo === "atendente" ? "agora (ainda com o chamado)" : GAP_AINDA_ATIVO[t.tipo];
}

// Valores reais de crisp_conversations.status são "pending"/"resolved".
const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  resolved: "success",
  pending: "warning",
};
const statusLabel: Record<string, string> = { resolved: "Resolvido", pending: "Pendente" };

interface AtendimentoDetalheDialogProps {
  atendimento: AtendimentoComMetricas;
  onClose: () => void;
}

// Popup com todos os campos de um atendimento — a tabela da aba Atendimentos
// trunca nome/e-mail do cliente e não mostra tempo de resolução em telas
// menores; aqui mostra tudo, sem cortar.
export function AtendimentoDetalheDialog({ atendimento: c, onClose }: AtendimentoDetalheDialogProps) {
  const invalido = c.invalido_resposta_antes_inicio || c.invalido_tempo_negativo;

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ["atendimento-timeline", c.crisp_id],
    queryFn: () => fetchAtendimentoTimeline(c.crisp_id!),
    enabled: !!c.crisp_id,
  });

  return (
    <Dialog onClose={onClose} className="max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-ink">{c.cliente_nome ?? "Cliente não identificado"}</h3>
          <p className="text-xs text-ink/50">{c.cliente_email ?? "—"}</p>
        </div>
        <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
          {c.status ? statusLabel[c.status] ?? c.status : "—"}
        </Badge>
        <Badge
          tone="info"
          title="1 (a conversa em si) + quantas vezes já reabriu depois de resolvida. Uma troca de atendente sem passar por 'resolvido' no meio (handoff) não conta como chamado novo — só reabertura conta."
        >
          {1 + c.reopened_count} {1 + c.reopened_count === 1 ? "chamado" : "chamados"}
        </Badge>
        {c.canal && <Badge tone="neutral">{c.canal}</Badge>}
        {c.tipo_cliente && <Badge tone="neutral">{c.tipo_cliente}</Badge>}
        {c.reopened_count > 0 && (
          <Badge
            tone="warning"
            title="Cliente reabriu esse chamado depois de já ter sido marcado como resolvido — o tempo parado entre uma resolução e a reabertura entra na conta de 'Tempo até resolução' quando (se) fechar de vez."
          >
            🔄 Reaberto {c.reopened_count}x
          </Badge>
        )}
        {c.status === "resolved" && (
          c.avaliado ? (
            <Badge tone="success" className="gap-1" title="Existe uma avaliação de CSAT vinculada diretamente a esse chamado.">
              <Star size={12} className="fill-current" /> Avaliado
            </Badge>
          ) : (
            <Badge
              tone="neutral"
              className="gap-1"
              title="Nenhuma avaliação de CSAT vinculada diretamente a esse chamado. Esse vínculo direto só existe pro dado mais recente (desde 26/08/2026) — uma avaliação real pode existir sem aparecer aqui se for de antes disso."
            >
              <StarOff size={12} /> Não avaliado
            </Badge>
          )
        )}
        {invalido && (
          <span title="Dado inconsistente: resposta antes do início ou tempo negativo" className="inline-flex items-center gap-1 text-xs text-rust-500">
            <AlertTriangle size={12} /> dado inválido
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendente</p>
          <p className="text-ink">{c.operator_nome ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">E-mail do atendente</p>
          <p className="text-ink">{c.operator_email || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Início</p>
          <p className="text-ink">{new Date(c.current_started_at).toLocaleString("pt-BR")}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">1ª resposta humana</p>
          <p className="text-ink">
            {c.invalido_sem_resposta_humana ? "sem resposta humana" : c.primeira_resposta_humana_at ? new Date(c.primeira_resposta_humana_at).toLocaleString("pt-BR") : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Resolvido em</p>
          <p className="text-ink">{c.resolved_at ? new Date(c.resolved_at).toLocaleString("pt-BR") : "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo até 1ª resposta</p>
          <p className="text-ink">{c.invalido_sem_resposta_humana ? "—" : formatDuration(c.tempo_primeira_resposta_seg)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo até resolução</p>
          {c.resolved_at ? (
            <p className="text-ink">{formatDuration(c.tempo_resolucao_seg)}</p>
          ) : (
            <p
              className="text-amber-600"
              title="Chamado ainda aberto — este é o tempo decorrido até agora (mesma conta que 'Tempo até resolução' passaria a mostrar se resolvesse neste instante), não um valor final. Muda a cada vez que você abrir este popup."
            >
              {formatDuration(c.tempo_aberto_seg)}{" "}
              <span className="text-[11px] font-normal text-ink/40">(em aberto, ainda contando)</span>
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">1ª resposta geral (com bot)</p>
          <p className="text-ink">{formatDuration(c.tempo_primeira_resposta_geral_seg)}</p>
        </div>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wide text-ink/40"
            title="Tempo que o atendente atual ficou de posse desse chamado — sempre em horas corridas (não desconta fora de expediente, diferente de 'Tempo até resolução' ao lado). Por isso pode ficar bem maior quando o chamado atravessa noite/fim de semana."
          >
            Tempo ativo (atendente atual)
          </p>
          <p className="text-ink">{formatDuration(c.tempo_ativo_seg)}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendentes que passaram por esse chamado</p>
        {loadingTimeline ? (
          <p className="mt-1 text-sm text-ink/50">Carregando...</p>
        ) : !timeline || timeline.length === 0 ? (
          <p className="mt-1 text-sm text-ink/50">Sem histórico de atribuição registrado.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {timeline.map((t, i) => {
              const isGap = t.tipo !== "atendente";
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                    isGap ? "border-dashed border-sand-line bg-sand-bg/60" : "border-sand-line"
                  )}
                >
                  <div className="min-w-0">
                    <p className={cn("truncate", isGap ? "italic text-ink/40" : "font-medium text-ink")}>{labelDoTrecho(t)}</p>
                    <p className="truncate text-xs text-ink/50">
                      {new Date(t.atribuido_em).toLocaleString("pt-BR")}
                      {" → "}
                      {t.ainda_ativo ? aindaAtivoDoTrecho(t) : new Date(t.liberado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-xs font-medium", isGap ? "text-ink/40" : "text-ink/60")}>
                    {formatDuration(t.minutos_posse * 60)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {c.link_chamado && (
        <a href={c.link_chamado} target="_blank" rel="noreferrer" className="mt-4 inline-block" onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm">
            <ExternalLink size={13} /> Ver chamado
          </Button>
        </a>
      )}
    </Dialog>
  );
}
