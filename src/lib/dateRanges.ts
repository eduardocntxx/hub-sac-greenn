export type PeriodoPreset =
  | "hoje"
  | "ontem"
  | "semana_atual"
  | "7dias"
  | "mes_atual"
  | "30dias"
  | "ano_atual"
  | "personalizado";

export const PERIODO_LABELS: Record<PeriodoPreset, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  semana_atual: "Esta semana",
  "7dias": "Últimos 7 dias",
  mes_atual: "Este mês",
  "30dias": "Últimos 30 dias",
  ano_atual: "Este ano",
  personalizado: "Personalizado",
};

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function resolvePeriodo(
  preset: PeriodoPreset,
  personalizado?: { inicio: string; fim: string }
): { inicio: Date; fim: Date } {
  const hoje = new Date();

  switch (preset) {
    case "hoje":
      return { inicio: startOfDay(hoje), fim: endOfDay(hoje) };
    case "ontem": {
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      return { inicio: startOfDay(ontem), fim: endOfDay(ontem) };
    }
    case "semana_atual": {
      const dow = hoje.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() + diff);
      return { inicio: startOfDay(inicio), fim: endOfDay(hoje) };
    }
    case "7dias": {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 6);
      return { inicio: startOfDay(inicio), fim: endOfDay(hoje) };
    }
    case "30dias": {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 29);
      return { inicio: startOfDay(inicio), fim: endOfDay(hoje) };
    }
    case "mes_atual": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return { inicio: startOfDay(inicio), fim: endOfDay(hoje) };
    }
    case "ano_atual": {
      const inicio = new Date(hoje.getFullYear(), 0, 1);
      return { inicio: startOfDay(inicio), fim: endOfDay(hoje) };
    }
    case "personalizado": {
      if (!personalizado?.inicio || !personalizado?.fim) {
        return { inicio: startOfDay(hoje), fim: endOfDay(hoje) };
      }
      // "+T00:00:00" força o parse em horário LOCAL — sem isso,
      // new Date("2026-08-31") é interpretado como UTC (spec ECMA-262 pra
      // string só-data), e em qualquer fuso atrás de UTC (Brasil, UTC-3)
      // isso vira 30/08 21h local: startOfDay/endOfDay operam no dia local
      // errado, um dia pra trás do que o usuário selecionou no input.
      return {
        inicio: startOfDay(new Date(personalizado.inicio + "T00:00:00")),
        fim: endOfDay(new Date(personalizado.fim + "T00:00:00")),
      };
    }
  }
}

/** Retorna o período anterior de mesma duração, para calcular evolução. */
export function periodoAnterior(inicio: Date, fim: Date) {
  const duracaoMs = fim.getTime() - inicio.getTime();
  const fimAnterior = new Date(inicio.getTime() - 1);
  const inicioAnterior = new Date(fimAnterior.getTime() - duracaoMs);
  return { inicio: inicioAnterior, fim: fimAnterior };
}
