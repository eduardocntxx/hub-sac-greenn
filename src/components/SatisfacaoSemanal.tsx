import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { semanasSemNpsNoFim, type SemanaSatisfacao } from "@/lib/satisfacaoSemanal";

// CSAT × NPS por semana (quarta a terça): gráfico das duas curvas de "% positivas" + tabela com volume e
// distribuição. Usado na página de NPS e na pré-visualização da Reunião de Resultados (o PPTX desenha o próprio).

const fmtInt = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const fmtPct = (v: number | null, casas = 0) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function corNps(v: number | null) {
  if (v == null) return "text-ink/40";
  if (v >= 70) return "text-forest-600 dark:text-forest-400";
  if (v >= 40) return "text-amber-700 dark:text-amber-400";
  return "text-rust-600 dark:text-rust-400";
}

// Aviso quando as últimas semanas completas não tiveram nenhuma resposta de NPS (a integração Typeform → n8n
// parou em 04/10/2026 sem ninguém notar; o "último detrator em 01/10" era isso, não melhora de satisfação).
export function AvisoNpsParado({ semanas, className }: { semanas: SemanaSatisfacao[]; className?: string }) {
  const completas = semanas.filter((s) => !s.emAndamento);
  const paradas = semanasSemNpsNoFim(completas);
  if (paradas === 0 || completas.length === paradas) return null;
  const desde = completas[completas.length - paradas];
  const anteriores = completas.slice(0, completas.length - paradas).filter((s) => (s.npsRespostas ?? 0) > 0);
  const media = anteriores.length ? Math.round(anteriores.reduce((t, s) => t + (s.npsRespostas ?? 0), 0) / anteriores.length) : null;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border border-rust-500/30 bg-rust-50 p-3 text-sm text-rust-700 dark:bg-rust-500/10 dark:text-rust-400", className)}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p>
        Nenhuma resposta de NPS chegou ao Hub desde a semana de {desde.intervalo}
        {paradas > 1 ? ` (${paradas} semanas seguidas)` : ""}
        {media != null ? `; antes chegavam cerca de ${media} por semana` : ""}. Isso não é melhora de satisfação: conferir a integração
        Typeform → n8n antes de ler os números de NPS.
      </p>
    </div>
  );
}

export function GraficoSatisfacaoSemanal({ semanas: todas }: { semanas: SemanaSatisfacao[] }) {
  // Semana em andamento fica só na tabela: com poucas respostas, um 100% de 3 notas distorce a curva.
  const semanas = todas.filter((s) => !s.emAndamento);
  if (semanas.length === 0) return null;
  const W = 960, H = 230, L = 38, R = 14, T = 20, B = 30;
  const valores = semanas.flatMap((s) => [s.pctPositivas, s.npsRespostas ? s.pctPromotores : null]).filter((v): v is number => v != null);
  const minDado = valores.length ? Math.min(...valores) : 50;
  const yMin = Math.max(0, Math.min(50, Math.floor((minDado - 5) / 10) * 10));
  const passo = 100 - yMin > 50 ? 20 : 10;
  const ticks: number[] = [];
  for (let v = yMin; v <= 100; v += passo) ticks.push(v);
  const larg = (W - L - R) / semanas.length;
  const x = (i: number) => L + larg * (i + 0.5);
  const y = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (100 - yMin));

  const series = [
    { nome: "CSAT: % positivas (4–5)", cor: "forest", pontos: semanas.map((s) => s.pctPositivas) },
    // Semana com 0 respostas fica sem ponto (buraco na linha), não com 0%.
    { nome: "NPS: % promotores (9–10)", cor: "sky", pontos: semanas.map((s) => (s.npsRespostas ? s.pctPromotores : null)) },
  ] as const;

  const trechos = (pontos: readonly (number | null)[]) => {
    const out: string[] = [];
    let atual: string[] = [];
    pontos.forEach((v, i) => {
      if (v == null) {
        if (atual.length) out.push(atual.join(" "));
        atual = [];
      } else atual.push(`${atual.length ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    });
    if (atual.length) out.push(atual.join(" "));
    return out;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink/60">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-4 rounded-full", s.cor === "forest" ? "bg-forest-500" : "bg-sky-500")} />
            {s.nome}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="CSAT e NPS por semana">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-sand-line" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink/40" fontSize={10}>{t}%</text>
          </g>
        ))}
        {semanas.map((s, i) => (
          <text key={s.semana} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} className="fill-ink/50">
            {s.label}
          </text>
        ))}
        {series.map((s) =>
          trechos(s.pontos).map((d) => (
            <path key={s.nome + d} d={d} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className={s.cor === "forest" ? "stroke-forest-500" : "stroke-sky-500"} />
          ))
        )}
        {series.map((s, si) =>
          s.pontos.map((v, i) => {
            if (v == null) return null;
            // Rótulo acima do ponto mais alto da semana e abaixo do mais baixo, pra não encavalar.
            const outro = series[1 - si].pontos[i];
            const acima = outro == null || v >= outro;
            return (
              <g key={`${s.nome}-${i}`}>
                <circle cx={x(i)} cy={y(v)} r={3.5} className={s.cor === "forest" ? "fill-forest-500" : "fill-sky-500"} />
                <text x={x(i)} y={acima ? y(v) - 8 : y(v) + 15} textAnchor="middle" fontSize={10} fontWeight={600} className={s.cor === "forest" ? "fill-forest-600 dark:fill-forest-400" : "fill-sky-600 dark:fill-sky-400"}>
                  {Math.round(v)}%
                </text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

export function TabelaSatisfacaoSemanal({ semanas }: { semanas: SemanaSatisfacao[] }) {
  const comNps = semanas.some((s) => s.npsRespostas != null);
  const th = "px-3 py-2 font-medium";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-sand-bg text-xs uppercase tracking-wide text-ink/50">
          <tr>
            <th className={cn(th, "text-left")} rowSpan={2}>Semana</th>
            <th className={cn(th, "border-l border-sand-line text-center")} colSpan={5}>CSAT</th>
            {comNps && <th className={cn(th, "border-l border-sand-line text-center")} colSpan={5}>NPS</th>}
          </tr>
          <tr className="text-right">
            <th className={cn(th, "border-l border-sand-line")}>Enviadas</th>
            <th className={th}>Respondidas</th>
            <th className={th}>Taxa</th>
            <th className={th}>Positivas</th>
            <th className={th}>Negativas</th>
            {comNps && (
              <>
                <th className={cn(th, "border-l border-sand-line")}>Respostas</th>
                <th className={th}>Promotores</th>
                <th className={th}>Neutros</th>
                <th className={th}>Detratores</th>
                <th className={th}>NPS</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {semanas.map((s) => (
            <tr key={s.semana} className="border-t border-sand-line text-right">
              <td className="whitespace-nowrap px-3 py-2 text-left text-ink">
                {s.intervalo}
                {s.emAndamento && <span className="ml-1.5 text-xs text-ink/40">em andamento</span>}
              </td>
              <td className="border-l border-sand-line px-3 py-2 text-ink/70">{fmtInt(s.csatEnviadas)}</td>
              <td className="px-3 py-2 text-ink/70">{fmtInt(s.csatRespondidas)}</td>
              <td className="px-3 py-2 text-ink/70">{fmtPct(s.taxaResposta, 1)}</td>
              <td className="px-3 py-2 font-semibold text-forest-600 dark:text-forest-400">{fmtPct(s.pctPositivas)}</td>
              <td className="px-3 py-2 text-rust-600 dark:text-rust-400">{fmtPct(s.pctNegativas)}</td>
              {comNps &&
                (s.semNps ? (
                  <td colSpan={5} className="border-l border-sand-line px-3 py-2 text-center text-rust-600 dark:text-rust-400">
                    {s.emAndamento ? "nenhuma resposta até agora" : "nenhuma resposta chegou"}
                  </td>
                ) : (
                  <>
                    <td className="border-l border-sand-line px-3 py-2 text-ink/70">{fmtInt(s.npsRespostas)}</td>
                    <td className="px-3 py-2 font-semibold text-sky-600 dark:text-sky-400">{fmtPct(s.pctPromotores)}</td>
                    <td className="px-3 py-2 text-ink/70">{fmtPct(s.pctNeutros)}</td>
                    <td className="px-3 py-2 text-ink/70">{fmtPct(s.pctDetratores)}</td>
                    <td className={cn("px-3 py-2 font-semibold", corNps(s.npsScore))}>{s.npsScore ?? "—"}</td>
                  </>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
