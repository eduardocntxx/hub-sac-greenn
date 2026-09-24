import { useState } from "react";
import { SortableHeader } from "hub-sac-greenn";

type Campo = "chamados" | "tfr" | "csat";

const Tabela = () => {
  const [ordenarPor, setOrdenarPor] = useState<Campo | undefined>("chamados");
  const [direcao, setDirecao] = useState<"asc" | "desc">("desc");
  const onSort = (f: Campo) => {
    if (f === ordenarPor) setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrdenarPor(f); setDirecao("desc"); }
  };
  return (
    <table className="w-[520px] overflow-hidden rounded-2xl border border-sand-line bg-sand-surface text-sm">
      <thead className="bg-sand-bg text-xs uppercase tracking-wide text-ink/50">
        <tr>
          <th className="px-4 py-3 text-left font-medium">Atendente</th>
          <SortableHeader field="chamados" label="Chamados" ordenarPor={ordenarPor} direcao={direcao} onSort={onSort} />
          <SortableHeader field="tfr" label="1ª resposta" ordenarPor={ordenarPor} direcao={direcao} onSort={onSort} />
          <SortableHeader field="csat" label="CSAT" ordenarPor={ordenarPor} direcao={direcao} onSort={onSort} />
        </tr>
      </thead>
      <tbody className="text-ink">
        <tr className="border-t border-sand-line"><td className="px-4 py-3 font-medium">Ana Franca</td><td className="px-4 py-3">244</td><td className="px-4 py-3">4h 52min</td><td className="px-4 py-3">5,00</td></tr>
        <tr className="border-t border-sand-line"><td className="px-4 py-3 font-medium">Vittor Fernandes</td><td className="px-4 py-3">228</td><td className="px-4 py-3">25min</td><td className="px-4 py-3">4,42</td></tr>
      </tbody>
    </table>
  );
};

export const CabecalhoOrdenavel = () => <div className="p-4"><Tabela /></div>;
export const ModoEscuro = () => <div className="dark"><div className="bg-sand-bg p-4"><Tabela /></div></div>;
