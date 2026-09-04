import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Home, LayoutDashboard, Target, BarChart3, ClipboardList,
  GraduationCap, BookOpen, Megaphone, Wrench, CalendarDays, Link2,
  Star, MessageSquareWarning, Gauge, Settings, TrendingUp, User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

interface Item {
  label: string;
  to: string;
  icon: typeof Home;
  adminOnly?: boolean;
  perm?: string;
}

const ITEMS: Item[] = [
  { label: "Home", to: "/", icon: Home },
  { label: "Meu Painel", to: "/meu-painel", icon: LayoutDashboard },
  { label: "Missões", to: "/missoes", icon: Target },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Reunião de Resultados", to: "/reuniao-resultados", icon: ClipboardList },
  { label: "Cursos", to: "/cursos", icon: GraduationCap },
  { label: "Documentação", to: "/documentacao", icon: BookOpen },
  { label: "Atualizações", to: "/atualizacoes", icon: Megaphone },
  { label: "Helpdesks", to: "/helpdesks", icon: Wrench },
  { label: "Calendário", to: "/calendario", icon: CalendarDays },
  { label: "Outros Links", to: "/outros-links", icon: Link2 },
  { label: "CSAT", to: "/csat", icon: Star, perm: "csat" },
  { label: "Reclame Aqui", to: "/reclame-aqui", icon: MessageSquareWarning, perm: "reclame_aqui" },
  { label: "NPS", to: "/nps", icon: Gauge, perm: "nps" },
  { label: "Overview", to: "/performance", icon: TrendingUp, adminOnly: true },
  { label: "Administração", to: "/admin", icon: Settings, adminOnly: true },
  { label: "Perfil", to: "/perfil", icon: User },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selecionado, setSelecionado] = useState(0);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelecionado(0);
    }
  }, [open]);

  const itensDisponiveis = useMemo(
    () => ITEMS.filter((i) => (!i.adminOnly || isAdmin) && (!i.perm || isAdmin || hasPermission(i.perm))),
    [isAdmin, hasPermission]
  );

  const resultados = useMemo(
    () => itensDisponiveis.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
    [itensDisponiveis, query]
  );

  function ir(to: string) {
    navigate(to);
    setOpen(false);
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && resultados[selecionado]) {
      ir(resultados[selecionado].to);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-sand-line bg-sand-bg px-3 text-sm text-ink/40 transition-colors hover:border-sand-line-strong hover:text-ink/60"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="ml-1 hidden rounded border border-sand-line-strong bg-sand-surface px-1.5 py-0.5 text-[10px] font-medium text-ink/40 sm:inline">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-sand-surface shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-sand-line px-4 py-3">
              <Search size={16} className="text-ink/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelecionado(0);
                }}
                onKeyDown={onKeyDownInput}
                placeholder="Buscar módulos, telas..."
                className="w-full text-sm outline-none placeholder:text-ink/30"
              />
              <kbd className="rounded border border-sand-line-strong px-1.5 py-0.5 text-[10px] text-ink/40">
                esc
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {resultados.length === 0 ? (
                <p className="p-4 text-center text-sm text-ink/40">Nada encontrado.</p>
              ) : (
                resultados.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      onClick={() => ir(item.to)}
                      onMouseEnter={() => setSelecionado(i)}
                      className={
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
                        (i === selecionado ? "bg-forest-50 text-forest-700 dark:bg-forest-500/15 dark:text-forest-300" : "text-ink/70 hover:bg-sand-bg")
                      }
                    >
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
