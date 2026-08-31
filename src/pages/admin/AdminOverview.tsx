import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { Users, FileText, Wrench, GraduationCap, Megaphone, Link2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  fetchUsers,
  fetchTools,
  fetchCourses,
  fetchDocumentation,
  fetchAnnouncements,
} from "@/services/api";

const gerenciar = [
  { label: "Perfis", icon: ShieldCheck, to: "/admin/perfis", desc: "Papéis de acesso (Administrador, Colaborador, ...)" },
  { label: "Links rápidos", icon: Link2, to: null, desc: "Gestão via tela dedicada prevista para a próxima fase" },
];

export default function AdminOverview() {
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: tools } = useQuery({ queryKey: ["tools"], queryFn: fetchTools });
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const { data: docs } = useQuery({ queryKey: ["documentation"], queryFn: fetchDocumentation });
  const { data: announcements } = useQuery({
    queryKey: ["announcements", "full"],
    queryFn: () => fetchAnnouncements(),
  });

  const resumo = [
    { label: "Usuários", value: users?.length ?? 0, icon: Users },
    { label: "Outros Links", value: tools?.length ?? 0, icon: Wrench },
    { label: "Cursos", value: courses?.length ?? 0, icon: GraduationCap },
    { label: "Documentos", value: docs?.length ?? 0, icon: FileText },
    { label: "Comunicados", value: announcements?.length ?? 0, icon: Megaphone },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {resumo.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/60">{label}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-50 text-forest-600 dark:bg-forest-500/15 dark:text-forest-300">
                <Icon size={16} />
              </div>
            </div>
            <p className="mt-3 font-display text-2xl font-semibold text-ink">
              {value}
            </p>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">
          Outras áreas de gestão
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {gerenciar.map(({ label, icon: Icon, to, desc }) => {
            const conteudo = (
              <Card className="h-full p-5 transition-colors hover:border-forest-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sand-bg text-ink/60">
                  <Icon size={16} />
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{label}</p>
                <p className="mt-1 text-xs text-ink/50">{desc}</p>
              </Card>
            );
            return to ? (
              <NavLink key={label} to={to}>
                {conteudo}
              </NavLink>
            ) : (
              <div key={label}>{conteudo}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
