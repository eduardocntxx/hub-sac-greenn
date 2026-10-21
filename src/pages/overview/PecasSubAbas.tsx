import type { ReactNode } from "react";
import { ChevronDown, ExternalLink, Info, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Entrada } from "@/components/ui/Entrada";
import { cn } from "@/lib/utils";

// Peças das sub-abas do Overview (Pessoas, Velocidade, Qualidade, Volume).
// As peças de visual viraram oficiais em `components/ui` (2026-10-20) e são
// reexportadas aqui; o que sobra neste arquivo é específico do Overview.
export { ChipIcone, MetricaTile, Indicador as KpiPainel, type Tom } from "@/components/ui/Indicador";
export { Entrada } from "@/components/ui/Entrada";
export { PainelCard } from "@/components/ui/PainelCard";
export { BarrasRanking, type BarraDado } from "@/components/ui/BarraAnimada";
export { SelectPainel, CABECALHO_TABELA, LINHA_TABELA, entradaLinha } from "@/components/ui/Tabela";

export function LinkVer({ href }: { href?: string | null }) {
  if (!href) return <span className="text-xs text-ink/30">sem link</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-sand-line px-2.5 py-1 text-xs font-semibold text-forest-700 transition hover:border-sand-line-strong hover:bg-sand-subtle dark:text-forest-300"
    >
      Ver <ExternalLink size={12} />
    </a>
  );
}

export function BotaoExpandir({ aberto, restantes, onClick, rotulo = "Ver mais" }: { aberto: boolean; restantes: number; onClick: () => void; rotulo?: string }) {
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="secondary" size="sm" onClick={onClick}>
        {aberto ? "Ver menos" : `${rotulo} (${restantes})`}
        <ChevronDown size={14} className={cn("transition-transform duration-200", aberto && "rotate-180")} />
      </Button>
    </div>
  );
}

// "ver mais" do cabeçalho de seção (abre o pop-up de explicação completa).
export function BotaoSaibaMais({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 items-center gap-1 rounded-full border border-sand-line-strong px-2.5 text-xs font-medium text-ink/50 transition hover:bg-sand-subtle hover:text-ink"
    >
      <Info size={12} /> ver mais
    </button>
  );
}

// ---------- Carregando e vazio ----------
export function CarregandoPainel({ colunas = 3 }: { colunas?: 1 | 2 | 3 }) {
  return (
    <div className={cn("grid gap-4", colunas === 2 && "sm:grid-cols-2", colunas === 3 && "sm:grid-cols-3")}>
      {Array.from({ length: colunas }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function VazioPainel({ icone: Icone, children }: { icone: LucideIcon; children: ReactNode }) {
  return (
    <Entrada>
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sand-subtle text-ink/50">
          <Icone size={16} />
        </span>
        <p className="text-sm text-ink/60">{children}</p>
      </Card>
    </Entrada>
  );
}
