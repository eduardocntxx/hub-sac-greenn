import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SegmentedControlProps<T extends string> {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Grupo compacto de opções (ex: período). Substitui os antigos botões-pill
 * grandes e espaçados — altura 32-36px, fonte 13px, ativo em verde sólido.
 * Regra de densidade horizontal: quanto mais opções, mais compacto o grupo.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const uid = useId();
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-lg bg-sand-subtle p-1",
        className
      )}
    >
      {options.map(([opt, label]) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "relative h-full whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors",
            value === opt ? "text-white" : "text-ink/55 hover:bg-sand-surface/60 hover:text-ink/80"
          )}
        >
          {value === opt && (
            <motion.span
              layoutId={`segmented-pill-${uid}`}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute inset-0 -z-10 rounded-md bg-forest-500"
            />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}
