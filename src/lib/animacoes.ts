// Peças de animação trazidas da Central de Tickets: tipo da troca de tela, curvas, faíscas,
// estrelas e a troca de tema com sol e lua. Os efeitos de cada ação ficam em efeitos.ts.
// Tudo respeita o "reduzir movimento" do sistema.

export type Ponto = { x: number; y: number };

export function reduzirMovimento(): boolean {
  return (
    typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type TipoTransicao = "avancar" | "voltar" | "trocar";
export type Lado = "direita" | "esquerda";

/** Ordem dos itens no menu lateral: trocar entre eles gira o cilindro pro lado de quem vem
 * depois ou antes. Rota fora do menu (Perfil) é "mais fundo". */
const ORDEM_MENU = [
  "/",
  "/missoes",
  "/reuniao-resultados",
  "/performance",
  "/suporte-estrategico",
  "/cursos",
  "/documentacao",
  "/atualizacoes",
  "/helpdesks",
  "/calendario",
  "/outros-links",
  "/csat",
  "/reclame-aqui",
  "/nps",
  "/admin",
];

/** Primeiro trecho do caminho; "/meu-painel" é a mesma tela de "/". */
export function raizDaRota(caminho: string): string {
  const primeiro = caminho.split("/").filter(Boolean)[0];
  return !primeiro || primeiro === "meu-painel" ? "/" : `/${primeiro}`;
}

/** Tipo da troca de tela. Voltar pelo navegador sempre "volta"; entre itens do menu gira
 * o cilindro; entrar numa tela fora do menu avança e sair dela volta. */
export function tipoDaTransicao(
  de: string,
  para: string,
  voltando: boolean,
): { tipo: TipoTransicao; lado: Lado } {
  if (voltando) return { tipo: "voltar", lado: "esquerda" };
  const a = ORDEM_MENU.indexOf(raizDaRota(de));
  const b = ORDEM_MENU.indexOf(raizDaRota(para));
  if (a >= 0 && b >= 0) return { tipo: "trocar", lado: b >= a ? "direita" : "esquerda" };
  if (b < 0) return { tipo: "avancar", lado: "direita" };
  return { tipo: "voltar", lado: "esquerda" };
}

/** Curva (Bézier quadrática) de `de` até `para`, subindo no meio do caminho. `desvio`
 * empurra o ponto de controle pro lado, pra várias estrelas não seguirem a mesma linha. */
export function pontosDaCurva(de: Ponto, para: Ponto, n: number, desvio: number): Ponto[] {
  const altura = Math.max(80, Math.abs(para.x - de.x) * 0.25);
  const c = { x: (de.x + para.x) / 2 + desvio, y: Math.min(de.y, para.y) - altura };
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    const u = 1 - t;
    return {
      x: u * u * de.x + 2 * u * t * c.x + t * t * para.x,
      y: u * u * de.y + 2 * u * t * c.y + t * t * para.y,
    };
  });
}

export type Faisca = { dx: number; dy: number; tamanho: number; cor: string; giro: number };

const CORES_FAISCA = ["#fbbf24", "#f59e0b", "#fde68a", "#fb923c"];

/** Faíscas em dois anéis em volta do centro. `sorteio` (0 a 1) varia ângulo, distância,
 * tamanho e giro, pra explosão não sair sempre igual. */
export function faiscasDaExplosao(
  n: number,
  alcance: number,
  sorteio: () => number = Math.random,
): Faisca[] {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + sorteio() * 0.3;
    const dist = alcance * (i % 2 === 0 ? 1 : 0.6) * (0.8 + sorteio() * 0.4);
    return {
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist,
      tamanho: Math.round(6 + sorteio() * 8),
      cor: CORES_FAISCA[i % CORES_FAISCA.length],
      giro: (sorteio() - 0.5) * 360,
    };
  });
}

// ---------------------------------------------------------------- efeitos (DOM)

const SVG_ESTRELA =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
const SVG_SOL =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const SVG_LUA =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

/** Fundo de cada tema (--color-sand-bg de :root e .dark em index.css). */
const FUNDO = { claro: "rgb(240 242 245)", escuro: "rgb(0 12 11)" };

function elementoSolto(svg: string, tamanho: number, estilo: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:fixed;left:0;top:0;width:${tamanho}px;height:${tamanho}px;pointer-events:none;z-index:9999;${estilo}`;
  el.innerHTML = svg;
  document.body.appendChild(el);
  return el;
}

const centro = (r: DOMRect): Ponto => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function pulsar(el: Element) {
  el.animate(
    [
      { transform: "scale(1)", filter: "none" },
      {
        transform: "scale(1.5) rotate(-12deg)",
        filter: "drop-shadow(0 0 10px rgba(251,191,36,.9))",
      },
      { transform: "scale(1)", filter: "none" },
    ],
    { duration: 520, easing: "cubic-bezier(.2,.8,.2,1.3)" },
  );
}

function explodir(c: Ponto, n: number, alcance: number, atraso = 0) {
  for (const f of faiscasDaExplosao(n, alcance)) {
    const meio = f.tamanho / 2;
    const el = elementoSolto(SVG_ESTRELA, f.tamanho, `color:${f.cor}`);
    el.animate(
      [
        { transform: `translate(${c.x - meio}px,${c.y - meio}px) scale(.3)`, opacity: 1 },
        {
          transform: `translate(${c.x - meio + f.dx}px,${c.y - meio + f.dy}px) scale(1) rotate(${f.giro}deg)`,
          opacity: 1,
          offset: 0.65,
        },
        {
          transform: `translate(${c.x - meio + f.dx * 1.15}px,${c.y - meio + f.dy * 1.15 + 10}px) scale(.5) rotate(${f.giro * 1.4}deg)`,
          opacity: 0,
        },
      ],
      { duration: 760, delay: atraso, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    ).onfinish = () => el.remove();
  }
}

/** Anel dourado que se abre a partir do centro. */
function onda(c: Ponto, diametro: number, atraso = 0) {
  const el = elementoSolto(
    "",
    diametro,
    `left:${c.x - diametro / 2}px;top:${c.y - diametro / 2}px;border:2px solid #fbbf24;border-radius:9999px`,
  );
  el.animate(
    [
      { transform: "scale(.2)", opacity: 0.9 },
      { transform: "scale(1)", opacity: 0 },
    ],
    { duration: 560, delay: atraso, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
  ).onfinish = () => el.remove();
}

/** As estrelas até a escolhida pulam em sequência; a escolhida dá um pulo maior, solta um
 * anel e uma chuva de faíscas. Nota máxima ganha explosão dobrada. */
export function estourar(alvo: Element, anteriores: Element[] = [], maxima = false) {
  if (reduzirMovimento()) return;
  const passo = 55;
  anteriores.forEach((el, i) =>
    el.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-8px) scale(1.25)" },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: 320, delay: i * passo, easing: "ease-out" },
    ),
  );
  const atraso = anteriores.length * passo;
  alvo.animate(
    [
      { transform: "scale(1)", filter: "none" },
      {
        transform: "translateY(-10px) scale(1.7) rotate(-15deg)",
        filter: "drop-shadow(0 0 12px rgba(251,191,36,.9))",
      },
      { transform: "scale(1)", filter: "none" },
    ],
    { duration: 560, delay: atraso, easing: "cubic-bezier(.2,.8,.2,1.4)" },
  );
  const c = centro(alvo.getBoundingClientRect());
  const k = anteriores.length + 1;
  onda(c, 70, atraso);
  explodir(c, 8 + k * 3, 34 + k * 6, atraso);
  if (maxima) {
    onda(c, 120, atraso + 140);
    explodir(c, 16, 90, atraso + 140);
  }
}

/** Cada estrela escolhida decola com um estalo e voa em curva, com rastro, até `destino`;
 * cada chegada solta faíscas e a última faz o destino pulsar. */
export function voarEstrelas(origens: DOMRect[], destino: Element | null) {
  if (reduzirMovimento() || !destino || origens.length === 0) return;
  const fim = centro(destino.getBoundingClientRect());
  let chegadas = 0;
  origens.forEach((o, i) => {
    const inicio = centro(o);
    const pts = pontosDaCurva(inicio, fim, 20, (i - (origens.length - 1) / 2) * 60);
    const atraso = i * 110;
    explodir(inicio, 6, 22, atraso);
    // k = 0 é a estrela; as cópias menores e mais apagadas logo atrás fazem o rastro.
    [24, 12, 9, 7].forEach((tam, k) => {
      const brilho = k === 0 ? 1 : 0.75 - k * 0.15;
      const el = elementoSolto(
        SVG_ESTRELA,
        tam,
        `color:#fbbf24;${k === 0 ? "filter:drop-shadow(0 0 8px rgba(251,191,36,.85))" : ""}`,
      );
      el.animate(
        pts.map((p, j) => ({
          transform: `translate(${p.x - tam / 2}px,${p.y - tam / 2}px) scale(${1 - (j / (pts.length - 1)) * 0.4}) rotate(${j * 30}deg)`,
          opacity: j === pts.length - 1 ? brilho * 0.4 : brilho,
        })),
        {
          duration: 950,
          delay: atraso + k * 45,
          easing: "cubic-bezier(.45,0,.2,1)",
          fill: "backwards",
        },
      ).onfinish = () => {
        el.remove();
        if (k !== 0) return;
        explodir(fim, 5, 22);
        chegadas += 1;
        if (chegadas === origens.length) {
          pulsar(destino);
          onda(fim, 64);
        }
      };
    });
  });
}

/** Troca de tema: o sol (ou a lua) surge no centro e a cor nova se espalha a partir dele;
 * no fim o véu some e a tela já está no tema novo. */
export function trocarTemaAnimado(paraEscuro: boolean, aplicar: () => void) {
  if (reduzirMovimento()) {
    aplicar();
    return;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w / 2;
  const cy = h / 2;
  const raio = Math.hypot(w, h) / 2 + 20;
  const veu = document.createElement("div");
  veu.setAttribute("aria-hidden", "true");
  veu.style.cssText = `position:fixed;inset:0;z-index:9998;pointer-events:none;background:${paraEscuro ? FUNDO.escuro : FUNDO.claro};clip-path:circle(0px at ${cx}px ${cy}px)`;
  document.body.appendChild(veu);
  const astro = elementoSolto(
    paraEscuro ? SVG_LUA : SVG_SOL,
    80,
    `left:${cx - 40}px;top:${cy - 40}px;color:${paraEscuro ? "#c7d2fe" : "#f59e0b"};filter:drop-shadow(0 0 24px ${paraEscuro ? "rgba(165,180,252,.7)" : "rgba(251,191,36,.8)"})`,
  );

  astro.animate(
    [
      { transform: "scale(.2) rotate(-90deg)", opacity: 0 },
      { transform: "scale(1.1) rotate(0deg)", opacity: 1, offset: 0.55 },
      { transform: "scale(1) rotate(10deg)", opacity: 1 },
    ],
    { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
  );
  veu.animate(
    [
      { clipPath: `circle(0px at ${cx}px ${cy}px)` },
      { clipPath: `circle(${raio}px at ${cx}px ${cy}px)` },
    ],
    { duration: 560, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" },
  ).onfinish = () => {
    aplicar();
    const sumir = { duration: 380, easing: "ease-out", fill: "forwards" as const };
    veu.animate([{ opacity: 1 }, { opacity: 0 }], sumir);
    astro.animate(
      [
        { transform: "scale(1) rotate(10deg)", opacity: 1 },
        { transform: "scale(1.6) rotate(30deg)", opacity: 0 },
      ],
      { ...sumir, delay: 120 },
    ).onfinish = () => {
      veu.remove();
      astro.remove();
    };
  };
}
