import { BarChart } from "hub-sac-greenn";

export const EvolucaoDiaria = () => (
  <div className="w-[560px] rounded-2xl border border-sand-line bg-sand-surface p-4">
    <BarChart
      data={[
        { label: "17/09", value: 92 },
        { label: "18/09", value: 71 },
        { label: "19/09", value: 45 },
        { label: "20/09", value: 58 },
        { label: "21/09", value: 88 },
        { label: "22/09", value: 83 },
        { label: "23/09", value: 76 },
      ]}
      height={180}
    />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="w-[560px] bg-sand-bg p-4">
      <div className="rounded-2xl border border-sand-line bg-sand-surface p-4">
        <BarChart data={[{ label: "Seg", value: 88 }, { label: "Ter", value: 64 }, { label: "Qua", value: 41 }, { label: "Qui", value: 79 }]} height={160} />
      </div>
    </div>
  </div>
);
