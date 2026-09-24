import { CardSkeleton } from "hub-sac-greenn";

export const Carregando = () => (
  <div className="grid w-[640px] grid-cols-3 gap-4 p-4">
    <CardSkeleton />
    <CardSkeleton />
    <CardSkeleton />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark"><div className="grid w-[640px] grid-cols-3 gap-4 bg-sand-bg p-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div></div>
);
