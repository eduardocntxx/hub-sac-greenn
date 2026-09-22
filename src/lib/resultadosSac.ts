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
  CsatDistribuicaoPorTipoCliente,
  AtendimentoComMetricas,
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
}

// Dado que o Hub não captura (Reclame Aqui, RA XGROW, Migrações) — sempre
// texto livre, preenchido à mão na Reunião de Resultados e persistido por
// lá (usePersistedState). Nunca inventar valor aqui: campo vazio vira
// "—"/nota "sem dado preenchido" no relatório. `nps.temas` continua manual
// de propósito (resumo qualitativo, sem campo estruturado equivalente em
// `nps_responses`) — os 4 números de NPS não são mais manuais, vêm de
// `npsResumo` (real, calculado a partir de `nps_responses`).
export interface ManualData {
  reclameAqui: { nota: string; totalReclamacoes: string; deltaPct: string; produtorDestaque: string };
  raXgrow: { totalReclamacoes: string; nota: string; notaAnterior: string };
  migracoes: { finalizadas: string; emProgresso: string; aguardando: string; plataformas: string };
  nps: { temas: string };
}

export function manualDataVazia(): ManualData {
  return {
    reclameAqui: { nota: "", totalReclamacoes: "", deltaPct: "", produtorDestaque: "" },
    raXgrow: { totalReclamacoes: "", nota: "", notaAnterior: "" },
    migracoes: { finalizadas: "", emProgresso: "", aguardando: "", plataformas: "" },
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

// inverso = true quando "menor é melhor" (tempo, taxa de transferência...)
export function deltaPercentual(atual: number | null | undefined, anterior: number | null | undefined, inverso: boolean): DeltaInfo | undefined {
  if (atual == null || anterior == null || anterior === 0) return undefined;
  const pct = ((atual - anterior) / anterior) * 100;
  const subiu = pct > 0;
  const bom = Math.abs(pct) < 0.5 ? null : inverso ? !subiu : subiu;
  const sinal = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return { texto: `${sinal}${Math.abs(pct).toFixed(1).replace(".", ",")}%`, bom };
}

// Pra métricas que já são percentuais (taxa de reabertura, FCR...) — a
// variação certa é em pontos percentuais, não "percentual do percentual".
export function deltaPontos(atual: number | null | undefined, anterior: number | null | undefined, inverso: boolean): DeltaInfo | undefined {
  if (atual == null || anterior == null) return undefined;
  const diff = atual - anterior;
  const bom = Math.abs(diff) < 0.05 ? null : inverso ? diff < 0 : diff > 0;
  const sinal = diff > 0 ? "+" : "";
  return { texto: `${sinal}${diff.toFixed(1).replace(".", ",")} p.p.`, bom };
}
