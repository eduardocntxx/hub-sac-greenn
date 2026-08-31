import type {
  ContagemPeriodo,
  TfrTtrPercentis,
  MetricaTipoCliente,
  AtendentePerformanceRow,
  CsatDistribuicao,
  ReaberturaResumo,
  TransferenciasResumo,
  FcrRecontatoResumo,
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
