import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, Trash2, Coins, Hand } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  fetchMissionProgress,
  fetchAllMissions,
  fetchUsers,
  upsertMission,
  deleteMission,
  claimMission,
  updateMyMissionProgress,
} from "@/services/api";
import type { DbMission } from "@/types/database";

const dificuldadeTone = { facil: "success", media: "warning", dificil: "danger" } as const;
const statusTone = {
  rascunho: "neutral",
  ativa: "success",
  pausada: "warning",
  concluida: "brand",
  expirada: "danger",
} as const;

const missionSchema = z.object({
  titulo: z.string().min(1, "Informe o título"),
  descricao: z.string().optional(),
  categoria: z.string().min(1, "Informe a categoria"),
  dificuldade: z.enum(["facil", "media", "dificil"]),
  moedas: z.coerce.number().int().min(0),
  responsavel_id: z.string().optional(),
  prazo: z.string().min(1, "Informe a data limite"),
});

type MissionForm = z.infer<typeof missionSchema>;

export default function Missoes() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<DbMission | null>(null);
  const [detalhe, setDetalhe] = useState<DbMission | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [assumindo, setAssumindo] = useState<string | null>(null);

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ["mission-progress", user?.id],
    queryFn: () => fetchMissionProgress(user!.id),
    enabled: Boolean(user?.id),
  });

  const { data: todasMissoes, isLoading: loadingTodas } = useQuery({
    queryKey: ["missions", "all"],
    queryFn: fetchAllMissions,
  });

  const { data: usuarios } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MissionForm>({ resolver: zodResolver(missionSchema) });

  function abrirNova() {
    setEditando(null);
    setErro(null);
    reset({
      titulo: "",
      descricao: "",
      categoria: "",
      dificuldade: "media",
      moedas: 10,
      responsavel_id: "",
      prazo: new Date().toISOString().slice(0, 10),
    });
    setDialogAberto(true);
  }

  function abrirEdicao(m: DbMission) {
    setEditando(m);
    setErro(null);
    reset({
      titulo: m.titulo,
      descricao: m.descricao ?? "",
      categoria: m.categoria ?? "",
      dificuldade: m.dificuldade ?? "media",
      moedas: m.moedas,
      responsavel_id: m.responsavel_id ?? "",
      prazo: m.prazo ?? new Date().toISOString().slice(0, 10),
    });
    setDialogAberto(true);
  }

  async function onSubmit(data: MissionForm) {
    setSalvando(true);
    setErro(null);
    try {
      await upsertMission({
        ...(editando ? { id: editando.id } : {}),
        ...data,
        responsavel_id: data.responsavel_id || null,
        // Simplificado: sem campos de unidade/meta/status no formulário —
        // meta padrão vira uma missão "concluir uma vez" (1 unidade genérica).
        ...(editando ? {} : { meta: 1, unidade: "conclusão", status: "ativa", ativo: true }),
      });
      await queryClient.invalidateQueries({ queryKey: ["missions"] });
      await queryClient.invalidateQueries({ queryKey: ["mission-progress"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    try {
      await deleteMission(id);
      await queryClient.invalidateQueries({ queryKey: ["missions"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }

  async function assumir(missionId: string) {
    setAssumindo(missionId);
    setErro(null);
    try {
      await claimMission(missionId);
      await queryClient.invalidateQueries({ queryKey: ["missions"] });
      await queryClient.invalidateQueries({ queryKey: ["mission-progress"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível assumir a missão.");
    } finally {
      setAssumindo(null);
    }
  }

  const minhasMissoes = useMemo(() => progress ?? [], [progress]);
  const missoesDisponiveis = useMemo(
    () => (todasMissoes ?? []).filter((m) => m.ativo && !m.responsavel_id),
    [todasMissoes]
  );

  const moedasGanhas = useMemo(
    () =>
      minhasMissoes
        .filter((p) => p.atual >= (p.missions?.meta ?? 1))
        .reduce((acc, p) => acc + (p.missions?.moedas ?? 0), 0),
    [minhasMissoes]
  );

  const colunas = useMemo(() => {
    const novas = minhasMissoes.filter((p) => p.atual <= 0);
    const emProgresso = minhasMissoes.filter((p) => p.atual > 0 && p.atual < (p.missions?.meta ?? 1));
    const concluidas = minhasMissoes.filter((p) => p.atual >= (p.missions?.meta ?? 1));
    return { novas, emProgresso, concluidas };
  }, [minhasMissoes]);

  async function moverProgresso(missionId: string, atualAlvo: number) {
    setErro(null);
    try {
      await updateMyMissionProgress(missionId, atualAlvo);
      await queryClient.invalidateQueries({ queryKey: ["mission-progress"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mover a missão.");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">Missões</h1>
          <p className="mt-1 text-sm text-ink/60">
            Suas missões ativas, atualizadas em tempo real a partir do banco de dados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="brand" className="gap-1.5 py-1.5 text-[13px]">
            Minhas Moedas: <strong className="font-display">{moedasGanhas}</strong> <Coins size={13} />
          </Badge>
          {isAdmin && (
            <Button onClick={abrirNova}>
              <Plus size={16} /> Nova missão
            </Button>
          )}
        </div>
      </div>

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      <div>
        {loadingProgress ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : minhasMissoes.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhuma missão ativa no momento"
            description="Assuma uma missão disponível abaixo ou aguarde uma nova atribuição."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                { chave: "novas" as const, titulo: "Novas Missões", dot: "bg-amber-500", alvo: () => 0 },
                {
                  chave: "emProgresso" as const,
                  titulo: "Missões em Progresso",
                  dot: "bg-sky-500",
                  alvo: (meta: number) => Math.min(Math.max(1, Math.ceil(meta / 2)), Math.max(meta - 1, 0)) || meta,
                },
                { chave: "concluidas" as const, titulo: "Missões Concluídas", dot: "bg-forest-500", alvo: (meta: number) => meta },
              ]
            ).map((col) => (
              <div
                key={col.chave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const missionId = e.dataTransfer.getData("text/plain");
                  const item = minhasMissoes.find((p) => p.mission_id === missionId);
                  if (!item) return;
                  const meta = item.missions?.meta ?? 1;
                  const jaEstaAqui = colunas[col.chave].some((p) => p.mission_id === missionId);
                  if (jaEstaAqui) return;
                  moverProgresso(missionId, col.alvo(meta));
                }}
                className="rounded-2xl p-1"
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="font-display text-sm font-semibold text-ink">{col.titulo}</h2>
                  <Badge tone="neutral">{colunas[col.chave].length}</Badge>
                </div>
                <div className="min-h-[60px] space-y-3">
                  {colunas[col.chave].length === 0 ? (
                    <p className="text-xs text-ink/40">Arraste uma missão pra cá.</p>
                  ) : (
                    colunas[col.chave].map((p) => {
                      const m = p.missions;
                      return (
                        <Card
                          key={p.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", p.mission_id)}
                          onClick={() => m && setDetalhe(m)}
                          className="cursor-grab p-4 active:cursor-grabbing"
                        >
                          <div className="flex items-start gap-2">
                            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", col.dot)} />
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-semibold text-ink">{m?.titulo}</h3>
                              <p className="mt-0.5 line-clamp-2 text-xs text-ink/50">{m?.descricao}</p>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Missões disponíveis para assumir</h2>
        {loadingTodas ? (
          <p className="text-sm text-ink/50">Carregando...</p>
        ) : missoesDisponiveis.length === 0 ? (
          <p className="text-sm text-ink/50">Nenhuma missão sem responsável no momento.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {missoesDisponiveis.map((m) => (
              <Card key={m.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div className="cursor-pointer" onClick={() => setDetalhe(m)}>
                      <h3 className="font-display text-sm font-semibold text-ink">{m.titulo}</h3>
                      <p className="mt-1 text-sm text-ink/60">{m.descricao}</p>
                    </div>
                    {m.dificuldade && <Badge tone={dificuldadeTone[m.dificuldade]}>{m.dificuldade}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-ink/60"><Coins size={12} /> {m.moedas} moedas</span>
                    </div>
                    <Button size="sm" disabled={assumindo === m.id} onClick={() => assumir(m.id)}>
                      <Hand size={14} /> {assumindo === m.id ? "Assumindo..." : "Assumir"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div>
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">
            Gerenciar todas as missões
          </h2>
          {loadingTodas ? (
            <CardSkeleton />
          ) : !todasMissoes || todasMissoes.length === 0 ? (
            <p className="text-sm text-ink/50">Nenhuma missão cadastrada ainda.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {(["rascunho", "ativa", "pausada", "concluida", "expirada"] as const).map((coluna) => {
                const itens = todasMissoes.filter((m) => m.status === coluna);
                return (
                  <div
                    key={coluna}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      const missao = todasMissoes.find((x) => x.id === id);
                      if (missao && missao.status !== coluna) {
                        await upsertMission({ id, status: coluna });
                        await queryClient.invalidateQueries({ queryKey: ["missions"] });
                      }
                    }}
                    className="rounded-2xl bg-sand-bg/60 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h3 className="font-display text-sm font-semibold capitalize text-ink">{coluna}</h3>
                      <Badge tone="neutral">{itens.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {itens.length === 0 ? (
                        <p className="px-1 text-xs text-ink/40">Nenhuma.</p>
                      ) : (
                        itens.map((m) => (
                          <Card
                            key={m.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
                            onClick={() => abrirEdicao(m)}
                            className="cursor-grab p-3 active:cursor-grabbing"
                          >
                            <p className="text-sm font-medium text-ink">{m.titulo}</p>
                            <p className="mt-1 text-xs text-ink/50">{m.categoria}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-ink/40">{m.responsavel?.nome ?? "Sem responsável"}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remover(m.id);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-ink/40 hover:bg-rust-50 hover:text-rust-600 dark:hover:bg-rust-500/15 dark:hover:text-rust-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)} className="max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-base font-semibold text-ink">
              {editando ? "Editar missão" : "Nova missão"}
            </h2>
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
                  <input {...register("categoria")} placeholder="Ex: Atendimento" className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                  {errors.categoria && <p className="mt-1 text-xs text-rust-500">{errors.categoria.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink/70">Dificuldade</label>
                  <select {...register("dificuldade")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                    <option value="facil">Fácil</option>
                    <option value="media">Média</option>
                    <option value="dificil">Difícil</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Moedas</label>
                <input type="number" {...register("moedas")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Responsável (opcional)</label>
                <select {...register("responsavel_id")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500">
                  <option value="">Sem responsável — fica disponível para qualquer um assumir</option>
                  {(usuarios ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Data limite</label>
                <input type="date" {...register("prazo")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.prazo && <p className="mt-1 text-xs text-rust-500">{errors.prazo.message}</p>}
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
              <h2 className="font-display text-base font-semibold text-ink">{detalhe.titulo}</h2>
              {detalhe.dificuldade && <Badge tone={dificuldadeTone[detalhe.dificuldade]}>{detalhe.dificuldade}</Badge>}
            </div>
            <p className="mt-2 text-sm text-ink/70">{detalhe.descricao}</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/50">Categoria</span><span className="text-ink">{detalhe.categoria ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Responsável</span><span className="text-ink">{detalhe.responsavel?.nome ?? "Sem responsável"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Status</span><Badge tone={statusTone[detalhe.status]}>{detalhe.status}</Badge></div>
              <div className="flex justify-between"><span className="text-ink/50">Prazo</span><span className="text-ink">{detalhe.prazo ? new Date(detalhe.prazo).toLocaleDateString("pt-BR") : "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Recompensa</span><span className="text-ink">{detalhe.moedas} moedas</span></div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setDetalhe(null)}>Fechar</Button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
