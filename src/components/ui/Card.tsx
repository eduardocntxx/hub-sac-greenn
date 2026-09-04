import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Barra de destaque (gradiente teal→forest) no topo do card — mesmo
  // motivo visual do metricCard() do relatório PPTX. Uso pontual em
  // cards de destaque (Login, gráfico de evolução da Home), não em
  // todo card — por isso opcional e default false.
  accent?: boolean;
}

export function Card({ className, accent, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-sand-line bg-sand-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover",
        accent && "relative overflow-hidden",
        className
      )}
      {...props}
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-400 to-forest-500"
        />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-base font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-ink/60", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
