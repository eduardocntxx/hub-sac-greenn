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
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-500/10 text-forest-600 dark:text-forest-300"
      >
        <Icon size={22} />
      </motion.div>
      <h3 className="mt-4 font-display text-base font-semibold text-ink">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-ink/60">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
