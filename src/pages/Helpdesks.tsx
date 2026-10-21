import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus, ExternalLink, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoPagina } from "@/components/ui/CabecalhoPagina";
import { SecaoHead } from "@/components/ui/SecaoHead";
import { Entrada } from "@/components/ui/Entrada";
import { ChipIcone } from "@/components/ui/Indicador";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeHelpdesks } from "@/hooks/useRealtimeHelpdesks";
import {
  fetchHelpdesks,
  requestHelpdesk,
  updateHelpdeskStatus,
  deleteHelpdesk,
  HELPDESK_LINK_PREFIX,
} from "@/services/api";
import type { DbHelpdesk } from "@/types/database";

const statusLabel: Record<DbHelpdesk["status"], string> = {
  solicitando: "Solicitando",
  pendente: "Pendente",
  finalizado: "Finalizado",
};
const COLUNAS: DbHelpdesk["status"][] = ["solicitando", "pendente", "finalizado"];

const requestSchema = z.object({
  nome: z.string().min(1, "Informe o nome do Helpdesk"),
  descricao: z.string().min(1, "Informe a descrição"),
});
type RequestForm = z.infer<typeof requestSchema>;

export default function Helpdesks() {
  useRealtimeHelpdesks();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const podeGerenciar = isAdmin || hasPermission("helpdesks");
  const queryClient = useQueryClient();

  const [dialogAberto, setDialogAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<DbHelpdesk | null>(null);
  const [linkParaFinalizar, setLinkParaFinalizar] = useState<{ h: DbHelpdesk; link: string } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const { data: helpdesks, isLoading } = useQuery({ queryKey: ["helpdesks"], queryFn: fetchHelpdesks });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RequestForm>({ resolver: zodResolver(requestSchema) });

  function abrirSolicitacao() {
    setErro(null);
    reset({ nome: "", descricao: "" });
    setDialogAberto(true);
  }

  async function onSubmit(data: RequestForm) {
    if (!user) return;
    setSalvando(true);
    setErro(null);
    try {
      await requestHelpdesk({ ...data, created_by: user.id });
      await queryClient.invalidateQueries({ queryKey: ["helpdesks"] });
      setDialogAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a solicitação.");
    } finally {
      setSalvando(false);
    }
  }

  async function moverPara(h: DbHelpdesk, novoStatus: DbHelpdesk["status"]) {
    if (!user) return;
    if (novoStatus === "finalizado" && !h.link) {
      setLinkParaFinalizar({ h, link: HELPDESK_LINK_PREFIX });
      return;
    }
    setErro(null);
    try {
      const aprovarAgora = !h.approved_by;
      await updateHelpdeskStatus(h.id, novoStatus, aprovarAgora ? user.id : undefined);
      await queryClient.invalidateQueries({ queryKey: ["helpdesks"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mover a solicitação.");
    }
  }

  async function confirmarFinalizacao() {
    if (!linkParaFinalizar || !user) return;
    if (!linkParaFinalizar.link.startsWith(HELPDESK_LINK_PREFIX)) {
      setErro(`O link deve seguir o padrão oficial: ${HELPDESK_LINK_PREFIX}`);
      return;
    }
    setErro(null);
    try {
      await updateHelpdeskStatus(
        linkParaFinalizar.h.id,
        "finalizado",
        linkParaFinalizar.h.approved_by ? undefined : user.id,
        linkParaFinalizar.link
      );
      await queryClient.invalidateQueries({ queryKey: ["helpdesks"] });
      setLinkParaFinalizar(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível finalizar.");
    }
  }

  async function remover(h: DbHelpdesk) {
    if (!confirm(`Excluir a solicitação "${h.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErro(null);
    try {
      await deleteHelpdesk(h.id);
      await queryClient.invalidateQueries({ queryKey: ["helpdesks"] });
      setDetalhe(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  const finalizados = useMemo(() => (helpdesks ?? []).filter((h) => h.status === "finalizado"), [helpdesks]);
  const minhas = useMemo(
    () => (helpdesks ?? []).filter((h) => h.created_by === user?.id && h.status !== "finalizado"),
    [helpdesks, user]
  );

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Helpdesks"
        subtitulo="Central de Helpdesks Greenn e solicitações de novos."
        acoes={
          <Button onClick={abrirSolicitacao}>
            <Plus size={16} /> Solicitar novo Helpdesk
          </Button>
        }
      />

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      {podeGerenciar ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUNAS.map((coluna) => {
            const itens = (helpdesks ?? []).filter((h) => h.status === coluna);
            return (
              <div
                key={coluna}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  const h = (helpdesks ?? []).find((x) => x.id === id);
                  if (h && h.status !== coluna) moverPara(h, coluna);
                  setArrastando(null);
                }}
                className="rounded-2xl bg-sand-subtle/60 p-3 ring-1 ring-sand-line"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="font-display text-[13.5px] font-bold text-ink">{statusLabel[coluna]}</h2>
                  <Badge tone="neutral">{itens.length}</Badge>
                </div>
                <div className="space-y-2">
                  {isLoading ? (
                    <CardSkeleton />
                  ) : itens.length === 0 ? (
                    <p className="px-1 text-xs text-ink/40">Nenhum item.</p>
                  ) : (
                    itens.map((h, i) => (
                      <Entrada key={h.id} indice={i}>
                      <Card
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", h.id);
                          setArrastando(h.id);
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={() => setDetalhe(h)}
                        className={cn(
                          "cursor-grab p-3 transition-[opacity,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:ring-1 hover:ring-forest-500/40 active:cursor-grabbing",
                          arrastando === h.id && "rotate-1 opacity-50"
                        )}
                      >
                        <p className="text-[13.5px] font-bold text-ink">{h.nome}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-ink/50">{h.descricao}</p>
                        <p className="mt-2 text-xs text-ink/40">{h.solicitante?.nome ?? "—"}</p>
                      </Card>
                      </Entrada>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div>
            <SecaoHead titulo="Helpdesks disponíveis" subtitulo="Clique para ver o detalhe." />
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : finalizados.length === 0 ? (
              <EmptyState icon={Wrench} title="Nenhum Helpdesk disponível ainda" description="Assim que uma solicitação for finalizada, ela aparece aqui." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {finalizados.map((h, i) => (
                  <Entrada key={h.id} indice={i} elevar className="h-full">
                  <Card className="group h-full cursor-pointer p-5 hover:ring-1 hover:ring-forest-500/40" onClick={() => setDetalhe(h)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <ChipIcone icone={Wrench} className="transition-transform duration-200 group-hover:scale-110" />
                        <h3 className="font-display text-[13.5px] font-bold text-ink">{h.nome}</h3>
                      </div>
                      {h.link && (
                        <a href={h.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={14} className="text-ink/30 hover:text-forest-600" />
                        </a>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-ink/60">{h.descricao}</p>
                  </Card>
                  </Entrada>
                ))}
              </div>
            )}
          </div>

          {minhas.length > 0 && (
            <div>
              <SecaoHead titulo="Minhas solicitações" />
              <div className="space-y-2">
                {minhas.map((h, i) => (
                  <Entrada key={h.id} indice={i} elevar>
                  <Card className="cursor-pointer p-4 hover:ring-1 hover:ring-forest-500/40" onClick={() => setDetalhe(h)}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-bold text-ink">{h.nome}</span>
                      <Badge tone="warning">{statusLabel[h.status]}</Badge>
                    </div>
                  </Card>
                  </Entrada>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {dialogAberto && (
        <Dialog onClose={() => setDialogAberto(false)}>
            <h2 className="font-display text-base font-semibold text-ink">Solicitar novo Helpdesk</h2>
            <p className="mt-1 text-xs text-ink/50">
              O link será definido pelo administrador apenas na finalização.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Nome do Helpdesk</label>
                <input {...register("nome")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.nome && <p className="mt-1 text-xs text-rust-500">{errors.nome.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Descrição</label>
                <textarea {...register("descricao")} rows={3} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500" />
                {errors.descricao && <p className="mt-1 text-xs text-rust-500">{errors.descricao.message}</p>}
              </div>
              {erro && <p className="text-sm text-rust-500">{erro}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogAberto(false)}>Cancelar</Button>
                <Button type="submit" disabled={salvando}>{salvando ? "Enviando..." : "Enviar solicitação"}</Button>
              </div>
            </form>
        </Dialog>
      )}

      {linkParaFinalizar && (
        <Dialog onClose={() => { setLinkParaFinalizar(null); setErro(null); }}>
            <h2 className="font-display text-base font-semibold text-ink">Finalizar Helpdesk</h2>
            <p className="mt-1 text-xs text-ink/50">
              Informe o link oficial para concluir "{linkParaFinalizar.h.nome}".
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-ink/70">Link</label>
              <input
                value={linkParaFinalizar.link}
                onChange={(e) => setLinkParaFinalizar({ ...linkParaFinalizar, link: e.target.value })}
                className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm outline-none focus:border-forest-500"
              />
              <p className="mt-1 text-xs text-ink/40">Deve começar com {HELPDESK_LINK_PREFIX}</p>
              {erro && <p className="mt-1 text-xs text-rust-500">{erro}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setLinkParaFinalizar(null); setErro(null); }}>Cancelar</Button>
              <Button onClick={confirmarFinalizacao}>Finalizar</Button>
            </div>
        </Dialog>
      )}

      {detalhe && (
        <Dialog onClose={() => setDetalhe(null)}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-ink">{detalhe.nome}</h2>
              <Badge tone="neutral">{statusLabel[detalhe.status]}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink/70">{detalhe.descricao}</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink/50">Solicitante</span><span className="text-ink">{detalhe.solicitante?.nome ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Aprovador</span><span className="text-ink">{detalhe.aprovador?.nome ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-ink/50">Solicitado em</span><span className="text-ink">{new Date(detalhe.created_at).toLocaleDateString("pt-BR")}</span></div>
              {detalhe.link && (
                <div className="flex justify-between">
                  <span className="text-ink/50">Link</span>
                  <a href={detalhe.link} target="_blank" rel="noreferrer" className="text-forest-600 hover:underline">Abrir</a>
                </div>
              )}
            </div>
            {podeGerenciar && detalhe.status !== "finalizado" && (
              <div className="mt-5 flex flex-wrap gap-2">
                {COLUNAS.filter((c) => c !== detalhe.status).map((c) => (
                  <Button key={c} size="sm" variant="secondary" onClick={() => { moverPara(detalhe, c); setDetalhe(null); }}>
                    Mover para {statusLabel[c]}
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between">
              {podeGerenciar ? (
                <button
                  onClick={() => remover(detalhe)}
                  className="flex items-center gap-1.5 text-xs font-medium text-rust-500 hover:underline"
                >
                  <Trash2 size={13} /> Excluir
                </button>
              ) : <span />}
              <Button variant="secondary" onClick={() => setDetalhe(null)}>Fechar</Button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
