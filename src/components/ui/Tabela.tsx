import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Tabelas no visual do Overview: cabeçalho cinza em caixa alta, linha que
// destaca no hover e linhas entrando em sequência (`motion.tr {...entradaLinha(i)}`).
export const CABECALHO_TABELA = "bg-sand-subtle text-[11px] uppercase tracking-wide text-ink/50";
export const LINHA_TABELA = "border-t border-sand-line transition-colors hover:bg-sand-subtle/60";

// Depois da 10ª linha, todas entram juntas (lista longa não fica esperando).
export const entradaLinha = (i: number) =>
  ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, ease: "easeOut", delay: Math.min(i, 10) * 0.03 },
  }) as const;

// Filtro com select nativo, no visual do app.
export function SelectPainel({ value, onChange, rotulo, children }: { value: string; onChange: (valor: string) => void; rotulo: string; children: ReactNode }) {
  const ativo = value !== "";
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{rotulo}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-xl border bg-sand-surface pl-3 pr-9 text-[12.5px] font-medium shadow-card outline-none transition hover:border-sand-line-strong focus-visible:ring-2 focus-visible:ring-forest-500/40",
          ativo ? "border-forest-500/40 bg-forest-500/[0.06] text-forest-700 dark:text-forest-300" : "border-sand-line text-ink/70"
        )}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 text-ink/40" />
    </label>
  );
}
