import { useState } from "react";
import { SegmentedControl } from "hub-sac-greenn";

const Periodo = () => {
  const [v, setV] = useState<"diario" | "semanal" | "mensal">("semanal");
  return (
    <SegmentedControl
      options={[["diario", "Diário"], ["semanal", "Semanal"], ["mensal", "Mensal"]] as const}
      value={v}
      onChange={setV}
    />
  );
};

const Abas = () => {
  const [v, setV] = useState<"ranking" | "atendimentos" | "generico">("ranking");
  return (
    <SegmentedControl
      options={[["ranking", "Dashboard"], ["atendimentos", "Atendimentos"], ["generico", "IA genérica"]] as const}
      value={v}
      onChange={setV}
    />
  );
};

export const Granularidade = () => <div className="p-4"><Periodo /></div>;
export const AbasDaPagina = () => <div className="p-4"><Abas /></div>;
export const ModoEscuro = () => (
  <div className="dark"><div className="bg-sand-bg p-4"><Abas /></div></div>
);
