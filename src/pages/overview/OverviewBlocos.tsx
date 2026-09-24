import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Hourglass, Inbox, MessageSquareHeart, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct1, nomeCanal, type DeltaInfo } from "@/lib/resultadosSac";
import type { AtendidoNaoResolvido, BacklogFaixa } from "@/services/api";
import type { DbCsatResult } from "@/types/database";

// Blocos da aba Dashboard do Overview (redesenho de 2026-09-24): topo com
// 5 indicadores, "Precisa de atenção" e o cabeçalho padrão das seções.

// ---------- Cabeçalho padrão de seção ----------
// Título + uma linha de explicação + "?" com a definição (no lugar dos
// textos escondidos em `title` que existiam antes em cada card).
export function SecaoHead({ titulo, subtitulo, ajuda, acao }: { titulo: string; subtitulo?: string; ajuda?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-[15px] font-bold text-ink">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-[12.5px] text-ink/50">{subtitulo}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {acao}
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </div>
    </div>
  );
}

function Ajuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="O que significa"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border border-sand-line-strong text-xs font-bold text-ink/50 transition hover:text-ink",
          aberto && "bg-sand-subtle text-ink"
        )}
      >
        ?
      </button>
      {aberto && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-xl border border-sand-line-strong bg-sand-surface p-3 text-xs leading-relaxed text-ink/60 shadow-float">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------- Indicador do topo ----------
// Variação num selo (verde = melhorou, vermelho = piorou, cinza = estável).
function SeloDelta({ delta }: { delta?: DeltaInfo }) {
  if (!delta) return <span className="text-xs text-ink/40">sem comparação</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
        delta.bom === null
          ? "bg-sand-subtle text-ink/50"
          : delta.bom
            ? "bg-forest-500/10 text-forest-700 dark:text-forest-300"
            : "bg-rust-500/10 text-rust-600 dark:text-rust-400"
      )}
    >
      {delta.texto}
    </span>
  );
}

export function SaudeKpi({ label, valor, delta, contexto }: { label: string; valor: string; delta?: DeltaInfo; contexto?: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4 transition hover:shadow-card-hover">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</span>
      <span className="font-display text-[28px] font-bold leading-none tracking-tight tabular-nums text-ink">{valor}</span>
      <SeloDelta delta={delta} />
      {contexto && <span className="text-xs leading-snug text-ink/50">{contexto}</span>}
    </Card>
  );
}

// Card interno do "Precisa de atenção": fundo destacado + ícone no título.
function BlocoAtencao({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-sand-surface p-4 shadow-card ring-1 ring-sand-line">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-500/10 text-forest-600 dark:text-forest-300">
          <Icone size={16} />
        </span>
        <h3 className="text-[13.5px] font-bold text-ink">{titulo}</h3>
      </div>
      {children}
    </div>
  );
}

// ---------- Precisa de atenção ----------
const ORDEM_BACKLOG = ["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"];

export function PrecisaAtencao({
  atendido,
  paradosPct,
  deltaAbertos,
  funil,
  backlog,
  filtroAtivo,
  onAbrirBacklog,
  onAbrirAtendente,
}: {
  atendido: AtendidoNaoResolvido[];
  paradosPct: number | null;
  deltaAbertos?: DeltaInfo;
  funil: { canal: string; taxa: number | null; total: boolean; resolvidas: number; respondidas: number; conversas: number }[];
  backlog: BacklogFaixa[];
  filtroAtivo: boolean;
  onAbrirBacklog: (faixa: string) => void;
  onAbrirAtendente: (nome: string) => void;
}) {
  const abertos = atendido.reduce((t, r) => t + r.abertos, 0);
  const parados = atendido.reduce((t, r) => t + r.parados_48h, 0);
  const maxAbertos = Math.max(1, ...atendido.map((r) => r.abertos));
  const canais = funil.filter((f) => !f.total);
  const totalFunil = funil.find((f) => f.total);
  const backlogOrdenado = ORDEM_BACKLOG.map((faixa) => backlog.find((b) => b.faixa === faixa) ?? { faixa, total: 0 });
  const backlogTotal = backlogOrdenado.reduce((t, b) => t + b.total, 0);
  const backlogVelho = backlogOrdenado.find((b) => b.faixa === "+7 dias")?.total ?? 0;

  return (
    <Card className="border-forest-500/30 bg-forest-500/[0.04] p-5">
      <SecaoHead
        titulo="Precisa de atenção"
        subtitulo="O que está parado agora. Clique num atendente ou numa faixa pra ver as conversas."
        ajuda={
          <>
            <p><b>Atendido e não resolvido:</b> conversas do período com resposta humana que continuam abertas, por dono atual. Sem resolução, o cliente não recebe a pesquisa de CSAT. Parado = sem mensagem nova há 48h.</p>
            <p className="mt-2"><b>Funil do CSAT:</b> respondidas ÷ resolvidas, por canal, com as conversas iniciadas no período.</p>
            <p className="mt-2"><b>Backlog:</b> tudo que está aberto agora, pela idade — não depende do período.</p>
          </>
        }
      />
      {filtroAtivo && (
        <p className="mb-3 text-[11px] text-ink/40">Funil e backlog mostram o time inteiro; o filtro de atendente vale só para "Atendido e não resolvido".</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
        <BlocoAtencao icone={Hourglass} titulo="Atendido e não resolvido">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[26px] font-bold tabular-nums text-ink">{fmtNum(abertos)}</span>
            {parados > 0 && <Badge tone="danger">{fmtNum(parados)} parados há +48h</Badge>}
            {deltaAbertos && <SeloDelta delta={deltaAbertos} />}
          </div>
          {paradosPct != null && <p className="text-xs text-ink/50">{fmtPct1(paradosPct)} dos abertos estão parados.</p>}
          <div className="flex gap-4 text-[11px] text-ink/50">
            <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-rust-500" />parados +48h</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-forest-500" />recentes</span>
          </div>
          {atendido.length === 0 ? (
            <p className="text-xs text-ink/50">Nenhuma conversa atendida em aberto no período.</p>
          ) : (
            atendido.slice(0, 6).map((r) => (
              <button
                key={r.atendente}
                type="button"
                onClick={() => onAbrirAtendente(r.atendente)}
                className="grid grid-cols-[120px_1fr_70px] items-center gap-2.5 rounded-lg text-left text-[12.5px] transition hover:bg-sand-subtle"
              >
                <span className="truncate text-ink" title={r.atendente}>{r.atendente.split(" ").slice(0, 2).join(" ")}</span>
                <span className="flex h-2.5 overflow-hidden rounded-full bg-sand-subtle">
                  <i className="block h-full bg-rust-500" style={{ width: `${(r.parados_48h / maxAbertos) * 100}%` }} />
                  <i className="block h-full bg-forest-500" style={{ width: `${((r.abertos - r.parados_48h) / maxAbertos) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-ink/50"><b className="text-ink">{fmtNum(r.abertos)}</b> · {fmtNum(r.parados_48h)}</span>
              </button>
            ))
          )}
        </BlocoAtencao>

        <BlocoAtencao icone={MessageSquareHeart} titulo="Funil do CSAT · taxa de resposta">
          <p className="text-xs text-ink/50">Respondidas ÷ resolvidas, por canal.</p>
          {canais.length === 0 ? (
            <p className="text-xs text-ink/50">Sem conversas resolvidas no período.</p>
          ) : (
            canais.map((f) => (
              <div key={f.canal} className="grid grid-cols-[76px_1fr_56px] items-center gap-2.5 text-[12.5px]">
                <span className="text-ink">{nomeCanal(f.canal)}</span>
                <span className="h-3.5 overflow-hidden rounded-full bg-sand-subtle">
                  <i className="block h-full bg-forest-500" style={{ width: `${Math.min(100, f.taxa ?? 0)}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-ink">{fmtPct1(f.taxa)}</span>
              </div>
            ))
          )}
          {totalFunil && (
            <p className="text-xs text-ink/50">
              {fmtNum(totalFunil.conversas)} conversas → {fmtNum(totalFunil.resolvidas)} resolvidas → {fmtNum(totalFunil.respondidas)} respondidas.
            </p>
          )}
        </BlocoAtencao>

        <BlocoAtencao icone={Inbox} titulo="Backlog aberto agora">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[26px] font-bold tabular-nums text-ink">{fmtNum(backlogTotal)}</span>
            {backlogTotal > 0 && <Badge tone="danger">{fmtPct1((backlogVelho / backlogTotal) * 100)} com +7 dias</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {backlogOrdenado.map((b) => (
              <button
                key={b.faixa}
                type="button"
                disabled={b.total === 0}
                onClick={() => onAbrirBacklog(b.faixa)}
                className={cn(
                  "rounded-xl px-2.5 py-2 text-left transition enabled:hover:ring-1 enabled:hover:ring-sand-line-strong disabled:cursor-default",
                  b.faixa === "+7 dias" ? "bg-rust-500/10" : "bg-sand-subtle"
                )}
              >
                <span className="block text-[11px] text-ink/50">{b.faixa}</span>
                <span className={cn("font-display text-lg font-bold tabular-nums", b.faixa === "+7 dias" ? "text-rust-600 dark:text-rust-400" : "text-ink")}>{fmtNum(b.total)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink/50">A maior parte do que passa de 7 dias só teve resposta do bot e nunca foi fechada.</p>
        </BlocoAtencao>
      </div>
    </Card>
  );
}

// ---------- Pop-up das avaliações ruins ----------
export function CsatRuinsDialog({
  avaliacoes,
  carregando,
  onClose,
  onAbrirDetalhe,
}: {
  avaliacoes: DbCsatResult[] | undefined;
  carregando: boolean;
  onClose: () => void;
  onAbrirDetalhe: (r: DbCsatResult) => void;
}) {
  const lista = avaliacoes ?? [];
  const comComentario = lista.filter((r) => (r.comentario ?? "").trim() !== "").length;
  return (
    <Dialog onClose={onClose} className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-ink">Avaliações ruins (nota 1–3)</h3>
          <p className="mt-0.5 text-xs text-ink/50">
            {carregando ? "Carregando..." : `${fmtNum(lista.length)} avaliações · ${fmtNum(comComentario)} com comentário · pior nota primeiro`}
          </p>
        </div>
      </div>
      {!carregando && lista.length === 0 ? (
        <p className="text-sm text-ink/50">Nenhuma avaliação ruim no período.</p>
      ) : (
        <div className="space-y-2.5">
          {lista.map((r) => {
            const comentario = (r.comentario ?? "").trim();
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onAbrirDetalhe(r)}
                onKeyDown={(e) => { if (e.key === "Enter") onAbrirDetalhe(r); }}
                className="cursor-pointer rounded-xl border border-sand-line p-3.5 transition hover:border-sand-line-strong hover:bg-sand-subtle/60"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="danger">Nota {r.nota ?? "—"}</Badge>
                  <span className="font-semibold text-ink">{r.cliente || "Cliente sem nome"}</span>
                  <span className="text-ink/40">·</span>
                  <span className="text-ink/60">{r.atendente || "Sem atendente"}</span>
                  {r.canal && <><span className="text-ink/40">·</span><span className="text-ink/60">{r.canal}</span></>}
                  <span className="text-ink/40">·</span>
                  <span className="tabular-nums text-ink/50">{new Date(r.data_hora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  {r.link_chamado && (
                    <a
                      href={r.link_chamado}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-sand-line px-2.5 py-1 font-semibold text-forest-700 transition hover:bg-sand-subtle dark:text-forest-300"
                    >
                      Ver chamado <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <p className={cn("mt-2 whitespace-pre-wrap text-sm", comentario ? "text-ink" : "italic text-ink/40")}>
                  {comentario || "Sem comentário."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
