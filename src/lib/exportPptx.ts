import PptxGenJS from "pptxgenjs";
import { formatDuration } from "@/lib/formatDuration";
import { GREENN_LOGO_BASE64 } from "@/lib/greennLogoBase64";
import {
  type ResultadosSacData,
  type DeltaInfo,
  fmtNum,
  fmtPct1,
  deltaPercentual,
  deltaPontos,
} from "@/lib/resultadosSac";

const NOME_BOT = "IA Greenn";

// Duas famílias — mesma hierarquia grande-e-pesado + corpo limpo do
// material "Tech News" do time de Tecnologia, usado como referência de
// redesign em 2026-09-22 (preto + verde-menta). Trocado de "Impact" pra
// Arial Bold em 2026-09-22 (mesmo dia) — Impact é uma fonte condensada
// crua, pesada demais até pra número/título curto, lia como "feio" numa
// verificação real do usuário; Arial em negrito (peso já aplicado em toda
// chamada que usa esta constante) é limpa, sempre instalada com
// Office/Windows (fonte segura, ver guia de PPTX) e não distorce em
// nenhuma substituição de fonte.
const FONT_DISPLAY = "Arial";
const FONT_BODY = "Arial";

// Preto + verde-menta (referência "Tech News", 2026-09-22) — substituiu o
// tema escuro com acento teal de 2026-09-04. Fundo mais preto de verdade
// (era 121417), cards um tom acima do fundo, acento único (mint) em vez de
// gradiente teal→forest — a referência é toda em blocos de cor chapada,
// sem gradiente nenhum.
const COR = {
  bg: "141414",
  cardBg: "1E1E1E",
  cardBg2: "252525", // linha alternada (zebra) das tabelas — só um tom acima de cardBg
  cardBorder: "2E2E2E",
  ink: "FFFFFF",
  inkSoft: "B8B8B8",
  inkFraco: "7A7A7A",
  branco: "FFFFFF",
  mint: "A8F5D0",
  rust: "F1685F",
};

interface CardInfo {
  label: string;
  valor: string;
  // Versão em runs (número grande + unidade pequena, cada trecho com sua
  // própria cor/tamanho) pro valor — usada só no card "Relógio de trabalho
  // ativo" (pedido do usuário: "dias e horas bem pequeno com as cores"),
  // que mistura 2 unidades (ex: "2d 21h") e ficava difícil de ler como
  // texto corrido no mesmo tamanho gigante dos outros cards (que só têm 1
  // valor, tipo "7h 2min 51s"). Quando presente, tem prioridade sobre
  // `valor` (que continua preenchido, só como fallback/acessibilidade).
  valorRuns?: PptxGenJS.TextProps[];
  delta?: DeltaInfo;
  nota?: string;
}

// "2d 21h" → [{texto:"2", grande},{texto:"d", pequena},{texto:" 21", grande},{texto:"h", pequena}]
// — separa dígito de unidade em cada token pra poder estilizar diferente
// (número grande e mint, unidade pequena e mais apagada). Só faz sentido
// pra formatos com mais de uma unidade (dia+hora); um valor de unidade só
// (ex: "7h 2min 51s") já lê bem no tamanho único de sempre, não precisa
// desse tratamento.
function duracaoEmRuns(texto: string, tamanhoNumero: number, tamanhoUnidade: number): PptxGenJS.TextProps[] {
  const runs: PptxGenJS.TextProps[] = [];
  const tokens = texto.split(" ");
  tokens.forEach((tok, i) => {
    const m = tok.match(/^(\d+)([a-zçã]+)$/i);
    const prefixo = i > 0 ? " " : "";
    if (!m) {
      runs.push({ text: prefixo + tok, options: { fontSize: tamanhoNumero, bold: true, color: COR.mint, fontFace: FONT_DISPLAY } });
      return;
    }
    runs.push({ text: prefixo + m[1], options: { fontSize: tamanhoNumero, bold: true, color: COR.mint, fontFace: FONT_DISPLAY } });
    runs.push({ text: m[2], options: { fontSize: tamanhoUnidade, bold: true, color: COR.inkSoft, fontFace: FONT_DISPLAY } });
  });
  return runs;
}

function corDelta(delta?: DeltaInfo): string {
  if (!delta) return COR.inkFraco;
  return delta.bom === null ? COR.inkFraco : delta.bom ? COR.mint : COR.rust;
}

// Logo real da Greenn (embutido em base64 — pptxgenjs no navegador não lê
// caminho de arquivo, só data URI ou URL) + halo circular sutil.
function seloGreenn(slide: PptxGenJS.Slide, cx: number, cy: number, d: number, comHalo?: boolean) {
  if (comHalo) {
    slide.addShape("ellipse", { x: cx - d / 2 - 0.06, y: cy - d / 2 - 0.06, w: d + 0.12, h: d + 0.12, fill: { color: COR.branco } });
  }
  slide.addImage({ data: GREENN_LOGO_BASE64, x: cx - d / 2, y: cy - d / 2, w: d, h: d });
}

// tipo_cliente vem em maiúsculas nas duas novas funções SQL só quando é
// literalmente "Sem tipo" — as tags reais (Final/Produtor/Bluee/SDR) já
// vêm com a capitalização certa da Crisp, então só normaliza o rótulo pra
// exibição em título (Title Case simples, sem tocar acentuação).
function tituloTipo(tipo: string): string {
  return tipo.toUpperCase();
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Tempo corrido entre abertura e 1ª resposta — calculado no cliente a
// partir dos dois timestamps já retornados por `atendimentos_com_metricas`
// (o "útil" já vem pronto em `tempo_primeira_resposta_seg`, mas o corrido
// não é um campo da função — não precisa de 2ª chamada pra isso).
function tfrCorridoSeg(abertura: string, primeiraResposta: string | null): number | null {
  if (!primeiraResposta) return null;
  const seg = (new Date(primeiraResposta).getTime() - new Date(abertura).getTime()) / 1000;
  return seg >= 0 ? seg : null;
}

export async function exportResultadosSacToPptx(data: ResultadosSacData): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "HUB_SAC", width: 13.333, height: 7.5 });
  pptx.layout = "HUB_SAC";

  const MX = 0.55;
  const CW = 13.333 - MX * 2;

  const A = data.atual;
  const P = data.anterior;
  const M = data.manual;

  function slideBase(titulo: string, subtitulo?: string) {
    const slide = pptx.addSlide();
    slide.background = { color: COR.bg };
    // Banner virou uma tarja fina de destaque — achado real em 2026-09-22
    // (print do usuário): o bloco mint chapado cobrindo 1,15in do topo,
    // com o título dentro dele, lia como "muito quadrado"/"cartaz colado
    // no preto". Reduzido pra uma tarja de 0,12in; o título saiu de dentro
    // do bloco e passou a ser texto mint direto sobre o preto — mesma
    // linguagem visual já usada nos valores dos cards (`metricCard`) e nas
    // tabelas do resto do deck, então o efeito "bloco colado" não se repete
    // aqui nem se contradiz com o resto do material.
    slide.addShape("rect", { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: COR.mint }, line: { type: "none" } });
    slide.addText(titulo.toUpperCase(), {
      x: MX, y: 0.35, w: 9.6, h: 0.75, fontSize: 30, bold: true, color: COR.mint, fontFace: FONT_DISPLAY, valign: "middle", charSpacing: 0.3,
    });
    if (subtitulo) {
      slide.addText(subtitulo, { x: MX, y: 1.1, w: 10.3, h: 0.28, fontSize: 10.5, color: COR.inkSoft, fontFace: FONT_BODY });
    }
    seloGreenn(slide, 12.72, 0.62, 0.62);
    slide.addText(`${data.periodoAtualLabel}  ·  comparado a ${data.periodoAnteriorLabel}`, {
      x: MX, y: 7.1, w: CW, h: 0.3, fontSize: 9, color: COR.inkFraco, fontFace: FONT_BODY,
    });
    return slide;
  }

  function metricCard(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, card: CardInfo) {
    slide.addShape("roundRect", {
      x, y, w, h, rectRadius: 0.1,
      fill: { color: COR.cardBg }, line: { color: COR.cardBorder, width: 1 },
    });
    slide.addShape("rect", { x, y, w, h: 0.06, fill: { color: COR.mint }, line: { type: "none" } });
    slide.addText(card.label.toUpperCase(), { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.28, fontSize: 9, bold: true, color: COR.inkSoft, charSpacing: 0.5, fontFace: FONT_BODY });
    if (card.valorRuns) {
      slide.addText(card.valorRuns, { x: x + 0.2, y: y + 0.5, w: w - 0.4, h: 0.6, valign: "middle" });
    } else {
      slide.addText(card.valor, { x: x + 0.2, y: y + 0.5, w: w - 0.4, h: 0.6, fontSize: 27, bold: true, color: COR.mint, fontFace: FONT_DISPLAY });
    }
    // Achado real em 2026-09-22 (print do usuário): a nota vazava pra fora
    // do card quando tinha 2 linhas — a conta antiga (linhaY = y+h-0.55,
    // +0.3 pro delta, nota com h=0.35) já colocava o fundo da nota em
    // y+h+0.10, ou seja, sempre 0,10in ALÉM do fundo do próprio card,
    // mesmo com nota de 1 linha só; com 2 linhas (texto mais longo, comum
    // nesses cards) vazava bem mais, visível no print. Recalculado pra
    // sobrar 0,15in de respiro dentro do card mesmo com nota de até 2
    // linhas (nota_h subiu de 0,35 pra 0,4).
    let linhaY = y + h - 0.88;
    if (card.delta) {
      slide.addText(card.delta.texto, { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.28, fontSize: 12, bold: true, color: corDelta(card.delta), fontFace: FONT_BODY });
      linhaY += 0.33;
    } else {
      slide.addText("sem comparação", { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.28, fontSize: 10, color: COR.inkFraco, italic: true, fontFace: FONT_BODY });
      linhaY += 0.33;
    }
    if (card.nota) {
      slide.addText(card.nota, { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.4, fontSize: 8.5, color: COR.inkFraco, fontFace: FONT_BODY });
    }
  }

  // Tabela dentro de um card arredondado (moldura `roundRect` por trás,
  // sem borda de célula) — pedido do usuário em 2026-09-22 ("aumenta esse
  // gráfico e deixa ele mais arredondado, deixa o pptx mais padrão"): as
  // tabelas antes eram só uma grade de células quadradas com borda de
  // 0,5pt em cada uma, lia como planilha crua, não como o resto do deck
  // (que usa `roundRect` em todo card/linha do Ranking). Mesmo raio/estilo
  // de moldura já usado em `metricCard`, zebra sutil (`cardBg`/`cardBg2`)
  // no lugar da linha de grade em cada célula pra separar as linhas sem
  // parecer planilha. `rowH` é o mínimo por linha — cai pro chamador
  // escolher um valor generoso o bastante pra não estourar a moldura
  // quando uma célula quebra em 2 linhas (validado gerando o pptx real e
  // medindo a altura de verdade no XML, não só o cálculo aqui).
  function tabelaArredondada(
    slide: PptxGenJS.Slide,
    x: number, y: number, w: number,
    linhas: PptxGenJS.TableRow[],
    colW: number[],
    rowH: number[]
  ) {
    const alturaEstimada = rowH.reduce((s, r) => s + r, 0);
    const pad = 0.16;
    slide.addShape("roundRect", {
      x: x - pad, y: y - pad, w: w + pad * 2, h: alturaEstimada + pad * 2,
      rectRadius: 0.14, fill: { color: COR.cardBg }, line: { color: COR.cardBorder, width: 1 },
    });
    slide.addTable(linhas, {
      x, y, w, colW, rowH,
      border: { type: "none" },
      autoPage: false,
      valign: "middle",
    });
    return alturaEstimada;
  }

  function metricasSlide(titulo: string, subtitulo: string | undefined, cards: CardInfo[], notaRodape?: string) {
    const slide = slideBase(titulo, subtitulo);
    const n = cards.length;
    const gap = 0.3;
    const w = (CW - gap * (n - 1)) / n;
    const y = 2.1;
    const h = 2.3;
    cards.forEach((card, i) => metricCard(slide, MX + i * (w + gap), y, w, h, card));
    if (notaRodape) {
      slide.addText(notaRodape, { x: MX, y: y + h + 0.25, w: CW, h: 0.6, fontSize: 9.5, color: COR.inkFraco, italic: true, fontFace: FONT_BODY });
    }
    return slide;
  }

  // ---------- Slide 1: capa ----------
  // Tela dividida preto/menta — o mesmo layout da capa do material de
  // referência (painel escuro com o título grande à esquerda, painel menta
  // com destaques à direita), em vez do gradiente vertical usado antes.
  {
    const slide = pptx.addSlide();
    slide.background = { color: COR.bg };
    const larguraMenta = 4.6;
    const xMenta = 13.333 - larguraMenta;
    slide.addShape("rect", { x: xMenta, y: 0, w: larguraMenta, h: 7.5, fill: { color: COR.mint }, line: { type: "none" } });

    seloGreenn(slide, 1.35, 1.15, 0.62);
    slide.addText("HUB SAC GREENN", { x: 0.75, y: 2.55, w: xMenta - 1.3, h: 0.35, fontSize: 12, bold: true, color: COR.mint, charSpacing: 2, fontFace: FONT_BODY });
    slide.addText("Reunião de\nResultados", { x: 0.72, y: 2.95, w: xMenta - 1.2, h: 1.9, fontSize: 46, bold: true, color: COR.branco, fontFace: FONT_DISPLAY, lineSpacing: 46 });
    slide.addText(data.periodoAtualLabel, { x: 0.75, y: 4.95, w: xMenta - 1.3, h: 0.4, fontSize: 16, color: COR.mint, fontFace: FONT_BODY });
    slide.addText(`Comparado a ${data.periodoAnteriorLabel}`, { x: 0.75, y: 5.35, w: xMenta - 1.3, h: 0.35, fontSize: 11, color: COR.inkSoft, fontFace: FONT_BODY });
    slide.addText(`Gerado em ${new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`, {
      x: 0.75, y: 6.95, w: xMenta - 1.3, h: 0.3, fontSize: 9, color: COR.inkFraco, fontFace: FONT_BODY,
    });

    slide.addText("DESTAQUES", { x: xMenta + 0.5, y: 1.0, w: larguraMenta - 1.0, h: 0.5, fontSize: 20, bold: true, color: COR.bg, fontFace: FONT_DISPLAY, charSpacing: 0.5 });
    const destaques = [
      A.contagem?.total_chamados != null ? `${fmtNum(A.contagem.total_chamados)} chamados` : null,
      A.csat?.total != null ? `CSAT: ${fmtNum(A.csat.total)} avaliações` : null,
      A.reabertura?.taxa_pct != null ? `${fmtPct1(A.reabertura.taxa_pct)} de reabertura` : null,
      A.rankingHumano[0] ? `${A.rankingHumano[0].operator_nome} lidera o ranking` : null,
    ].filter((t): t is string => t !== null);
    destaques.forEach((t, i) => {
      slide.addText(t, { x: xMenta + 0.5, y: 1.75 + i * 0.55, w: larguraMenta - 1.0, h: 0.5, fontSize: 13, bold: true, color: "1A1A1A", fontFace: FONT_BODY });
    });
  }

  // ---------- Crisp — Chamados ----------
  // Só métricas escopadas pelo período selecionado aqui — Backlog é sempre
  // "o que está aberto agora" (não respeita período/semana), por isso não
  // entra neste relatório (nem como slide própria, nem como card solto).
  {
    const slide = metricasSlide("Crisp — Chamados", "Todos os canais e atendentes, incluindo o bot.", [
      { label: "Total de chamados", valor: fmtNum(A.contagem?.total_chamados), delta: deltaPercentual(A.contagem?.total_chamados, P.contagem?.total_chamados, false), nota: "Cada ciclo aberto→resolvido" },
      { label: "Total de conversas", valor: fmtNum(A.contagem?.total_conversas), delta: deltaPercentual(A.contagem?.total_conversas, P.contagem?.total_conversas, false), nota: "Cada conversa do Crisp, uma vez" },
      { label: "Total de mensagens", valor: fmtNum(A.contagem?.total_mensagens), delta: deltaPercentual(A.contagem?.total_mensagens, P.contagem?.total_mensagens, false) },
    ]);

    // Volume por tipo de cliente — mesmo dado usado em Velocidade, só que
    // aqui é só a contagem (sem TFR/TTR), como uma fileira de chips.
    // Dinâmico: só entra quem tem chamado de verdade no período, "Geral"
    // fica de fora (é o mesmo total já mostrado no card acima).
    const porTipo = A.tipoCliente.filter((t) => t.tipo_cliente !== "Geral" && t.chamados > 0).slice(0, 6);
    if (porTipo.length > 0) {
      const y0 = 4.75;
      slide.addText("POR TIPO DE CLIENTE", { x: MX, y: y0, w: CW, h: 0.3, fontSize: 10, bold: true, color: COR.inkSoft, charSpacing: 0.5, fontFace: FONT_BODY });
      const gap = 0.25;
      const w = (CW - gap * (porTipo.length - 1)) / porTipo.length;
      const y = y0 + 0.4;
      const h = 1.1;
      porTipo.forEach((t, i) => {
        const x = MX + i * (w + gap);
        slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: COR.cardBg }, line: { color: COR.cardBorder, width: 1 } });
        slide.addText(tituloTipo(t.tipo_cliente), { x: x + 0.15, y: y + 0.14, w: w - 0.3, h: 0.3, fontSize: 9, bold: true, color: COR.inkSoft, fontFace: FONT_BODY });
        slide.addText(fmtNum(t.chamados), { x: x + 0.15, y: y + 0.44, w: w - 0.3, h: 0.55, fontSize: 20, bold: true, color: COR.mint, fontFace: FONT_DISPLAY });
      });
    }
  }

  // ---------- Velocidade (por tipo de cliente, dinâmico — inclui "Sem tipo") ----------
  // Tabela, não cards: são 4 números por métrica (média útil, mediana
  // útil, média corrida, mediana corrida) × TFR e TTR = denso demais pra
  // caber em card, principalmente com mais de 2 tipos na tela (pedido do
  // usuário: incluir "Sem tipo" também, não só Final/Produtor).
  {
    const tipos = A.tipoCliente
      .filter((t) => t.tipo_cliente !== "Geral" && t.chamados > 0)
      .sort((a, b) => (a.tipo_cliente === "Sem tipo" ? 1 : 0) - (b.tipo_cliente === "Sem tipo" ? 1 : 0) || b.chamados - a.chamados);
    if (tipos.length > 0) {
      const slide = slideBase("Velocidade", "Tempo de resposta e resolução, por tipo de cliente — média e mediana, horas úteis e corridas.");
      const th = (text: string, align?: "left" | "right") => ({
        text, options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 10.5, align: align ?? ("right" as const), fontFace: FONT_BODY },
      });
      const linhasTabela: PptxGenJS.TableRow[] = [
        [
          th("Tipo", "left"), th("Chamados"),
          th("TFR médio (útil)"), th("TFR mediana (útil)"), th("TFR corrido méd/med"),
          th("TTR médio (útil)"), th("TTR mediana (útil)"), th("TTR corrido méd/med"),
        ],
        ...tipos.map((t, i) => {
          const zebra = i % 2 === 1 ? COR.cardBg2 : COR.cardBg;
          const td = (text: string, align?: "left" | "right") => ({
            text, options: { color: COR.ink, fontSize: 10.5, align: align ?? ("right" as const), fill: { color: zebra }, fontFace: FONT_BODY },
          });
          return [
            { text: tituloTipo(t.tipo_cliente), options: { color: COR.mint, bold: true, fontSize: 11, fill: { color: zebra }, fontFace: FONT_BODY } },
            td(fmtNum(t.chamados)),
            td(formatDuration(t.tfr_media_uteis_seg)),
            td(formatDuration(t.tfr_p50_uteis_seg)),
            td(`${formatDuration(t.tfr_media_corridas_seg)} / ${formatDuration(t.tfr_p50_corridas_seg)}`),
            td(formatDuration(t.ttr_media_uteis_seg)),
            td(formatDuration(t.ttr_p50_uteis_seg)),
            td(`${formatDuration(t.ttr_media_corridas_seg)} / ${formatDuration(t.ttr_p50_corridas_seg)}`),
          ];
        }),
      ];
      // Linhas maiores (fonte 10,5/11, rowH generoso) + moldura
      // arredondada — pedido do usuário ("aumenta esse gráfico e deixa
      // ele mais arredondado"). rowH de dado = 0,62 (não 0,4) porque as
      // colunas "corrido méd/med" costumam quebrar em 2 linhas com essa
      // fonte maior — folga validada gerando o pptx real e medindo a
      // altura verdadeira no XML antes de fechar (ver histórico do
      // commit). y=2.6, mantido do fix de espaço vazio de mais cedo hoje.
      const yTabela = 2.6;
      const rowH = [0.42, ...tipos.map(() => 0.62)];
      const alturaTabela = tabelaArredondada(
        slide, MX, yTabela, CW, linhasTabela,
        [1.5, 1.0, 1.35, 1.4, 1.75, 1.35, 1.4, 1.75], rowH
      );
      const y2 = yTabela + alturaTabela + 0.35;
      slide.addText(
        "\"Chamados\" conta todo mundo com a tag, respondido ou não — pode ser maior que a base real de TFR/TTR (só quem já tem resposta humana/resolução calculada). \"Mediana\" (p50) é o valor do meio — mais resistente a outlier do que a média (achado real: 1 chamado de dias sozinho já puxou uma média inteira). \"Corrido\" é o tempo de relógio cru, sem descontar fora do expediente — mostrado como média/mediana no mesmo formato.",
        { x: MX, y: y2, w: CW, h: 0.6, fontSize: 9, color: COR.inkFraco, italic: true, fontFace: FONT_BODY }
      );
    }
  }

  // ---------- Relógios do atendimento ----------
  // Logo depois de Velocidade (pedido do usuário) — os dois são sobre
  // tempo/velocidade do atendimento, fazem mais sentido juntos do que lá
  // embaixo perto de Reabertura, onde estava antes.
  metricasSlide("Relógios do atendimento", "Ponto de vista do cliente e cobertura do time.", [
    { label: "Relógio do cliente", valor: formatDuration(A.percentis?.ttr_media ?? null), delta: deltaPercentual(A.percentis?.ttr_media, P.percentis?.ttr_media, true), nota: "Mesmo valor de Velocidade, do ponto de vista de quem esperou" },
    { label: "Relógio de espera do cliente", valor: formatDuration(A.relogioEspera?.minutos_espera_medio != null ? A.relogioEspera.minutos_espera_medio * 60 : null), delta: deltaPercentual(A.relogioEspera?.minutos_espera_medio, P.relogioEspera?.minutos_espera_medio, true), nota: A.relogioEspera ? `${A.relogioEspera.amostras} janelas até resposta humana (bot não conta)` : undefined },
    (() => {
      const valor = formatDuration(A.horasExpedienteMin != null ? A.horasExpedienteMin * 60 : null);
      // Pedido do usuário: número grande + unidade pequena/mais apagada
      // (ex: "2" grande + "d" pequeno, " 21" grande + "h" pequeno) — só
      // esse card mistura 2 unidades (dias+horas) no valor, os outros
      // cards da tela têm 1 valor só ("7h 2min 51s") e continuam no
      // tamanho único de sempre.
      const card: CardInfo = { label: "Relógio de trabalho ativo", valor, nota: "Expediente cadastrado do time (cobertura, não presença real)" };
      if (valor !== "—") card.valorRuns = duracaoEmRuns(valor, 26, 13);
      return card;
    })(),
  ]);

  // ---------- Top 5 — maiores tempos de 1ª resposta ----------
  // Casos individuais (não agregado) — mesma função/critério já usado na
  // aba Atendimentos do Overview (`atendimentos_com_metricas`, ordenar por
  // "tfr" desc), sem RPC nova. Só nome do cliente (sem e-mail/telefone),
  // por pedido explícito do usuário. Duas tabelas (Produtor / Cliente
  // Final) no MESMO slide, uma embaixo da outra — um top 5 misto sempre
  // saía dominado por Final (maioria via bot, TFR humano naturalmente
  // mais longo, sem a mesma pressão de SLA que Produtor tem), escondendo
  // os casos de Produtor; duas tabelas separadas resolvem isso sem
  // precisar de um slide a mais (pedido explícito do usuário — "mesmo
  // slide").
  if (data.topTfrProdutor.length > 0 || data.topTfrFinal.length > 0) {
    const slide = slideBase("Top 5 — Maiores tempos de 1ª resposta", "Os chamados que mais demoraram até a 1ª resposta humana no período.");
    const colW = [1.9, 1.55, 1.55, 1.55, 1.25, 1.35, 1.15];
    // Mesma moldura arredondada + zebra do resto do deck (pedido do
    // usuário, 2026-09-22). rowH continua compacto (0,3) porque são 2
    // tabelas empilhadas no mesmo slide — não dá pra aumentar tanto quanto
    // a de Velocidade sem estourar o espaço disponível.
    const tabelaTopTfr = (casos: typeof data.topTfrProdutor, y: number) => {
      const linhas: PptxGenJS.TableRow[] = [
        [
          { text: "Cliente", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, fontFace: FONT_BODY } },
          { text: "Abertura", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, fontFace: FONT_BODY } },
          { text: "1ª resposta", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, fontFace: FONT_BODY } },
          { text: "Fechamento", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, fontFace: FONT_BODY } },
          { text: "TFR útil", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, align: "right", fontFace: FONT_BODY } },
          { text: "TFR corrido", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, align: "right", fontFace: FONT_BODY } },
          { text: "Chamado", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 8.5, align: "center", fontFace: FONT_BODY } },
        ],
        ...casos.map((c, i) => {
          const corrido = tfrCorridoSeg(c.current_started_at, c.primeira_resposta_humana_at);
          const zebra = i % 2 === 1 ? COR.cardBg2 : COR.cardBg;
          return [
            { text: c.cliente_nome || "—", options: { color: COR.ink, fontSize: 8.5, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: fmtDataHora(c.current_started_at), options: { color: COR.inkSoft, fontSize: 8, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: fmtDataHora(c.primeira_resposta_humana_at), options: { color: COR.inkSoft, fontSize: 8, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: fmtDataHora(c.resolved_at), options: { color: COR.inkSoft, fontSize: 8, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: formatDuration(c.tempo_primeira_resposta_seg), options: { color: COR.mint, bold: true, fontSize: 8.5, align: "right" as const, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: formatDuration(corrido), options: { color: COR.inkSoft, fontSize: 8, align: "right" as const, fill: { color: zebra }, fontFace: FONT_BODY } },
            {
              text: c.link_chamado ? "Ver ↗" : "—",
              options: {
                color: c.link_chamado ? COR.mint : COR.inkFraco, fontSize: 8, align: "center" as const, fill: { color: zebra }, fontFace: FONT_BODY,
                hyperlink: c.link_chamado ? { url: c.link_chamado } : undefined,
              },
            },
          ];
        }),
      ];
      tabelaArredondada(slide, MX, y, CW, linhas, colW, [0.27, ...casos.map(() => 0.27)]);
    };

    // Offsets recalculados pra sobrar dos dois lados (subtítulo do banner
    // novo termina em ~1,38in; cada moldura arredondada tem 0,16in de
    // acolchoamento pra fora da tabela) — reconferido gerando o pptx real
    // e medindo o XML antes de fechar.
    slide.addText("PRODUTOR", { x: MX, y: 1.45, w: CW, h: 0.26, fontSize: 11, bold: true, color: COR.mint, charSpacing: 0.5, fontFace: FONT_BODY });
    if (data.topTfrProdutor.length > 0) {
      tabelaTopTfr(data.topTfrProdutor, 1.89);
    } else {
      slide.addText("Sem casos no período.", { x: MX, y: 1.89, w: CW, h: 0.3, fontSize: 9, italic: true, color: COR.inkFraco, fontFace: FONT_BODY });
    }

    slide.addText("CLIENTE FINAL", { x: MX, y: 3.82, w: CW, h: 0.26, fontSize: 11, bold: true, color: COR.mint, charSpacing: 0.5, fontFace: FONT_BODY });
    if (data.topTfrFinal.length > 0) {
      tabelaTopTfr(data.topTfrFinal, 4.26);
    } else {
      slide.addText("Sem casos no período.", { x: MX, y: 4.26, w: CW, h: 0.3, fontSize: 9, italic: true, color: COR.inkFraco, fontFace: FONT_BODY });
    }

    slide.addText(
      `Mediana de TFR (horas úteis) no período: ${formatDuration(A.percentis?.tfr_p50 ?? null)} — referência pra comparar com os 5 casos de cada grupo acima, que são os piores, não o típico.`,
      { x: MX, y: 6.19, w: CW, h: 0.4, fontSize: 8.5, color: COR.inkFraco, italic: true, fontFace: FONT_BODY }
    );
  }

  // ---------- Avaliações (CSAT) ----------
  {
    const boasPct = A.csat && A.csat.total > 0 ? (A.csat.boas / A.csat.total) * 100 : null;
    const boasPctPrev = P.csat && P.csat.total > 0 ? (P.csat.boas / P.csat.total) * 100 : null;
    metricasSlide("Avaliações (CSAT)", undefined, [
      { label: "Total de avaliações", valor: fmtNum(A.csat?.total), delta: deltaPercentual(A.csat?.total, P.csat?.total, false), nota: A.reabertura ? `De ${fmtNum(A.reabertura.total_resolvidos)} chamados resolvidos` : undefined },
      { label: "Avaliações boas (4–5)", valor: fmtPct1(boasPct), delta: deltaPercentual(boasPct, boasPctPrev, false), nota: A.csat ? `${A.csat.boas} de ${A.csat.total}` : undefined },
      { label: "Avaliações ruins (1–2)", valor: fmtNum(A.csat?.ruins), delta: deltaPercentual(A.csat?.ruins, P.csat?.ruins, true), nota: A.csat ? `${A.csat.neutras} neutras (nota 3)` : undefined },
    ]);
  }

  // ---------- Avaliações (CSAT) por tipo de cliente ----------
  // Amostra via crisp_id (só ~40%+ das avaliações recentes tem esse
  // vínculo, ver fetchCsatDistribuicaoPorTipoCliente) — não é a contagem
  // exata de CSAT por tipo, por isso o aviso explícito no rodapé de cada
  // slide. Dinâmico: uma slide por tipo com avaliação de verdade no
  // período, "Sem tipo" incluso se houver.
  // Uma slide só, um card por tipo lado a lado (mesmo padrão que a
  // Velocidade já usava pra Final/Produtor) — antes era uma slide inteira
  // por tipo, pedido do usuário pra juntar.
  {
    const tiposCsat = A.csatPorTipoCliente.filter((c) => c.total > 0);
    if (tiposCsat.length > 0) {
      const slide = slideBase("Avaliações (CSAT) por tipo de cliente", "Amostra via crisp_id — cobre parte das avaliações recentes, crescendo. Não é a contagem exata.");
      const gap = 0.3;
      const colW = (CW - gap * (tiposCsat.length - 1)) / tiposCsat.length;
      const cardH = 2.3;
      const y = 2.1;
      tiposCsat.forEach((c, i) => {
        const prev = P.csatPorTipoCliente.find((p) => p.tipo_cliente === c.tipo_cliente);
        const boasPct = c.total > 0 ? (c.boas / c.total) * 100 : null;
        const boasPctPrev = prev && prev.total > 0 ? (prev.boas / prev.total) * 100 : null;
        metricCard(slide, MX + i * (colW + gap), y, colW, cardH, {
          label: tituloTipo(c.tipo_cliente),
          valor: fmtPct1(boasPct),
          delta: deltaPercentual(boasPct, boasPctPrev, false),
          nota: `${fmtNum(c.total)} avaliações · ${fmtNum(c.ruins)} ruins`,
        });
      });
      slide.addText(
        "Valor grande = % de avaliações boas (nota 4-5). \"Ruins\" = notas 1-2.",
        { x: MX, y: y + cardH + 0.2, w: CW, h: 0.35, fontSize: 9.5, color: COR.inkFraco, italic: true, fontFace: FONT_BODY }
      );
    }
  }

  // ---------- CSAT por atendente (tabela) ----------
  {
    const linhas = data.csatPorAtendente
      .filter((c) => c.csat_medio !== null)
      .sort((a, b) => (b.csat_medio ?? 0) - (a.csat_medio ?? 0))
      .slice(0, 10);
    if (linhas.length > 0) {
      const slide = slideBase("CSAT por atendente", "Nota média e volume de avaliações no período.");
      const linhasTabela: PptxGenJS.TableRow[] = [
        [
          { text: "Atendente", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 11, fontFace: FONT_BODY } },
          { text: "Nota média", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 11, align: "right", fontFace: FONT_BODY } },
          { text: "Avaliações", options: { bold: true, color: COR.bg, fill: { color: COR.mint }, fontSize: 11, align: "right", fontFace: FONT_BODY } },
        ],
        ...linhas.map((c, i) => {
          const zebra = i % 2 === 1 ? COR.cardBg2 : COR.cardBg;
          return [
            { text: c.operator_nome, options: { color: COR.ink, fontSize: 11, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: (c.csat_medio ?? 0).toFixed(2).replace(".", ","), options: { color: COR.inkSoft, fontSize: 11, align: "right" as const, fill: { color: zebra }, fontFace: FONT_BODY } },
            { text: String(c.total_avaliacoes), options: { color: COR.inkSoft, fontSize: 11, align: "right" as const, fill: { color: zebra }, fontFace: FONT_BODY } },
          ];
        }),
      ];
      tabelaArredondada(slide, MX, 2.1, CW, linhasTabela, [CW - 3.2, 1.6, 1.6], [0.4, ...linhas.map(() => 0.4)]);
    }
  }

  // ---------- Bot (IA Greenn) ----------
  {
    const bot = data.csatPorAtendente.find((c) => c.operator_nome === NOME_BOT);
    const botDist = data.csatPorAtendenteDist.find((d) => d.atendente === NOME_BOT);
    const slide = metricasSlide("Bot (IA Greenn)", "Triagem automática — separado do ranking humano.", [
      { label: "Chamados", valor: fmtNum(bot?.total_atendimentos) },
      { label: "CSAT médio", valor: bot?.csat_medio != null ? bot.csat_medio.toFixed(2).replace(".", ",") : "—", nota: bot ? `${bot.total_avaliacoes} avaliações` : undefined },
      { label: "Tempo médio de resposta", valor: formatDuration(A.tempoRespostaBot?.tempo_medio_seg ?? null), nota: A.tempoRespostaBot ? `${A.tempoRespostaBot.amostras} amostras (mediana)` : undefined },
    ]);
    if (botDist && botDist.total > 0) {
      slide.addText(
        `${botDist.total} avaliações — ${botDist.boas} promotor(as), ${botDist.neutras} neutra(s), ${botDist.ruins} detrator(as)`,
        { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 11, color: COR.inkSoft, fontFace: FONT_BODY }
      );
    }
  }

  // ---------- Ranking de atendentes ----------
  if (A.rankingHumano.length > 0) {
    const slide = slideBase("Ranking de atendentes", "Top 3 por volume, atendentes humanos.");
    const y0 = 2.2;
    A.rankingHumano.slice(0, 3).forEach((r, i) => {
      const prev = P.rankingHumano.find((p) => p.operator_nome === r.operator_nome);
      const delta = prev ? deltaPercentual(r.total_atendimentos, prev.total_atendimentos, false) : undefined;
      const dist = data.csatPorAtendenteDist.find((d) => d.atendente === r.operator_nome);
      const csatPct = dist && dist.total > 0 ? (dist.boas / dist.total) * 100 : null;
      const y = y0 + i * 1.1;
      const destaque = i === 0;
      slide.addShape("roundRect", { x: MX, y, w: CW, h: 0.9, rectRadius: 0.08, fill: { color: COR.cardBg }, line: { color: destaque ? COR.mint : COR.cardBorder, width: destaque ? 1.5 : 1 } });
      slide.addText(`${i + 1}º`, { x: MX + 0.25, y, w: 0.9, h: 0.9, fontSize: 24, bold: true, color: destaque ? COR.mint : COR.inkFraco, valign: "middle", fontFace: FONT_DISPLAY });
      slide.addText(r.operator_nome, { x: MX + 1.2, y, w: 5.3, h: 0.9, fontSize: 16, bold: true, color: COR.ink, valign: "middle", fontFace: FONT_BODY });
      if (csatPct !== null) {
        slide.addText(`CSAT ${fmtPct1(csatPct)} (${dist!.total})`, { x: MX + 1.2, y: y + 0.5, w: 4.5, h: 0.35, fontSize: 10, color: COR.inkSoft, fontFace: FONT_BODY });
      }
      slide.addText(fmtNum(r.total_atendimentos), { x: CW + MX - 4.3, y, w: 2.2, h: 0.9, fontSize: 18, bold: true, color: COR.mint, align: "right", valign: "middle", fontFace: FONT_DISPLAY });
      slide.addText(delta?.texto ?? "sem comparação", { x: CW + MX - 2.0, y, w: 1.9, h: 0.9, fontSize: 12, bold: true, color: corDelta(delta), align: "right", valign: "middle", fontFace: FONT_BODY });
    });
  }

  // ---------- Reabertura ----------
  metricasSlide("Reabertura", "Conversa resolvida que o cliente reabriu.", [
    { label: "Taxa de reabertura", valor: fmtPct1(A.reabertura?.taxa_pct), delta: deltaPontos(A.reabertura?.taxa_pct, P.reabertura?.taxa_pct, true), nota: A.reabertura ? `${A.reabertura.total_resolvidos} chamados resolvidos` : undefined },
    { label: "Conversas reabertas", valor: fmtNum(A.reabertura?.total_reabertos), delta: deltaPercentual(A.reabertura?.total_reabertos, P.reabertura?.total_reabertos, true) },
    { label: "Eventos de reabertura", valor: fmtNum(A.reabertura?.total_eventos), nota: "Uma conversa pode reabrir mais de uma vez" },
  ]);

  // ---------- NPS (números reais de nps_responses; "temas" continua manual) ----------
  {
    const slide = metricasSlide("NPS", "Direto do módulo NPS do Hub — ainda roda com dado de exemplo, sem integração real com HugMe/Crisp.", [
      { label: "Contatados", valor: fmtNum(A.npsResumo?.total), delta: deltaPercentual(A.npsResumo?.total, P.npsResumo?.total, false) },
      { label: "Promotores", valor: fmtNum(A.npsResumo?.promotores), delta: deltaPercentual(A.npsResumo?.promotores, P.npsResumo?.promotores, false) },
      { label: "Neutros", valor: fmtNum(A.npsResumo?.neutros) },
      { label: "Detratores", valor: fmtNum(A.npsResumo?.detratores), delta: deltaPercentual(A.npsResumo?.detratores, P.npsResumo?.detratores, true) },
    ]);
    if (M?.nps.temas) {
      slide.addText("Temas mais abordados", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT_BODY });
      slide.addText(M.nps.temas, { x: MX, y: 5.1, w: CW, h: 1.7, fontSize: 11, color: COR.inkSoft, fontFace: FONT_BODY, valign: "top" });
    }
  }

  // ---------- SAC — Migrações (manual) ----------
  {
    const mg = M?.migracoes;
    const preenchido = !!(mg && (mg.finalizadas || mg.emProgresso || mg.aguardando || mg.plataformas));
    const slide = metricasSlide("SAC — Migrações", "Dado manual do time — o Hub não rastreia migração por plataforma.", [
      { label: "Finalizadas", valor: mg?.finalizadas || "—" },
      { label: "Em progresso", valor: mg?.emProgresso || "—" },
      { label: "Aguardando", valor: mg?.aguardando || "—" },
    ], preenchido ? undefined : "Sem dado preenchido nesta semana — nada foi estimado.");
    if (mg?.plataformas) {
      slide.addText("Migrações por plataforma", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT_BODY });
      slide.addText(mg.plataformas, { x: MX, y: 5.1, w: CW, h: 1.6, fontSize: 11, color: COR.inkSoft, fontFace: FONT_BODY, valign: "top" });
    }
  }

  // ---------- Reclame Aqui (manual) ----------
  {
    const ra = M?.reclameAqui;
    const preenchido = !!(ra && (ra.nota || ra.totalReclamacoes));
    const slide = metricasSlide("Reclame Aqui", "Dado manual — não vem do Hub (sem integração com a RA API hoje).", [
      { label: "Nota", valor: ra?.nota || "—" },
      { label: "Total de reclamações", valor: ra?.totalReclamacoes || "—", nota: ra?.deltaPct ? `${ra.deltaPct} vs. semana anterior` : undefined },
    ], preenchido ? undefined : "Sem dado preenchido nesta semana — nada foi estimado.");
    if (ra?.produtorDestaque) {
      slide.addText("Produtor destaque", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT_BODY });
      slide.addText(ra.produtorDestaque, { x: MX, y: 5.1, w: CW, h: 1.6, fontSize: 11, color: COR.inkSoft, fontFace: FONT_BODY, valign: "top" });
    }
  }

  // ---------- RA XGROW (manual) ----------
  {
    const rx = M?.raXgrow;
    const preenchido = !!(rx && (rx.nota || rx.totalReclamacoes));
    metricasSlide("RA XGROW", "Dado manual — mesma fonte externa do Reclame Aqui, empresa XGROW.", [
      { label: "Total de reclamações", valor: rx?.totalReclamacoes || "—" },
      { label: "Nota", valor: rx?.nota || "—", nota: rx?.notaAnterior ? `Nota anterior: ${rx.notaAnterior}` : undefined },
    ], preenchido ? undefined : "Sem dado preenchido nesta semana — nada foi estimado.");
  }

  // periodoAtualLabel tem "/" pra granularidade Semanal (ex: "16/09 a
  // 22/09") — barra crua no nome de arquivo de download é interpretada
  // como separador de caminho por navegador/SO, cortando ou corrompendo o
  // nome final (achado real testando este export fora do navegador, via
  // Node). Sempre trocar por "-" no nome do arquivo.
  const nomeArquivo = `Resultados SAC - ${data.periodoAtualLabel.replace(/\//g, "-")}.pptx`;
  await pptx.writeFile({ fileName: nomeArquivo });
}
