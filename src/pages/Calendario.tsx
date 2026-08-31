import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, Clock, Palmtree,
  X, Check, Trash2, Plus, AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeCalendario } from "@/hooks/useRealtimeCalendario";
import {
  fetchHolidays, fetchNextHoliday, fetchWeekResponsibles, upsertWeekResponsible,
  fetchSaturdayOncall, upsertSaturdayOncall, fetchLeaveRequests, fetchPendingLeaveRequests,
  requestLeave, decideLeaveRequest, fetchOncall, createOncall, fetchVacations, createVacation,
  fetchDayEntries, createDayEntry, limparDia, fetchUsers,
} from "@/services/api";
import { buildMonthGrid, toISODate, mondayOf, MESES, DIAS_SEMANA_CURTO, formatDiaCompleto } from "@/lib/calendarUtils";

const leaveSchema = z.object({
  tipo: z.enum(["folga", "banco_horas", "compensacao", "outro"]),
  motivo: z.string().min(1, "Informe o motivo"),
  observacao: z.string().optional(),
});
type LeaveForm = z.infer<typeof leaveSchema>;

function emojiFeriado(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("natal")) return "🎅";
  if (n.includes("páscoa") || n.includes("pascoa")) return "🥚";
  if (n.includes("sexta-feira santa") || n.includes("sexta feira santa")) return "✝️";
  if (n.includes("carnaval")) return "🎭";
  if (n.includes("confraterniza")) return "🎉";
  if (n.includes("trabalho")) return "🛠️";
  if (n.includes("independ")) return "🎆";
  if (n.includes("aparecida")) return "🙏";
  if (n.includes("finados")) return "🕯️";
  if (n.includes("república") || n.includes("republica")) return "🏛️";
  if (n.includes("consciência negra") || n.includes("consciencia negra")) return "✊🏿";
  if (n.includes("corpus christi")) return "⛪";
  if (n.includes("tiradentes")) return "⚔️";
  return "🇧🇷";
}

const oncallSchema = z.object({
  user_id: z.string().min(1, "Selecione um colaborador"),
  horario_inicio: z.string().min(1),
  horario_fim: z.string().min(1),
  observacao: z.string().optional(),
});
type OncallForm = z.infer<typeof oncallSchema>;

export default function Calendario() {
  useRealtimeCalendario();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const hoje = new Date();
  const [mesRef, setMesRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);
  const [dialogFolga, setDialogFolga] = useState(false);
  const [dialogSobreaviso, setDialogSobreaviso] = useState(false);
  const [dialogFerias, setDialogFerias] = useState(false);
  const [dialogLancamento, setDialogLancamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(mesRef.getFullYear(), mesRef.getMonth()), [mesRef]);
  const inicioGrid = toISODate(grid[0][0]);
  const fimGrid = toISODate(grid[grid.length - 1][6]);

  const { data: holidays, isLoading: loadingHolidays } = useQuery({
    queryKey: ["calendario", "holidays", inicioGrid, fimGrid],
    queryFn: () => fetchHolidays(inicioGrid, fimGrid),
  });
  const { data: proximoFeriado } = useQuery({
    queryKey: ["calendario", "proximo-feriado"],
    queryFn: () => fetchNextHoliday(toISODate(hoje)),
  });
  const { data: weekResp } = useQuery({
    queryKey: ["calendario", "week-resp", inicioGrid, fimGrid],
    queryFn: () => fetchWeekResponsibles(inicioGrid, fimGrid),
  });
  const { data: satOncall } = useQuery({
    queryKey: ["calendario", "sat-oncall", inicioGrid, fimGrid],
    queryFn: () => fetchSaturdayOncall(inicioGrid, fimGrid),
  });
  const { data: leaves } = useQuery({
    queryKey: ["calendario", "leaves", inicioGrid, fimGrid],
    queryFn: () => fetchLeaveRequests(inicioGrid, fimGrid),
  });
  const { data: pendentes } = useQuery({
    queryKey: ["calendario", "pendentes"],
    queryFn: fetchPendingLeaveRequests,
    enabled: isAdmin,
  });
  const { data: oncalls } = useQuery({
    queryKey: ["calendario", "oncall", inicioGrid, fimGrid],
    queryFn: () => fetchOncall(inicioGrid, fimGrid),
  });
  const { data: ferias } = useQuery({
    queryKey: ["calendario", "ferias", inicioGrid, fimGrid],
    queryFn: () => fetchVacations(inicioGrid, fimGrid),
  });
  const { data: lancamentos } = useQuery({
    queryKey: ["calendario", "entries", inicioGrid, fimGrid],
    queryFn: () => fetchDayEntries(inicioGrid, fimGrid),
  });
  const { data: usuarios } = useQuery({ queryKey: ["users"], queryFn: fetchUsers, enabled: isAdmin });
  // Responsável de semana/sábado/sobreaviso/férias só faz sentido pra quem
  // ainda está no time — fetchUsers() é compartilhada e traz todo mundo
  // (inclusive inativos, ex: Brenda) porque a Administração precisa listar
  // todos; aqui filtramos antes de oferecer nos seletores de escala.
  const usuariosAtivos = useMemo(() => (usuarios ?? []).filter((u) => u.ativo), [usuarios]);

  const semanaAtualInicio = toISODate(mondayOf(hoje));
  const responsavelSemanaAtual = weekResp?.find((w) => w.semana_inicio === semanaAtualInicio);

  const folgasNoMes = (leaves ?? []).filter((l) => l.data >= toISODate(new Date(mesRef.getFullYear(), mesRef.getMonth(), 1)));
  const pendentesCount = folgasNoMes.filter((l) => l.status === "pendente").length;
  const feriasNoMes = (ferias ?? []).length;

  function infoDia(data: Date) {
    const iso = toISODate(data);
    const holiday = holidays?.find((h) => h.data === iso);
    const isSabado = data.getDay() === 6;
    const isDomingo = data.getDay() === 0;
    const responsavelSemana = !isSabado && !isDomingo ? weekResp?.find((w) => w.semana_inicio === toISODate(mondayOf(data))) : undefined;
    const oncallSabado = isSabado ? satOncall?.find((s) => s.data === iso) : undefined;
    const folgasDoDia = (leaves ?? []).filter((l) => l.data === iso);
    const sobreavisoDoDia = (oncalls ?? []).filter((o) => o.data === iso);
    const feriasDoDia = (ferias ?? []).filter((f) => f.data_inicio <= iso && f.data_fim >= iso);
    const lancamentosDoDia = (lancamentos ?? []).filter((l) => l.data === iso);
    return { iso, holiday, isSabado, isDomingo, responsavelSemana, oncallSabado, folgasDoDia, sobreavisoDoDia, feriasDoDia, lancamentosDoDia };
  }

  function descricaoDoTipo(info: ReturnType<typeof infoDia>) {
    if (info.holiday) return `Feriado Nacional — ${info.holiday.nome}.`;
    if (info.isSabado) return info.oncallSabado ? "Sábado de plantão." : "Sábado sem plantão definido.";
    if (info.isDomingo) return "Domingo.";
    return "Dia útil liberado para marcação de folga e responsável.";
  }

  async function solicitarFolga(data: LeaveForm) {
    if (!diaSelecionado || !user) return;
    setErro(null);
    try {
      await requestLeave({ user_id: user.id, data: toISODate(diaSelecionado), ...data });
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setDialogFolga(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a solicitação.");
    }
  }

  async function decidir(id: string, status: "aprovada" | "reprovada") {
    if (!user) return;
    try {
      await decideLeaveRequest(id, status, user.id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível decidir.");
    }
  }

  async function definirResponsavelSemana(userId: string) {
    if (!diaSelecionado || !user) return;
    try {
      await upsertWeekResponsible(toISODate(mondayOf(diaSelecionado)), userId, user.id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível definir o responsável.");
    }
  }

  async function definirPlantaoSabado(userId: string) {
    if (!diaSelecionado || !user) return;
    try {
      await upsertSaturdayOncall({ data: toISODate(diaSelecionado), user_id: userId, created_by: user.id });
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível definir o plantão.");
    }
  }

  const {
    register: registerFolga,
    handleSubmit: handleSubmitFolga,
    reset: resetFolga,
    formState: { errors: errorsFolga },
  } = useForm<LeaveForm>({ resolver: zodResolver(leaveSchema), defaultValues: { tipo: "folga" } });

  const {
    register: registerOncall,
    handleSubmit: handleSubmitOncall,
    reset: resetOncall,
    formState: { errors: errorsOncall },
  } = useForm<OncallForm>({ resolver: zodResolver(oncallSchema) });

  async function salvarSobreaviso(data: OncallForm) {
    if (!diaSelecionado || !user) return;
    try {
      await createOncall({ data: toISODate(diaSelecionado), ...data, created_by: user.id });
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setDialogSobreaviso(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o sobreaviso.");
    }
  }

  async function apagarDia() {
    if (!diaSelecionado) return;
    if (!confirm("Limpar todos os registros deste dia? Essa ação não pode ser desfeita.")) return;
    try {
      await limparDia(toISODate(diaSelecionado));
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setDiaSelecionado(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível limpar o dia.");
    }
  }

  const infoSelecionado = diaSelecionado ? infoDia(diaSelecionado) : null;

  // Total de horas previstas do dia, com base na jornada do responsável
  function totalHorasDia(info: ReturnType<typeof infoDia> | null) {
    if (!info) return "0h 00min";
    if (info.holiday || info.isDomingo) return "0h 00min";
    const responsavelId = info.isSabado ? info.oncallSabado?.user_id : info.responsavelSemana?.user_id;
    const temFolgaAprovada = info.folgasDoDia.some((f) => f.status === "aprovada" && f.user_id === responsavelId);
    const temFeriasAtivas = info.feriasDoDia.some((f) => f.user_id === responsavelId);
    let minutosBase = 0;
    if (responsavelId && !temFolgaAprovada && !temFeriasAtivas) {
      minutosBase = info.isSabado ? 240 : 480; // 4h plantão sábado, 8h dia útil (aproximação)
    }
    const minutosExtras = info.lancamentosDoDia.reduce((acc, l) => acc + l.horas * 60, 0);
    const total = minutosBase + minutosExtras;
    return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}min`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-sand-line hover:bg-sand-bg">
            <ChevronLeft size={16} />
          </button>
          <h1 className="min-w-[180px] text-center font-display text-display text-ink">
            {MESES[mesRef.getMonth()]} de {mesRef.getFullYear()}
          </h1>
          <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-sand-line hover:bg-sand-bg">
            <ChevronRight size={16} />
          </button>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setMesRef(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>
          Hoje
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink/50">Próximo feriado</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-sm font-semibold text-ink">
            {proximoFeriado && <span>{emojiFeriado(proximoFeriado.nome)}</span>}
            {proximoFeriado ? proximoFeriado.nome : "—"}
          </p>
          {proximoFeriado && (
            <p className="text-xs text-ink/40">{new Date(proximoFeriado.data + "T00:00:00").toLocaleDateString("pt-BR")}</p>
          )}
        </Card>
        <Card className={responsavelSemanaAtual ? "p-4" : "border-rust-400/40 bg-rust-500/5 p-4"}>
          <p className="text-xs text-ink/50">Responsável da semana</p>
          <p className={"mt-1 font-display text-sm font-semibold " + (responsavelSemanaAtual ? "text-ink" : "text-rust-600")}>
            {responsavelSemanaAtual?.usuario?.nome ?? "Não definido"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink/50">Folgas pendentes</p>
          <p className="mt-1 font-display text-sm font-semibold text-ink">{pendentesCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink/50">Férias no mês</p>
          <p className="mt-1 font-display text-sm font-semibold text-ink">{feriasNoMes}</p>
        </Card>
      </div>

      {isAdmin && !responsavelSemanaAtual && (
        <Card className="border-rust-400/40 bg-rust-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <AlertCircle size={16} className="text-rust-500" /> Nenhum responsável definido para a semana atual
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setDiaSelecionado(hoje)}>
              Definir agora
            </Button>
          </div>
        </Card>
      )}

      {isAdmin && pendentes && pendentes.length > 0 && (
        <Card className="border-amber-400/40 bg-amber-500/5 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <AlertCircle size={16} className="text-amber-500" /> Solicitações pendentes de aprovação
          </h2>
          <div className="space-y-2">
            {pendentes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sand-surface p-3 text-sm">
                <div>
                  <span className="font-medium text-ink">{p.usuario?.nome}</span>
                  <span className="text-ink/50"> · {new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")} · {p.tipo} · {p.motivo}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => decidir(p.id, "aprovada")}><Check size={13} /> Aprovar</Button>
                  <Button size="sm" variant="secondary" onClick={() => decidir(p.id, "reprovada")}><X size={13} /> Reprovar</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {erro && <p className="text-sm text-rust-500">{erro}</p>}

      {loadingHolidays ? (
        <CardSkeleton />
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 bg-sand-bg text-center text-xs font-medium uppercase tracking-wide text-ink/50">
            {DIAS_SEMANA_CURTO.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          {grid.map((semana, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-sand-line">
              {semana.map((dia) => {
                const info = infoDia(dia);
                const foraDoMes = dia.getMonth() !== mesRef.getMonth();
                const isHoje = toISODate(dia) === toISODate(hoje);
                const corEspecial = info.holiday
                  ? "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
                  : info.isDomingo
                    ? "bg-rust-50 hover:bg-rust-100/60 dark:bg-rust-500/10 dark:hover:bg-rust-500/15"
                    : info.isSabado
                      ? "bg-sky-50 hover:bg-sky-100/60 dark:bg-sky-500/10 dark:hover:bg-sky-500/15"
                      : "hover:bg-sand-bg/60";
                return (
                  <button
                    key={info.iso}
                    onClick={() => setDiaSelecionado(dia)}
                    className={
                      "flex min-h-[90px] flex-col items-start gap-1 border-r border-sand-line p-2 text-left last:border-r-0 " +
                      (foraDoMes ? "bg-sand-bg/30 text-ink/30 hover:bg-sand-bg/50" : "text-ink " + corEspecial)
                    }
                  >
                    <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs " + (isHoje ? "bg-forest-500 text-white" : "")}>
                      {dia.getDate()}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {info.holiday && <span title={info.holiday.nome} className="text-xs">{emojiFeriado(info.holiday.nome)}</span>}
                      {(info.responsavelSemana?.user_id || info.oncallSabado?.user_id) && <span title="Responsável" className="text-[10px]">🟢</span>}
                      {info.folgasDoDia.length > 0 && <span title="Folga" className="text-[10px]">🟡</span>}
                      {info.feriasDoDia.length > 0 && <span title="Férias" className="text-[10px]">🔴</span>}
                      {info.sobreavisoDoDia.length > 0 && <span title="Sobreaviso" className="text-[10px]">🔵</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </Card>
      )}

      {diaSelecionado && infoSelecionado && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={() => setDiaSelecionado(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-sand-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">{formatDiaCompleto(diaSelecionado)}</h2>
                <p className="mt-1 text-sm text-ink/60">{descricaoDoTipo(infoSelecionado)}</p>
              </div>
              <button onClick={() => setDiaSelecionado(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-bg">
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Users size={14} /> Registro do dia
                </h3>
                <p className="text-sm text-ink/70">
                  Responsável do dia:{" "}
                  <strong className="text-ink">
                    {infoSelecionado.isSabado
                      ? infoSelecionado.oncallSabado?.usuario?.nome ?? "Não definido"
                      : infoSelecionado.isDomingo
                        ? "—"
                        : infoSelecionado.responsavelSemana?.usuario?.nome ?? "Não definido"}
                  </strong>
                </p>

                {isAdmin && !infoSelecionado.isDomingo && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-ink/70">
                      {infoSelecionado.isSabado ? "Definir plantão de sábado" : "Definir responsável da semana"}
                    </label>
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && (infoSelecionado.isSabado ? definirPlantaoSabado(e.target.value) : definirResponsavelSemana(e.target.value))}
                      className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm"
                    >
                      <option value="">Selecionar colaborador...</option>
                      {usuariosAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { resetFolga({ tipo: "folga", motivo: "", observacao: "" }); setDialogFolga(true); }}>
                    <Plus size={13} /> Solicitar Folga
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={() => { resetOncall({ user_id: "", horario_inicio: "", horario_fim: "", observacao: "" }); setDialogSobreaviso(true); }}>
                      <Clock size={13} /> Adicionar Sobreaviso
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={() => setDialogFerias(true)}>
                      <Palmtree size={13} /> Cadastrar Férias
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={() => setDialogLancamento(true)}>
                      <Plus size={13} /> Lançamento extra
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="danger" onClick={apagarDia}>
                      <Trash2 size={13} /> Limpar dados do dia
                    </Button>
                  )}
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium text-ink/70">Lançamentos extras</p>
                  {infoSelecionado.lancamentosDoDia.length === 0 ? (
                    <p className="mt-1 text-sm text-ink/50">Nenhum lançamento extra.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {infoSelecionado.lancamentosDoDia.map((l) => (
                        <li key={l.id} className="text-sm text-ink/70">{l.titulo} — {l.horas}h</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 rounded-lg bg-sand-bg p-3 text-sm">
                  <span className="text-ink/60">Total do dia</span>
                  <p className="font-display text-lg font-semibold text-ink">{totalHorasDia(infoSelecionado)}</p>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <CalendarDays size={14} /> Resumo
                </h3>
                <div className="space-y-2 text-sm">
                  {infoSelecionado.sobreavisoDoDia.map((s) => (
                    <p key={s.id} className="text-ink/70">
                      Sobreaviso: <strong className="text-ink">{s.usuario?.nome}</strong> ({s.horario_inicio.slice(0, 5)}–{s.horario_fim.slice(0, 5)})
                    </p>
                  ))}
                  {infoSelecionado.folgasDoDia.length === 0 ? (
                    <p className="text-ink/60">Nenhuma solicitação de folga para este dia.</p>
                  ) : (
                    infoSelecionado.folgasDoDia.map((f) => (
                      <p key={f.id} className="text-ink/70">
                        {f.usuario?.nome} solicitou <strong>{f.tipo}</strong> —{" "}
                        <Badge tone={f.status === "aprovada" ? "success" : f.status === "reprovada" ? "danger" : "warning"}>{f.status}</Badge>
                      </p>
                    ))
                  )}
                  <p className="text-ink/60">
                    Férias:{" "}
                    {infoSelecionado.feriasDoDia.length === 0 ? "Nenhuma." : infoSelecionado.feriasDoDia.map((f) => f.usuario?.nome).join(", ")}
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {dialogFolga && (
        <Dialog onClose={() => setDialogFolga(false)}>
          <h2 className="font-display text-base font-semibold text-ink">Solicitar Folga</h2>
          <p className="mt-1 text-xs text-ink/50">{diaSelecionado && formatDiaCompleto(diaSelecionado)}</p>
          <form onSubmit={handleSubmitFolga(solicitarFolga)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Tipo</label>
              <select {...registerFolga("tipo")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm">
                <option value="folga">Folga</option>
                <option value="banco_horas">Banco de horas</option>
                <option value="compensacao">Compensação</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Motivo</label>
              <input {...registerFolga("motivo")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
              {errorsFolga.motivo && <p className="mt-1 text-xs text-rust-500">{errorsFolga.motivo.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Observação</label>
              <textarea {...registerFolga("observacao")} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDialogFolga(false)}>Cancelar</Button>
              <Button type="submit">Enviar solicitação</Button>
            </div>
          </form>
        </Dialog>
      )}

      {dialogSobreaviso && (
        <Dialog onClose={() => setDialogSobreaviso(false)}>
          <h2 className="font-display text-base font-semibold text-ink">Adicionar Sobreaviso</h2>
          <form onSubmit={handleSubmitOncall(salvarSobreaviso)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Responsável</label>
              <select {...registerOncall("user_id")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {usuariosAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              {errorsOncall.user_id && <p className="mt-1 text-xs text-rust-500">{errorsOncall.user_id.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Horário inicial</label>
                <input type="time" {...registerOncall("horario_inicio")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink/70">Horário final</label>
                <input type="time" {...registerOncall("horario_fim")} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink/70">Observação</label>
              <textarea {...registerOncall("observacao")} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDialogSobreaviso(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Dialog>
      )}

      {dialogFerias && diaSelecionado && (
        <FeriasDialog
          dataInicial={toISODate(diaSelecionado)}
          usuarios={usuariosAtivos}
          onClose={() => setDialogFerias(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendario"] })}
          criadoPor={user?.id ?? ""}
        />
      )}

      {dialogLancamento && diaSelecionado && (
        <LancamentoDialog
          data={toISODate(diaSelecionado)}
          onClose={() => setDialogLancamento(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendario"] })}
          criadoPor={user?.id ?? ""}
        />
      )}
    </div>
  );
}

function FeriasDialog({
  dataInicial, usuarios, onClose, onSaved, criadoPor,
}: {
  dataInicial: string;
  usuarios: { id: string; nome: string }[];
  onClose: () => void;
  onSaved: () => void;
  criadoPor: string;
}) {
  const [userId, setUserId] = useState("");
  const [dataFim, setDataFim] = useState(dataInicial);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!userId) { setErro("Selecione um colaborador."); return; }
    try {
      await createVacation({ user_id: userId, data_inicio: dataInicial, data_fim: dataFim, observacao: obs, created_by: criadoPor });
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <Dialog onClose={onClose}>
      <h2 className="font-display text-base font-semibold text-ink">Cadastrar Férias</h2>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Colaborador</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm">
            <option value="">Selecionar...</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Data inicial</label>
            <input type="date" value={dataInicial} disabled className="w-full rounded-lg border border-sand-line bg-sand-bg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/70">Data final</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Observação</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
        </div>
        {erro && <p className="text-sm text-rust-500">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  );
}

function LancamentoDialog({
  data, onClose, onSaved, criadoPor,
}: {
  data: string;
  onClose: () => void;
  onSaved: () => void;
  criadoPor: string;
}) {
  const [titulo, setTitulo] = useState("");
  const [horas, setHoras] = useState(1);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!titulo) { setErro("Informe um título."); return; }
    try {
      await createDayEntry({ data, titulo, horas, observacao: obs, created_by: criadoPor });
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <Dialog onClose={onClose}>
      <h2 className="font-display text-base font-semibold text-ink">Lançamento extra</h2>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Horas</label>
          <input type="number" step="0.5" value={horas} onChange={(e) => setHoras(Number(e.target.value))} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Observação</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
        </div>
        {erro && <p className="text-sm text-rust-500">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  );
}
