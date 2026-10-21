import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { PainelCard } from "@/pages/overview/PecasSubAbas";

// dow do Postgres: 0=domingo .. 6=sábado (mesma convenção de cobertura_semanal).
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS_DIA = Array.from({ length: 24 }, (_, h) => h);
// Semana começando na segunda.
const ORDEM_DIAS_MAPA = [1, 2, 3, 4, 5, 6, 0];
// 5 níveis, do vazio ao pico (dourado). Cor sólida com opacidade para funcionar nos dois temas.
const CORES_MAPA_CALOR = ["bg-sand-subtle", "bg-forest-500/25", "bg-forest-500/50", "bg-forest-500", "bg-amber-400"];
function nivelMapaCalor(valor: number, max: number): number {
  if (valor <= 0 || max <= 0) return 0;
  const r = valor / max;
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
}

type Celula = { dow: number; h: number };

// Mapa de calor "Volume por dia e horário". Fica num componente próprio porque
// o hover guarda a célula ativa em estado: no `Performance` isso re-renderizaria
// a página inteira a cada quadrado.
export function MapaCalorVolume({ grid, max }: { grid: Map<string, number>; max: number }) {
  const [ativa, setAtiva] = useState<Celula | null>(null);

  const pico = useMemo(() => {
    let melhor: (Celula & { v: number }) | null = null;
    for (const dow of ORDEM_DIAS_MAPA) {
      for (const h of HORAS_DIA) {
        const v = grid.get(`${dow}-${h}`) ?? 0;
        if (v > (melhor?.v ?? 0)) melhor = { dow, h, v };
      }
    }
    return melhor;
  }, [grid]);

  // Sem o mouse em cima de um quadrado, a leitura mostra o horário de pico.
  const leitura = ativa ?? pico;
  const leituraValor = leitura ? grid.get(`${leitura.dow}-${leitura.h}`) ?? 0 : 0;

  return (
    <PainelCard
      icone={LayoutGrid}
      titulo="Onde a demanda se concentra"
      subtitulo="Passe o mouse num quadrado para ver o número"
      acao={
        leitura && (
          <span className="whitespace-nowrap rounded-full bg-sand-subtle px-2.5 py-1 text-xs tabular-nums text-ink/60">
            {!ativa && "Pico: "}
            <b className="text-ink">{DIAS_SEMANA[leitura.dow]} {leitura.h}h</b> · {leituraValor} chamado(s)
          </span>
        )
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: "2rem repeat(24, minmax(0, 1fr))" }} onMouseLeave={() => setAtiva(null)}>
            <span />
            {HORAS_DIA.map((h) => (
              <span key={h} className="text-center text-[10px] tabular-nums text-ink/40">{h}</span>
            ))}
            {ORDEM_DIAS_MAPA.map((dow, linha) => (
              <Fragment key={dow}>
                <span className="flex items-center text-[11px] font-medium text-ink/50">{DIAS_SEMANA[dow]}</span>
                {HORAS_DIA.map((h) => {
                  const v = grid.get(`${dow}-${h}`) ?? 0;
                  const nivel = nivelMapaCalor(v, max);
                  return (
                    // Quem anima a entrada (em onda) é o wrapper; o zoom do hover é
                    // CSS no quadrado de dentro, pra não herdar o atraso da onda.
                    <motion.div
                      key={h}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut", delay: (linha + h) * 0.012 }}
                      onMouseEnter={() => setAtiva({ dow, h })}
                      className="relative h-8 hover:z-10"
                    >
                      <div
                        title={`${DIAS_SEMANA[dow]} ${h}h — ${v} chamado(s)`}
                        className={cn("h-full w-full rounded-md transition-transform duration-150 hover:scale-125 hover:ring-2 hover:ring-ink/40", CORES_MAPA_CALOR[nivel])}
                      />
                    </motion.div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-ink/40">
        <span>menos</span>
        {CORES_MAPA_CALOR.map((cor, i) => (
          <span key={i} className={cn("h-3 w-3 rounded-sm", cor)} />
        ))}
        <span>mais</span>
      </div>
    </PainelCard>
  );
}
