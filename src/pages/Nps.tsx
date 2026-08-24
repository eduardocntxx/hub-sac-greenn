import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Plus, Pencil, Trash2, Smile, Meh, Frown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart } from "@/components/ui/BarChart";
import { fetchNpsResponses, upsertNpsResponse, deleteNpsResponse } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import type { DbNpsResponse } from "@/types/database";
import { usePersistedState } from "@/hooks/usePersistedState";

const classTone = { Promotor: "success", Neutro: "warning", Detrator: "danger" } as const;
const classIcon = { Promotor: Smile, Neutro: Meh, Detrator: Frown } as const;

const responseSchema = z.object({
  respondente: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  nota: z.coerce.number().int().min(0).max(10),
  comentario: z.string().optional(),
  fonte: z.string().min(1, "Informe a fonte"),
});

type ResponseForm = z.infer<typeof responseSchema>;

function corBarraNps(value: number) {
  if (value >= 70) return "bg-forest-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-rust-500";
}

export default function Nps() {
  const queryClient = useQueryClient();
  const [classificacao, setClassificacao] = usePersistedState<"" | "Promotor" | "Neutro" | "Detrator">("nps:classificacao", "");
  const [busca, setBusca] = useState("");

  const { data: respostas, isLoading } = useQuery({
    queryKey: ["nps", classificacao, busca],
    queryFn: () =>
      fetchNpsResponses({
        classificacao: classificacao || undefined,
        busca: busca || undefined,
      }),
  });

  const { isAdmin } = useAuth();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<DbNpsResponse | null>(null);
  const [notaInterna, setNotaInterna] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [editando, setEditando] = useState<DbNpsResponse | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ResponseForm>({
    resolver: zodResolver(responseSchema),
  });

  function abrirNova() {
    setEditando(null);
    setErro(null);
    reset({ respondente: "", email: "", nota: 10, comentario: "", fonte: "manual" });
    setDialogAberto(true);
  }
  function abrirEdicao(r: DbNpsResponse) {
    setEditando(r);
    setErro(null);
    reset({
      respondente: r.respondente ?? "",
      email: r.email ?? "",
      nota: r.nota,
      comentario: r.comentario ?? "",
      fonte: r.fonte ?? "manual",
    });
    setDialogAberto(true);
  }
  async function onSubmit(data: ResponseForm) {
    setSalvando(true);
    setErro(null);
    try {
      await upsertNpsResponse({ ...(editando ? { id: editando.id } : {}), ...data });
      await queryClient.invalidateQueries({ queryKey: ["nps"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  async function remover(id: string) {
    try {
      await deleteNpsResponse(id);
      await queryClient.invalidateQueries({ queryKey: ["nps"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  function abrirDetalhe(r: DbNpsResponse) {
    setDetalhe(r);
    setNotaInterna(r.notas_internas ?? "");
  }

  async function salvarNotaInterna() {
    if (!detalhe) return;
    setSalvandoNota(true);
    try {
      await upsertNpsResponse({ id: detalhe.id, notas_internas: notaInterna });
      await queryClient.invalidateQueries({ queryKey: ["nps"] });
      setDetalhe({ ...detalhe, notas_internas: notaInterna });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a nota interna.");
    } finally {
      setSalvandoNota(false);
    }
  }

  const stats = useMemo(() => {
    const total = respostas?.length ?? 0;
    const promotores = (respostas ?? []).filter((r) => r.classificacao === "Promotor").length;
    const neutros = (respostas ?? []).filter((r) => r.classificacao === "Neutro").length;
    const detratores = (respostas ?? []).filter((r) => r.classificacao === "Detrator").length;
    const score = total ? Math.round(((promotores - detratores) / total) * 100) : null;
    return { total, promotores, neutros, detratores, score };
  }, [respostas]);

  const serieMensal = useMemo(() => {
    const grupos = new Map<string, { promotores: number; detratores: number; total: number }>();
    (respostas ?? []).forEach((r) => {
      const mes = r.data_resposta.slice(0, 7);
      const g = grupos.get(mes) ?? { promotores: 0, detratores: 0, total: 0 };
      g.total++;
      if (r.classificacao === "Promotor") g.promotores++;
      if (r.classificacao === "Detrator") g.detratores++;
      grupos.set(mes, g);
    });
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, g]) => {
        const value = Math.round(((g.promotores - g.detratores) / g.total) * 100);
        return { label: mes.slice(5), value, displayValue: `${value}%` };
      });
  }, [respostas]);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">NPS</h1>
          <p className="mt-1 text-sm text-ink/60">
            Net Promoter Score do time de Suporte. Estrutura pronta para integrações futuras (campo "fonte" e "external_id" já preparados).
          </p>
        </div>
        <Button onClick={abrirNova}>
          <Plus size={16} /> Nova resposta
        </Button>
      </div>

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="NPS Score" value={stats.score !== null ? String(stats.score) : "—"} icon={Gauge} />
        <Kpi label="Promotores" value={`${stats.promotores} (${stats.total ? Math.round((stats.promotores / stats.total) * 100) : 0}%)`} valueClassName="text-forest-600" />
        <Kpi label="Neutros" value={`${stats.neutros} (${stats.total ? Math.round((stats.neutros / stats.total) * 100) : 0}%)`} valueClassName="text-amber-600" />
        <Kpi label="Detratores" value={`${stats.detratores} (${stats.total ? Math.round((stats.detratores / stats.total) * 100) : 0}%)`} valueClassName="text-rust-600" />
      </div>

      <Card>
        <div className="p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">Evolução do NPS por mês</h2>
        </div>
        <div className="p-5">
          {serieMensal.length === 0 ? (
            <p className="text-sm text-ink/50">Sem dados suficientes.</p>
          ) : (
            <BarChart data={serieMensal} getColorClass={corBarraNps} />
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar comentário/respondente..."
          className="h-9 rounded-lg border border-sand-line bg-white px-3 text-sm outline-none focus:border-forest-500"
        />
        <select value={classificacao} onChange={(e) => setClassificacao(e.target.value as typeof classificacao)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todas as classificações</option>
          <option value="Promotor">Promotor</option>
          <option value="Neutro">Neutro</option>
          <option value="Detrator">Detrator</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !respostas || respostas.length === 0 ? (
        <EmptyState icon={Gauge} title="Nenhuma resposta ainda" description="Cadastre a primeira resposta de NPS ou aguarde a integração automática." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-medium">Respondente</th>
                <th className="px-4 py-3 font-medium">Nota</th>
                <th className="px-4 py-3 font-medium">Classificação</th>
                <th className="px-4 py-3 font-medium">Fonte</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {respostas.map((r) => {
                const Icon = classIcon[r.classificacao];
                return (
                  <tr key={r.id} className="cursor-pointer border-t border-sand-line hover:bg-sand-bg/50" onClick={() => abrirDetalhe(r)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.respondente ?? "Anônimo"}</p>
                      {r.comentario && <p className="text-xs text-ink/50">{r.comentario}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink">{r.nota}</td>
                    <td className="px-4 py-3">
                      <Badge tone={classTone[r.classificacao]} className="gap-1">
                        <Icon size={11} /> {r.classificacao}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{r.fonte}</td>
                    <td className="px-4 py-3 text-ink/70">{new Date(r.data_resposta).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => abrirEdicao(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => remover(r.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
            <h2 className="font-display text-base font-semibold text-ink">
              {editando ? "Editar resposta" : "Nova resposta"}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Respondente</label>
                <input {...register("respondente")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Email</label>
                <input {...register("email")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.email && <p className="mt-1 text-xs text-rust-500">{errors.email.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Nota (0–10)</label>
                  <input type="number" min={0} max={10} {...register("nota")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.nota && <p className="mt-1 text-xs text-rust-500">{errors.nota.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Fonte</label>
                  <input {...register("fonte")} placeholder="manual, email, in_app..." className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.fonte && <p className="mt-1 text-xs text-rust-500">{errors.fonte.message}</p>}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Comentário</label>
                <textarea {...register("comentario")} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
        </Dialog>
      )}

      {detalhe && (
        <Dialog onClose={() => setDetalhe(null)}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-ink">
                {detalhe.respondente ?? "Anônimo"}
              </h2>
              <Badge tone={classTone[detalhe.classificacao]} className="gap-1">
                {detalhe.classificacao}
              </Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/50">Nota</span><span className="text-ink">{detalhe.nota}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Email</span><span className="text-ink">{detalhe.email ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Fonte</span><span className="text-ink">{detalhe.fonte ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Data</span><span className="text-ink">{new Date(detalhe.data_resposta).toLocaleDateString("pt-BR")}</span></div>
              {detalhe.comentario && (
                <div>
                  <span className="text-ink/50">Comentário</span>
                  <p className="mt-1 text-ink/80">{detalhe.comentario}</p>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="mt-5 border-t border-sand-line pt-4">
                <label className="mb-1 block text-xs font-medium text-ink/70">
                  Notas internas (visível apenas para administradores)
                </label>
                <textarea
                  value={notaInterna}
                  onChange={(e) => setNotaInterna(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
                  placeholder="Registre observações internas sobre esta resposta..."
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={salvarNotaInterna} disabled={salvandoNota}>
                    {salvandoNota ? "Salvando..." : "Salvar nota"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setDetalhe(null)}>Fechar</Button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
