import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DialogProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

// Quantos pop-ups estão abertos: enquanto houver um, a tela de trás recua
// (body[data-dialogo], CSS em index.css).
let abertos = 0;

/**
 * Wrapper padrão para os modais da plataforma (substitui o markup
 * `fixed inset-0 ... bg-ink/40` + `<Card>` replicado manualmente em cada
 * página). Monta junto com o `{condicao && <Dialog ...>}` do chamador —
 * não tem prop `open` própria. Fecha com Escape ou clique no backdrop, e
 * expõe `role="dialog"`/`aria-modal` para leitores de tela. Vai num portal no
 * body: assim nenhum transform da página muda a posição dele.
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

  useEffect(() => {
    abertos += 1;
    document.body.dataset.dialogo = "aberto";
    return () => {
      abertos -= 1;
      if (abertos === 0) delete document.body.dataset.dialogo;
    };
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        // Vem do fundo com mola enquanto a tela de trás recua.
        initial={{ opacity: 0, z: -200, rotateX: 10, filter: "blur(10px)", transformPerspective: 1000 }}
        animate={{ opacity: 1, z: 0, rotateX: 0, filter: "blur(0px)", transformPerspective: 1000, transitionEnd: { filter: "none" } }}
        transition={{ type: "spring", stiffness: 170, damping: 20, opacity: { duration: 0.3 } }}
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
    </motion.div>,
    document.body
  );
}
