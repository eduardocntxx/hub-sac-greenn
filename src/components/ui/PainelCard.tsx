import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ChipIcone } from "@/components/ui/Indicador";
import { cn } from "@/lib/utils";

// Card com título do visual do Overview: chip com ícone, título, subtítulo e
// uma ação no canto; entra em sequência (`indice`) e ganha sombra no hover.
export function PainelCard({
  icone,
  titulo,
  subtitulo,
  acao,
  indice = 0,
  className,
  children,
}: {
  icone?: LucideIcon;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  indice?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: Math.min(indice, 10) * 0.06 }}
      className={cn("flex flex-col gap-3 rounded-2xl bg-sand-surface p-4 shadow-card ring-1 ring-sand-line transition-shadow hover:shadow-card-hover", className)}
    >
      <div className="flex items-center gap-2.5">
        {icone && <ChipIcone icone={icone} />}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold text-ink">{titulo}</h3>
          {subtitulo && <p className="text-[11.5px] text-ink/50">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </motion.div>
  );
}
