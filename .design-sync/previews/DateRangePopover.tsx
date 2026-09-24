import { useState } from "react";
import { DateRangePopover } from "hub-sac-greenn";

const Filtro = () => {
  const [preset, setPreset] = useState<"semana_atual" | "hoje">("semana_atual");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  return (
    <DateRangePopover
      preset={preset as never}
      personalizado={personalizado}
      onChangePreset={(p) => setPreset(p as never)}
      onChangePersonalizado={setPersonalizado}
    />
  );
};

export const FiltroDePeriodo = () => <div className="p-4"><Filtro /></div>;
export const ModoEscuro = () => <div className="dark"><div className="bg-sand-bg p-4"><Filtro /></div></div>;
