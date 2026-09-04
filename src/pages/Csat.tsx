import { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ArrowUpDown, Star, FileDown, ArrowUpRight, ArrowDownRight, SlidersHorizontal, Check, X } from "lucide-react";
import { cn, formatDelta, nomesCurtosDisambiguados, classificacaoPorNota } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { HorizontalBarChart, corPorFaixa } from "@/components/ui/BarChart";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchDistinctOperadores, fetchCsatFiltered, fetchCsatForDashboard, fetchAtendenteAliases, fetchDashboardAtendimentoSummary } from "@/services/api";
import type { CsatFilters } from "@/services/api";
import type { DbCsatResult } from "@/types/database";
import { CsatDetalheDialog } from "@/components/CsatDetalheDialog";
import { Dialog } from "@/components/ui/Dialog";
import { exportCsatToCsv } from "@/lib/exportCsv";
import { exportCsatDashboardToPdf } from "@/lib/exportPdf";
import {
  PERIODO_LABELS,
  resolvePeriodo,
  periodoAnterior,
  type PeriodoPreset,
} from "@/lib/dateRanges";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

const PAGE_SIZE = 10;

// Regra oficial de CSAT positivo: (notas 4 e 5) / total de respostas válidas.
// Não usar média das notas normalizada — isso conta nota 3 como "60% positivo",
// o que infla o número. Média das notas é uma métrica separada, mostrada à parte.
function calcularCsat(notas: number[]) {
  const total = notas.length;
  const positivas = notas.filter((n) => n >= 4).length;
  return {
    total,
    positivoPct: total ? (positivas / total) * 100 : null,
    media: total ? notas.reduce((a, b) => a + b, 0) / total : null,
  };
}

const CLASSIFICACAO_OPTIONS = [
  ["", "Todas as classificações"],
  ["Promotor", "Promotor"],
  ["Neutro", "Neutro"],
  ["Detrator", "Detrator"],
] as const;

interface CsatFiltrosState {
  emailAtendente: string;
  topico: string;
  categoriaCliente: string;
  nota: string;
  classificacaoCsat: "" | "Promotor" | "Neutro" | "Detrator";
}

function FiltrosPopover({
  filtros,
  onChange,
  operadores,
  topicos,
}: {
  filtros: CsatFiltrosState;
  onChange: (f: CsatFiltrosState) => void;
  operadores: { email_atendente: string | null; atendente: string }[];
  topicos: (string | null)[];
}) {
  const [aberto, setAberto] = useState(false);
  const ativos = Object.values(filtros).filter(Boolean).length;

  return (
    <div className="relative">
      {aberto && <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />}
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-sand-line bg-sand-surface px-3 text-sm text-ink/70 transition-colors hover:border-sand-line-strong"
      >
        <SlidersHorizontal size={14} className="text-ink/40" />
        Filtros
        {ativos > 0 && <Badge tone="brand" className="h-4 min-w-[16px] justify-center px-1 text-[10px]">{ativos}</Badge>}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-64 space-y-3 rounded-xl border border-sand-line bg-sand-surface p-3 shadow-float">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Colaborador</label>
            <select
              value={filtros.emailAtendente}
              onChange={(e) => onChange({ ...filtros, emailAtendente: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todos os colaboradores</option>
              {operadores.map((o) => (
                <option key={o.email_atendente ?? o.atendente} value={o.email_atendente ?? ""}>{o.atendente}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Categoria</label>
            <select
              value={filtros.topico}
              onChange={(e) => onChange({ ...filtros, topico: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todas as categorias</option>
              {topicos.map((t) => <option key={t} value={t!}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Tipo de cliente</label>
            <select
              value={filtros.categoriaCliente}
              onChange={(e) => onChange({ ...filtros, categoriaCliente: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todos os tipos de cliente</option>
              <option value="Consumidor">Consumidor</option>
              <option value="Produtor">Produtor</option>
              <option value="Não identificado">Não identificado</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Nota</label>
            <select
              value={filtros.nota}
              onChange={(e) => onChange({ ...filtros, nota: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todas as notas</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Classificação</label>
            <div className="space-y-0.5">
              {CLASSIFICACAO_OPTIONS.map(([valor, label]) => (
                <button
                  key={valor}
                  onClick={() => onChange({ ...filtros, classificacaoCsat: valor })}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-sand-subtle",
                    filtros.classificacaoCsat === valor && "bg-forest-50 text-forest-700 dark:bg-forest-500/15 dark:text-forest-300"
                  )}
                >
                  {label}
                  {filtros.classificacaoCsat === valor && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
          {ativos > 0 && (
            <button
              onClick={() => onChange({ emailAtendente: "", topico: "", categoriaCliente: "", nota: "", classificacaoCsat: "" })}
              className="w-full rounded-lg border border-sand-line py-1.5 text-xs text-ink/60 hover:bg-sand-subtle"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Csat() {
  const [aba, setAba] = usePersistedState<"planilha" | "dashboard">("csat:aba", "dashboard");
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("csat:preset", "30dias");
  const [personalizado, setPersonalizado] = usePersistedState("csat:personalizado", { inicio: "", fim: "" });
  const [busca, setBusca] = useState("");
  const [emailAtendente, setEmailAtendente] = usePersistedState("csat:emailAtendente", "");
  const [topico, setTopico] = usePersistedState("csat:topico", "");
  const [categoriaCliente, setCategoriaCliente] = usePersistedState("csat:categoriaCliente", "");
  const [nota, setNota] = usePersistedState("csat:nota", "");
  const [classificacaoCsat, setClassificacaoCsat] = usePersistedState<"" | "Promotor" | "Neutro" | "Detrator">("csat:classificacaoCsat", "");
  const [sortBy, setSortBy] = useState("data_hora");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [detalhe, setDetalhe] = useState<DbCsatResult | null>(null);
  const [atendenteDetalhe, setAtendenteDetalhe] = useState<{ chave: string; nome: string } | null>(null);

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(
    () => periodoAnterior(inicio, fim),
    [inicio, fim]
  );

  const { data: operadores } = useQuery({ queryKey: ["operadores"], queryFn: fetchDistinctOperadores });

  const filtrosBase: Omit<CsatFilters, "page" | "pageSize" | "sortBy" | "sortAsc"> = {
    busca: busca || undefined,
    emailAtendente: emailAtendente || undefined,
    topico: topico || undefined,
    categoriaCliente: categoriaCliente || undefined,
    nota: nota ? Number(nota) : undefined,
    classificacaoCsat: classificacaoCsat || undefined,
    inicio,
    fim,
  };

  const { data: planilha, isLoading: loadingPlanilha } = useQuery({
    queryKey: ["csat-planilha", filtrosBase, sortBy, sortAsc, page],
    queryFn: () =>
      fetchCsatFiltered({ ...filtrosBase, sortBy, sortAsc, page, pageSize: PAGE_SIZE }),
    enabled: aba === "planilha",
  });

  const { data: dashboardRows, isLoading: loadingDashboard } = useQuery({
    queryKey: ["csat-dashboard", filtrosBase],
    queryFn: () => fetchCsatForDashboard(filtrosBase),
    enabled: aba === "dashboard",
  });

  const { data: dashboardAnterior } = useQuery({
    queryKey: ["csat-dashboard-anterior", inicioAnterior, fimAnterior],
    queryFn: () =>
      fetchCsatForDashboard({ inicio: inicioAnterior, fim: fimAnterior }),
    enabled: aba === "dashboard",
  });

  // Denominador da "taxa de resposta da pesquisa": aproximação por
  // conversas resolvidas no período (não temos, hoje, quantas pesquisas
  // foram efetivamente enviadas pelo Crisp — só quem respondeu).
  const { data: resumoAtendimento } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicio, fim],
    queryFn: () => fetchDashboardAtendimentoSummary(inicio, fim),
    enabled: aba === "dashboard",
  });

  function alternarOrdenacao(campo: string) {
    if (sortBy === campo) setSortAsc(!sortAsc);
    else {
      setSortBy(campo);
      setSortAsc(false);
    }
  }

  async function exportar() {
    const todos = await fetchCsatForDashboard(filtrosBase);
    exportCsatToCsv(todos, `csat-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const topicos = Array.from(new Set((planilha?.rows ?? []).map((r) => r.topico).filter(Boolean)));

  const { data: aliases } = useQuery({ queryKey: ["atendente-aliases"], queryFn: fetchAtendenteAliases });
  const aliasMap = useMemo(() => {
    const m = new Map<string, { email: string; nome: string }>();
    (aliases ?? []).forEach((a) => m.set(a.email_variante, { email: a.email_canonico, nome: a.nome_canonico }));
    return m;
  }, [aliases]);

  function normalizarChave(emailAtendente: string | null, atendente: string) {
    const alias = emailAtendente ? aliasMap.get(emailAtendente) : undefined;
    return {
      chave: alias?.email ?? emailAtendente ?? atendente,
      atendente: alias?.nome ?? atendente,
    };
  }

  const porColaborador = useMemo(() => {
    const map = new Map<
      string,
      { atendente: string; notas: number[]; ultima: string; promotores: number; neutros: number; detratores: number }
    >();
    (dashboardRows ?? []).forEach((r) => {
      const { chave, atendente } = normalizarChave(r.email_atendente, r.atendente);
      if (!chave) return;
      const entry =
        map.get(chave) ?? { atendente, notas: [], ultima: r.data_hora, promotores: 0, neutros: 0, detratores: 0 };
      if (r.nota !== null) entry.notas.push(r.nota);
      const classificacao = classificacaoPorNota(r.nota);
      if (classificacao === "Promotor") entry.promotores++;
      else if (classificacao === "Neutro") entry.neutros++;
      else if (classificacao === "Detrator") entry.detratores++;
      if (new Date(r.data_hora) > new Date(entry.ultima)) entry.ultima = r.data_hora;
      map.set(chave, entry);
    });
    return Array.from(map.entries())
      .map(([chave, v]) => {
        const { positivoPct: percentual, media } = calcularCsat(v.notas);

        const notasAnteriores = (dashboardAnterior ?? [])
          .filter((r) => normalizarChave(r.email_atendente, r.atendente).chave === chave && r.nota !== null)
          .map((r) => r.nota as number);
        const { positivoPct: percentualAnterior } = calcularCsat(notasAnteriores);
        const evolucao =
          percentual !== null && percentualAnterior ? ((percentual - percentualAnterior) / percentualAnterior) * 100 : undefined;

        return {
          uid: chave,
          atendente: v.atendente,
          media,
          total: v.notas.length,
          percentual,
          ultima: v.ultima,
          evolucao,
          promotores: v.promotores,
          neutros: v.neutros,
          detratores: v.detratores,
        };
      })
      .sort((a, b) => a.atendente.localeCompare(b.atendente, "pt-BR"));
  }, [dashboardRows, dashboardAnterior, aliasMap]);

  // Mesma ordem usada pelo HorizontalBarChart "CSAT por colaborador" —
  // hoisted pra fora do JSX pra dar pra reaproveitar o índice do clique
  // (onBarClick só devolve label/index, não o registro original).
  const colaboradorPorPercentual = useMemo(
    () => [...porColaborador].sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0)),
    [porColaborador]
  );

  const avaliacoesDoAtendenteDetalhe = useMemo(() => {
    if (!atendenteDetalhe) return [];
    return (dashboardRows ?? [])
      .filter((r) => normalizarChave(r.email_atendente, r.atendente).chave === atendenteDetalhe.chave)
      .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
  }, [dashboardRows, atendenteDetalhe, aliasMap]);

  function rotuloCsat(pct: number | null) {
    if (pct === null) return "—";
    if (pct >= 90) return "Ótimo";
    if (pct >= 75) return "Bom";
    if (pct >= 50) return "Regular";
    return "Ruim";
  }

  function deltaRelativo(atual: number, anterior: number) {
    if (!anterior) return undefined;
    return ((atual - anterior) / anterior) * 100;
  }

  const resumoAtual = useMemo(() => {
    const rows = dashboardRows ?? [];
    const total = rows.length;
    const notas = rows.map((r) => r.nota).filter((n): n is number => n !== null);
    const { positivoPct: csatPercent, media: mediaNotas } = calcularCsat(notas);
    const promotores = rows.filter((r) => classificacaoPorNota(r.nota) === "Promotor").length;
    const neutros = rows.filter((r) => classificacaoPorNota(r.nota) === "Neutro").length;
    const detratores = rows.filter((r) => classificacaoPorNota(r.nota) === "Detrator").length;
    return { total, csatPercent, mediaNotas, promotores, neutros, detratores };
  }, [dashboardRows]);

  const resumoAnterior = useMemo(() => {
    const rows = dashboardAnterior ?? [];
    const total = rows.length;
    const notas = rows.map((r) => r.nota).filter((n): n is number => n !== null);
    const { positivoPct: csatPercent } = calcularCsat(notas);
    const promotores = rows.filter((r) => classificacaoPorNota(r.nota) === "Promotor").length;
    const neutros = rows.filter((r) => classificacaoPorNota(r.nota) === "Neutro").length;
    const detratores = rows.filter((r) => classificacaoPorNota(r.nota) === "Detrator").length;
    return { total, csatPercent, promotores, neutros, detratores };
  }, [dashboardAnterior]);

  // Distribuição por nível de avaliação (1 a 5), não só os 3 buckets de
  // classificacaoPorNota — nota é sempre confiável (inteiro 1-5), então dá
  // pra mostrar cada nível separado sem precisar de RPC nova, já que
  // dashboardRows já traz o período inteiro carregado.
  const NIVEL_POR_NOTA: Record<number, { label: string; cor: string }> = {
    5: { label: "Muito satisfeito", cor: "bg-forest-600" },
    4: { label: "Satisfeito", cor: "bg-forest-300" },
    3: { label: "Neutro", cor: "bg-amber-500" },
    2: { label: "Insatisfeito", cor: "bg-rust-400" },
    1: { label: "Muito insatisfeito", cor: "bg-rust-600" },
  };
  const distribuicaoPorNota = useMemo(() => {
    const rows = dashboardRows ?? [];
    const contagem = new Map<number, number>([[5, 0], [4, 0], [3, 0], [2, 0], [1, 0]]);
    for (const r of rows) {
      if (r.nota !== null && contagem.has(r.nota)) {
        contagem.set(r.nota, (contagem.get(r.nota) ?? 0) + 1);
      }
    }
    return [5, 4, 3, 2, 1].map((nota) => ({
      nota,
      label: NIVEL_POR_NOTA[nota].label,
      cor: NIVEL_POR_NOTA[nota].cor,
      total: contagem.get(nota) ?? 0,
    }));
  }, [dashboardRows]);

  const totalPages = planilha ? Math.ceil(planilha.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">CSAT</h1>
          <p className="mt-1 text-sm text-ink/60">
            Planilha completa e dashboard por colaborador, com filtros e exportação.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={setPreset}
            onChangePersonalizado={setPersonalizado}
          />
          <SegmentedControl
            options={[["dashboard", "Dashboard"], ["planilha", "Planilha"]] as const}
            value={aba}
            onChange={setAba}
          />
          {aba === "planilha" && (
            <Button variant="secondary" size="sm" onClick={exportar}>
              <Download size={14} /> Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {aba === "dashboard" && !loadingDashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="CSAT positivo"
            value={resumoAtual.csatPercent !== null ? `${resumoAtual.csatPercent.toFixed(1)}%` : "—"}
            delta={deltaRelativo(resumoAtual.csatPercent ?? 0, resumoAnterior.csatPercent ?? 0)}
            meta="notas 4 e 5"
          />
          <Kpi
            label="Média das notas"
            value={resumoAtual.mediaNotas !== null ? `${resumoAtual.mediaNotas.toFixed(1)}/5` : "—"}
          />
          <Kpi label="Total de Avaliações" value={String(resumoAtual.total)} delta={deltaRelativo(resumoAtual.total, resumoAnterior.total)} />
          <Kpi
            label="Taxa de resposta"
            value={
              resumoAtendimento?.conversas_resolvidas
                ? `${((resumoAtual.total / resumoAtendimento.conversas_resolvidas) * 100).toFixed(0)}%`
                : "—"
            }
            meta="aprox. vs. resolvidos"
          />
          <Kpi
            label="Promotores"
            value={`${resumoAtual.promotores} / ${resumoAtual.total ? ((resumoAtual.promotores / resumoAtual.total) * 100).toFixed(0) : 0}%`}
            delta={deltaRelativo(resumoAtual.promotores, resumoAnterior.promotores)}
            valueClassName="text-forest-600"
          />
          <Kpi
            label="Neutros"
            value={`${resumoAtual.neutros} / ${resumoAtual.total ? ((resumoAtual.neutros / resumoAtual.total) * 100).toFixed(0) : 0}%`}
            delta={deltaRelativo(resumoAtual.neutros, resumoAnterior.neutros)}
            valueClassName="text-amber-600"
          />
          <Kpi
            label="Detratores"
            value={`${resumoAtual.detratores} / ${resumoAtual.total ? ((resumoAtual.detratores / resumoAtual.total) * 100).toFixed(0) : 0}%`}
            delta={deltaRelativo(resumoAtual.detratores, resumoAnterior.detratores)}
            invertDeltaColor
            valueClassName="text-rust-600"
          />
        </div>
      )}

      {aba === "dashboard" && !loadingDashboard && resumoAtual.total > 0 && (
        <Card className="p-5">
          <h2 className="font-display text-sm font-semibold text-ink">Distribuição por avaliação</h2>
          <p className="mt-1 text-xs text-ink/40">
            Cada um dos 5 níveis da pesquisa (nota 1 a 5) — mais granular que Promotores/Neutros/Detratores acima.
          </p>
          <div className="mt-4">
            <HorizontalBarChart
              data={distribuicaoPorNota.map((d) => ({ label: `${d.label} (${d.nota})`, value: d.total }))}
              getColorClass={(_, i) => distribuicaoPorNota[i ?? 0].cor}
              labelWidth={160}
            />
          </div>
        </Card>
      )}

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar comentário/atendente..."
            className="h-9 rounded-lg border border-sand-line bg-sand-surface pl-8 pr-2 text-sm outline-none focus:border-forest-500"
          />
        </div>
        <FiltrosPopover
          filtros={{ emailAtendente, topico, categoriaCliente, nota, classificacaoCsat }}
          onChange={(f) => {
            setEmailAtendente(f.emailAtendente);
            setTopico(f.topico);
            setCategoriaCliente(f.categoriaCliente);
            setNota(f.nota);
            setClassificacaoCsat(f.classificacaoCsat);
          }}
          operadores={operadores ?? []}
          topicos={topicos}
        />
      </Card>

      {aba === "planilha" ? (
        <>
          {loadingPlanilha ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : !planilha || planilha.rows.length === 0 ? (
            <EmptyState icon={Star} title="Nenhum registro encontrado" description="Ajuste os filtros ou o período selecionado." />
          ) : (
            <>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      {[
                        ["data_hora", "Data"],
                        ["", "Colaborador"],
                        ["", "Cliente"],
                        ["topico", "Categoria"],
                        ["nota", "Nota"],
                        ["classificacao_csat", "Classificação"],
                        ["", "Comentário"],
                      ].map(([field, label]) => (
                        <th
                          key={label}
                          className={"px-4 py-3 font-medium" + (field ? " cursor-pointer select-none" : "")}
                          onClick={() => field && alternarOrdenacao(field)}
                        >
                          <span className="flex items-center gap-1">
                            {label}
                            {field && <ArrowUpDown size={11} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planilha.rows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setDetalhe(r)}
                        className="cursor-pointer border-t border-sand-line transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-sand-surface hover:shadow-card-hover"
                      >
                        <td className="px-4 py-3 text-ink/70">{new Date(r.data_hora).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-ink">{r.atendente}</td>
                        <td className="px-4 py-3 text-ink/70">
                          <p className="text-ink">{r.cliente ?? "—"}</p>
                          <p className="text-xs text-ink/50">{r.email ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-ink/70">{r.topico ?? "—"}</td>
                        <td className="px-4 py-3">{r.nota ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              classificacaoPorNota(r.nota) === "Promotor"
                                ? "success"
                                : classificacaoPorNota(r.nota) === "Detrator"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {classificacaoPorNota(r.nota) ?? "—"}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-ink/70" title={r.comentario ?? undefined}>
                          {r.comentario ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="flex items-center justify-between text-sm text-ink/60">
                <span>{planilha.count} registros</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      ) : loadingDashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : porColaborador.length === 0 ? (
        <EmptyState icon={Star} title="Sem dados no período" description="Ajuste os filtros ou o período selecionado." />
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportCsatDashboardToPdf({
                  periodoLabel: PERIODO_LABELS[preset],
                  totalAvaliacoes: porColaborador.reduce((acc, c) => acc + c.total, 0),
                  porColaborador,
                })
              }
            >
              <FileDown size={14} /> Exportar dashboard em PDF
            </Button>
          </div>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">CSAT por colaborador</h2>
            <HorizontalBarChart
              data={(() => {
                const rotulos = nomesCurtosDisambiguados(colaboradorPorPercentual.map((c) => c.atendente ?? "—"));
                return colaboradorPorPercentual.map((c, i) => ({
                  label: `${rotulos[i]} (${c.total})`,
                  value: c.percentual ?? 0,
                  displayValue: c.percentual !== null
                    ? `${c.percentual.toFixed(0)}% · ${c.media?.toFixed(1) ?? "—"}`
                    : "—",
                }));
              })()}
              getColorClass={corPorFaixa}
              labelWidth={128}
              onBarClick={(_, i) => {
                const c = colaboradorPorPercentual[i];
                if (c) setAtendenteDetalhe({ chave: c.uid, nome: c.atendente });
              }}
            />
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {porColaborador.map((c) => (
            <Card
              key={c.uid}
              className="cursor-pointer p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              onClick={() => setAtendenteDetalhe({ chave: c.uid, nome: c.atendente })}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-50 text-sm font-display font-semibold text-forest-700 dark:bg-forest-500/15 dark:text-forest-300">
                  {c.atendente?.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.atendente}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-sand-line bg-sand-bg/60 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">CSAT positivo</p>
                  <p className="mt-1 flex items-baseline gap-1">
                    <span className="font-display text-lg font-semibold text-ink tabular-nums">
                      {c.percentual !== null ? `${c.percentual.toFixed(1)}%` : "—"}
                    </span>
                    <span className="text-[11px] text-ink/40">/ {rotuloCsat(c.percentual)}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink/40">
                    {c.media !== null ? `${c.media.toFixed(1)}/5 de média` : "sem nota"}
                  </p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-0.5 text-[11px] font-medium",
                      c.evolucao === undefined ? "invisible" : c.evolucao >= 0 ? "text-forest-600" : "text-rust-500"
                    )}
                  >
                    {c.evolucao !== undefined && (c.evolucao >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />)}
                    {formatDelta(c.evolucao) ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-sand-line bg-sand-bg/60 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Níveis</p>
                  <dl className="mt-1.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <dt className="text-ink/50">Promotores</dt>
                      <dd className="font-semibold text-forest-600">
                        {c.promotores} / {c.total ? ((c.promotores / c.total) * 100).toFixed(0) : 0}%
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-ink/50">Neutros</dt>
                      <dd className="font-semibold text-amber-600">
                        {c.neutros} / {c.total ? ((c.neutros / c.total) * 100).toFixed(0) : 0}%
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-ink/50">Detratores</dt>
                      <dd className="font-semibold text-rust-600">
                        {c.detratores} / {c.total ? ((c.detratores / c.total) * 100).toFixed(0) : 0}%
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <CardContent className="mt-2 px-0 pb-0 text-xs text-ink/50">
                <strong className="text-ink">{c.total}</strong> avaliações · Última em {new Date(c.ultima).toLocaleDateString("pt-BR")}
              </CardContent>
            </Card>
          ))}
          </div>
        </>
      )}

      {atendenteDetalhe && (
        <Dialog onClose={() => setAtendenteDetalhe(null)} className="max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{atendenteDetalhe.nome}</h3>
              <p className="text-xs text-ink/50">
                {avaliacoesDoAtendenteDetalhe.length} avaliações no período selecionado — clique numa linha pra ver o
                chamado completo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAtendenteDetalhe(null)}
              className="text-ink/40 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          {avaliacoesDoAtendenteDetalhe.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">Nenhuma avaliação encontrada.</p>
          ) : (
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-sand-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Nota</th>
                    <th className="px-3 py-2 font-medium">Classificação</th>
                    <th className="px-3 py-2 font-medium">Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {avaliacoesDoAtendenteDetalhe.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDetalhe(r)}
                      className="cursor-pointer border-t border-sand-line transition-colors hover:bg-sand-bg/60"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-ink/70">
                        {new Date(r.data_hora).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-ink">{r.cliente ?? "—"}</td>
                      <td className="px-3 py-2">{r.nota ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            classificacaoPorNota(r.nota) === "Promotor"
                              ? "success"
                              : classificacaoPorNota(r.nota) === "Detrator"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {classificacaoPorNota(r.nota) ?? "—"}
                        </Badge>
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-ink/70" title={r.comentario ?? undefined}>
                        {r.comentario ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Dialog>
      )}

      {detalhe && <CsatDetalheDialog registro={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
