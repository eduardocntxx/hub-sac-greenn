import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { efeitoCopiado } from "@/lib/efeitos";

// Copiar: o ícone gira e vira check, um fantasma do texto sobe e aparece "Copiado".
export function BotaoCopiar({ texto, rotulo = "Copiar link", className }: { texto: string; rotulo?: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      onClick={async (e) => {
        // Pode estar dentro de um link (cartão da Documentação): copiar não abre o link.
        e.preventDefault();
        e.stopPropagation();
        const botao = e.currentTarget;
        try {
          await navigator.clipboard.writeText(texto);
        } catch {
          return;
        }
        efeitoCopiado(botao, texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1600);
      }}
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sand-line text-ink/60 transition-colors hover:border-forest-500 hover:text-forest-600 dark:hover:text-forest-300",
        copiado && "border-forest-500 text-forest-600 dark:text-forest-300",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copiado ? "ok" : "copiar"}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          className="flex"
        >
          {copiado ? <Check size={15} /> : <Copy size={15} />}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence>
        {copiado && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold text-sand-surface"
          >
            Copiado
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
