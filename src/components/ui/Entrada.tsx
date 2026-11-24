import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTransicao } from "@/components/TransicaoTela";

// Entrada em sequência: o cartão tomba do fundo pra frente (cascata, 45 ms entre um e
// outro). Durante a troca de tela não anima: ali a própria troca é a animação. `elevar`
// levanta 2px no hover. Quem pediu "reduzir movimento" vê sem animação (MotionConfig no App).
export function useEntradaCascata(indice: number) {
  const { ativo } = useTransicao();
  const atraso = Math.min(indice, 40) * 0.045;
  return {
    initial: ativo ? false : { opacity: 0, z: -140, rotateX: -35, transformPerspective: 800 },
    // transformPerspective volta a 0 no fim pra não sobrar transform no cartão.
    animate: { opacity: 1, z: 0, rotateX: 0, transformPerspective: 800, transitionEnd: { transformPerspective: 0 } },
    transition: { type: "spring", stiffness: 170, damping: 20, delay: atraso, opacity: { duration: 0.3, delay: atraso } },
  } as const;
}

export function Entrada({ indice = 0, elevar = false, className, children }: { indice?: number; elevar?: boolean; className?: string; children: ReactNode }) {
  const animacao = useEntradaCascata(indice);
  return (
    <motion.div data-entrada {...animacao} whileHover={elevar ? { y: -2 } : undefined} className={cn(className)}>
      {children}
    </motion.div>
  );
}
