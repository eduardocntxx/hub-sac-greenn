import type {
  ContagemPeriodo,
  TfrTtrPercentis,
  MetricaTipoCliente,
  AtendentePerformanceRow,
  CsatDistribuicao,
  ReaberturaResumo,
  TransferenciasResumo,
  FcrRecontatoResumo,
  RelogioEsperaCliente,
  TempoRespostaBot,
  BacklogFaixa,
} from "@/services/api";

export interface ResultadosSacPeriodoData {
  contagem: ContagemPeriodo | null;
  percentis: TfrTtrPercentis | null;
  tipoCliente: MetricaTipoCliente[];
  rankingHumano: AtendentePerformanceRow[];
  csat: CsatDistribuicao | null;
  reabertura: ReaberturaResumo | null;
  transferencias: TransferenciasResumo | null;
  fcr: FcrRecontatoResumo | null;
  relogioEspera: RelogioEsperaCliente | null;
  horasExpedienteMin: number | null;
  tempoRespostaBot: TempoRespostaBot | null;
}

// Dado que o Hub não captura (Reclame Aqui, RA XGROW, Migrações, NPS
// qualitativo) — sempre texto livre, preenchido à mão na Reunião de
// Resultados e persistido por lá (usePersistedState). Nunca inventar valor
// aqui: campo vazio vira "—"/nota "sem dado preenchido" no relatório.
export interface ManualData {
  reclameAqui: { nota: string; totalReclamacoes: string; deltaPct: string; produtorDestaque: string };
  raXgrow: { totalReclamacoes: string; nota: string; notaAnterior: string };
  migracoes: { finalizadas: string; emProgresso: string; aguardando: string; plataformas: string };
  nps: { contatados: string; detratores: string; neutros: string; promotores: string; temas: string };
}

export function manualDataVazia(): ManualData {
  return {
    reclameAqui: { nota: "", totalReclamacoes: "", deltaPct: "", produtorDestaque: "" },
    raXgrow: { totalReclamacoes: "", nota: "", notaAnterior: "" },
    migracoes: { finalizadas: "", emProgresso: "", aguardando: "", plataformas: "" },
    nps: { contatados: "", detratores: "", neutros: "", promotores: "", temas: "" },
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
