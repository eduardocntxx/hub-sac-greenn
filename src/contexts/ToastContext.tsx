import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

interface Toast {
  id: string;
  mensagem: string;
}

interface ToastContextValue {
  mostrarErro: (mensagem: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const mostrarErro = useCallback((mensagem: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, mensagem }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  function remover(id: string) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  return (
    <ToastContext.Provider value={{ mostrarErro }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-start gap-2 rounded-xl border border-rust-500/20 bg-sand-surface px-4 py-3 text-sm text-ink shadow-float"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rust-600" />
              <span className="flex-1">{t.mensagem}</span>
              <button onClick={() => remover(t.id)} className="text-ink/30 hover:text-ink/60">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}
