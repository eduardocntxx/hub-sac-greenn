import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDelta(delta?: number) {
  if (delta === undefined) return null;
  const sinal = delta > 0 ? "+" : "";
  return `${sinal}${delta.toFixed(1)}%`;
}

export type ClassificacaoCsat = "Promotor" | "Neutro" | "Detrator";

// csat_results.classificacao_csat é texto cru gravado pelo n8n, não uma
// coluna gerada — e o vocabulário mudou ao longo do tempo sem migração:
// parte do dado tem "Promotor"/"Neutro"/"Detrator", parte tem os rótulos
// reais da pesquisa da Crisp ("Muito satisfeito", "Satisfeito", "Muito
// insatisfeito"...). Nunca comparar contra esse texto — sempre derivar de
// `nota` (sempre confiável, 1 a 5), mesmo corte de sempre (nota>=4 boas,
// =3 neutra, <=2 ruim — igual csat_distribuicao_notas() no banco).
export function classificacaoPorNota(nota: number | null | undefined): ClassificacaoCsat | null {
  if (nota === null || nota === undefined) return null;
  if (nota >= 4) return "Promotor";
  if (nota === 3) return "Neutro";
  return "Detrator";
}

// Primeiro nome pra rótulo curto (ex: gráfico) — se duas pessoas tiverem o
// mesmo primeiro nome (ex: duas "Ana"), desambigua com a inicial do
// sobrenome ("Ana F.", "Ana P.") em vez de mostrar o mesmo rótulo 2x.
export function nomesCurtosDisambiguados(nomesCompletos: string[]): string[] {
  const partes = nomesCompletos.map((n) => n.trim().split(/\s+/));
  const contagemPrimeiroNome = new Map<string, number>();
  partes.forEach((p) => contagemPrimeiroNome.set(p[0], (contagemPrimeiroNome.get(p[0]) ?? 0) + 1));
  return partes.map((p) => {
    const repetido = (contagemPrimeiroNome.get(p[0]) ?? 0) > 1;
    if (repetido && p.length > 1) return `${p[0]} ${p[1][0]}.`;
    return p[0];
  });
}
