import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gauge, Plus, Pencil, Trash2, Smile, Meh, Frown, TrendingUp, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { PainelCard } from "@/components/ui/PainelCard";
import { CABECALHO_TABELA, LINHA_TABELA, entradaLinha } from "@/components/ui/Tabela";
import { cn } from "@/lib/utils";
import { BarChart } from "@/components/ui/BarChart";
import { fetchNpsResponses, upsertNpsResponse, deleteNpsResponse, fetchSatisfacaoSemanal } from "@/services/api";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AvisoNpsParado, GraficoSatisfacaoSemanal, TabelaSatisfacaoSemanal } from "@/components/SatisfacaoSemanal";
import { janelaSemanal, resumirSemanas } from "@/lib/satisfacaoSemanal";
import { useAuth } from "@/contexts/AuthContext";
import type { DbNpsResponse } from "@/types/database";
import { usePersistedState } from "@/hooks/usePersistedState";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

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
  // Padrão "Este ano": NPS tem pouco volume, e o gráfico é por mês.
  const [preset, setPreset] = usePersistedState<PeriodoPreset>("nps:preset", "ano_atual");
  const [personalizado, setPersonalizado] = usePersistedState("nps:personalizado", { inicio: "", fim: "" });
  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);

  const { data: respostas, isLoading } = useQuery({
    queryKey: ["nps", classificacao, busca, inicio.toISOString(), fim.toISOString()],
    queryFn: () =>
      fetchNpsResponses({
        classificacao: classificacao || undefined,
        busca: busca || undefined,
        inicio,
        fim,
      }),
  });

  // CSAT × NPS por semana (últimas 8, quarta a terça), independente do filtro de período da página: a pergunta é
  // "a satisfação melhorou ou caiu o volume de respostas?", sempre olhando as semanas mais recentes.
  const [tipoSemanal, setTipoSemanal] = usePersistedState<"Produtor" | "todos">("nps:satisfacaoTipo", "Produtor");
  const janela = useMemo(() => janelaSemanal(new Date()), []);
  const { data: satisfacao, isLoading: loadingSatisfacao, error: erroSatisfacao } = useQuery({
    queryKey: ["satisfacao-semanal", tipoSemanal, janela.inicio.toISOString()],
    queryFn: () => fetchSatisfacaoSemanal(janela.inicio, janela.fim, tipoSemanal === "todos" ? undefined : tipoSemanal),
  });
  const semanas = useMemo(() => resumirSemanas(satisfacao ?? []), [satisfacao]);

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
      <CabecalhoPagina
        titulo="NPS"
        subtitulo='Net Promoter Score do time de Suporte. Estrutura pronta para integrações futuras (campo "fonte" e "external_id" já preparados).'
        acoes={
        <>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar comentário/respondente..."
            className="h-9 rounded-lg border border-sand-line bg-sand-surface px-3 text-sm outline-none focus:border-forest-500"
          />
          <select value={classificacao} onChange={(e) => setClassificacao(e.target.value as typeof classificacao)} className="h-9 rounded-lg border border-sand-line bg-sand-surface px-2 text-sm">
            <option value="">Todas as classificações</option>
            <option value="Promotor">Promotor</option>
            <option value="Neutro">Neutro</option>
            <option value="Detrator">Detrator</option>
          </select>
          <DateRangePopover
            preset={preset}
            personalizado={personalizado}
            onChangePreset={setPreset}
            onChangePersonalizado={setPersonalizado}
          />
          <Button onClick={abrirNova}>
            <Plus size={16} /> Nova resposta
          </Button>
        </>
        }
      />

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi indice={0} label="NPS Score" value={stats.score !== null ? String(stats.score) : "—"} icon={Gauge} />
        <Kpi indice={1} icon={Smile} tom="bom" label="Promotores" value={`${stats.promotores} (${stats.total ? Math.round((stats.promotores / stats.total) * 100) : 0}%)`} valueClassName="text-forest-600" />
        <Kpi indice={2} icon={Meh} tom="atencao" label="Neutros" value={`${stats.neutros} (${stats.total ? Math.round((stats.neutros / stats.total) * 100) : 0}%)`} valueClassName="text-amber-600" />
        <Kpi indice={3} icon={Frown} tom="ruim" label="Detratores" value={`${stats.detratores} (${stats.total ? Math.round((stats.detratores / stats.total) * 100) : 0}%)`} valueClassName="text-rust-600" />
      </div>

      <PainelCard indice={0} icone={TrendingUp} titulo="Evolução do NPS por mês">
        {serieMensal.length === 0 ? (
          <p className="text-sm text-ink/50">Sem dados suficientes.</p>
        ) : (
          <BarChart data={serieMensal} getColorClass={corBarraNps} />
        )}
      </PainelCard>

      <PainelCard
        indice={1}
        icone={CalendarRange}
        titulo="CSAT × NPS por semana"
        subtitulo="Últimas semanas, de quarta a terça. CSAT pela semana em que a conversa começou (positiva = nota 4–5, negativa = 1–3); NPS pela data da resposta."
        acao={
          <SegmentedControl
            options={[["Produtor", "Produtores"], ["todos", "Todos os clientes"]] as const}
            value={tipoSemanal}
            onChange={setTipoSemanal}
          />
        }
      >
        <div className="space-y-4">
          {loadingSatisfacao ? (
            <CardSkeleton />
          ) : erroSatisfacao ? (
            <p className="text-sm text-rust-500">Não foi possível carregar a comparação semanal.</p>
          ) : semanas.length === 0 ? (
            <p className="text-sm text-ink/50">Sem dados suficientes.</p>
          ) : (
            <>
              <AvisoNpsParado semanas={semanas} />
              <GraficoSatisfacaoSemanal semanas={semanas} />
              <TabelaSatisfacaoSemanal semanas={semanas} />
              <p className="text-[11px] text-ink/40">
                Enviadas = conversas resolvidas que receberam a pesquisa; respondidas = dessas, as que voltaram com nota;
                positivas/negativas = notas da semana. Semana em andamento ainda recebe avaliações. O Hub só recebe as
                respostas do NPS, não quantas pesquisas foram enviadas.
              </p>
            </>
          )}
        </div>
      </PainelCard>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !respostas || respostas.length === 0 ? (
        <EmptyState icon={Gauge} title="Nenhuma resposta ainda" description="Cadastre a primeira resposta de NPS ou aguarde a integração automática." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className={cn("text-left", CABECALHO_TABELA)}>
              <tr>
                <th className="px-4 py-2.5 font-semibold">Respondente</th>
                <th className="px-4 py-2.5 font-semibold">Nota</th>
                <th className="px-4 py-2.5 font-semibold">Classificação</th>
                <th className="px-4 py-2.5 font-semibold">Fonte</th>
                <th className="px-4 py-2.5 font-semibold">Data</th>
                <th className="px-4 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {respostas.map((r, i) => {
                const Icon = classIcon[r.classificacao];
                return (
                  <motion.tr key={r.id} {...entradaLinha(i)} className={cn("cursor-pointer", LINHA_TABELA)} onClick={() => abrirDetalhe(r)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.respondente ?? "Anônimo"}</p>
                      {r.comentario && <p className="text-xs text-ink/50">{r.comentario}</p>}
                    </td>
                    <td className="px-4 py-3 font-display font-bold tabular-nums text-ink">{r.nota}</td>
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
                  </motion.tr>
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
