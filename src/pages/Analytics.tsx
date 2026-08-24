import { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useQuery } from "@tanstack/react-query";
import {
  Star, MessagesSquare, Timer, CheckCircle2, Trophy, Lock, PhoneCall,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BarChart, corPorFaixa } from "@/components/ui/BarChart";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeCsat } from "@/hooks/useRealtimeCsat";
import {
  fetchAnalyticsSummary,
  fetchAnalyticsEvolucao,
  fetchOperadorRanking,
  fetchDistribuicaoCanal,
  fetchDistribuicaoStatus,
  fetchDistribuicaoTopico,
  fetchDistinctCanais,
  fetchDashboardAtendimentoSummary,
} from "@/services/api";
import { resolvePeriodo, periodoAnterior, type PeriodoPreset } from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

// Valores reais de crisp_conversations.status são "pending"/"resolved".
const statusLabel: Record<string, string> = { resolved: "Resolvido", pending: "Pendente" };

type RankingCampo = "total_chamados" | "tempo_1resposta_medio" | "tempo_encerramento_medio" | "csat_medio";

function corChamados() {
  return "bg-sky-500";
}

function corCsatNota(value: number) {
  return corPorFaixa(value, 4.5, 3.5);
}

function DistribuicaoBar({ data }: { data: { chave: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.chave} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-ink/60" title={d.chave}>{d.chave}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-bg">
            <div className="h-full rounded-full bg-forest-500" style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-ink/50">{d.total}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  useRealtimeCsat();
  const { hasPermission } = usePermissions();
  const { isAdmin } = useAuth();
  const podeVerRanking = isAdmin || hasPermission("analytics");

  const [preset, setPreset] = usePersistedState<PeriodoPreset>("analytics:preset", "30dias");
  const [personalizado, setPersonalizado] = usePersistedState("analytics:personalizado", { inicio: "", fim: "" });
  const [operadorEmail, setOperadorEmail] = usePersistedState("analytics:operadorEmail", "");
  const [canal, setCanal] = usePersistedState("analytics:canal", "");
  const [estado, setEstado] = usePersistedState("analytics:estado", "");
  const [granularidade, setGranularidade] = usePersistedState<"day" | "week" | "month">("analytics:granularidade", "day");
  const [rankingOrdenarPor, setRankingOrdenarPor] = useState<RankingCampo | undefined>(undefined);
  const [rankingDirecao, setRankingDirecao] = useState<"asc" | "desc">("desc");

  function ordenarRankingPorColuna(campo: RankingCampo) {
    if (rankingOrdenarPor === campo) {
      setRankingDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingOrdenarPor(campo);
      setRankingDirecao("desc");
    }
  }

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(() => periodoAnterior(inicio, fim), [inicio, fim]);

  const { data: canaisDisponiveis } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });

  const filtrosAnalytics = { inicio, fim, canal: canal || undefined, categoriaCliente: undefined as string | undefined };
  // A função de resumo aceita equipe/categoria_cliente; aqui usamos só canal (estado é aplicado no ranking/distribuições).
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["analytics-summary", filtrosAnalytics],
    queryFn: () => fetchAnalyticsSummary(filtrosAnalytics),
  });
  const { data: summaryAnterior } = useQuery({
    queryKey: ["analytics-summary", { ...filtrosAnalytics, inicio: inicioAnterior, fim: fimAnterior }],
    queryFn: () => fetchAnalyticsSummary({ inicio: inicioAnterior, fim: fimAnterior, canal: canal || undefined }),
  });

  // "Total de chamados" precisa vir de crisp_conversations (todas as
  // conversas, avaliadas ou não) — csat_results só tem as que receberam
  // avaliação (hoje 5 linhas vs. 167+ conversas), então usar a mesma fonte
  // para os dois KPIs fazia "Total de chamados" e "Total de avaliações"
  // sempre baterem igual, mascarando o descompasso real entre as duas
  // tabelas (ver decisão arquitetural no CLAUDE.md).
  const { data: totalChamados, isLoading: loadingTotalChamados } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicio, fim, canal],
    queryFn: () => fetchDashboardAtendimentoSummary(inicio, fim, canal || undefined),
  });

  const { data: evolucaoCsat, isLoading: loadingEvolucao } = useQuery({
    queryKey: ["analytics-evolucao", filtrosAnalytics, granularidade],
    queryFn: () => fetchAnalyticsEvolucao({ ...filtrosAnalytics, granularidade }),
  });

  const { data: ranking, isLoading: loadingRanking } = useQuery({
    queryKey: ["operador-ranking", inicio, fim, canal, estado],
    queryFn: () => fetchOperadorRanking({ inicio, fim, canal: canal || undefined, estado: estado || undefined }),
    enabled: podeVerRanking,
  });

  const { data: distCanal } = useQuery({
    queryKey: ["distribuicao", "canal", inicio, fim, estado],
    queryFn: () => fetchDistribuicaoCanal(inicio, fim, estado || undefined),
  });
  const { data: distStatus } = useQuery({
    queryKey: ["distribuicao", "status", inicio, fim, canal],
    queryFn: () => fetchDistribuicaoStatus(inicio, fim, canal || undefined),
  });
  const { data: distTopico } = useQuery({
    queryKey: ["distribuicao", "topico", inicio, fim, canal, estado],
    queryFn: () => fetchDistribuicaoTopico(inicio, fim, canal || undefined, estado || undefined),
  });

  const operadoresDisponiveis = useMemo(
    () => (ranking ?? []).map((r) => ({ nome: r.atendente, email: r.email_atendente })),
    [ranking]
  );
  const rankingFiltrado = operadorEmail ? (ranking ?? []).filter((r) => r.email_atendente === operadorEmail) : ranking ?? [];
  const destaque = ranking?.[0];

  const rankingOrdenado = useMemo(() => {
    if (!rankingOrdenarPor) return rankingFiltrado;
    const copia = [...rankingFiltrado];
    copia.sort((a, b) => {
      const av = a[rankingOrdenarPor] ?? -Infinity;
      const bv = b[rankingOrdenarPor] ?? -Infinity;
      return rankingDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [rankingFiltrado, rankingOrdenarPor, rankingDirecao]);

  const serieChamados = (evolucaoCsat ?? []).map((e) => ({ label: e.periodo.slice(5), value: e.total }));
  const serieCsat = (evolucaoCsat ?? []).map((e) => ({
    label: e.periodo.slice(5),
    value: e.media_csat,
    displayValue: e.media_csat.toFixed(1),
  }));

  const totalDelta = summary && summaryAnterior && summaryAnterior.total_avaliacoes
    ? ((summary.total_avaliacoes - summaryAnterior.total_avaliacoes) / summaryAnterior.total_avaliacoes) * 100
    : undefined;

  const statusOptions = Array.from(new Set((distStatus ?? []).map((d) => d.chave)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-ink/60">
            Painel estratégico do SAC — dados reais, calculados no banco.
          </p>
        </div>
        <DateRangePopover
          preset={preset}
          personalizado={personalizado}
          onChangePreset={setPreset}
          onChangePersonalizado={setPersonalizado}
        />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select value={operadorEmail} onChange={(e) => setOperadorEmail(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os operadores</option>
          {operadoresDisponiveis.map((o) => (
            <option key={o.email ?? o.nome} value={o.email ?? ""}>{o.nome}</option>
          ))}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os canais</option>
          {(canaisDisponiveis ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os status</option>
          {statusOptions.map((s) => <option key={s} value={s}>{statusLabel[s] ?? s}</option>)}
        </select>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Indicadores principais</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Total de chamados" value={loadingTotalChamados ? "..." : String(totalChamados?.total_conversas ?? 0)} icon={PhoneCall} />
          <Kpi label="Total de avaliações" value={loadingSummary ? "..." : String(summary?.total_avaliacoes ?? 0)} delta={totalDelta} icon={MessagesSquare} />
          <Kpi label="CSAT (nota média)" value={loadingSummary ? "..." : summary?.media_csat?.toFixed(1) ?? "—"} icon={Star} />
          <Kpi label="CSAT positivo" value={loadingSummary ? "..." : summary?.percentual_satisfacao !== null && summary?.percentual_satisfacao !== undefined ? `${summary.percentual_satisfacao}%` : "—"} icon={CheckCircle2} />
          <Kpi label="Tempo médio 1ª resposta" value={formatDuration(summary?.tempo_1resposta_medio ?? null)} icon={Timer} />
          <Kpi label="Tempo médio de encerramento" value={formatDuration(summary?.tempo_encerramento_medio ?? null)} icon={Timer} />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          "Total de chamados" conta todas as conversas do período (avaliadas ou não); "Total de avaliações" conta
          só as que receberam uma nota de CSAT — por isso os dois números normalmente são diferentes.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">Evolução de chamados e CSAT</h2>
          <SegmentedControl
            options={[["day", "Diária"], ["week", "Semanal"], ["month", "Mensal"]] as const}
            value={granularidade}
            onChange={setGranularidade}
          />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-ink/50">Chamados</p>
            {loadingEvolucao ? <p className="text-sm text-ink/50">Carregando...</p> : serieChamados.length === 0 ? <p className="text-sm text-ink/50">Sem dados.</p> : <BarChart data={serieChamados} getColorClass={corChamados} height={128} />}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink/50">CSAT médio</p>
            {loadingEvolucao ? <p className="text-sm text-ink/50">Carregando...</p> : serieCsat.length === 0 ? <p className="text-sm text-ink/50">Sem dados.</p> : <BarChart data={serieCsat} getColorClass={corCsatNota} height={128} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="p-5 pb-0"><h2 className="font-display text-sm font-semibold text-ink">Por canal</h2></div>
          <div className="p-5">{distCanal && distCanal.length > 0 ? <DistribuicaoBar data={distCanal} /> : <p className="text-sm text-ink/50">Sem dados.</p>}</div>
        </Card>
        <Card>
          <div className="p-5 pb-0"><h2 className="font-display text-sm font-semibold text-ink">Por status</h2></div>
          <div className="p-5">
            {distStatus && distStatus.length > 0 ? (
              <DistribuicaoBar data={distStatus.map((d) => ({ ...d, chave: statusLabel[d.chave] ?? d.chave }))} />
            ) : <p className="text-sm text-ink/50">Sem dados.</p>}
          </div>
        </Card>
        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">Por tópico</h2>
            <p className="text-xs text-ink/40">Top 8 (tópico é texto livre, agrupado por frequência)</p>
          </div>
          <div className="p-5">{distTopico && distTopico.length > 0 ? <DistribuicaoBar data={distTopico} /> : <p className="text-sm text-ink/50">Sem dados.</p>}</div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Ranking de operadores</h2>
        {!podeVerRanking ? (
          <Card className="flex items-center gap-3 p-5">
            <Lock size={16} className="text-ink/40" />
            <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver o ranking nominal do time.</p>
          </Card>
        ) : loadingRanking ? (
          <p className="text-sm text-ink/50">Carregando...</p>
        ) : rankingFiltrado.length === 0 ? (
          <p className="text-sm text-ink/50">Sem avaliações suficientes neste período/filtro.</p>
        ) : (
          <>
            {destaque && (
              <Card className="mb-4 flex items-center gap-3 border-amber-400/40 bg-amber-500/5 p-4">
                <Trophy size={20} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-ink">Operador destaque: {destaque.atendente}</p>
                  <p className="text-xs text-ink/50">CSAT médio {destaque.csat_medio?.toFixed(1) ?? "—"} · {destaque.total_chamados} chamados</p>
                </div>
              </Card>
            )}
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Operador</th>
                    <SortableHeader field="total_chamados" label="Chamados" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="tempo_1resposta_medio" label="1ª resposta" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="tempo_encerramento_medio" label="Encerramento" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="csat_medio" label="CSAT (0–5)" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((r) => (
                    <tr key={r.email_atendente ?? r.atendente} className="border-t border-sand-line">
                      <td className="px-4 py-3"><Badge tone={r.posicao === 1 ? "brand" : "neutral"}>#{r.posicao}</Badge></td>
                      <td className="px-4 py-3 font-medium text-ink">{r.atendente}{!r.user_id && <span className="ml-1 text-xs text-ink/40">(sem conta no Hub)</span>}</td>
                      <td className="px-4 py-3 text-ink/70">{r.total_chamados}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration(r.tempo_1resposta_medio)}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration(r.tempo_encerramento_medio)}</td>
                      <td className="px-4 py-3">{r.csat_medio?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
