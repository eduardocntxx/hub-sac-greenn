import { useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { PERIODO_LABELS, resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { cn } from "@/lib/utils";

interface DateRangePopoverProps {
  preset: PeriodoPreset;
  personalizado: { inicio: string; fim: string };
  onChangePreset: (p: PeriodoPreset) => void;
  onChangePersonalizado: (v: { inicio: string; fim: string }) => void;
  className?: string;
}

/**
 * Único componente de filtro de período da plataforma — usado em Meu
 * Painel, Analytics, CSAT, Performance, Atendimentos, etc. Um botão com a
 * data atual que abre um popover com os presets pedidos.
 */
export function DateRangePopover({
  preset,
  personalizado,
  onChangePreset,
  onChangePersonalizado,
  className,
}: DateRangePopoverProps) {
  const [aberto, setAberto] = useState(false);
  const { inicio, fim } = resolvePeriodo(preset, personalizado);

  const rotulo =
    preset === "personalizado" && personalizado.inicio && personalizado.fim
      ? `${new Date(personalizado.inicio).toLocaleDateString("pt-BR")} - ${new Date(personalizado.fim).toLocaleDateString("pt-BR")}`
      : preset === "personalizado"
        ? "Personalizado"
        : `${inicio.toLocaleDateString("pt-BR")} - ${fim.toLocaleDateString("pt-BR")}`;

  return (
    <div className={cn("relative", className)}>
      {aberto && <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />}
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-sand-line bg-sand-surface px-2.5 text-[13px] text-ink/60 transition-colors hover:border-sand-line-strong"
      >
        <CalendarDays size={14} className="text-ink/40" />
        {rotulo}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-sand-line bg-sand-surface p-1.5 shadow-float">
          {(Object.entries(PERIODO_LABELS) as [PeriodoPreset, string][]).map(([valor, label]) => (
            <button
              key={valor}
              onClick={() => {
                onChangePreset(valor);
                if (valor !== "personalizado") setAberto(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-sand-subtle",
                preset === valor && "bg-forest-50 text-forest-700 dark:bg-forest-500/15 dark:text-forest-300"
              )}
            >
              {label}
              {preset === valor && <Check size={14} />}
            </button>
          ))}

          {preset === "personalizado" && (
            <div className="mt-1 space-y-2 border-t border-sand-line p-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink/50">De</label>
                <input
                  type="date"
                  value={personalizado.inicio}
                  onChange={(e) => onChangePersonalizado({ ...personalizado, inicio: e.target.value })}
                  className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-[13px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink/50">Até</label>
                <input
                  type="date"
                  value={personalizado.fim}
                  onChange={(e) => onChangePersonalizado({ ...personalizado, fim: e.target.value })}
                  className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-[13px]"
                />
              </div>
              <button
                onClick={() => setAberto(false)}
                className="w-full rounded-lg bg-forest-500 py-1.5 text-[13px] font-medium text-white hover:bg-forest-600"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
