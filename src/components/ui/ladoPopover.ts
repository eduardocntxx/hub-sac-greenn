// Popover preso à direita do botão abre pra esquerda. Quando o botão está perto do menu lateral
// (os botões do painel do título quebram pra linha de baixo em tela estreita), não cabe e ficava
// embaixo do menu: aí abre pra direita.
const LIMITE_ESQUERDO = 72 + 16; // menu lateral recolhido + folga

export const POPOVER_A_ESQUERDA = "right-0 origin-top-right";

export function ladoDoPopover(botao: Element | null, largura: number): string {
  const r = botao?.getBoundingClientRect();
  return r && r.right - largura < LIMITE_ESQUERDO ? "left-0 origin-top-left" : POPOVER_A_ESQUERDA;
}
