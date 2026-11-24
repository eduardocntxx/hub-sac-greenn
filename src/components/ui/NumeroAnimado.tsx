import { NumeroRolante } from "@/components/ui/NumeroRolante";

// Número dos indicadores: rola como contador mecânico (2026-11-23; antes contava de 0 até o
// valor). O texto exibido é sempre o original, então a animação nunca muda o número.
export function NumeroAnimado({ texto }: { texto: string; duracao?: number }) {
  return <NumeroRolante valor={texto} />;
}
