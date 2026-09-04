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

interface RelatorioResultadosSacProps {
  data: ResultadosSacData;
  onClose: () => void;
}

function DeltaTexto({ delta }: { delta?: DeltaInfo }) {
  if (!delta) return <span className="text-[13px] text-ink/30">sem comparação</span>;
  const cor = delta.bom === null ? "text-ink/40" : delta.bom ? "text-forest-600" : "text-rust-500";
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
    <div className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-4 shadow-card print:shadow-none">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink tabular-nums">{valor}</p>
      <div className="mt-1.5"><DeltaTexto delta={delta} /></div>
      {nota && <p className="mt-1.5 text-[11px] text-ink/40">{nota}</p>}
    </div>
  );
}

// Tailwind escaneia classes literais no código-fonte — não dá pra interpolar
// o número de colunas direto na string (`sm:grid-cols-${cols}` nunca seria
// detectado pelo JIT), por isso as duas variantes ficam escritas por extenso.
function MetricaGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  const gridCols = cols === 2 ? "grid-cols-1 sm:grid-cols-2 print:grid-cols-2" : "grid-cols-1 sm:grid-cols-3 print:grid-cols-3";
  return <div className={`grid gap-3.5 ${gridCols}`}>{children}</div>;
}

// Chip local com as mesmas cores de Badge tone="info"/"success" no claro,
// mas SEM os pares `dark:` — Badge normal reagiria à classe `.dark` da
// `<html>` (o seletor de dark mode do Tailwind é por ancestral, não dá pra
// "desligar" via CSS variable como os tokens ink/sand abaixo), e esse chip
// precisa continuar exatamente igual não importa o tema do app.
function TagChipFixo({ tone, children }: { tone: "info" | "success"; children: React.ReactNode }) {
  const cores = tone === "info" ? "bg-sky-50 text-sky-700 ring-sky-600/10" : "bg-forest-50 text-forest-700 ring-forest-600/10";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cores}`}>
      {children}
    </span>
  );
}

function SecaoHead({ titulo, tag, nota }: { titulo: string; tag?: "crisp" | "novo"; nota?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
        {titulo}
        {tag === "crisp" && <TagChipFixo tone="info">Crisp</TagChipFixo>}
        {tag === "novo" && <TagChipFixo tone="success">Novo</TagChipFixo>}
      </h2>
      {nota && <p className="max-w-[44ch] text-right text-[12px] text-ink/40">{nota}</p>}
    </div>
  );
}

export function RelatorioResultadosSac({ data, onClose }: RelatorioResultadosSacProps) {
  const A = data.atual;
  const P = data.anterior;
  const M = data.manual;

  const boasPct = A.csat && A.csat.total > 0 ? (A.csat.boas / A.csat.total) * 100 : null;
  const boasPctPrev = P.csat && P.csat.total > 0 ? (P.csat.boas / P.csat.total) * 100 : null;

  const csatComNota = data.csatPorAtendente
    .filter((c) => c.csat_medio !== null)
    .sort((a, b) => (b.csat_medio ?? 0) - (a.csat_medio ?? 0));

  return (
    // Relatório é sempre claro de propósito, mesmo com o Hub em modo escuro
    // (ninguém quer PDF em fundo preto) — mas as classes abaixo usam os
    // tokens `text-ink`/`border-sand-line`/`bg-sand-bg`, que são variáveis
    // CSS e trocam de valor quando `.dark` está na `<html>` (ver index.css).
    // Sem isto, o texto vira quase-branco sobre o `bg-white` fixo e o
    // relatório inteiro fica ilegível em modo escuro. Redeclarar as
    // variáveis com o valor do :root (claro) aqui na raiz faz todo
    // descendente que lê `var(--color-ink)` etc. resolver pro claro,
    // sobrescrevendo o que `.dark` definiu lá em cima — inclusive dentro
    // de `Button`/`MetricaCard`/etc. sem precisar hardcodar cada classe.
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-white print:static print:overflow-visible"
      style={{
        ["--color-ink" as string]: "34 34 34",
        ["--color-ink-soft" as string]: "125 125 125",
        ["--color-ink-tertiary" as string]: "154 154 154",
        ["--color-sand-bg" as string]: "247 248 246",
        ["--color-sand-surface" as string]: "255 255 255",
        ["--color-sand-subtle" as string]: "241 242 239",
        ["--color-sand-line" as string]: "232 232 232",
        ["--color-sand-line-strong" as string]: "216 216 216",
      }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sand-line bg-white px-6 py-3 print:hidden">
        <p className="text-sm font-medium text-ink/60">Pré-visualização do relatório</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X size={14} /> Fechar
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Download size={14} /> Baixar PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] px-5 py-10 print:px-0 print:py-0">
        <header className="mb-10 print:mb-8">
          <p className="mb-2.5 font-mono text-xs font-medium uppercase tracking-wider text-forest-600">
            Hub SAC Greenn · Reunião de Resultados
          </p>
          <h1 className="text-balance font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
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
        </section>

        {A.tipoCliente.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead titulo="Por tipo de cliente" tag="crisp" nota="Segmentação real capturada pela Crisp." />
            <MetricaGrid cols={2}>
              {A.tipoCliente.map((tc) => {
                const prev = P.tipoCliente.find((p) => p.tipo_cliente === tc.tipo_cliente);
                return (
                  <div
                    key={tc.tipo_cliente}
                    className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-4 shadow-card print:shadow-none"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">{tc.tipo_cliente}</p>
                    <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                      {fmtNum(tc.chamados)}
                      <span className="ml-1 text-sm font-medium text-ink/40">chamados</span>
                    </p>
                    <div className="mt-1.5">
                      <DeltaTexto delta={prev ? deltaPercentual(tc.chamados, prev.chamados, false) : undefined} />
                    </div>
                    <div className="mt-3.5 flex gap-6 border-t border-sand-line pt-3.5">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40">TFR médio</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{formatDuration(tc.tfr_media_seg)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-ink/40">TTR médio</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{formatDuration(tc.ttr_media_seg)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </MetricaGrid>
          </section>
        )}

        {A.rankingHumano.length > 0 && (
          <section className="mt-11 print:mt-8">
            <SecaoHead titulo="Ranking de atendimentos" tag="crisp" nota="Top 3 por volume, atendentes humanos." />
            <div className="flex flex-col gap-2.5">
              {A.rankingHumano.slice(0, 3).map((r, i) => {
                const prev = P.rankingHumano.find((p) => p.operator_nome === r.operator_nome);
                const delta = prev ? deltaPercentual(r.total_atendimentos, prev.total_atendimentos, false) : undefined;
                return (
                  <div
                    key={r.operator_nome}
                    className={`grid grid-cols-[28px_1fr_auto_auto] items-center gap-3 break-inside-avoid rounded-xl border px-4 py-3 shadow-card print:shadow-none ${
                      i === 0 ? "border-forest-100 bg-forest-50" : "border-sand-line bg-white"
                    }`}
                  >
                    <span className={`font-display text-sm font-extrabold ${i === 0 ? "text-forest-600" : "text-ink/40"}`}>
                      {i + 1}º
                    </span>
                    <span className="text-[14.5px] font-semibold text-ink">{r.operator_nome}</span>
                    <span className="text-right font-display text-sm font-bold tabular-nums text-ink">
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
                <thead className="bg-sand-bg text-xs uppercase tracking-wide text-ink/40">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Atendente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Nota média</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avaliações</th>
                  </tr>
                </thead>
                <tbody>
                  {csatComNota.map((c) => (
                    <tr key={c.operator_nome} className="border-t border-sand-line">
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
          <SecaoHead titulo="Transferências" tag="novo" nota="Troca de atendente humano na mesma conversa." />
          <MetricaGrid>
            <MetricaCard
              label="Taxa de transferência"
              valor={fmtPct1(A.transferencias?.taxa_pct)}
              delta={deltaPontos(A.transferencias?.taxa_pct, P.transferencias?.taxa_pct, true)}
              nota={A.transferencias ? `${A.transferencias.total_atendidos} chamados atendidos no período` : undefined}
            />
            <MetricaCard
              label="Conversas transferidas"
              valor={fmtNum(A.transferencias?.total_transferidos)}
              delta={deltaPercentual(A.transferencias?.total_transferidos, P.transferencias?.total_transferidos, true)}
            />
            <MetricaCard
              label="Tempo médio até transferir"
              valor={formatDuration(A.transferencias?.tempo_medio_antes_seg ?? null)}
              delta={deltaPercentual(A.transferencias?.tempo_medio_antes_seg, P.transferencias?.tempo_medio_antes_seg, true)}
            />
          </MetricaGrid>
        </section>

        <section className="mt-11 print:mt-8">
          <SecaoHead titulo="FCR e Recontato" tag="novo" nota="Resolvido sem o cliente voltar pelo mesmo motivo em 7 dias." />
          <MetricaGrid>
            <MetricaCard
              label="FCR"
              valor={fmtPct1(A.fcr?.fcr_pct)}
              delta={deltaPontos(A.fcr?.fcr_pct, P.fcr?.fcr_pct, false)}
              nota="Resolvido sem retorno pelo mesmo motivo"
            />
            <MetricaCard
              label="Recontato"
              valor={fmtPct1(A.fcr?.recontato_pct)}
              delta={deltaPontos(A.fcr?.recontato_pct, P.fcr?.recontato_pct, true)}
              nota={A.fcr ? `${A.fcr.total_recontato} de ${A.fcr.total_elegiveis}` : undefined}
            />
            <MetricaCard
              label="Conversas elegíveis"
              valor={fmtNum(A.fcr?.total_elegiveis)}
              delta={deltaPercentual(A.fcr?.total_elegiveis, P.fcr?.total_elegiveis, false)}
              nota="Resolvidos, com cliente e motivo identificados"
            />
          </MetricaGrid>
        </section>

        <section className="mt-11 print:mt-8">
          <SecaoHead
            titulo="Dados manuais"
            nota="Reclame Aqui, RA XGROW, Migrações e NPS não vêm do Hub — preenchidos na própria tela (botão &quot;Dados manuais&quot;), nada foi estimado aqui."
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 print:grid-cols-2">
            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-5 shadow-card print:shadow-none">
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

            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-5 shadow-card print:shadow-none">
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

            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-5 shadow-card print:shadow-none">
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

            <div className="break-inside-avoid rounded-2xl border border-sand-line bg-white p-5 shadow-card print:shadow-none">
              <p className="text-[14.5px] font-semibold text-ink">Dados NPS</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MetricaCard label="Contatados" valor={M?.nps.contatados || "—"} />
                <MetricaCard label="Detratores" valor={M?.nps.detratores || "—"} />
                <MetricaCard label="Neutros" valor={M?.nps.neutros || "—"} />
                <MetricaCard label="Promotores" valor={M?.nps.promotores || "—"} />
              </div>
              {M?.nps.temas && (
                <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-ink/60">{M.nps.temas}</p>
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
