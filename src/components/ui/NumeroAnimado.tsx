import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Número que conta do valor anterior (ou de zero) até o valor final. Só anima
// formato sem ambiguidade (inteiro, milhar com ponto, porcentagem); tempo,
// "—" e texto aparecem direto. O último quadro é sempre o texto original,
// então a animação nunca muda o número exibido.
interface Formato {
  alvo: number;
  formatar: (n: number) => string;
}

function lerFormato(texto: string): Formato | null {
  if (/^\d+$/.test(texto)) return { alvo: Number(texto), formatar: (n) => String(Math.round(n)) };
  if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    return { alvo: Number(texto.replace(/\./g, "")), formatar: (n) => Math.round(n).toLocaleString("pt-BR") };
  }
  const decimal = texto.match(/^(\d+)([.,])(\d+)%$/);
  if (decimal) {
    const casas = decimal[3].length;
    return { alvo: Number(`${decimal[1]}.${decimal[3]}`), formatar: (n) => `${n.toFixed(casas).replace(".", decimal[2])}%` };
  }
  const inteiroPct = texto.match(/^(\d+)%$/);
  if (inteiroPct) return { alvo: Number(inteiroPct[1]), formatar: (n) => `${Math.round(n)}%` };
  return null;
}

export function NumeroAnimado({ texto, duracao = 0.8 }: { texto: string; duracao?: number }) {
  const reduzir = useReducedMotion();
  const [exibido, setExibido] = useState(() => {
    const formato = lerFormato(texto);
    return formato && !reduzir ? formato.formatar(0) : texto;
  });
  const anterior = useRef(0);

  useEffect(() => {
    const formato = lerFormato(texto);
    if (!formato || reduzir) {
      setExibido(texto);
      if (formato) anterior.current = formato.alvo;
      return;
    }
    const de = anterior.current;
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / (duracao * 1000));
      if (t < 1) {
        setExibido(formato.formatar(de + (formato.alvo - de) * (1 - Math.pow(1 - t, 3))));
        quadro = requestAnimationFrame(passo);
      } else {
        setExibido(texto);
        anterior.current = formato.alvo;
      }
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto, reduzir, duracao]);

  return (
    <>
      <span aria-hidden>{exibido}</span>
      <span className="sr-only">{texto}</span>
    </>
  );
}
