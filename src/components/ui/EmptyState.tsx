import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 px-6 py-12",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-50 text-forest-600 ring-1 ring-inset ring-forest-600/10 dark:bg-forest-500/15 dark:text-forest-300 dark:ring-forest-400/20">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-ink">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-ink/60">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
