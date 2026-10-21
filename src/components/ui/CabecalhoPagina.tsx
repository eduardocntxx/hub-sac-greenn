import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Cabeçalho de tela do visual do Overview: título, uma linha de explicação e
// as ações (período, filtros, botões) à direita. Entra com um fade curto.
export function CabecalhoPagina({
  titulo,
  subtitulo,
  acoes,
  antes,
  className,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  // Elemento à esquerda do título (ex.: avatar).
  antes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex min-w-0 items-center gap-3"
      >
        {antes}
        <div className="min-w-0">
          <h1 className="font-display text-display text-ink">{titulo}</h1>
          {subtitulo && <div className="mt-1 text-sm text-ink/60">{subtitulo}</div>}
        </div>
      </motion.div>
      {acoes && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.08 }}
          className="flex flex-wrap items-center gap-3"
        >
          {acoes}
        </motion.div>
      )}
    </div>
  );
}
