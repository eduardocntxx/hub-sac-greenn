import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "ausencia" | "brand";

// Os tons "50" (fundo bem claro + texto escuro) são pensados pra superfície
// clara — no dark mode viram um preenchimento translúcido da própria cor
// de destaque sobre o fundo escuro, em vez do quase-branco original.
const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink/60",
  success: "bg-forest-50 text-forest-700 dark:bg-forest-500/15 dark:text-forest-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  danger: "bg-rust-50 text-rust-700 dark:bg-rust-500/15 dark:text-rust-400",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  ausencia: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  brand: "bg-forest-700 text-white",
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
