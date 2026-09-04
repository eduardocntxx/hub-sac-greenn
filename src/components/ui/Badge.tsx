import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "ausencia" | "brand" | "accent";

// Os tons "50" (fundo bem claro + texto escuro) são pensados pra superfície
// clara — no dark mode viram um preenchimento translúcido da própria cor
// de destaque sobre o fundo escuro, em vez do quase-branco original. O
// ring interno (mesma cor, bem sutil) dá um pouco de profundidade sem
// depender de sombra, que não combina com um chip tão pequeno.
const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink/60 ring-1 ring-inset ring-ink/10",
  success: "bg-forest-50 text-forest-700 ring-1 ring-inset ring-forest-600/10 dark:bg-forest-500/15 dark:text-forest-300 dark:ring-forest-400/20",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-400/20",
  danger: "bg-rust-50 text-rust-700 ring-1 ring-inset ring-rust-600/10 dark:bg-rust-500/15 dark:text-rust-400 dark:ring-rust-400/20",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/10 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-400/20",
  ausencia: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-400/20",
  brand: "bg-forest-700 text-white",
  accent: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/10 dark:bg-teal-500/15 dark:text-teal-400 dark:ring-teal-400/20",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
