import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { HandCoins, MessagesSquare, Tags, Trophy, Users } from "lucide-react";
import { Kpi } from "@/components/ui/Kpi";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { PainelCard } from "@/components/ui/PainelCard";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateRangePopover } from "@/components/ui/DateRangePopover";
import { CABECALHO_TABELA, LINHA_TABELA, entradaLinha } from "@/components/ui/Tabela";
import { BARRA_TOM, type Tom } from "@/components/ui/Indicador";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { fetchTaxaOferta, type TaxaOfertaRow } from "@/services/api";

// Suporte Estratégico (2026-11-12): taxa de oferta do playbook do Felipe, por pessoa e por ferramenta.
// A oferta é a tag oferta-* que o especialista coloca na conversa do Crisp; o n8n grava os segmentos quando a
// conversa é resolvida. Taxa de ativação e ticket médio dos ativados dependem de dados de dev/BI (fase 3).

const META_OFERTA = 80;

const FERRAMENTAS = [
  { chave: "orderbump", rotulo: "Order Bump" },
  { chave: "upsell", rotulo: "Upsell" },
  { chave: "checkout", rotulo: "Checkout" },
  { chave: "vitrine", rotulo: "Vitrine" },
  { chave: "closer", rotulo: "Closer AI" },
  { chave: "vision", rotulo: "Vision AI" },
] as const;

type ChaveFerramenta = (typeof FERRAMENTAS)[number]["chave"];

function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

function tomDaTaxa(taxa: number | null): Tom {
  if (taxa === null) return "marca";
  if (taxa >= META_OFERTA) return "bom";
  if (taxa >= META_OFERTA / 2) return "atencao";
  return "ruim";
}

export default function SuporteEstrategico() {
  // Padrão "Esta semana": o playbook fecha os números toda semana.
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("se:preset", "semana_atual");
  const [personalizado, setPersonalizado] = usePersistedState("se:personalizado", { inicio: "", fim: "" });
  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["taxa-oferta", inicio.toISOString(), fim.toISOString()],
    queryFn: () => fetchTaxaOferta(inicio, fim),
  });

  const linhas = useMemo(() => {
    const comTaxa = (data ?? []).map((r) => ({ ...r, taxa: percentual(r.com_oferta, r.atendimentos) }));
    // Ranking: maior taxa primeiro; quem não tem atendimento com tag no período vai para o fim.
    return comTaxa.sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1) || b.atendimentos - a.atendimentos);
  }, [data]);

  const total = useMemo(() => {
    const soma = (campo: keyof Omit<TaxaOfertaRow, "atendente">) => (data ?? []).reduce((acc, r) => acc + Number(r[campo] ?? 0), 0);
    const porFerramenta = FERRAMENTAS.map((f) => ({ ...f, ofertas: soma(f.chave) })).sort((a, b) => b.ofertas - a.ofertas);
    const atendimentos = soma("atendimentos");
    const comOferta = soma("com_oferta");
    return {
      atendimentos,
      comOferta,
      semSegmentos: soma("sem_segmentos"),
      taxa: percentual(comOferta, atendimentos),
      maisOfertada: porFerramenta[0]?.ofertas ? porFerramenta[0] : null,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Suporte Estratégico"
        subtitulo="Ofertas do playbook no fim dos atendimentos de produtor. A oferta conta pela tag oferta-* na conversa do Crisp."
        acoes={
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={setPreset}
            onChangePersonalizado={setPersonalizado}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          indice={0}
          icon={HandCoins}
          label="Taxa de oferta do time"
          value={total.taxa !== null ? `${total.taxa}%` : "—"}
          meta={`Meta ${META_OFERTA}%`}
          barra={total.taxa}
          tom={tomDaTaxa(total.taxa)}
        />
        <Kpi indice={1} icon={MessagesSquare} label="Atendimentos de produtor" value={String(total.atendimentos)} />
        <Kpi indice={2} icon={Tags} label="Com oferta" value={String(total.comOferta)} />
        <Kpi
          indice={3}
          icon={Trophy}
          label="Ferramenta mais ofertada"
          value={total.maisOfertada ? total.maisOfertada.rotulo : "—"}
          contexto={total.maisOfertada ? <span className="text-xs text-ink/50">{total.maisOfertada.ofertas} ofertas</span> : undefined}
        />
      </div>

      <PainelCard
        indice={0}
        icone={Users}
        titulo="Por pessoa"
        subtitulo="Atendimentos de produtor resolvidos no período por quem fechou a conversa, com as ofertas por ferramenta."
      >
        {isLoading ? (
          <CardSkeleton />
        ) : error ? (
          <p className="text-sm text-rust-500">Não foi possível carregar a taxa de oferta.</p>
        ) : linhas.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nenhum atendimento de produtor no período" description="Escolha outro período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={cn("text-left", CABECALHO_TABELA)}>
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Atendente</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Atendimentos</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Com oferta</th>
                  <th className="px-3 py-2.5 font-semibold">Taxa de oferta</th>
                  {FERRAMENTAS.map((f) => (
                    <th key={f.chave} className="px-3 py-2.5 text-right font-semibold">{f.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r, i) => (
                  <motion.tr key={r.atendente} {...entradaLinha(i)} className={LINHA_TABELA}>
                    <td className="px-3 py-2.5 font-medium text-ink">{r.atendente}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink/70">{r.atendimentos}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink/70">{r.com_oferta}</td>
                    <td className="px-3 py-2.5">
                      {r.taxa === null ? (
                        <span className="text-ink/40">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sand-subtle">
                            <span className={cn("block h-full rounded-full", BARRA_TOM[tomDaTaxa(r.taxa)])} style={{ width: `${r.taxa}%` }} />
                          </span>
                          <span className="font-semibold tabular-nums text-ink">{r.taxa}%</span>
                        </div>
                      )}
                    </td>
                    {FERRAMENTAS.map((f) => {
                      const n = Number(r[f.chave as ChaveFerramenta] ?? 0);
                      return (
                        <td key={f.chave} className={cn("px-3 py-2.5 text-right tabular-nums", n > 0 ? "text-ink" : "text-ink/30")}>
                          {n}
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="space-y-1 text-[11px] text-ink/40">
          <p>
            Taxa de oferta = atendimentos com tag oferta ou oferta-* ÷ atendimentos de produtor resolvidos por humano. Meta do
            playbook: {META_OFERTA}%.
          </p>
          {total.semSegmentos > 0 && (
            <p>
              {total.semSegmentos} {total.semSegmentos === 1 ? "conversa ficou" : "conversas ficaram"} de fora porque{" "}
              {total.semSegmentos === 1 ? "foi resolvida" : "foram resolvidas"} antes de o Hub começar a ler as tags (12/11, 11:15).
            </p>
          )}
          <p>Taxa de ativação e ticket médio dos ativados, os outros dois indicadores do playbook, dependem de dados de dev ou BI.</p>
        </div>
      </PainelCard>
    </div>
  );
}
