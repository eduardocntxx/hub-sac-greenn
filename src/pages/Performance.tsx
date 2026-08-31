import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, AlertTriangle, PhoneCall, Search, ExternalLink, Info, X, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { AtendimentoDetalheDialog } from "@/components/AtendimentoDetalheDialog";
import { BarChart, HorizontalBarChart } from "@/components/ui/BarChart";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  fetchAtendentePerformance,
  fetchDistinctCanais,
  fetchAtendimentosComMetricas,
  fetchDistinctTiposCliente,
  fetchDistinctAtendentesConversas,
  fetchTfrTtrPercentis,
  fetchBacklogPorIdade,
  fetchBacklogCasos,
  fetchRelogioPosse,
  fetchRelogioEsperaCliente,
  fetchHorasExpedientePeriodo,
  fetchMotivoContatoResumo,
  fetchMetricasPorTipoCliente,
  fetchCsatDistribuicao,
  fetchTempoRespostaBot,
  fetchContagemPeriodo,
  fetchReaberturaResumo,
  fetchReaberturaCasos,
  fetchTransferenciasResumo,
  fetchTransferenciasCasos,
  fetchFcrRecontatoResumo,
  fetchRecontatoCasos,
  type ModoTempo,
  type AtendimentoComMetricas,
} from "@/services/api";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import { formatDurationFromMinutes as formatMin } from "@/lib/formatDuration";
import { cn, nomesCurtosDisambiguados } from "@/lib/utils";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

// Valores reais de crisp_conversations.status são "pending"/"resolved" (só
// esses dois — conferido no banco); "unresolved" nunca existiu como valor
// de verdade, era um bug: o badge de pendente caía no fallback neutro/texto
// cru "pending" em vez de "Pendente" âmbar.
const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  resolved: "success",
  pending: "warning",
};
const statusLabel: Record<string, string> = { resolved: "Resolvido", pending: "Pendente" };

const PAGE_SIZE = 15;

type OrdenarCampo = "tempo_aberto" | "tfr" | "tempo_resolucao";
const DIRECAO_PADRAO: Record<OrdenarCampo, "asc" | "desc"> = {
  tempo_aberto: "desc",
  tfr: "desc",
  tempo_resolucao: "desc",
};

// Mesma linha do CSAT: verde (bom) / amarelo (médio) / vermelho (ruim).
function corTextoCsat(nota: number | null | undefined) {
  if (nota === null || nota === undefined) return "text-ink/70";
  if (nota >= 4.5) return "text-forest-600";
  if (nota >= 3.5) return "text-amber-600";
  return "text-rust-500";
}

function corTextoSla(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "text-ink/70";
  if (pct >= 80) return "text-forest-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rust-500";
}

function corBacklogFaixa(faixa: string) {
  if (faixa === "0-1 dia") return "text-forest-600";
  if (faixa === "2-3 dias") return "text-amber-600";
  return "text-rust-500";
}

function corBacklogBarra(faixa: string) {
  if (faixa === "0-1 dia") return "bg-forest-500";
  if (faixa === "2-3 dias") return "bg-amber-500";
  if (faixa === "4-7 dias") return "bg-rust-400";
  return "bg-rust-600";
}

const CORES_VIVAS = [
  "bg-sky-500",
  "bg-rust-500",
  "bg-forest-500",
  "bg-violet-600",
  "bg-amber-600",
  "bg-sky-700",
  "bg-rust-700",
  "bg-forest-700",
];

type RankingCampo = "total_atendimentos" | "tfr_medio" | "tempo_resolucao_medio" | "csat_medio" | "total_avaliacoes";
type MotivoCampo = "chamados" | "tfr_media_seg" | "ttr_media_seg";

export default function Performance() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  const podeVer = isAdmin;

  const [aba, setAba] = usePersistedState<"ranking" | "atendimentos">("overview:aba", "ranking");
  const [modoTempo, setModoTempo] = usePersistedState<ModoTempo>("overview:modoTempo", "uteis");
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("overview:preset", "30dias");
  const [personalizado, setPersonalizado] = usePersistedState("overview:personalizado", { inicio: "", fim: "" });
  // Filtro de canal é exclusivo da aba Atendimentos (lista de chamados) — a
  // aba Dashboard mostra sempre o agregado de todos os canais, sem seletor
  // próprio, pra não confundir com um segundo filtro escondido.
  const [canal, setCanal] = usePersistedState("overview:canal", "");

  const [busca, setBusca] = useState("");
  const [tipoCliente, setTipoCliente] = usePersistedState("overview:tipoCliente", "");
  const [motivo, setMotivo] = usePersistedState("overview:motivo", "");
  const [atendenteNomes, setAtendenteNomes] = usePersistedState<string[]>("overview:atendenteNomes", []);
  const [page, setPage] = useState(0);
  const [ordenarPor, setOrdenarPor] = useState<OrdenarCampo | undefined>(undefined);
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");
  const [posseDetalhe, setPosseDetalhe] = useState<string | null>(null);
  const [posseDetalheOrdenarPor, setPosseDetalheOrdenarPor] = useState<OrdenarCampo | undefined>(undefined);
  const [posseDetalheDirecao, setPosseDetalheDirecao] = useState<"asc" | "desc">("desc");
  const [backlogFaixaAberta, setBacklogFaixaAberta] = useState<string | null>(null);
  const [backlogPage, setBacklogPage] = useState(0);
  const [backlogDirecao, setBacklogDirecao] = useState<"asc" | "desc">("asc");
  const [filtroAberto, setFiltroAberto] = useState(false);
  // Filtra o Dashboard inteiro (mesmo tratamento do filtro de Atendente) —
  // "" = sem filtro, mostra todos os segmentos que existirem de verdade no
  // período. CSAT e Relógio de trabalho ativo ficam de fora de propósito
  // (ver notas nos respectivos cards).
  const [tipoClienteFiltro, setTipoClienteFiltro] = usePersistedState("overview:tipoClienteFiltro", "");
  const [detalhe, setDetalhe] = useState<AtendimentoComMetricas | null>(null);
  const [explicacaoVelocidadeAberta, setExplicacaoVelocidadeAberta] = useState(false);
  const [mostrarTodosMotivos, setMostrarTodosMotivos] = useState(false);
  const [motivoDestaque, setMotivoDestaque] = useState("");
  const [motivoOrdenarPor, setMotivoOrdenarPor] = useState<MotivoCampo | undefined>(undefined);
  const [motivoDirecao, setMotivoDirecao] = useState<"asc" | "desc">("desc");
  const [mostrarTodasReaberturas, setMostrarTodasReaberturas] = useState(false);
  const [reaberturaFiltroAtendente, setReaberturaFiltroAtendente] = useState("");
  const [reaberturaFiltroReaberto, setReaberturaFiltroReaberto] = useState("");
  const [mostrarTodasTransferencias, setMostrarTodasTransferencias] = useState(false);
  const [mostrarTodosRecontatos, setMostrarTodosRecontatos] = useState(false);

  function ordenarPorColuna(campo: OrdenarCampo) {
    if (ordenarPor === campo) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(campo);
      setDirecao(DIRECAO_PADRAO[campo]);
    }
    setPage(0);
  }

  function ordenarPosseDetalhePorColuna(campo: OrdenarCampo) {
    if (posseDetalheOrdenarPor === campo) {
      setPosseDetalheDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPosseDetalheOrdenarPor(campo);
      setPosseDetalheDirecao(DIRECAO_PADRAO[campo]);
    }
  }

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });
  const { data: tiposCliente } = useQuery({ queryKey: ["tipos-cliente"], queryFn: fetchDistinctTiposCliente });
  const { data: atendentes } = useQuery({ queryKey: ["atendentes-conversas"], queryFn: fetchDistinctAtendentesConversas });

  const atendenteNomesFiltro = atendenteNomes.length > 0 ? atendenteNomes : undefined;
  // "" quando "Todos os tipos de cliente" está selecionado — vira undefined
  // pra não mandar string vazia pro RPC (chamado_tem_tipo_cliente espera
  // null quando não há filtro, não "").
  const tipoClienteRpc = tipoClienteFiltro || undefined;

  const { data: percentis, isLoading: loadingPercentis } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchTfrTtrPercentis(inicio, fim, undefined, atendenteNomesFiltro, modoTempo, tipoClienteRpc),
  });

  const { data: backlog, isLoading: loadingBacklog } = useQuery({
    queryKey: ["backlog-por-idade", atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchBacklogPorIdade(undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: posse, isLoading: loadingPosse } = useQuery({
    queryKey: ["relogio-posse", inicio, fim, tipoClienteFiltro],
    queryFn: () => fetchRelogioPosse(inicio, fim, undefined, tipoClienteRpc),
  });

  const { data: esperaCliente, isLoading: loadingEspera } = useQuery({
    queryKey: ["relogio-espera-cliente", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchRelogioEsperaCliente(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: horasExpediente, isLoading: loadingExpediente } = useQuery({
    queryKey: ["horas-expediente-periodo", inicio, fim, atendenteNomes],
    queryFn: () => fetchHorasExpedientePeriodo(inicio, fim, atendenteNomesFiltro),
  });

  const { data: motivos, isLoading: loadingMotivos } = useQuery({
    queryKey: ["motivo-contato-resumo", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchMotivoContatoResumo(inicio, fim, undefined, modoTempo, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: metricasTipoCliente, isLoading: loadingTipoCliente } = useQuery({
    queryKey: ["metricas-tipo-cliente", inicio, fim, modoTempo, atendenteNomes],
    queryFn: () => fetchMetricasPorTipoCliente(inicio, fim, undefined, modoTempo, atendenteNomesFiltro),
  });

  const { data: csatDist } = useQuery({
    queryKey: ["csat-distribuicao", inicio, fim, atendenteNomes],
    queryFn: () => fetchCsatDistribuicao(inicio, fim, undefined, atendenteNomesFiltro),
  });

  const { data: contagem } = useQuery({
    queryKey: ["contagem-periodo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchContagemPeriodo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: tempoRespostaBot } = useQuery({
    queryKey: ["tempo-resposta-bot", inicio, fim],
    queryFn: () => fetchTempoRespostaBot(inicio, fim),
  });

  const { data: reaberturaResumo, isLoading: loadingReabertura } = useQuery({
    queryKey: ["reabertura-resumo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchReaberturaResumo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: reaberturaCasos } = useQuery({
    queryKey: ["reabertura-casos", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchReaberturaCasos(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: !!reaberturaResumo && reaberturaResumo.total_reabertos > 0,
  });

  const { data: transferenciasResumo, isLoading: loadingTransferencias } = useQuery({
    queryKey: ["transferencias-resumo", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchTransferenciasResumo(inicio, fim, undefined, atendenteNomesFiltro, modoTempo, tipoClienteRpc),
  });

  const { data: transferenciasCasos } = useQuery({
    queryKey: ["transferencias-casos", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchTransferenciasCasos(inicio, fim, undefined, modoTempo, atendenteNomesFiltro, tipoClienteRpc),
    enabled: !!transferenciasResumo && transferenciasResumo.total_transferidos > 0,
  });

  const { data: fcrRecontato, isLoading: loadingFcr } = useQuery({
    queryKey: ["fcr-recontato-resumo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchFcrRecontatoResumo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: recontatoCasos } = useQuery({
    queryKey: ["recontato-casos", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchRecontatoCasos(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: !!fcrRecontato && fcrRecontato.total_recontato > 0,
  });

  const { data: posseDetalheAtendimentos, isLoading: loadingPosseDetalhe } = useQuery({
    queryKey: ["atendimentos-por-atendente", inicio, fim, posseDetalhe, modoTempo, posseDetalheOrdenarPor, posseDetalheDirecao],
    queryFn: () => fetchAtendimentosComMetricas({
      inicio, fim, atendenteNomes: posseDetalhe ? [posseDetalhe] : undefined, page: 0, pageSize: 50, modoTempo,
      ordenarPor: posseDetalheOrdenarPor, direcao: posseDetalheDirecao,
    }),
    enabled: !!posseDetalhe,
  });

  const { data: backlogCasos, isLoading: loadingBacklogCasos } = useQuery({
    queryKey: ["backlog-casos", backlogFaixaAberta, backlogPage, backlogDirecao, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchBacklogCasos(backlogFaixaAberta!, undefined, atendenteNomesFiltro, backlogPage, PAGE_SIZE, backlogDirecao, tipoClienteRpc),
    enabled: !!backlogFaixaAberta,
  });

  function ordenarBacklogPorInicio() {
    setBacklogDirecao((d) => (d === "asc" ? "desc" : "asc"));
    setBacklogPage(0);
  }

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["atendente-performance", inicio, fim, modoTempo, tipoClienteFiltro],
    queryFn: () => fetchAtendentePerformance(inicio, fim, undefined, undefined, modoTempo, tipoClienteRpc),
    enabled: podeVer && aba === "ranking",
  });

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

  function ordenarMotivoPorColuna(campo: MotivoCampo) {
    if (motivoOrdenarPor === campo) {
      setMotivoDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setMotivoOrdenarPor(campo);
      setMotivoDirecao("desc");
    }
  }

  const iaEntry = useMemo(() => ranking?.find((r) => r.operator_nome === "IA Greenn"), [ranking]);
  // Ranking/posse já vêm um-registro-por-atendente — filtrar no cliente por
  // atendenteNomes evita reescrever atendente_performance/relogio_posse_periodo
  // só pra isso (ver CLAUDE.md).
  const rankingHumano = useMemo(
    () => ranking?.filter((r) => r.operator_nome !== "IA Greenn" && (atendenteNomes.length === 0 || atendenteNomes.includes(r.operator_nome))),
    [ranking, atendenteNomes]
  );

  const rankingOrdenado = useMemo(() => {
    if (!rankingHumano || !rankingOrdenarPor) return rankingHumano;
    const copia = [...rankingHumano];
    copia.sort((a, b) => {
      const av = a[rankingOrdenarPor] ?? -Infinity;
      const bv = b[rankingOrdenarPor] ?? -Infinity;
      return rankingDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [rankingHumano, rankingOrdenarPor, rankingDirecao]);

  const posseMap = useMemo(() => {
    const mapa = new Map<string, { minutos_posse: number; conversas: number }>();
    (posse ?? []).forEach((p) => mapa.set(p.atendente, p));
    return mapa;
  }, [posse]);

  const posseFiltrada = useMemo(
    () => (posse ?? []).filter((p) => atendenteNomes.length === 0 || atendenteNomes.includes(p.atendente)),
    [posse, atendenteNomes]
  );

  // Produtividade contextualizada na própria tabela de Ranking (não como
  // número isolado) — reaberturas/transferências por atendente, derivadas
  // dos casos já buscados pra Reabertura/Transferências.
  const reaberturaPorAtendenteMap = useMemo(() => {
    const mapa = new Map<string, number>();
    (reaberturaCasos ?? []).filter((c) => c.atendente !== "IA Greenn").forEach((c) => {
      const nome = c.atendente ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return mapa;
  }, [reaberturaCasos]);

  const transferenciasOrigemMap = useMemo(() => {
    const mapa = new Map<string, number>();
    (transferenciasCasos ?? []).forEach((c) => {
      const nome = c.origem ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return mapa;
  }, [transferenciasCasos]);


  const iaPosse = posseMap.get("IA Greenn");

  const reaberturaPorMotivo = useMemo(() => {
    const mapa = new Map<string, number>();
    (reaberturaCasos ?? []).forEach((c) => mapa.set(c.topico, (mapa.get(c.topico) ?? 0) + 1));
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [reaberturaCasos]);

  const reaberturaPorAtendente = useMemo(() => {
    const mapa = new Map<string, number>();
    (reaberturaCasos ?? []).filter((c) => c.atendente !== "IA Greenn").forEach((c) => {
      const nome = c.atendente ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [reaberturaCasos]);

  // Filtros locais da tabela de casos (não afetam os cards/gráficos acima,
  // que continuam refletindo o resumo do período inteiro) — opções vêm do
  // próprio dado, não é lista fixa.
  const reaberturaAtendentesDisponiveis = useMemo(
    () => Array.from(new Set((reaberturaCasos ?? []).map((c) => c.atendente).filter((a): a is string => !!a))).sort(),
    [reaberturaCasos]
  );
  const reaberturaReabertosDisponiveis = useMemo(
    () => Array.from(new Set((reaberturaCasos ?? []).map((c) => c.reopened_count))).sort((a, b) => a - b),
    [reaberturaCasos]
  );
  const reaberturaCasosFiltrados = useMemo(
    () =>
      (reaberturaCasos ?? []).filter(
        (c) =>
          (!reaberturaFiltroAtendente || c.atendente === reaberturaFiltroAtendente) &&
          (!reaberturaFiltroReaberto || String(c.reopened_count) === reaberturaFiltroReaberto)
      ),
    [reaberturaCasos, reaberturaFiltroAtendente, reaberturaFiltroReaberto]
  );

  const motivosFiltrados = useMemo(
    () => (motivos ?? []).filter((m) => !motivoDestaque || m.topico === motivoDestaque),
    [motivos, motivoDestaque]
  );
  const motivosOrdenados = useMemo(() => {
    if (!motivoOrdenarPor) return motivosFiltrados;
    const copia = [...motivosFiltrados];
    copia.sort((a, b) => {
      const av = a[motivoOrdenarPor] ?? -Infinity;
      const bv = b[motivoOrdenarPor] ?? -Infinity;
      return motivoDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [motivosFiltrados, motivoOrdenarPor, motivoDirecao]);

  const transferenciasPorOrigem = useMemo(() => {
    const mapa = new Map<string, number>();
    (transferenciasCasos ?? []).forEach((c) => {
      const nome = c.origem ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [transferenciasCasos]);

  const transferenciasPorDestino = useMemo(() => {
    const mapa = new Map<string, number>();
    (transferenciasCasos ?? []).forEach((c) => {
      const nome = c.destino ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [transferenciasCasos]);

  const recontatoPorMotivo = useMemo(() => {
    const mapa = new Map<string, number>();
    (recontatoCasos ?? []).forEach((c) => {
      const nome = c.topico ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    });
    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [recontatoCasos]);

  const filtrosAtendimentos = useMemo(
    () => ({
      inicio, fim,
      busca: busca || undefined,
      tipoCliente: tipoCliente || undefined,
      canal: canal || undefined,
      atendenteNomes: atendenteNomes.length > 0 ? atendenteNomes : undefined,
      motivo: motivo || undefined,
      ordenarPor,
      direcao,
      modoTempo,
    }),
    [inicio, fim, busca, tipoCliente, canal, atendenteNomes, motivo, ordenarPor, direcao, modoTempo]
  );

  const { data: atendimentos, isLoading: loadingAtendimentos } = useQuery({
    queryKey: ["atendimentos-metricas", filtrosAtendimentos, page],
    queryFn: () => fetchAtendimentosComMetricas({ ...filtrosAtendimentos, page, pageSize: PAGE_SIZE }),
    enabled: podeVer && aba === "atendimentos",
  });

  if (!podeVer) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <Lock size={16} className="text-ink/40" />
        <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver o Overview do time.</p>
      </Card>
    );
  }

  const totalPages = atendimentos ? Math.ceil(atendimentos.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Overview</h1>
          <p className="mt-1 text-sm text-ink/60">
            {aba === "ranking"
              ? "Ranking de atendentes com base nas conversas do Crisp."
              : "Lista completa de conversas vindas do Crisp — 1ª resposta considera apenas atendente humano (bot da Crisp é ignorado)."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={(v) => { setPreset(v); setPage(0); }}
            onChangePersonalizado={setPersonalizado}
          />
          <div className="relative">
            {filtroAberto && <div className="fixed inset-0 z-10" onClick={() => setFiltroAberto(false)} />}
            <button
              onClick={() => setFiltroAberto((a) => !a)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors",
                modoTempo === "corridas" || tipoClienteFiltro || atendenteNomes.length > 0 || (aba === "atendimentos" && (canal || tipoCliente || motivo))
                  ? "border-forest-300 bg-forest-50 text-forest-700"
                  : "border-sand-line bg-white text-ink/60 hover:border-sand-line-strong"
              )}
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
            {filtroAberto && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-72 space-y-3 overflow-hidden rounded-xl border border-sand-line bg-white p-3 shadow-float">
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40">Tempo</p>
                  <SegmentedControl
                    className="w-full"
                    options={[["uteis", "Horas úteis"], ["corridas", "Horas corridas"]] as const}
                    value={modoTempo}
                    onChange={setModoTempo}
                  />
                  <p className="mt-1.5 text-[11px] text-ink/40">
                    {modoTempo === "uteis"
                      ? "Desconta fora do expediente cadastrado do time."
                      : "Tempo de relógio cru, sem desconto."}
                  </p>
                </div>
                <div className="space-y-2 border-t border-sand-line pt-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                        Atendentes{atendenteNomes.length > 0 ? ` (${atendenteNomes.length})` : ""}
                      </p>
                      {atendenteNomes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setAtendenteNomes([]); setPage(0); }}
                          className="mb-1.5 text-[11px] text-forest-600 hover:underline"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-sand-line p-2">
                      {(atendentes ?? []).length === 0 && (
                        <p className="px-1 py-0.5 text-xs text-ink/40">Nenhum atendente no período.</p>
                      )}
                      {(atendentes ?? []).map((a) => (
                        <label key={a.nome} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-sand-bg">
                          <input
                            type="checkbox"
                            checked={atendenteNomes.includes(a.nome)}
                            onChange={(e) => {
                              setAtendenteNomes((prev) =>
                                e.target.checked ? [...prev, a.nome] : prev.filter((n) => n !== a.nome)
                              );
                              setPage(0);
                            }}
                            className="h-3.5 w-3.5 rounded border-sand-line-strong text-forest-600 focus:ring-forest-500"
                          />
                          <span className="truncate">{a.nome}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {aba === "ranking" && (
                    <p className="text-[11px] text-ink/40">Filtra o Dashboard inteiro (Ranking, Velocidade, Backlog, Posse, Reabertura, Transferências, FCR/Recontato, Por tipo de cliente).</p>
                  )}
                </div>
                {aba === "ranking" ? (
                  <div className="border-t border-sand-line pt-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40">Tipo de cliente</p>
                    <select
                      value={tipoClienteFiltro}
                      onChange={(e) => setTipoClienteFiltro(e.target.value)}
                      className="h-9 w-full rounded-lg border border-sand-line bg-white px-2 text-sm"
                    >
                      <option value="">Todos</option>
                      {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
                    </select>
                    <p className="mt-1.5 text-[11px] text-ink/40">
                      Filtra o Dashboard inteiro (Ranking, Velocidade, Backlog, Posse, Reabertura, Transferências,
                      FCR/Recontato, Por tipo de cliente) — exceto CSAT e Relógio de trabalho ativo.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 border-t border-sand-line pt-3">
                    <select value={canal} onChange={(e) => { setCanal(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-sand-line bg-white px-2 text-sm">
                      <option value="">Todos os canais</option>
                      {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-sand-line bg-white px-2 text-sm">
                      <option value="">Todos os tipos de cliente</option>
                      {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
                    </select>
                    <div className="relative">
                      <input
                        value={motivo}
                        onChange={(e) => { setMotivo(e.target.value); setPage(0); }}
                        list="motivos-sugeridos"
                        placeholder="Filtrar por motivo/tópico..."
                        className="h-9 w-full rounded-lg border border-sand-line bg-white px-2 text-sm outline-none focus:border-forest-500"
                      />
                      <datalist id="motivos-sugeridos">
                        {Array.from(new Set((motivos ?? []).map((m) => m.topico))).sort().map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <SegmentedControl
            options={[["ranking", "Dashboard"], ["atendimentos", "Atendimentos"]] as const}
            value={aba}
            onChange={setAba}
          />
        </div>
      </div>

      {aba === "ranking" ? (
        <>
          {contagem && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-sky-400/30 bg-sky-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de chamados</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-sky-700">{contagem.total_chamados}</p>
              </Card>
              <Card className="border-violet-400/30 bg-violet-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de mensagens</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-violet-700">{contagem.total_mensagens}</p>
              </Card>
            </div>
          )}

          {csatDist && csatDist.total > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              {tipoClienteFiltro && (
                <p
                  className="text-[11px] text-ink/40 sm:col-span-3"
                  title="CSAT é reconciliado por e-mail do atendente, numa tabela separada (csat_results) que não tem a mesma coluna de tipo de cliente do Crisp — não dá pra aplicar esse filtro aqui sem inventar um vínculo que não existe."
                >
                  CSAT não respeita o filtro de tipo de cliente — mostra o time inteiro (motivo no hover).
                </p>
              )}
              <Card className="border-forest-400/30 bg-forest-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações boas (4–5)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-forest-600">{csatDist.boas}</p>
              </Card>
              <Card className="border-amber-400/30 bg-amber-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações neutras (3)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-amber-600">{csatDist.neutras}</p>
              </Card>
              <Card className="border-rust-400/30 bg-rust-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Avaliações ruins (1–2)</p>
                <p className="mt-1 font-display text-kpi-lg font-bold text-rust-600">{csatDist.ruins}</p>
              </Card>
              <Card className="p-4 sm:col-span-3">
                <BarChart
                  data={[
                    { label: "Boas (4–5)", value: csatDist.boas },
                    { label: "Neutras (3)", value: csatDist.neutras },
                    { label: "Ruins (1–2)", value: csatDist.ruins },
                  ]}
                  getColorClass={(_, i) => ["bg-forest-500", "bg-amber-500", "bg-rust-500"][i ?? 0]}
                  height={110}
                />
              </Card>
            </div>
          )}

          {iaEntry && (
            <div>
              <h2 className="mb-3 font-display text-sm font-semibold text-ink">Bot (IA Greenn)</h2>
              <Card
                onClick={() => setPosseDetalhe("IA Greenn")}
                className="flex cursor-pointer flex-wrap items-center gap-6 border-sky-400/30 bg-sky-500/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendimentos</p>
                  <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{iaEntry.total_atendimentos}</p>
                </div>
                {tempoRespostaBot && tempoRespostaBot.amostras > 0 && (
                  <div>
                    <p
                      className="text-xs font-medium uppercase tracking-wide text-ink/40"
                      title="Mediana, não média — poucas conversas retomadas dias depois (reabertura, ou o início registrado não sendo exatamente quando o cliente mandou a mensagem que o bot respondeu) distorceriam muito uma média simples"
                    >
                      Tempo até 1ª resposta (típico)
                    </p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{formatDuration(tempoRespostaBot.tempo_medio_seg)}</p>
                    <p className="mt-1 text-[11px] text-ink/40">{tempoRespostaBot.amostras} amostras</p>
                  </div>
                )}
                {iaEntry.csat_medio !== null && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">CSAT médio</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoCsat(iaEntry.csat_medio))}>{iaEntry.csat_medio.toFixed(1)}</p>
                  </div>
                )}
                {iaPosse && (
                  <div>
                    <p
                      className="text-xs font-medium uppercase tracking-wide text-ink/40"
                      title="Conta diferente de 'Atendimentos': inclui qualquer chamado em que o bot segurou a conversa em algum momento, mesmo que um humano tenha assumido depois — por isso os dois números não precisam bater"
                    >
                      Chamados c/ posse
                    </p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{iaPosse.conversas}</p>
                  </div>
                )}
              </Card>
              <p className="mt-2 text-xs text-ink/40">
                Separado do ranking humano — TFR e tempo de resolução não fazem sentido pro bot (ele não "responde
                como humano" nem "resolve" no sentido usado ali). "Atendimentos" conta chamados onde o bot é o
                atendente registrado agora; "Chamados c/ posse" conta todo chamado que passou pelo bot em algum
                momento, mesmo repassado depois — por isso os números podem divergir (não é erro).
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-ink">Ranking de atendentes</h2>
            <button
              type="button"
              onClick={() => setExplicacaoVelocidadeAberta(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
            >
              <Info size={13} /> ver mais
            </button>
          </div>
          {isLoading ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : !ranking || ranking.length === 0 ? (
            <p className="text-sm text-ink/50">Sem atendimentos neste período/filtro.</p>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Atendente</th>
                    <SortableHeader align="center" field="total_atendimentos" label="Total de atendimentos" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="tfr_medio" label="TFR médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="tempo_resolucao_medio" label="Tempo médio de resolução" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="csat_medio" label="CSAT médio" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader align="center" field="total_avaliacoes" label="Avaliações" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <th className="px-4 py-3 font-medium">Tempo de posse</th>
                    <th className="px-4 py-3 font-medium">Chamados c/ posse</th>
                    <th className="px-4 py-3 font-medium">Posse média</th>
                    <th className="px-4 py-3 font-medium" title="Atendimentos ÷ horas de posse — produtividade só faz sentido lida junto com CSAT/TFR/reabertura ao lado">Atend./hora</th>
                    <th className="px-4 py-3 font-medium">Reaberturas</th>
                    <th className="px-4 py-3 font-medium">Transferências</th>
                  </tr>
                </thead>
                <tbody>
                  {(rankingOrdenado ?? []).map((r) => {
                    const p = posseMap.get(r.operator_nome);
                    const horasPosse = p ? p.minutos_posse / 60 : 0;
                    const atendPorHora = p && horasPosse > 0 ? r.total_atendimentos / horasPosse : null;
                    return (
                      <tr
                        key={r.operator_email ?? r.operator_nome}
                        onClick={p ? () => setPosseDetalhe(r.operator_nome) : undefined}
                        className={cn(
                          "border-t border-sand-line text-center transition-all",
                          p && "relative cursor-pointer hover:relative hover:z-10 hover:scale-[1.01] hover:bg-white hover:shadow-card-hover"
                        )}
                      >
                        <td className="px-4 py-3 text-left font-medium text-ink">{r.operator_nome}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_atendimentos}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tfr_medio)}</td>
                        <td className="px-4 py-3 text-ink/70">{formatMin(r.tempo_resolucao_medio)}</td>
                        <td className={cn("px-4 py-3 font-semibold", corTextoCsat(r.csat_medio))}>{r.csat_medio?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{r.total_avaliacoes}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? formatDuration(p.minutos_posse * 60) : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? p.conversas : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{p ? formatDuration((p.minutos_posse / p.conversas) * 60) : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{atendPorHora !== null ? atendPorHora.toFixed(1) : "—"}</td>
                        <td className="px-4 py-3 text-ink/70">{reaberturaPorAtendenteMap.get(r.operator_nome) ?? 0}</td>
                        <td className="px-4 py-3 text-ink/70">{transferenciasOrigemMap.get(r.operator_nome) ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
          <p className="text-xs text-ink/40">
            Produtividade (atendimentos/hora, reaberturas, transferências) fica nesta mesma tabela de propósito — o
            documento de referência pede pra nunca usar volume isolado como métrica de performance, sempre junto com
            CSAT/TFR/reabertura ao lado. "Tempo de trabalho ativo" por pessoa segue com a mesma limitação do card
            homônimo em Relógios: o Crisp não expõe presença real, só o horário cadastrado.
          </p>

          {rankingHumano && rankingHumano.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Volume de atendimentos por pessoa</p>
              <HorizontalBarChart
                data={(() => {
                  const ordenado = [...rankingHumano].sort((a, b) => b.total_atendimentos - a.total_atendimentos);
                  const rotulos = nomesCurtosDisambiguados(ordenado.map((r) => r.operator_nome));
                  return ordenado.map((r, i) => ({ label: rotulos[i], value: r.total_atendimentos }));
                })()}
                getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]}
              />
            </Card>
          )}
          <p className="text-xs text-ink/40">
            "Total de atendimentos" conta chamados onde a pessoa é a atendente registrada agora. "Chamados c/ posse"
            conta de forma diferente — inclui trechos em que a pessoa segurou o chamado mesmo que outra tenha assumido
            depois (handoff), por isso os dois números não precisam bater. Clique numa linha com posse pra ver os
            chamados específicos.
          </p>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-ink">Velocidade</h2>
              <button
                type="button"
                onClick={() => setExplicacaoVelocidadeAberta(true)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
              >
                <Info size={13} /> ver mais
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TFR — tempo até 1ª resposta humana</p>
                {loadingPercentis ? (
                  <p className="mt-2 text-sm text-ink/50">Carregando...</p>
                ) : !percentis || percentis.tfr_amostras === 0 ? (
                  <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
                ) : (
                  <>
                    <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.tfr_media)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                      <span>P50: {formatDuration(percentis.tfr_p50)}</span>
                      <span>P90: {formatDuration(percentis.tfr_p90)}</span>
                      <span>P95: {formatDuration(percentis.tfr_p95)}</span>
                    </div>
                    <p className={cn("mt-2 text-sm font-bold", corTextoSla(percentis.tfr_sla_pct))}>
                      SLA cumprido: {percentis.tfr_sla_pct?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{percentis.tfr_amostras} amostras</p>
                  </>
                )}
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TTR — tempo até resolução</p>
                {loadingPercentis ? (
                  <p className="mt-2 text-sm text-ink/50">Carregando...</p>
                ) : !percentis || percentis.ttr_amostras === 0 ? (
                  <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
                ) : (
                  <>
                    <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.ttr_media)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                      <span>P50: {formatDuration(percentis.ttr_p50)}</span>
                      <span>P90: {formatDuration(percentis.ttr_p90)}</span>
                      <span>P95: {formatDuration(percentis.ttr_p95)}</span>
                    </div>
                    <p className={cn("mt-2 text-sm font-bold", corTextoSla(percentis.ttr_sla_pct))}>
                      SLA cumprido: {percentis.ttr_sla_pct?.toFixed(1) ?? "—"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{percentis.ttr_amostras} amostras</p>
                    {percentis.ttr_primeira_resolucao_amostras > 0 && (
                      <p className="mt-2 border-t border-sand-line pt-2 text-[11px] text-ink/50">
                        1ª resolução (antes de reabrir): <span className="font-medium text-ink/70">{formatDuration(percentis.ttr_primeira_resolucao_media)}</span>
                      </p>
                    )}
                  </>
                )}
              </Card>
            </div>
            <p className="mt-2 text-xs text-ink/40">
              SLA de 1ª resposta e de resolução são independentes (metas em minutos configuráveis em <code>sla_config</code>,
              hoje uma regra única global). Tempo já desconta fora de expediente.
            </p>
          </div>

          {explicacaoVelocidadeAberta && (
            <Dialog onClose={() => setExplicacaoVelocidadeAberta(false)} className="max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">O que significam esses números?</h3>
                <button type="button" onClick={() => setExplicacaoVelocidadeAberta(false)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3 text-sm text-ink/70">
                <p><span className="font-semibold text-ink">TFR</span> — tempo até a 1ª resposta humana. No Ranking, atribuído a quem de fato respondeu primeiro (não necessariamente quem é o atendente atual do chamado, se ele trocou de mão depois).</p>
                <p><span className="font-semibold text-ink">TTR</span> — tempo até a resolução (do início do chamado até ele ser marcado como resolvido). Se o chamado reabriu, esse valor é sempre até a resolução mais recente/final — a linha "1ª resolução" embaixo do card mostra quanto tempo levou da primeira vez, antes de reabrir.</p>
                <p><span className="font-semibold text-ink">Média</span> — soma de todos os tempos dividida pela quantidade de chamados. Pode ser puxada por poucos casos muito lentos (outliers).</p>
                <p><span className="font-semibold text-ink">P50 (mediana)</span> — metade dos chamados foi respondida/resolvida em até esse tempo. É o "caso típico", menos sensível a outliers que a média.</p>
                <p><span className="font-semibold text-ink">P90</span> — 90% dos chamados ficaram dentro desse tempo; só os 10% mais lentos passaram disso.</p>
                <p><span className="font-semibold text-ink">P95</span> — 95% dos chamados ficaram dentro desse tempo; captura os piores casos (só 5% foi mais lento).</p>
                <p><span className="font-semibold text-ink">SLA cumprido</span> — percentual de chamados que ficou dentro da meta configurada em <code>sla_config</code> (hoje uma meta única, em minutos, pra todo o time).</p>
              </div>
            </Dialog>
          )}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Operação — Backlog</h2>
            {loadingBacklog ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !backlog || backlog.length === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado em aberto.</p></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const).map((faixa) => {
                  const total = backlog.find((b) => b.faixa === faixa)?.total ?? 0;
                  const critico = faixa === "+7 dias";
                  return (
                    <Card
                      key={faixa}
                      onClick={total > 0 ? () => { setBacklogFaixaAberta(faixa); setBacklogPage(0); } : undefined}
                      className={cn(
                        "p-4 transition-all duration-200",
                        total > 0 ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover" : "",
                        critico && total > 0 && "border-rust-400/40 bg-rust-500/5"
                      )}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">{faixa}</p>
                      <p className={cn("mt-1 font-display text-kpi-lg font-bold", total > 0 ? corBacklogFaixa(faixa) : "text-ink")}>{total}</p>
                    </Card>
                  );
                })}
              </div>
            )}
            {backlog && backlog.some((b) => b.total > 0) && (
              <Card className="mt-4 p-4">
                <BarChart
                  data={(["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const).map((faixa) => ({
                    label: faixa,
                    value: backlog.find((b) => b.faixa === faixa)?.total ?? 0,
                  }))}
                  getColorClass={(_, i) => corBacklogBarra((["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const)[i])}
                  height={110}
                />
              </Card>
            )}
            <p className="mt-2 text-xs text-ink/40">
              Total em aberto: {backlog?.reduce((acc, b) => acc + b.total, 0) ?? 0} chamados. Evolução histórica do
              backlog ainda não é possível — não existe um snapshot diário salvo, só o estado atual.
            </p>
          </div>

          {backlogFaixaAberta && (
            <Dialog onClose={() => setBacklogFaixaAberta(null)} className="max-w-4xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">Backlog — {backlogFaixaAberta}</h3>
                <button type="button" onClick={() => setBacklogFaixaAberta(null)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 max-h-[70vh] overflow-y-auto">
                {loadingBacklogCasos ? (
                  <p className="text-sm text-ink/50">Carregando...</p>
                ) : !backlogCasos || backlogCasos.rows.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhum chamado nessa faixa.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium">Atendente</th>
                          <th className="px-3 py-2 font-medium">Motivo</th>
                          <SortableHeader align="center" field="inicio" label="Início" ordenarPor="inicio" direcao={backlogDirecao} onSort={ordenarBacklogPorInicio} />
                          <th className="px-3 py-2 font-medium">Idade</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backlogCasos.rows.map((c) => (
                          <tr key={c.crisp_id} className="border-t border-sand-line text-center align-top">
                            <td className="px-3 py-2 text-left text-ink">{c.cliente_nome ?? "—"}</td>
                            <td className="px-3 py-2 text-ink/70">{c.operator_nome ?? "—"}</td>
                            <td className="px-3 py-2 text-ink/70">{c.topico ?? "—"}</td>
                            <td className="px-3 py-2 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-2 text-ink/70">{c.idade_dias}d</td>
                            <td className="px-3 py-2">
                              <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                                {c.status ? statusLabel[c.status] ?? c.status : "—"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {c.link_chamado ? (
                                <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                  <Button variant="secondary" size="sm"><ExternalLink size={13} /> Ver</Button>
                                </a>
                              ) : (
                                <span className="text-xs text-ink/30">sem link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {backlogCasos && backlogCasos.count > PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between text-sm text-ink/60">
                  <span>{backlogCasos.count} chamados</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={backlogPage === 0} onClick={() => setBacklogPage((p) => p - 1)}>Anterior</Button>
                    <span className="flex items-center px-2 text-xs">Página {backlogPage + 1} de {Math.max(Math.ceil(backlogCasos.count / PAGE_SIZE), 1)}</span>
                    <Button variant="secondary" size="sm" disabled={(backlogPage + 1) * PAGE_SIZE >= backlogCasos.count} onClick={() => setBacklogPage((p) => p + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </Dialog>
          )}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Reabertura</h2>
            {loadingReabertura ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !reaberturaResumo || reaberturaResumo.total_resolvidos === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado resolvido no período pra medir reabertura.</p></Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Taxa de reabertura</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoSla(100 - (reaberturaResumo.taxa_pct ?? 0)))}>
                      {reaberturaResumo.taxa_pct?.toFixed(1) ?? "0.0"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{reaberturaResumo.total_resolvidos} chamados resolvidos no período</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Chamados reabertos</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{reaberturaResumo.total_reabertos}</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de eventos de reabertura</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{reaberturaResumo.total_eventos}</p>
                    <p className="mt-1 text-[11px] text-ink/40">um chamado pode reabrir mais de uma vez</p>
                  </Card>
                </div>

                {reaberturaResumo.total_reabertos > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Card className="p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Principais motivos</p>
                      <HorizontalBarChart data={reaberturaPorMotivo} getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]} labelWidth={160} />
                    </Card>
                    <Card className="p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Por atendente</p>
                      <HorizontalBarChart data={reaberturaPorAtendente} getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]} labelWidth={140} />
                    </Card>
                  </div>
                )}

                {reaberturaCasos && reaberturaCasos.length > 0 && (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <select
                        value={reaberturaFiltroAtendente}
                        onChange={(e) => { setReaberturaFiltroAtendente(e.target.value); setMostrarTodasReaberturas(false); }}
                        className="h-8 rounded-lg border border-sand-line bg-white px-2 text-xs"
                      >
                        <option value="">Todos os atendentes</option>
                        {reaberturaAtendentesDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <select
                        value={reaberturaFiltroReaberto}
                        onChange={(e) => { setReaberturaFiltroReaberto(e.target.value); setMostrarTodasReaberturas(false); }}
                        className="h-8 rounded-lg border border-sand-line bg-white px-2 text-xs"
                      >
                        <option value="">Qualquer nº de reaberturas</option>
                        {reaberturaReabertosDisponiveis.map((n) => <option key={n} value={n}>{n}x reaberto</option>)}
                      </select>
                    </div>
                    {reaberturaCasosFiltrados.length === 0 ? (
                      <p className="mt-2 text-sm text-ink/50">Nenhum caso com esse filtro.</p>
                    ) : (
                      <Card className="mt-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium">Cliente</th>
                              <th className="px-4 py-3 font-medium">Motivo</th>
                              <th className="px-4 py-3 font-medium">Atendente</th>
                              <th className="px-4 py-3 font-medium">Reaberto</th>
                              <th className="px-4 py-3 font-medium">Início</th>
                              <th className="px-4 py-3 font-medium">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(mostrarTodasReaberturas ? reaberturaCasosFiltrados : reaberturaCasosFiltrados.slice(0, 4)).map((c) => (
                              <tr key={c.crisp_id} className="border-t border-sand-line text-center align-top">
                                <td className="px-4 py-3 text-left text-ink">{c.cliente_nome ?? "—"}</td>
                                <td className="px-4 py-3 text-ink/70">{c.topico}</td>
                                <td className="px-4 py-3 text-ink/70">{c.atendente ?? "—"}</td>
                                <td className="px-4 py-3 font-medium text-ink">{c.reopened_count}x</td>
                                <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                                <td className="px-4 py-3">
                                  {c.link_chamado ? (
                                    <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                      <Button variant="secondary" size="sm"><ExternalLink size={13} /> Ver</Button>
                                    </a>
                                  ) : (
                                    <span className="text-xs text-ink/30">sem link</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Card>
                    )}
                    {reaberturaCasosFiltrados.length > 4 && (
                      <div className="mt-2 flex justify-center">
                        <Button variant="secondary" size="sm" onClick={() => setMostrarTodasReaberturas((v) => !v)}>
                          {mostrarTodasReaberturas ? "Ver menos" : `Ver mais reaberturas (${reaberturaCasosFiltrados.length - 4})`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Transferências</h2>
            {loadingTransferencias ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !transferenciasResumo || transferenciasResumo.total_atendidos === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado atendido no período pra medir transferência.</p></Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Taxa de transferência</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoSla(100 - (transferenciasResumo.taxa_pct ?? 0)))}>
                      {transferenciasResumo.taxa_pct?.toFixed(1) ?? "0.0"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{transferenciasResumo.total_atendidos} chamados atendidos no período</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Chamados transferidos</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{transferenciasResumo.total_transferidos}</p>
                    <p className="mt-1 text-[11px] text-ink/40">{transferenciasResumo.total_eventos} eventos (um chamado pode trocar de mão mais de uma vez)</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo médio até transferir</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{formatDuration(transferenciasResumo.tempo_medio_antes_seg)}</p>
                  </Card>
                </div>

                {transferenciasResumo.total_transferidos > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Card className="p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Origem (quem passou a bola)</p>
                      <HorizontalBarChart data={transferenciasPorOrigem} getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]} labelWidth={140} />
                    </Card>
                    <Card className="p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Destino (quem recebeu)</p>
                      <HorizontalBarChart data={transferenciasPorDestino} getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]} labelWidth={140} />
                    </Card>
                  </div>
                )}

                {transferenciasCasos && transferenciasCasos.length > 0 && (
                  <Card className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Cliente</th>
                          <th className="px-4 py-3 font-medium">Origem</th>
                          <th className="px-4 py-3 font-medium">Destino</th>
                          <th className="px-4 py-3 font-medium">Quando</th>
                          <th className="px-4 py-3 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mostrarTodasTransferencias ? transferenciasCasos : transferenciasCasos.slice(0, 4)).map((c, i) => (
                          <tr key={`${c.crisp_id}-${i}`} className="border-t border-sand-line text-center align-top">
                            <td className="px-4 py-3 text-left text-ink">{c.cliente_nome ?? "—"}</td>
                            <td className="px-4 py-3 text-ink/70">{c.origem ?? "—"}</td>
                            <td className="px-4 py-3 text-ink/70">{c.destino ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.event_at).toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3">
                              {c.link_chamado ? (
                                <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                  <Button variant="secondary" size="sm"><ExternalLink size={13} /> Ver</Button>
                                </a>
                              ) : (
                                <span className="text-xs text-ink/30">sem link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
                {transferenciasCasos && transferenciasCasos.length > 4 && (
                  <div className="mt-2 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setMostrarTodasTransferencias((v) => !v)}>
                      {mostrarTodasTransferencias ? "Ver menos" : `Ver mais (${transferenciasCasos.length - 4})`}
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-ink/40">
                  Só conta troca entre dois atendentes humanos de verdade — passar do bot pro humano é fluxo normal,
                  não entra aqui. O motivo da transferência não está disponível (a Crisp não envia essa informação).
                </p>
              </>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">FCR e Recontato</h2>
            {loadingFcr ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !fcrRecontato || fcrRecontato.total_elegiveis === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado elegível no período (precisa estar resolvido, com cliente e motivo identificados).</p></Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">FCR</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoSla(fcrRecontato.fcr_pct ?? 0))}>
                      {fcrRecontato.fcr_pct?.toFixed(1) ?? "0.0"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">resolvido sem o cliente voltar pelo mesmo motivo em 7 dias</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Recontato</p>
                    <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoSla(100 - (fcrRecontato.recontato_pct ?? 0)))}>
                      {fcrRecontato.recontato_pct?.toFixed(1) ?? "0.0"}%
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">{fcrRecontato.total_recontato} de {fcrRecontato.total_elegiveis} voltaram pelo mesmo motivo</p>
                  </Card>
                  <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Chamados elegíveis</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{fcrRecontato.total_elegiveis}</p>
                    <p className="mt-1 text-[11px] text-ink/40">resolvidos, com cliente e motivo identificados</p>
                  </Card>
                </div>

                {recontatoPorMotivo.length > 0 && (
                  <Card className="mt-4 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Motivos com mais recontato</p>
                    <HorizontalBarChart data={recontatoPorMotivo} getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]} labelWidth={180} />
                  </Card>
                )}

                {recontatoCasos && recontatoCasos.length > 0 && (
                  <Card className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Cliente</th>
                          <th className="px-4 py-3 font-medium">Motivo</th>
                          <th className="px-4 py-3 font-medium">Atendente</th>
                          <th className="px-4 py-3 font-medium">Resolvido em</th>
                          <th className="px-4 py-3 font-medium">Voltou em</th>
                          <th className="px-4 py-3 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mostrarTodosRecontatos ? recontatoCasos : recontatoCasos.slice(0, 4)).map((c) => (
                          <tr key={c.crisp_id} className="border-t border-sand-line text-center align-top">
                            <td className="px-4 py-3 text-left text-ink">{c.cliente_nome ?? "—"}</td>
                            <td className="px-4 py-3 text-ink/70">{c.topico ?? "—"}</td>
                            <td className="px-4 py-3 text-ink/70">{c.atendente ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.resolved_at).toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-xs text-ink/60">{c.proximo_contato_at ? new Date(c.proximo_contato_at).toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3">
                              {c.link_chamado ? (
                                <a href={c.link_chamado} target="_blank" rel="noreferrer">
                                  <Button variant="secondary" size="sm"><ExternalLink size={13} /> Ver</Button>
                                </a>
                              ) : (
                                <span className="text-xs text-ink/30">sem link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
                {recontatoCasos && recontatoCasos.length > 4 && (
                  <div className="mt-2 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setMostrarTodosRecontatos((v) => !v)}>
                      {mostrarTodosRecontatos ? "Ver menos" : `Ver mais (${recontatoCasos.length - 4})`}
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-ink/40">
                  "Mesmo motivo" = mesmo texto de tópico (classificado pela Crisp), dentro de 7 dias após a resolução.
                  Chamado sem cliente identificado (people_id) ou sem tópico não entra na conta — não dá pra saber se
                  ele voltou. Separado de Reabertura: aqui é o cliente abrindo um chamado <em>novo</em>, não reabrindo
                  o mesmo.
                </p>
              </>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Relógios do atendimento</h2>
            <Card className="p-4">
              <div className="grid gap-4 border-b border-sand-line pb-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio do cliente</p>
                  {loadingPercentis ? (
                    <p className="mt-1 text-sm text-ink/50">Carregando...</p>
                  ) : !percentis || percentis.ttr_amostras === 0 ? (
                    <p className="mt-1 text-sm text-ink/50">Sem amostras.</p>
                  ) : (
                    <>
                      <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.ttr_media)}</p>
                      <p className="mt-1 text-[11px] text-ink/40">TTR médio — mesmo valor de Velocidade, do ponto de vista de quem esperou</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de espera do cliente</p>
                  {loadingEspera ? (
                    <p className="mt-1 text-sm text-ink/50">Carregando...</p>
                  ) : !esperaCliente || esperaCliente.amostras === 0 ? (
                    <p className="mt-1 text-sm text-ink/50">Sem amostras.</p>
                  ) : (
                    <>
                      <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration((esperaCliente.minutos_espera_medio ?? 0) * 60)}</p>
                      <p className="mt-1 text-[11px] text-ink/40">{esperaCliente.amostras} janelas de espera até resposta humana (bot não conta)</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de trabalho ativo</p>
                  {loadingExpediente ? (
                    <p className="mt-1 text-sm text-ink/50">Carregando...</p>
                  ) : !horasExpediente ? (
                    <p className="mt-1 text-sm text-ink/50">Sem expediente cadastrado no período.</p>
                  ) : (
                    <>
                      <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(horasExpediente * 60)}</p>
                      <p
                        className="mt-1 text-[11px] text-ink/40"
                        title={atendenteNomes.length > 0 ? "Plantão fixo de sábado (08h-12h) não entra aqui filtrado — não dá pra saber quem especificamente está de plantão nessa data." : undefined}
                      >
                        {atendenteNomes.length > 0
                          ? "expediente cadastrado das pessoas selecionadas (união, não soma)"
                          : "expediente cadastrado do time (cobertura, não soma individual)"}
                      </p>
                      {tipoClienteFiltro && (
                        <p className="mt-0.5 text-[11px] text-ink/40" title="Cobertura de horário é sobre a agenda do time, não sobre chamados — não existe 'expediente do tipo Produtor'.">
                          Não respeita o filtro de tipo de cliente (motivo no hover)
                        </p>
                      )}
                    </>
                  )}
                  <p className="mt-1 text-[11px] text-ink/30" title="O Crisp não expõe estado de ativo/ausente do operador pela API">
                    capacidade nominal (horário cadastrado), não presença real
                  </p>
                </div>
              </div>

              <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink/40">Posse por atendente humano (chamados resolvidos no período)</p>
              {loadingPosse ? (
                <p className="text-sm text-ink/50">Carregando...</p>
              ) : posseFiltrada.filter((p) => p.atendente !== "IA Greenn").length === 0 ? (
                <p className="text-sm text-ink/50">Sem chamados resolvidos no período pra medir posse.</p>
              ) : (
                <HorizontalBarChart
                  data={posseFiltrada
                    .filter((p) => p.atendente !== "IA Greenn")
                    .sort((a, b) => b.minutos_posse - a.minutos_posse)
                    .map((p) => ({ label: p.atendente, value: p.minutos_posse / 60, displayValue: `${(p.minutos_posse / 60).toFixed(1)}h` }))}
                  getColorClass={() => "bg-sky-500"}
                  labelWidth={180}
                />
              )}
              <p className="mt-3 text-xs text-ink/40">
                Posse = tempo entre a 1ª mensagem de um atendente num chamado e a entrada do próximo atendente (ou a
                resolução, se ninguém mais entrar) — cada trecho conta só pra quem estava "com a bola" naquele momento,
                não o TTR inteiro pra todo mundo que passou pelo chamado. Bot (IA Greenn) fica de fora daqui — vem
                separado no card acima do Ranking. Detalhamento por atendente está na tabela de Ranking, no topo da
                página.
              </p>
            </Card>
          </div>

          {posseDetalhe && (
            <Dialog onClose={() => setPosseDetalhe(null)} className="max-w-4xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">Chamados de {posseDetalhe}</h3>
                <button type="button" onClick={() => setPosseDetalhe(null)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 max-h-[70vh] overflow-y-auto">
                {loadingPosseDetalhe ? (
                  <p className="text-sm text-ink/50">Carregando...</p>
                ) : !posseDetalheAtendimentos || posseDetalheAtendimentos.rows.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhum chamado encontrado no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Cliente</th>
                          <SortableHeader align="center" field="tempo_aberto" label="Início" ordenarPor={posseDetalheOrdenarPor} direcao={posseDetalheDirecao} onSort={ordenarPosseDetalhePorColuna} />
                          <SortableHeader align="center" field="tfr" label="1ª resposta" ordenarPor={posseDetalheOrdenarPor} direcao={posseDetalheDirecao} onSort={ordenarPosseDetalhePorColuna} />
                          <SortableHeader align="center" field="tempo_resolucao" label="Resolução" ordenarPor={posseDetalheOrdenarPor} direcao={posseDetalheDirecao} onSort={ordenarPosseDetalhePorColuna} />
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posseDetalheAtendimentos.rows.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => setDetalhe(c)}
                            className="cursor-pointer border-t border-sand-line text-center align-top transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-white hover:shadow-card-hover"
                          >
                            <td className="px-3 py-2 text-left">
                              <p className="font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                              <p className="text-xs text-ink/50">{c.cliente_email}</p>
                            </td>
                            <td className="px-3 py-2 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-2 text-ink/70">
                              {c.tempo_primeira_resposta_seg !== null ? (
                                formatDuration(c.tempo_primeira_resposta_seg)
                              ) : c.tempo_primeira_resposta_geral_seg !== null ? (
                                <span title="Só o bot respondeu até agora, nenhum humano ainda">
                                  {formatDuration(c.tempo_primeira_resposta_geral_seg)} <span className="text-[11px] text-ink/40">(bot)</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink/70">{formatDuration(c.tempo_resolucao_seg)}</td>
                            <td className="px-3 py-2">
                              <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                                {c.status ? statusLabel[c.status] ?? c.status : "—"}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {c.link_chamado ? (
                                <a href={c.link_chamado} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                  <Button variant="secondary" size="sm">
                                    <ExternalLink size={13} /> Ver
                                  </Button>
                                </a>
                              ) : (
                                <span className="text-xs text-ink/30">sem link</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Dialog>
          )}
          {detalhe && <AtendimentoDetalheDialog atendimento={detalhe} onClose={() => setDetalhe(null)} />}

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Motivo de contato</h2>
            {loadingMotivos ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !motivos || motivos.length === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Sem tópico classificado no período ainda — a Crisp classifica de forma assíncrona, só depois que um atendente responde.</p></Card>
            ) : (
              <>
                <Card className="mb-4 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Top 3 tópicos por volume</p>
                    {motivoDestaque && (
                      <button
                        type="button"
                        onClick={() => { setMotivoDestaque(""); setMostrarTodosMotivos(false); }}
                        className="text-[11px] text-forest-600 hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <HorizontalBarChart
                    data={[...motivos]
                      .sort((a, b) => b.chamados - a.chamados)
                      .slice(0, 3)
                      .map((m) => ({ label: m.topico, value: m.chamados }))}
                    getColorClass={(_, i) => CORES_VIVAS[i % CORES_VIVAS.length]}
                    labelWidth={200}
                    onBarClick={(label) => {
                      setMotivoDestaque((atual) => (atual === label ? "" : label));
                      setMostrarTodosMotivos(false);
                    }}
                    isSelected={(label) => motivoDestaque === label}
                  />
                </Card>
                {motivosFiltrados.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhum tópico com esse filtro.</p>
                ) : (
                  <Card className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Tópico</th>
                          <SortableHeader field="chamados" label="Chamados" ordenarPor={motivoOrdenarPor} direcao={motivoDirecao} onSort={ordenarMotivoPorColuna} align="center" />
                          <SortableHeader field="tfr_media_seg" label="TFR médio" ordenarPor={motivoOrdenarPor} direcao={motivoDirecao} onSort={ordenarMotivoPorColuna} align="center" />
                          <SortableHeader field="ttr_media_seg" label="TTR médio" ordenarPor={motivoOrdenarPor} direcao={motivoDirecao} onSort={ordenarMotivoPorColuna} align="center" />
                        </tr>
                      </thead>
                      <tbody>
                        {(mostrarTodosMotivos ? motivosOrdenados : motivosOrdenados.slice(0, 4)).map((m) => (
                          <tr key={m.topico} className="border-t border-sand-line text-center">
                            <td className="px-4 py-3 text-left font-medium text-ink">{m.topico}</td>
                            <td className="px-4 py-3 text-ink/70">{m.chamados}</td>
                            <td className="px-4 py-3 text-ink/70">{formatDuration(m.tfr_media_seg)}</td>
                            <td className="px-4 py-3 text-ink/70">{formatDuration(m.ttr_media_seg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
                {motivosOrdenados.length > 4 && (
                  <div className="mt-2 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={() => setMostrarTodosMotivos((v) => !v)}>
                      {mostrarTodosMotivos ? "Ver menos" : `Ver mais (${motivosOrdenados.length - 4})`}
                    </Button>
                  </div>
                )}
              </>
            )}
            <p className="mt-2 text-xs text-ink/40">
              Tópico é classificado automaticamente pela Crisp por conversa — não é uma categoria fixa reutilizável, então
              essa lista pode ficar fragmentada até termos volume real suficiente pra avaliar se faz sentido agrupar por
              palavra-chave. Chamados ainda sem resposta de atendente não aparecem aqui (tópico só é atribuído depois).
            </p>
          </div>

          <div>
            <h2 className="mb-3 font-display text-sm font-semibold text-ink">Por tipo de cliente</h2>
            {loadingTipoCliente ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : !metricasTipoCliente || metricasTipoCliente.length === 0 ? (
              <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado com tipo de cliente identificado no período.</p></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {metricasTipoCliente
                  .filter((m) => !tipoClienteFiltro || m.tipo_cliente === tipoClienteFiltro)
                  .map((m) => (
                  <Card
                    key={m.tipo_cliente}
                    onClick={() => setTipoClienteFiltro((atual) => (atual === m.tipo_cliente ? "" : m.tipo_cliente))}
                    className={cn(
                      "cursor-pointer p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
                      tipoClienteFiltro === m.tipo_cliente && "border-forest-300 bg-forest-50/40 ring-1 ring-forest-300"
                    )}
                  >
                    <p className="text-sm font-semibold text-ink">{m.tipo_cliente}</p>
                    <p
                      className="mt-1 text-xs text-ink/40"
                      title="Conta todo chamado com essa tag no período, tenha ou não resposta/resolução ainda — por isso pode ser maior que a quantidade de amostras usada pro TFR/TTR médio ao lado."
                    >
                      {m.chamados} chamados
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40">TFR médio</p>
                        <p className="font-display text-sm font-semibold text-ink">{formatDuration(m.tfr_media_seg)}</p>
                      </div>
                      <div>
                        <p
                          className="text-[10px] font-medium uppercase tracking-wide text-ink/40"
                          title="'—' quando nenhum chamado desse tipo foi resolvido ainda no período (comum cedo no dia, ou com fila grande)."
                        >
                          TTR médio
                        </p>
                        <p className="font-display text-sm font-semibold text-ink">{formatDuration(m.ttr_media_seg)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-ink/40">
              Só aparece aqui o tipo de cliente que existir de verdade em <code>crisp_conversations.tipo_cliente</code> no
              período — não é uma lista fixa, novos segmentos aparecem sozinhos assim que o pipeline capturar. Clique num
              card pra ver só aquele tipo (clique de novo pra voltar a ver todos). "Chamados" conta todo mundo com a tag,
              independente de já ter sido respondido ou resolvido — por isso pode ser maior que as amostras do card de
              Velocidade acima, que só conta quem já tem TFR/TTR calculado de verdade.
            </p>
          </div>
        </>
      ) : (
        <>
          <Card className="flex items-center gap-2 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(0); }}
                placeholder="Buscar por nome ou email do cliente..."
                className="h-9 w-full rounded-lg border border-sand-line bg-white pl-8 pr-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
          </Card>

          {loadingAtendimentos ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : !atendimentos || atendimentos.rows.length === 0 ? (
            <EmptyState icon={PhoneCall} title="Nenhum atendimento encontrado" description="Ajuste os filtros ou o período selecionado." />
          ) : (
            <>
              <Card>
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Cliente</th>
                      <th className="px-4 py-3 font-medium">Atendente</th>
                      <SortableHeader align="center" field="tempo_aberto" label="Início" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <th className="px-4 py-3 font-medium">1ª resposta humana</th>
                      <SortableHeader align="center" field="tfr" label="Tempo até 1ª resposta" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                      <SortableHeader align="center" field="tempo_resolucao" label="Resolução" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} className="hidden lg:table-cell" />
                      <th className="hidden px-4 py-3 font-medium xl:table-cell" title="Tempo que o atendente atual ficou de posse desse chamado — sempre em horas corridas (não desconta fora de expediente, diferente de 'Resolução' ao lado). Pode ficar bem maior quando o chamado atravessa noite/fim de semana.">Tempo ativo</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atendimentos.rows.map((c) => {
                      const invalido = c.invalido_resposta_antes_inicio || c.invalido_tempo_negativo;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setDetalhe(c)}
                          className={cn(
                            "cursor-pointer border-t border-sand-line text-center align-top transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-white hover:shadow-card-hover",
                            invalido && "bg-rust-500/5"
                          )}
                        >
                          <td className="truncate px-4 py-3 text-left">
                            <p className="truncate font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                            <p className="truncate text-xs text-ink/50">{c.cliente_email}</p>
                          </td>
                          <td className="truncate px-4 py-3 text-ink/70">{c.operator_nome ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">
                            {c.primeira_resposta_humana_at ? new Date(c.primeira_resposta_humana_at).toLocaleString("pt-BR") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {c.invalido_sem_resposta_humana ? (
                              <span className="text-xs text-ink/40">sem resposta humana</span>
                            ) : invalido ? (
                              <span title="Dado inconsistente: resposta antes do início ou tempo negativo" className="inline-flex items-center gap-1 text-xs text-rust-500">
                                <AlertTriangle size={12} /> inválido
                              </span>
                            ) : (
                              formatDuration(c.tempo_primeira_resposta_seg)
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-ink/70 lg:table-cell">{formatDuration(c.tempo_resolucao_seg)}</td>
                          <td className="hidden px-4 py-3 text-ink/70 xl:table-cell">{formatDuration(c.tempo_ativo_seg)}</td>
                          <td className="px-4 py-3">
                            <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                              {c.status ? statusLabel[c.status] ?? c.status : "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {c.link_chamado ? (
                              <a href={c.link_chamado} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                <Button variant="secondary" size="sm">
                                  <ExternalLink size={13} /> Ver chamado
                                </Button>
                              </a>
                            ) : (
                              <span className="text-xs text-ink/30">sem link</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              {detalhe && <AtendimentoDetalheDialog atendimento={detalhe} onClose={() => setDetalhe(null)} />}
              <div className="flex items-center justify-between text-sm text-ink/60">
                <span>{atendimentos.count} atendimentos</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
                  <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
