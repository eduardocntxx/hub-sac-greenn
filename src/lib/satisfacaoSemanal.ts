import type { SatisfacaoSemana } from "@/services/api";

// Derivados de `satisfacao_semanal` (CSAT × NPS por semana, quarta a terça), usados pela página de NPS, pela
// pré-visualização da Reunião de Resultados e pelo PPTX — a conta fica num lugar só.

export interface SemanaSatisfacao {
  semana: string;
  label: string; // "07/10"
  intervalo: string; // "07/10 a 13/10"
  emAndamento: boolean; // a semana ainda não terminou
  csatEnviadas: number;
  csatRespondidas: number;
  taxaResposta: number | null; // respondidas ÷ enviadas, %
  csatAvaliacoes: number;
  pctPositivas: number | null; // nota 4–5 ÷ avaliações, %
  pctNegativas: number | null; // nota 1–3
  npsRespostas: number | null; // null = sem acesso ao NPS
  pctPromotores: number | null;
  pctNeutros: number | null;
  pctDetratores: number | null;
  npsScore: number | null; // % promotores − % detratores
  semNps: boolean; // 0 respostas de NPS na semana (com acesso)
}

const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const pct = (parte: number | null, total: number | null) => (parte == null || !total ? null : (parte / total) * 100);

export function resumirSemanas(linhas: SatisfacaoSemana[], agora = new Date()): SemanaSatisfacao[] {
  return linhas.map((r) => {
    const inicio = new Date(r.semana + "T00:00:00");
    const ultimoDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7);
    const avaliacoes = r.csat_positivas + r.csat_negativas;
    const pctProm = pct(r.nps_promotores, r.nps_respostas);
    const pctDetr = pct(r.nps_detratores, r.nps_respostas);
    return {
      semana: r.semana,
      label: dm(inicio),
      intervalo: `${dm(inicio)} a ${dm(ultimoDia)}`,
      emAndamento: fim > agora,
      csatEnviadas: r.csat_enviadas,
      csatRespondidas: r.csat_respondidas,
      taxaResposta: pct(r.csat_respondidas, r.csat_enviadas),
      csatAvaliacoes: avaliacoes,
      pctPositivas: pct(r.csat_positivas, avaliacoes),
      pctNegativas: pct(r.csat_negativas, avaliacoes),
      npsRespostas: r.nps_respostas,
      pctPromotores: pctProm,
      pctNeutros: pct(r.nps_neutros, r.nps_respostas),
      pctDetratores: pctDetr,
      npsScore: pctProm != null && pctDetr != null ? Math.round(pctProm - pctDetr) : null,
      semNps: r.nps_respostas === 0,
    };
  });
}

// 1ª semana completa no banco atual: o projeto foi migrado em 01/09/2026 e antes disso o CSAT é parcial; o NPS
// começa a chegar em 01/09.
const INICIO_DADOS = new Date(2026, 8, 2);

// Janela das últimas `semanas` semanas (quarta a terça) que termina na semana que contém `fim`, sem passar de
// INICIO_DADOS.
export function janelaSemanal(fim: Date, semanas = 8): { inicio: Date; fim: Date } {
  const quarta = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  quarta.setDate(quarta.getDate() - ((quarta.getDay() + 4) % 7) - (semanas - 1) * 7);
  return { inicio: quarta < INICIO_DADOS ? INICIO_DADOS : quarta, fim };
}

// Quantas semanas seguidas, contando da mais recente para trás, não tiveram nenhuma resposta de NPS.
export function semanasSemNpsNoFim(lista: SemanaSatisfacao[]): number {
  let n = 0;
  for (let i = lista.length - 1; i >= 0 && lista[i].semNps; i--) n++;
  return n;
}
