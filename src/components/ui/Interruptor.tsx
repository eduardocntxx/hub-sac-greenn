import { useRef } from "react";
import { cn } from "@/lib/utils";
import { esticarBolinha } from "@/lib/efeitos";

// Interruptor liga/desliga: a bolinha estica no meio do caminho e assenta (cena da Central).
export function Interruptor({ ligado, onChange, rotulo, disabled }: { ligado: boolean; onChange: () => void; rotulo: string; disabled?: boolean }) {
  const bolinha = useRef<HTMLSpanElement>(null);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={() => {
        if (bolinha.current) esticarBolinha(bolinha.current);
        onChange();
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-300 disabled:opacity-50",
        ligado ? "bg-forest-500" : "bg-sand-line-strong"
      )}
    >
      <span
        ref={bolinha}
        className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-300 ease-out", ligado ? "left-[18px]" : "left-0.5")}
      />
    </button>
  );
}
