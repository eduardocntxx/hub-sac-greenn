const MIN = 60;
const HORA = 3600;
const DIA = 86400;
const SEMANA = 604800;
const MES = 2592000; // 30 dias — aproximação, sem tentar acompanhar mês corrido

/**
 * Converte segundos em um formato compacto e legível. Acima de 24h passa a
 * mostrar dias (e semanas/meses pra durações ainda maiores) em vez de só
 * acumular horas — "2d 22h 5min" é mais legível que "70h 5min 14s".
 * Exemplos: 75 → "1min 15s" · 3600 → "1h" · 3725 → "1h 2min 5s" ·
 * 252314 → "2d 22h 5min" · 864000 → "1sem 3d" · 3888000 → "1mês 2sem"
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) return "—";

  const total = Math.round(totalSeconds);

  if (total >= MES) {
    const meses = Math.floor(total / MES);
    const semanas = Math.floor((total % MES) / SEMANA);
    const partes = [`${meses}mês`];
    if (semanas > 0) partes.push(`${semanas}sem`);
    return partes.join(" ");
  }
  if (total >= SEMANA) {
    const semanas = Math.floor(total / SEMANA);
    const dias = Math.floor((total % SEMANA) / DIA);
    const partes = [`${semanas}sem`];
    if (dias > 0) partes.push(`${dias}d`);
    return partes.join(" ");
  }
  if (total >= DIA) {
    const dias = Math.floor(total / DIA);
    const h = Math.floor((total % DIA) / HORA);
    const min = Math.floor((total % HORA) / MIN);
    const partes = [`${dias}d`];
    if (h > 0) partes.push(`${h}h`);
    if (min > 0) partes.push(`${min}min`);
    return partes.join(" ");
  }

  const h = Math.floor(total / HORA);
  const min = Math.floor((total % HORA) / MIN);
  const s = total % MIN;

  const partes: string[] = [];
  if (h > 0) partes.push(`${h}h`);
  if (min > 0) partes.push(`${min}min`);
  if (s > 0 || partes.length === 0) partes.push(`${s}s`);

  return partes.join(" ");
}

/** Mesma formatação, mas a partir de um valor já em minutos (com casas decimais). */
export function formatDurationFromMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return "—";
  return formatDuration(totalMinutes * 60);
}
