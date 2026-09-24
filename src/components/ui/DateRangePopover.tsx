import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { PERIODO_LABELS, resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { buildMonthGrid, toISODate, MESES, DIAS_SEMANA_CURTO } from "@/lib/calendarUtils";
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
  const [mesExibido, setMesExibido] = useState(() => new Date());
  const { inicio, fim } = resolvePeriodo(preset, personalizado);

  // Toda vez que o popover abre em modo "Personalizado", o mês exibido no
  // mini-calendário parte do início já selecionado (ou do mês atual, se
  // ainda não houver nada escolhido) — evita abrir sempre no mês de hoje
  // quando o usuário já tinha um intervalo de meses atrás selecionado.
  useEffect(() => {
    if (aberto && preset === "personalizado") {
      setMesExibido(personalizado.inicio ? new Date(personalizado.inicio + "T00:00:00") : new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // Clique no mini-calendário: 1º clique define o início (limpando um fim
  // anterior); o 2º define o fim, desde que seja depois do início — clicar
  // numa data ANTES do início já marcado faz essa data virar o novo início
  // (comportamento pedido: nunca produz um intervalo invertido). Clicar de
  // novo depois de já ter um intervalo completo (início E fim definidos)
  // sempre começa um intervalo novo do zero, descartando o anterior — é
  // isso que evita o bug de "o clique seguinte confunde com o 3º ponto".
  function selecionarDia(dia: Date) {
    const iso = toISODate(dia);
    const temIntervaloCompleto = personalizado.inicio && personalizado.fim;
    if (!personalizado.inicio || temIntervaloCompleto) {
      onChangePersonalizado({ inicio: iso, fim: "" });
    } else if (iso < personalizado.inicio) {
      onChangePersonalizado({ inicio: iso, fim: "" });
    } else {
      onChangePersonalizado({ inicio: personalizado.inicio, fim: iso });
    }
  }

  const grid = buildMonthGrid(mesExibido.getFullYear(), mesExibido.getMonth());
  const hojeIso = toISODate(new Date());

  const rotulo =
    preset === "personalizado" && personalizado.inicio && personalizado.fim
      ? // "+T00:00:00" pelo mesmo motivo de dateRanges.ts: sem isso o rótulo
        // mostra um dia a menos do que o usuário escolheu no input, em
        // qualquer fuso atrás de UTC.
        `${new Date(personalizado.inicio + "T00:00:00").toLocaleDateString("pt-BR")} - ${new Date(personalizado.fim + "T00:00:00").toLocaleDateString("pt-BR")}`
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

      <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "absolute right-0 top-full z-20 mt-1.5 origin-top-right overflow-hidden rounded-xl border border-sand-line bg-sand-surface p-1.5 shadow-float",
            preset === "personalizado" ? "w-72" : "w-56"
          )}
        >
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-ink/50">De</label>
                  <input
                    type="date"
                    value={personalizado.inicio}
                    onChange={(e) => onChangePersonalizado({ ...personalizado, inicio: e.target.value })}
                    className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-[13px]"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-ink/50">Até</label>
                  <input
                    type="date"
                    value={personalizado.fim}
                    onChange={(e) => onChangePersonalizado({ ...personalizado, fim: e.target.value })}
                    className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              {/* Mini-calendário: alternativa a digitar, clicando o intervalo
                  direto. Ver `selecionarDia()` pra semântica do clique. */}
              <div className="rounded-lg border border-sand-line p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMesExibido((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="rounded-md p-1 text-ink/50 hover:bg-sand-subtle hover:text-ink"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[12px] font-medium text-ink">
                    {MESES[mesExibido.getMonth()]} {mesExibido.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMesExibido((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="rounded-md p-1 text-ink/50 hover:bg-sand-subtle hover:text-ink"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-y-0.5 text-center">
                  {DIAS_SEMANA_CURTO.map((d) => (
                    <div key={d} className="text-[10px] font-medium text-ink/40">
                      {d.charAt(0)}
                    </div>
                  ))}
                  {grid.flat().map((dia) => {
                    const iso = toISODate(dia);
                    const foraDoMes = dia.getMonth() !== mesExibido.getMonth();
                    const eInicio = iso === personalizado.inicio;
                    const eFim = iso === personalizado.fim;
                    const noIntervalo =
                      !!personalizado.inicio &&
                      !!personalizado.fim &&
                      iso > personalizado.inicio &&
                      iso < personalizado.fim;
                    const eHoje = iso === hojeIso;
                    return (
                      <button
                        type="button"
                        key={iso}
                        onClick={() => selecionarDia(dia)}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center justify-self-center rounded-md text-[11px] transition-colors",
                          foraDoMes && "text-ink/25",
                          !foraDoMes && !eInicio && !eFim && !noIntervalo && "text-ink hover:bg-sand-subtle",
                          noIntervalo && "rounded-none bg-forest-50 text-forest-700 dark:bg-forest-500/15 dark:text-forest-300",
                          (eInicio || eFim) && "bg-forest-500 font-semibold text-white hover:bg-forest-600",
                          eHoje && !eInicio && !eFim && "ring-1 ring-inset ring-forest-400"
                        )}
                      >
                        {dia.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setAberto(false)}
                className="w-full rounded-lg bg-forest-500 py-1.5 text-[13px] font-medium text-white hover:bg-forest-600"
              >
                Aplicar
              </button>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
