import type {
  ContagemPeriodo,
  TfrTtrPercentis,
  VelocidadePorTipoCliente,
  AtendentePerformanceRow,
  CsatDistribuicao,
  ReaberturaResumo,
  RelogioEsperaCliente,
  TempoRespostaBot,
  BacklogFaixa,
  AtendenteCsatDistribuicao,
  CsatEnviosPorAtendente,
  CsatDistribuicaoPorTipoCliente,
  AtendimentoComMetricas,
  MigracoesResumo,
  MigracaoPorPlataforma,
  CsatFunilCanal,
  AtendidoNaoResolvido,
} from "@/services/api";

export interface NpsResumo {
  total: number;
  promotores: number;
  neutros: number;
  detratores: number;
}

export interface ResultadosSacPeriodoData {
  contagem: ContagemPeriodo | null;
  percentis: TfrTtrPercentis | null;
  // `velocidade_por_tipo_cliente()` — vem com "Geral" + 1 linha por tag real
  // (+"Sem tipo"), média em horas úteis E corridas juntas, sem precisar de
  // toggle nem chamada em dobro (trocado de `metricas_por_tipo_cliente()`
  // em 2026-09-22, que só tinha o modo "uteis").
  tipoCliente: VelocidadePorTipoCliente[];
  rankingHumano: AtendentePerformanceRow[];
  csat: CsatDistribuicao | null;
  // CSAT por tipo de cliente — amostra via crisp_id (ver fetchCsatDistribuicaoPorTipoCliente),
  // não a contagem exata. Só "atual"/"anterior" fazem sentido comparar
  // (diferente de csatPorAtendenteDist, sem par "anterior" em lugar nenhum
  // do relatório).
  csatPorTipoCliente: CsatDistribuicaoPorTipoCliente[];
  reabertura: ReaberturaResumo | null;
  relogioEspera: RelogioEsperaCliente | null;
  horasExpedienteMin: number | null;
  tempoRespostaBot: TempoRespostaBot | null;
  // Números reais de `nps_responses` (módulo /nps do Hub) pro período —
  // deixou de ser manual em 2026-09-08, ver ManualData abaixo.
  npsResumo: NpsResumo | null;
  // "SAC — Migrações" deixou de ser manual em 2026-09-23 — sincronizado via
  // n8n a partir do projeto "Centralização" (gestao-tickets) pra
  // `public.migracoes_sync` no Hub SAC (ver CLAUDE.md seção 10).
  // `migracoesPorPlataforma` só faz sentido no período atual (é uma lista
  // de casos, não um agregado — mesmo motivo de `topTfrProdutor`/`Final`
  // não terem par "anterior"), mas fica no tipo por período mesmo assim
  // pra não precisar de um campo solto fora de atual/anterior só pra isso.
  migracoes: MigracoesResumo | null;
  migracoesPorPlataforma: MigracaoPorPlataforma[];
  // Funil do CSAT por canal (conversas → resolvidas → pesquisa enviada →
  // respondida) e conversas atendidas por humano ainda abertas, por dono.
  // Os dois explicam o volume baixo de avaliações (slide "Por que temos
  // poucas avaliações"); o "anterior" serve pros deltas.
  csatFunil: CsatFunilCanal[];
  atendidoNaoResolvido: AtendidoNaoResolvido[];
}

// Dado que o Hub não captura (Reclame Aqui, RA XGROW) — sempre texto
// livre, preenchido à mão na Reunião de Resultados e persistido por lá
// (usePersistedState). Nunca inventar valor aqui: campo vazio vira "—"/nota
// "sem dado preenchido" no relatório. `nps.temas` continua manual de
// propósito (resumo qualitativo, sem campo estruturado equivalente em
// `nps_responses`) — os 4 números de NPS não são mais manuais, vêm de
// `npsResumo` (real, calculado a partir de `nps_responses`). Migrações
// saiu daqui em 2026-09-23 — também passou a ser real, ver `migracoes`/
// `migracoesPorPlataforma` acima.
export interface ManualData {
  reclameAqui: { nota: string; totalReclamacoes: string; deltaPct: string; produtorDestaque: string };
  raXgrow: { totalReclamacoes: string; nota: string; notaAnterior: string };
  nps: { temas: string };
}

export function manualDataVazia(): ManualData {
  return {
    reclameAqui: { nota: "", totalReclamacoes: "", deltaPct: "", produtorDestaque: "" },
    raXgrow: { totalReclamacoes: "", nota: "", notaAnterior: "" },
    nps: { temas: "" },
  };
}

export interface ResultadosSacData {
  periodoAtualLabel: string;
  periodoAnteriorLabel: string;
  atual: ResultadosSacPeriodoData;
  anterior: ResultadosSacPeriodoData;
  // Todos os atendentes com CSAT no período atual (inclui o bot) — a
  // tabela de Ranking usa só o top 3 humano de `atual.rankingHumano`, mas a
  // tabela de CSAT mostra todo mundo com avaliação, o bot incluso.
  csatPorAtendente: AtendentePerformanceRow[];
  // Boas/neutras/ruins por atendente (nota, não só a média) — usado pro
  // CSAT% no Ranking e pra quebra Promotor/Neutro/Detrator do card do Bot.
  // Período atual só, mesmo motivo de `csatPorAtendente` não ter par
  // "anterior" (nenhuma tela mostra delta pra esse recorte).
  csatPorAtendenteDist: AtendenteCsatDistribuicao[];
  // Pesquisas enviadas × respondidas por atendente (período atual só).
  csatEnvios: CsatEnviosPorAtendente[];
  // Top 5 chamados com maior tempo até 1ª resposta no período — mesma
  // função/critério já usado na aba Atendimentos do Overview
  // (`atendimentos_com_metricas`, ordenar por "tfr" desc). Período atual
  // só (é uma lista de casos específicos, não um agregado — não existe
  // "top 5 do período anterior" pra comparar). Separado em duas listas
  // (Produtor / Cliente Final) por pedido do usuário — um único top 5
  // misto sempre ficava dominado por "Final" (maioria atendida só pelo
  // bot, TFR humano naturalmente mais longo, sem a mesma pressão de SLA
  // que Produtor tem), escondendo os casos de Produtor que de fato
  // importam pra essa análise.
  topTfrProdutor: AtendimentoComMetricas[];
  topTfrFinal: AtendimentoComMetricas[];
  // Backlog não é escopado por período (é sempre "o que está aberto agora"),
  // por isso fica fora de atual/anterior — não existe "backlog anterior".
  backlog: BacklogFaixa[];
  // Opcional: se não vier, o relatório mostra os blocos de "preencher
  // manualmente" como antes (nada foi estimado ou inventado).
  manual?: ManualData;
}

export function fmtNum(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString("pt-BR");
}

export function fmtPct1(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(1).replace(".", ",")}%`;
}

export interface DeltaInfo {
  texto: string;
  bom: boolean | null;
}

// Pedido do usuário em 2026-09-23: o card só mostrava a variação percentual
// ("-50,0%"), sem o valor absoluto do período anterior do lado — "500
// chamados, período anterior: -50% (1000)". `formatarAnterior` deixa cada
// call site escolher como formatar o valor cru do período anterior (conta
// simples usa o padrão `fmtNum`; duração usa `formatDuration`; métrica que
// já é percentual usa formatação de %) — sem isso, "1000" apareceria cru
// pra tudo que não é uma contagem simples.
const formatarAnteriorPadrao = (v: number) => fmtNum(Math.round(v));

// inverso = true quando "menor é melhor" (tempo, taxa de transferência...)
export function deltaPercentual(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  inverso: boolean,
  formatarAnterior: (v: number) => string = formatarAnteriorPadrao
): DeltaInfo | undefined {
  if (atual == null || anterior == null || anterior === 0) return undefined;
  const pct = ((atual - anterior) / anterior) * 100;
  const subiu = pct > 0;
  const bom = Math.abs(pct) < 0.5 ? null : inverso ? !subiu : subiu;
  const sinal = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return { texto: `${sinal}${Math.abs(pct).toFixed(1).replace(".", ",")}% (${formatarAnterior(anterior)})`, bom };
}

// Pra métricas que já são percentuais (taxa de reabertura, FCR...) — a
// variação certa é em pontos percentuais, não "percentual do percentual".
// Anterior já sai formatado como "%" por padrão (é sempre uma taxa 0-100).
export function deltaPontos(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  inverso: boolean,
  formatarAnterior: (v: number) => string = (v) => `${v.toFixed(1).replace(".", ",")}%`
): DeltaInfo | undefined {
  if (atual == null || anterior == null) return undefined;
  const diff = atual - anterior;
  const bom = Math.abs(diff) < 0.05 ? null : inverso ? diff < 0 : diff > 0;
  const sinal = diff > 0 ? "+" : "";
  return { texto: `${sinal}${diff.toFixed(1).replace(".", ",")} p.p. (${formatarAnterior(anterior)})`, bom };
}

// ---------- Funil do CSAT / atendido e não resolvido ----------
// Contas compartilhadas por PPTX e PDF — os dois formatos nunca podem
// mostrar número diferente pro mesmo período.

const NOME_BOT_RESULTADOS = "IA Greenn";

export function nomeCanal(canal: string): string {
  if (canal === "chat") return "Chat";
  if (canal === "email") return "E-mail";
  return canal;
}

export function somarFunil(lista: CsatFunilCanal[]): CsatFunilCanal {
  return lista.reduce(
    (t, r) => ({
      canal: "Total",
      conversas: t.conversas + r.conversas,
      com_humano: t.com_humano + r.com_humano,
      resolvidas: t.resolvidas + r.resolvidas,
      enviadas: t.enviadas + r.enviadas,
      respondidas: t.respondidas + r.respondidas,
    }),
    { canal: "Total", conversas: 0, com_humano: 0, resolvidas: 0, enviadas: 0, respondidas: 0 }
  );
}

// Respondidas ÷ resolvidas (em %). null quando não houve resolução.
export function taxaResposta(r: CsatFunilCanal | undefined): number | null {
  return r && r.resolvidas > 0 ? (r.respondidas / r.resolvidas) * 100 : null;
}

// Linhas do funil (canais, maior volume primeiro, até 4) + linha Total,
// cada uma já com a taxa e o delta em p.p. contra o período anterior.
export function linhasFunil(atual: CsatFunilCanal[], anterior: CsatFunilCanal[]) {
  const canais = [...atual].sort((a, b) => b.conversas - a.conversas).slice(0, 4);
  const total = somarFunil(atual);
  const totalAnt = anterior.length > 0 ? somarFunil(anterior) : undefined;
  return [...canais, total].map((r) => {
    const prev = r.canal === "Total" ? totalAnt : anterior.find((p) => p.canal === r.canal);
    const taxa = taxaResposta(r);
    return { ...r, total: r.canal === "Total", taxa, delta: deltaPontos(taxa, taxaResposta(prev), false) };
  });
}

// Atendido e não resolvido só com humanos (o bot fica de fora).
export function resumoAtendido(atual: AtendidoNaoResolvido[], anterior: AtendidoNaoResolvido[]) {
  const humanos = atual.filter((r) => r.atendente !== NOME_BOT_RESULTADOS);
  const humanosAnt = anterior.filter((r) => r.atendente !== NOME_BOT_RESULTADOS);
  const abertos = humanos.reduce((t, r) => t + r.abertos, 0);
  const abertosAnt = humanosAnt.reduce((t, r) => t + r.abertos, 0);
  const parados = humanos.reduce((t, r) => t + r.parados_48h, 0);
  return {
    porAtendente: [...humanos].sort((a, b) => b.abertos - a.abertos),
    abertos,
    parados,
    paradosPct: abertos > 0 ? (parados / abertos) * 100 : null,
    deltaAbertos: humanosAnt.length > 0 ? deltaPercentual(abertos, abertosAnt, true) : undefined,
  };
}
