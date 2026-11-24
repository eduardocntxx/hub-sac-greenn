import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTransicao } from "@/components/TransicaoTela";

// Painel escuro do título de cada tela (Marca forte, 2026-11-23). A classe `dark` faz o
// que está dentro (botões, período, selos) usar as cores do tema escuro, legíveis no verde.
// `text-ink` recalcula a cor do texto aqui dentro: sem ele, o que não tem cor própria (opções
// do seletor de período) herdava a cor escura do tema claro e sumia no fundo escuro.
// O círculo no canto é um recorte duro (cor sólida), não um degradê.
export const PAINEL_TITULO =
  "dark relative rounded-3xl bg-forest-800 text-ink bg-[radial-gradient(circle_at_94%_-30%,rgba(255,255,255,0.05)_0_210px,transparent_211px)] px-7 pb-[30px] pt-7 shadow-painel dark:bg-forest-950";

// Título de tela como camada à parte na troca de tela (paralaxe): vem de mais perto e um
// pouco antes do conteúdo, e sai mais rápido e mais longe.
export function TituloPagina({ children }: { children: ReactNode }) {
  const { ativo, tipo } = useTransicao();
  return (
    <motion.h1
      className="font-display text-display text-white"
      initial={ativo ? (tipo === "voltar" ? { z: -270, opacity: 0, filter: "blur(6px)", transformPerspective: 900 } : { z: 210, y: -9, opacity: 0, filter: "blur(14px)", transformPerspective: 900 }) : false}
      animate={{ z: 0, y: 0, opacity: 1, filter: "blur(0px)", transformPerspective: 900, transitionEnd: { filter: "none", transformPerspective: 0 } }}
      exit={{ ...(tipo === "voltar" ? { z: 180, y: -9, filter: "blur(14px)" } : { z: -270, filter: "blur(6px)" }), opacity: 0, transformPerspective: 900, transition: { duration: 0.3, ease: [0.55, 0, 0.45, 1] } }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.02, opacity: { duration: 0.3, delay: 0.02 } }}
    >
      {children}
    </motion.h1>
  );
}

// Cabeçalho de tela: título, uma linha de explicação e as ações (período, filtros, botões)
// à direita, num painel verde-escuro.
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
    <div className={cn("flex flex-wrap items-start justify-between gap-3", PAINEL_TITULO, className)}>
      <div className="flex min-w-0 items-center gap-3">
        {antes}
        <div className="min-w-0">
          <TituloPagina>{titulo}</TituloPagina>
          {subtitulo && <div className="mt-1 text-sm text-white/65">{subtitulo}</div>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
    </div>
  );
}
