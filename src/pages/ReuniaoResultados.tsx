import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Download, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCsatForUser,
  fetchRRHistory,
  insertRRHistory,
  updateRRHistory,
  deleteRRHistory,
  fetchMinhasConversasMetricas,
  fetchDashboardAtendimentoSummary,
  fetchAtendentePerformance,
  fetchContagemPeriodo,
  fetchTfrTtrPercentis,
  fetchMetricasPorTipoCliente,
  fetchCsatDistribuicao,
  fetchReaberturaResumo,
  fetchTransferenciasResumo,
  fetchFcrRecontatoResumo,
  type AtendentePerformanceRow,
} from "@/services/api";
import { formatDuration } from "@/lib/formatDuration";
import { exportRRHistoricoToPdf, exportRRUnicaToPdf } from "@/lib/exportPdf";
import type { ResultadosSacData } from "@/lib/resultadosSac";
import { RelatorioResultadosSac } from "@/components/RelatorioResultadosSac";

const NOME_BOT = "IA Greenn";
import type { DbRRHistory } from "@/types/database";

type Granularidade = "mensal" | "semanal";

function media(vals: (number | null)[]) {
  const validos = vals.filter((v): v is number => v !== null);
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Segunda-feira da semana de referência (semana de trabalho do SAC: seg–dom).
function mondayOf(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = date.getDay();
  date.setDate(date.getDate() + (dia === 0 ? -6 : 1 - dia));
  return date;
}

function limitesDoMes(periodoId: string) {
  const [ano, mes] = periodoId.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0, 23, 59, 59, 999);
  return { inicio, fim };
}

function limitesDaSemana(periodoId: string) {
  const [ano, mes, dia] = periodoId.split("-").map(Number);
  const inicio = new Date(ano, mes - 1, dia);
  const fim = new Date(ano, mes - 1, dia + 6, 23, 59, 59, 999);
  return { inicio, fim };
}

function limitesDoPeriodo(granularidade: Granularidade, periodoId: string) {
  return granularidade === "mensal" ? limitesDoMes(periodoId) : limitesDaSemana(periodoId);
}

function periodoAnteriorId(granularidade: Granularidade, periodoId: string) {
  if (granularidade === "mensal") {
    const [ano, mes] = periodoId.split("-").map(Number);
    const d = new Date(ano, mes - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const [ano, mes, dia] = periodoId.split("-").map(Number);
  return toISODate(new Date(ano, mes - 1, dia - 7));
}

function ultimosPeriodos(granularidade: Granularidade, n: number) {
  if (granularidade === "mensal") {
    const hoje = new Date();
    return Array.from({ length: n }).map((_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { id, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }
  const segundaAtual = mondayOf(new Date());
  return Array.from({ length: n }).map((_, i) => {
    const seg = new Date(segundaAtual);
    seg.setDate(seg.getDate() - i * 7);
    const dom = new Date(seg);
    dom.setDate(dom.getDate() + 6);
    const id = toISODate(seg);
    const label = `${String(seg.getDate()).padStart(2, "0")}/${String(seg.getMonth() + 1).padStart(2, "0")} a ${String(dom.getDate()).padStart(2, "0")}/${String(dom.getMonth() + 1).padStart(2, "0")}`;
    return { id, label };
  });
}

// Mesmo formato de label de ultimosPeriodos(), mas pra um par inicio/fim
// qualquer — precisa funcionar pro período anterior também, que pode cair
// fora da janela dos 6 períodos listados no dropdown.
function labelDoPeriodo(granularidade: Granularidade, inicio: Date, fim: Date): string {
  if (granularidade === "mensal") {
    const label = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(inicio)} a ${fmt(fim)}`;
}

function agregarPorPeriodo(csat: { data_hora: string; nota: number | null }[], inicio: Date, fim: Date) {
  const rows = csat.filter((c) => {
    const d = new Date(c.data_hora);
    return d >= inicio && d <= fim && c.nota !== null;
  });
  const mediaNota = rows.length ? rows.reduce((acc, r) => acc + (r.nota ?? 0), 0) / rows.length : 0;
  return { media: mediaNota, total: rows.length };
}

const rrSchema = z.object({
  aprendizados: z.string().min(1, "Descreva os aprendizados do período"),
  dificuldades: z.string().min(1, "Descreva as dificuldades enfrentadas"),
  planoDeAcao: z.string().optional(),
  objetivos: z.string().optional(),
});

const CAMPOS_RR = [
  ["aprendizados", "Aprendizados"],
  ["dificuldades", "Dificuldades"],
  ["planoDeAcao", "Plano de ação (opcional)"],
  ["objetivos", "Objetivos para o próximo período (opcional)"],
] as const;

type RRForm = z.infer<typeof rrSchema>;

export default function ReuniaoResultados() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [granularidade, setGranularidade] = useState<Granularidade>("mensal");
  const periodos = useMemo(() => ultimosPeriodos(granularidade, 6), [granularidade]);
  const [periodo, setPeriodo] = useState(periodos[0].id);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvarErro, setSalvarErro] = useState<string | null>(null);

  function mudarGranularidade(g: Granularidade) {
    setGranularidade(g);
    setPeriodo(ultimosPeriodos(g, 6)[0].id);
    setSalvo(false);
  }

  const { data: csat, isLoading: loadingCsat } = useQuery({
    queryKey: ["csat", user?.id],
    queryFn: () => fetchCsatForUser(user!.email),
    enabled: Boolean(user?.id),
  });

  const { data: historico } = useQuery({
    queryKey: ["rr-history", user?.id],
    queryFn: () => fetchRRHistory(user!.id),
    enabled: Boolean(user?.id),
  });

  const anteriorId = useMemo(() => periodoAnteriorId(granularidade, periodo), [granularidade, periodo]);
  const { inicio: inicioPeriodo, fim: fimPeriodo } = useMemo(
    () => limitesDoPeriodo(granularidade, periodo),
    [granularidade, periodo]
  );
  const { inicio: inicioPeriodoAnterior, fim: fimPeriodoAnterior } = useMemo(
    () => limitesDoPeriodo(granularidade, anteriorId),
    [granularidade, anteriorId]
  );

  const atual = useMemo(() => agregarPorPeriodo(csat ?? [], inicioPeriodo, fimPeriodo), [csat, inicioPeriodo, fimPeriodo]);
  const anterior = useMemo(
    () => agregarPorPeriodo(csat ?? [], inicioPeriodoAnterior, fimPeriodoAnterior),
    [csat, inicioPeriodoAnterior, fimPeriodoAnterior]
  );

  const csatDelta = anterior.media ? ((atual.media - anterior.media) / anterior.media) * 100 : 0;
  const atendimentosDelta = anterior.total
    ? ((atual.total - anterior.total) / anterior.total) * 100
    : 0;

  const { data: conversas, isLoading: loadingConversas } = useQuery({
    queryKey: ["minhas-conversas-metricas", user?.email, granularidade, periodo],
    queryFn: () => fetchMinhasConversasMetricas(inicioPeriodo, fimPeriodo),
    enabled: Boolean(user?.email),
  });
  const { data: conversasAnterior } = useQuery({
    queryKey: ["minhas-conversas-metricas", user?.email, granularidade, anteriorId],
    queryFn: () => fetchMinhasConversasMetricas(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: Boolean(user?.email),
  });

  const tempoResolucaoPessoalSeg = useMemo(
    () => media((conversas ?? []).map((c) => c.tempo_resolucao_seg)),
    [conversas]
  );
  const tempoResolucaoPessoalAnteriorSeg = useMemo(
    () => media((conversasAnterior ?? []).map((c) => c.tempo_resolucao_seg)),
    [conversasAnterior]
  );

  // Admin usa essa tela pra levar o resultado do TIME pra reunião, não o
  // próprio (que geralmente é 0 — admin não atende ticket em nome próprio).
  const { data: teamSummary, isLoading: loadingTeamSummary } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchDashboardAtendimentoSummary(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: teamSummaryAnterior } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchDashboardAtendimentoSummary(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const csatValor = isAdmin ? teamSummary?.csat_medio ?? 0 : atual.media;
  const csatDeltaValor = isAdmin
    ? teamSummaryAnterior?.csat_medio
      ? ((csatValor - teamSummaryAnterior.csat_medio) / teamSummaryAnterior.csat_medio) * 100
      : 0
    : csatDelta;
  const atendimentosValor = isAdmin ? teamSummary?.total_conversas ?? 0 : atual.total;
  const atendimentosDeltaValor = isAdmin
    ? teamSummaryAnterior?.total_conversas
      ? ((atendimentosValor - teamSummaryAnterior.total_conversas) / teamSummaryAnterior.total_conversas) * 100
      : 0
    : atendimentosDelta;
  const carregandoPrincipais = isAdmin ? loadingTeamSummary : loadingCsat;

  const tempoResolucaoSeg = isAdmin
    ? (teamSummary?.tempo_resolucao_medio_min ?? null) !== null
      ? teamSummary!.tempo_resolucao_medio_min! * 60
      : null
    : tempoResolucaoPessoalSeg;
  const tempoResolucaoAnteriorSeg = isAdmin
    ? (teamSummaryAnterior?.tempo_resolucao_medio_min ?? null) !== null
      ? teamSummaryAnterior!.tempo_resolucao_medio_min! * 60
      : null
    : tempoResolucaoPessoalAnteriorSeg;
  const tempoResolucaoDelta =
    tempoResolucaoSeg !== null && tempoResolucaoAnteriorSeg
      ? ((tempoResolucaoSeg - tempoResolucaoAnteriorSeg) / tempoResolucaoAnteriorSeg) * 100
      : undefined;

  // Detalhamento por atendente (chamados/avaliações x período anterior) —
  // usa a mesma janela (mensal/semanal) selecionada no header da página.
  const { data: perfAtual, isLoading: loadingPerfAtual } = useQuery({
    queryKey: ["atendente-performance", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchAtendentePerformance(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: perfAnterior } = useQuery({
    queryKey: ["atendente-performance", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchAtendentePerformance(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const perfComparativo = useMemo(() => {
    const anteriorPorNome = new Map<string, AtendentePerformanceRow>();
    (perfAnterior ?? []).forEach((r) => anteriorPorNome.set(r.operator_nome, r));
    return (perfAtual ?? []).map((r) => {
      const ant = anteriorPorNome.get(r.operator_nome);
      const deltaChamados = ant?.total_atendimentos
        ? ((r.total_atendimentos - ant.total_atendimentos) / ant.total_atendimentos) * 100
        : undefined;
      const deltaAvaliacoes = ant?.total_avaliacoes
        ? ((r.total_avaliacoes - ant.total_avaliacoes) / ant.total_avaliacoes) * 100
        : undefined;
      return { ...r, deltaChamados, deltaAvaliacoes };
    });
  }, [perfAtual, perfAnterior]);

  // Ranking humano por volume — deriva de perfAtual/perfAnterior (já
  // buscados acima), sem query nova. Bot fica de fora (mesma exclusão do
  // Overview): comparar volume/CSAT dele lado a lado com humanos não faz
  // sentido nessa tabela.
  const rankingHumanoAtual = useMemo(
    () => (perfAtual ?? []).filter((r) => r.operator_nome !== NOME_BOT).sort((a, b) => b.total_atendimentos - a.total_atendimentos),
    [perfAtual]
  );
  const rankingHumanoAnterior = useMemo(
    () => (perfAnterior ?? []).filter((r) => r.operator_nome !== NOME_BOT).sort((a, b) => b.total_atendimentos - a.total_atendimentos),
    [perfAnterior]
  );

  // Métricas do relatório "Resultados SAC" (Chamados, Por tipo de cliente,
  // CSAT, Reabertura, Transferências, FCR/Recontato) pro período selecionado
  // nesta página — usadas só pelo botão "Baixar PDF" abaixo. Admin-only:
  // são agregados do time inteiro, mesma barreira já aplicada em
  // teamSummary/perfAtual nesta página (as funções SQL também exigem
  // is_admin() por trás, então pedir sem admin só voltaria vazio mesmo).
  const { data: contagemAtual } = useQuery({
    queryKey: ["contagem-periodo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchContagemPeriodo(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: contagemAnterior } = useQuery({
    queryKey: ["contagem-periodo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchContagemPeriodo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: percentisAtual } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchTfrTtrPercentis(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: percentisAnterior } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchTfrTtrPercentis(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: tipoClienteAtual } = useQuery({
    queryKey: ["metricas-tipo-cliente", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchMetricasPorTipoCliente(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: tipoClienteAnterior } = useQuery({
    queryKey: ["metricas-tipo-cliente", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchMetricasPorTipoCliente(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: csatDistAtual } = useQuery({
    queryKey: ["csat-distribuicao", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchCsatDistribuicao(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: csatDistAnterior } = useQuery({
    queryKey: ["csat-distribuicao", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchCsatDistribuicao(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: reaberturaAtual } = useQuery({
    queryKey: ["reabertura-resumo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchReaberturaResumo(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: reaberturaAnterior } = useQuery({
    queryKey: ["reabertura-resumo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchReaberturaResumo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: transferenciasAtual } = useQuery({
    queryKey: ["transferencias-resumo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchTransferenciasResumo(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: transferenciasAnterior } = useQuery({
    queryKey: ["transferencias-resumo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchTransferenciasResumo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const { data: fcrAtual } = useQuery({
    queryKey: ["fcr-recontato-resumo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchFcrRecontatoResumo(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
  });
  const { data: fcrAnterior } = useQuery({
    queryKey: ["fcr-recontato-resumo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchFcrRecontatoResumo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: isAdmin,
  });

  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);

  const dadosRelatorio: ResultadosSacData = useMemo(
    () => ({
      periodoAtualLabel: labelDoPeriodo(granularidade, inicioPeriodo, fimPeriodo),
      periodoAnteriorLabel: labelDoPeriodo(granularidade, inicioPeriodoAnterior, fimPeriodoAnterior),
      atual: {
        contagem: contagemAtual ?? null,
        percentis: percentisAtual ?? null,
        tipoCliente: tipoClienteAtual ?? [],
        rankingHumano: rankingHumanoAtual,
        csat: csatDistAtual ?? null,
        reabertura: reaberturaAtual ?? null,
        transferencias: transferenciasAtual ?? null,
        fcr: fcrAtual ?? null,
      },
      anterior: {
        contagem: contagemAnterior ?? null,
        percentis: percentisAnterior ?? null,
        tipoCliente: tipoClienteAnterior ?? [],
        rankingHumano: rankingHumanoAnterior,
        csat: csatDistAnterior ?? null,
        reabertura: reaberturaAnterior ?? null,
        transferencias: transferenciasAnterior ?? null,
        fcr: fcrAnterior ?? null,
      },
      csatPorAtendente: perfAtual ?? [],
    }),
    [
      granularidade,
      inicioPeriodo,
      fimPeriodo,
      inicioPeriodoAnterior,
      fimPeriodoAnterior,
      contagemAtual,
      contagemAnterior,
      percentisAtual,
      percentisAnterior,
      tipoClienteAtual,
      tipoClienteAnterior,
      rankingHumanoAtual,
      rankingHumanoAnterior,
      csatDistAtual,
      csatDistAnterior,
      reaberturaAtual,
      reaberturaAnterior,
      transferenciasAtual,
      transferenciasAnterior,
      fcrAtual,
      fcrAnterior,
      perfAtual,
    ]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RRForm>({ resolver: zodResolver(rrSchema) });

  const [visualizando, setVisualizando] = useState<DbRRHistory | null>(null);
  const [editando, setEditando] = useState<DbRRHistory | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  // Separado de erroEdicao: exclusão pode ser disparada de fora do dialog de
  // edição (ícone de lixeira na lista, ou botão Excluir dentro do dialog de
  // visualização) — erroEdicao só é renderizado dentro do form de edição, e
  // ficava mostrando erro em lugar nenhum se o delete falhasse por qualquer
  // motivo (achado real: usuário reportou "botão de excluir não funciona",
  // e a falha ficava silenciosa mesmo quando de fato falhava).
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const {
    register: registerEdicao,
    handleSubmit: handleSubmitEdicao,
    reset: resetEdicao,
    formState: { errors: errorsEdicao },
  } = useForm<RRForm>({ resolver: zodResolver(rrSchema) });

  function abrirEdicaoRR(rr: DbRRHistory) {
    setErroEdicao(null);
    resetEdicao({
      aprendizados: rr.aprendizados ?? "",
      dificuldades: rr.dificuldades ?? "",
      planoDeAcao: rr.plano_de_acao ?? "",
      objetivos: rr.objetivos ?? "",
    });
    setEditando(rr);
  }

  async function excluirRR(rr: DbRRHistory) {
    if (!user) return;
    if (!confirm(`Excluir a RR de "${rr.periodo}"? Essa ação não pode ser desfeita.`)) return;
    setErroExclusao(null);
    try {
      await deleteRRHistory(rr.id);
      await queryClient.invalidateQueries({ queryKey: ["rr-history", user.id] });
      setVisualizando(null);
    } catch (err) {
      setErroExclusao(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  async function onSubmitEdicao(data: RRForm) {
    if (!editando || !user) return;
    setSalvandoEdicao(true);
    setErroEdicao(null);
    try {
      await updateRRHistory(editando.id, {
        aprendizados: data.aprendizados,
        dificuldades: data.dificuldades,
        plano_de_acao: data.planoDeAcao || null,
        objetivos: data.objetivos || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["rr-history", user.id] });
      setEditando(null);
    } catch (err) {
      setErroEdicao(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function onSubmit(data: RRForm) {
    if (!user) return;
    setSalvando(true);
    setSalvarErro(null);
    try {
      await insertRRHistory({
        user_id: user.id,
        periodo: periodos.find((p) => p.id === periodo)?.label ?? periodo,
        csat: Number(csatValor.toFixed(2)),
        csat_variacao: Number(csatDeltaValor.toFixed(1)),
        atendimentos: atendimentosValor,
        atendimentos_variacao: Number(atendimentosDeltaValor.toFixed(1)),
        tempo_medio: tempoResolucaoSeg !== null ? formatDuration(tempoResolucaoSeg) : null,
        tempo_medio_variacao: tempoResolucaoDelta !== undefined ? Number(tempoResolucaoDelta.toFixed(1)) : null,
        meta_batida: csatValor >= 4.5,
        aprendizados: data.aprendizados,
        dificuldades: data.dificuldades,
        plano_de_acao: data.planoDeAcao || null,
        objetivos: data.objetivos || null,
      });
      setSalvo(true);
      reset();
      queryClient.invalidateQueries({ queryKey: ["rr-history", user.id] });
    } catch (err) {
      setSalvarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {/* print:hidden — a única coisa que deve sair na impressão/PDF é o
          RelatorioResultadosSac abaixo, nunca a página crua por trás dele
          (achado real: sem isso, o Ctrl+P/"Baixar PDF" imprimia os KPIs, a
          tabela de Detalhamento e o formulário em branco ANTES do
          relatório, porque `position:fixed` vira `static` no print e só
          flui como mais um bloco da página em vez de cobri-la). */}
      <div className="space-y-8 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">
            Reunião de Resultados
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Selecione a granularidade e o período — aplica em toda a página. CSAT, atendimentos e
            detalhamento por atendente são calculados automaticamente{" "}
            {isAdmin ? "a partir do resultado de todo o time" : "a partir dos seus registros"} no banco.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={[["mensal", "Mensal"], ["semanal", "Semanal"]] as const}
            value={granularidade}
            onChange={mudarGranularidade}
          />
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value);
              setSalvo(false);
            }}
            className="h-10 rounded-xl border border-sand-line bg-white px-3 text-sm"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {isAdmin && (
            <Button variant="secondary" onClick={() => setMostrarRelatorio(true)}>
              <Download size={14} /> Baixar PDF
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label={isAdmin ? "CSAT do time" : "CSAT do período"}
          value={carregandoPrincipais ? "..." : csatValor.toFixed(1)}
          delta={csatDeltaValor}
        />
        <Kpi
          label={isAdmin ? "Atendimentos do time" : "Atendimentos avaliados"}
          value={carregandoPrincipais ? "..." : String(atendimentosValor)}
          delta={atendimentosDeltaValor}
        />
        <Kpi
          label="Tempo médio de resolução"
          value={(isAdmin ? loadingTeamSummary : loadingConversas) ? "..." : formatDuration(tempoResolucaoSeg)}
          delta={tempoResolucaoDelta}
          invertDeltaColor
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">
            Resultado da meta do período
          </h2>
          <Badge tone={csatValor >= 4.5 ? "success" : "danger"}>
            {csatValor >= 4.5 ? "Meta batida (CSAT ≥ 4.5)" : "Meta não atingida"}
          </Badge>
        </div>
        {tempoResolucaoSeg === null && !carregandoPrincipais && (
          <p className="mt-2 text-xs text-ink/50">
            Sem conversas com resolução registrada neste período em <code>crisp_conversations</code>.
          </p>
        )}
      </Card>

      {isAdmin && (
        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">Detalhamento por atendente</h2>
            <p className="mt-1 text-xs text-ink/50">
              Chamados e avaliações de cada atendente, comparado com o período anterior.
            </p>
          </div>
          <div className="p-5">
            {loadingPerfAtual ? (
              <p className="text-sm text-ink/50">Carregando...</p>
            ) : perfComparativo.length === 0 ? (
              <p className="text-sm text-ink/50">Sem atendimentos no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Atendente</th>
                      <th className="py-2 pr-4 font-medium">Chamados</th>
                      <th className="py-2 pr-4 font-medium">Avaliações</th>
                      <th className="py-2 pr-4 font-medium">CSAT médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfComparativo.map((r) => (
                      <tr key={r.operator_nome} className="border-t border-sand-line">
                        <td className="py-2 pr-4 font-medium text-ink">{r.operator_nome}</td>
                        <td className="py-2 pr-4 text-ink/70">
                          {r.total_atendimentos}
                          {r.deltaChamados !== undefined && (
                            <span className={r.deltaChamados >= 0 ? "ml-1 text-xs text-forest-600" : "ml-1 text-xs text-rust-500"}>
                              ({r.deltaChamados >= 0 ? "+" : ""}{r.deltaChamados.toFixed(0)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-ink/70">
                          {r.total_avaliacoes}
                          {r.deltaAvaliacoes !== undefined && (
                            <span className={r.deltaAvaliacoes >= 0 ? "ml-1 text-xs text-forest-600" : "ml-1 text-xs text-rust-500"}>
                              ({r.deltaAvaliacoes >= 0 ? "+" : ""}{r.deltaAvaliacoes.toFixed(0)}%)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-ink/70">{r.csat_medio?.toFixed(1) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">
            Preenchimento manual
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Estes campos não são calculados automaticamente — refletem sua análise qualitativa do período.
          </p>
        </div>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {CAMPOS_RR.map(([field, label]) => (
              <div key={field}>
                <label className="mb-1 block text-sm font-medium text-ink">
                  {label}
                </label>
                <textarea
                  {...register(field)}
                  rows={3}
                  className="w-full rounded-xl border border-sand-line bg-white p-3 text-sm outline-none focus:border-forest-500"
                  placeholder={`Descreva ${label.toLowerCase()}...`}
                />
                {errors[field] && (
                  <p className="mt-1 text-xs text-rust-500">
                    {errors[field]?.message}
                  </p>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Reunião de Resultados"}
              </Button>
              {salvo && (
                <span className="text-sm text-forest-600">Salvo com sucesso.</span>
              )}
              {salvarErro && (
                <span className="text-sm text-rust-500">{salvarErro}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">
            Histórico de RRs
          </h2>
          {historico && historico.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportRRHistoricoToPdf(user?.nome ?? "—", historico)}
            >
              <Download size={14} /> Baixar histórico
            </Button>
          )}
        </div>
        {erroExclusao && <p className="mb-3 text-sm text-rust-500">{erroExclusao}</p>}
        {!historico || historico.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhuma RR registrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {historico.map((rr) => (
              <Card
                key={rr.id}
                className="cursor-pointer p-4 transition-colors hover:bg-sand-bg/50"
                onClick={() => {
                  setErroExclusao(null);
                  setVisualizando(rr);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{rr.periodo}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/50">
                      CSAT {rr.csat ?? "—"} · {rr.atendimentos ?? 0} atendimentos
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); abrirEdicaoRR(rr); }}
                      title="Corrigir esta RR"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/40 hover:bg-sand-bg hover:text-ink"
                    >
                      <Pencil size={14} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); excluirRR(rr); }}
                        title="Excluir esta RR"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/40 hover:bg-rust-500/10 hover:text-rust-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {visualizando && (
        <Dialog onClose={() => setVisualizando(null)}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink">{visualizando.periodo}</h2>
            <Badge tone={visualizando.meta_batida ? "success" : "danger"}>
              {visualizando.meta_batida ? "Meta batida" : "Meta não atingida"}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-sand-bg p-2">
              <p className="text-[10px] uppercase text-ink/40">CSAT</p>
              <p className="font-display text-sm font-semibold text-ink">{visualizando.csat ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-sand-bg p-2">
              <p className="text-[10px] uppercase text-ink/40">Atendimentos</p>
              <p className="font-display text-sm font-semibold text-ink">{visualizando.atendimentos ?? 0}</p>
            </div>
            <div className="rounded-lg bg-sand-bg p-2">
              <p className="text-[10px] uppercase text-ink/40">Tempo médio</p>
              <p className="font-display text-sm font-semibold text-ink">{visualizando.tempo_medio ?? "—"}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {([
              ["Aprendizados", visualizando.aprendizados],
              ["Dificuldades", visualizando.dificuldades],
              ["Plano de ação", visualizando.plano_de_acao],
              ["Objetivos", visualizando.objetivos],
            ] as const).map(([label, texto]) =>
              texto ? (
                <div key={label}>
                  <p className="text-xs font-medium text-ink/50">{label}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink/80">{texto}</p>
                </div>
              ) : null
            )}
          </div>

          {erroExclusao && <p className="mt-4 text-sm text-rust-500">{erroExclusao}</p>}
          <div className="mt-5 flex justify-end gap-2">
            {isAdmin && (
              <Button variant="danger" onClick={() => excluirRR(visualizando)}>
                <Trash2 size={14} /> Excluir
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                const rr = visualizando;
                setVisualizando(null);
                abrirEdicaoRR(rr);
              }}
            >
              <Pencil size={14} /> Editar
            </Button>
            <Button onClick={() => exportRRUnicaToPdf(user?.nome ?? "—", visualizando)}>
              <Download size={14} /> Baixar PDF
            </Button>
          </div>
        </Dialog>
      )}

      {editando && (
        <Dialog onClose={() => setEditando(null)}>
          <h2 className="font-display text-base font-semibold text-ink">Corrigir RR — {editando.periodo}</h2>
          <p className="mt-1 text-xs text-ink/50">
            Os números (CSAT, atendimentos, tempo médio) foram calculados no momento em que essa RR foi salva e não mudam aqui — só o texto qualitativo pode ser corrigido.
          </p>
          <form onSubmit={handleSubmitEdicao(onSubmitEdicao)} className="mt-4 space-y-3">
            {CAMPOS_RR.map(([field, label]) => (
              <div key={field}>
                <label className="mb-1 block text-xs font-medium text-ink/70">{label}</label>
                <textarea
                  {...registerEdicao(field)}
                  rows={3}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
                {errorsEdicao[field] && <p className="mt-1 text-xs text-rust-500">{errorsEdicao[field]?.message}</p>}
              </div>
            ))}
            {erroEdicao && <p className="text-sm text-rust-500">{erroEdicao}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvandoEdicao}>{salvandoEdicao ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </Dialog>
      )}
      </div>

      {mostrarRelatorio && (
        <RelatorioResultadosSac data={dadosRelatorio} onClose={() => setMostrarRelatorio(false)} />
      )}
    </>
  );
}
