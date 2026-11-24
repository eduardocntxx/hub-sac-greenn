import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, LayoutDashboard, Target, ClipboardList,
  GraduationCap, BookOpen, Megaphone, Wrench, CalendarDays, Link2,
  Star, MessageSquareWarning, Gauge, Settings, TrendingUp, User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

// Busca sem resultado: a lupa olha pros lados e os pontos de interrogação pulam.
function NadaEncontrado() {
  return (
    <div className="flex flex-col items-center gap-2 p-5 text-ink/40">
      <div className="relative h-10 w-16">
        <motion.span
          className="absolute left-1/2 top-1 -ml-3 text-forest-500"
          animate={{ x: [0, -14, 14, -8, 0], rotate: [0, -18, 18, -8, 0] }}
          transition={{ duration: 1.6, ease: "easeInOut", repeat: 1 }}
        >
          <Search size={24} />
        </motion.span>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute top-0 text-xs font-bold text-amber-500"
            style={{ left: `${12 + i * 18}px` }}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: [8, -10, 0], opacity: [0, 1, 1] }}
            transition={{ duration: 0.5, delay: 0.5 + i * 0.12, ease: "easeOut" }}
          >
            ?
          </motion.span>
        ))}
      </div>
      <p className="text-sm">Nada encontrado.</p>
    </div>
  );
}

interface Item {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  perm?: string;
}

// Home removida em 2026-09-23 — Meu Painel virou a rota padrão ("/").
const ITEMS: Item[] = [
  { label: "Meu Painel", to: "/meu-painel", icon: LayoutDashboard },
  { label: "Missões", to: "/missoes", icon: Target },
  { label: "Overview", to: "/performance", icon: TrendingUp },
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
        className="flex h-[38px] w-full max-w-[380px] items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-sm text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="ml-auto hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/50 sm:inline">
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
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-[6px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            // Abre com zoom vindo do botão de busca (canto de cima à esquerda); resultados em cascata.
            initial={{ opacity: 0, scale: 0.35, x: -320, y: -120, rotateX: -25, transformPerspective: 900 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotateX: 0, transformPerspective: 900, transitionEnd: { transformPerspective: 0 } }}
            exit={{ opacity: 0, scale: 0.5, x: -300, y: -110, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 220, damping: 22, opacity: { duration: 0.15 } }}
            data-cascata-area
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
                <NadaEncontrado />
              ) : (
                resultados.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      data-cascata
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
