import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Link2 as Link2Icon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchAllTools, upsertTool, deleteTool, uploadToolImage } from "@/services/api";
import { DynamicIcon, ICONES_SUGERIDOS } from "@/lib/dynamicIcon";
import type { DbTool } from "@/types/database";

const CATEGORIAS = [
  "Atendimento",
  "Relatórios",
  "Desenvolvimento",
  "Comercial",
  "RH",
  "Documentação",
  "IA",
  "Utilidades",
] as const;

const toolSchema = z.object({
  nome: z.string().min(1, "Informe o nome"),
  descricao: z.string().optional(),
  categoria: z.enum(CATEGORIAS),
  icone: z.string().min(1, "Informe um ícone"),
  icone_url: z.string().optional(),
  url: z.string().url("Informe uma URL válida"),
  abrir_nova_guia: z.boolean(),
  ordem: z.coerce.number().int().min(0),
  imagem_url: z.string().optional(),
  ativo: z.boolean(),
});

type ToolForm = z.infer<typeof toolSchema>;

export default function AdminOutrosLinks() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<DbTool | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [origemImagem, setOrigemImagem] = useState<"url" | "upload">("url");
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [origemIcone, setOrigemIcone] = useState<"lucide" | "upload">("lucide");
  const [arquivoIcone, setArquivoIcone] = useState<File | null>(null);

  const { data: tools, isLoading } = useQuery({
    queryKey: ["tools", "admin"],
    queryFn: fetchAllTools,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ToolForm>({ resolver: zodResolver(toolSchema) });

  const iconeAtual = watch("icone");

  function abrirNovo() {
    setEditando(null);
    setErro(null);
    setOrigemImagem("url");
    setArquivoImagem(null);
    setOrigemIcone("lucide");
    setArquivoIcone(null);
    reset({
      nome: "",
      descricao: "",
      categoria: "Utilidades",
      icone: "Link2",
      icone_url: "",
      url: "",
      abrir_nova_guia: true,
      ordem: (tools?.length ?? 0) + 1,
      imagem_url: "",
      ativo: true,
    });
    setDialogAberto(true);
  }

  function abrirEdicao(t: DbTool) {
    setEditando(t);
    setErro(null);
    setOrigemImagem("url");
    setArquivoImagem(null);
    setOrigemIcone(t.icone_url ? "upload" : "lucide");
    setArquivoIcone(null);
    reset({
      nome: t.nome,
      descricao: t.descricao ?? "",
      categoria: (t.categoria as (typeof CATEGORIAS)[number]) ?? "Utilidades",
      icone: t.icone ?? "Link2",
      icone_url: t.icone_url ?? "",
      url: t.url ?? "",
      abrir_nova_guia: t.abrir_nova_guia,
      ordem: t.ordem,
      imagem_url: t.imagem_url ?? "",
      ativo: t.ativo,
    });
    setDialogAberto(true);
  }

  async function onSubmit(data: ToolForm) {
    setSalvando(true);
    setErro(null);
    try {
      let imagemUrlFinal = data.imagem_url;
      if (origemImagem === "upload" && arquivoImagem) {
        imagemUrlFinal = await uploadToolImage(arquivoImagem);
      }
      let iconeUrlFinal = origemIcone === "upload" ? data.icone_url : "";
      if (origemIcone === "upload" && arquivoIcone) {
        iconeUrlFinal = await uploadToolImage(arquivoIcone);
      }
      await upsertTool({
        ...(editando ? { id: editando.id } : {}),
        ...data,
        imagem_url: imagemUrlFinal || null,
        icone_url: iconeUrlFinal || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["tools"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    try {
      await deleteTool(id);
      await queryClient.invalidateQueries({ queryKey: ["tools"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  const filtrados = useMemo(
    () =>
      (tools ?? []).filter(
        (t) =>
          t.nome.toLowerCase().includes(busca.toLowerCase()) ||
          (t.categoria ?? "").toLowerCase().includes(busca.toLowerCase())
      ),
    [tools, busca]
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
            placeholder="Buscar por nome ou categoria..."
            className="h-10 w-full rounded-xl border border-sand-line bg-sand-surface pl-9 pr-3 text-sm outline-none focus:border-forest-500"
          />
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={16} /> Novo link
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
          icon={Link2Icon}
          title="Nenhum link encontrado"
          description="Ajuste a busca ou cadastre um novo link."
          action={<Button onClick={abrirNovo}>Novo link</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-medium">Link</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Ordem</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => (
                <tr key={t.id} className="border-t border-sand-line">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-forest-50 text-forest-600 dark:bg-forest-500/15 dark:text-forest-300">
                        {t.icone_url ? (
                          <img src={t.icone_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <DynamicIcon name={t.icone ?? undefined} size={15} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-ink">{t.nome}</p>
                        <p className="text-xs text-ink/50">{t.url}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{t.categoria}</td>
                  <td className="px-4 py-3 text-ink/70">{t.ordem}</td>
                  <td className="px-4 py-3">
                    <Badge tone={t.ativo ? "success" : "neutral"}>
                      {t.ativo ? "ativo" : "inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirEdicao(t)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => remover(t.id)}
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
              {editando ? "Editar link" : "Novo link"}
            </h2>
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
                <label className="mb-1 block text-xs font-medium text-ink/70">Descrição</label>
                <input
                  {...register("descricao")}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">URL</label>
                <input
                  {...register("url")}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                />
                {errors.url && <p className="mt-1 text-xs text-rust-500">{errors.url.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Categoria</label>
                  <select
                    {...register("categoria")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Ordem</label>
                  <input
                    type="number"
                    {...register("ordem")}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-ink/70">Ícone</label>
                  <div className="flex gap-1 rounded-lg bg-sand-bg p-0.5">
                    <button
                      type="button"
                      onClick={() => setOrigemIcone("lucide")}
                      className={"rounded-md px-2 py-0.5 text-xs font-medium " + (origemIcone === "lucide" ? "bg-sand-surface shadow-sm text-ink" : "text-ink/50")}
                    >
                      Biblioteca
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrigemIcone("upload")}
                      className={"rounded-md px-2 py-0.5 text-xs font-medium " + (origemIcone === "upload" ? "bg-sand-surface shadow-sm text-ink" : "text-ink/50")}
                    >
                      Upload
                    </button>
                  </div>
                </div>
                {origemIcone === "lucide" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sand-line">
                      <DynamicIcon name={iconeAtual} size={16} />
                    </div>
                    <input
                      {...register("icone")}
                      list="icones-sugeridos"
                      className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                    />
                    <datalist id="icones-sugeridos">
                      {ICONES_SUGERIDOS.map((i) => (
                        <option key={i} value={i} />
                      ))}
                    </datalist>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sand-line">
                      {arquivoIcone ? (
                        <img src={URL.createObjectURL(arquivoIcone)} alt="" className="h-full w-full object-cover" />
                      ) : editando?.icone_url ? (
                        <img src={editando.icone_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <DynamicIcon name={undefined} size={16} />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setArquivoIcone(e.target.files?.[0] ?? null)}
                      className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none file:mr-2 file:rounded-md file:border-0 file:bg-forest-50 file:px-2 file:py-1 file:text-xs file:text-forest-700 dark:file:bg-forest-500/15 dark:file:text-forest-300"
                    />
                  </div>
                )}
                {errors.icone && <p className="mt-1 text-xs text-rust-500">{errors.icone.message}</p>}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-ink/70">Imagem do card (opcional)</label>
                  <div className="flex gap-1 rounded-lg bg-sand-bg p-0.5">
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("url")}
                      className={"rounded-md px-2 py-0.5 text-xs font-medium " + (origemImagem === "url" ? "bg-sand-surface shadow-sm text-ink" : "text-ink/50")}
                    >
                      URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrigemImagem("upload")}
                      className={"rounded-md px-2 py-0.5 text-xs font-medium " + (origemImagem === "upload" ? "bg-sand-surface shadow-sm text-ink" : "text-ink/50")}
                    >
                      Upload
                    </button>
                  </div>
                </div>
                {origemImagem === "url" ? (
                  <input
                    {...register("imagem_url")}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  />
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setArquivoImagem(e.target.files?.[0] ?? null)}
                    className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none file:mr-2 file:rounded-md file:border-0 file:bg-forest-50 file:px-2 file:py-1 file:text-xs file:text-forest-700 dark:file:bg-forest-500/15 dark:file:text-forest-300"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("abrir_nova_guia")} className="h-4 w-4 accent-forest-500" />
                  Abrir em nova guia
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register("ativo")} className="h-4 w-4 accent-forest-500" />
                  Ativo
                </label>
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
