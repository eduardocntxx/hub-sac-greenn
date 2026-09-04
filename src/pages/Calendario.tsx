import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, CalendarDays, Users, Clock, Palmtree,
  X, Check, Trash2, Plus, AlertCircle, Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeCalendario } from "@/hooks/useRealtimeCalendario";
import {
  fetchHolidays, fetchNextHoliday,
  fetchSaturdayOncall, upsertSaturdayOncall, deleteSaturdayOncall, fetchAtendenteEscaladoSabado,
  fetchLeaveRequests, fetchPendingLeaveRequests,
  requestLeave, decideLeaveRequest, updateLeaveRequest, deleteLeaveRequest,
  fetchOncall, createOncall, updateOncall, deleteOncall,
  fetchVacations, createVacation, updateVacation, deleteVacation,
  fetchDayEntries, createDayEntry, updateDayEntry, deleteDayEntry,
  limparDia, fetchUsers,
} from "@/services/api";
import type { DbOncall, DbVacation, DbDayEntry, DbLeaveRequest } from "@/services/api";
import { buildMonthGrid, toISODate, MESES, DIAS_SEMANA_CURTO, formatDiaCompleto } from "@/lib/calendarUtils";

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
  const [folgaEditando, setFolgaEditando] = useState<DbLeaveRequest | null>(null);
  const [oncallEditando, setOncallEditando] = useState<DbOncall | null>(null);
  const [feriasEditando, setFeriasEditando] = useState<DbVacation | null>(null);
  const [lancamentoEditando, setLancamentoEditando] = useState<DbDayEntry | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setSelecionados(new Set()), [diaSelecionado]);

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
  const { data: satOncall } = useQuery({
    queryKey: ["calendario", "sat-oncall", inicioGrid, fimGrid],
    queryFn: () => fetchSaturdayOncall(inicioGrid, fimGrid),
  });
  // Sábado não é mais atribuído manualmente por padrão — usa o rodízio automático
  // já configurado em Administração → Escalas (mesma fonte usada em outras telas).
  // calendar_saturday_oncall vira só uma sobrescrita pontual quando o admin
  // precisa fugir do rodízio pra uma data específica.
  const sabadosDoGrid = useMemo(() => {
    const set = new Set<string>();
    grid.forEach((semana) => semana.forEach((dia) => { if (dia.getDay() === 6) set.add(toISODate(dia)); }));
    return Array.from(set).sort();
  }, [grid]);
  const { data: escaladosAutomaticos } = useQuery({
    queryKey: ["calendario", "escalados-sabados-auto", sabadosDoGrid],
    queryFn: async () => {
      const resultados = await Promise.all(sabadosDoGrid.map((iso) => fetchAtendenteEscaladoSabado(iso)));
      const map: Record<string, { user_id: string; nome: string } | null> = {};
      sabadosDoGrid.forEach((iso, i) => { map[iso] = resultados[i]; });
      return map;
    },
    enabled: sabadosDoGrid.length > 0,
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

  const folgasNoMes = (leaves ?? []).filter((l) => l.data >= toISODate(new Date(mesRef.getFullYear(), mesRef.getMonth(), 1)));
  const pendentesCount = folgasNoMes.filter((l) => l.status === "pendente").length;
  const feriasNoMes = (ferias ?? []).length;

  function infoDia(data: Date) {
    const iso = toISODate(data);
    const holiday = holidays?.find((h) => h.data === iso);
    const isSabado = data.getDay() === 6;
    const isDomingo = data.getDay() === 0;
    const manualSabado = isSabado ? satOncall?.find((s) => s.data === iso) : undefined;
    const automaticoSabado = isSabado ? escaladosAutomaticos?.[iso] : undefined;
    const oncallSabado = manualSabado
      ?? (automaticoSabado
        ? { id: "auto", data: iso, user_id: automaticoSabado.user_id, horario_previsto: null, observacao: null, usuario: { nome: automaticoSabado.nome } }
        : undefined);
    const sabadoEhAutomatico = isSabado && !manualSabado && !!automaticoSabado;
    const folgasDoDia = (leaves ?? []).filter((l) => l.data === iso);
    const sobreavisoDoDia = (oncalls ?? []).filter((o) => o.data === iso);
    const feriasDoDia = (ferias ?? []).filter((f) => f.data_inicio <= iso && f.data_fim >= iso);
    const lancamentosDoDia = (lancamentos ?? []).filter((l) => l.data === iso);
    return { iso, holiday, isSabado, isDomingo, manualSabado, oncallSabado, sabadoEhAutomatico, folgasDoDia, sobreavisoDoDia, feriasDoDia, lancamentosDoDia };
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
      if (folgaEditando) {
        await updateLeaveRequest(folgaEditando.id, data);
      } else {
        await requestLeave({ user_id: user.id, data: toISODate(diaSelecionado), ...data });
      }
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setDialogFolga(false);
      setFolgaEditando(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a solicitação.");
    }
  }

  function abrirEdicaoFolga(f: DbLeaveRequest) {
    setFolgaEditando(f);
    resetFolga({ tipo: f.tipo, motivo: f.motivo ?? "", observacao: f.observacao ?? "" });
    setDialogFolga(true);
  }

  async function excluirFolga(id: string) {
    if (!confirm("Excluir esta solicitação de folga?")) return;
    try {
      await deleteLeaveRequest(id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir a solicitação.");
    }
  }

  function abrirEdicaoSobreaviso(o: DbOncall) {
    setOncallEditando(o);
    resetOncall({ user_id: o.user_id, horario_inicio: o.horario_inicio.slice(0, 5), horario_fim: o.horario_fim.slice(0, 5), observacao: o.observacao ?? "" });
    setDialogSobreaviso(true);
  }

  async function excluirSobreaviso(id: string) {
    if (!confirm("Excluir este sobreaviso?")) return;
    try {
      await deleteOncall(id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir o sobreaviso.");
    }
  }

  function abrirEdicaoFerias(f: DbVacation) {
    setFeriasEditando(f);
    setDialogFerias(true);
  }

  async function excluirFerias(id: string) {
    if (!confirm("Excluir este período de férias?")) return;
    try {
      await deleteVacation(id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir as férias.");
    }
  }

  function abrirEdicaoLancamento(l: DbDayEntry) {
    setLancamentoEditando(l);
    setDialogLancamento(true);
  }

  async function excluirLancamento(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await deleteDayEntry(id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir o lançamento.");
    }
  }

  type TipoEvento = "sobreaviso" | "folga" | "ferias" | "lancamento";

  function toggleSelecionado(tipo: TipoEvento, id: string) {
    const chave = `${tipo}|${id}`;
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  }

  async function excluirSelecionados() {
    if (selecionados.size === 0) return;
    if (!confirm(`Excluir ${selecionados.size} evento(s) selecionado(s)? Essa ação não pode ser desfeita.`)) return;
    try {
      await Promise.all(Array.from(selecionados).map((chave) => {
        const [tipo, id] = chave.split("|") as [TipoEvento, string];
        if (tipo === "sobreaviso") return deleteOncall(id);
        if (tipo === "folga") return deleteLeaveRequest(id);
        if (tipo === "ferias") return deleteVacation(id);
        return deleteDayEntry(id);
      }));
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setSelecionados(new Set());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível excluir os eventos selecionados.");
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

  async function definirPlantaoSabado(userId: string) {
    if (!diaSelecionado || !user) return;
    try {
      await upsertSaturdayOncall({ data: toISODate(diaSelecionado), user_id: userId, created_by: user.id });
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível definir o plantão.");
    }
  }

  async function removerOverrideSabado(id: string) {
    try {
      await deleteSaturdayOncall(id);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível voltar para o rodízio automático.");
    }
  }

  const {
    register: registerFolga,
    handleSubmit: handleSubmitFolga,
    reset: resetFolga,
    formState: { errors: errorsFolga, isSubmitting: enviandoFolga },
  } = useForm<LeaveForm>({ resolver: zodResolver(leaveSchema), defaultValues: { tipo: "folga" } });

  const {
    register: registerOncall,
    handleSubmit: handleSubmitOncall,
    reset: resetOncall,
    formState: { errors: errorsOncall, isSubmitting: enviandoOncall },
  } = useForm<OncallForm>({ resolver: zodResolver(oncallSchema) });

  async function salvarSobreaviso(data: OncallForm) {
    if (!diaSelecionado || !user) return;
    try {
      if (oncallEditando) {
        await updateOncall(oncallEditando.id, data);
      } else {
        await createOncall({ data: toISODate(diaSelecionado), ...data, created_by: user.id });
      }
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      setDialogSobreaviso(false);
      setOncallEditando(null);
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

  // Total de horas previstas do dia, com base no plantão de sábado (rodízio
  // automático ou sobrescrita manual). Dia útil não tem mais um "responsável"
  // fixo pra basear isso — só entra o que foi lançado manualmente.
  function totalHorasDia(info: ReturnType<typeof infoDia> | null) {
    if (!info) return "0h 00min";
    if (info.holiday || info.isDomingo) return "0h 00min";
    const responsavelId = info.isSabado ? info.oncallSabado?.user_id : undefined;
    const temFolgaAprovada = info.folgasDoDia.some((f) => f.status === "aprovada" && f.user_id === responsavelId);
    const temFeriasAtivas = info.feriasDoDia.some((f) => f.user_id === responsavelId);
    let minutosBase = 0;
    if (responsavelId && !temFolgaAprovada && !temFeriasAtivas) {
      minutosBase = 240; // 4h plantão sábado (aproximação)
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

      <div className="grid gap-4 sm:grid-cols-3">
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
        <Card className="p-4">
          <p className="text-xs text-ink/50">Folgas pendentes</p>
          <p className="mt-1 font-display text-sm font-semibold text-ink">{pendentesCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink/50">Férias no mês</p>
          <p className="mt-1 font-display text-sm font-semibold text-ink">{feriasNoMes}</p>
        </Card>
      </div>

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
        <span className="font-medium text-ink/50">Legenda:</span>
        <span className="flex items-center gap-1"><span>🟢</span> Plantão de sábado</span>
        <span className="flex items-center gap-1"><span>🟡</span> Folga</span>
        <span className="flex items-center gap-1"><span>🔴</span> Férias</span>
        <span className="flex items-center gap-1"><span>🔵</span> Sobreaviso</span>
      </div>

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
                      {info.oncallSabado?.user_id && <span title="Plantão de sábado" className="text-[10px]">🟢</span>}
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDiaSelecionado(null)}>
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
                {infoSelecionado.isSabado && (
                  <p className="text-sm text-ink/70">
                    Plantão de sábado:{" "}
                    <strong className="text-ink">{infoSelecionado.oncallSabado?.usuario?.nome ?? "Não definido"}</strong>
                    {infoSelecionado.sabadoEhAutomatico && (
                      <span className="ml-1.5 text-xs text-ink/40">(automático — rodízio)</span>
                    )}
                  </p>
                )}

                {isAdmin && infoSelecionado.isSabado && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-ink/70">
                      {infoSelecionado.sabadoEhAutomatico ? "Sobrescrever plantão de sábado" : "Definir plantão de sábado"}
                    </label>
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && definirPlantaoSabado(e.target.value)}
                      className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm"
                    >
                      <option value="">Selecionar colaborador...</option>
                      {usuariosAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                    {infoSelecionado.manualSabado && (
                      <button
                        type="button"
                        onClick={() => removerOverrideSabado(infoSelecionado.manualSabado!.id)}
                        className="mt-1 text-xs text-ink/50 hover:text-ink hover:underline"
                      >
                        Voltar para o rodízio automático
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <Button size="sm" onClick={() => { setFolgaEditando(null); resetFolga({ tipo: "folga", motivo: "", observacao: "" }); setDialogFolga(true); }}>
                    <Plus size={13} /> Solicitar Folga
                  </Button>
                </div>

                {isAdmin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setOncallEditando(null); resetOncall({ user_id: "", horario_inicio: "", horario_fim: "", observacao: "" }); setDialogSobreaviso(true); }}>
                      <Clock size={13} /> Adicionar Sobreaviso
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setFeriasEditando(null); setDialogFerias(true); }}>
                      <Palmtree size={13} /> Cadastrar Férias
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setLancamentoEditando(null); setDialogLancamento(true); }}>
                      <Plus size={13} /> Lançamento extra
                    </Button>
                  </div>
                )}

                <div className="mt-4 rounded-lg bg-sand-bg p-3 text-sm">
                  <span className="text-ink/60">Total do dia</span>
                  <p className="font-display text-lg font-semibold text-ink">{totalHorasDia(infoSelecionado)}</p>
                </div>

                {isAdmin && (
                  <div className="mt-4 border-t border-sand-line pt-3">
                    <button
                      type="button"
                      onClick={apagarDia}
                      className="flex items-center gap-1.5 text-xs text-rust-500 hover:text-rust-600 hover:underline"
                    >
                      <Trash2 size={13} /> Limpar dados do dia
                    </button>
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                    <CalendarDays size={14} /> Eventos do dia
                  </h3>
                  {isAdmin && selecionados.size > 0 && (
                    <Button size="sm" variant="danger" onClick={excluirSelecionados}>
                      <Trash2 size={13} /> Excluir selecionados ({selecionados.size})
                    </Button>
                  )}
                </div>
                {infoSelecionado.sobreavisoDoDia.length === 0
                  && infoSelecionado.folgasDoDia.length === 0
                  && infoSelecionado.feriasDoDia.length === 0
                  && infoSelecionado.lancamentosDoDia.length === 0 ? (
                  <p className="text-sm text-ink/50">Nenhum evento registrado para este dia.</p>
                ) : (
                  <ul className="space-y-2">
                    {infoSelecionado.sobreavisoDoDia.map((s) => (
                      <li key={s.id} className="flex items-start justify-between gap-2 rounded-lg bg-sand-bg p-2.5 text-sm">
                        <div className="flex items-start gap-2">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(`sobreaviso|${s.id}`)}
                              onChange={() => toggleSelecionado("sobreaviso", s.id)}
                              className="mt-1 h-3.5 w-3.5 rounded border-sand-line"
                            />
                          )}
                          <div>
                          <Badge tone="info">Sobreaviso</Badge>
                          <p className="mt-1 text-ink/80">
                            <strong className="text-ink">{s.usuario?.nome}</strong> · {s.horario_inicio.slice(0, 5)}–{s.horario_fim.slice(0, 5)}
                          </p>
                          {s.observacao && <p className="mt-0.5 text-xs text-ink/50">{s.observacao}</p>}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => abrirEdicaoSobreaviso(s)} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-surface hover:text-ink">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => excluirSobreaviso(s.id)} title="Excluir" className="flex h-7 w-7 items-center justify-center rounded-lg text-rust-500 hover:bg-rust-50 dark:hover:bg-rust-500/10">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}

                    {infoSelecionado.folgasDoDia.map((f) => (
                      <li key={f.id} className="flex items-start justify-between gap-2 rounded-lg bg-sand-bg p-2.5 text-sm">
                        <div className="flex items-start gap-2">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(`folga|${f.id}`)}
                              onChange={() => toggleSelecionado("folga", f.id)}
                              className="mt-1 h-3.5 w-3.5 rounded border-sand-line"
                            />
                          )}
                          <div>
                          <div className="flex items-center gap-1.5">
                            <Badge tone="neutral">Folga</Badge>
                            <Badge tone={f.status === "aprovada" ? "success" : f.status === "reprovada" ? "danger" : "warning"}>{f.status}</Badge>
                          </div>
                          <p className="mt-1 text-ink/80">
                            <strong className="text-ink">{f.usuario?.nome}</strong> · {f.tipo}
                          </p>
                          {f.motivo && <p className="mt-0.5 text-xs text-ink/50">{f.motivo}</p>}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => abrirEdicaoFolga(f)} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-surface hover:text-ink">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => excluirFolga(f.id)} title="Excluir" className="flex h-7 w-7 items-center justify-center rounded-lg text-rust-500 hover:bg-rust-50 dark:hover:bg-rust-500/10">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}

                    {infoSelecionado.feriasDoDia.map((f) => (
                      <li key={f.id} className="flex items-start justify-between gap-2 rounded-lg bg-sand-bg p-2.5 text-sm">
                        <div className="flex items-start gap-2">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(`ferias|${f.id}`)}
                              onChange={() => toggleSelecionado("ferias", f.id)}
                              className="mt-1 h-3.5 w-3.5 rounded border-sand-line"
                            />
                          )}
                          <div>
                          <Badge tone="ausencia">Férias</Badge>
                          <p className="mt-1 text-ink/80">
                            <strong className="text-ink">{f.usuario?.nome}</strong> ·{" "}
                            {new Date(f.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")}–{new Date(f.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                          </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => abrirEdicaoFerias(f)} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-surface hover:text-ink">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => excluirFerias(f.id)} title="Excluir" className="flex h-7 w-7 items-center justify-center rounded-lg text-rust-500 hover:bg-rust-50 dark:hover:bg-rust-500/10">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}

                    {infoSelecionado.lancamentosDoDia.map((l) => (
                      <li key={l.id} className="flex items-start justify-between gap-2 rounded-lg bg-sand-bg p-2.5 text-sm">
                        <div className="flex items-start gap-2">
                          {isAdmin && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(`lancamento|${l.id}`)}
                              onChange={() => toggleSelecionado("lancamento", l.id)}
                              className="mt-1 h-3.5 w-3.5 rounded border-sand-line"
                            />
                          )}
                          <div>
                          <Badge tone="brand">Lançamento</Badge>
                          <p className="mt-1 text-ink/80"><strong className="text-ink">{l.titulo}</strong> · {l.horas}h</p>
                          {l.observacao && <p className="mt-0.5 text-xs text-ink/50">{l.observacao}</p>}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => abrirEdicaoLancamento(l)} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-ink/50 hover:bg-sand-surface hover:text-ink">
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => excluirLancamento(l.id)} title="Excluir" className="flex h-7 w-7 items-center justify-center rounded-lg text-rust-500 hover:bg-rust-50 dark:hover:bg-rust-500/10">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {dialogFolga && (
        <Dialog onClose={() => { setDialogFolga(false); setFolgaEditando(null); }}>
          <h2 className="font-display text-base font-semibold text-ink">{folgaEditando ? "Editar Folga" : "Solicitar Folga"}</h2>
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
              <Button type="button" variant="secondary" onClick={() => { setDialogFolga(false); setFolgaEditando(null); }} disabled={enviandoFolga}>Cancelar</Button>
              <Button type="submit" disabled={enviandoFolga}>
                {enviandoFolga ? "Salvando..." : folgaEditando ? "Salvar alterações" : "Enviar solicitação"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {dialogSobreaviso && (
        <Dialog onClose={() => { setDialogSobreaviso(false); setOncallEditando(null); }}>
          <h2 className="font-display text-base font-semibold text-ink">{oncallEditando ? "Editar Sobreaviso" : "Adicionar Sobreaviso"}</h2>
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
              <Button type="button" variant="secondary" onClick={() => { setDialogSobreaviso(false); setOncallEditando(null); }} disabled={enviandoOncall}>Cancelar</Button>
              <Button type="submit" disabled={enviandoOncall}>
                {enviandoOncall ? "Salvando..." : oncallEditando ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {dialogFerias && diaSelecionado && (
        <FeriasDialog
          dataInicial={toISODate(diaSelecionado)}
          usuarios={usuariosAtivos}
          editando={feriasEditando}
          onClose={() => { setDialogFerias(false); setFeriasEditando(null); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendario"] })}
          criadoPor={user?.id ?? ""}
        />
      )}

      {dialogLancamento && diaSelecionado && (
        <LancamentoDialog
          data={toISODate(diaSelecionado)}
          editando={lancamentoEditando}
          onClose={() => { setDialogLancamento(false); setLancamentoEditando(null); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendario"] })}
          criadoPor={user?.id ?? ""}
        />
      )}
    </div>
  );
}

function FeriasDialog({
  dataInicial, usuarios, onClose, onSaved, criadoPor, editando,
}: {
  dataInicial: string;
  usuarios: { id: string; nome: string }[];
  onClose: () => void;
  onSaved: () => void;
  criadoPor: string;
  editando?: DbVacation | null;
}) {
  const [userId, setUserId] = useState(editando?.user_id ?? "");
  const [dataInicio, setDataInicio] = useState(editando?.data_inicio ?? dataInicial);
  const [dataFim, setDataFim] = useState(editando?.data_fim ?? dataInicial);
  const [obs, setObs] = useState(editando?.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!userId) { setErro("Selecione um colaborador."); return; }
    setSalvando(true);
    try {
      if (editando) {
        await updateVacation(editando.id, { user_id: userId, data_inicio: dataInicio, data_fim: dataFim, observacao: obs });
      } else {
        await createVacation({ user_id: userId, data_inicio: dataInicio, data_fim: dataFim, observacao: obs, created_by: criadoPor });
      }
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar Férias" : "Cadastrar Férias"}</h2>
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
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full rounded-lg border border-sand-line px-3 py-2 text-sm" />
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function LancamentoDialog({
  data, onClose, onSaved, criadoPor, editando,
}: {
  data: string;
  onClose: () => void;
  onSaved: () => void;
  criadoPor: string;
  editando?: DbDayEntry | null;
}) {
  const [titulo, setTitulo] = useState(editando?.titulo ?? "");
  const [horas, setHoras] = useState(editando?.horas ?? 1);
  const [obs, setObs] = useState(editando?.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!titulo) { setErro("Informe um título."); return; }
    setSalvando(true);
    try {
      if (editando) {
        await updateDayEntry(editando.id, { titulo, horas, observacao: obs });
      } else {
        await createDayEntry({ data, titulo, horas, observacao: obs, created_by: criadoPor });
      }
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog onClose={onClose}>
      <h2 className="font-display text-base font-semibold text-ink">{editando ? "Editar lançamento" : "Lançamento extra"}</h2>
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
