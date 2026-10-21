import type { ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Entrada } from "@/components/ui/Entrada";
import { BarraAnimada } from "@/components/ui/BarraAnimada";
import { NumeroAnimado } from "@/components/ui/NumeroAnimado";
import { cn } from "@/lib/utils";
import type { DeltaInfo } from "@/lib/resultadosSac";

// Indicador do visual do Overview, usado em toda a plataforma: ícone no chip,
// rótulo, número grande (contando até o valor), selo de variação, barra de
// proporção opcional e contexto. Tudo em cor sólida do tema, com par `dark:`
// nos tons de destaque.

export type Tom = "marca" | "bom" | "atencao" | "ruim";

const CHIP: Record<Tom, string> = {
  marca: "bg-forest-500/10 text-forest-600 dark:text-forest-300",
  bom: "bg-forest-500/10 text-forest-600 dark:text-forest-300",
  atencao: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ruim: "bg-rust-500/10 text-rust-600 dark:text-rust-400",
};
const VALOR: Record<Tom, string> = {
  marca: "text-ink",
  bom: "text-forest-600 dark:text-forest-300",
  atencao: "text-amber-600 dark:text-amber-400",
  ruim: "text-rust-600 dark:text-rust-400",
};
export const BARRA_TOM: Record<Tom, string> = {
  marca: "bg-forest-500",
  bom: "bg-forest-500",
  atencao: "bg-amber-500",
  ruim: "bg-rust-500",
};

export function ChipIcone({ icone: Icone, tom = "marca", className }: { icone: LucideIcon; tom?: Tom; className?: string }) {
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", CHIP[tom], className)}>
      <Icone size={16} />
    </span>
  );
}

// Variação num selo (verde = melhorou, vermelho = piorou, cinza = estável).
export function SeloDelta({ delta }: { delta?: DeltaInfo }) {
  if (!delta) return <span className="text-xs text-ink/40">sem comparação</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
        delta.bom === null
          ? "bg-sand-subtle text-ink/50"
          : delta.bom
            ? "bg-forest-500/10 text-forest-700 dark:text-forest-300"
            : "bg-rust-500/10 text-rust-600 dark:text-rust-400"
      )}
    >
      {delta.texto}
    </span>
  );
}

export function Indicador({
  icone,
  label,
  valor,
  tom = "marca",
  valorClassName,
  meta,
  barra,
  delta,
  semComparacao = false,
  contexto,
  indice = 0,
  onClick,
  dica,
  className,
}: {
  icone?: LucideIcon;
  label: string;
  valor: string;
  tom?: Tom;
  // Cor própria do número (ex.: promotor/detrator); sem ela vale o tom.
  valorClassName?: string;
  // Texto pequeno ao lado do número ("/ Meta 97%").
  meta?: string;
  // Percentual (0–100) desenhado como barra fina abaixo do número.
  barra?: number | null;
  delta?: DeltaInfo;
  // Mostra "sem comparação" quando não há período anterior.
  semComparacao?: boolean;
  contexto?: ReactNode;
  indice?: number;
  onClick?: () => void;
  dica?: string;
  className?: string;
}) {
  return (
    <Entrada indice={indice} elevar className="h-full">
      <Card
        className={cn("group flex h-full flex-col gap-2 p-4", onClick && "cursor-pointer hover:ring-1 hover:ring-forest-500/40", className)}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        title={dica}
      >
        <div className="flex items-center gap-2.5">
          {icone && <ChipIcone icone={icone} tom={tom} className="transition-transform duration-200 group-hover:scale-110" />}
          <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</span>
          {onClick && <ArrowUpRight size={13} className="shrink-0 text-ink/40 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-display text-[28px] font-bold leading-none tracking-tight tabular-nums", valorClassName ?? VALOR[tom])}>
            <NumeroAnimado texto={valor} />
          </span>
          {meta && <span className="text-[11px] text-ink/40">/ {meta}</span>}
        </div>
        {barra != null && (
          <span className="h-1.5 overflow-hidden rounded-full bg-sand-subtle">
            <BarraAnimada className={cn("rounded-full", BARRA_TOM[tom])} largura={barra} atraso={Math.min(indice, 10) * 0.06 + 0.1} />
          </span>
        )}
        {delta ? <SeloDelta delta={delta} /> : semComparacao ? <SeloDelta /> : null}
        {contexto && <div className="text-xs leading-snug text-ink/50">{contexto}</div>}
      </Card>
    </Entrada>
  );
}

// Bloco menor (dentro de um card): rótulo com ícone, valor e uma linha de apoio.
export function MetricaTile({ icone: Icone, label, valor, apoio, title, children }: { icone: LucideIcon; label: string; valor: string; apoio?: ReactNode; title?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl bg-sand-subtle/70 p-3" title={title}>
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink/50">
        <Icone size={13} className="shrink-0 text-forest-600 dark:text-forest-300" />
        {label}
      </p>
      <p className="mt-1.5 font-display text-[22px] font-bold leading-none tabular-nums text-ink">
        <NumeroAnimado texto={valor} />
      </p>
      {apoio && <div className="mt-1.5 text-xs text-ink/50">{apoio}</div>}
      {children}
    </div>
  );
}
