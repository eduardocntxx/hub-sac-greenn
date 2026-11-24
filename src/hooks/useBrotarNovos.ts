import { useEffect, useRef, type RefObject } from "react";
import { brotar, chamaUrgente } from "@/lib/efeitos";

/** Itens com data-novo-id dentro do container: o que aparecer depois da primeira carga
 * (comunicado chegando em tempo real) brota no lugar; com data-urgente, ganha a chama. */
export function useBrotarNovos(container: RefObject<HTMLElement | null>, ids: string[]) {
  const vistos = useRef<Set<string> | null>(null);
  const chave = ids.join(",");
  useEffect(() => {
    const atuais = new Set(chave ? chave.split(",") : []);
    const antes = vistos.current;
    vistos.current = atuais;
    if (!antes) return;
    atuais.forEach((id) => {
      if (antes.has(id)) return;
      const el = container.current?.querySelector<HTMLElement>(`[data-novo-id="${CSS.escape(id)}"]`);
      if (!el) return;
      brotar(el);
      if (el.dataset.urgente !== undefined) chamaUrgente(el);
    });
  }, [chave, container]);
}
