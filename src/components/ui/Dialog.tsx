import { useEffect, useRef, type ReactNode } from "react";
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-xl rounded-2xl border border-sand-line bg-sand-surface p-5 shadow-float outline-none",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
