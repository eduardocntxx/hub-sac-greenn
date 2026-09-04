import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatDelta, cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

interface KpiProps {
  label: string;
  value: string;
  delta?: number;
  meta?: string;
  icon?: LucideIcon;
  invertDeltaColor?: boolean; // ex: tempo médio, onde delta negativo é bom
  valueClassName?: string; // ex: "text-forest-600" pra colorir o valor (promotor/neutro/detrator)
}

export function Kpi({ label, value, delta, meta, icon: Icon, invertDeltaColor, valueClassName }: KpiProps) {
  const isPositive = (delta ?? 0) >= 0;
  const isGood = invertDeltaColor ? !isPositive : isPositive;

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink/50">{label}</span>
        {Icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-600 ring-1 ring-inset ring-forest-600/10 dark:bg-forest-500/15 dark:text-forest-300 dark:ring-forest-400/20">
            <Icon size={13} />
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`font-display text-kpi-lg tracking-tight tabular-nums ${valueClassName ?? "text-ink"}`}>
          {value}
        </span>
        {meta && <span className="text-[11px] text-ink/40">/ {meta}</span>}
      </div>
      {/* Reserva o espaço da linha de variação mesmo sem delta, para todos os cards terem a mesma altura */}
      <p
        className={cn(
          "mt-1.5 flex items-center gap-1 text-[12px] font-medium",
          delta === undefined ? "invisible" : isGood ? "text-forest-600" : "text-rust-500"
        )}
      >
        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {delta !== undefined ? `${formatDelta(delta)} vs. período anterior` : "—"}
      </p>
    </Card>
  );
}
