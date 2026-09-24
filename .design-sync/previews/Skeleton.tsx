import { Skeleton } from "hub-sac-greenn";

export const Linhas = () => (
  <div className="flex w-[360px] flex-col gap-3 rounded-2xl border border-sand-line bg-sand-surface p-4">
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
  </div>
);
