import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-forest-500/[0.08]", className)}>
      {/* Brilho verde passando (o único degradê que fica: é funcional, mostra que está carregando). */}
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-forest-400/30 to-transparent" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-[20px] bg-sand-surface p-5 shadow-card dark:border dark:border-sand-line">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
