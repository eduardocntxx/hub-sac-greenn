import type { MouseEvent } from "react";
import { motion } from "framer-motion";
import { CircleCheck, Frown, Hourglass, Inbox, Loader, Meh, MessageSquare, Package, Smile, Timer } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { AvisoNpsParado, GraficoSatisfacaoSemanal } from "@/components/SatisfacaoSemanal";
import { formatDuration, formatDurationHoras } from "@/lib/formatDuration";
import { deltaPercentual, fmtNum, tfrCorridoSeg, type NpsResumo } from "@/lib/resultadosSac";
import type { SemanaSatisfacao } from "@/lib/satisfacaoSemanal";
import type { AtendimentoComMetricas, MigracaoPorPlataforma, MigracoesResumo } from "@/services/api";
import { SecaoHead } from "@/pages/overview/OverviewBlocos";
import {
  BarrasRanking,
  CABECALHO_TABELA,
  CarregandoPainel,
  KpiPainel,
  LINHA_TABELA,
  LinkVer,
  PainelCard,
  VazioPainel,
  entradaLinha,
} from "@/pages/overview/PecasSubAbas";

// Itens da Reunião de Resultados que o Overview não tinha (2026-10-16): NPS e CSAT × NPS por semana
// (Qualidade), maiores tempos de 1ª resposta (Velocidade) e Migrações (Volume). Mesmas funções e contas
// da RR; quem decide quem vê é a página (e o banco).

// ---------- NPS (Qualidade) ----------
export function NpsPainel({
  resumo,
  anterior,
  semanas,
  carregando,
}: {
  resumo: NpsResumo | null;
  anterior: NpsResumo | null;
  semanas: SemanaSatisfacao[];
  carregando: boolean;
}) {
  const total = resumo?.total ?? 0;
  const pctDe = (n: number) => (total > 0 ? (n / total) * 100 : null);
  const score = resumo && total > 0 ? Math.round(((resumo.promotores - resumo.detratores) / total) * 100) : null;
  const semanasCompletas = semanas.filter((s) => !s.emAndamento);

  return (
    <div>
      <SecaoHead
        titulo="NPS"
        subtitulo="Respostas da pesquisa NPS (Typeform), pela data da resposta."
        ajuda={
          <>
            <p>Promotor = nota 9–10, neutro = 7–8, detrator = 0–6. NPS = % de promotores − % de detratores.</p>
            <p className="mt-2">O Hub recebe só as respostas, não quantas pesquisas foram enviadas. Visível para admin e para quem tem a permissão de NPS. Não respeita os filtros de atendente e de tipo de cliente.</p>
          </>
        }
      />
      {carregando ? (
        <CarregandoPainel />
      ) : (
        <div className="space-y-4">
          <AvisoNpsParado semanas={semanas} />
          {!resumo || total === 0 ? (
            <VazioPainel icone={MessageSquare}>Nenhuma resposta de NPS no período.</VazioPainel>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiPainel
                indice={0}
                icone={MessageSquare}
                label="Respostas"
                valor={fmtNum(total)}
                delta={deltaPercentual(total, anterior?.total, false)}
                contexto={score != null ? `NPS ${score}` : undefined}
              />
              <KpiPainel
                indice={1}
                icone={Smile}
                tom="bom"
                label="Promotores (9–10)"
                valor={fmtNum(resumo.promotores)}
                barra={pctDe(resumo.promotores)}
                delta={deltaPercentual(resumo.promotores, anterior?.promotores, false)}
              />
              <KpiPainel
                indice={2}
                icone={Meh}
                tom="atencao"
                label="Neutros (7–8)"
                valor={fmtNum(resumo.neutros)}
                barra={pctDe(resumo.neutros)}
                delta={deltaPercentual(resumo.neutros, anterior?.neutros, false)}
              />
              <KpiPainel
                indice={3}
                icone={Frown}
                tom="ruim"
                label="Detratores (0–6)"
                valor={fmtNum(resumo.detratores)}
                barra={pctDe(resumo.detratores)}
                delta={deltaPercentual(resumo.detratores, anterior?.detratores, true)}
              />
            </div>
          )}
          {semanasCompletas.length > 1 && (
            <PainelCard indice={4} icone={Smile} titulo="CSAT × NPS por semana" subtitulo="% de avaliações positivas, últimas 8 semanas (quarta a terça)">
              <GraficoSatisfacaoSemanal semanas={semanas} />
              <p className="text-[11px] text-ink/40">CSAT só de produtores, pela semana em que a conversa começou; NPS pela data da resposta.</p>
            </PainelCard>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Maiores tempos de 1ª resposta (Velocidade, só admin) ----------
export interface GrupoTopTfr {
  titulo: string;
  casos: AtendimentoComMetricas[];
}

export function TopTfrPainel({
  grupos,
  carregando,
  onAbrir,
}: {
  grupos: GrupoTopTfr[];
  carregando: boolean;
  onAbrir: (c: AtendimentoComMetricas) => void;
}) {
  return (
    <div>
      <SecaoHead
        titulo="Maiores tempos de 1ª resposta"
        subtitulo="Os 7 casos mais lentos do período em cada grupo. Clique numa linha pra abrir o chamado."
        ajuda={
          <>
            <p>Mesma lista da Reunião de Resultados. TFR útil conta só o expediente (13h por dia útil, 4h no sábado, nada no domingo e feriado); o corrido é o relógio inteiro.</p>
            <p className="mt-2">O TFR fica com quem respondeu primeiro. Um caso que ficou parado na fila do Mr. Greenn entra no TFR de quem pegou da fila, mesmo que a espera tenha sido antes.</p>
          </>
        }
      />
      {carregando ? (
        <CarregandoPainel colunas={2} />
      ) : (
        <div className={grupos.length > 1 ? "grid gap-4 lg:grid-cols-2" : undefined}>
          {grupos.map((g, gi) => (
            <PainelCard key={g.titulo} indice={gi} icone={Timer} titulo={g.titulo} subtitulo="TFR útil, com o corrido ao lado">
              {g.casos.length === 0 ? (
                <p className="text-sm text-ink/50">Sem chamados com resposta humana no período.</p>
              ) : (
                <div className="-mx-4 -mb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={CABECALHO_TABELA}>
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Cliente</th>
                        <th className="px-4 py-2 text-left font-semibold">Atendente</th>
                        <th className="px-4 py-2 text-right font-semibold">TFR útil</th>
                        <th className="px-4 py-2 text-right font-semibold">Corrido</th>
                        <th className="px-4 py-2 text-right font-semibold">Chamado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.casos.map((c, i) => (
                        <motion.tr key={c.id} {...entradaLinha(i)} className={`${LINHA_TABELA} cursor-pointer`} onClick={() => onAbrir(c)}>
                          <td className="max-w-[160px] truncate px-4 py-2 font-medium text-ink" title={c.cliente_nome ?? undefined}>{c.cliente_nome || "—"}</td>
                          <td className="max-w-[140px] truncate px-4 py-2 text-ink/70" title={c.operator_nome ?? undefined}>{c.operator_nome || "—"}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{formatDurationHoras(c.tempo_primeira_resposta_seg)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-ink/60">{formatDuration(tfrCorridoSeg(c.current_started_at, c.primeira_resposta_humana_at))}</td>
                          <td className="px-4 py-2 text-right" onClick={(e: MouseEvent) => e.stopPropagation()}>
                            <LinkVer href={c.link_chamado} />
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PainelCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Migrações (Volume) ----------
export function MigracoesPainel({
  resumo,
  anterior,
  porPlataforma,
  carregando,
}: {
  resumo: MigracoesResumo | null;
  anterior: MigracoesResumo | null;
  porPlataforma: MigracaoPorPlataforma[];
  carregando: boolean;
}) {
  return (
    <div>
      <SecaoHead
        titulo="Migrações"
        subtitulo="Fila de migrações da Centralização, sincronizada de hora em hora."
        ajuda={
          <>
            <p><b>Novas</b> = abertas no período. <b>Finalizadas</b> = finalizadas no período. <b>Em progresso</b> e <b>aguardando</b> = situação no fim do período. O SLA é da fila aberta agora, não do período.</p>
            <p className="mt-2">Não respeita os filtros de atendente e de tipo de cliente. A plataforma é texto livre na origem, mostrada como veio.</p>
          </>
        }
      />
      {carregando ? (
        <CarregandoPainel />
      ) : !resumo ? (
        <VazioPainel icone={Package}>Sem dados de migração no período.</VazioPainel>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiPainel indice={0} icone={Inbox} label="Novas" valor={fmtNum(resumo.total)} delta={deltaPercentual(resumo.total, anterior?.total, false)} />
            <KpiPainel
              indice={1}
              icone={CircleCheck}
              tom="bom"
              label="Finalizadas"
              valor={fmtNum(resumo.finalizados)}
              delta={deltaPercentual(resumo.finalizados, anterior?.finalizados, false)}
              contexto={`${fmtNum(resumo.cancelados)} canceladas no período`}
            />
            <KpiPainel indice={2} icone={Loader} label="Em progresso" valor={fmtNum(resumo.em_progresso)} delta={deltaPercentual(resumo.em_progresso, anterior?.em_progresso, false)} />
            <KpiPainel
              indice={3}
              icone={Hourglass}
              tom="atencao"
              label="Aguardando"
              valor={fmtNum(resumo.aguardando)}
              delta={deltaPercentual(resumo.aguardando, anterior?.aguardando, true)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink/60">
            <span>SLA da fila aberta agora:</span>
            <Badge tone="success">{fmtNum(resumo.sla_ok)} dentro do prazo</Badge>
            <Badge tone="warning">{fmtNum(resumo.sla_risco)} em risco</Badge>
            <Badge tone={resumo.sla_atrasado > 0 ? "danger" : "neutral"}>{fmtNum(resumo.sla_atrasado)} atrasadas</Badge>
          </div>
          {porPlataforma.length > 0 && (
            <PainelCard indice={4} icone={Package} titulo="Novas por plataforma" subtitulo="Migrações abertas no período">
              <BarrasRanking data={porPlataforma.slice(0, 8).map((p) => ({ label: p.plataforma, value: p.total, displayValue: fmtNum(p.total) }))} labelWidth={160} />
            </PainelCard>
          )}
        </div>
      )}
    </div>
  );
}
