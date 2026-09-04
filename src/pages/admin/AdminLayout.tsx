import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

// Agrupado por domínio (só organização visual — nenhuma rota mudou):
// Geral | Identidade e acesso | Escala do time | Conteúdo da plataforma.
const grupos: { nome: string; tabs: { to: string; label: string; end?: boolean }[] }[] = [
  {
    nome: "Geral",
    tabs: [{ to: "/admin", label: "Visão geral", end: true }],
  },
  {
    nome: "Identidade e acesso",
    tabs: [
      { to: "/admin/usuarios", label: "Usuários" },
      { to: "/admin/perfis", label: "Perfis" },
      { to: "/admin/permissoes", label: "Permissões" },
    ],
  },
  {
    nome: "Escala do time",
    tabs: [
      { to: "/admin/escalas", label: "Escalas" },
      { to: "/admin/metas", label: "Metas" },
    ],
  },
  {
    nome: "Conteúdo",
    tabs: [
      { to: "/admin/cursos", label: "Cursos" },
      { to: "/admin/documentacao", label: "Documentação" },
      { to: "/admin/atualizacoes", label: "Atualizações" },
      { to: "/admin/outros-links", label: "Outros Links" },
    ],
  },
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

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-sand-line pb-0">
        {grupos.map((g, gi) => (
          <div key={g.nome} className={cn("flex flex-col gap-1", gi > 0 && "border-l border-sand-line pl-5")}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">{g.nome}</span>
            <div className="flex flex-wrap gap-1">
              {g.tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn(
                      "border-b-2 px-2.5 py-2 text-sm font-medium -mb-px whitespace-nowrap",
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
          </div>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
