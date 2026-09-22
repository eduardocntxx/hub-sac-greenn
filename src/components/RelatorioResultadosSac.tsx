import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/formatDuration";
import {
  type ResultadosSacData,
  type DeltaInfo,
  fmtNum,
  fmtPct1,
  deltaPercentual,
  deltaPontos,
} from "@/lib/resultadosSac";

const NOME_BOT = "IA Greenn";

// Duas famílias fixas — mesma dupla usada em exportPptx.ts, ambas pinadas
// via inline style (nunca a classe utilitária `font-display`/`font-mono`
// do Tailwind, que aponta pra Sora desde o redesign do app em 2026-09-05).
// Esse desacoplamento existe de propósito: este relatório é um artefato de
// impressão com identidade própria (preto + verde-menta, referência
// "Tech News" do time de Tecnologia, 2026-09-22) que não deve mudar só
// porque o app ao vivo trocou de tema — mesmo princípio já aplicado às
// cores (ver o bloco de CSS vars redeclaradas mais abaixo).
const FONT_DISPLAY = { fontFamily: "Impact, 'Arial Narrow Bold', sans-serif" };
const FONT_LABEL = { fontFamily: "Arial, Helvetica, sans-serif", letterSpacing: "0.04em" };

interface RelatorioResultadosSacProps {
  data: ResultadosSacData;
  onClose: () => void;
  onExportarPptx: () => void | Promise<void>;
  exportandoPptx: boolean;
}

function DeltaTexto({ delta }: { delta?: DeltaInfo }) {
  if (!delta) return <span className="text-[13px] text-ink/30">sem comparação</span>;
  const cor = delta.bom === null ? "text-ink/40" : delta.bom ? "text-[#7FE0B4]" : "text-rust-500";
  return <span className={`text-[13px] font-semibold ${cor}`}>{delta.texto}</span>;
}

interface MetricaCardProps {
  label: string;
  valor: string;
  delta?: DeltaInfo;
  nota?: string;
}

function MetricaCard({ label, valor, delta, nota }: MetricaCardProps) {
  return (
    <div className="break-inside-avoid rounded-2xl border border-sand-line bg-sand-surface p-4 shadow-card print:shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40" style={FONT_LABEL}>{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-[#A8F5D0] tabular-nums" style={FONT_DISPLAY}>{valor}</p>
      <div className="mt-1.5"><DeltaTexto delta={delta} /></div>
      {nota && <p className="mt-1.5 text-[11px] text-ink/40">{nota}</p>}
    </div>
  );
}

// Tailwind escaneia classes literais no código-fonte — não dá pra interpolar
// o número de colunas direto na string (`sm:grid-cols-${cols}` nunca seria
// detectado pelo JIT), por isso as duas variantes ficam escritas por extenso.
function MetricaGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const gridCols =
    cols === 2
      ? "grid-cols-1 sm:grid-cols-2 print:grid-cols-2"
      : cols === 4
        ? "grid-cols-2 sm:grid-cols-4 print:grid-cols-4"
        : "grid-cols-1 sm:grid-cols-3 print:grid-cols-3";
  return <div className={`grid gap-3.5 ${gridCols}`}>{children}</div>;
}

// Chip local com as cores fixas do relatório (preto+menta) — não usa o
// componente `Badge` compartilhado nem classes `dark:` de propósito: esse
// chip precisa continuar exatamente igual não importa o tema do app.
function TagChipFixo({ tone, children }: { tone: "info" | "success"; children: React.ReactNode }) {
  return tone === "success" ? (
    <span className="inline-flex items-center rounded-full bg-[#A8F5D0] px-2.5 py-1 text-xs font-bold text-[#141414]">
      {children}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[#A8F5D0]/50 px-2.5 py-1 text-xs font-medium text-[#A8F5D0]">
      {children}
    </span>
  );
}

function SecaoHead({ titulo, tag, nota }: { titulo: string; tag?: "crisp" | "novo"; nota?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-tight text-ink" style={FONT_DISPLAY}>
        {titulo}
        {tag === "crisp" && <TagChipFixo tone="info">Crisp</TagChipFixo>}
        {tag === "novo" && <TagChipFixo tone="success">Novo</TagChipFixo>}
      </h2>
      {nota && <p className="max-w-[44ch] text-right text-[12px] text-ink/40">{nota}</p>}
    </div>
  );
}

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
// não é um campo da função — não precisa de 2ª chamada pra isso). Mesmo
// helper de exportPptx.ts, duplicado de propósito (arquivos sem import
// cruzado entre si).
function tfrCorridoSeg(abertura: string, primeiraResposta: string | null): number | null {
  if (!primeiraResposta) return null;
  const seg = (new Date(primeiraResposta).getTime() - new Date(abertura).getTime()) / 1000;
  return seg >= 0 ? seg : null;
}

export function RelatorioResultadosSac({ data, onClose, onExportarPptx, exportandoPptx }: RelatorioResultadosSacProps) {
  const A = data.atual;
  const P = data.anterior;
  const M = data.manual;

  const boasPct = A.csat && A.csat.total > 0 ? (A.csat.boas / A.csat.total) * 100 : null;
  const boasPctPrev = P.csat && P.csat.total > 0 ? (P.csat.boas / P.csat.total) * 100 : null;

  const csatComNota = data.csatPorAtendente
    .filter((c) => c.csat_medio !== null)
    .sort((a, b) => (b.csat_medio ?? 0) - (a.csat_medio ?? 0));

  const bot = data.csatPorAtendente.find((c) => c.operator_nome === NOME_BOT);
  const botDist = data.csatPorAtendenteDist.find((d) => d.atendente === NOME_BOT);

  const porTipoChamados = A.tipoCliente.filter((t) => t.tipo_cliente !== "Geral" && t.chamados > 0);
  const csatPorTipo = A.csatPorTipoCliente.filter((c) => c.total > 0);

  return (
    // Relatório sempre no tema próprio (preto + verde-menta), independente
    // do tema do app ao vivo — as classes abaixo usam os tokens
    // `text-ink`/`border-sand-line`/`bg-sand-surface`/`bg-sand-bg`, que são
    // variáveis CSS e herdariam o valor de `.dark`/`:root` do resto do app
    // sem isto. Redeclarar as variáveis aqui na raiz (com os valores do
    // tema deste relatório, não os do app) faz todo descendente que lê
    // `var(--color-ink)` etc. resolver pro conjunto certo — inclusive
    // dentro de `Button`/`MetricaCard`/etc. sem precisar hardcodar cada
    // classe. `bg-white`/cores soltas tipo `forest-600` continuam
    // IMUNES a isso (não são variável) — por isso o resto do arquivo evita
    // usá-las, preferindo os tokens ou hex fixo (`#A8F5D0`, `#141414`).
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-sand-bg print:static print:overflow-visible"
      style={{
        ["--color-ink" as string]: "255 255 255",
        ["--color-ink-soft" as string]: "184 184 184",
        ["--color-ink-tertiary" as string]: "122 122 122",
        ["--color-sand-bg" as string]: "20 20 20",
        ["--color-sand-surface" as string]: "30 30 30",
        ["--color-sand-subtle" as string]: "26 26 26",
        ["--color-sand-line" as string]: "46 46 46",
        ["--color-sand-line-strong" as string]: "58 58 58",
      }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sand-line bg-sand-bg px-6 py-3 print:hidden">
        <p className="text-sm font-medium text-ink/60">Pré-visualização do relatório — escolha o formato</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X size={14} /> Fechar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Download size={14} /> Baixar PDF
          </Button>
          <Button size="sm" disabled={exportandoPptx} onClick={onExportarPptx}>
            <Download size={14} /> {exportandoPptx ? "Gerando PPTX..." : "Baixar PPTX"}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] px-5 py-10 print:px-0 print:py-0">
        <header className="mb-10 print:mb-8">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#A8F5D0]" style={FONT_LABEL}>
            Hub SAC Greenn · Reunião de Resultados
          </p>
          <h1 className="text-balance text-3xl font-extrabold uppercase tracking-tight text-ink sm:text-4xl" style={FONT_DISPLAY}>
            Resultados da semana
          </h1>
          <p className="mt-2 text-[15px] text-ink/60">
            Período de <b className="font-semibold text-ink">{data.periodoAtualLabel}</b>, comparado à semana anterior (
            <b className="font-semibold text-ink">{data.periodoAnteriorLabel}</b>).
          </p>
        </header>

        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="Crisp — Chamados" tag="crisp" nota="Dados de todos os canais e atendentes, incluindo o bot." />
          <MetricaGrid>
            <MetricaCard
              label="Total de chamados"
              valor={fmtNum(A.contagem?.total_chamados)}
              delta={deltaPercentual(A.contagem?.total_chamados, P.contagem?.total_chamados, false)}
            />
            <MetricaCard
              label="Tempo até 1ª resposta"
              valor={formatDuration(A.percentis?.tfr_media ?? null)}
              delta={deltaPercentual(A.percentis?.tfr_media, P.percentis?.tfr_media, true)}
              nota={A.percentis ? `${A.percentis.tfr_amostras} amostras` : undefined}
            />
            <MetricaCard
              label="Tempo até resolução"
              valor={formatDuration(A.percentis?.ttr_media ?? null)}
              delta={deltaPercentual(A.percentis?.ttr_media, P.percentis?.ttr_media, true)}
              nota={A.percentis ? `${A.percentis.ttr_amostras} amostras` : undefined}
            />
          </MetricaGrid>

          {porTipoChamados.length > 0 && (
            <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
              {porTipoChamados.map((t) => (
                <div key={t.tipo_cliente} className="break-inside-avoid rounded-xl border border-sand-line bg-sand-surface px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40" style={FONT_LABEL}>{tituloTipo(t.tipo_cliente)}</p>
                  <p className="mt-1 text-xl font-extrabold text-[#A8F5D0] tabular-nums" style={FONT_DISPLAY}>{fmtNum(t.chamados)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {A.tipoCliente.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead titulo="Por tipo de cliente" tag="crisp" nota="Segmentação real capturada pela Crisp. TFR/TTR em horas úteis — média e mediana (p50, mais resistente a outlier) — com o tempo corrido ao lado." />
            <MetricaGrid cols={2}>
              {A.tipoCliente.filter((tc) => tc.tipo_cliente !== "Geral").map((tc) => {
                const prev = P.tipoCliente.find((p) => p.tipo_cliente === tc.tipo_cliente);
                return (
                  <div
                    key={tc.tipo_cliente}
                    className="break-inside-avoid rounded-2xl border border-sand-line bg-sand-surface p-4 shadow-card print:shadow-none"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40" style={FONT_LABEL}>{tc.tipo_cliente}</p>
                    <p className="mt-2 text-2xl font-extrabold tracking-tight text-[#A8F5D0] tabular-nums" style={FONT_DISPLAY}>
                      {fmtNum(tc.chamados)}
                      <span className="ml-1 text-sm font-medium text-ink/40" style={{ fontFamily: "Arial, sans-serif" }}>chamados</span>
                    </p>
                    <div className="mt-1.5">
                      <DeltaTexto delta={prev ? deltaPercentual(tc.chamados, prev.chamados, false) : undefined} />
                    </div>
                    <div className="mt-3.5 flex gap-6 border-t border-sand-line pt-3.5">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40" style={FONT_LABEL}>TFR médio</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{formatDuration(tc.tfr_media_uteis_seg)}</p>
                        <p className="text-[10px] tabular-nums text-ink/40">Mediana: {formatDuration(tc.tfr_p50_uteis_seg)}</p>
                        <p className="text-[10px] tabular-nums text-ink/40">Corrido: {formatDuration(tc.tfr_media_corridas_seg)} (mediana {formatDuration(tc.tfr_p50_corridas_seg)})</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40" style={FONT_LABEL}>TTR médio</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{formatDuration(tc.ttr_media_uteis_seg)}</p>
                        <p className="text-[10px] tabular-nums text-ink/40">Mediana: {formatDuration(tc.ttr_p50_uteis_seg)}</p>
                        <p className="text-[10px] tabular-nums text-ink/40">Corrido: {formatDuration(tc.ttr_media_corridas_seg)} (mediana {formatDuration(tc.ttr_p50_corridas_seg)})</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </MetricaGrid>
          </section>
        )}

        {data.topTfrCasos.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead
              titulo="Top 5 — Maiores tempos de 1ª resposta"
              tag="novo"
              nota={`Mediana do período (útil): ${formatDuration(A.percentis?.tfr_p50 ?? null)} — os 5 abaixo são os piores casos, não o típico.`}
            />
            <div className="overflow-hidden rounded-2xl border border-sand-line shadow-card print:break-inside-avoid print:shadow-none">
              <table className="w-full text-sm">
                <thead className="bg-[#A8F5D0] text-xs uppercase tracking-wide text-[#141414]">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-bold">Cliente</th>
                    <th className="px-3 py-2.5 text-left font-bold">Abertura</th>
                    <th className="px-3 py-2.5 text-left font-bold">1ª resposta</th>
                    <th className="px-3 py-2.5 text-left font-bold">Fechamento</th>
                    <th className="px-3 py-2.5 text-right font-bold">TFR útil</th>
                    <th className="px-3 py-2.5 text-right font-bold">TFR corrido</th>
                    <th className="px-3 py-2.5 text-center font-bold">Chamado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topTfrCasos.map((c) => (
                    <tr key={c.id} className="border-t border-sand-line bg-sand-surface">
                      <td className="px-3 py-2.5 font-medium text-ink">{c.cliente_nome || "—"}</td>
                      <td className="px-3 py-2.5 text-ink/70">{fmtDataHora(c.current_started_at)}</td>
                      <td className="px-3 py-2.5 text-ink/70">{fmtDataHora(c.primeira_resposta_humana_at)}</td>
                      <td className="px-3 py-2.5 text-ink/70">{fmtDataHora(c.resolved_at)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#A8F5D0]">{formatDuration(c.tempo_primeira_resposta_seg)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink/70">{formatDuration(tfrCorridoSeg(c.current_started_at, c.primeira_resposta_humana_at))}</td>
                      <td className="px-3 py-2.5 text-center">
                        {c.link_chamado ? (
                          <a href={c.link_chamado} target="_blank" rel="noreferrer" className="text-[#A8F5D0] underline">
                            Ver ↗
                          </a>
                        ) : (
                          <span className="text-ink/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {A.rankingHumano.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead titulo="Ranking de atendimentos" tag="crisp" nota="Top 3 por volume, atendentes humanos." />
            <div className="flex flex-col gap-2.5">
              {A.rankingHumano.slice(0, 3).map((r, i) => {
                const prev = P.rankingHumano.find((p) => p.operator_nome === r.operator_nome);
                const delta = prev ? deltaPercentual(r.total_atendimentos, prev.total_atendimentos, false) : undefined;
                const dist = data.csatPorAtendenteDist.find((d) => d.atendente === r.operator_nome);
                const csatPct = dist && dist.total > 0 ? (dist.boas / dist.total) * 100 : null;
                return (
                  <div
                    key={r.operator_nome}
                    className={`grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 break-inside-avoid rounded-xl border px-4 py-3 shadow-card print:shadow-none ${
                      i === 0 ? "border-[#A8F5D0]/40 bg-[#A8F5D0]/10" : "border-sand-line bg-sand-surface"
                    }`}
                  >
                    <span className={`text-sm font-extrabold ${i === 0 ? "text-[#A8F5D0]" : "text-ink/40"}`} style={FONT_DISPLAY}>
                      {i + 1}º
                    </span>
                    <span>
                      <span className="block text-[14.5px] font-semibold text-ink">{r.operator_nome}</span>
                      {csatPct !== null && (
                        <span className="text-[11px] text-ink/40">CSAT {fmtPct1(csatPct)} ({dist!.total})</span>
                      )}
                    </span>
                    <span className="text-right text-sm font-bold tabular-nums text-ink" style={FONT_DISPLAY}>
                      {fmtNum(r.total_atendimentos)}
                    </span>
                    <span className="min-w-[70px] text-right">
                      <DeltaTexto delta={delta} />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="Avaliações (CSAT)" tag="crisp" />
          <MetricaGrid>
            <MetricaCard
              label="Total de avaliações"
              valor={fmtNum(A.csat?.total)}
              delta={deltaPercentual(A.csat?.total, P.csat?.total, false)}
            />
            <MetricaCard
              label="Avaliações boas (4–5)"
              valor={fmtPct1(boasPct)}
              delta={deltaPercentual(boasPct, boasPctPrev, false)}
              nota={A.csat ? `${A.csat.boas} de ${A.csat.total}` : undefined}
            />
            <MetricaCard
              label="Avaliações ruins (1–2)"
              valor={fmtNum(A.csat?.ruins)}
              delta={deltaPercentual(A.csat?.ruins, P.csat?.ruins, true)}
            />
          </MetricaGrid>

          {csatComNota.length > 0 && (
            <div className="mt-3.5 overflow-hidden rounded-2xl border border-sand-line shadow-card print:break-inside-avoid print:shadow-none">
              <table className="w-full text-sm">
                <thead className="bg-[#A8F5D0] text-xs uppercase tracking-wide text-[#141414]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-bold">Atendente</th>
                    <th className="px-4 py-2.5 text-right font-bold">Nota média</th>
                    <th className="px-4 py-2.5 text-right font-bold">Avaliações</th>
                  </tr>
                </thead>
                <tbody>
                  {csatComNota.map((c) => (
                    <tr key={c.operator_nome} className="border-t border-sand-line bg-sand-surface">
                      <td className="px-4 py-2.5 font-medium text-ink">{c.operator_nome}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink/70">{(c.csat_medio ?? 0).toFixed(2).replace(".", ",")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink/70">{c.total_avaliacoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {csatPorTipo.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead
              titulo="Avaliações (CSAT) por tipo de cliente"
              tag="novo"
              nota="Amostra via crisp_id — cobre parte das avaliações recentes, crescendo. Não é a contagem exata."
            />
            <div className="flex flex-col gap-3.5">
              {csatPorTipo.map((c) => {
                const prev = P.csatPorTipoCliente.find((p) => p.tipo_cliente === c.tipo_cliente);
                const pct = c.total > 0 ? (c.boas / c.total) * 100 : null;
                const pctPrev = prev && prev.total > 0 ? (prev.boas / prev.total) * 100 : null;
                return (
                  <div key={c.tipo_cliente} className="break-inside-avoid">
                    <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink/50" style={FONT_LABEL}>{tituloTipo(c.tipo_cliente)}</p>
                    <MetricaGrid>
                      <MetricaCard label="Total de avaliações" valor={fmtNum(c.total)} delta={prev ? deltaPercentual(c.total, prev.total, false) : undefined} />
                      <MetricaCard label="Avaliações boas (4–5)" valor={fmtPct1(pct)} delta={deltaPercentual(pct, pctPrev, false)} nota={`${c.boas} de ${c.total}`} />
                      <MetricaCard label="Avaliações ruins (1–2)" valor={fmtNum(c.ruins)} delta={prev ? deltaPercentual(c.ruins, prev.ruins, true) : undefined} nota={`${c.neutras} neutras (nota 3)`} />
                    </MetricaGrid>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="Bot (IA Greenn)" tag="crisp" nota="Triagem automática — separado do ranking humano." />
          <MetricaGrid>
            <MetricaCard label="Chamados" valor={fmtNum(bot?.total_atendimentos)} />
            <MetricaCard
              label="CSAT médio"
              valor={bot?.csat_medio != null ? bot.csat_medio.toFixed(2).replace(".", ",") : "—"}
              nota={bot ? `${bot.total_avaliacoes} avaliações` : undefined}
            />
            <MetricaCard
              label="Tempo médio de resposta"
              valor={formatDuration(A.tempoRespostaBot?.tempo_medio_seg ?? null)}
              nota={A.tempoRespostaBot ? `${A.tempoRespostaBot.amostras} amostras (mediana)` : undefined}
            />
          </MetricaGrid>
          {botDist && botDist.total > 0 && (
            <p className="mt-3 text-[12px] text-ink/50">
              {botDist.total} avaliações — {botDist.boas} promotor(as), {botDist.neutras} neutra(s), {botDist.ruins} detrator(as)
            </p>
          )}
        </section>

        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="Reabertura" tag="novo" nota="Conversa resolvida que o cliente reabriu." />
          <MetricaGrid>
            <MetricaCard
              label="Taxa de reabertura"
              valor={fmtPct1(A.reabertura?.taxa_pct)}
              delta={deltaPontos(A.reabertura?.taxa_pct, P.reabertura?.taxa_pct, true)}
              nota={A.reabertura ? `${A.reabertura.total_resolvidos} chamados resolvidos no período` : undefined}
            />
            <MetricaCard
              label="Conversas reabertas"
              valor={fmtNum(A.reabertura?.total_reabertos)}
              delta={deltaPercentual(A.reabertura?.total_reabertos, P.reabertura?.total_reabertos, true)}
            />
            <MetricaCard
              label="Eventos de reabertura"
              valor={fmtNum(A.reabertura?.total_eventos)}
              nota="Uma conversa pode reabrir mais de uma vez"
            />
          </MetricaGrid>
        </section>


        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="NPS" tag="novo" nota="Direto do módulo NPS do Hub (nps_responses) — ainda roda com dado de exemplo, sem integração real com HugMe/Crisp." />
          <MetricaGrid cols={4}>
            <MetricaCard
              label="Contatados"
              valor={fmtNum(A.npsResumo?.total)}
              delta={deltaPercentual(A.npsResumo?.total, P.npsResumo?.total, false)}
            />
            <MetricaCard
              label="Promotores"
              valor={fmtNum(A.npsResumo?.promotores)}
              delta={deltaPercentual(A.npsResumo?.promotores, P.npsResumo?.promotores, false)}
            />
            <MetricaCard label="Neutros" valor={fmtNum(A.npsResumo?.neutros)} />
            <MetricaCard
              label="Detratores"
              valor={fmtNum(A.npsResumo?.detratores)}
              delta={deltaPercentual(A.npsResumo?.detratores, P.npsResumo?.detratores, true)}
            />
          </MetricaGrid>
          {M?.nps.temas && (
            <p className="mt-3.5 whitespace-pre-line rounded-2xl border border-sand-line bg-sand-surface p-4 text-[12px] leading-relaxed text-ink/60 shadow-card print:shadow-none">
              {M.nps.temas}
            </p>
          )}
        </section>

        <section className="mt-11 print:mt-8">
          <SecaoHead
            titulo="Dados manuais"
            nota="Reclame Aqui, RA XGROW e Migrações não vêm do Hub — preenchidos na própria tela (botão &quot;Dados manuais&quot;), nada foi estimado aqui."
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-sand-surface p-5 shadow-card print:shadow-none">
              <p className="text-[14.5px] font-semibold text-ink">Reclame Aqui</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MetricaCard label="Nota" valor={M?.reclameAqui.nota || "—"} />
                <MetricaCard
                  label="Total de reclamações"
                  valor={M?.reclameAqui.totalReclamacoes || "—"}
                  nota={M?.reclameAqui.deltaPct ? `${M.reclameAqui.deltaPct} vs. semana anterior` : undefined}
                />
              </div>
              {M?.reclameAqui.produtorDestaque && (
                <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-ink/60">{M.reclameAqui.produtorDestaque}</p>
              )}
            </div>

            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-sand-surface p-5 shadow-card print:shadow-none">
              <p className="text-[14.5px] font-semibold text-ink">RA XGROW</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MetricaCard label="Total de reclamações" valor={M?.raXgrow.totalReclamacoes || "—"} />
                <MetricaCard
                  label="Nota"
                  valor={M?.raXgrow.nota || "—"}
                  nota={M?.raXgrow.notaAnterior ? `Nota anterior: ${M.raXgrow.notaAnterior}` : undefined}
                />
              </div>
            </div>

            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-sand-surface p-5 shadow-card print:shadow-none">
              <p className="text-[14.5px] font-semibold text-ink">SAC — Migrações</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <MetricaCard label="Finalizadas" valor={M?.migracoes.finalizadas || "—"} />
                <MetricaCard label="Em progresso" valor={M?.migracoes.emProgresso || "—"} />
                <MetricaCard label="Aguardando" valor={M?.migracoes.aguardando || "—"} />
              </div>
              {M?.migracoes.plataformas && (
                <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-ink/60">{M.migracoes.plataformas}</p>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-14 border-t border-sand-line pt-5 print:mt-8">
          <p className="text-xs text-ink/40">
            Gerado a partir do Hub SAC Greenn em {new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}. Tempos
            em horas úteis (desconta fora do expediente cadastrado do time).
          </p>
        </footer>
      </div>
    </div>
  );
}
