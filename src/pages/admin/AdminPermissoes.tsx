import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { motion } from "framer-motion";
import { Entrada } from "@/components/ui/Entrada";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { CABECALHO_TABELA, LINHA_TABELA, entradaLinha } from "@/components/ui/Tabela";
import { cn } from "@/lib/utils";
import {
  fetchUsers,
  fetchModules,
  fetchAllUserPermissions,
  grantPermission,
  revokePermission,
} from "@/services/api";

const perfis = [
  {
    nome: "Administrador",
    descricao: "Acesso total à plataforma — não precisa de permissões granulares, elas são implícitas.",
  },
  {
    nome: "Colaborador",
    descricao: "Acesso à própria rotina. Ganha acesso de gestão a um módulo específico ao receber a permissão correspondente abaixo.",
  },
];

// Só módulos que fazem sentido como "gerenciar X" aparecem na matriz
// (rotas de navegação puras como Início/Perfil ficam de fora).
const MODULOS_GERENCIAVEIS = [
  "missoes",
  "csat",
  "analytics",
  "rr",
  "cursos",
  "atualizacoes",
  "documentacao",
  "links",
  "reclame_aqui",
  "nps",
  "helpdesks",
];

export default function AdminPermissoes() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });
  const { data: modules, isLoading: loadingModules } = useQuery({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });
  const { data: userPermissions, isLoading: loadingPerms } = useQuery({
    queryKey: ["user-permissions", "all"],
    queryFn: fetchAllUserPermissions,
  });

  const modulosGerenciaveis = useMemo(
    () => (modules ?? []).filter((m) => m.slug && MODULOS_GERENCIAVEIS.includes(m.slug)),
    [modules]
  );

  const colaboradores = useMemo(
    () => (users ?? []).filter((u) => u.roles?.nome !== "Administrador"),
    [users]
  );

  const grantedSet = useMemo(() => {
    const set = new Set<string>();
    (userPermissions ?? []).forEach((p) => set.add(`${p.user_id}:${p.module_id}`));
    return set;
  }, [userPermissions]);

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      moduleId,
      granted,
    }: {
      userId: string;
      moduleId: string;
      granted: boolean;
    }) => {
      if (granted) {
        await revokePermission(userId, moduleId);
      } else {
        await grantPermission(userId, moduleId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", "all"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: (err) => {
      setErro(err instanceof Error ? err.message : "Não foi possível atualizar a permissão.");
    },
  });

  const isLoading = loadingUsers || loadingModules || loadingPerms;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 p-4">
        <ShieldCheck size={18} className="mt-0.5 text-forest-600" />
        <p className="text-sm text-ink/60">
          Nada aqui é fixo no frontend: cada célula marcada grava uma linha em{" "}
          <code>public.user_permissions</code>, e o próprio banco (via RLS +
          função <code>has_permission()</code>) decide o que cada usuário pode
          gerenciar. Administradores têm acesso total por definição.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {perfis.map((p, i) => (
          <Entrada key={p.nome} indice={i} className="h-full">
          <Card className="h-full">
            <CardContent>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-ink">
                  {p.nome}
                </h3>
                <Badge tone={p.nome === "Administrador" ? "brand" : "neutral"}>
                  {p.nome}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink/60">{p.descricao}</p>
            </CardContent>
          </Card>
          </Entrada>
        ))}
      </div>

      <div>
        <SecaoHead titulo="Permissões granulares por colaborador" className="mb-3" />
        {erro && <p className="mb-2 text-sm text-rust-500">{erro}</p>}

        {isLoading ? (
          <CardSkeleton />
        ) : colaboradores.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhum colaborador cadastrado ainda.</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={cn("text-left", CABECALHO_TABELA)}>
                <tr>
                  <th className="sticky left-0 bg-sand-subtle px-4 py-3 font-medium">
                    Colaborador
                  </th>
                  {modulosGerenciaveis.map((m) => (
                    <th key={m.id} className="px-3 py-3 text-center font-medium">
                      {m.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((u, i) => (
                  <motion.tr key={u.id} {...entradaLinha(i)} className={LINHA_TABELA}>
                    <td className="sticky left-0 bg-sand-surface px-4 py-3">
                      <p className="font-medium text-ink">{u.nome}</p>
                      <p className="text-xs text-ink/50">{u.equipe}</p>
                    </td>
                    {modulosGerenciaveis.map((m) => {
                      const granted = grantedSet.has(`${u.id}:${m.id}`);
                      return (
                        <td key={m.id} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={granted}
                            onChange={() =>
                              toggleMutation.mutate({
                                userId: u.id,
                                moduleId: m.id,
                                granted,
                              })
                            }
                            className="h-4 w-4 accent-forest-500"
                            title={`Gerenciar ${m.nome}`}
                          />
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
