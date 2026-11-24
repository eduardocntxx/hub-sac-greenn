import { useEffect } from "react";
import { reduzirMovimento } from "@/lib/animacoes";
import { restoDaTransicao } from "@/lib/transicaoAtiva";

// Cartões e linhas que aparecem logo depois de uma ação (dados chegando, aba, menu abrindo)
// entram em cascata, tombando pra frente. Durante a troca de tela não: o mergulho já é a
// animação. Quem tem entrada própria (Entrada, PainelCard) fica de fora.
const ITENS = '[data-ui="card"], tbody > tr, [data-cascata]';
const ONDE = '#conteudo-tela, [role="dialog"], [data-cascata-area]';
const JA_ANIMADO = "[data-entrada]";
const QUADROS: Keyframe[] = [
  { transform: "perspective(800px) translateZ(-140px) rotateX(-35deg)", opacity: 0 },
  { transform: "perspective(800px) translateZ(0) rotateX(0)", opacity: 1 },
];
const MAXIMO = 40;
const PASSO = 45;

export function useCascata() {
  useEffect(() => {
    if (reduzirMovimento()) return;
    // Só anima o que aparece até 3 s depois de um clique ou do fim da troca de tela.
    let janelaAte = performance.now() + 3000;
    const abrirJanela = () => {
      janelaAte = performance.now() + 3000;
    };

    let fila: Element[] = [];
    let agendado = false;
    const cascata = () => {
      agendado = false;
      const unicos = [...new Set(fila)].filter((el) => el.isConnected);
      fila = [];
      // Só o de fora: um cartão com itens dentro entra inteiro, não cada pedaço.
      const soltos = unicos.filter((el) => !unicos.some((o) => o !== el && o.contains(el)));
      let k = 0;
      for (const el of soltos) {
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
        if (el.closest(JA_ANIMADO)) continue;
        if (k >= MAXIMO) break;
        el.animate(QUADROS, { duration: 620, delay: k * PASSO, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        k++;
      }
    };
    const observador = new MutationObserver((mudancas) => {
      const resto = restoDaTransicao();
      if (resto > 0) {
        janelaAte = performance.now() + resto + 3000;
        return;
      }
      if (performance.now() > janelaAte) return;
      for (const m of mudancas) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element) || fila.length > 300) return;
          if (n.matches(ITENS) && n.closest(ONDE)) fila.push(n);
          n.querySelectorAll(ITENS).forEach((x) => {
            if (x.closest(ONDE)) fila.push(x);
          });
        });
      }
      if (fila.length && !agendado) {
        agendado = true;
        requestAnimationFrame(cascata);
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", abrirJanela, true);
    return () => {
      observador.disconnect();
      document.removeEventListener("pointerdown", abrirJanela, true);
    };
  }, []);
}
