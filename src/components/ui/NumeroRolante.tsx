import { useLayoutEffect, useRef } from "react";
import { reduzirMovimento } from "@/lib/animacoes";
import { restoDaTransicao } from "@/lib/transicaoAtiva";

// Duas voltas de 0 a 9: a fita para no dígito da segunda volta, então sempre gira um pouco.
const FITA = Array.from({ length: 20 }, (_, i) => i % 10);

type Parte = { digito: number } | { texto: string };

/** Quebra o texto em dígitos (cada um vira uma fita que rola) e trechos fixos. */
export function partesDoNumero(texto: string): Parte[] {
  const partes: Parte[] = [];
  for (const ch of texto) {
    if (ch >= "0" && ch <= "9") {
      partes.push({ digito: Number(ch) });
      continue;
    }
    const ultima = partes[partes.length - 1];
    if (ultima && "texto" in ultima) ultima.texto += ch;
    else partes.push({ texto: ch });
  }
  return partes;
}

/** Número que rola como contador mecânico ao aparecer e quando muda (trazido da Central).
 * Só os dígitos andam; vírgula, % e unidade ficam parados. */
export function NumeroRolante({ valor }: { valor: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (reduzirMovimento() || !ref.current) return;
    ref.current.querySelectorAll<HTMLElement>("[data-fita]").forEach((fita, i) => {
      const d = Number(fita.dataset.fita);
      fita.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${10 + d}em)` }], {
        duration: 900 + i * 180,
        delay: restoDaTransicao(),
        easing: "cubic-bezier(.2,.75,.25,1.06)",
        fill: "backwards",
      });
    });
  }, [valor]);
  return (
    <>
      <span className="sr-only">{valor}</span>
      <span ref={ref} aria-hidden className="inline-flex items-end leading-none">
        {partesDoNumero(valor).map((p, i) =>
          "digito" in p ? (
            <span key={i} className="inline-block h-[1em] overflow-hidden">
              <span data-fita={p.digito} className="flex flex-col" style={{ transform: `translateY(-${10 + p.digito}em)` }}>
                {FITA.map((n, k) => (
                  <span key={k} className="h-[1em]">{n}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i} className="whitespace-pre">{p.texto}</span>
          )
        )}
      </span>
    </>
  );
}
