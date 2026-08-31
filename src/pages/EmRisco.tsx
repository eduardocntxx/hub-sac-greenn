import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, ExternalLink, Lock, SlidersHorizontal, Check, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import { fetchAtendimentosComMetricas, fetchDistinctCanais, fetchDistinctAtendentesConversas } from "@/services/api";
import { formatDuration } from "@/lib/formatDuration";
import { exportEmRiscoToCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";

type OrdenarCampo = "tempo_aberto" | "tfr";
const DIRECAO_PADRAO: Record<OrdenarCampo, "asc" | "desc"> = { tempo_aberto: "asc", tfr: "desc" };

const PAGE_SIZE = 20;

// Faixas de tempo até 1ª resposta (minutos úteis) — definidas pelo time.
const LIMITE_BAIXO_MIN = 1; // até 1min: baixo
const LIMITE_MEDIO_MIN = 2; // até 2min: médio
const LIMITE_ALTO_MIN = 5; // até 5min: alto, 5min+: crítico a partir de 10min
const LIMITE_CRITICO_MIN = 10;

function corRisco(minutos: number | null) {
  if (minutos === null) return "text-ink/40";
  if (minutos >= LIMITE_CRITICO_MIN) return "text-rust-600 font-semibold";
  if (minutos > LIMITE_ALTO_MIN) return "text-amber-700 font-semibold";
  if (minutos > LIMITE_MEDIO_MIN) return "text-amber-500 font-medium";
  if (minutos > LIMITE_BAIXO_MIN) return "text-sky-600";
  return "text-forest-600";
}

const STATUS_OPTIONS = [
  ["", "Todos os status"],
  ["pending", "Pendente"],
  ["resolved", "Resolvido"],
] as const;

interface FiltrosState {
  canal: string;
  atendenteNome: string;
  status: string;
}

function FiltrosPopover({
  filtros,
  onChange,
  canais,
  atendentes,
}: {
  filtros: FiltrosState;
  onChange: (f: FiltrosState) => void;
  canais: string[];
  atendentes: { nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const ativos = Object.values(filtros).filter(Boolean).length;

  return (
    <div className="relative">
      {aberto && <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />}
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-sand-line bg-white px-3 text-sm text-ink/70 transition-colors hover:border-sand-line-strong"
      >
        <SlidersHorizontal size={14} className="text-ink/40" />
        Filtros
        {ativos > 0 && <Badge tone="brand" className="h-4 min-w-[16px] justify-center px-1 text-[10px]">{ativos}</Badge>}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-64 space-y-3 rounded-xl border border-sand-line bg-white p-3 shadow-float">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Atendente</label>
            <select
              value={filtros.atendenteNome}
              onChange={(e) => onChange({ ...filtros, atendenteNome: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todos os atendentes</option>
              {atendentes.map((a) => <option key={a.nome} value={a.nome}>{a.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Status</label>
            <div className="space-y-0.5">
              {STATUS_OPTIONS.map(([valor, label]) => (
                <button
                  key={valor}
                  onClick={() => onChange({ ...filtros, status: valor })}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-sand-subtle",
                    filtros.status === valor && "bg-forest-50 text-forest-700"
                  )}
                >
                  {label}
                  {filtros.status === valor && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink/50">Canal</label>
            <select
              value={filtros.canal}
              onChange={(e) => onChange({ ...filtros, canal: e.target.value })}
              className="w-full rounded-lg border border-sand-line px-2 py-1.5 text-sm"
            >
              <option value="">Todos os canais</option>
              {canais.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {ativos > 0 && (
            <button
              onClick={() => onChange({ canal: "", atendenteNome: "", status: "" })}
              className="w-full rounded-lg border border-sand-line py-1.5 text-xs text-ink/60 hover:bg-sand-subtle"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmRisco() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  const [filtros, setFiltros] = usePersistedState<FiltrosState>("emRisco:filtros", { canal: "", atendenteNome: "", status: "" });
  const [ordenarPor, setOrdenarPor] = useState<OrdenarCampo>("tempo_aberto");
  const [direcao, setDirecao] = useState<"asc" | "desc">(DIRECAO_PADRAO.tempo_aberto);
  const [page, setPage] = useState(0);
  const [exportando, setExportando] = useState(false);

  function ordenarPorColuna(campo: OrdenarCampo) {
    if (ordenarPor === campo) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(campo);
      setDirecao(DIRECAO_PADRAO[campo]);
    }
    setPage(0);
  }

  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais, enabled: isAdmin });
  const { data: atendentes } = useQuery({ queryKey: ["atendentes-conversas"], queryFn: fetchDistinctAtendentesConversas, enabled: isAdmin });

  // Janela ampla (90 dias) — risco é sobre chamados ainda em aberto, não sobre um período fechado.
  const { inicio, fim } = useMemo(() => {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 90);
    return { inicio, fim };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["atendimentos-em-risco", filtros, ordenarPor, direcao, page],
    queryFn: () =>
      fetchAtendimentosComMetricas({
        inicio,
        fim,
        canal: filtros.canal || undefined,
        atendenteNomes: filtros.atendenteNome ? [filtros.atendenteNome] : undefined,
        status: filtros.status || undefined,
        page,
        pageSize: PAGE_SIZE,
        // Quando o status é escolhido explicitamente, ele já decide o que aparece;
        // sem status escolhido, o padrão continua sendo "esconder resolvidos".
        somenteRisco: !filtros.status,
        ordenarPor,
        direcao,
      }),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  async function exportar() {
    setExportando(true);
    try {
      const todos = await fetchAtendimentosComMetricas({
        inicio,
        fim,
        canal: filtros.canal || undefined,
        atendenteNomes: filtros.atendenteNome ? [filtros.atendenteNome] : undefined,
        status: filtros.status || undefined,
        page: 0,
        pageSize: 2000,
        somenteRisco: !filtros.status,
        ordenarPor,
        direcao,
      });
      exportEmRiscoToCsv(todos.rows, `em-risco-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExportando(false);
    }
  }

  if (!isAdmin) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <Lock size={16} className="text-ink/40" />
        <p className="text-sm text-ink/50">Só administradores veem os chamados em risco.</p>
      </Card>
    );
  }

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Em Risco</h1>
          <p className="mt-1 text-sm text-ink/60">
            Chamados ainda abertos. Clique numa coluna pra ordenar — tempo já descontando fora de expediente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={exportar} disabled={exportando}>
            <Download size={14} /> {exportando ? "Exportando..." : "Exportar CSV"}
          </Button>
          <FiltrosPopover
            filtros={filtros}
            onChange={(f) => { setFiltros(f); setPage(0); }}
            canais={canais ?? []}
            atendentes={atendentes ?? []}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink/50">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-forest-500" /> até 1min: baixo</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> até 2min: médio</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> até 5min: alto</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rust-500" /> 10min+: crítico</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={AlertOctagon} title="Nenhum chamado encontrado" description="Ajuste os filtros ou aguarde novos chamados." />
      ) : (
        <>
          <Card>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Atendente</th>
                  <SortableHeader field="tempo_aberto" label="Aberto desde" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                  <SortableHeader field="tfr" label="Tempo até 1ª resposta" ordenarPor={ordenarPor} direcao={direcao} onSort={ordenarPorColuna} />
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => (
                  <tr key={c.id} className="border-t border-sand-line align-top">
                    <td className="truncate px-4 py-3">
                      <p className="truncate font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                      <p className="truncate text-xs text-ink/50">{c.cliente_email}</p>
                    </td>
                    <td className="truncate px-4 py-3 text-ink/70">{c.operator_nome ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                    <td className={"px-4 py-3 text-xs " + corRisco(c.tempo_primeira_resposta_seg !== null ? c.tempo_primeira_resposta_seg / 60 : null)}>
                      {c.invalido_sem_resposta_humana ? "sem resposta humana" : formatDuration(c.tempo_primeira_resposta_seg)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={c.status === "resolved" ? "success" : "warning"}>
                        {c.status === "resolved" ? "Resolvido" : "Pendente"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.link_chamado ? (
                        <a href={c.link_chamado} target="_blank" rel="noreferrer">
                          <Button variant="secondary" size="sm">
                            <ExternalLink size={13} /> Ver chamado
                          </Button>
                        </a>
                      ) : (
                        <span className="text-xs text-ink/30">sem link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="flex items-center justify-between text-sm text-ink/60">
            <span>{data.count} chamados</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
              <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
