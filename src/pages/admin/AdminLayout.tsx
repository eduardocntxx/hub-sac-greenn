import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/admin", label: "Visão geral", end: true },
  { to: "/admin/usuarios", label: "Usuários" },
  { to: "/admin/perfis", label: "Perfis" },
  { to: "/admin/permissoes", label: "Permissões" },
  { to: "/admin/escalas", label: "Escalas" },
  { to: "/admin/metas", label: "Metas" },
  { to: "/admin/cursos", label: "Cursos" },
  { to: "/admin/documentacao", label: "Documentação" },
  { to: "/admin/atualizacoes", label: "Atualizações" },
  { to: "/admin/outros-links", label: "Outros Links" },
];

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Administração
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Gerencie usuários, perfis, permissões, módulos e todo o conteúdo da plataforma.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-sand-line">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                "border-b-2 px-3 py-2 text-sm font-medium -mb-px whitespace-nowrap",
                isActive
                  ? "border-forest-500 text-forest-600"
                  : "border-transparent text-ink/50 hover:text-ink"
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
