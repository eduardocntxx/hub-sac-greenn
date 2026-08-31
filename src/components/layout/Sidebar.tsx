import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
  TrendingUp,
  Target,
  BarChart3,
  ClipboardList,
  GraduationCap,
  BookOpen,
  Megaphone,
  Wrench,
  CalendarDays,
  Link2,
  Star,
  MessageSquareWarning,
  Gauge,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

// Área disponível para o time de SAC (sempre visível a qualquer colaborador autenticado)
const sacItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/meu-painel", label: "Meu Painel", icon: LayoutDashboard },
  { to: "/missoes", label: "Missões", icon: Target },
  { to: "/reuniao-resultados", label: "Reunião de Resultados", icon: ClipboardList },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/cursos", label: "Cursos", icon: GraduationCap },
  { to: "/documentacao", label: "Documentação", icon: BookOpen },
  { to: "/atualizacoes", label: "Atualizações", icon: Megaphone },
  { to: "/helpdesks", label: "Helpdesks", icon: Wrench },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/outros-links", label: "Outros Links", icon: Link2 },
];

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  highlight,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  collapsed: boolean;
  highlight?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? highlight
              ? "bg-amber-500/90 text-ink"
              : "bg-forest-500/10 text-forest-100"
            : "text-white/60 hover:bg-white/5 hover:text-white/90"
        )
      }
      title={collapsed ? label : undefined}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t border-white/10" />;
  return (
    <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 first:mt-0">
      {children}
    </p>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const [fixado, setFixado] = useState(false);
  const { isAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const temAlgumaPermissaoExtra =
    hasPermission("csat") || hasPermission("reclame_aqui") || hasPermission("nps");

  return (
    <aside
      onMouseEnter={() => !fixado && setCollapsed(false)}
      onMouseLeave={() => !fixado && setCollapsed(true)}
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-forest-900 text-white/90 transition-[width] duration-300 ease-out",
        collapsed ? "w-[72px]" : "w-60 shadow-float"
      )}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-500 text-white">
          <Leaf size={18} />
        </div>
        <span
          className={cn(
            "font-display text-sm font-semibold tracking-wide transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}
        >
          Hub SAC Greenn
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-dark px-2 py-2">
        <SectionLabel collapsed={collapsed}>Área SAC</SectionLabel>
        {sacItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}

        {temAlgumaPermissaoExtra && (
          <>
            <SectionLabel collapsed={collapsed}>Módulos com permissão</SectionLabel>
            {hasPermission("csat") && (
              <NavItem to="/csat" label="CSAT" icon={Star} collapsed={collapsed} />
            )}
            {hasPermission("reclame_aqui") && (
              <NavItem to="/reclame-aqui" label="Reclame" icon={MessageSquareWarning} collapsed={collapsed} />
            )}
            {hasPermission("nps") && (
              <NavItem to="/nps" label="NPS" icon={Gauge} collapsed={collapsed} />
            )}
          </>
        )}

        {isAdmin && (
          <>
            <SectionLabel collapsed={collapsed}>Área de Administradores</SectionLabel>
            <NavItem to="/performance" label="Overview" icon={TrendingUp} collapsed={collapsed} />
            <NavItem to="/admin" label="Configurações da plataforma" icon={Settings} collapsed={collapsed} highlight />
          </>
        )}
      </nav>

      <button
        onClick={() => {
          setFixado((f) => {
            const novo = !f;
            setCollapsed(!novo);
            return novo;
          });
        }}
        title={fixado ? "Desafixar sidebar" : "Fixar sidebar expandida"}
        className="m-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        {fixado ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
        <span className={cn("transition-opacity duration-200", collapsed ? "opacity-0" : "opacity-100")}>
          {fixado ? "Desafixar" : "Fixar expandida"}
        </span>
      </button>
    </aside>
  );
}
