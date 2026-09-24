import { HorizontalBarChart } from "hub-sac-greenn";

const dados = [
  { label: "Ana Franca", value: 244 },
  { label: "Vittor Fernandes", value: 228 },
  { label: "Nathalia Cavalcanti", value: 219 },
  { label: "Ana Paula", value: 200 },
  { label: "Amanda Felix", value: 189 },
];

export const VolumePorPessoa = () => (
  <div className="w-[520px] rounded-2xl border border-sand-line bg-sand-surface p-4">
    <HorizontalBarChart data={dados} getColorClass={() => "bg-forest-500"} />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="w-[520px] bg-sand-bg p-4">
      <div className="rounded-2xl border border-sand-line bg-sand-surface p-4">
        <HorizontalBarChart data={dados} getColorClass={() => "bg-forest-500"} />
      </div>
    </div>
  </div>
);
