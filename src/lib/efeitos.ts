// Efeitos pontuais das ações (concluir, excluir, copiar, salvar...), trazidos da Central de Tickets. Web Animations em
// elementos soltos no <body>, removidos ao terminar. Com "reduzir movimento", nada roda.
import { faiscasDaExplosao, pontosDaCurva, reduzirMovimento, type Ponto } from "./animacoes";

export type Fatia = {
  coluna: number;
  topo: number;
  direita: number;
  baixo: number;
  esquerda: number;
};

/** Recortes (inset do clip-path) que dividem um retângulo w×h em colunas×linhas. */
export function fatiasDoRetangulo(w: number, h: number, colunas: number, linhas: number): Fatia[] {
  const fatias: Fatia[] = [];
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < colunas; c++) {
      fatias.push({
        coluna: c,
        topo: (l * h) / linhas,
        direita: w - ((c + 1) * w) / colunas,
        baixo: h - ((l + 1) * h) / linhas,
        esquerda: (c * w) / colunas,
      });
    }
  }
  return fatias;
}

// ---------------------------------------------------------------- base

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const terminar = (a: Animation) => a.finished.then(() => undefined).catch(() => undefined);
const centro = (el: Element): Ponto => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
// Cores do tema do Hub: as variáveis guardam "R G B" (ver index.css), por isso o rgb().
const corDoTema = (nome: string, padrao: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v ? `rgb(${v})` : padrao;
};
const FUNDO = () => corDoTema("--color-sand-surface", "#fff");
const BORDA = () => corDoTema("--color-sand-line", "#ddd");
const APAGADO = () => corDoTema("--color-ink-tertiary", "#888");
const PRIMARIA = "#009488";

/** Elemento solto no <body>. `svg` é sempre uma das constantes abaixo; texto vindo de dado
 * (nome, iniciais) entra por `texto`, nunca como HTML. */
function solto(svg: string, estilo: string, texto?: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:9999;${estilo}`;
  if (texto !== undefined) el.textContent = texto;
  else el.innerHTML = svg;
  document.body.appendChild(el);
  return el;
}

const SVG_ESTRELA =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
const SVG_CHECK =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>';
const SVG_AVIAO =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg>';
const SVG_CADEADO =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="argola" d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="3" y="11" width="18" height="11" rx="2"/></svg>';
const SVG_BAIXAR =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
const SVG_CHAMA =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

// ---------------------------------------------------------------- peças

/** Anel que se abre a partir de um ponto. */
export function anel(c: Ponto, diametro: number, cor: string, atraso = 0) {
  if (reduzirMovimento()) return;
  const el = solto(
    "",
    `left:${c.x - diametro / 2}px;top:${c.y - diametro / 2}px;width:${diametro}px;height:${diametro}px;border:2px solid ${cor};border-radius:50%`,
  );
  void terminar(
    el.animate(
      [
        { transform: "scale(.2)", opacity: 0.9 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: 600, delay: atraso, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    ),
  ).then(() => el.remove());
}

/** Estrelinhas espalhadas em volta de um ponto. */
export function faiscas(
  c: Ponto,
  n: number,
  alcance: number,
  cores = ["#fbbf24", "#f59e0b", "#fde68a", "#fb923c"],
  atraso = 0,
) {
  if (reduzirMovimento()) return;
  faiscasDaExplosao(n, alcance).forEach((f, i) => {
    const meio = f.tamanho / 2;
    const el = solto(
      SVG_ESTRELA,
      `left:${c.x - meio}px;top:${c.y - meio}px;width:${f.tamanho}px;height:${f.tamanho}px;color:${cores[i % cores.length]}`,
    );
    void terminar(
      el.animate(
        [
          { transform: "scale(.3)", opacity: 1 },
          {
            transform: `translate(${f.dx}px,${f.dy}px) rotate(${f.giro}deg)`,
            opacity: 1,
            offset: 0.65,
          },
          {
            transform: `translate(${f.dx * 1.15}px,${f.dy * 1.15 + 10}px) rotate(${f.giro * 1.4}deg) scale(.5)`,
            opacity: 0,
          },
        ],
        { duration: 760, delay: atraso, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
      ),
    ).then(() => el.remove());
  });
}

const CORES_CONFETE = ["#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#22c55e"];

/** Confete subindo de um ponto e caindo. */
export function confete(c: Ponto, n = 20) {
  if (reduzirMovimento()) return;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const v = 50 + Math.random() * 80;
    const w = 4 + Math.random() * 4;
    const el = solto(
      "",
      `left:${c.x}px;top:${c.y}px;width:${w}px;height:${w * (Math.random() > 0.5 ? 1 : 1.8)}px;border-radius:${Math.random() > 0.5 ? "50%" : "2px"};background:${CORES_CONFETE[i % CORES_CONFETE.length]}`,
    );
    const dx = Math.cos(ang) * v;
    const dy = Math.sin(ang) * v;
    void terminar(
      el.animate(
        [
          { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${Math.random() * 360}deg)`,
            opacity: 1,
            offset: 0.5,
          },
          {
            transform: `translate(calc(-50% + ${dx * 1.3}px),calc(-50% + ${dy + 70}px)) rotate(${Math.random() * 720}deg)`,
            opacity: 0,
          },
        ],
        { duration: 1000, easing: "cubic-bezier(.2,.6,.4,1)" },
      ),
    ).then(() => el.remove());
  }
}

/** Nuvenzinha de poeira (carimbo batendo, caminhão saindo). */
export function poeira(c: Ponto) {
  if (reduzirMovimento()) return;
  const cor = APAGADO();
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const d = 50 + Math.random() * 30;
    const t = 6 + Math.random() * 8;
    const el = solto(
      "",
      `left:${c.x - t / 2}px;top:${c.y - t / 2}px;width:${t}px;height:${t}px;border-radius:50%;background:${cor};opacity:.35`,
    );
    void terminar(
      el.animate(
        [
          { transform: "scale(.4)", opacity: 0.45 },
          {
            transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d * 0.6}px) scale(1.6)`,
            opacity: 0,
          },
        ],
        { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" },
      ),
    ).then(() => el.remove());
  }
}

/** Amassa e solta (botão apertado). */
export function molejo(el: Element) {
  if (reduzirMovimento()) return;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(.9,1.08)" },
      { transform: "scale(1.06,.94)" },
      { transform: "scale(.98,1.02)" },
      { transform: "scale(1)" },
    ],
    { duration: 460, easing: "ease-out" },
  );
}

/** Balança como quem diz "não". */
export function tremer(el: Element, forca = 7, duracao = 440) {
  if (reduzirMovimento()) return;
  el.animate(
    [0, -forca, forca, -forca * 0.75, forca * 0.75, -forca * 0.4, 0].map((x) => ({
      transform: `translateX(${x}px)`,
    })),
    { duration: duracao, easing: "ease-in-out" },
  );
}

/** Curva até um alvo: um elemento solto (avatar, @) voa e some ao chegar. */
async function voar(de: Ponto, para: Ponto, texto: string, tamanho: number, estilo = "") {
  const el = solto(
    "",
    `left:${de.x - tamanho / 2}px;top:${de.y - tamanho / 2}px;width:${tamanho}px;height:${tamanho}px;${estilo}`,
    texto,
  );
  const pts = pontosDaCurva(de, para, 20, 0);
  await terminar(
    el.animate(
      pts.map((q, i) => ({
        transform: `translate(${q.x - de.x}px,${q.y - de.y}px) scale(${1 + Math.sin((i / 19) * Math.PI) * 0.45})`,
      })),
      { duration: 720, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" },
    ),
  );
  el.remove();
}

// ---------------------------------------------------------------- cenas

/** Carimbo batendo girando sobre o alvo, que treme; sobe poeira. */
export async function carimbar(alvo: Element, texto: string, cor: string) {
  if (reduzirMovimento()) return;
  const c = centro(alvo);
  const fundo = FUNDO();
  const selo = solto(
    "",
    `left:${c.x}px;top:${c.y}px;padding:4px 18px;border:4px solid ${cor};border-radius:10px;color:${cor};font-weight:800;font-size:28px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;background:color-mix(in oklab, ${fundo} 55%, transparent);box-shadow:inset 0 0 0 2px color-mix(in oklab, ${fundo} 70%, transparent)`,
    texto,
  );
  const base = "translate(-50%,-50%) rotate(-12deg)";
  selo.animate(
    [
      { transform: `${base} scale(2.8) rotate(-22deg)`, opacity: 0 },
      { transform: `${base} scale(.9)`, opacity: 1, offset: 0.72 },
      { transform: `${base} scale(1)`, opacity: 1 },
    ],
    { duration: 420, easing: "cubic-bezier(.55,0,.9,.55)", fill: "forwards" },
  );
  await espera(300);
  alvo.animate(
    [
      { transform: "none" },
      { transform: "translateY(5px) scale(.985)" },
      { transform: "translateY(-2px)" },
      { transform: "none" },
    ],
    { duration: 300 },
  );
  poeira(c);
  await espera(1500);
  await terminar(
    selo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }),
  );
  selo.remove();
}

/** Vira como moeda (reabrir, desfazer conclusão). */
export async function girarMoeda(el: Element) {
  if (reduzirMovimento()) return;
  await terminar(
    el.animate(
      [
        { transform: "perspective(900px) rotateY(0)" },
        { transform: "perspective(900px) rotateY(-360deg) scale(1.03)", offset: 0.8 },
        { transform: "perspective(900px) rotateY(-360deg)" },
      ],
      { duration: 900, easing: "cubic-bezier(.4,0,.2,1)" },
    ),
  );
}

/** Uma cópia do elemento encolhe torcendo até o destino (arquivar, mudar de coluna); o destino quica. */
export async function sugarPara(el: Element, destino: Element) {
  if (reduzirMovimento()) return;
  const r = el.getBoundingClientRect();
  const copia = el.cloneNode(true) as HTMLElement;
  copia.setAttribute("aria-hidden", "true");
  copia.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:9999;background:rgb(var(--color-sand-surface));border-radius:12px;overflow:hidden;box-shadow:0 18px 40px -16px rgb(0 0 0 / .35)`;
  document.body.appendChild(copia);
  const a = centro(el);
  const b = centro(destino);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  await terminar(
    copia.animate(
      [
        { transform: "none", opacity: 1 },
        {
          transform: `translate(${dx * 0.45}px,${dy * 0.45 - 40}px) scale(.55,.45) skewX(-12deg) rotate(-6deg)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${dx}px,${dy}px) scale(.04,.03)`, opacity: 0.3 },
      ],
      { duration: 700, easing: "cubic-bezier(.5,0,.6,1)", fill: "forwards" },
    ),
  );
  copia.remove();
  destino.animate(
    [
      { transform: "none" },
      { transform: "scale(1.18,.84)" },
      { transform: "scale(.94,1.07)" },
      { transform: "none" },
    ],
    { duration: 460 },
  );
  anel(b, 70, PRIMARIA);
}

/** O elemento se desfaz em pedaços que voam pra direita (excluir). Fica escondido no fim. */
export async function desintegrar(el: HTMLElement) {
  if (reduzirMovimento()) return;
  const r = el.getBoundingClientRect();
  const colunas = 14;
  const linhas = 8;
  const pedacos = fatiasDoRetangulo(r.width, r.height, colunas, linhas).map((f) => {
    const p = el.cloneNode(true) as HTMLElement;
    p.setAttribute("aria-hidden", "true");
    // Mantém o estilo próprio do elemento (fundo, borda) e só posiciona e recorta por cima.
    p.style.cssText = `${el.style.cssText};position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:9999;overflow:hidden;clip-path:inset(${f.topo}px ${f.direita}px ${f.baixo}px ${f.esquerda}px)`;
    document.body.appendChild(p);
    return { p, coluna: f.coluna };
  });
  el.style.visibility = "hidden";
  await Promise.all(
    pedacos.map(({ p, coluna }) =>
      terminar(
        p.animate(
          [
            { transform: "none", opacity: 1, filter: "none" },
            {
              transform: `translate(${60 + Math.random() * 160}px,${-30 - Math.random() * 110}px) rotate(${(Math.random() - 0.5) * 140}deg)`,
              opacity: 0,
              filter: "blur(1px)",
            },
          ],
          {
            duration: 700 + Math.random() * 400,
            delay: coluna * 50 + Math.random() * 160,
            easing: "cubic-bezier(.3,0,.7,1)",
            fill: "both",
          },
        ),
      ),
    ),
  );
  pedacos.forEach(({ p }) => p.remove());
}

/** Alerta urgente (CSAT ou NPS baixo, Reclame Aqui novo): chama piscando, três ondas e o alvo pulsa em vermelho. */
export function chamaUrgente(alvo: Element) {
  if (reduzirMovimento()) return;
  const c = centro(alvo);
  const vermelho = "#ef4444";
  [0, 220, 440].forEach((t) => anel(c, 90, vermelho, t));
  tremer(alvo, 3, 420);
  alvo.animate(
    [
      { boxShadow: "0 0 0 0 transparent" },
      { boxShadow: `0 0 0 2px ${vermelho}, 0 0 26px -4px ${vermelho}` },
      { boxShadow: "0 0 0 0 transparent" },
      { boxShadow: `0 0 0 2px ${vermelho}, 0 0 26px -4px ${vermelho}` },
      { boxShadow: "0 0 0 0 transparent" },
    ],
    { duration: 1500, easing: "ease-in-out" },
  );
  const chama = solto(
    SVG_CHAMA,
    `left:${c.x - 11}px;top:${c.y - 34}px;width:22px;height:22px;color:${vermelho};filter:drop-shadow(0 0 6px rgba(239,68,68,.7))`,
  );
  void terminar(
    chama.animate(
      [
        { transform: "translateY(10px) scale(.3)", opacity: 0 },
        { transform: "scale(1.3,1.5) rotate(-8deg)", opacity: 1, offset: 0.25 },
        { transform: "scale(.95,1.1) rotate(6deg)", opacity: 1, offset: 0.5 },
        { transform: "scale(1.2,1.3) rotate(-4deg)", opacity: 1, offset: 0.75 },
        { transform: "translateY(-14px) scale(.8)", opacity: 0 },
      ],
      { duration: 1400, easing: "ease-in-out" },
    ),
  ).then(() => chama.remove());
}

/** Avatar com as iniciais voa de `de` até `alvo` e pousa com um anel. */
export async function voarAvatar(de: Element, alvo: Element, iniciais: string) {
  if (reduzirMovimento()) return;
  const primaria = PRIMARIA;
  await voar(
    centro(de),
    centro(alvo),
    iniciais,
    30,
    `border-radius:50%;display:grid;place-items:center;font:700 11px/1 inherit;color:${primaria};background:color-mix(in oklab, ${primaria} 18%, ${FUNDO()});border:2px solid ${FUNDO()};box-shadow:0 6px 16px -6px rgb(0 0 0 / .35)`,
  );
  alvo.animate(
    [
      { transform: "scale(1.3,.8)" },
      { transform: "scale(.9,1.1)" },
      { transform: "scale(1.03)" },
      { transform: "none" },
    ],
    { duration: 460, easing: "ease-out" },
  );
  anel(centro(alvo), 60, primaria);
}

/** Relógio tocando (prazo de missão acabando). */
export function tocarAlarme(el: Element) {
  if (reduzirMovimento()) return;
  el.animate(
    [0, -22, 20, -18, 16, -12, 8, -4, 0].map((r) => ({ transform: `rotate(${r}deg)` })),
    { duration: 700, easing: "linear" },
  );
}

/** Sino balançando com amortecimento; o eixo fica no topo. */
export function balancarSino(el: HTMLElement) {
  if (reduzirMovimento()) return;
  el.style.transformOrigin = "50% 10%";
  el.animate(
    [0, 24, -20, 15, -10, 6, -3, 0].map((r) => ({ transform: `rotate(${r}deg)` })),
    { duration: 1000, easing: "ease-out" },
  );
  anel(centro(el), 46, PRIMARIA);
}

/** Um aviãozinho decola do botão de enviar. */
export function decolar(botao: Element) {
  if (reduzirMovimento()) return;
  molejo(botao);
  const c = centro(botao);
  const aviao = solto(
    SVG_AVIAO,
    `left:${c.x - 9}px;top:${c.y - 9}px;width:18px;height:18px;color:${PRIMARIA}`,
  );
  void terminar(
    aviao.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "translate(34px,-40px) rotate(-12deg) scale(1.1)", opacity: 1, offset: 0.5 },
        { transform: "translate(90px,-110px) rotate(-24deg) scale(.6)", opacity: 0 },
      ],
      { duration: 700, easing: "cubic-bezier(.5,0,.75,.6)" },
    ),
  ).then(() => aviao.remove());
}

// ---------------------------------------------------------------- botões

/** Copiado: um fantasma do texto sobe do botão e aparece "Copiado". */
export function efeitoCopiado(botao: Element, texto: string) {
  if (reduzirMovimento()) return;
  molejo(botao);
  const r = botao.getBoundingClientRect();
  const primaria = PRIMARIA;
  const curto = texto.length > 28 ? `${texto.slice(0, 26)}…` : texto;
  const fantasma = solto(
    "",
    `left:${r.left + r.width / 2}px;top:${r.top}px;transform:translateX(-50%);font:700 12px/1.2 inherit;color:${primaria};white-space:nowrap`,
    curto,
  );
  void terminar(
    fantasma.animate(
      [
        { transform: "translate(-50%,0)", opacity: 0.9 },
        { transform: "translate(-50%,-40px) scale(1.1)", opacity: 0 },
      ],
      { duration: 800, easing: "cubic-bezier(.2,.8,.2,1)" },
    ),
  ).then(() => fantasma.remove());
  faiscas(centro(botao), 6, 24, [primaria, "#5eead4", "#99f6e4"]);
}

/** Salvo: o botão ganha um véu verde em círculo com um check desenhado, que some sozinho
 * depois de `segurar` ms. */
export async function celebrarSalvo(botao: Element, segurar = 1200) {
  if (reduzirMovimento()) return;
  const r = botao.getBoundingClientRect();
  const verde = "#16a34a";
  const veu = solto(
    `<span style="position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;color:#fff">${SVG_CHECK}</span>`,
    `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(botao).borderRadius};background:${verde};overflow:hidden`,
  );
  const meio = `${r.width / 2}px ${r.height / 2}px`;
  veu.animate([{ clipPath: `circle(0 at ${meio})` }, { clipPath: `circle(100% at ${meio})` }], {
    duration: 320,
    easing: "cubic-bezier(.4,0,.2,1)",
    fill: "forwards",
  });
  const traco = veu.querySelector("path");
  if (traco) {
    traco.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: 320,
      delay: 220,
      easing: "ease-out",
      fill: "forwards",
    });
  }
  anel(centro(botao), Math.max(r.width, r.height) * 1.3, verde, 250);
  await espera(segurar);
  await terminar(
    veu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }),
  );
  veu.remove();
}

// ---------------------------------------------------------------- rodada 2

/** Item novo (comunicado, solicitação) salta no lugar com um respingo da cor dele. */
export function brotar(el: Element, cor?: string) {
  if (reduzirMovimento()) return;
  const tinta = cor || getComputedStyle(el).color || PRIMARIA;
  el.animate(
    [
      { transform: "scale(0) rotate(-14deg)", opacity: 0 },
      { transform: "scale(1.25) rotate(4deg)", opacity: 1, offset: 0.6 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 520, easing: "ease-out" },
  );
  const c = centro(el);
  anel(c, 70, tinta);
  faiscas(c, 10, 40, [tinta, "#fbbf24", "#fde68a"]);
}

/** Item removido estoura como bolha (crescimento rápido, some e solta gotinhas). */
export async function estourarBolha(el: Element) {
  if (reduzirMovimento()) return;
  const c = centro(el);
  const tinta = getComputedStyle(el).color || PRIMARIA;
  await terminar(
    el.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.25)" },
        { transform: "scale(0)", opacity: 0 },
      ],
      { duration: 300, easing: "ease-in", fill: "forwards" },
    ),
  );
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = 22 + Math.random() * 14;
    const t = 4 + Math.random() * 4;
    const gota = solto(
      "",
      `left:${c.x - t / 2}px;top:${c.y - t / 2}px;width:${t}px;height:${t}px;border-radius:50%;background:${tinta}`,
    );
    void terminar(
      gota.animate(
        [
          { transform: "none", opacity: 1 },
          {
            transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.3)`,
            opacity: 0,
          },
        ],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" },
      ),
    ).then(() => gota.remove());
  }
}

/** Passada de marca-texto no que mudou; some sozinha depois. */
export function marcaTexto(el: HTMLElement) {
  if (reduzirMovimento()) return;
  const antes = el.style.cssText;
  el.style.backgroundImage =
    "linear-gradient(transparent 52%, color-mix(in oklab, #facc15 65%, transparent) 52%, color-mix(in oklab, #facc15 65%, transparent) 92%, transparent 92%)";
  el.style.backgroundRepeat = "no-repeat";
  const anim = el.animate(
    [
      { backgroundSize: "0% 100%", backgroundPosition: "0 0" },
      { backgroundSize: "100% 100%", backgroundPosition: "0 0", offset: 0.15 },
      { backgroundSize: "100% 100%", backgroundPosition: "0 0", offset: 0.85 },
      { backgroundSize: "0% 100%", backgroundPosition: "100% 0" },
    ],
    { duration: 2600, easing: "ease-in-out" },
  );
  void terminar(anim).then(() => {
    el.style.cssText = antes;
  });
}

/** Itens saem varrendo pra direita, um depois do outro. */
export async function varrerParaFora(els: Element[]) {
  if (reduzirMovimento() || els.length === 0) return;
  await Promise.all(
    els.slice(0, 30).map((el, i) =>
      terminar(
        el.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: "translateX(110%) rotate(3deg)", opacity: 0 },
          ],
          { duration: 360, delay: i * 70, easing: "cubic-bezier(.5,0,.75,0)", fill: "both" },
        ),
      ),
    ),
  );
}

/** Bolinha do interruptor estica no meio do caminho e assenta. Só a escala: quem anda é o
 * translate do CSS (anima junto, sem somar). */
export function esticarBolinha(bolinha: Element) {
  if (reduzirMovimento()) return;
  bolinha.animate(
    [
      { scale: "1 1" },
      { scale: "1.45 0.9", offset: 0.45 },
      { scale: "0.9 1.05", offset: 0.8 },
      { scale: "1 1" },
    ],
    { duration: 380, easing: "ease-out" },
  );
}

/** Exportar apresentação (PPTX da Reunião de Resultados): slides abrem em leque, se juntam num arquivo e a seta de baixar quica. */
export async function leque(botao: Element) {
  if (reduzirMovimento()) return;
  const base = centro(botao);
  const cartao = FUNDO();
  const borda = BORDA();
  const primaria = PRIMARIA;
  const slides = [0, 1, 2, 3, 4].map(() =>
    solto(
      "",
      `left:${base.x - 32}px;top:${base.y - 30}px;width:64px;height:40px;border-radius:6px;background:${cartao};border:1px solid ${borda};box-shadow:0 6px 14px -6px rgb(0 0 0 / .3);background-image:linear-gradient(${primaria},${primaria}),linear-gradient(${borda},${borda}),linear-gradient(${borda},${borda});background-size:60% 4px,80% 4px,70% 4px;background-position:6px 7px,6px 15px,6px 23px;background-repeat:no-repeat`,
    ),
  );
  await Promise.all(
    slides.map((s, i) => {
      const ang = (i - 2) * 22;
      const rad = (ang * Math.PI) / 180;
      return terminar(
        s.animate(
          [
            { transform: "scale(.4)", opacity: 0 },
            {
              transform: `translate(${Math.sin(rad) * 100}px,${-Math.cos(rad) * 74 - 12}px) rotate(${ang}deg)`,
              opacity: 1,
            },
          ],
          { duration: 520, delay: i * 60, easing: "cubic-bezier(.2,.8,.2,1.25)", fill: "forwards" },
        ),
      );
    }),
  );
  await espera(420);
  await Promise.all(
    slides.map((s, i) =>
      terminar(
        s.animate([{ opacity: 1 }, { transform: "translate(0,-80px) scale(.5)", opacity: 0 }], {
          duration: 360,
          delay: i * 40,
          easing: "cubic-bezier(.5,0,.75,0)",
          fill: "forwards",
        }),
      ),
    ),
  );
  slides.forEach((s) => s.remove());
  const arquivo = solto(
    "",
    `left:${base.x - 20}px;top:${base.y - 105}px;width:40px;height:50px;border-radius:6px;background:#ea580c;color:#fff;font:800 10px/50px inherit;text-align:center;box-shadow:0 8px 18px -8px rgb(0 0 0 / .4)`,
    "PPTX",
  );
  await terminar(
    arquivo.animate(
      [
        { transform: "scale(0) rotate(-30deg)" },
        { transform: "scale(1.25) rotate(6deg)" },
        { transform: "none" },
      ],
      { duration: 460, easing: "ease-out" },
    ),
  );
  const seta = solto(
    SVG_BAIXAR,
    `left:${base.x - 11}px;top:${base.y - 50}px;width:22px;height:22px;color:${primaria}`,
  );
  await terminar(
    seta.animate(
      [
        { transform: "translateY(-20px)", opacity: 0 },
        { transform: "translateY(4px)", opacity: 1, offset: 0.5 },
        { transform: "translateY(-3px)", offset: 0.75 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 620, easing: "ease-out" },
    ),
  );
  confete({ x: base.x, y: base.y - 80 }, 14);
  await espera(900);
  await Promise.all(
    [arquivo, seta].map((el) =>
      terminar(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" })),
    ),
  );
  arquivo.remove();
  seta.remove();
}

/** Cadastro aprovado: o cartão brilha em verde, ganha um selo de check e solta confete. */
export async function aprovado(el: Element) {
  if (reduzirMovimento()) return;
  const verde = "#16a34a";
  const r = el.getBoundingClientRect();
  const selo = solto(
    `<span style="position:absolute;inset:5px;color:#fff">${SVG_CHECK}</span>`,
    `left:${r.right - 38}px;top:${r.top + 8}px;width:28px;height:28px;border-radius:50%;background:${verde};border:2px solid ${FUNDO()}`,
  );
  selo.querySelector("path")?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: 300,
    delay: 250,
    fill: "forwards",
  });
  selo.animate(
    [{ transform: "scale(0) rotate(-90deg)" }, { transform: "scale(1.35)" }, { transform: "none" }],
    {
      duration: 440,
      easing: "ease-out",
    },
  );
  el.animate(
    [
      { boxShadow: "0 0 0 0 transparent" },
      { boxShadow: `0 0 0 2px ${verde}, 0 0 28px -6px ${verde}` },
      { boxShadow: "0 0 0 0 transparent" },
    ],
    { duration: 1100 },
  );
  anel(centro(selo), 54, verde);
  confete(centro(el), 18);
  await espera(1000);
  await terminar(
    selo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }),
  );
  selo.remove();
}

/** Login aceito: um cadeado sobre o botão abre a argola. */
export function cadeadoAbrindo(botao: Element) {
  if (reduzirMovimento()) return;
  const c = centro(botao);
  const primaria = PRIMARIA;
  const cad = solto(
    SVG_CADEADO,
    `left:${c.x - 14}px;top:${c.y - 56}px;width:28px;height:28px;color:${primaria}`,
  );
  cad.animate(
    [
      { transform: "translateY(10px) scale(.5)", opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
    {
      duration: 260,
      easing: "ease-out",
    },
  );
  const argola = cad.querySelector(".argola") as SVGElement | null;
  if (argola) {
    argola.style.transformBox = "fill-box";
    argola.style.transformOrigin = "100% 100%";
    argola.animate([{ transform: "none" }, { transform: "translateY(-3px) rotate(-30deg)" }], {
      duration: 320,
      delay: 260,
      easing: "cubic-bezier(.2,.8,.2,1.4)",
      fill: "forwards",
    });
  }
  setTimeout(() => anel(centro(cad), 60, primaria), 420);
  void terminar(
    cad.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: "translateY(-10px)" }],
      {
        duration: 1400,
      },
    ),
  ).then(() => cad.remove());
}

// ---------------------------------------------------------------- formulários

type EventoDeEnvio = { target?: EventTarget | null; nativeEvent?: object };

/** Formulário com erro: cada campo inválido balança como quem diz "não". Vai como 2º
 * argumento do handleSubmit do React Hook Form. */
export function tremerInvalidos(erros: Record<string, unknown>, evento?: EventoDeEnvio) {
  const form = evento?.target instanceof Element ? evento.target : null;
  if (!form) return;
  Object.keys(erros).forEach((nome) => {
    const campo = form.querySelector(`[name="${CSS.escape(nome)}"]`);
    if (campo) tremer(campo);
  });
}

/** Botão que enviou o formulário (o "Salvar"). */
function botaoDoEnvio(evento?: EventoDeEnvio): Element | null {
  return (evento?.nativeEvent as SubmitEvent | undefined)?.submitter ?? null;
}

/** Salvou: véu verde com check no botão. Espera o check aparecer antes de quem chamou
 * fechar o pop-up. */
export async function salvoNoBotao(evento?: EventoDeEnvio) {
  const botao = botaoDoEnvio(evento);
  if (!botao || reduzirMovimento()) return;
  void celebrarSalvo(botao, 600);
  await espera(650);
}

/** Enviou (solicitação, comunicado, pedido de folga): aviãozinho decola do botão. */
export async function enviadoNoBotao(evento?: EventoDeEnvio) {
  const botao = botaoDoEnvio(evento);
  if (!botao || reduzirMovimento()) return;
  decolar(botao);
  await espera(450);
}

/** Iniciais pro avatar que voa: primeiro e último nome. */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

/** Excluir no Admin: linha de tabela varre pra fora levantando poeira; cartão se desfaz em
 * pedaços. Fica escondido no fim (a lista recarrega sem ele). */
export async function excluirItem(el: HTMLElement) {
  if (reduzirMovimento()) return;
  if (el.tagName !== "TR") return desintegrar(el);
  poeira(centro(el));
  await varrerParaFora([el]);
  el.style.visibility = "hidden";
}
