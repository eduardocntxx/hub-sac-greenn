import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Entrada } from "@/components/ui/Entrada";
import { fetchRoles, upsertRole, deleteRole } from "@/services/api";

const PERFIS_BASE = ["Administrador", "Colaborador"];

const schema = z.object({
  nome: z.string().min(1, "Informe o nome do perfil"),
  descricao: z.string().optional(),
});
type FormT = z.infer<typeof schema>;
type Role = { id: string; nome: string; descricao: string | null };

export default function AdminPerfis() {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Role | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: roles, isLoading } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setEditando(null); setErro(null);
    reset({ nome: "", descricao: "" });
    setDialogAberto(true);
  }
  function abrirEdicao(r: Role) {
    setEditando(r); setErro(null);
    reset({ nome: r.nome, descricao: r.descricao ?? "" });
    setDialogAberto(true);
  }
  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertRole({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  async function remover(r: Role) {
    if (!confirm(`Excluir o perfil "${r.nome}"? Usuários com esse perfil ficam sem perfil vinculado.`)) return;
    setErro(null);
    try {
      await deleteRole(r.id);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível excluir."); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sand-line bg-sand-bg/60 p-4">
        <ShieldCheck size={18} className="mt-0.5 text-forest-600" />
        <p className="text-sm text-ink/60">
          "Administrador" e "Colaborador" são os dois perfis base do sistema
          (usados por <code>is_admin()</code> no banco). Novos perfis criados
          aqui funcionam como rótulo/organização — para conceder acesso a
          módulos específicos, use a matriz em Permissões.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={abrirNovo}><Plus size={16} /> Novo perfil</Button>
      </div>
      {erro && <p className="text-sm text-rust-500">{erro}</p>}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(roles ?? []).map((r, i) => (
            <Entrada key={r.id} indice={i} className="h-full">
            <Card className="h-full">
              <CardContent>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-ink">{r.nome}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.nome === "Administrador" ? "brand" : "neutral"}>{r.nome}</Badge>
                    <button onClick={() => abrirEdicao(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"><Pencil size={14} /></button>
                    {!PERFIS_BASE.includes(r.nome) && (
                      <button onClick={() => remover(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink/60">{r.descricao}</p>
              </CardContent>
            </Card>
            </Entrada>
          ))}
        </div>
      )}
      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
            <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar perfil" : "Novo perfil"}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Nome</label>
                <input {...register("nome")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.nome && <p className="mt-1 text-xs text-rust-500">{errors.nome.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Descrição</label>
                <input {...register("descricao")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
}
