import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DialogProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper padrão para os modais da plataforma (substitui o markup
 * `fixed inset-0 ... bg-ink/40` + `<Card>` replicado manualmente em cada
 * página). Monta junto com o `{condicao && <Dialog ...>}` do chamador —
 * não tem prop `open` própria. Fecha com Escape ou clique no backdrop, e
 * expõe `role="dialog"`/`aria-modal` para leitores de tela.
 */
export function Dialog({ onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-sand-line bg-sand-surface p-5 shadow-float outline-none",
          className
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
