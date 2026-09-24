import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";
import { AlertTriangle, Bot, PhoneCall, Search, ExternalLink, Info, X, SlidersHorizontal, Download, Star, StarOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { AtendimentoDetalheDialog } from "@/components/AtendimentoDetalheDialog";
import { HorizontalBarChart } from "@/components/ui/BarChart";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  fetchAtendentePerformance,
  fetchDistinctCanais,
  fetchAtendimentosComMetricas,
  fetchTodosAtendimentosComMetricas,
  fetchDistinctTiposCliente,
  fetchDistinctAtendentesConversas,
  fetchVelocidadePorTipoCliente,
  fetchBacklogPorIdade,
  fetchBacklogCasos,
  fetchRelogioPosse,
  fetchRelogioEsperaCliente,
  fetchHorasExpedientePeriodo,
  fetchMotivoContatoResumo,
  fetchCsatDistribuicao,
  fetchTempoRespostaBot,
  fetchContagemPeriodo,
  fetchReaberturaPorTipoCliente,
  fetchReaberturaCasos,
  fetchTransferenciasResumo,
  fetchTransferenciasCasos,
  fetchFcrRecontatoResumo,
  fetchRecontatoCasos,
  fetchRespostaGenericaResumo,
  fetchRespostaGenericaCasos,
  fetchVolumeDiaHora,
  fetchCsatFunilCanal,
  fetchAtendidoNaoResolvido,
  fetchCsatRuins,
  type ModoTempo,
  type AtendimentoComMetricas,
  type VelocidadePorTipoCliente,
  type ReaberturaPorTipoCliente,
} from "@/services/api";
import { resolvePeriodo, periodoAnterior, type PeriodoPreset } from "@/lib/dateRanges";
import { deltaPercentual, deltaPontos, fmtNum, fmtPct1, linhasFunil, resumoAtendido } from "@/lib/resultadosSac";
import { CsatDetalheDialog } from "@/components/CsatDetalheDialog";
import type { DbCsatResult } from "@/types/database";
import { SaudeKpi, PrecisaAtencao, SecaoHead, CsatRuinsDialog } from "@/pages/overview/OverviewBlocos";
import { formatDuration } from "@/lib/formatDuration";
import { cn, nomesCurtosDisambiguados } from "@/lib/utils";
import { DateRangePopover } from "@/components/ui/DateRangePopover";
import { exportAtendimentosToCsv } from "@/lib/exportCsv";

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

// dow do Postgres: 0=domingo .. 6=sábado (mesma convenção de cobertura_semanal).
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_DIA = Array.from({ length: 24 }, (_, h) => h);

type OrdenarCampo = "tempo_aberto" | "tfr" | "tempo_resolucao";
const DIRECAO_PADRAO: Record<OrdenarCampo, "asc" | "desc"> = {
  tempo_aberto: "desc",
  tfr: "desc",
  tempo_resolucao: "desc",
};


function corTextoSla(pct: number | null | undefined) {
  if (pct === null || pct === undefined) return "text-ink/70";
  if (pct >= 80) return "text-forest-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rust-500";
}




type RankingCampo = "total_atendimentos" | "total_interacoes" | "total_mensagens" | "tfr_medio" | "tempo_resolucao_medio" | "csat_medio" | "total_avaliacoes";
type MotivoCampo = "chamados" | "tfr_media_seg" | "ttr_media_seg";

// Tempo em minutos, arredondado pra leitura rápida no ranking: "25min",
// "4h 52min", "2d 3h".
function tempoCurto(min: number | null | undefined): string {
  if (min == null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export default function Performance() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  // Overview aberto a todo colaborador (2026-09-24): quem não é admin vê só
  // a aba Dashboard; listas de conversas e clientes (aba Atendimentos, IA
  // genérica, pop-ups de casos) continuam só pra admin — no banco também.

  const [abaSalva, setAba] = usePersistedState<"ranking" | "atendimentos" | "generico">("overview:aba", "ranking");
  const aba = isAdmin ? abaSalva : "ranking";
  // Toggle de horas úteis/corridas removido do Overview (pedido do usuário) —
  // Velocidade agora mostra os dois modos direto no card, sem precisar
  // escolher. O resto da página (Ranking, Motivo de contato, Transferências)
  // continua em horas úteis, só sem opção de trocar pela UI.
  const modoTempo: ModoTempo = "uteis";
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
  const [posseDetalhePage, setPosseDetalhePage] = useState(0);
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
  const [explicacaoRelogiosAberta, setExplicacaoRelogiosAberta] = useState(false);
  const [mostrarTodosMotivos, setMostrarTodosMotivos] = useState(false);
  const [motivoDestaque, setMotivoDestaque] = useState("");
  const [motivoOrdenarPor, setMotivoOrdenarPor] = useState<MotivoCampo | undefined>(undefined);
  const [motivoDirecao, setMotivoDirecao] = useState<"asc" | "desc">("desc");
  const [mostrarTodasReaberturas, setMostrarTodasReaberturas] = useState(false);
  const [reaberturaFiltroAtendente, setReaberturaFiltroAtendente] = useState("");
  const [reaberturaFiltroReaberto, setReaberturaFiltroReaberto] = useState("");
  const [mostrarTodasTransferencias, setMostrarTodasTransferencias] = useState(false);
  const [mostrarTodosRecontatos, setMostrarTodosRecontatos] = useState(false);
  const [genericoPage, setGenericoPage] = useState(0);
  const [genericoSoSemResposta, setGenericoSoSemResposta] = useState(false);
  // Sub-abas do Dashboard (redesenho de 2026-09-24) — cada uma só busca os
  // próprios dados quando está aberta.
  const [subAba, setSubAba] = usePersistedState<"pessoas" | "velocidade" | "qualidade" | "fluxo">("overview:subAba", "pessoas");
  const [posseDetalheSoAbertos, setPosseDetalheSoAbertos] = useState(false);
  const [ruinsAberto, setRuinsAberto] = useState(false);
  const [csatDetalhe, setCsatDetalhe] = useState<DbCsatResult | null>(null);

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
    setPosseDetalhePage(0);
  }

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(() => periodoAnterior(inicio, fim), [inicio, fim]);
  const naDashboard = aba === "ranking";
  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });
  const { data: tiposCliente } = useQuery({ queryKey: ["tipos-cliente"], queryFn: fetchDistinctTiposCliente });
  const { data: atendentes } = useQuery({ queryKey: ["atendentes-conversas"], queryFn: fetchDistinctAtendentesConversas });

  const atendenteNomesFiltro = atendenteNomes.length > 0 ? atendenteNomes : undefined;
  // "" quando "Todos os tipos de cliente" está selecionado — vira undefined
  // pra não mandar string vazia pro RPC (chamado_tem_tipo_cliente espera
  // null quando não há filtro, não "").
  const tipoClienteRpc = tipoClienteFiltro || undefined;

  const { data: contagem } = useQuery({
    queryKey: ["contagem-periodo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchContagemPeriodo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
  });

  const { data: csatDist } = useQuery({
    queryKey: ["csat-distribuicao", inicio, fim, atendenteNomes],
    queryFn: () => fetchCsatDistribuicao(inicio, fim, undefined, atendenteNomesFiltro),
  });

  const { data: tempoRespostaBot } = useQuery({
    queryKey: ["tempo-resposta-bot", inicio, fim],
    queryFn: () => fetchTempoRespostaBot(inicio, fim),
    enabled: naDashboard && subAba === "pessoas",
  });

  // Compute tier pequeno satura quando todas as agregações pesadas disparam
  // juntas (mesmo padrão já resolvido em ReuniaoResultados.tsx com
  // anteriorHabilitado) — as queries abaixo só disparam depois que
  // contagem_periodo (rápida) resolver, reduzindo o pico de concorrência.
  const waveDoisHabilitada = contagem !== undefined;

  // Substitui os antigos percentis (Velocidade) + metricas-tipo-cliente (Por
  // tipo de cliente) — 1 query só, já traz "Geral" (time inteiro) + 1 linha
  // por tipo real, média E mediana, horas úteis E corridas juntas (sem
  // toggle, sem chamar 2x). Pedido explícito do usuário: mediana como
  // número principal, cards segmentados por tipo perto de Velocidade.
  const { data: velocidadePorTipo, isLoading: loadingVelocidade } = useQuery({
    queryKey: ["velocidade-por-tipo", inicio, fim, atendenteNomes],
    queryFn: () => fetchVelocidadePorTipoCliente(inicio, fim, undefined, atendenteNomesFiltro),
    enabled: waveDoisHabilitada,
  });
  const velocidadeGeral = useMemo(() => velocidadePorTipo?.find((v: VelocidadePorTipoCliente) => v.tipo_cliente === "Geral"), [velocidadePorTipo]);
  const velocidadePorTipoReal = useMemo(() => (velocidadePorTipo ?? []).filter((v: VelocidadePorTipoCliente) => v.tipo_cliente !== "Geral"), [velocidadePorTipo]);

  const { data: backlog } = useQuery({
    queryKey: ["backlog-por-idade", atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchBacklogPorIdade(undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada,
  });

  const { data: posse, isLoading: loadingPosse } = useQuery({
    queryKey: ["relogio-posse", inicio, fim, tipoClienteFiltro],
    queryFn: () => fetchRelogioPosse(inicio, fim, undefined, tipoClienteRpc),
    enabled: waveDoisHabilitada && (subAba === "pessoas" || subAba === "velocidade"),
  });

  const { data: volumeDiaHora, isLoading: loadingVolumeDiaHora } = useQuery({
    queryKey: ["volume-dia-hora", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchVolumeDiaHora(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada && subAba === "fluxo",
  });

  const { data: esperaCliente, isLoading: loadingEspera } = useQuery({
    queryKey: ["relogio-espera-cliente", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchRelogioEsperaCliente(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada && subAba === "velocidade",
  });

  const { data: horasExpediente, isLoading: loadingExpediente } = useQuery({
    queryKey: ["horas-expediente-periodo", inicio, fim, atendenteNomes],
    queryFn: () => fetchHorasExpedientePeriodo(inicio, fim, atendenteNomesFiltro),
    enabled: waveDoisHabilitada && subAba === "velocidade",
  });

  const { data: motivos, isLoading: loadingMotivos } = useQuery({
    queryKey: ["motivo-contato-resumo", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchMotivoContatoResumo(inicio, fim, undefined, modoTempo, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada && (subAba === "fluxo" || aba === "atendimentos"),
  });

  // Mesma ideia de velocidade-por-tipo: 1 query com "Geral" + 1 linha por
  // tipo, usada tanto pelos novos cards segmentados quanto pela seção
  // "Reabertura" já existente (que antes tinha sua própria query só pro
  // "Geral" — unificado aqui pra não repetir a mesma agregação 2x).
  const { data: reaberturaPorTipo, isLoading: loadingReabertura } = useQuery({
    queryKey: ["reabertura-por-tipo", inicio, fim, atendenteNomes],
    queryFn: () => fetchReaberturaPorTipoCliente(inicio, fim, undefined, atendenteNomesFiltro),
    enabled: waveDoisHabilitada,
  });
  const reaberturaResumo = useMemo(() => reaberturaPorTipo?.find((r: ReaberturaPorTipoCliente) => r.tipo_cliente === "Geral"), [reaberturaPorTipo]);

  // Topo do Dashboard: mesmas funções, período anterior (mesma duração,
  // imediatamente antes) pra variação dos 5 indicadores.
  const { data: contagemAnterior } = useQuery({
    queryKey: ["contagem-periodo", inicioAnterior, fimAnterior, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchContagemPeriodo(inicioAnterior, fimAnterior, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const { data: csatDistAnterior } = useQuery({
    queryKey: ["csat-distribuicao", inicioAnterior, fimAnterior, atendenteNomes],
    queryFn: () => fetchCsatDistribuicao(inicioAnterior, fimAnterior, undefined, atendenteNomesFiltro),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const { data: velocidadeAnterior } = useQuery({
    queryKey: ["velocidade-por-tipo", inicioAnterior, fimAnterior, atendenteNomes],
    queryFn: () => fetchVelocidadePorTipoCliente(inicioAnterior, fimAnterior, undefined, atendenteNomesFiltro),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const { data: reaberturaAnteriorPorTipo } = useQuery({
    queryKey: ["reabertura-por-tipo", inicioAnterior, fimAnterior, atendenteNomes],
    queryFn: () => fetchReaberturaPorTipoCliente(inicioAnterior, fimAnterior, undefined, atendenteNomesFiltro),
    enabled: waveDoisHabilitada && naDashboard,
  });
  // Com filtro de tipo de cliente, os indicadores usam a linha daquele tipo
  // (as duas funções já devolvem uma linha por tipo + "Geral").
  const tipoKpi = tipoClienteFiltro || "Geral";
  const velocidadeKpi = useMemo(() => velocidadePorTipo?.find((v) => v.tipo_cliente === tipoKpi), [velocidadePorTipo, tipoKpi]);
  const velocidadeKpiAnterior = useMemo(() => velocidadeAnterior?.find((v) => v.tipo_cliente === tipoKpi), [velocidadeAnterior, tipoKpi]);
  const reaberturaKpi = useMemo(() => reaberturaPorTipo?.find((r) => r.tipo_cliente === tipoKpi), [reaberturaPorTipo, tipoKpi]);
  const reaberturaKpiAnterior = useMemo(() => reaberturaAnteriorPorTipo?.find((r) => r.tipo_cliente === tipoKpi), [reaberturaAnteriorPorTipo, tipoKpi]);
  const csatBoasPct = csatDist && csatDist.total > 0 ? (csatDist.boas / csatDist.total) * 100 : null;
  const csatBoasPctAnterior = csatDistAnterior && csatDistAnterior.total > 0 ? (csatDistAnterior.boas / csatDistAnterior.total) * 100 : null;

  // "Precisa de atenção": funil do CSAT e atendido e não resolvido (mesmas
  // funções e contas do relatório da RR, via resultadosSac).
  const { data: csatFunil } = useQuery({
    queryKey: ["csat-funil-canal", inicio, fim],
    queryFn: () => fetchCsatFunilCanal(inicio, fim),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const { data: atendido } = useQuery({
    queryKey: ["atendido-nao-resolvido", inicio, fim],
    queryFn: () => fetchAtendidoNaoResolvido(inicio, fim),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const { data: atendidoAnterior } = useQuery({
    queryKey: ["atendido-nao-resolvido", inicioAnterior, fimAnterior],
    queryFn: () => fetchAtendidoNaoResolvido(inicioAnterior, fimAnterior),
    enabled: waveDoisHabilitada && naDashboard,
  });
  const funilLinhas = useMemo(() => linhasFunil(csatFunil ?? [], []), [csatFunil]);
  const filtraAtendente = (lista: typeof atendido) =>
    (lista ?? []).filter((r) => atendenteNomes.length === 0 || atendenteNomes.includes(r.atendente));
  const atendidoResumo = useMemo(
    () => resumoAtendido(filtraAtendente(atendido), atendidoAnterior ? filtraAtendente(atendidoAnterior) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atendido, atendidoAnterior, atendenteNomes]
  );
  const atendidoFiltrado = atendidoResumo.porAtendente;

  const { data: csatRuins, isLoading: loadingCsatRuins } = useQuery({
    queryKey: ["csat-ruins", inicio, fim, atendenteNomes],
    queryFn: () => fetchCsatRuins(inicio, fim, atendenteNomesFiltro),
    enabled: ruinsAberto,
  });

  const { data: reaberturaCasos } = useQuery({
    queryKey: ["reabertura-casos", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchReaberturaCasos(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: isAdmin && !!reaberturaResumo && reaberturaResumo.total_reabertos > 0 && (subAba === "qualidade" || subAba === "pessoas"),
  });

  const { data: transferenciasResumo, isLoading: loadingTransferencias } = useQuery({
    queryKey: ["transferencias-resumo", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchTransferenciasResumo(inicio, fim, undefined, atendenteNomesFiltro, modoTempo, tipoClienteRpc),
    enabled: waveDoisHabilitada && (subAba === "fluxo" || subAba === "pessoas"),
  });

  const { data: transferenciasCasos } = useQuery({
    queryKey: ["transferencias-casos", inicio, fim, modoTempo, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchTransferenciasCasos(inicio, fim, undefined, modoTempo, atendenteNomesFiltro, tipoClienteRpc),
    enabled: isAdmin && !!transferenciasResumo && transferenciasResumo.total_transferidos > 0,
  });

  const { data: fcrRecontato, isLoading: loadingFcr } = useQuery({
    queryKey: ["fcr-recontato-resumo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchFcrRecontatoResumo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: waveDoisHabilitada && subAba === "qualidade",
  });

  const { data: recontatoCasos } = useQuery({
    queryKey: ["recontato-casos", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchRecontatoCasos(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: isAdmin && !!fcrRecontato && fcrRecontato.total_recontato > 0,
  });

  // "IA genérica" — achado de uma auditoria qualitativa externa do SAC
  // (leitura conversa por conversa): o bot responde com um pedido de mais
  // detalhes mesmo quando o cliente já mandou o contexto todo. Validado
  // contra este mesmo banco antes de virar aba (33,1% das conversas no
  // período testado — perto do achado externo de 35%).
  const { data: genericoResumo, isLoading: loadingGenerico } = useQuery({
    queryKey: ["resposta-generica-resumo", inicio, fim, atendenteNomes, tipoClienteFiltro],
    queryFn: () => fetchRespostaGenericaResumo(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc),
    enabled: aba === "generico",
  });
  const { data: genericoCasos } = useQuery({
    queryKey: ["resposta-generica-casos", inicio, fim, atendenteNomes, tipoClienteFiltro, genericoSoSemResposta, genericoPage],
    queryFn: () => fetchRespostaGenericaCasos(inicio, fim, undefined, atendenteNomesFiltro, tipoClienteRpc, genericoSoSemResposta, genericoPage, PAGE_SIZE),
    enabled: aba === "generico",
  });

  const { data: posseDetalheAtendimentos, isLoading: loadingPosseDetalhe } = useQuery({
    queryKey: ["atendimentos-por-atendente", inicio, fim, posseDetalhe, modoTempo, posseDetalheOrdenarPor, posseDetalheDirecao, posseDetalhePage, posseDetalheSoAbertos],
    queryFn: () => fetchAtendimentosComMetricas({
      inicio, fim, atendenteNomes: posseDetalhe ? [posseDetalhe] : undefined, page: posseDetalhePage, pageSize: PAGE_SIZE, modoTempo,
      ordenarPor: posseDetalheOrdenarPor, direcao: posseDetalheDirecao,
      status: posseDetalheSoAbertos ? "pending" : undefined,
    }),
    enabled: isAdmin && !!posseDetalhe,
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
    enabled: waveDoisHabilitada && naDashboard && subAba === "pessoas",
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
    const mapa = new Map<string, { minutos_posse: number; chamados: number }>();
    (posse ?? []).forEach((p) => mapa.set(p.atendente, p));
    return mapa;
  }, [posse]);

  const volumeDiaHoraGrid = useMemo(() => {
    const mapa = new Map<string, number>();
    (volumeDiaHora ?? []).forEach((v) => mapa.set(`${v.dia_semana}-${v.hora}`, v.chamados));
    return mapa;
  }, [volumeDiaHora]);
  const volumeDiaHoraMax = useMemo(
    () => Math.max(0, ...(volumeDiaHora ?? []).map((v) => v.chamados)),
    [volumeDiaHora]
  );

  const posseFiltrada = useMemo(
    () => (posse ?? []).filter((p) => atendenteNomes.length === 0 || atendenteNomes.includes(p.atendente)),
    [posse, atendenteNomes]
  );

  // Produtividade contextualizada na própria tabela de Ranking (não como
  // número isolado) — reaberturas/transferências por atendente, derivadas
  // dos casos já buscados pra Reabertura/Transferências.




  // Reaberturas e transferências por atendente, pra tabela de Produtividade
  // e posse (Pessoas). Vêm das listas de casos, que só admin acessa.
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
    enabled: isAdmin && aba === "atendimentos",
  });

  const [exportandoAtendimentos, setExportandoAtendimentos] = useState(false);

  async function exportarAtendimentosCsv() {
    setExportandoAtendimentos(true);
    try {
      const todas = await fetchTodosAtendimentosComMetricas(filtrosAtendimentos);
      exportAtendimentosToCsv(todas, `atendimentos-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExportandoAtendimentos(false);
    }
  }


  const totalPages = atendimentos ? Math.ceil(atendimentos.count / PAGE_SIZE) : 0;

  return (
    // reducedMotion="user": quem pediu "reduzir movimento" no sistema vê as
    // telas sem animação.
    <MotionConfig reducedMotion="user">
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
                tipoClienteFiltro || atendenteNomes.length > 0 || (aba === "atendimentos" && (canal || tipoCliente || motivo))
                  ? "border-forest-300 bg-forest-50 text-forest-700 dark:border-forest-500/40 dark:bg-forest-500/15 dark:text-forest-300"
                  : "border-sand-line bg-sand-surface text-ink/60 hover:border-sand-line-strong"
              )}
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
            {filtroAberto && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-72 space-y-3 overflow-hidden rounded-xl border border-sand-line bg-sand-surface p-3 shadow-float">
                <div className="space-y-2">
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
                    <p className="text-[11px] text-ink/40">Filtra o Dashboard inteiro (Ranking, Backlog, Posse, Reabertura, Transferências, FCR/Recontato). Velocidade já mostra todo mundo, segmentado por tipo — esse filtro não muda ela.</p>
                  )}
                </div>
                {aba === "ranking" ? (
                  <div className="border-t border-sand-line pt-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40">Tipo de cliente</p>
                    <select
                      value={tipoClienteFiltro}
                      onChange={(e) => setTipoClienteFiltro(e.target.value)}
                      className="h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm"
                    >
                      <option value="">Todos</option>
                      {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
                    </select>
                    <p className="mt-1.5 text-[11px] text-ink/40">
                      Filtra o Dashboard inteiro (Ranking, Backlog, Posse, Reabertura, Transferências, FCR/Recontato)
                      — exceto CSAT, Relógio de trabalho ativo e Velocidade (que já mostra todo mundo segmentado).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 border-t border-sand-line pt-3">
                    <select value={canal} onChange={(e) => { setCanal(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm">
                      <option value="">Todos os canais</option>
                      {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm">
                      <option value="">Todos os tipos de cliente</option>
                      {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
                    </select>
                    <div className="relative">
                      <input
                        value={motivo}
                        onChange={(e) => { setMotivo(e.target.value); setPage(0); }}
                        list="motivos-sugeridos"
                        placeholder="Filtrar por motivo/tópico..."
                        className="h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-2 text-sm outline-none focus:border-forest-500"
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
          {isAdmin && (
            <SegmentedControl
              options={[["ranking", "Dashboard"], ["atendimentos", "Atendimentos"], ["generico", "IA genérica"]] as const}
              value={aba}
              onChange={setAba}
            />
          )}
        </div>
      </div>

      {aba === "ranking" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SaudeKpi
              label="Chamados"
              indice={0}
              valor={fmtNum(contagem?.total_chamados)}
              delta={deltaPercentual(contagem?.total_chamados, contagemAnterior?.total_chamados, false)}
              contexto={contagem ? `em ${fmtNum(contagem.total_conversas)} conversas` : undefined}
            />
            <SaudeKpi
              label="Conversas resolvidas"
              indice={1}
              valor={fmtNum(reaberturaKpi?.total_resolvidos)}
              delta={deltaPercentual(reaberturaKpi?.total_resolvidos, reaberturaKpiAnterior?.total_resolvidos, false)}
              contexto={reaberturaKpi && contagem && contagem.total_conversas > 0 ? `${fmtPct1((reaberturaKpi.total_resolvidos / contagem.total_conversas) * 100)} das conversas do período` : undefined}
            />
            <SaudeKpi
              label="CSAT · avaliações boas"
              indice={2}
              valor={fmtPct1(csatBoasPct)}
              delta={deltaPontos(csatBoasPct, csatBoasPctAnterior, false)}
              contexto={csatDist ? `${fmtNum(csatDist.boas)} de ${fmtNum(csatDist.total)} avaliações (nota 4–5)` : undefined}
            />
            <SaudeKpi
              label="1ª resposta · mediana"
              indice={3}
              valor={formatDuration(velocidadeKpi?.tfr_p50_uteis_seg ?? null)}
              delta={deltaPercentual(velocidadeKpi?.tfr_p50_uteis_seg, velocidadeKpiAnterior?.tfr_p50_uteis_seg, true, (v) => formatDuration(v))}
              contexto="horas úteis, 1ª resposta humana"
            />
            <SaudeKpi
              label="Reabertura"
              indice={4}
              valor={fmtPct1(reaberturaKpi?.taxa_pct)}
              delta={deltaPontos(reaberturaKpi?.taxa_pct, reaberturaKpiAnterior?.taxa_pct, true)}
              contexto={reaberturaKpi ? `${fmtNum(reaberturaKpi.total_reabertos)} de ${fmtNum(reaberturaKpi.total_resolvidos)} conversas resolvidas` : undefined}
            />
          </div>
          {tipoClienteFiltro && (
            <p className="-mt-3 text-[11px] text-ink/40">CSAT não tem tipo de cliente (vem de outra tabela) — o indicador de CSAT mostra o time inteiro.</p>
          )}

          <PrecisaAtencao
            atendido={atendidoFiltrado}
            paradosPct={atendidoResumo.paradosPct}
            deltaAbertos={atendidoResumo.deltaAbertos}
            funil={funilLinhas}
            backlog={backlog ?? []}
            filtroAtivo={atendenteNomes.length > 0}
            onAbrirBacklog={isAdmin ? (faixa) => { setBacklogFaixaAberta(faixa); setBacklogPage(0); } : undefined}
            onAbrirAtendente={isAdmin ? (nome) => { setPosseDetalheSoAbertos(true); setPosseDetalhe(nome); setPosseDetalhePage(0); } : undefined}
          />

          <div className="flex flex-wrap gap-1 border-b border-sand-line" role="tablist" aria-label="Detalhe do Dashboard">
            {([["pessoas", "Pessoas"], ["velocidade", "Velocidade"], ["qualidade", "Qualidade"], ["fluxo", "Fluxo"]] as const).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={subAba === valor}
                onClick={() => setSubAba(valor)}
                className={cn(
                  "relative px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors",
                  subAba === valor ? "text-ink" : "text-ink/50 hover:text-ink"
                )}
              >
                {rotulo}
                {subAba === valor && (
                  <motion.span
                    layoutId="overview-subaba"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-forest-500"
                  />
                )}
              </button>
            ))}
          </div>

          {subAba === "pessoas" && (
            <motion.div
              key="pessoas"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
            {/* Layout do design Verdee (Claude Design, 2026-09-24): ranking
                enxuto à esquerda; bot e volume por pessoa à direita. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
              <Card className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink">Ranking de atendentes</h2>
                    <p className="mt-0.5 text-[12.5px] text-ink/50">Humanos por chamados no período · tempos em horas úteis</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExplicacaoVelocidadeAberta(true)}
                    aria-label="O que significam esses números"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sand-line-strong text-xs font-bold text-ink/50 transition hover:text-ink"
                  >
                    ?
                  </button>
                </div>
                {isLoading ? (
                  <p className="px-5 pb-5 text-sm text-ink/50">Carregando...</p>
                ) : !rankingOrdenado || rankingOrdenado.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-ink/50">Sem atendimentos neste período/filtro.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-sand-subtle text-[11px] uppercase tracking-wide text-ink/50">
                        <tr>
                          <th className="px-5 py-3 text-left font-semibold">Atendente</th>
                          <SortableHeader align="center" field="total_atendimentos" label="Chamados" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                          <SortableHeader align="center" field="tfr_medio" label="1ª resposta" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                          <SortableHeader align="center" field="tempo_resolucao_medio" label="Resolução" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                          <SortableHeader align="center" field="csat_medio" label="CSAT" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                          <SortableHeader align="center" field="total_avaliacoes" label="Avaliações" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                        </tr>
                      </thead>
                      <tbody>
                        {rankingOrdenado.map((r, i) => {
                          const iniciais = r.operator_nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
                          const clicavel = isAdmin && posseMap.has(r.operator_nome);
                          return (
                            <motion.tr
                              key={r.operator_email ?? r.operator_nome}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(i, 10) * 0.03 }}
                              onClick={clicavel ? () => { setPosseDetalheSoAbertos(false); setPosseDetalhe(r.operator_nome); setPosseDetalhePage(0); } : undefined}
                              className={cn("border-t border-sand-line text-center", clicavel && "cursor-pointer transition-colors hover:bg-sand-subtle")}
                            >
                              <td className="px-5 py-3 text-left">
                                <span className="flex items-center gap-2.5 font-semibold text-ink">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-[11px] font-bold text-forest-700 dark:bg-forest-500/15 dark:text-forest-300">
                                    {iniciais}
                                  </span>
                                  {r.operator_nome}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold tabular-nums text-ink">{r.total_atendimentos.toLocaleString("pt-BR")}</td>
                              <td className="px-4 py-3 tabular-nums text-ink/70">{tempoCurto(r.tfr_medio)}</td>
                              <td className="px-4 py-3 tabular-nums text-ink/70">{tempoCurto(r.tempo_resolucao_medio)}</td>
                              <td className={cn("px-4 py-3 font-semibold tabular-nums", r.csat_medio != null && r.csat_medio >= 4.5 ? "text-forest-600 dark:text-forest-300" : "text-ink")}>
                                {r.csat_medio != null ? r.csat_medio.toFixed(2).replace(".", ",") : "—"}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-ink/70">{r.total_avaliacoes}</td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <div className="flex flex-col gap-4">
                {iaEntry && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
                    onClick={isAdmin ? () => { setPosseDetalheSoAbertos(false); setPosseDetalhe("IA Greenn"); setPosseDetalhePage(0); } : undefined}
                    className={cn("flex flex-col gap-4 rounded-2xl bg-forest-900 p-5 text-white shadow-card", isAdmin && "cursor-pointer transition-transform hover:-translate-y-0.5")}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-500">
                        <Bot size={16} />
                      </span>
                      <span className="font-display text-[15px] font-bold">Bot (IA Greenn)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                      <div>
                        <p className="text-[11px] text-forest-300">Chamados</p>
                        <p className="font-display text-2xl font-bold tabular-nums">{iaEntry.total_atendimentos.toLocaleString("pt-BR")}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-forest-300">1ª resposta (mediana)</p>
                        <p className="font-display text-2xl font-bold tabular-nums">{tempoRespostaBot && tempoRespostaBot.amostras > 0 ? formatDuration(tempoRespostaBot.tempo_medio_seg) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-forest-300">CSAT</p>
                        <p className="font-display text-2xl font-bold tabular-nums">{iaEntry.csat_medio != null ? iaEntry.csat_medio.toFixed(2).replace(".", ",") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-forest-300">Avaliações</p>
                        <p className="font-display text-2xl font-bold tabular-nums">{iaEntry.total_avaliacoes}</p>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-forest-200">Separado do ranking: responde em segundos e atende boa parte do volume.</p>
                  </motion.div>
                )}

                {rankingHumano && rankingHumano.length > 0 && (
                  <Card className="p-5">
                    <p className="mb-3 font-display text-sm font-bold text-ink">Volume por pessoa</p>
                    <HorizontalBarChart
                      data={(() => {
                        const ordenado = [...rankingHumano].sort((a, b) => b.total_atendimentos - a.total_atendimentos).slice(0, 6);
                        const rotulos = nomesCurtosDisambiguados(ordenado.map((r) => r.operator_nome));
                        return ordenado.map((r, i) => ({ label: rotulos[i], value: r.total_atendimentos }));
                      })()}
                      getColorClass={() => "bg-forest-500"}
                      labelWidth={80}
                    />
                  </Card>
                )}
              </div>
            </div>


            {rankingOrdenado && rankingOrdenado.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink">Produtividade e posse</h2>
                    <p className="mt-0.5 text-[12.5px] text-ink/50">Volume de trabalho, tempo com o chamado e retrabalho por pessoa</p>
                  </div>
                  <details className="relative">
                    <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-sand-line-strong text-xs font-bold text-ink/50 transition hover:text-ink [&::-webkit-details-marker]:hidden">?</summary>
                    <div className="absolute right-0 top-8 z-20 w-80 rounded-xl border border-sand-line-strong bg-sand-surface p-3 text-xs leading-relaxed text-ink/60 shadow-float">
                      <p><b>Interações:</b> conversas em que a pessoa mandou mensagem no período, inclusive as que começaram antes.</p>
                      <p className="mt-1.5"><b>Posse:</b> tempo em que o chamado esteve atribuído à pessoa e aberto (trecho resolvido não conta). Por isso "chamados c/ posse" costuma ser menor que "chamados".</p>
                      <p className="mt-1.5"><b>Atend./hora:</b> chamados ÷ horas de posse. Leia junto com CSAT, 1ª resposta e reabertura, nunca sozinho.</p>
                      <p className="mt-1.5"><b>Reaberturas e transferências:</b> eventos no período atribuídos à pessoa{isAdmin ? "." : " — visíveis só pra admin."}</p>
                    </div>
                  </details>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sand-subtle text-[11px] uppercase tracking-wide text-ink/50">
                      <tr>
                        <th className="px-5 py-3 text-left font-semibold">Atendente</th>
                        <SortableHeader align="center" field="total_interacoes" label="Interações" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                        <SortableHeader align="center" field="total_mensagens" label="Mensagens" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                        <th className="px-4 py-3 font-semibold">Tempo de posse</th>
                        <th className="px-4 py-3 font-semibold">Chamados c/ posse</th>
                        <th className="px-4 py-3 font-semibold">Posse média</th>
                        <th className="px-4 py-3 font-semibold">Atend./hora</th>
                        <th className="px-4 py-3 font-semibold">Reaberturas</th>
                        <th className="px-4 py-3 font-semibold">Transferências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingOrdenado.map((r) => {
                        const p = posseMap.get(r.operator_nome);
                        const horasPosse = p ? p.minutos_posse / 60 : 0;
                        const atendPorHora = p && horasPosse > 0 ? r.total_atendimentos / horasPosse : null;
                        return (
                          <tr key={r.operator_email ?? r.operator_nome} className="border-t border-sand-line text-center">
                            <td className="px-5 py-3 text-left font-semibold text-ink">{r.operator_nome}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{r.total_interacoes.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{r.total_mensagens.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{p ? formatDuration(p.minutos_posse * 60) : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{p ? p.chamados.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{p && p.chamados > 0 ? tempoCurto(p.minutos_posse / p.chamados) : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{atendPorHora !== null ? atendPorHora.toFixed(1).replace(".", ",") : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{isAdmin ? reaberturaPorAtendenteMap.get(r.operator_nome) ?? 0 : "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-ink/70">{isAdmin ? transferenciasOrigemMap.get(r.operator_nome) ?? 0 : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            </motion.div>
          )}

          {subAba === "velocidade" && (
            <motion.div
              key="velocidade"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold text-ink">Velocidade</h2>
                <button
                  type="button"
                  onClick={() => setExplicacaoVelocidadeAberta(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
                >
                  <Info size={13} /> ver mais
                </button>
              </div>
              {loadingVelocidade ? (
                <p className="text-sm text-ink/50">Carregando...</p>
              ) : !velocidadeGeral ? (
                <Card className="p-4"><p className="text-sm text-ink/50">Sem chamados no período.</p></Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[velocidadeGeral, ...velocidadePorTipoReal].map((v: VelocidadePorTipoCliente) => {
                    const rb = reaberturaPorTipo?.find((r: ReaberturaPorTipoCliente) => r.tipo_cliente === v.tipo_cliente);
                    return (
                      <Card key={v.tipo_cliente} className="p-4">
                        <div className="flex items-baseline justify-between">
                          <p className="font-display text-sm font-semibold text-ink">{v.tipo_cliente}</p>
                          <p className="text-xs text-ink/50">{v.chamados.toLocaleString("pt-BR")} chamados</p>
                        </div>
                        <div className="mt-3 border-t border-sand-line pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">1ª resposta (mediana)</p>
                          <p
                            className="mt-0.5 font-display text-lg font-semibold text-ink"
                            title={`Média: ${formatDuration(v.tfr_media_uteis_seg)} útil / ${formatDuration(v.tfr_media_corridas_seg)} corrido`}
                          >
                            {formatDuration(v.tfr_p50_uteis_seg)}
                          </p>
                          <p className="text-xs text-ink/50">corrido: {formatDuration(v.tfr_p50_corridas_seg)}</p>
                        </div>
                        <div className="mt-3 border-t border-sand-line pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Resolução (mediana)</p>
                          <p
                            className="mt-0.5 font-display text-lg font-semibold text-ink"
                            title={`Média: ${formatDuration(v.ttr_media_uteis_seg)} útil / ${formatDuration(v.ttr_media_corridas_seg)} corrido`}
                          >
                            {formatDuration(v.ttr_p50_uteis_seg)}
                          </p>
                          <p className="text-xs text-ink/50">corrido: {formatDuration(v.ttr_p50_corridas_seg)}</p>
                        </div>
                        <div className="mt-3 border-t border-sand-line pt-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Reabertura</p>
                          {rb ? (
                            <p className="mt-0.5 text-sm text-ink/70">
                              <span className="font-semibold text-ink">{rb.taxa_pct?.toFixed(1) ?? "—"}%</span>
                              {" "}({rb.total_reabertos.toLocaleString("pt-BR")} de {rb.total_resolvidos.toLocaleString("pt-BR")} conversas resolvidas)
                            </p>
                          ) : (
                            <p className="mt-0.5 text-sm text-ink/40">—</p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-xs text-ink/40">
                Mediana (P50) como número principal — metade dos chamados fica em até esse tempo, é o "caso típico" e sofre
                bem menos com outliers do que a média (passe o mouse pra ver a média). "Geral" é o time inteiro, sem filtrar
                por tipo. Tempo sempre desconta feriado; "Sem tipo" é quem não tem tag de segmento capturada pela Crisp ainda.
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-[15px] font-bold text-ink">Relógios do atendimento</h2>
                <button
                  type="button"
                  onClick={() => setExplicacaoRelogiosAberta(true)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-ink/50 hover:bg-sand-bg hover:text-ink"
                >
                  <Info size={13} /> ver mais
                </button>
              </div>
              <Card className="p-4">
                <div className="grid gap-4 border-b border-sand-line pb-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio do cliente</p>
                    {loadingVelocidade ? (
                      <p className="mt-1 text-sm text-ink/50">Carregando...</p>
                    ) : !velocidadeGeral ? (
                      <p className="mt-1 text-sm text-ink/50">Sem amostras.</p>
                    ) : (
                      <>
                        <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(velocidadeGeral.ttr_p50_uteis_seg)}</p>
                        <p className="mt-1 text-[11px] text-ink/40">Mediana de Resolução — mesmo valor de Velocidade (card "Geral"), do ponto de vista de quem esperou</p>
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

            </motion.div>
          )}

          {subAba === "qualidade" && (
            <motion.div
              key="qualidade"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
            <div>
              <SecaoHead
                titulo="CSAT"
                subtitulo="Avaliações recebidas no período. Clique em Ruins pra ler os comentários."
                ajuda={<p>Boa = nota 4 ou 5. Ruim = nota 1 a 3 (não existe mais faixa neutra). Conta pela data da avaliação.</p>}
              />
              {!csatDist || csatDist.total === 0 ? (
                <Card className="p-4"><p className="text-sm text-ink/50">Nenhuma avaliação no período.</p></Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Boas (4–5)</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold tabular-nums text-forest-600 dark:text-forest-300">{fmtNum(csatDist.boas)}</p>
                    <p className="text-xs text-ink/50">{fmtPct1(csatBoasPct)} das avaliações</p>
                  </Card>
                  <Card
                    role={isAdmin ? "button" : undefined}
                    tabIndex={isAdmin ? 0 : undefined}
                    onClick={isAdmin ? () => setRuinsAberto(true) : undefined}
                    onKeyDown={isAdmin ? (e) => { if (e.key === "Enter") setRuinsAberto(true); } : undefined}
                    className={cn("p-4", isAdmin && "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-card-hover")}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Ruins (1–3)</p>
                    <p className="mt-1 font-display text-kpi-lg font-bold tabular-nums text-rust-500">{fmtNum(csatDist.ruins)}</p>
                    {isAdmin && <p className="text-xs font-semibold text-forest-700 dark:text-forest-300">Ver comentários e chamados →</p>}
                  </Card>
                </div>
              )}
            </div>

            <div>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Reabertura</h2>
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
                      <p className="mt-1 text-[11px] text-ink/40">de {reaberturaResumo.total_resolvidos.toLocaleString("pt-BR")} conversas resolvidas no período</p>
                    </Card>
                    <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40" title="Conversas que o cliente reabriu pelo menos uma vez (resposta à pesquisa de CSAT não conta). A taxa divide isso pelas conversas resolvidas ao menos uma vez — mesma unidade nos dois lados.">Conversas reabertas</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{reaberturaResumo.total_reabertos}</p>
                    </Card>
                    <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Total de eventos de reabertura</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{reaberturaResumo.total_eventos}</p>
                      <p className="mt-1 text-[11px] text-ink/40">uma conversa pode reabrir mais de uma vez</p>
                    </Card>
                  </div>

                  {reaberturaResumo.total_reabertos > 0 && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Card className="p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Principais motivos</p>
                        <HorizontalBarChart data={reaberturaPorMotivo} getColorClass={() => "bg-forest-500"} labelWidth={160} />
                      </Card>
                      <Card className="p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Por atendente</p>
                        <HorizontalBarChart data={reaberturaPorAtendente} getColorClass={() => "bg-forest-500"} labelWidth={140} />
                      </Card>
                    </div>
                  )}

                  {reaberturaCasos && reaberturaCasos.length > 0 && (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <select
                          value={reaberturaFiltroAtendente}
                          onChange={(e) => { setReaberturaFiltroAtendente(e.target.value); setMostrarTodasReaberturas(false); }}
                          className="h-8 rounded-lg border border-sand-line bg-sand-surface px-2 text-xs"
                        >
                          <option value="">Todos os atendentes</option>
                          {reaberturaAtendentesDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select
                          value={reaberturaFiltroReaberto}
                          onChange={(e) => { setReaberturaFiltroReaberto(e.target.value); setMostrarTodasReaberturas(false); }}
                          className="h-8 rounded-lg border border-sand-line bg-sand-surface px-2 text-xs"
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
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">FCR e Recontato</h2>
              {loadingFcr ? (
                <p className="text-sm text-ink/50">Carregando...</p>
              ) : !fcrRecontato || fcrRecontato.total_elegiveis === 0 ? (
                <Card className="p-4"><p className="text-sm text-ink/50">Nenhuma conversa elegível no período (precisa estar resolvida, com cliente e motivo identificados).</p></Card>
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
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Conversas elegíveis</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{fcrRecontato.total_elegiveis}</p>
                      <p className="mt-1 text-[11px] text-ink/40">resolvidos, com cliente e motivo identificados</p>
                    </Card>
                  </div>

                  {recontatoPorMotivo.length > 0 && (
                    <Card className="mt-4 p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Motivos com mais recontato</p>
                      <HorizontalBarChart data={recontatoPorMotivo} getColorClass={() => "bg-forest-500"} labelWidth={180} />
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
                    Conversa sem cliente identificado (people_id) ou sem tópico não entra na conta — não dá pra saber se
                    ele voltou. Separado de Reabertura: aqui é o cliente abrindo uma conversa <em>nova</em>, não reabrindo
                    a mesma.
                  </p>
                </>
              )}
            </div>

            </motion.div>
          )}

          {subAba === "fluxo" && (
            <motion.div
              key="fluxo"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-8"
            >
            <div>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Transferências</h2>
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
                      <p className="text-xs font-medium uppercase tracking-wide text-ink/40" title="Conta CONVERSAS que trocaram de atendente pelo menos uma vez — não ponderado por reopened_count igual 'chamados atendidos' ao lado, porque transferência já é em si uma transição, não uma contagem de coisas que existem.">Conversas transferidas</p>
                      <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{transferenciasResumo.total_transferidos}</p>
                      <p className="mt-1 text-[11px] text-ink/40">{transferenciasResumo.total_eventos} eventos (uma conversa pode trocar de mão mais de uma vez)</p>
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
                        <HorizontalBarChart data={transferenciasPorOrigem} getColorClass={() => "bg-forest-500"} labelWidth={140} />
                      </Card>
                      <Card className="p-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Destino (quem recebeu)</p>
                        <HorizontalBarChart data={transferenciasPorDestino} getColorClass={() => "bg-forest-500"} labelWidth={140} />
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
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Motivo de contato</h2>
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
                      getColorClass={() => "bg-forest-500"}
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
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Volume por dia e horário</h2>
              {loadingVolumeDiaHora ? (
                <p className="text-sm text-ink/50">Carregando...</p>
              ) : !volumeDiaHora || volumeDiaHora.length === 0 ? (
                <Card className="p-4"><p className="text-sm text-ink/50">Sem chamados no período.</p></Card>
              ) : (
                <Card className="overflow-x-auto p-4">
                  <table className="border-separate border-spacing-1 text-center text-[11px]">
                    <thead>
                      <tr>
                        <th className="px-1 text-left font-medium text-ink/40">Dia \ Hora</th>
                        {HORAS_DIA.map((h) => (
                          <th key={h} className="px-0.5 font-medium text-ink/40">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DIAS_SEMANA.map((nomeDia, dow) => (
                        <tr key={dow}>
                          <td className="px-1 text-left font-medium text-ink/60">{nomeDia}</td>
                          {HORAS_DIA.map((h) => {
                            const v = volumeDiaHoraGrid.get(`${dow}-${h}`) ?? 0;
                            const intensidade = volumeDiaHoraMax > 0 ? v / volumeDiaHoraMax : 0;
                            return (
                              <td
                                key={h}
                                title={`${nomeDia}, ${h}h: ${v} chamados`}
                                className="h-6 w-6 rounded text-ink/70"
                                style={{ backgroundColor: `rgba(2, 132, 199, ${(0.06 + intensidade * 0.85).toFixed(2)})` }}
                              >
                                {v > 0 ? v : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-ink/40">
                    Chamados por dia da semana × hora de início (horário de Brasília), somados no período inteiro selecionado —
                    ajuda a ver o padrão de pico independente de quantas semanas o filtro cobrir. Mesma definição de "chamados"
                    do resto da página (1 + reaberturas).
                  </p>
                </Card>
              )}
            </div>

            </motion.div>
          )}

          {explicacaoVelocidadeAberta && (
            <Dialog onClose={() => setExplicacaoVelocidadeAberta(false)} className="max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">O que significam esses números?</h3>
                <button type="button" onClick={() => setExplicacaoVelocidadeAberta(false)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3 text-sm text-ink/70">
                <p><span className="font-semibold text-ink">1ª resposta (TFR)</span> — tempo até a 1ª resposta humana (bot não conta).</p>
                <p><span className="font-semibold text-ink">Resolução (TTR)</span> — tempo até o chamado ser marcado como resolvido (última resolução, se reabriu mais de uma vez).</p>
                <p><span className="font-semibold text-ink">Mediana (P50)</span> — metade dos chamados foi respondida/resolvida em até esse tempo. É o "caso típico", bem menos sensível a outliers do que a média — passe o mouse no número pra ver a média.</p>
                <p><span className="font-semibold text-ink">Útil vs. corrido</span> — útil desconta fora do expediente cadastrado do time (e feriado); corrido é relógio cru, sem desconto.</p>
                <p><span className="font-semibold text-ink">Reabertura</span> — % de chamados resolvidos nesse segmento que o cliente reabriu pelo menos uma vez.</p>
                <p><span className="font-semibold text-ink">Chamados</span> — conta 1 + reaberturas por conversa. "Geral" mostra o time inteiro; os outros cards mostram só quem tem aquela tag de tipo de cliente.</p>
              </div>
            </Dialog>
          )}

          {backlogFaixaAberta && (
            <Dialog onClose={() => setBacklogFaixaAberta(null)} className="max-w-6xl">
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

          {explicacaoRelogiosAberta && (
            <Dialog onClose={() => setExplicacaoRelogiosAberta(false)} className="max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-sm font-semibold text-ink">O que significam esses relógios?</h3>
                <button type="button" onClick={() => setExplicacaoRelogiosAberta(false)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3 text-sm text-ink/70">
                <p>
                  <span className="font-semibold text-ink">Relógio do cliente</span> — é o mesmo TTR médio do card
                  "Velocidade" acima (tempo do início do chamado até a resolução), só que apresentado do ponto de vista
                  de quem esperou: em vez de "quanto tempo o time levou pra resolver", é "quanto tempo o cliente ficou
                  esperando até o problema dele acabar".
                </p>
                <p>
                  <span className="font-semibold text-ink">Relógio de espera do cliente</span> — tempo médio entre o
                  cliente mandar uma mensagem e um atendente <em>humano</em> responder (o bot não conta como resposta
                  aqui). Mede só as janelas de silêncio depois de o cliente falar, não o chamado inteiro. Costuma ter
                  poucas amostras porque a maioria das mensagens é respondida primeiro pelo bot (triagem automática) —
                  só entra na conta quando a próxima resposta é mesmo de um humano. Com poucas amostras no período
                  (ex: conversas de teste, onde quem "espera" já está com a tela aberta), o valor pode ficar bem mais
                  baixo do que o normal — não é erro, é reflexo direto de quem gerou aquela amostra.
                </p>
                <p>
                  <span className="font-semibold text-ink">Relógio de trabalho ativo</span> — não é sobre chamados, é
                  sobre agenda: soma quantas horas do período tiveram pelo menos 1 atendente com horário cadastrado
                  (união, não soma individual — 2 pessoas na mesma hora contam 1h, não 2h). Por isso não respeita o
                  filtro de tipo de cliente (não existe "expediente do tipo Produtor") nem tem um modo "horas
                  corridas" (é sempre sobre o calendário cadastrado). É capacidade nominal, não presença real — o Crisp
                  não expõe se o atendente estava mesmo ativo na tela.
                </p>
              </div>
            </Dialog>
          )}

          {posseDetalhe && (
            <Dialog onClose={() => setPosseDetalhe(null)} className="max-w-6xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-ink">{posseDetalheSoAbertos ? "Conversas abertas de" : "Conversas de"} {posseDetalhe}</h3>
                  <p
                    className="text-xs text-ink/40"
                    title="'Chamados' no Ranking soma 1 + reaberturas de cada conversa; aqui é 1 linha por conversa (independente de quantas vezes reabriu) — por isso os dois números podem divergir."
                  >
                    1 linha por conversa — pode divergir do total de "chamados" do Ranking se houver reabertura
                  </p>
                </div>
                <button type="button" onClick={() => setPosseDetalhe(null)} className="text-ink/40 hover:text-ink">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 max-h-[70vh] overflow-y-auto">
                {loadingPosseDetalhe ? (
                  <p className="text-sm text-ink/50">Carregando...</p>
                ) : !posseDetalheAtendimentos || posseDetalheAtendimentos.rows.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhuma conversa encontrada no período.</p>
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
                            className="cursor-pointer border-t border-sand-line text-center align-top transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-sand-surface hover:shadow-card-hover"
                          >
                            <td className="px-3 py-2 text-left">
                              <p className="font-medium text-ink">
                                {c.cliente_nome ?? "—"}
                                {c.reopened_count > 0 && (
                                  <span
                                    className="ml-1 text-amber-600"
                                    title={`Reabriu ${c.reopened_count}x depois de já ter sido marcado resolvido`}
                                  >
                                    🔄
                                  </span>
                                )}
                              </p>
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
                            <td className="px-3 py-2">
                              {c.resolved_at ? (
                                <span className="text-ink/70">{formatDuration(c.tempo_resolucao_seg)}</span>
                              ) : (
                                <span className="text-amber-600" title="Ainda aberto — tempo decorrido até agora, não é final.">
                                  {formatDuration(c.tempo_aberto_seg)}*
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                                  {c.status ? statusLabel[c.status] ?? c.status : "—"}
                                </Badge>
                                {c.status === "resolved" && (
                                  c.avaliado ? (
                                    <span title="Avaliado — existe CSAT vinculado direto a esse chamado" className="text-forest-600">
                                      <Star size={14} className="fill-current" />
                                    </span>
                                  ) : (
                                    <span title="Não avaliado (ou avaliação anterior a 26/08/2026, sem vínculo direto)" className="text-ink/30">
                                      <StarOff size={14} />
                                    </span>
                                  )
                                )}
                              </div>
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
              {posseDetalheAtendimentos && posseDetalheAtendimentos.count > 0 && (
                <div className="mt-3 flex items-center justify-between text-sm text-ink/60">
                  <span title="Conversas = 1 por chamado do Crisp. Chamados pondera reabertura (1 + reopened_count) — os dois divergem quando o período/atendente teve chamado reaberto.">
                    {posseDetalheAtendimentos.count} conversas
                    {posseDetalheAtendimentos.totalChamados !== posseDetalheAtendimentos.count &&
                      ` (${posseDetalheAtendimentos.totalChamados} chamados, com reabertura)`}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={posseDetalhePage === 0} onClick={() => setPosseDetalhePage((p) => p - 1)}>Anterior</Button>
                    <span className="flex items-center px-2 text-xs">
                      Página {posseDetalhePage + 1} de {Math.max(Math.ceil(posseDetalheAtendimentos.count / PAGE_SIZE), 1)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={(posseDetalhePage + 1) * PAGE_SIZE >= posseDetalheAtendimentos.count}
                      onClick={() => setPosseDetalhePage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </Dialog>
          )}
          {detalhe && <AtendimentoDetalheDialog atendimento={detalhe} onClose={() => setDetalhe(null)} />}
          {isAdmin && ruinsAberto && (
            <CsatRuinsDialog avaliacoes={csatRuins} carregando={loadingCsatRuins} onClose={() => setRuinsAberto(false)} onAbrirDetalhe={setCsatDetalhe} />
          )}
          {csatDetalhe && <CsatDetalheDialog registro={csatDetalhe} onClose={() => setCsatDetalhe(null)} />}
        </>
      ) : aba === "atendimentos" ? (
        <>
          <Card className="flex items-center gap-2 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(0); }}
                placeholder="Buscar por nome ou email do cliente..."
                className="h-9 w-full rounded-lg border border-sand-line bg-sand-surface pl-8 pr-2 text-sm outline-none focus:border-forest-500"
              />
            </div>
            <Button variant="secondary" size="sm" onClick={exportarAtendimentosCsv} disabled={exportandoAtendimentos}>
              <Download size={14} /> {exportandoAtendimentos ? "Exportando..." : "Exportar CSV"}
            </Button>
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
                            "cursor-pointer border-t border-sand-line text-center align-top transition-all hover:relative hover:z-10 hover:scale-[1.01] hover:bg-sand-surface hover:shadow-card-hover",
                            invalido && "bg-rust-500/5"
                          )}
                        >
                          <td className="truncate px-4 py-3 text-left">
                            <p className="truncate font-medium text-ink">
                              {c.cliente_nome ?? "—"}
                              {c.reopened_count > 0 && (
                                <span
                                  className="ml-1 text-amber-600"
                                  title={`Reabriu ${c.reopened_count}x depois de já ter sido marcado resolvido`}
                                >
                                  🔄
                                </span>
                              )}
                            </p>
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
                          <td className="hidden px-4 py-3 lg:table-cell">
                            {c.resolved_at ? (
                              <span className="text-ink/70">{formatDuration(c.tempo_resolucao_seg)}</span>
                            ) : (
                              <span className="text-amber-600" title="Ainda aberto — tempo decorrido até agora, não é final.">
                                {formatDuration(c.tempo_aberto_seg)}*
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 text-ink/70 xl:table-cell">{formatDuration(c.tempo_ativo_seg)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                                {c.status ? statusLabel[c.status] ?? c.status : "—"}
                              </Badge>
                              {c.status === "resolved" && (
                                c.avaliado ? (
                                  <span title="Avaliado — existe CSAT vinculado direto a esse chamado" className="text-forest-600">
                                    <Star size={14} className="fill-current" />
                                  </span>
                                ) : (
                                  <span title="Não avaliado (ou avaliação anterior a 26/08/2026, sem vínculo direto)" className="text-ink/30">
                                    <StarOff size={14} />
                                  </span>
                                )
                              )}
                            </div>
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
              <p className="text-xs text-ink/40">
                <span className="text-amber-600">*</span> chamado ainda aberto — valor em{" "}
                <span className="text-amber-600">âmbar</span> é tempo decorrido até agora, não final (muda a cada consulta).
              </p>
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
      ) : (
        <>
          <p className="text-xs text-ink/40">
            Achado de uma auditoria qualitativa externa do SAC (leitura de conversa por conversa): o bot às vezes responde
            com um pedido genérico de mais detalhes mesmo quando o cliente já mandou todo o contexto (ex: e-mail com
            fatura). Aqui embaixo é a mesma medição, ao vivo, sobre o nosso banco.
          </p>
          {loadingGenerico ? (
            <CardSkeleton />
          ) : !genericoResumo || genericoResumo.total_conversas === 0 ? (
            <Card className="p-4"><p className="text-sm text-ink/50">Nenhuma conversa no período.</p></Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Resposta genérica da IA</p>
                  <p className={cn("mt-1 font-display text-kpi-lg font-bold", corTextoSla(100 - (genericoResumo.taxa_pct ?? 0)))}>
                    {genericoResumo.taxa_pct?.toFixed(1) ?? "0.0"}%
                  </p>
                  <p className="mt-1 text-[11px] text-ink/40">{genericoResumo.total_com_generico} de {genericoResumo.total_conversas} conversas</p>
                </Card>
                <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Sem resposta depois</p>
                  <p className="mt-1 font-display text-kpi-lg font-bold text-rust-500">{genericoResumo.generico_sem_resposta_depois}</p>
                  <p className="mt-1 text-[11px] text-ink/40">a conversa não recebeu mais nada de conteúdo depois do genérico</p>
                </Card>
                <Card className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Conversas totais no período</p>
                  <p className="mt-1 font-display text-kpi-lg font-bold text-ink">{genericoResumo.total_conversas}</p>
                </Card>
              </div>

              <label className="mt-4 flex w-fit items-center gap-2 text-sm text-ink/70">
                <input
                  type="checkbox"
                  checked={genericoSoSemResposta}
                  onChange={(e) => { setGenericoSoSemResposta(e.target.checked); setGenericoPage(0); }}
                  className="h-3.5 w-3.5 rounded border-sand-line"
                />
                Mostrar só as que ficaram sem resposta depois
              </label>

              {!genericoCasos || genericoCasos.rows.length === 0 ? (
                <Card className="mt-2 p-4"><p className="text-sm text-ink/50">Nenhum caso com esse filtro.</p></Card>
              ) : (
                <Card className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sand-bg text-center text-xs uppercase tracking-wide text-ink/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Atendente</th>
                        <th className="px-4 py-3 font-medium">Canal</th>
                        <th className="px-4 py-3 font-medium">Tópico</th>
                        <th className="px-4 py-3 font-medium">Quando</th>
                        <th className="px-4 py-3 font-medium">Sem resposta depois</th>
                        <th className="px-4 py-3 font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genericoCasos.rows.map((c) => (
                        <tr key={c.crisp_id} className="border-t border-sand-line text-center align-top">
                          <td className="px-4 py-3 text-left text-ink">{c.cliente_nome ?? "—"}</td>
                          <td className="px-4 py-3 text-ink/70">{c.atendente ?? "—"}</td>
                          <td className="px-4 py-3 text-ink/70">{c.canal ?? "—"}</td>
                          <td className="px-4 py-3 text-ink/70">{c.topico ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.primeira_generica_at).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3">
                            {c.sem_resposta_depois
                              ? <Badge tone="danger">Sim</Badge>
                              : <Badge tone="neutral">Não</Badge>}
                          </td>
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

              {genericoCasos && genericoCasos.count > 0 && (
                <div className="flex items-center justify-between text-sm text-ink/60">
                  <span>{genericoCasos.count} conversas</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={genericoPage === 0} onClick={() => setGenericoPage((p) => p - 1)}>Anterior</Button>
                    <span className="flex items-center px-2 text-xs">
                      Página {genericoPage + 1} de {Math.max(Math.ceil(genericoCasos.count / PAGE_SIZE), 1)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={(genericoPage + 1) * PAGE_SIZE >= genericoCasos.count}
                      onClick={() => setGenericoPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
    </MotionConfig>
  );
}
