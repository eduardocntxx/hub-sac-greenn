import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, Plus, Pencil, Trash2, ExternalLink, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart, corPorFaixa } from "@/components/ui/BarChart";
import {
  fetchUsers,
  fetchReclameAquiCases,
  fetchReclameAquiMetrics,
  upsertReclameAquiCase,
  deleteReclameAquiCase,
} from "@/services/api";
import type { DbReclameAquiCase } from "@/types/database";
import { usePersistedState } from "@/hooks/usePersistedState";

const statusLabel = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  respondida: "Respondida",
  resolvida: "Resolvida",
} as const;

const statusTone = {
  aberta: "danger",
  em_andamento: "warning",
  respondida: "brand",
  resolvida: "success",
} as const;

function diffDias(a: string | null, b: string | null) {
  if (!a || !b) return null;
  return (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24);
}

const caseSchema = z.object({
  consumidor: z.string().min(1, "Informe o consumidor"),
  assunto: z.string().min(1, "Informe o assunto"),
  status: z.enum(["aberta", "em_andamento", "respondida", "resolvida"]),
  responsavel_id: z.string().optional(),
  link_hugme: z.string().url("Informe uma URL válida"),
});

type CaseForm = z.infer<typeof caseSchema>;

function corReputacao(value: number) {
  return corPorFaixa(value, 8, 6);
}

export default function ReclameAqui() {
  const [aba, setAba] = usePersistedState<"dashboard" | "reclamacoes" | "simulador">("reclameAqui:aba", "dashboard");
  const queryClient = useQueryClient();

  const { data: usuarios } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["ra-metrics"],
    queryFn: fetchReclameAquiMetrics,
  });

  const [statusFiltro, setStatusFiltro] = usePersistedState("reclameAqui:statusFiltro", "");
  const [responsavelFiltro, setResponsavelFiltro] = usePersistedState("reclameAqui:responsavelFiltro", "");

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["ra-cases", statusFiltro, responsavelFiltro],
    queryFn: () =>
      fetchReclameAquiCases({
        status: statusFiltro || undefined,
        responsavelId: responsavelFiltro || undefined,
      }),
  });

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<DbReclameAquiCase | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CaseForm>({
    resolver: zodResolver(caseSchema),
  });

  function abrirNova() {
    setEditando(null);
    setErro(null);
    reset({ consumidor: "", assunto: "", status: "aberta", responsavel_id: "", link_hugme: "" });
    setDialogAberto(true);
  }
  function abrirEdicao(c: DbReclameAquiCase) {
    setEditando(c);
    setErro(null);
    reset({
      consumidor: c.consumidor,
      assunto: c.assunto,
      status: c.status,
      responsavel_id: c.responsavel_id ?? "",
      link_hugme: c.link_hugme ?? "",
    });
    setDialogAberto(true);
  }
  async function onSubmit(data: CaseForm) {
    setSalvando(true);
    setErro(null);
    try {
      await upsertReclameAquiCase({
        ...(editando ? { id: editando.id } : {}),
        ...data,
        responsavel_id: data.responsavel_id || null,
        ...(data.status === "resolvida" && !editando?.data_resolucao
          ? { data_resolucao: new Date().toISOString() }
          : {}),
        ...(data.status !== "aberta" && !editando?.data_resposta
          ? { data_resposta: new Date().toISOString() }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["ra-cases"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  async function remover(id: string) {
    try {
      await deleteReclameAquiCase(id);
      await queryClient.invalidateQueries({ queryKey: ["ra-cases"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  const contagens = useMemo(() => {
    const base = { aberta: 0, em_andamento: 0, respondida: 0, resolvida: 0 };
    (cases ?? []).forEach((c) => { base[c.status]++; });
    return base;
  }, [cases]);

  const tempoRespostaMedio = useMemo(() => {
    const vals = (cases ?? [])
      .map((c) => diffDias(c.data_resposta, c.data_abertura))
      .filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [cases]);

  const tempoResolucaoMedio = useMemo(() => {
    const vals = (cases ?? [])
      .map((c) => diffDias(c.data_resolucao, c.data_abertura))
      .filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [cases]);

  const notaAtual = metrics?.[metrics.length - 1]?.nota_reputacao ?? null;
  const serieReputacao = (metrics ?? []).map((m) => ({
    label: new Date(m.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    value: m.nota_reputacao,
    displayValue: m.nota_reputacao.toFixed(1),
  }));

  // Simulador
  const [meta, setMeta] = useState(9);
  const tendencia = useMemo(() => {
    if (!metrics || metrics.length < 2) return null;
    const primeiro = metrics[0];
    const ultimo = metrics[metrics.length - 1];
    const dias = (new Date(ultimo.data).getTime() - new Date(primeiro.data).getTime()) / (1000 * 60 * 60 * 24);
    const variacao = ultimo.nota_reputacao - primeiro.nota_reputacao;
    return dias > 0 ? variacao / dias : null; // pontos por dia
  }, [metrics]);

  const evolucaoNecessaria = notaAtual !== null ? meta - notaAtual : null;
  const estimativaDias =
    tendencia && tendencia > 0 && evolucaoNecessaria !== null && evolucaoNecessaria > 0
      ? Math.ceil(evolucaoNecessaria / tendencia)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">Reclame Aqui</h1>
          <p className="mt-1 text-sm text-ink/60">Reputação, reclamações e simulador de metas.</p>
        </div>
        <SegmentedControl
          options={[["dashboard", "Dashboard"], ["reclamacoes", "Reclamações"], ["simulador", "Simulador"]] as const}
          value={aba}
          onChange={setAba}
        />
      </div>

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      {aba === "dashboard" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Abertas" value={String(contagens.aberta)} />
            <Kpi label="Em andamento" value={String(contagens.em_andamento)} />
            <Kpi label="Respondidas" value={String(contagens.respondida)} />
            <Kpi label="Resolvidas" value={String(contagens.resolvida)} />
            <Kpi label="Tempo médio de resposta" value={tempoRespostaMedio !== null ? `${tempoRespostaMedio.toFixed(1)}d` : "—"} />
            <Kpi label="Tempo médio de resolução" value={tempoResolucaoMedio !== null ? `${tempoResolucaoMedio.toFixed(1)}d` : "—"} />
            <Kpi label="Nota atual" value={loadingMetrics ? "..." : notaAtual?.toFixed(1) ?? "—"} icon={TrendingUp} />
          </div>
          <Card>
            <div className="p-5 pb-0">
              <h2 className="font-display text-sm font-semibold text-ink">Evolução da reputação</h2>
            </div>
            <div className="p-5">
              {serieReputacao.length === 0 ? (
                <p className="text-sm text-ink/50">Sem dados ainda.</p>
              ) : (
                <BarChart data={serieReputacao} getColorClass={corReputacao} height={128} />
              )}
            </div>
          </Card>
        </div>
      )}

      {aba === "reclamacoes" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os status</option>
              {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={responsavelFiltro} onChange={(e) => setResponsavelFiltro(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
              <option value="">Todos os responsáveis</option>
              {(usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <Button onClick={abrirNova} className="ml-auto">
              <Plus size={16} /> Nova reclamação
            </Button>
          </div>

          {loadingCases ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : !cases || cases.length === 0 ? (
            <EmptyState icon={MessageSquareWarning} title="Nenhuma reclamação registrada" description="Assim que houver reclamações, elas aparecem aqui." />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Consumidor</th>
                    <th className="px-4 py-3 font-medium">Assunto</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Abertura</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-t border-sand-line">
                      <td className="px-4 py-3 font-medium text-ink">{c.consumidor}</td>
                      <td className="px-4 py-3 text-ink/70">{c.assunto}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge></td>
                      <td className="px-4 py-3 text-ink/70">{c.responsavel?.nome ?? "—"}</td>
                      <td className="px-4 py-3 text-ink/70">{new Date(c.data_abertura).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {c.link_hugme && (
                            <a href={c.link_hugme} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink">
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <button onClick={() => abrirEdicao(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg hover:text-ink">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => remover(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-rust-500/10 hover:text-rust-500">
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
        </div>
      )}

      {aba === "simulador" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="p-5 pb-0">
              <h2 className="font-display text-sm font-semibold text-ink">Definir meta</h2>
            </div>
            <CardContent>
              <label className="mb-1 block text-xs font-medium text-ink/70">Meta de nota (0–10)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={10}
                value={meta}
                onChange={(e) => setMeta(Number(e.target.value))}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
            </CardContent>
          </Card>
          <Card>
            <div className="p-5 pb-0">
              <h2 className="font-display text-sm font-semibold text-ink">Projeção</h2>
            </div>
            <CardContent className="space-y-2 text-sm">
              <p>Situação atual: <strong>{notaAtual?.toFixed(1) ?? "—"}</strong></p>
              <p>Evolução necessária: <strong>{evolucaoNecessaria !== null ? evolucaoNecessaria.toFixed(1) : "—"}</strong></p>
              <p>
                Estimativa para atingir a meta:{" "}
                <strong>
                  {evolucaoNecessaria !== null && evolucaoNecessaria <= 0
                    ? "meta já atingida"
                    : estimativaDias !== null
                      ? `${estimativaDias} dias`
                      : "sem tendência de crescimento suficiente para estimar"}
                </strong>
              </p>
              <p className="pt-2 text-xs text-ink/40">
                Baseado na tendência linear dos últimos registros de reputação — quanto mais dados históricos, mais precisa a projeção.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
            <h2 className="font-display text-base font-semibold text-ink">
              {editando ? "Editar reclamação" : "Nova reclamação"}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Consumidor</label>
                <input {...register("consumidor")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.consumidor && <p className="mt-1 text-xs text-rust-500">{errors.consumidor.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Assunto</label>
                <input {...register("assunto")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.assunto && <p className="mt-1 text-xs text-rust-500">{errors.assunto.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Link do HugMe</label>
                <input {...register("link_hugme")} placeholder="https://..." className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.link_hugme && <p className="mt-1 text-xs text-rust-500">{errors.link_hugme.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Status</label>
                  <select {...register("status")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                    {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Responsável</label>
                  <select {...register("responsavel_id")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                    <option value="">Sem responsável</option>
                    {(usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
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
