import { Fragment, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ExternalLink, Hourglass, Inbox, MessageSquareHeart, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Indicador, SeloDelta } from "@/components/ui/Indicador";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { BarraAnimada } from "@/components/ui/BarraAnimada";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct1, nomeCanal, type DeltaInfo } from "@/lib/resultadosSac";
import type { AtendidoNaoResolvido, BacklogFaixa } from "@/services/api";
import type { DbCsatResult } from "@/types/database";

// Blocos da aba Dashboard do Overview (redesenho de 2026-09-24): topo com
// 5 indicadores, "Precisa de atenção" e o cabeçalho padrão das seções.

// Cabeçalho de seção, selo de variação, indicador e barra viraram peças
// oficiais em `components/ui` (2026-10-20); reexportados aqui.
export { SecaoHead, SeloDelta, BarraAnimada };

// Indicador do topo: sem ícone e sempre com o selo ("sem comparação" quando não há período anterior).
export function SaudeKpi(props: { label: string; valor: string; delta?: DeltaInfo; contexto?: string; indice?: number; onClick?: () => void; dica?: string }) {
  return <Indicador {...props} semComparacao />;
}

// Card interno do "Precisa de atenção": fundo destacado + ícone no título.
function BlocoAtencao({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-3 rounded-2xl bg-sand-surface p-4 shadow-card ring-1 ring-sand-line transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-500/10 text-forest-600 dark:text-forest-300">
          <Icone size={16} />
        </span>
        <h3 className="text-[13.5px] font-bold text-ink">{titulo}</h3>
      </div>
      {children}
    </motion.div>
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
  funil: { canal: string; taxa: number | null; total: boolean; resolvidas: number; enviadas: number; respondidas: number; conversas: number }[];
  backlog: BacklogFaixa[];
  filtroAtivo: boolean;
  // Sem callback (colaborador que não é admin): itens não clicáveis.
  onAbrirBacklog?: (faixa: string) => void;
  onAbrirAtendente?: (nome: string) => void;
}) {
  const abertos = atendido.reduce((t, r) => t + r.abertos, 0);
  const parados = atendido.reduce((t, r) => t + r.parados_48h, 0);
  const maxAbertos = Math.max(1, ...atendido.map((r) => r.abertos));
  // "Outros" (conversa sem canal no Crisp) é ruído de dado, não canal: fica fora.
  const canais = funil.filter((f) => !f.total && f.canal !== "Outros");
  const totalFunil = funil.find((f) => f.total);
  const backlogOrdenado = ORDEM_BACKLOG.map((faixa) => backlog.find((b) => b.faixa === faixa) ?? { faixa, total: 0, com_humano: 0 });
  const backlogTotal = backlogOrdenado.reduce((t, b) => t + b.total, 0);
  const backlogHumano = backlogOrdenado.reduce((t, b) => t + (b.com_humano ?? 0), 0);
  const backlogSoBot = backlogTotal - backlogHumano;
  const backlogVelho = backlogOrdenado.find((b) => b.faixa === "+7 dias")?.total ?? 0;
  // null = função antiga no banco, sem a coluna: o bloco some em vez de mostrar 0.
  const aguardandoCliente = backlog.some((b) => b.aguardando_cliente != null)
    ? backlog.reduce((t, b) => t + (b.aguardando_cliente ?? 0), 0)
    : null;
  const aguardandoClienteVelho = backlogOrdenado.find((b) => b.faixa === "+7 dias")?.aguardando_cliente ?? 0;

  return (
    <Card className="border-forest-500/30 bg-forest-500/[0.04] p-5">
      <SecaoHead
        titulo="Precisa de atenção"
        subtitulo={onAbrirAtendente ? "O que está parado agora. Clique num atendente ou numa faixa pra ver as conversas." : "O que está parado agora."}
        ajuda={
          <>
            <p><b>Atendido e não resolvido:</b> conversas do período com resposta humana que continuam abertas, por dono atual. Sem resolução, o cliente não recebe a pesquisa de CSAT. Parado = sem mensagem nova há 48h.</p>
            <p className="mt-2"><b>Funil do CSAT:</b> respondidas ÷ resolvidas, por canal, com as conversas iniciadas no período.</p>
            <p className="mt-2"><b>Backlog:</b> tudo que está aberto agora, pela idade — não depende do período.</p>
            <p className="mt-2"><b>Esperando o cliente:</b> abertas em que a última mensagem (sem contar nota interna e bot) foi de um atendente. Ninguém deve nada ao cliente, só falta resolver na Crisp ou ele responder.</p>
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
                disabled={!onAbrirAtendente}
                onClick={() => onAbrirAtendente?.(r.atendente)}
                className="grid grid-cols-[120px_1fr_auto] items-center gap-2.5 rounded-lg text-left text-[12.5px] transition enabled:hover:bg-sand-subtle disabled:cursor-default"
              >
                <span className="truncate text-ink" title={r.atendente}>{r.atendente.split(" ").slice(0, 2).join(" ")}</span>
                <span className="flex h-2.5 overflow-hidden rounded-full bg-sand-subtle">
                  <BarraAnimada className="bg-rust-500" largura={(r.parados_48h / maxAbertos) * 100} />
                  <BarraAnimada className="bg-forest-500" largura={((r.abertos - r.parados_48h) / maxAbertos) * 100} atraso={0.15} />
                </span>
                <span className="whitespace-nowrap text-right tabular-nums text-ink/50"><b className="text-ink">{fmtNum(r.abertos)}</b> {r.abertos === 1 ? "aberta" : "abertas"}{r.parados_48h > 0 && <span className="text-rust-600 dark:text-rust-400"> · {fmtNum(r.parados_48h)} {r.parados_48h === 1 ? "parada" : "paradas"}</span>}</span>
              </button>
            ))
          )}
        </BlocoAtencao>

        <BlocoAtencao icone={MessageSquareHeart} titulo="Funil do CSAT · taxa de resposta">
          <p className="text-xs text-ink/50">Taxa = avaliadas ÷ resolvidas, por canal.</p>
          {canais.length === 0 ? (
            <p className="text-xs text-ink/50">Sem conversas resolvidas no período.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-x-3 gap-y-1.5 text-[12.5px]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Canal</span>
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Resolv.</span>
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Enviadas</span>
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Avaliadas</span>
              <span className="text-right text-[10.5px] font-semibold uppercase tracking-wide text-ink/40">Taxa</span>
              {canais.map((f) => (
                <Fragment key={f.canal}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-ink">{nomeCanal(f.canal)}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-sand-subtle">
                      <BarraAnimada className="bg-forest-500" largura={f.taxa ?? 0} />
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-ink/70">{fmtNum(f.resolvidas)}</span>
                  <span className="text-right tabular-nums text-ink/70">{fmtNum(f.enviadas)}</span>
                  <span className="text-right tabular-nums text-ink/70">{fmtNum(f.respondidas)}</span>
                  <span className="text-right font-semibold tabular-nums text-ink">{fmtPct1(f.taxa)}</span>
                </Fragment>
              ))}
            </div>
          )}
          {totalFunil && (
            <p className="text-xs text-ink/50">
              Total: {fmtNum(totalFunil.conversas)} conversas → {fmtNum(totalFunil.resolvidas)} resolvidas → {fmtNum(totalFunil.enviadas)} pesquisas enviadas → {fmtNum(totalFunil.respondidas)} avaliadas ({fmtPct1(totalFunil.taxa)}).
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
                disabled={b.total === 0 || !onAbrirBacklog}
                onClick={() => onAbrirBacklog?.(b.faixa)}
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
          {backlogTotal > 0 && (
            <div className="space-y-1.5">
              <span className="flex h-2.5 overflow-hidden rounded-full bg-sand-subtle">
                <BarraAnimada className="bg-forest-500" largura={(backlogHumano / backlogTotal) * 100} />
                <BarraAnimada className="bg-ink/25" largura={(backlogSoBot / backlogTotal) * 100} atraso={0.15} />
              </span>
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[12.5px]">
                <i className="inline-block h-2 w-2 rounded-sm bg-forest-500" />
                <span className="text-ink/70">Teve resposta humana e continua aberta</span>
                <b className="text-right tabular-nums text-ink">{fmtNum(backlogHumano)}</b>
                <i className="inline-block h-2 w-2 rounded-sm bg-ink/25" />
                <span className="text-ink/70">Nunca teve resposta humana, só o bot</span>
                <b className="text-right tabular-nums text-ink">{fmtNum(backlogSoBot)}</b>
              </div>
            </div>
          )}
          {aguardandoCliente != null && backlogTotal > 0 && (
            <div className="rounded-xl bg-sand-subtle px-2.5 py-2 text-[12.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink/70">Esperando o cliente responder</span>
                <b className="tabular-nums text-ink">
                  {fmtNum(aguardandoCliente)} <span className="font-normal text-ink/50">({fmtPct1((aguardandoCliente / backlogTotal) * 100)})</span>
                </b>
              </div>
              <p className="mt-0.5 text-[11px] text-ink/50">
                A última mensagem foi de um atendente
                {aguardandoClienteVelho > 0 && <>; {fmtNum(aguardandoClienteVelho)} com +7 dias, candidatas a resolver na Crisp</>}.
              </p>
            </div>
          )}
          <p className="text-xs text-ink/50">"Atendido e não resolvido" conta só as com resposta humana e iniciadas no período, por isso é menor.</p>
        </BlocoAtencao>
      </div>
    </Card>
  );
}

// ---------- Pop-up das avaliações ruins ----------
type CampoOrdemRuins = "nota" | "data" | "cliente" | "atendente" | "canal" | "comentario";
type SentidoOrdem = "asc" | "desc";

const CAMPOS_ORDEM_RUINS: readonly (readonly [CampoOrdemRuins, string, SentidoOrdem])[] = [
  ["nota", "Nota", "asc"],
  ["data", "Data", "desc"],
  ["cliente", "Cliente", "asc"],
  ["atendente", "Atendente", "asc"],
  ["canal", "Canal", "asc"],
  ["comentario", "Comentário", "desc"],
];

function ordenarRuins(lista: DbCsatResult[], campo: CampoOrdemRuins, sentido: SentidoOrdem): DbCsatResult[] {
  const fator = sentido === "asc" ? 1 : -1;
  const texto = (v: string | null | undefined) => (v ?? "").trim();
  const porData = (a: DbCsatResult, b: DbCsatResult) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime();
  return [...lista].sort((a, b) => {
    let cmp = 0;
    if (campo === "nota") cmp = (a.nota ?? 0) - (b.nota ?? 0);
    else if (campo === "data") cmp = new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
    else if (campo === "comentario") {
      // Sem comentário fica sempre no fim, qualquer que seja o sentido;
      // entre os que têm, ordena pelo tamanho do texto.
      const ta = texto(a.comentario).length;
      const tb = texto(b.comentario).length;
      if ((ta === 0) !== (tb === 0)) return ta === 0 ? 1 : -1;
      cmp = ta - tb;
    } else {
      const va = texto(campo === "cliente" ? a.cliente : campo === "atendente" ? a.atendente : a.canal);
      const vb = texto(campo === "cliente" ? b.cliente : campo === "atendente" ? b.atendente : b.canal);
      // Vazio (sem cliente/atendente/canal) também vai pro fim.
      if ((va === "") !== (vb === "")) return va === "" ? 1 : -1;
      cmp = va.localeCompare(vb, "pt-BR", { sensitivity: "base" });
    }
    return cmp !== 0 ? cmp * fator : porData(a, b);
  });
}

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
  const [campo, setCampo] = useState<CampoOrdemRuins>("nota");
  const [sentido, setSentido] = useState<SentidoOrdem>("asc");
  const lista = useMemo(() => ordenarRuins(avaliacoes ?? [], campo, sentido), [avaliacoes, campo, sentido]);
  const comComentario = lista.filter((r) => (r.comentario ?? "").trim() !== "").length;
  const escolherCampo = (novo: CampoOrdemRuins) => {
    setCampo(novo);
    setSentido(CAMPOS_ORDEM_RUINS.find(([c]) => c === novo)?.[2] ?? "asc");
  };
  return (
    <Dialog onClose={onClose} className="max-w-5xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-ink">Avaliações ruins (nota 1–3)</h3>
          <p className="mt-0.5 text-xs text-ink/50">
            {carregando ? "Carregando..." : `${fmtNum(lista.length)} avaliações · ${fmtNum(comComentario)} com comentário`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="ordem-ruins" className="text-xs text-ink/50">Ordenar por</label>
          <select
            id="ordem-ruins"
            value={campo}
            onChange={(e) => escolherCampo(e.target.value as CampoOrdemRuins)}
            className="h-8 rounded-lg border border-sand-line bg-sand-surface px-2 text-xs text-ink"
          >
            {CAMPOS_ORDEM_RUINS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSentido((s) => (s === "asc" ? "desc" : "asc"))}
            aria-label={sentido === "asc" ? "Ordem crescente" : "Ordem decrescente"}
            title={sentido === "asc" ? "Crescente" : "Decrescente"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line text-ink/70 transition hover:bg-sand-subtle"
          >
            {sentido === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
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
