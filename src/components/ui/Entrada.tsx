import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Entrada em sequência do visual do Overview: fade + sobe 8px, `indice` define
// o atraso (teto de 10 itens). `elevar` levanta 2px no hover. Quem pediu
// "reduzir movimento" vê sem animação (MotionConfig no App).
export function Entrada({ indice = 0, elevar = false, className, children }: { indice?: number; elevar?: boolean; className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(indice, 10) * 0.06 }}
      whileHover={elevar ? { y: -2 } : undefined}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
