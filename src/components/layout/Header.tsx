import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useTheme } from "@/hooks/useTheme";
import { GlobalSearch } from "@/components/GlobalSearch";

export function Header() {
  const { user } = useAuth();
  const { unreadCount, marcarComoLidas } = useNotifications();
  const { tema, alternar } = useTheme();
  const navigate = useNavigate();

  if (!user) return null;

  function irParaAtualizacoes() {
    marcarComoLidas();
    navigate("/atualizacoes");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-sand-line bg-sand-surface px-6">
      <GlobalSearch />
      <div className="flex items-center gap-4">
        <button
          onClick={irParaAtualizacoes}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-ink/60 hover:bg-sand-bg"
          aria-label="Notificações"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rust-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={alternar}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/60 hover:bg-sand-bg"
          aria-label={tema === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
          title={tema === "dark" ? "Modo claro" : "Modo escuro"}
        >
          {tema === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NavLink
          to="/perfil"
          className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-sand-bg"
        >
          <Avatar nome={user.nome} size="sm" />
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-tight text-ink">
              {user.nome}
            </p>
            <p className="text-xs leading-tight text-ink/50">{user.equipe}</p>
          </div>
          <Badge tone={user.perfil === "administrador" ? "brand" : "neutral"}>
            {user.perfil === "administrador" ? "Admin" : "Colaborador"}
          </Badge>
        </NavLink>
      </div>
    </header>
  );
}
