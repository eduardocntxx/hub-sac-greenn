import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BarChartDatum {
  label: string;
  value: number;
  displayValue?: string;
}

// Faixas padrão pra valores 0–100 (%): verde = bom, amber = médio, rust = baixo.
// Gráficos com outra escala (nota 0–5, 0–10...) devem passar getColorClass próprio.
// Cor sólida (redesign 2026-09-05, antes gradiente) — mais plano/minimalista;
// mantém o mesmo semáforo (verde/amber/rust).
export function corPorFaixa(value: number, alto = 80, medio = 50) {
  if (value >= alto) return "bg-forest-500";
  if (value >= medio) return "bg-amber-500";
  return "bg-rust-500";
}

// Delay escalonado por índice, com teto — sem o teto, a última barra de
// uma série longa (ex: evolução de 30 dias) só começaria a animar depois
// de mais de 1s.
function delayEntrada(i: number) {
  return Math.min(i * 0.03, 0.6);
}

interface BarChartProps {
  data: BarChartDatum[];
  getColorClass?: (value: number, index: number) => string;
  height?: number;
  className?: string;
}

export function BarChart({ data, getColorClass = corPorFaixa, height = 160, className }: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className={cn("flex gap-2 overflow-x-auto", className)} style={{ height }}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex min-w-[36px] flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink/70 tabular-nums">
            {d.displayValue ?? d.value}
          </span>
          <div className="flex w-full flex-1 flex-col justify-end">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max((Math.abs(d.value) / max) * 100, 4)}%` }}
              transition={{ duration: 0.5, delay: delayEntrada(i), ease: "easeOut" }}
              className={cn("w-full rounded-t-md", getColorClass(d.value, i))}
            />
          </div>
          <span className="text-[10px] text-ink/40">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

interface HorizontalBarChartProps extends BarChartProps {
  labelWidth?: number;
  onBarClick?: (label: string, index: number) => void;
  isSelected?: (label: string, index: number) => boolean;
}

// Barras horizontais ("escadinha") — cada linha tem sua própria altura fixa,
// então nomes/rótulos de tamanho bem diferente não empurram as barras pra
// alturas diferentes como acontecia no BarChart vertical (rótulo comprido
// quebrando linha só nessa coluna). Ordenar `data` por valor decrescente
// antes de passar pra ter o efeito de escada.
export function HorizontalBarChart({
  data,
  getColorClass = corPorFaixa,
  className,
  labelWidth = 104,
  onBarClick,
  isSelected,
}: HorizontalBarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {data.map((d, i) => {
        const selecionado = isSelected?.(d.label, i) ?? false;
        return (
          <div
            key={`${d.label}-${i}`}
            onClick={onBarClick ? () => onBarClick(d.label, i) : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md",
              onBarClick && "cursor-pointer",
              selecionado && "bg-forest-50 ring-1 ring-forest-300 dark:bg-forest-500/15 dark:ring-forest-500/40"
            )}
          >
            <span
              className="shrink-0 truncate text-[11px] text-ink/60"
              style={{ width: labelWidth }}
              title={d.label}
            >
              {d.label}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-sand-bg">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max((Math.abs(d.value) / max) * 100, 4)}%` }}
                transition={{ duration: 0.5, delay: delayEntrada(i), ease: "easeOut" }}
                className={cn("h-full rounded-md", getColorClass(d.value, i))}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] font-semibold text-ink/70 tabular-nums">
              {d.displayValue ?? d.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
