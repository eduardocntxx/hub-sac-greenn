import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { formatDelta } from "@/lib/utils";
import { Indicador, type Tom } from "@/components/ui/Indicador";

interface KpiProps {
  label: string;
  value: string;
  delta?: number;
  meta?: string;
  icon?: LucideIcon;
  invertDeltaColor?: boolean; // ex: tempo médio, onde delta negativo é bom
  valueClassName?: string; // ex: "text-forest-600" pra colorir o valor (promotor/neutro/detrator)
  indice?: number; // posição na grade, para a entrada em sequência
  tom?: Tom;
  barra?: number | null; // percentual (0–100) desenhado como barra abaixo do número
  contexto?: ReactNode;
}

// Mesma API de sempre; desde 2026-10-20 desenha o `Indicador` (visual do Overview).
export function Kpi({ label, value, delta, meta, icon, invertDeltaColor, valueClassName, indice, tom, barra, contexto }: KpiProps) {
  const deltaInfo =
    delta === undefined
      ? undefined
      : { texto: `${formatDelta(delta)} vs. período anterior`, bom: delta === 0 ? null : invertDeltaColor ? delta < 0 : delta > 0 };
  return (
    <Indicador
      icone={icon}
      label={label}
      valor={value}
      valorClassName={valueClassName}
      meta={meta}
      delta={deltaInfo}
      indice={indice}
      tom={tom}
      barra={barra}
      contexto={contexto}
    />
  );
}
