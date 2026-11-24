import { useEffect, useRef } from "react";
import { useTransicao } from "@/components/TransicaoTela";

// Subaba dentro da página: o conteúdo vira como página de livro a partir da borda do lado
// da aba clicada (a fileira de abas fica parada).
export function useAnimacaoAba(atual: string, ordem: readonly string[]) {
  const { ativo } = useTransicao();
  const indice = Math.max(0, ordem.indexOf(atual));
  const anterior = useRef(indice);
  const lado = indice >= anterior.current ? "direita" : "esquerda";
  useEffect(() => {
    anterior.current = indice;
  }, [indice]);
  const giro = 10;
  return {
    initial: ativo
      ? false
      : { opacity: 0, rotateY: lado === "direita" ? giro : -giro, x: lado === "direita" ? "6%" : "-6%", z: -160, originX: lado === "direita" ? 0 : 1, transformPerspective: 1200 },
    animate: { opacity: 1, rotateY: 0, x: 0, z: 0, transformPerspective: 1200, transitionEnd: { transformPerspective: 0 } },
    transition: { type: "spring", stiffness: 170, damping: 20, opacity: { duration: 0.3 } },
  } as const;
}

/** Troca de mês (Calendário): a grade vira como página, pra frente ou pra trás conforme a
 * posição nova é maior ou menor que a anterior. */
export function useVirarPagina(posicao: number) {
  const { ativo } = useTransicao();
  const anterior = useRef(posicao);
  const frente = posicao >= anterior.current;
  useEffect(() => {
    anterior.current = posicao;
  }, [posicao]);
  return {
    initial: ativo ? false : { opacity: 0, rotateY: frente ? -70 : 70, originX: frente ? 0 : 1, transformPerspective: 1400 },
    animate: { opacity: 1, rotateY: 0, transformPerspective: 1400, transitionEnd: { transformPerspective: 0 } },
    transition: { type: "spring", stiffness: 140, damping: 18, opacity: { duration: 0.25 } },
  } as const;
}
