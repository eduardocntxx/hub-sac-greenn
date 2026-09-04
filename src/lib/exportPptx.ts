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
const FONT = "Poppins";

// Tema escuro, espelhando o dark mode do próprio Hub (seção 13 do
// CLAUDE.md: ink/sand-bg/sand-surface) — decisão tomada em 2026-09-04 a
// pedido do usuário ("faz bem chave e com tema escuro"), substituindo o
// tema claro anterior. pptxgenjs não lê CSS/variável de tema, então os hex
// ficam fixos aqui.
const COR = {
  bg: "121417",
  cardBg: "1C2024",
  cardBorder: "2A3238",
  ink: "F2F4F6",
  inkSoft: "9AA3AC",
  inkFraco: "72797F",
  branco: "FFFFFF",
  forest: "149A80",
  teal: "2FE0C8",
  rust: "F1685F",
  amber: "F2B84B",
};

interface CardInfo {
  label: string;
  valor: string;
  delta?: DeltaInfo;
  nota?: string;
}

function corDelta(delta?: DeltaInfo): string {
  if (!delta) return COR.inkFraco;
  return delta.bom === null ? COR.inkFraco : delta.bom ? COR.teal : COR.rust;
}

function hexParaRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function misturar(hexA: string, hexB: string, t: number): string {
  const a = hexParaRgb(hexA), b = hexParaRgb(hexB);
  return a
    .map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function gradienteHorizontal(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, corA: string, corB: string, faixas = 36) {
  const passo = w / faixas;
  for (let i = 0; i < faixas; i++) {
    slide.addShape("rect", { x: x + i * passo, y, w: passo + 0.01, h, fill: { color: misturar(corA, corB, i / (faixas - 1)) }, line: { type: "none" } });
  }
}
function gradienteVertical(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, corA: string, corB: string, faixas = 40) {
  const passo = h / faixas;
  for (let i = 0; i < faixas; i++) {
    slide.addShape("rect", { x, y: y + i * passo, w, h: passo + 0.01, fill: { color: misturar(corA, corB, i / (faixas - 1)) }, line: { type: "none" } });
  }
}

// Logo real da Greenn (embutido em base64 — pptxgenjs no navegador não lê
// caminho de arquivo, só data URI ou URL) + halo circular sutil.
function seloGreenn(slide: PptxGenJS.Slide, cx: number, cy: number, d: number, comHalo?: boolean) {
  if (comHalo) {
    slide.addShape("ellipse", { x: cx - d / 2 - 0.06, y: cy - d / 2 - 0.06, w: d + 0.12, h: d + 0.12, fill: { color: COR.branco } });
  }
  slide.addImage({ data: GREENN_LOGO_BASE64, x: cx - d / 2, y: cy - d / 2, w: d, h: d });
}

export async function exportResultadosSacToPptx(data: ResultadosSacData): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "HUB_SAC", width: 13.333, height: 7.5 });
  pptx.layout = "HUB_SAC";

  const MX = 0.55;
  const CW = 13.333 - MX * 2;

  function slideBase(titulo: string, subtitulo?: string) {
    const slide = pptx.addSlide();
    slide.background = { color: COR.bg };
    gradienteHorizontal(slide, 0, 0, 13.333, 1.15, COR.teal, COR.forest);
    slide.addText(titulo, {
      x: MX, y: 0, w: 10.3, h: 1.15, fontSize: 26, bold: true, color: COR.branco, fontFace: FONT, valign: "middle",
    });
    if (subtitulo) {
      slide.addText(subtitulo, { x: MX, y: 0.78, w: 10.3, h: 0.3, fontSize: 11, color: "E8FBF6", fontFace: FONT });
    }
    seloGreenn(slide, 12.72, 0.575, 0.72, true);
    slide.addText(`${data.periodoAtualLabel}  ·  comparado a ${data.periodoAnteriorLabel}`, {
      x: MX, y: 7.1, w: CW, h: 0.3, fontSize: 9, color: COR.inkFraco, fontFace: FONT,
    });
    return slide;
  }

  function metricCard(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, card: CardInfo) {
    slide.addShape("roundRect", {
      x, y, w, h, rectRadius: 0.1,
      fill: { color: COR.cardBg }, line: { color: COR.cardBorder, width: 1 },
      shadow: { type: "outer", color: "000000", opacity: 0.35, blur: 6, offset: 3, angle: 90 },
    });
    gradienteHorizontal(slide, x, y, w, 0.06, COR.teal, COR.forest);
    slide.addText(card.label.toUpperCase(), { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.28, fontSize: 9, bold: true, color: COR.inkSoft, charSpacing: 0.5, fontFace: FONT });
    slide.addText(card.valor, { x: x + 0.2, y: y + 0.5, w: w - 0.4, h: 0.6, fontSize: 26, bold: true, color: COR.teal, fontFace: FONT });
    let linhaY = y + h - 0.55;
    if (card.delta) {
      slide.addText(card.delta.texto, { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.28, fontSize: 12, bold: true, color: corDelta(card.delta), fontFace: FONT });
      linhaY += 0.3;
    } else {
      slide.addText("sem comparação", { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.28, fontSize: 10, color: COR.inkFraco, italic: true, fontFace: FONT });
      linhaY += 0.3;
    }
    if (card.nota) {
      slide.addText(card.nota, { x: x + 0.2, y: linhaY, w: w - 0.4, h: 0.35, fontSize: 8.5, color: COR.inkFraco, fontFace: FONT });
    }
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
      slide.addText(notaRodape, { x: MX, y: y + h + 0.25, w: CW, h: 0.6, fontSize: 9.5, color: COR.inkFraco, italic: true, fontFace: FONT });
    }
    return slide;
  }

  // ---------- Slide 1: capa ----------
  {
    const slide = pptx.addSlide();
    gradienteVertical(slide, 0, 0, 13.333, 7.5, COR.teal, "0B1A18");
    slide.addShape("ellipse", { x: -2.3, y: -2.3, w: 6, h: 6, fill: { type: "none" }, line: { color: COR.branco, width: 10, transparency: 88 } });
    slide.addShape("ellipse", { x: 10.3, y: 4.8, w: 5.5, h: 5.5, fill: { type: "none" }, line: { color: COR.branco, width: 10, transparency: 90 } });
    seloGreenn(slide, 6.667, 1.8, 1.4, true);
    slide.addText("HUB SAC GREENN", { x: 0.8, y: 2.85, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: COR.branco, charSpacing: 2, fontFace: FONT, align: "center" });
    slide.addText("Reunião de Resultados", { x: 0.8, y: 3.25, w: 11.7, h: 1.0, fontSize: 40, bold: true, color: COR.branco, fontFace: FONT, align: "center" });
    slide.addText(data.periodoAtualLabel, { x: 0.8, y: 4.2, w: 11.7, h: 0.5, fontSize: 18, color: "D8F5EF", fontFace: FONT, align: "center" });
    slide.addText(`Comparado a ${data.periodoAnteriorLabel}`, { x: 0.8, y: 4.65, w: 11.7, h: 0.4, fontSize: 12, color: "D8F5EF", fontFace: FONT, align: "center" });
    slide.addText(`Gerado em ${new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}`, {
      x: 0.8, y: 6.95, w: 11.7, h: 0.3, fontSize: 9, color: "9FDDD1", fontFace: FONT, align: "center",
    });
  }

  const A = data.atual;
  const P = data.anterior;
  const M = data.manual;

  // ---------- Crisp — Chamados ----------
  {
    const backlogTotal = data.backlog.reduce((acc, b) => acc + b.total, 0);
    metricasSlide("Crisp — Chamados", "Todos os canais e atendentes, incluindo o bot.", [
      { label: "Total de chamados", valor: fmtNum(A.contagem?.total_chamados), delta: deltaPercentual(A.contagem?.total_chamados, P.contagem?.total_chamados, false), nota: "Cada ciclo aberto→resolvido" },
      { label: "Total de conversas", valor: fmtNum(A.contagem?.total_conversas), delta: deltaPercentual(A.contagem?.total_conversas, P.contagem?.total_conversas, false), nota: "Cada conversa do Crisp, uma vez" },
      { label: "Total de mensagens", valor: fmtNum(A.contagem?.total_mensagens), delta: deltaPercentual(A.contagem?.total_mensagens, P.contagem?.total_mensagens, false) },
      { label: "Chamados pendentes", valor: fmtNum(backlogTotal), nota: "Backlog — total em aberto agora, não escopado por período" },
    ]);
  }

  // ---------- Velocidade ----------
  metricasSlide("Velocidade", "Tempo de resposta e resolução, em horas úteis do time.", [
    {
      label: "Tempo até 1ª resposta", valor: formatDuration(A.percentis?.tfr_media ?? null),
      delta: deltaPercentual(A.percentis?.tfr_media, P.percentis?.tfr_media, true),
      nota: A.percentis ? `${A.percentis.tfr_amostras} amostras` : undefined,
    },
    {
      label: "Tempo até resolução", valor: formatDuration(A.percentis?.ttr_media ?? null),
      delta: deltaPercentual(A.percentis?.ttr_media, P.percentis?.ttr_media, true),
      nota: A.percentis ? `${A.percentis.ttr_amostras} amostras` : undefined,
    },
    {
      label: "SLA de 1ª resposta", valor: fmtPct1(A.percentis?.tfr_sla_pct),
      delta: deltaPontos(A.percentis?.tfr_sla_pct, P.percentis?.tfr_sla_pct, false),
    },
  ], "\"Amostras\" conta só quem já tem TFR/TTR calculado de verdade (já teve resposta humana / já foi resolvido) — sempre menor ou igual ao \"Total de chamados\" do slide anterior, que conta todo mundo, respondido ou não.");

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
          { text: "Atendente", options: { bold: true, color: COR.bg, fill: { color: COR.teal }, fontSize: 11, fontFace: FONT } },
          { text: "Nota média", options: { bold: true, color: COR.bg, fill: { color: COR.teal }, fontSize: 11, align: "right", fontFace: FONT } },
          { text: "Avaliações", options: { bold: true, color: COR.bg, fill: { color: COR.teal }, fontSize: 11, align: "right", fontFace: FONT } },
        ],
        ...linhas.map((c) => [
          { text: c.operator_nome, options: { color: COR.ink, fontSize: 11, fill: { color: COR.cardBg }, fontFace: FONT } },
          { text: (c.csat_medio ?? 0).toFixed(2).replace(".", ","), options: { color: COR.inkSoft, fontSize: 11, align: "right" as const, fill: { color: COR.cardBg }, fontFace: FONT } },
          { text: String(c.total_avaliacoes), options: { color: COR.inkSoft, fontSize: 11, align: "right" as const, fill: { color: COR.cardBg }, fontFace: FONT } },
        ]),
      ];
      slide.addTable(linhasTabela, { x: MX, y: 2.1, w: CW, colW: [CW - 3.2, 1.6, 1.6], border: { type: "solid", color: COR.cardBorder, pt: 0.5 }, autoPage: false });
    }
  }

  // ---------- Bot (IA Greenn) ----------
  {
    const bot = data.csatPorAtendente.find((c) => c.operator_nome === NOME_BOT);
    metricasSlide("Bot (IA Greenn)", "Triagem automática — separado do ranking humano.", [
      { label: "Chamados", valor: fmtNum(bot?.total_atendimentos) },
      { label: "CSAT médio", valor: bot?.csat_medio != null ? bot.csat_medio.toFixed(2).replace(".", ",") : "—", nota: bot ? `${bot.total_avaliacoes} avaliações` : undefined },
      { label: "Tempo médio de resposta", valor: formatDuration(A.tempoRespostaBot?.tempo_medio_seg ?? null), nota: A.tempoRespostaBot ? `${A.tempoRespostaBot.amostras} amostras (mediana)` : undefined },
    ]);
  }

  // ---------- Ranking de atendentes ----------
  if (A.rankingHumano.length > 0) {
    const slide = slideBase("Ranking de atendentes", "Top 3 por volume, atendentes humanos.");
    const y0 = 2.2;
    A.rankingHumano.slice(0, 3).forEach((r, i) => {
      const prev = P.rankingHumano.find((p) => p.operator_nome === r.operator_nome);
      const delta = prev ? deltaPercentual(r.total_atendimentos, prev.total_atendimentos, false) : undefined;
      const y = y0 + i * 1.1;
      const destaque = i === 0;
      slide.addShape("roundRect", { x: MX, y, w: CW, h: 0.9, rectRadius: 0.08, fill: { color: COR.cardBg }, line: { color: destaque ? COR.teal : COR.cardBorder, width: destaque ? 1.5 : 1 } });
      slide.addText(`${i + 1}º`, { x: MX + 0.25, y, w: 0.9, h: 0.9, fontSize: 22, bold: true, color: destaque ? COR.amber : COR.inkFraco, valign: "middle", fontFace: FONT });
      slide.addText(r.operator_nome, { x: MX + 1.2, y, w: 6.5, h: 0.9, fontSize: 16, bold: true, color: COR.ink, valign: "middle", fontFace: FONT });
      slide.addText(fmtNum(r.total_atendimentos), { x: CW + MX - 4.3, y, w: 2.2, h: 0.9, fontSize: 18, bold: true, color: COR.teal, align: "right", valign: "middle", fontFace: FONT });
      slide.addText(delta?.texto ?? "sem comparação", { x: CW + MX - 2.0, y, w: 1.9, h: 0.9, fontSize: 12, bold: true, color: corDelta(delta), align: "right", valign: "middle", fontFace: FONT });
    });
  }

  // ---------- Operação — Backlog ----------
  if (data.backlog.length > 0) {
    const slide = slideBase("Operação — Backlog", "Chamados abertos agora, por idade — não é escopado por período.");
    const total = data.backlog.reduce((acc, b) => acc + b.total, 0);
    const max = Math.max(...data.backlog.map((b) => b.total), 1);
    const y0 = 2.1;
    const barX = MX + 2.6;
    const barMaxW = CW - 2.6 - 1.1;
    data.backlog.forEach((b, i) => {
      const y = y0 + i * 0.75;
      slide.addText(b.faixa, { x: MX, y, w: 2.4, h: 0.55, fontSize: 13, bold: true, color: COR.ink, valign: "middle", fontFace: FONT });
      const w = Math.max((b.total / max) * barMaxW, 0.05);
      slide.addShape("roundRect", { x: barX, y: y + 0.08, w, h: 0.4, rectRadius: 0.05, fill: { color: COR.teal } });
      slide.addText(String(b.total), { x: barX + w + 0.15, y, w: 1.0, h: 0.55, fontSize: 13, bold: true, color: COR.ink, valign: "middle", fontFace: FONT });
    });
    // Altura do card precisa ser generosa o bastante pro layout interno do
    // metricCard() (desenhado pra h=2.3 dentro de metricasSlide()) não fazer
    // "sem comparação" colidir com o valor — achado real numa auditoria,
    // um card de 1.35" fazia as duas linhas se sobreporem.
    const cardY = y0 + data.backlog.length * 0.75 + 0.15;
    const cardH = 1.5;
    metricCard(slide, MX, cardY, 4.0, cardH, { label: "Chamados pendentes agora", valor: fmtNum(total) });
    slide.addText("Backlog é sempre \"o que está aberto agora\" — não existe comparação com a semana anterior.", { x: MX, y: cardY + cardH + 0.15, w: CW, h: 0.3, fontSize: 10, color: COR.inkFraco, italic: true, fontFace: FONT });
  }

  // ---------- Reabertura ----------
  metricasSlide("Reabertura", "Conversa resolvida que o cliente reabriu.", [
    { label: "Taxa de reabertura", valor: fmtPct1(A.reabertura?.taxa_pct), delta: deltaPontos(A.reabertura?.taxa_pct, P.reabertura?.taxa_pct, true), nota: A.reabertura ? `${A.reabertura.total_resolvidos} chamados resolvidos` : undefined },
    { label: "Conversas reabertas", valor: fmtNum(A.reabertura?.total_reabertos), delta: deltaPercentual(A.reabertura?.total_reabertos, P.reabertura?.total_reabertos, true) },
    { label: "Eventos de reabertura", valor: fmtNum(A.reabertura?.total_eventos), nota: "Uma conversa pode reabrir mais de uma vez" },
  ]);

  // ---------- Transferências ----------
  metricasSlide("Transferências", "Troca de atendente humano na mesma conversa.", [
    { label: "Taxa de transferência", valor: fmtPct1(A.transferencias?.taxa_pct), delta: deltaPontos(A.transferencias?.taxa_pct, P.transferencias?.taxa_pct, true), nota: A.transferencias ? `${A.transferencias.total_atendidos} chamados atendidos` : undefined },
    { label: "Conversas transferidas", valor: fmtNum(A.transferencias?.total_transferidos), delta: deltaPercentual(A.transferencias?.total_transferidos, P.transferencias?.total_transferidos, true), nota: A.transferencias ? `${A.transferencias.total_eventos} eventos` : undefined },
    { label: "Tempo médio até transferir", valor: formatDuration(A.transferencias?.tempo_medio_antes_seg ?? null), delta: deltaPercentual(A.transferencias?.tempo_medio_antes_seg, P.transferencias?.tempo_medio_antes_seg, true) },
  ]);

  // ---------- Relógios do atendimento ----------
  metricasSlide("Relógios do atendimento", "Ponto de vista do cliente e cobertura do time.", [
    { label: "Relógio do cliente", valor: formatDuration(A.percentis?.ttr_media ?? null), delta: deltaPercentual(A.percentis?.ttr_media, P.percentis?.ttr_media, true), nota: "Mesmo valor de Velocidade, do ponto de vista de quem esperou" },
    { label: "Relógio de espera do cliente", valor: formatDuration(A.relogioEspera?.minutos_espera_medio != null ? A.relogioEspera.minutos_espera_medio * 60 : null), delta: deltaPercentual(A.relogioEspera?.minutos_espera_medio, P.relogioEspera?.minutos_espera_medio, true), nota: A.relogioEspera ? `${A.relogioEspera.amostras} janelas até resposta humana (bot não conta)` : undefined },
    { label: "Relógio de trabalho ativo", valor: formatDuration(A.horasExpedienteMin != null ? A.horasExpedienteMin * 60 : null), nota: "Expediente cadastrado do time (cobertura, não presença real)" },
  ]);

  // ---------- Por tipo de cliente ----------
  if (A.tipoCliente.length > 0) {
    const slide = slideBase("Por tipo de cliente", "Segmentação real capturada pela Crisp.");
    const n = A.tipoCliente.length;
    const cols = Math.min(n, 4);
    const gap = 0.3;
    const w = (CW - gap * (cols - 1)) / cols;
    const h = 2.3;
    A.tipoCliente.slice(0, 8).forEach((tc, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MX + col * (w + gap);
      const y = 2.1 + row * (h + gap);
      const prev = P.tipoCliente.find((p) => p.tipo_cliente === tc.tipo_cliente);
      slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: COR.cardBg }, line: { color: COR.cardBorder, width: 1 } });
      slide.addShape("roundRect", { x, y, w, h: 0.06, fill: { color: COR.teal }, line: { type: "none" } });
      slide.addText(tc.tipo_cliente.toUpperCase(), { x: x + 0.18, y: y + 0.2, w: w - 0.36, h: 0.28, fontSize: 9, bold: true, color: COR.inkSoft, fontFace: FONT });
      slide.addText(`${fmtNum(tc.chamados)} chamados`, { x: x + 0.18, y: y + 0.48, w: w - 0.36, h: 0.45, fontSize: 17, bold: true, color: COR.teal, fontFace: FONT });
      slide.addText(prev ? deltaPercentual(tc.chamados, prev.chamados, false)?.texto ?? "sem comparação" : "sem comparação", { x: x + 0.18, y: y + 0.9, w: w - 0.36, h: 0.25, fontSize: 10, bold: true, color: corDelta(prev ? deltaPercentual(tc.chamados, prev.chamados, false) : undefined), fontFace: FONT });
      slide.addText(`TFR: ${formatDuration(tc.tfr_media_seg)}`, { x: x + 0.18, y: y + 1.3, w: w - 0.36, h: 0.3, fontSize: 10, color: COR.inkSoft, fontFace: FONT });
      slide.addText(`TTR: ${formatDuration(tc.ttr_media_seg)}`, { x: x + 0.18, y: y + 1.6, w: w - 0.36, h: 0.3, fontSize: 10, color: COR.inkSoft, fontFace: FONT });
    });
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
      slide.addText("Migrações por plataforma", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT });
      slide.addText(mg.plataformas, { x: MX, y: 5.1, w: CW, h: 1.6, fontSize: 11, color: COR.inkSoft, fontFace: FONT, valign: "top" });
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
      slide.addText("Produtor destaque", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT });
      slide.addText(ra.produtorDestaque, { x: MX, y: 5.1, w: CW, h: 1.6, fontSize: 11, color: COR.inkSoft, fontFace: FONT, valign: "top" });
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

  // ---------- Dados NPS (manual) ----------
  {
    const nps = M?.nps;
    const preenchido = !!(nps && (nps.contatados || nps.detratores || nps.neutros || nps.promotores));
    const slide = metricasSlide("Dados NPS", "Dado manual — módulo de NPS do Hub ainda roda com exemplo.", [
      { label: "Contatados", valor: nps?.contatados || "—" },
      { label: "Detratores", valor: nps?.detratores || "—" },
      { label: "Neutros", valor: nps?.neutros || "—" },
      { label: "Promotores", valor: nps?.promotores || "—" },
    ], preenchido ? undefined : "Sem dado preenchido nesta semana — nada foi estimado.");
    if (nps?.temas) {
      slide.addText("Temas mais abordados", { x: MX, y: 4.7, w: CW, h: 0.35, fontSize: 13, bold: true, color: COR.ink, fontFace: FONT });
      slide.addText(nps.temas, { x: MX, y: 5.1, w: CW, h: 1.7, fontSize: 11, color: COR.inkSoft, fontFace: FONT, valign: "top" });
    }
  }

  const nomeArquivo = `Resultados SAC - ${data.periodoAtualLabel}.pptx`;
  await pptx.writeFile({ fileName: nomeArquivo });
}
