import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchAllDocumentation, upsertDocumentation, deleteDocumentation } from "@/services/api";
import type { DbDocumentation } from "@/types/database";

const schema = z.object({
  titulo: z.string().min(1, "Informe o título"),
  descricao: z.string().optional(),
  categoria: z.string().optional(),
  link: z.string().url("URL inválida").optional().or(z.literal("")),
  ordem: z.coerce.number().int().min(0),
  publicado: z.boolean(),
});
type FormT = z.infer<typeof schema>;

export default function AdminDocumentacao() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<DbDocumentation | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: docs, isLoading } = useQuery({ queryKey: ["documentation", "admin"], queryFn: fetchAllDocumentation });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setEditando(null); setErro(null);
    reset({ titulo: "", descricao: "", categoria: "", link: "", ordem: (docs?.length ?? 0) + 1, publicado: true });
    setDialogAberto(true);
  }
  function abrirEdicao(d: DbDocumentation) {
    setEditando(d); setErro(null);
    reset({ titulo: d.titulo, descricao: d.descricao ?? "", categoria: d.categoria ?? "", link: d.link ?? "", ordem: d.ordem, publicado: d.publicado });
    setDialogAberto(true);
  }
  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertDocumentation({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["documentation"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }
  async function remover(id: string) {
    try { await deleteDocumentation(id); await queryClient.invalidateQueries({ queryKey: ["documentation"] }); }
    catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível remover."); }
  }

  const filtrados = useMemo(
    () => (docs ?? []).filter((d) => d.titulo.toLowerCase().includes(busca.toLowerCase())),
    [docs, busca]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento..." className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface pl-9 pr-3 text-sm outline-none focus:border-forest-500" />
        </div>
        <Button onClick={abrirNovo}><Plus size={16} /> Novo documento</Button>
      </div>
      {erro && <p className="text-sm text-rust-500">{erro}</p>}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum documento encontrado" description="Ajuste a busca ou cadastre um novo documento." action={<Button onClick={abrirNovo}>Novo documento</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-4 py-3 font-medium">Documento</th><th className="px-4 py-3 font-medium">Categoria</th><th className="px-4 py-3 font-medium">Ordem</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Ações</th></tr>
            </thead>
            <tbody>
              {filtrados.map((d) => (
                <tr key={d.id} className="border-t border-sand-line">
                  <td className="px-4 py-3"><p className="font-medium text-ink">{d.titulo}</p><p className="text-xs text-ink/50">{d.descricao}</p></td>
                  <td className="px-4 py-3 text-ink/70">{d.categoria}</td>
                  <td className="px-4 py-3 text-ink/70">{d.ordem}</td>
                  <td className="px-4 py-3"><Badge tone={d.publicado ? "success" : "neutral"}>{d.publicado ? "publicado" : "rascunho"}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => abrirEdicao(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"><Pencil size={15} /></button>
                      <button onClick={() => remover(d.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500"><Trash2 size={15} /></button>
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
            <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar documento" : "Novo documento"}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Título</label>
                <input {...register("titulo")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.titulo && <p className="mt-1 text-xs text-rust-500">{errors.titulo.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Descrição</label>
                <input {...register("descricao")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Link</label>
                <input {...register("link")} placeholder="https://..." className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.link && <p className="mt-1 text-xs text-rust-500">{errors.link.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Categoria</label>
                  <input {...register("categoria")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Ordem</label>
                  <input type="number" {...register("ordem")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("publicado")} className="h-4 w-4 accent-forest-500" /> Publicado</label>
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
