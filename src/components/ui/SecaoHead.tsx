import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Cabeçalho padrão de seção: título + uma linha de explicação + "?" com a
// definição (no lugar de textos escondidos em `title`).
export function SecaoHead({ titulo, subtitulo, ajuda, acao, className }: { titulo: ReactNode; subtitulo?: ReactNode; ajuda?: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div>
        <h2 className="font-display text-[15px] font-bold text-ink">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-[12.5px] text-ink/50">{subtitulo}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {acao}
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </div>
    </div>
  );
}

export function Ajuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="O que significa"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border border-sand-line-strong text-xs font-bold text-ink/50 transition hover:text-ink",
          aberto && "bg-sand-subtle text-ink"
        )}
      >
        ?
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-8 z-20 w-72 origin-top-right rounded-xl border border-sand-line-strong bg-sand-surface p-3 text-xs leading-relaxed text-ink/60 shadow-float"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
