import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Users as UsersIcon, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchUsers, fetchRoles, upsertUser, approveUser, deleteUser, inviteUser } from "@/services/api";
import type { DbUser } from "@/types/database";

const userSchema = z.object({
  nome: z.string().min(2, "Informe o nome completo"),
  email: z.string().email("Email inválido"),
  cargo: z.string().min(1, "Informe o cargo"),
  equipe: z.string().min(1, "Informe a equipe"),
  role_id: z.string().min(1, "Selecione um perfil"),
  horario_entrada: z.string().min(1, "Informe o horário de entrada"),
  horario_saida_almoco: z.string().min(1, "Informe o horário de saída para almoço"),
  horario_retorno_almoco: z.string().min(1, "Informe o horário de retorno do almoço"),
  horario_saida: z.string().min(1, "Informe o horário de saída"),
  ativo: z.boolean(),
});

type UserForm = z.infer<typeof userSchema>;

export default function AdminUsuarios() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<DbUser | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: usuarios, isLoading } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema) });

  function abrirNovo() {
    setEditando(null);
    setErro(null);
    reset({
      nome: "",
      email: "",
      cargo: "",
      equipe: "",
      role_id: roles?.find((r) => r.nome === "Colaborador")?.id ?? "",
      horario_entrada: "08:00",
      horario_saida_almoco: "12:00",
      horario_retorno_almoco: "13:00",
      horario_saida: "17:00",
      ativo: true,
    });
    setDialogAberto(true);
  }

  function abrirEdicao(u: DbUser) {
    setEditando(u);
    setErro(null);
    reset({
      nome: u.nome,
      email: u.email,
      cargo: u.cargo ?? "",
      equipe: u.equipe ?? "",
      role_id: u.role_id ?? "",
      horario_entrada: u.horario_entrada?.slice(0, 5) ?? "08:00",
      horario_saida_almoco: u.horario_saida_almoco?.slice(0, 5) ?? "12:00",
      horario_retorno_almoco: u.horario_retorno_almoco?.slice(0, 5) ?? "13:00",
      horario_saida: u.horario_saida?.slice(0, 5) ?? "17:00",
      ativo: u.ativo,
    });
    setDialogAberto(true);
  }

  async function onSubmit(data: UserForm) {
    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        await upsertUser({ id: editando.id, ...data });
      } else {
        await inviteUser(data);
      }
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    try {
      await deleteUser(id);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  async function aprovar(id: string) {
    try {
      await approveUser(id);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível aprovar.");
    }
  }

  const filtrados = useMemo(
    () =>
      (usuarios ?? []).filter(
        (u) =>
          u.nome.toLowerCase().includes(busca.toLowerCase()) ||
          u.email.toLowerCase().includes(busca.toLowerCase())
      ),
    [usuarios, busca]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface pl-9 pr-3 text-sm outline-none focus:border-forest-500"
          />
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={16} /> Novo usuário
        </Button>
      </div>

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Nenhum usuário encontrado"
          description="Ajuste a busca ou cadastre um novo usuário."
          action={<Button onClick={abrirNovo}>Novo usuário</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Equipe</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => (
                <tr key={u.id} className="border-t border-sand-line">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{u.nome}</p>
                    <p className="text-xs text-ink/50">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{u.equipe}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.roles?.nome === "Administrador" ? "brand" : "neutral"}>
                      {u.roles?.nome ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {!u.aprovado ? (
                      <Badge tone="warning">Pendente aprovação</Badge>
                    ) : (
                      <Badge tone={u.ativo ? "success" : "neutral"}>
                        {u.ativo ? "ativo" : "inativo"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!u.aprovado && (
                        <button
                          onClick={() => aprovar(u.id)}
                          title="Aprovar acesso"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-forest-500/10 hover:text-forest-600"
                        >
                          <Check size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => abrirEdicao(u)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => remover(u.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
            <h2 className="font-display text-base font-semibold text-ink">
              {editando ? "Editar usuário" : "Novo usuário"}
            </h2>
            <p className="mt-1 text-xs text-ink/50">
              {editando
                ? "Isso atualiza o registro em public.users."
                : "A pessoa recebe um e-mail de convite automático pra definir a própria senha — o acesso já é criado e vinculado sozinho."}
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Nome</label>
                <input
                  {...register("nome")}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
                {errors.nome && <p className="mt-1 text-xs text-rust-500">{errors.nome.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Email</label>
                <input
                  {...register("email")}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
                {errors.email && <p className="mt-1 text-xs text-rust-500">{errors.email.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Cargo</label>
                  <input
                    {...register("cargo")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Equipe</label>
                  <input
                    {...register("equipe")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Perfil</label>
                <select
                  {...register("role_id")}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                >
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Entrada</label>
                  <input type="time" {...register("horario_entrada")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.horario_entrada && <p className="mt-1 text-xs text-rust-500">{errors.horario_entrada.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Saída p/ almoço</label>
                  <input type="time" {...register("horario_saida_almoco")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.horario_saida_almoco && <p className="mt-1 text-xs text-rust-500">{errors.horario_saida_almoco.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Retorno do almoço</label>
                  <input type="time" {...register("horario_retorno_almoco")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.horario_retorno_almoco && <p className="mt-1 text-xs text-rust-500">{errors.horario_retorno_almoco.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Saída</label>
                  <input type="time" {...register("horario_saida")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.horario_saida && <p className="mt-1 text-xs text-rust-500">{errors.horario_saida.message}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
}
