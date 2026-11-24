import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ChipIcone } from "@/components/ui/Indicador";
import { useEntradaCascata } from "@/components/ui/Entrada";
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
  const animacao = useEntradaCascata(indice);
  return (
    <motion.div
      data-entrada
      data-ui="card"
      {...animacao}
      className={cn("flex flex-col gap-3 rounded-[20px] bg-sand-surface p-4 shadow-card transition-shadow hover:shadow-card-hover dark:ring-1 dark:ring-sand-line", className)}
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
