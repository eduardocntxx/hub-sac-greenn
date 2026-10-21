import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// Barra que cresce de 0 até a largura final ao aparecer (sem animar para
// quem pediu "reduzir movimento": o MotionConfig só cobre transform).
export function BarraAnimada({ largura, className, atraso = 0 }: { largura: number; className: string; atraso?: number }) {
  const reduzir = useReducedMotion();
  return (
    <motion.i
      className={cn("block h-full", className)}
      initial={reduzir ? false : { width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, largura))}%` }}
      transition={{ duration: 0.6, ease: "easeOut", delay: atraso }}
    />
  );
}

// Coluna vertical que sobe de 0 até a altura final (o pai precisa ter altura definida).
export function ColunaAnimada({ altura, className, atraso = 0 }: { altura: number; className: string; atraso?: number }) {
  const reduzir = useReducedMotion();
  return (
    <motion.i
      className={cn("block w-full", className)}
      initial={reduzir ? false : { height: 0 }}
      animate={{ height: `${Math.max(0, Math.min(100, altura))}%` }}
      transition={{ duration: 0.6, ease: "easeOut", delay: atraso }}
    />
  );
}

export interface BarraDado {
  label: string;
  value: number;
  displayValue?: string;
}

// Barras horizontais em pílula: crescem do zero, a primeira (líder) tem a cor
// cheia e as demais um tom mais leve; ao passar o mouse a linha destaca e as
// outras esmaecem.
export function BarrasRanking({
  data,
  cor = "bg-forest-500",
  labelWidth = 140,
  className,
  onBarClick,
  isSelected,
}: {
  data: BarraDado[];
  cor?: string;
  labelWidth?: number;
  className?: string;
  onBarClick?: (label: string, index: number) => void;
  isSelected?: (label: string, index: number) => boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className={cn("flex flex-col gap-1", className)} onMouseLeave={() => setAtivo(null)}>
      {data.map((d, i) => {
        const selecionado = isSelected?.(d.label, i) ?? false;
        const atraso = Math.min(i * 0.04, 0.4);
        return (
          <motion.div
            key={`${d.label}-${i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: atraso }}
          >
            <div
              onMouseEnter={() => setAtivo(i)}
              onClick={onBarClick ? () => onBarClick(d.label, i) : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-1.5 transition-[opacity,background-color] duration-150 hover:bg-sand-subtle/70",
                onBarClick && "cursor-pointer",
                ativo !== null && ativo !== i && "opacity-50",
                selecionado && "bg-forest-500/10 ring-1 ring-forest-500/30"
              )}
            >
              <span className="shrink-0 truncate text-[12.5px] text-ink/70" style={{ width: labelWidth }} title={d.label}>
                {d.label}
              </span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand-subtle">
                <BarraAnimada
                  className={cn("rounded-full transition-opacity duration-150", cor, i > 0 && ativo !== i && "opacity-70")}
                  largura={Math.max((Math.abs(d.value) / max) * 100, 4)}
                  atraso={atraso}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-display text-[13px] font-bold tabular-nums text-ink">{d.displayValue ?? d.value}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
