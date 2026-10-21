import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { Users, FileText, Wrench, GraduationCap, Megaphone, Link2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Indicador, ChipIcone } from "@/components/ui/Indicador";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { Entrada } from "@/components/ui/Entrada";
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {resumo.map(({ label, value, icon }, i) => (
          <Indicador key={label} indice={i} icone={icon} label={label} valor={String(value)} />
        ))}
      </div>

      <div>
        <SecaoHead titulo="Outras áreas de gestão" />
        <div className="grid gap-4 sm:grid-cols-3">
          {gerenciar.map(({ label, icon, to, desc }, i) => {
            const conteudo = (
              <Card className="group h-full p-5 hover:ring-1 hover:ring-forest-500/40">
                <ChipIcone icone={icon} className="transition-transform duration-200 group-hover:scale-110" />
                <p className="mt-3 text-[13.5px] font-bold text-ink">{label}</p>
                <p className="mt-1 text-xs text-ink/50">{desc}</p>
              </Card>
            );
            return (
              <Entrada key={label} indice={i} elevar={Boolean(to)} className="h-full">
                {to ? <NavLink to={to}>{conteudo}</NavLink> : conteudo}
              </Entrada>
            );
          })}
        </div>
      </div>
    </div>
  );
}
