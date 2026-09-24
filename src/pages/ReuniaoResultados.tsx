import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DateRangePopover } from "@/components/ui/DateRangePopover";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchCsatForUser,
  fetchMinhasConversasMetricas,
  fetchDashboardAtendimentoSummary,
  fetchAtendentePerformance,
  fetchContagemPeriodo,
  fetchTfrTtrPercentis,
  fetchVelocidadePorTipoCliente,
  fetchCsatDistribuicao,
  fetchCsatDistribuicaoPorTipoCliente,
  fetchAtendenteCsatDistribuicao,
  fetchCsatEnviosPorAtendente,
  fetchCsatFunilCanal,
  fetchAtendidoNaoResolvido,
  fetchReaberturaResumo,
  fetchRelogioEsperaCliente,
  fetchHorasExpedientePeriodo,
  fetchTempoRespostaBot,
  fetchBacklogPorIdade,
  fetchNpsResponses,
  fetchMigracoesResumo,
  fetchMigracoesPorPlataforma,
  fetchAtendimentosComMetricas,
  type AtendentePerformanceRow,
} from "@/services/api";
import { formatDuration } from "@/lib/formatDuration";
// exportResultadosSacToPptx é
// sempre importados dinamicamente (`await import(...)`) dentro do próprio
// clique — pptxgenjs só baixa quando alguém de fato exporta, não no
// bundle inicial da página (ver PR#11, "lazy loading de rotas").
import { manualDataVazia, type ResultadosSacData, type ManualData, type NpsResumo } from "@/lib/resultadosSac";
import { usePersistedState } from "@/hooks/usePersistedState";
import { RelatorioResultadosSac } from "@/components/RelatorioResultadosSac";

const NOME_BOT = "IA Greenn";

// "personalizado": intervalo escolhido no calendário (id = "AAAA-MM-DD_AAAA-MM-DD",
// fim incluído); comparação com o intervalo de mesmo tamanho logo antes.
type Granularidade = "mensal" | "semanal" | "personalizado";

function limitesPersonalizado(periodoId: string) {
  const [ini, fim] = periodoId.split("_");
  return { inicio: new Date(ini + "T00:00:00"), fim: new Date(fim + "T23:59:59.999") };
}

function media(vals: (number | null)[]) {
  const validos = vals.filter((v): v is number => v !== null);
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}

function resumirNps(respostas: { classificacao: "Promotor" | "Neutro" | "Detrator" }[]): NpsResumo {
  return {
    total: respostas.length,
    promotores: respostas.filter((r) => r.classificacao === "Promotor").length,
    neutros: respostas.filter((r) => r.classificacao === "Neutro").length,
    detratores: respostas.filter((r) => r.classificacao === "Detrator").length,
  };
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Quarta-feira da semana de referência — a Reunião de Resultados roda toda
// quarta, então a semana do relatório é quarta a quarta (qua–ter, 7 dias),
// não segunda a domingo. Sempre volta pra quarta-feira mais recente
// (ou fica no lugar, se `d` já for quarta). Mudou de sexta pra quarta em
// 2026-09-22 (pedido do usuário) — era `fridayOf`/`(dia + 2) % 7`, a mesma
// fórmula generalizada pra qualquer dia de referência X é
// `(dia - X + 7) % 7`; pra quarta (X=3, contando domingo=0) isso vira
// `(dia + 4) % 7`.
function quartaOf(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = date.getDay();
  date.setDate(date.getDate() - ((dia + 4) % 7));
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
  if (granularidade === "personalizado") return limitesPersonalizado(periodoId);
  return granularidade === "mensal" ? limitesDoMes(periodoId) : limitesDaSemana(periodoId);
}

function periodoAnteriorId(granularidade: Granularidade, periodoId: string) {
  if (granularidade === "personalizado") {
    const { inicio, fim } = limitesPersonalizado(periodoId);
    const dias = Math.round((new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime() - inicio.getTime()) / 86_400_000) + 1;
    const fimAnt = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() - 1);
    const iniAnt = new Date(fimAnt.getFullYear(), fimAnt.getMonth(), fimAnt.getDate() - (dias - 1));
    return `${toISODate(iniAnt)}_${toISODate(fimAnt)}`;
  }
  if (granularidade === "mensal") {
    const [ano, mes] = periodoId.split("-").map(Number);
    const d = new Date(ano, mes - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const [ano, mes, dia] = periodoId.split("-").map(Number);
  return toISODate(new Date(ano, mes - 1, dia - 7));
}

function ultimosPeriodos(granularidade: Granularidade, n: number) {
  if (granularidade === "personalizado") return [];
  if (granularidade === "mensal") {
    const hoje = new Date();
    return Array.from({ length: n }).map((_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { id, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }
  const quartaAtual = quartaOf(new Date());
  return Array.from({ length: n }).map((_, i) => {
    const qua = new Date(quartaAtual);
    qua.setDate(qua.getDate() - i * 7);
    // Rótulo mostra "quarta a quarta" de verdade (ambas as pontas caem
    // numa quarta-feira) — achado real em 2026-09-22: mostrar o último dia
    // incluído (terça, qua+6) fazia o rótulo ler "16/09 a 22/09", que o
    // usuário apontou como incorreto pra uma semana que deveria ir "até
    // dia 23/09, quarta a quarta". O período de dado em si não muda (os
    // dados continuam indo até terça 23:59:59, ver limitesDaSemana) — só a
    // data mostrada no rótulo passa a ser a quarta seguinte (fronteira
    // exclusiva), igual à convenção comum de "check-in/check-out".
    const proximaQua = new Date(qua);
    proximaQua.setDate(proximaQua.getDate() + 7);
    const id = toISODate(qua);
    const label = `${String(qua.getDate()).padStart(2, "0")}/${String(qua.getMonth() + 1).padStart(2, "0")} a ${String(proximaQua.getDate()).padStart(2, "0")}/${String(proximaQua.getMonth() + 1).padStart(2, "0")}`;
    return { id, label };
  });
}

// Mesmo formato de label de ultimosPeriodos(), mas pra um par inicio/fim
// qualquer — precisa funcionar pro período anterior também, que pode cair
// fora da janela dos 6 períodos listados no dropdown.
function labelDoPeriodo(granularidade: Granularidade, inicio: Date, fim: Date): string {
  if (granularidade === "personalizado") {
    const f = (d: Date) => d.toLocaleDateString("pt-BR");
    return `${f(inicio)} a ${f(fim)}`;
  }
  if (granularidade === "mensal") {
    const label = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Mesma correção de ultimosPeriodos(): rótulo mostra a quarta seguinte
  // (fronteira exclusiva), não o último dia realmente incluído (terça) —
  // o intervalo de dado usado nas queries (`fim`) não muda.
  const fimRotulo = new Date(fim);
  fimRotulo.setDate(fimRotulo.getDate() + 1);
  return `${fmt(inicio)} a ${fmt(fimRotulo)}`;
}

function agregarPorPeriodo(csat: { data_hora: string; nota: number | null }[], inicio: Date, fim: Date) {
  const rows = csat.filter((c) => {
    const d = new Date(c.data_hora);
    return d >= inicio && d <= fim && c.nota !== null;
  });
  const mediaNota = rows.length ? rows.reduce((acc, r) => acc + (r.nota ?? 0), 0) / rows.length : 0;
  return { media: mediaNota, total: rows.length };
}

function CampoManual({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs text-ink-soft">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ? `Ex: ${placeholder}` : undefined}
        className="mt-1 h-9 w-full rounded-lg border border-sand-line bg-sand-surface px-3 text-sm text-ink placeholder:text-ink-soft/50"
      />
    </label>
  );
}

function CampoManualArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="mt-3 block text-xs text-ink-soft">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-1 w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}

export default function ReuniaoResultados() {
  const { user, isAdmin } = useAuth();

  // Padrão sempre semanal, com a semana atual — pedido explícito do
  // usuário em 2026-09-22 (a RR roda toda quarta, ver `quartaOf()` acima).
  // Não é persistido de propósito (`useState`, não `usePersistedState`):
  // o padrão é fixo, não "lembrar a última escolha".
  const [granularidade, setGranularidade] = useState<Granularidade>("semanal");
  const periodos = useMemo(() => ultimosPeriodos(granularidade, 6), [granularidade]);
  const [periodo, setPeriodo] = useState(periodos[0].id);
  // Calendário do modo "Personalizado" (mesmo componente do resto do Hub:
  // 1º clique = início, 2º = fim, 3º recomeça). Só aplica quando o
  // intervalo está completo.
  const [presetPerso, setPresetPerso] = useState<PeriodoPreset>("personalizado");
  const [rangePerso, setRangePerso] = useState({ inicio: "", fim: "" });

  function mudarGranularidade(g: Granularidade) {
    setGranularidade(g);
    if (g === "personalizado") {
      // Começa na semana atual da RR (quarta a terça) já selecionada.
      const { inicio, fim } = limitesDaSemana(ultimosPeriodos("semanal", 1)[0].id);
      const r = { inicio: toISODate(inicio), fim: toISODate(fim) };
      setRangePerso(r);
      setPresetPerso("personalizado");
      setPeriodo(`${r.inicio}_${r.fim}`);
      return;
    }
    setPeriodo(ultimosPeriodos(g, 6)[0].id);
  }

  const { data: csat, isLoading: loadingCsat } = useQuery({
    queryKey: ["csat", user?.id],
    queryFn: () => fetchCsatForUser(user!.email),
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

  // ── Onda 0 (imediata) ── só o que os KPIs do topo e a tabela
  // "Detalhamento por atendente" (sempre visível, sem abrir o relatório)
  // precisam pra renderizar.
  //
  // Admin usa essa tela pra levar o resultado do TIME pra reunião, não o
  // próprio (que geralmente é 0 — admin não atende ticket em nome próprio).
  const { data: teamSummary, isLoading: loadingTeamSummary } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchDashboardAtendimentoSummary(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
    retry: 1,
  });
  // Detalhamento por atendente (chamados/avaliações x período anterior) —
  // usa a mesma janela (mensal/semanal) selecionada no header da página.
  const { data: perfAtual, isLoading: loadingPerfAtual } = useQuery({
    queryKey: ["atendente-performance", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchAtendentePerformance(inicioPeriodo, fimPeriodo),
    enabled: isAdmin,
    retry: 1,
  });

  // ── Escalonamento em 6 ondas menores (2026-09-22) ──────────────────────
  // Achado real: "não consigo baixar o PPTX/PDF, tá muito lento". A versão
  // anterior já separava "atual" de "anterior" em 2 ondas (ver histórico),
  // mas cada onda ainda disparava ~13 RPCs pesadas de uma vez — e várias
  // delas levam de 2 a 7s isoladas, sem nenhuma concorrência (medido no
  // pg_stat_statements do projeto, auditoria de 2026-09-21). No compute
  // Micro (CPU compartilhada) do Hub SAC, isso é contenção pesada o
  // bastante pra estourar o statement_timeout — e com `retry: 1` (ver
  // abaixo) uma falha aí não é mais tão cara, mas o pico de concorrência em
  // si continuava alto. Agora cada onda só libera a próxima depois que TODA
  // a anterior já resolveu (`!== undefined`, não `isLoading`, porque
  // `enabled: false` nunca chega a ficar "loading") — pico cai de ~13 pra
  // no máximo 6 consultas ao mesmo tempo, ao custo de mais tempo total até
  // o relatório ficar pronto (aceitável: só os botões "Baixar PDF/PPTX"
  // dependem disso, os KPIs do topo já vêm da onda 0 acima).
  const estagio1Habilitado = isAdmin && teamSummary !== undefined && perfAtual !== undefined;

  const { data: contagemAtual } = useQuery({
    queryKey: ["contagem-periodo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchContagemPeriodo(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const { data: percentisAtual } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchTfrTtrPercentis(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // Chave própria ("velocidade-tipo-cliente", não "metricas-tipo-cliente")
  // — mesmo par de datas poderia colidir no cache do TanStack Query com a
  // chave já usada por Home/Meu Painel (`fetchMetricasPorTipoCliente`),
  // que tem um formato de linha diferente (`velocidade_por_tipo_cliente()`
  // traz uteis+corridas juntos, ver seção 10 do CLAUDE.md) — nunca
  // reaproveitar a mesma chave pra fonte de dado diferente.
  const { data: tipoClienteAtual } = useQuery({
    queryKey: ["velocidade-tipo-cliente", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchVelocidadePorTipoCliente(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const { data: csatDistAtual } = useQuery({
    queryKey: ["csat-distribuicao", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchCsatDistribuicao(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // CSAT por tipo de cliente (amostra via crisp_id) e CSAT por atendente
  // com boas/neutras/ruins (Bot + CSAT% no Ranking) — sem par "Anterior"
  // pro segundo (mesmo motivo de `csatPorAtendente`/`atendente_performance`
  // não terem: nenhuma tela mostra delta pra esse recorte).
  const { data: csatPorTipoClienteAtual } = useQuery({
    queryKey: ["csat-tipo-cliente", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchCsatDistribuicaoPorTipoCliente(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const { data: csatPorAtendenteDist } = useQuery({
    queryKey: ["csat-atendente-distribuicao", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchAtendenteCsatDistribuicao(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // Leve (~0,1s, `csat_pending` tem poucos milhares de linhas).
  const { data: csatEnvios } = useQuery({
    queryKey: ["csat-envios-atendente", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchCsatEnviosPorAtendente(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // Funil do CSAT por canal + atendido e não resolvido (slide "Por que
  // temos poucas avaliações"). Leves: um group by só sobre o período.
  const { data: csatFunilAtual } = useQuery({
    queryKey: ["csat-funil-canal", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchCsatFunilCanal(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const { data: atendidoNaoResolvidoAtual } = useQuery({
    queryKey: ["atendido-nao-resolvido", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchAtendidoNaoResolvido(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // Backlog não tem filtro de período — é sempre "o que está aberto agora",
  // não faz sentido "backlog do mês passado". Uma busca só, sem par
  // "Anterior".
  const { data: backlogAtual } = useQuery({
    queryKey: ["backlog-por-idade"],
    queryFn: () => fetchBacklogPorIdade(),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  // NPS deixou de ser manual em 2026-09-08 — números reais de
  // `nps_responses` (módulo /nps já existe no Hub, só o resumo qualitativo
  // continua digitado à mão, ver ManualData). Agregado no cliente (mesmo
  // padrão já usado em Nps.tsx), volume baixo o bastante pra não precisar
  // de função SQL própria.
  const { data: npsRespostasAtual } = useQuery({
    queryKey: ["nps-responses", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchNpsResponses({ inicio: inicioPeriodo, fim: fimPeriodo }),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const npsResumoAtual = useMemo(() => (npsRespostasAtual ? resumirNps(npsRespostasAtual) : null), [npsRespostasAtual]);

  // "SAC — Migrações" deixou de ser manual em 2026-09-23 — sincronizado via
  // n8n a partir da Centralização (gestao-tickets) pra `migracoes_sync` no
  // Hub SAC. "Por plataforma" só faz sentido no período atual (lista de
  // casos, mesmo motivo de topTfrProdutor/Final não terem par "anterior").
  const { data: migracoesAtual } = useQuery({
    queryKey: ["migracoes-resumo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchMigracoesResumo(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });
  const { data: migracoesPorPlataformaAtual } = useQuery({
    queryKey: ["migracoes-por-plataforma", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchMigracoesPorPlataforma(inicioPeriodo, fimPeriodo),
    enabled: estagio1Habilitado,
    retry: 1,
  });

  // Top 5 maiores tempos de 1ª resposta do período — mesma função/critério
  // já usado na aba Atendimentos do Overview (`atendimentos_com_metricas`,
  // ordenar por "tfr" desc), sem precisar de RPC nova. Ordena por TFR em
  // horas úteis (modo padrão, mesmo critério do resto do relatório) — o
  // "corrido" de cada caso é calculado no cliente a partir dos dois
  // timestamps (abertura/1ª resposta), não precisa de 2ª chamada.
  // Separado em duas listas (Produtor / Cliente Final) por pedido do
  // usuário: um único top 5 misto sempre ficava dominado por "Final"
  // (a maioria tem TFR longo porque é atendimento majoritariamente por
  // bot, sem a mesma pressão de SLA humano que Produtor tem) — o time
  // quer ver os dois grupos separados, não um top 5 só de Final.
  const { data: topTfrProdutorAtual } = useQuery({
    queryKey: ["top-tfr-casos", "Produtor", inicioPeriodo, fimPeriodo],
    queryFn: () =>
      fetchAtendimentosComMetricas({
        inicio: inicioPeriodo,
        fim: fimPeriodo,
        tipoCliente: "Produtor",
        ordenarPor: "tfr",
        direcao: "desc",
        page: 0,
        pageSize: 5,
      }),
    enabled: estagio1Habilitado,
    retry: 1,
  });

  const { data: topTfrFinalAtual } = useQuery({
    queryKey: ["top-tfr-casos", "Final", inicioPeriodo, fimPeriodo],
    queryFn: () =>
      fetchAtendimentosComMetricas({
        inicio: inicioPeriodo,
        fim: fimPeriodo,
        tipoCliente: "Final",
        ordenarPor: "tfr",
        direcao: "desc",
        page: 0,
        pageSize: 5,
      }),
    enabled: estagio1Habilitado,
    retry: 1,
  });

  const estagio2Habilitado =
    estagio1Habilitado &&
    contagemAtual !== undefined &&
    percentisAtual !== undefined &&
    tipoClienteAtual !== undefined &&
    csatDistAtual !== undefined &&
    csatPorTipoClienteAtual !== undefined &&
    csatPorAtendenteDist !== undefined &&
    csatEnvios !== undefined &&
    csatFunilAtual !== undefined &&
    atendidoNaoResolvidoAtual !== undefined &&
    backlogAtual !== undefined &&
    npsRespostasAtual !== undefined &&
    migracoesAtual !== undefined &&
    migracoesPorPlataformaAtual !== undefined &&
    topTfrProdutorAtual !== undefined &&
    topTfrFinalAtual !== undefined;

  const { data: reaberturaAtual } = useQuery({
    queryKey: ["reabertura-resumo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchReaberturaResumo(inicioPeriodo, fimPeriodo),
    enabled: estagio2Habilitado,
    retry: 1,
  });
  const { data: relogioEsperaAtual } = useQuery({
    queryKey: ["relogio-espera-cliente", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchRelogioEsperaCliente(inicioPeriodo, fimPeriodo),
    enabled: estagio2Habilitado,
    retry: 1,
  });
  const { data: horasExpedienteAtual } = useQuery({
    queryKey: ["horas-expediente-periodo", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchHorasExpedientePeriodo(inicioPeriodo, fimPeriodo),
    enabled: estagio2Habilitado,
    retry: 1,
  });
  const { data: tempoBotAtual } = useQuery({
    queryKey: ["tempo-resposta-bot", inicioPeriodo, fimPeriodo],
    queryFn: () => fetchTempoRespostaBot(inicioPeriodo, fimPeriodo),
    enabled: estagio2Habilitado,
    retry: 1,
  });

  const estagio2Pronto =
    estagio2Habilitado &&
    reaberturaAtual !== undefined &&
    relogioEsperaAtual !== undefined &&
    horasExpedienteAtual !== undefined &&
    tempoBotAtual !== undefined;

  // "Período anterior" só começa depois que TODO o período atual carregou
  // (estagio2Pronto) — evita competir pelo mesmo compute Micro enquanto o
  // atual ainda está em voo.
  const anteriorHabilitado = isAdmin && estagio2Pronto;

  const { data: teamSummaryAnterior } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchDashboardAtendimentoSummary(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: anteriorHabilitado,
    retry: 1,
  });
  const { data: perfAnterior } = useQuery({
    queryKey: ["atendente-performance", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchAtendentePerformance(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: anteriorHabilitado,
    retry: 1,
  });

  const csatValor = isAdmin ? teamSummary?.csat_medio ?? 0 : atual.media;
  const csatDeltaValor = isAdmin
    ? teamSummaryAnterior?.csat_medio
      ? ((csatValor - teamSummaryAnterior.csat_medio) / teamSummaryAnterior.csat_medio) * 100
      : 0
    : csatDelta;
  // "Conversas" = 1 por conversa do Crisp (time: total_conversas; colaborador:
  // contagem de avaliações CSAT do período, métrica diferente mas é o que
  // essa tela sempre mostrou pro self-review). "Chamados" só existe pro time
  // (pondera reabertura) — não há conceito de "chamados pessoais" aqui.
  const conversasValor = isAdmin ? teamSummary?.total_conversas ?? 0 : atual.total;
  const conversasDeltaValor = isAdmin
    ? teamSummaryAnterior?.total_conversas
      ? ((conversasValor - teamSummaryAnterior.total_conversas) / teamSummaryAnterior.total_conversas) * 100
      : 0
    : atendimentosDelta;
  const chamadosValor = teamSummary?.total_chamados ?? 0;
  const chamadosDeltaValor = teamSummaryAnterior?.total_chamados
    ? ((chamadosValor - teamSummaryAnterior.total_chamados) / teamSummaryAnterior.total_chamados) * 100
    : 0;
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
    }).sort((a, b) => b.total_atendimentos - a.total_atendimentos);
  }, [perfAtual, perfAnterior]);
  // Detalhamento por atendente: só os 3 com mais chamados; o resto com "Ver mais".
  const [detalhamentoCompleto, setDetalhamentoCompleto] = useState(false);

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

  const estagio4Habilitado = anteriorHabilitado && teamSummaryAnterior !== undefined && perfAnterior !== undefined;

  const { data: contagemAnterior } = useQuery({
    queryKey: ["contagem-periodo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchContagemPeriodo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const { data: percentisAnterior } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchTfrTtrPercentis(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const { data: tipoClienteAnterior } = useQuery({
    queryKey: ["velocidade-tipo-cliente", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchVelocidadePorTipoCliente(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const { data: csatDistAnterior } = useQuery({
    queryKey: ["csat-distribuicao", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchCsatDistribuicao(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const { data: csatPorTipoClienteAnterior } = useQuery({
    queryKey: ["csat-tipo-cliente", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchCsatDistribuicaoPorTipoCliente(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const { data: npsRespostasAnterior } = useQuery({
    queryKey: ["nps-responses", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchNpsResponses({ inicio: inicioPeriodoAnterior, fim: fimPeriodoAnterior }),
    enabled: estagio4Habilitado,
    retry: 1,
  });
  const npsResumoAnterior = useMemo(() => (npsRespostasAnterior ? resumirNps(npsRespostasAnterior) : null), [npsRespostasAnterior]);
  const { data: migracoesAnterior } = useQuery({
    queryKey: ["migracoes-resumo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchMigracoesResumo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio4Habilitado,
    retry: 1,
  });

  const estagio5Habilitado =
    estagio4Habilitado &&
    contagemAnterior !== undefined &&
    percentisAnterior !== undefined &&
    tipoClienteAnterior !== undefined &&
    csatDistAnterior !== undefined &&
    csatPorTipoClienteAnterior !== undefined &&
    npsRespostasAnterior !== undefined &&
    migracoesAnterior !== undefined;

  const { data: reaberturaAnterior } = useQuery({
    queryKey: ["reabertura-resumo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchReaberturaResumo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });
  const { data: relogioEsperaAnterior } = useQuery({
    queryKey: ["relogio-espera-cliente", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchRelogioEsperaCliente(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });
  const { data: horasExpedienteAnterior } = useQuery({
    queryKey: ["horas-expediente-periodo", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchHorasExpedientePeriodo(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });
  const { data: tempoBotAnterior } = useQuery({
    queryKey: ["tempo-resposta-bot", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchTempoRespostaBot(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });
  const { data: csatFunilAnterior } = useQuery({
    queryKey: ["csat-funil-canal", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchCsatFunilCanal(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });
  const { data: atendidoNaoResolvidoAnterior } = useQuery({
    queryKey: ["atendido-nao-resolvido", inicioPeriodoAnterior, fimPeriodoAnterior],
    queryFn: () => fetchAtendidoNaoResolvido(inicioPeriodoAnterior, fimPeriodoAnterior),
    enabled: estagio5Habilitado,
    retry: 1,
  });

  // "Pronto" = a última onda (5) inteira já resolveu — cobre os gaps entre
  // ondas de propósito (uma query com `enabled: false` nunca fica
  // "isLoading"/"fetching", então checar só isso deixaria o botão "liberado"
  // nos intervalos entre ondas, com o relatório ainda incompleto; foi
  // exatamente esse tipo de gap que já causou PDF/PPTX com campos em branco
  // — ver ROADMAP/histórico). Substitui o antigo `useIsFetching`.
  const relatorioCarregando =
    isAdmin &&
    !(
      estagio5Habilitado &&
      reaberturaAnterior !== undefined &&
      relogioEsperaAnterior !== undefined &&
      horasExpedienteAnterior !== undefined &&
      tempoBotAnterior !== undefined &&
      csatFunilAnterior !== undefined &&
      atendidoNaoResolvidoAnterior !== undefined
    );

  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
  const [exportandoPptx, setExportandoPptx] = useState(false);

  // Dado que o Hub não captura (Reclame Aqui, RA XGROW, Migrações, NPS
  // qualitativo) — preenchido à mão, persistido pra não perder toda semana.
  // Estado de UI (mostrarDadosManuais) fica de fora do persistido de
  // propósito — não faz sentido reabrir a tela já com o painel expandido.
  const [dadosManuais, setDadosManuais] = usePersistedState<ManualData>("rr:dadosManuais", manualDataVazia());
  const [mostrarDadosManuais, setMostrarDadosManuais] = useState(false);

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
        csatPorTipoCliente: csatPorTipoClienteAtual ?? [],
        reabertura: reaberturaAtual ?? null,
        relogioEspera: relogioEsperaAtual ?? null,
        horasExpedienteMin: horasExpedienteAtual ?? null,
        tempoRespostaBot: tempoBotAtual ?? null,
        npsResumo: npsResumoAtual,
        migracoes: migracoesAtual ?? null,
        migracoesPorPlataforma: migracoesPorPlataformaAtual ?? [],
        csatFunil: csatFunilAtual ?? [],
        atendidoNaoResolvido: atendidoNaoResolvidoAtual ?? [],
      },
      anterior: {
        contagem: contagemAnterior ?? null,
        percentis: percentisAnterior ?? null,
        tipoCliente: tipoClienteAnterior ?? [],
        rankingHumano: rankingHumanoAnterior,
        csat: csatDistAnterior ?? null,
        csatPorTipoCliente: csatPorTipoClienteAnterior ?? [],
        reabertura: reaberturaAnterior ?? null,
        relogioEspera: relogioEsperaAnterior ?? null,
        horasExpedienteMin: horasExpedienteAnterior ?? null,
        tempoRespostaBot: tempoBotAnterior ?? null,
        npsResumo: npsResumoAnterior,
        migracoes: migracoesAnterior ?? null,
        migracoesPorPlataforma: [],
        csatFunil: csatFunilAnterior ?? [],
        atendidoNaoResolvido: atendidoNaoResolvidoAnterior ?? [],
      },
      csatPorAtendente: perfAtual ?? [],
      csatPorAtendenteDist: csatPorAtendenteDist ?? [],
      csatEnvios: csatEnvios ?? [],
      topTfrProdutor: topTfrProdutorAtual?.rows ?? [],
      topTfrFinal: topTfrFinalAtual?.rows ?? [],
      backlog: backlogAtual ?? [],
      manual: dadosManuais,
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
      csatPorTipoClienteAtual,
      csatPorTipoClienteAnterior,
      csatPorAtendenteDist,
      csatEnvios,
      topTfrProdutorAtual,
      topTfrFinalAtual,
      reaberturaAtual,
      reaberturaAnterior,
      relogioEsperaAtual,
      relogioEsperaAnterior,
      horasExpedienteAtual,
      horasExpedienteAnterior,
      tempoBotAtual,
      tempoBotAnterior,
      npsResumoAtual,
      npsResumoAnterior,
      migracoesAtual,
      migracoesAnterior,
      migracoesPorPlataformaAtual,
      perfAtual,
      backlogAtual,
      dadosManuais,
      csatFunilAtual,
      csatFunilAnterior,
      atendidoNaoResolvidoAtual,
      atendidoNaoResolvidoAnterior,
    ]
  );

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
            options={[["mensal", "Mensal"], ["semanal", "Semanal"], ["personalizado", "Personalizado"]] as const}
            value={granularidade}
            onChange={mudarGranularidade}
          />
          {granularidade === "personalizado" ? (
            <DateRangePopover
              preset={presetPerso}
              personalizado={rangePerso}
              onChangePreset={(p) => {
                setPresetPerso(p);
                if (p === "personalizado") return;
                const { inicio, fim } = resolvePeriodo(p);
                setPeriodo(`${toISODate(inicio)}_${toISODate(fim)}`);
              }}
              onChangePersonalizado={(v) => {
                setRangePerso(v);
                setPresetPerso("personalizado");
                if (v.inicio && v.fim) setPeriodo(`${v.inicio}_${v.fim}`);
              }}
            />
          ) : (
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value);
            }}
            className="h-10 rounded-xl border border-sand-line bg-sand-surface px-3 text-sm"
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          )}
          {isAdmin && (
            <Button variant="secondary" disabled={relatorioCarregando} onClick={() => setMostrarRelatorio(true)}>
              <Download size={14} /> {relatorioCarregando ? "Carregando dados..." : "Exportar"}
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={() => setMostrarDadosManuais((v) => !v)}>
              {mostrarDadosManuais ? "Fechar dados manuais" : "Dados manuais (RA, NPS...)"}
            </Button>
          )}
        </div>
      </div>

      {isAdmin && mostrarDadosManuais && (
        <Card>
          <CardContent className="space-y-6 py-5">
            <p className="text-sm text-ink-soft">
              Preenchido aqui uma vez, fica salvo pras próximas exportações — só precisa mudar o que
              mudou na semana. Campo vazio aparece como "—" no PDF/PPTX, nunca é inventado.
            </p>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Reclame Aqui</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoManual label="Nota" value={dadosManuais.reclameAqui.nota} onChange={(v) => setDadosManuais((d) => ({ ...d, reclameAqui: { ...d.reclameAqui, nota: v } }))} placeholder="9,1" />
                <CampoManual label="Total de reclamações" value={dadosManuais.reclameAqui.totalReclamacoes} onChange={(v) => setDadosManuais((d) => ({ ...d, reclameAqui: { ...d.reclameAqui, totalReclamacoes: v } }))} placeholder="39" />
                <CampoManual label="Variação vs. semana anterior" value={dadosManuais.reclameAqui.deltaPct} onChange={(v) => setDadosManuais((d) => ({ ...d, reclameAqui: { ...d.reclameAqui, deltaPct: v } }))} placeholder="-10,26%" />
              </div>
              <CampoManualArea label="Produtor destaque (uma linha por item)" value={dadosManuais.reclameAqui.produtorDestaque} onChange={(v) => setDadosManuais((d) => ({ ...d, reclameAqui: { ...d.reclameAqui, produtorDestaque: v } }))} placeholder={"equipehayanesilva@gmail.com - 23,08%\nsan.chagasandrade@gmail.com - 5,13%"} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">RA XGROW</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <CampoManual label="Total de reclamações" value={dadosManuais.raXgrow.totalReclamacoes} onChange={(v) => setDadosManuais((d) => ({ ...d, raXgrow: { ...d.raXgrow, totalReclamacoes: v } }))} placeholder="15" />
                <CampoManual label="Nota" value={dadosManuais.raXgrow.nota} onChange={(v) => setDadosManuais((d) => ({ ...d, raXgrow: { ...d.raXgrow, nota: v } }))} placeholder="8,4" />
                <CampoManual label="Nota anterior" value={dadosManuais.raXgrow.notaAnterior} onChange={(v) => setDadosManuais((d) => ({ ...d, raXgrow: { ...d.raXgrow, notaAnterior: v } }))} placeholder="7,8" />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">
                Dados NPS <span className="font-normal text-ink/40">— contatados/promotores/neutros/detratores agora vêm automático do módulo NPS, só "Temas" é manual</span>
              </h3>
              <CampoManualArea label="Temas mais abordados" value={dadosManuais.nps.temas} onChange={(v) => setDadosManuais((d) => ({ ...d, nps: { ...d.nps, temas: v } }))} placeholder="[Checkout] Cliente relata demora de 6 a 10s no Pix/cartão..." />
            </div>
          </CardContent>
        </Card>
      )}

      <div className={isAdmin ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-4 sm:grid-cols-3"}>
        <Kpi
          label={isAdmin ? "CSAT do time" : "CSAT do período"}
          value={carregandoPrincipais ? "..." : csatValor.toFixed(1)}
          delta={csatDeltaValor}
        />
        {isAdmin ? (
          <>
            <Kpi
              label="Total de conversas"
              value={carregandoPrincipais ? "..." : String(conversasValor)}
              delta={conversasDeltaValor}
            />
            <Kpi
              label="Total de chamados"
              value={carregandoPrincipais ? "..." : String(chamadosValor)}
              delta={chamadosDeltaValor}
            />
          </>
        ) : (
          <Kpi
            label="Atendimentos avaliados"
            value={carregandoPrincipais ? "..." : String(conversasValor)}
            delta={conversasDeltaValor}
          />
        )}
        <Kpi
          label="Tempo médio de resolução"
          value={(isAdmin ? loadingTeamSummary : loadingConversas) ? "..." : formatDuration(tempoResolucaoSeg)}
          delta={tempoResolucaoDelta}
          invertDeltaColor
        />
      </div>
      {isAdmin && (
        <p className="text-xs text-ink/40">
          "Total de conversas" conta cada conversa do Crisp uma vez só; "Total de chamados" conta cada ciclo
          aberto→resolvido (uma conversa reaberta soma mais de um chamado) — por isso o segundo número pode ser maior.
        </p>
      )}

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
                    {(detalhamentoCompleto ? perfComparativo : perfComparativo.slice(0, 3)).map((r) => (
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
                {perfComparativo.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setDetalhamentoCompleto((v) => !v)}
                    className="mt-3 text-sm font-semibold text-forest-700 hover:text-forest-600 dark:text-forest-300"
                  >
                    {detalhamentoCompleto ? "Ver menos" : `Ver mais (${perfComparativo.length - 3})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      </div>

      {mostrarRelatorio && (
        <RelatorioResultadosSac
          data={dadosRelatorio}
          onClose={() => setMostrarRelatorio(false)}
          exportandoPptx={exportandoPptx}
          onExportarPptx={async () => {
            setExportandoPptx(true);
            try {
              // pptxgenjs só baixa quando alguém de fato exporta (ver PR#11).
              const { exportResultadosSacToPptx } = await import("@/lib/exportPptx");
              await exportResultadosSacToPptx(dadosRelatorio);
            } finally {
              setExportandoPptx(false);
            }
          }}
        />
      )}
    </>
  );
}
