import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchAllAnnouncements, upsertAnnouncement, deleteAnnouncement } from "@/services/api";
import type { DbAnnouncement } from "@/types/database";

const schema = z.object({
  titulo: z.string().min(1, "Informe o título"),
  descricao: z.string().optional(),
  categoria: z.enum(["aviso", "novidade", "manutencao", "reconhecimento"]),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  fixado: z.boolean(),
  ativo: z.boolean(),
});
type FormT = z.infer<typeof schema>;

const prioridadeTone = { baixa: "neutral", media: "warning", alta: "danger", urgente: "danger" } as const;

export default function AdminAtualizacoes() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<DbAnnouncement | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: itens, isLoading } = useQuery({ queryKey: ["announcements", "admin"], queryFn: fetchAllAnnouncements });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setEditando(null); setErro(null);
    reset({ titulo: "", descricao: "", categoria: "aviso", prioridade: "media", fixado: false, ativo: true });
    setDialogAberto(true);
  }
  function abrirEdicao(a: DbAnnouncement) {
    setEditando(a); setErro(null);
    reset({ titulo: a.titulo, descricao: a.descricao ?? "", categoria: (a.categoria as FormT["categoria"]) ?? "aviso", prioridade: a.prioridade, fixado: a.fixado, ativo: a.ativo });
    setDialogAberto(true);
  }
  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertAnnouncement({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }
  async function remover(id: string) {
    try { await deleteAnnouncement(id); await queryClient.invalidateQueries({ queryKey: ["announcements"] }); }
    catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível remover."); }
  }

  const filtrados = useMemo(
    () => (itens ?? []).filter((a) => a.titulo.toLowerCase().includes(busca.toLowerCase())),
    [itens, busca]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar comunicado..." className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface pl-9 pr-3 text-sm outline-none focus:border-forest-500" />
        </div>
        <Button onClick={abrirNovo}><Plus size={16} /> Novo comunicado</Button>
      </div>
      {erro && <p className="text-sm text-rust-500">{erro}</p>}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nenhum comunicado encontrado" description="Ajuste a busca ou publique um novo comunicado." action={<Button onClick={abrirNovo}>Novo comunicado</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-4 py-3 font-medium">Comunicado</th><th className="px-4 py-3 font-medium">Prioridade</th><th className="px-4 py-3 font-medium">Fixado</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr key={a.id} className="border-t border-sand-line">
                  <td className="px-4 py-3"><p className="font-medium text-ink">{a.titulo}</p><p className="text-xs text-ink/50">{a.categoria}</p></td>
                  <td className="px-4 py-3"><Badge tone={prioridadeTone[a.prioridade]}>{a.prioridade}</Badge></td>
                  <td className="px-4 py-3">{a.fixado ? "sim" : "não"}</td>
                  <td className="px-4 py-3"><Badge tone={a.ativo ? "success" : "neutral"}>{a.ativo ? "ativo" : "inativo"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => abrirEdicao(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"><Pencil size={15} /></button>
                      <button onClick={() => remover(a.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500"><Trash2 size={15} /></button>
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
            <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar comunicado" : "Novo comunicado"}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Título</label>
                <input {...register("titulo")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.titulo && <p className="mt-1 text-xs text-rust-500">{errors.titulo.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Descrição</label>
                <textarea {...register("descricao")} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Categoria</label>
                  <select {...register("categoria")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                    <option value="aviso">Aviso</option>
                    <option value="novidade">Novidade</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="reconhecimento">Reconhecimento</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Prioridade</label>
                  <select {...register("prioridade")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("fixado")} className="h-4 w-4 accent-forest-500" /> Fixado no topo</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("ativo")} className="h-4 w-4 accent-forest-500" /> Ativo</label>
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
