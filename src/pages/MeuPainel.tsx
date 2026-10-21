import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Star,
  MessagesSquare,
  Timer,
  Coins,
  GraduationCap,
  Target,
  CheckCircle2,
  PhoneCall,
  ArrowUpDown,
  Gauge,
  RotateCcw,
  ArrowLeftRight,
  Zap,
  Users,
  TrendingUp,
  MessageSquareHeart,
  MessageCircle,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { classificacaoPorNota, cn } from "@/lib/utils";
import { Kpi } from "@/components/ui/Kpi";
import { Indicador, MetricaTile } from "@/components/ui/Indicador";
import { PainelCard } from "@/components/ui/PainelCard";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { BarraAnimada, ColunaAnimada } from "@/components/ui/BarraAnimada";
import { NumeroAnimado } from "@/components/ui/NumeroAnimado";
import { CABECALHO_TABELA, LINHA_TABELA, entradaLinha } from "@/components/ui/Tabela";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { DateRangePopover } from "@/components/ui/DateRangePopover";
import {
  fetchCsatForUser,
  fetchMissionProgress,
  fetchCourseProgressForUser,
  fetchMinhasConversasMetricas,
  fetchTfrTtrPercentis,
  fetchFcrRecontatoResumo,
  fetchReaberturaResumo,
  fetchTransferenciasResumo,
  fetchRelogioPosse,
  fetchMetricasPorTipoCliente,
} from "@/services/api";
import {
  resolvePeriodo,
  periodoAnterior,
  type PeriodoPreset,
} from "@/lib/dateRanges";
import { formatDurationHoras } from "@/lib/formatDuration";
import type { DbCsatResult } from "@/types/database";
import { CsatDetalheDialog } from "@/components/CsatDetalheDialog";
import { usePersistedState } from "@/hooks/usePersistedState";

function media(vals: (number | null)[]) {
  const validos = vals.filter((v): v is number => v !== null);
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}

function variacao(atual: number | null, anterior: number | null) {
  if (atual === null || anterior === null || anterior === 0) return undefined;
  return ((atual - anterior) / anterior) * 100;
}

function saudacao() {
  const hora = new Date().getHours();
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

const META_SATISFACAO = 97;
// Amostra mínima antes de tratar o CSAT individual como estatisticamente
// representativo — com poucas avaliações, uma nota ruim isolada distorce
// muito o percentual.
const MINIMO_AMOSTRAS_CSAT = 5;

type SortField = "data_hora" | "nota" | "classificacao_csat";

function calcularSatisfacao(rows: DbCsatResult[]) {
  const notas = rows.map((c) => c.nota).filter((n): n is number => n !== null);
  const satisfeitos = notas.filter((n) => n >= 4).length;
  return { total: notas.length, pct: notas.length ? (satisfeitos / notas.length) * 100 : null };
}

export default function MeuPainel() {
  const { user } = useAuth();
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("meuPainel:preset", "mes_atual");
  const [personalizado, setPersonalizado] = usePersistedState("meuPainel:personalizado", { inicio: "", fim: "" });
  const [sortField, setSortField] = useState<SortField>("data_hora");
  const [sortAsc, setSortAsc] = useState(false);
  const [detalhe, setDetalhe] = useState<DbCsatResult | null>(null);

  const { inicio, fim } = useMemo(
    () => resolvePeriodo(preset, personalizado),
    [preset, personalizado]
  );
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(
    () => periodoAnterior(inicio, fim),
    [inicio, fim]
  );

  const { data: csat, isLoading: loadingCsat } = useQuery({
    queryKey: ["csat", user?.id],
    queryFn: () => fetchCsatForUser(user!.email),
    enabled: Boolean(user?.id),
  });

  const { data: conversas, isLoading: loadingConversas } = useQuery({
    queryKey: ["minhas-conversas-metricas", user?.email, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchMinhasConversasMetricas(inicio, fim),
    enabled: Boolean(user?.email),
  });
  const { data: conversasAnterior } = useQuery({
    queryKey: ["minhas-conversas-metricas-anterior", user?.email, inicioAnterior.toISOString()],
    queryFn: () => fetchMinhasConversasMetricas(inicioAnterior, fimAnterior),
    enabled: Boolean(user?.email),
  });

  const { data: missions, isLoading: loadingMissions } = useQuery({
    queryKey: ["mission-progress", user?.id],
    queryFn: () => fetchMissionProgress(user!.id),
    enabled: Boolean(user?.id),
  });

  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ["course-progress", user?.id],
    queryFn: () => fetchCourseProgressForUser(user!.id),
    enabled: Boolean(user?.id),
  });

  // Performance individual (mesmas fontes do Overview, filtradas pro meu nome
  // canônico) — SLA, FCR, reabertura, transferências que eu originei,
  // produtividade (atendimentos/hora via posse). "Tempo ativo" pessoal fica
  // de fora — o Crisp não expõe presença real, e uma soma de horário
  // cadastrado por pessoa ainda não existe (só a cobertura do time inteiro,
  // que não faz sentido mostrar aqui).
  const { data: slaPessoal, isLoading: loadingSla } = useQuery({
    queryKey: ["tfr-ttr-percentis", user?.nome, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchTfrTtrPercentis(inicio, fim, undefined, [user!.nome]),
    enabled: Boolean(user?.nome),
  });

  const { data: fcrPessoal, isLoading: loadingFcr } = useQuery({
    queryKey: ["fcr-recontato-resumo", user?.nome, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchFcrRecontatoResumo(inicio, fim, undefined, [user!.nome]),
    enabled: Boolean(user?.nome),
  });

  const { data: reaberturaPessoal, isLoading: loadingReaberturaPessoal } = useQuery({
    queryKey: ["reabertura-resumo", user?.nome, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchReaberturaResumo(inicio, fim, undefined, [user!.nome]),
    enabled: Boolean(user?.nome),
  });

  const { data: transferenciasPessoal, isLoading: loadingTransferenciasPessoal } = useQuery({
    queryKey: ["transferencias-resumo", user?.nome, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchTransferenciasResumo(inicio, fim, undefined, [user!.nome]),
    enabled: Boolean(user?.nome),
  });

  const { data: posseTime } = useQuery({
    queryKey: ["relogio-posse", inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchRelogioPosse(inicio, fim),
  });

  const { data: metricasTipoCliente, isLoading: loadingTipoCliente } = useQuery({
    queryKey: ["metricas-tipo-cliente", user?.nome, inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchMetricasPorTipoCliente(inicio, fim, undefined, "uteis", [user!.nome]),
    enabled: Boolean(user?.nome),
  });

  const csatPeriodo = useMemo(
    () => (csat ?? []).filter((c) => {
      const d = new Date(c.data_hora);
      return d >= inicio && d <= fim;
    }),
    [csat, inicio, fim]
  );
  const csatAnterior = useMemo(
    () => (csat ?? []).filter((c) => {
      const d = new Date(c.data_hora);
      return d >= inicioAnterior && d <= fimAnterior;
    }),
    [csat, inicioAnterior, fimAnterior]
  );

  const evolucaoMensal = useMemo(() => {
    const grupos = new Map<string, number[]>();
    (csat ?? []).forEach((c) => {
      if (c.nota === null) return;
      const mes = c.data_hora.slice(0, 7);
      const arr = grupos.get(mes) ?? [];
      arr.push(c.nota);
      grupos.set(mes, arr);
    });
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([mes, notasDoMes]) => {
        const satisf = notasDoMes.filter((n) => n >= 4).length;
        const pct = Math.round((satisf / notasDoMes.length) * 100);
        return { mes: mes.slice(5), pct };
      });
  }, [csat]);

  const linhasOrdenadas = useMemo(() => {
    const copia = [...csatPeriodo];
    copia.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "data_hora") {
        va = a.data_hora;
        vb = b.data_hora;
      } else if (sortField === "nota") {
        va = a.nota ?? -1;
        vb = b.nota ?? -1;
      } else {
        va = classificacaoPorNota(a.nota) ?? "";
        vb = classificacaoPorNota(b.nota) ?? "";
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return copia;
  }, [csatPeriodo, sortField, sortAsc]);

  if (!user) return null;

  const atual = calcularSatisfacao(csatPeriodo);
  const anteriorStats = calcularSatisfacao(csatAnterior);
  const csatAmostraPequena = atual.total > 0 && atual.total < MINIMO_AMOSTRAS_CSAT;

  const conversasPeriodo = conversas ?? [];
  const conversasAnteriorLista = conversasAnterior ?? [];
  // "Total de chamados"/"Tempo de resolução" refletem a carteira atual (conversas
  // que estão comigo agora); "Tempo de primeira resposta" usa a lista inteira,
  // porque conta sempre que fui eu quem respondeu primeiro, mesmo se a conversa
  // foi repassada depois — mesmo critério usado no ranking de Overview.
  const conversasPeriodoCarteira = conversasPeriodo.filter((c) => c.minha_carteira);
  const conversasAnteriorCarteira = conversasAnteriorLista.filter((c) => c.minha_carteira);
  // "Chamado" conta cada ciclo aberto→resolvido, não a conversa inteira — uma
  // conversa reaberta N vezes soma 1+N chamados (mesmo critério de Overview/Analytics).
  const totalChamadosCarteira = conversasPeriodoCarteira.reduce((acc, c) => acc + 1 + (c.reopened_count ?? 0), 0);
  const totalChamadosAnteriorCarteira = conversasAnteriorCarteira.reduce((acc, c) => acc + 1 + (c.reopened_count ?? 0), 0);
  const tempoPrimeiraResposta = media(conversasPeriodo.map((c) => c.tempo_primeira_resposta_seg));
  const tempoPrimeiraRespostaAnterior = media(conversasAnteriorLista.map((c) => c.tempo_primeira_resposta_seg));
  const tempoResolucao = media(conversasPeriodoCarteira.map((c) => c.tempo_resolucao_seg));
  const tempoResolucaoAnterior = media(conversasAnteriorCarteira.map((c) => c.tempo_resolucao_seg));

  const posseMinutosPessoal = (posseTime ?? []).find((p) => p.atendente === user.nome)?.minutos_posse ?? null;
  const atendPorHoraPessoal =
    posseMinutosPessoal && posseMinutosPessoal > 0
      ? conversasPeriodoCarteira.length / (posseMinutosPessoal / 60)
      : null;

  const missoesConcluidas = (missions ?? []).filter(
    (m) => m.atual >= (m.missions?.meta ?? Infinity)
  );
  const missoesEmAndamento = (missions ?? []).filter(
    (m) => m.atual < (m.missions?.meta ?? Infinity)
  );
  const totalMissoes = missoesConcluidas.length + missoesEmAndamento.length;
  const totalMoedas = missoesConcluidas.reduce((acc, m) => acc + (m.missions?.moedas ?? 0), 0);
  const cursosConcluidos = (courses ?? []).filter((c) => c.concluido).length;
  const totalCursos = courses?.length ?? 0;

  function alternarOrdenacao(campo: SortField) {
    if (sortField === campo) setSortAsc(!sortAsc);
    else {
      setSortField(campo);
      setSortAsc(false);
    }
  }

  const primeiroNome = user.nome.split(" ")[0];
  const csatTom = atual.pct === null ? "marca" : atual.pct >= META_SATISFACAO ? "bom" : "atencao";

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        antes={<Avatar nome={user.nome} size="lg" />}
        titulo={`${saudacao()}, ${primeiroNome}`}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {user.cargo} · {user.equipe}
            <Badge tone="success" className="h-5 gap-1 px-2 py-0 text-[11px]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-500 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-forest-500" />
              </span>
              Online
            </Badge>
          </span>
        }
        acoes={
          <>
            <motion.div
              whileHover={{ scale: 1.04 }}
              className="flex h-8 items-center gap-1.5 rounded-full bg-amber-500/10 px-3 text-[13px] font-semibold text-amber-700 dark:text-amber-400"
            >
              <Coins size={14} /> <span className="tabular-nums"><NumeroAnimado texto={String(totalMoedas)} /></span> moedas
            </motion.div>
            <DateRangePopover
              preset={preset}
              personalizado={personalizado}
              onChangePreset={setPreset}
              onChangePersonalizado={setPersonalizado}
            />
          </>
        }
      />

      <section>
        <SecaoHead
          titulo="Indicadores do período"
          subtitulo="Suas conversas e avaliações, comparadas com o período anterior."
          ajuda={
            <>
              <p><b>Chamados e conversas:</b> as conversas que estão com você agora (sua carteira). Cada reabertura soma um chamado.</p>
              <p className="mt-2"><b>Tempo de primeira resposta:</b> só mensagens de atendente humano — respostas automáticas do bot da Crisp são ignoradas. Conta sempre que foi você quem respondeu primeiro, mesmo que a conversa tenha sido repassada.</p>
              <p className="mt-2"><b>CSAT:</b> avaliações 4 e 5 sobre o total, pela data da avaliação. Meta de {META_SATISFACAO}%.</p>
            </>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi
            indice={0}
            label="Total de chamados"
            value={loadingConversas ? "..." : String(totalChamadosCarteira)}
            delta={variacao(totalChamadosCarteira, totalChamadosAnteriorCarteira || null)}
            icon={PhoneCall}
          />
          <Kpi
            indice={1}
            label="Total de conversas"
            value={loadingConversas ? "..." : String(conversasPeriodoCarteira.length)}
            delta={variacao(conversasPeriodoCarteira.length, conversasAnteriorCarteira.length || null)}
            icon={MessageCircle}
          />
          <Kpi
            indice={2}
            label="Tempo de primeira resposta"
            value={loadingConversas ? "..." : formatDurationHoras(tempoPrimeiraResposta)}
            delta={variacao(tempoPrimeiraResposta, tempoPrimeiraRespostaAnterior)}
            invertDeltaColor
            icon={Timer}
          />
          <Kpi
            indice={3}
            label="Tempo de resolução"
            value={loadingConversas ? "..." : formatDurationHoras(tempoResolucao)}
            delta={variacao(tempoResolucao, tempoResolucaoAnterior)}
            invertDeltaColor
            icon={Clock}
          />
          <Kpi
            indice={4}
            label="Total de avaliações"
            value={loadingCsat ? "..." : String(atual.total)}
            delta={variacao(atual.total, anteriorStats.total || null)}
            icon={MessagesSquare}
          />
          <Kpi
            indice={5}
            label="CSAT"
            value={loadingCsat ? "..." : atual.pct !== null ? `${atual.pct.toFixed(2)}%` : "—"}
            delta={variacao(atual.pct, anteriorStats.pct)}
            meta={`Meta ${META_SATISFACAO.toFixed(2)}%`}
            icon={Star}
            tom={csatTom}
            barra={atual.pct}
            contexto={csatAmostraPequena ? <span className="text-amber-600 dark:text-amber-400">Só {atual.total} avaliação{atual.total > 1 ? "ões" : ""} — amostra pequena</span> : undefined}
          />
        </div>
      </section>

      <section>
        <SecaoHead
          titulo="Performance individual"
          subtitulo="Mesmas regras do Overview, só com os seus atendimentos."
          ajuda={
            <>
              <p><b>SLA:</b> percentual de 1ª respostas e de resoluções dentro do prazo.</p>
              <p className="mt-2"><b>FCR e reabertura:</b> "mesmo motivo" é texto idêntico do tópico dentro de 7 dias.</p>
              <p className="mt-2"><b>Produtividade:</b> conversas por hora em que a conversa esteve com você. "Tempo de trabalho ativo" pessoal não aparece — o Crisp não expõe a presença real do operador.</p>
            </>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Indicador
            indice={0}
            icone={Gauge}
            label="SLA (1ª resposta / resolução)"
            valor={loadingSla ? "..." : `${slaPessoal?.tfr_sla_pct?.toFixed(0) ?? "—"}% / ${slaPessoal?.ttr_sla_pct?.toFixed(0) ?? "—"}%`}
            barra={loadingSla ? null : slaPessoal?.tfr_sla_pct ?? null}
          />
          <Indicador
            indice={1}
            icone={CheckCircle2}
            label="FCR"
            valor={loadingFcr ? "..." : !fcrPessoal || fcrPessoal.total_elegiveis === 0 ? "—" : `${fcrPessoal.fcr_pct?.toFixed(0) ?? "—"}%`}
            barra={!loadingFcr && fcrPessoal && fcrPessoal.total_elegiveis > 0 ? fcrPessoal.fcr_pct : null}
            contexto={loadingFcr ? undefined : !fcrPessoal || fcrPessoal.total_elegiveis === 0 ? "Sem elegíveis" : `${fcrPessoal.total_elegiveis} elegíveis`}
          />
          <Indicador
            indice={2}
            icone={RotateCcw}
            label="Reaberturas"
            valor={loadingReaberturaPessoal ? "..." : String(reaberturaPessoal?.total_reabertos ?? 0)}
            contexto={loadingReaberturaPessoal ? undefined : `de ${reaberturaPessoal?.total_resolvidos ?? 0} conversas resolvidas`}
          />
          <Indicador
            indice={3}
            icone={ArrowLeftRight}
            label="Transferências que você originou"
            valor={loadingTransferenciasPessoal ? "..." : String(transferenciasPessoal?.total_eventos ?? 0)}
          />
          <Indicador
            indice={4}
            icone={Zap}
            label="Produtividade"
            valor={atendPorHoraPessoal !== null ? atendPorHoraPessoal.toFixed(1) : "—"}
            contexto="atendimentos/hora de posse"
          />
        </div>
      </section>

      {(metricasTipoCliente && metricasTipoCliente.length > 0) || loadingTipoCliente ? (
        <section>
          <SecaoHead
            titulo="Meus atendimentos por tipo de cliente"
            subtitulo="Tempo médio útil de 1ª resposta e de resolução."
            ajuda={<p>Só aparece o tipo de cliente que existir de verdade nos seus atendimentos do período — mesma lógica da seção "Por tipo de cliente" do Overview, escopada pra você.</p>}
          />
          {loadingTipoCliente ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {metricasTipoCliente!.map((m, i) => (
                <PainelCard key={m.tipo_cliente} indice={i} icone={Users} titulo={m.tipo_cliente} subtitulo={`${m.chamados} chamados`}>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricaTile icone={Timer} label="TFR médio" valor={formatDurationHoras(m.tfr_media_seg)} />
                    <MetricaTile icone={Clock} label="TTR médio" valor={formatDurationHoras(m.ttr_media_seg)} />
                  </div>
                </PainelCard>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <PainelCard indice={0} icone={Target} titulo="Missões" subtitulo={loadingMissions ? "Carregando..." : `${totalMissoes} no total`}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70"><Target size={14} /> Em andamento</span>
              <Badge tone="warning">{loadingMissions ? "..." : missoesEmAndamento.length}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70"><CheckCircle2 size={14} /> Concluídas</span>
              <Badge tone="success">{loadingMissions ? "..." : missoesConcluidas.length}</Badge>
            </div>
            {totalMissoes > 0 && (
              <span className="block h-1.5 overflow-hidden rounded-full bg-sand-subtle">
                <BarraAnimada className="rounded-full bg-forest-500" largura={(missoesConcluidas.length / totalMissoes) * 100} atraso={0.15} />
              </span>
            )}
          </div>
        </PainelCard>

        <PainelCard indice={1} icone={GraduationCap} titulo="Cursos" subtitulo={`De ${totalCursos} cursos disponíveis`}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-ink/70"><GraduationCap size={14} /> Concluídos</span>
              <Badge tone="success">{loadingCourses ? "..." : cursosConcluidos}</Badge>
            </div>
            {totalCursos > 0 && (
              <span className="block h-1.5 overflow-hidden rounded-full bg-sand-subtle">
                <BarraAnimada className="rounded-full bg-forest-500" largura={(cursosConcluidos / totalCursos) * 100} atraso={0.2} />
              </span>
            )}
          </div>
        </PainelCard>

        <PainelCard indice={2} icone={TrendingUp} titulo="Evolução do CSAT" subtitulo="Últimos meses, % de avaliações 4 e 5">
          {evolucaoMensal.length === 0 ? (
            <p className="text-sm text-ink/50">Sem dados suficientes ainda.</p>
          ) : (
            <div className="flex h-32 items-stretch gap-2">
              {evolucaoMensal.map((m, i) => (
                <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold tabular-nums text-ink/60">{m.pct}%</span>
                  <div className="flex w-full flex-1 items-end">
                    <ColunaAnimada
                      altura={Math.max(m.pct, 4)}
                      className={cn("rounded-t-md", m.pct >= 80 ? "bg-forest-500" : "bg-rust-500/70")}
                      atraso={0.1 + i * 0.05}
                    />
                  </div>
                  <span className="text-[10px] uppercase text-ink/40">{m.mes}</span>
                </div>
              ))}
            </div>
          )}
        </PainelCard>
      </div>

      <PainelCard icone={MessageSquareHeart} titulo="Últimas avaliações de CSAT no período" subtitulo="Clique numa linha para ver o detalhe" className="overflow-hidden p-0 [&>div:first-child]:px-4 [&>div:first-child]:pt-4">
        {loadingCsat ? (
          <p className="px-4 pb-4 text-sm text-ink/50">Carregando...</p>
        ) : csatPeriodo.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-ink/50">Nenhuma avaliação neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={cn("text-left", CABECALHO_TABELA)}>
                <tr>
                  <th className="cursor-pointer select-none px-4 py-2.5 font-semibold" onClick={() => alternarOrdenacao("data_hora")}>
                    <span className="flex items-center gap-1">Data <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">Categoria</th>
                  <th className="cursor-pointer select-none px-4 py-2.5 font-semibold" onClick={() => alternarOrdenacao("nota")}>
                    <span className="flex items-center gap-1">Nota <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="cursor-pointer select-none px-4 py-2.5 font-semibold" onClick={() => alternarOrdenacao("classificacao_csat")}>
                    <span className="flex items-center gap-1">Classificação <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="px-4 py-2.5 font-semibold">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {linhasOrdenadas.slice(0, 8).map((c, i) => (
                  <motion.tr
                    key={c.id}
                    {...entradaLinha(i)}
                    onClick={() => setDetalhe(c)}
                    className={cn("cursor-pointer", LINHA_TABELA)}
                  >
                    <td className="px-4 py-3 text-ink/60">
                      {new Date(c.data_hora).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-ink">{c.atendente}</td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{c.cliente ?? "—"}</p>
                      <p className="text-xs text-ink/40">{c.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-ink/60">{c.topico ?? "—"}</td>
                    <td className="px-4 py-3 font-display font-bold tabular-nums text-ink">{c.nota ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          classificacaoPorNota(c.nota) === "Promotor"
                            ? "success"
                            : classificacaoPorNota(c.nota) === "Detrator"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {classificacaoPorNota(c.nota) ?? "—"}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-ink/60" title={c.comentario ?? undefined}>
                      {c.comentario ?? "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PainelCard>

      {detalhe && <CsatDetalheDialog registro={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
