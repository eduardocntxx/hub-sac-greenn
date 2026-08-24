import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCourses, fetchAllCourses, upsertCourse } from "@/services/api";

const schema = z.object({
  titulo: z.string().min(1, "Informe o título"),
  descricao: z.string().optional(),
  categoria: z.string().optional(),
  link: z.string().url("URL inválida").optional().or(z.literal("")),
  ordem: z.coerce.number().int().min(0),
  publicado: z.boolean(),
});
type FormT = z.infer<typeof schema>;

export default function Cursos() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses", isAdmin ? "admin" : "public"],
    queryFn: () => (isAdmin ? fetchAllCourses() : fetchCourses()),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });

  function abrirNovo() {
    setErro(null);
    reset({ titulo: "", descricao: "", categoria: "", link: "", ordem: (courses?.length ?? 0) + 1, publicado: true });
    setDialogAberto(true);
  }

  async function onSubmit(data: FormT) {
    setSalvando(true); setErro(null);
    try {
      await upsertCourse(data);
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      setDialogAberto(false);
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Cursos</h1>
          <p className="mt-1 text-sm text-ink/50">
            Treinamentos publicados pelo time de gestão.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={abrirNovo}>
            <Plus size={16} /> Novo curso
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : !courses || courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nenhum curso disponível"
          description="Assim que novos treinamentos forem publicados pelo Administrador, eles aparecerão aqui."
          action={isAdmin ? <Button onClick={abrirNovo}>Novo curso</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.id} className="p-5 transition-colors hover:border-forest-300">
              <div className="flex items-center justify-between gap-2">
                <Badge tone="neutral">{c.categoria ?? "Geral"}</Badge>
                {isAdmin && !c.publicado && <Badge tone="warning">Rascunho</Badge>}
              </div>
              <h3 className="mt-3 font-display text-[15px] font-semibold text-ink">
                {c.titulo}
              </h3>
              <p className="mt-1 text-sm text-ink/50">{c.descricao}</p>
              {c.link && (
                <a
                  href={c.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-forest-600 hover:underline"
                >
                  Acessar curso
                </a>
              )}
            </Card>
          ))}
        </div>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
          <h2 className="font-display text-base font-semibold text-ink">Novo curso</h2>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("publicado")} className="h-4 w-4 accent-forest-500" /> Publicado
            </label>
            {erro && <p className="text-sm text-rust-500">{erro}</p>}
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
