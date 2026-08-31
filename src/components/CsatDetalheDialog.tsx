import { ExternalLink, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/formatDuration";
import { classificacaoPorNota } from "@/lib/utils";
import type { DbCsatResult } from "@/types/database";

interface CsatDetalheDialogProps {
  registro: DbCsatResult;
  onClose: () => void;
}

// Popup com todos os campos de uma avaliação de CSAT — a planilha (e o
// histórico pessoal em Meu Painel) truncam colunas como comentário; aqui
// mostra tudo sem cortar, incluindo campos que a tabela nem lista
// (telefone, tags, link do chamado etc.).
export function CsatDetalheDialog({ registro: r, onClose }: CsatDetalheDialogProps) {
  return (
    <Dialog onClose={onClose} className="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-ink">{r.cliente ?? "Cliente não identificado"}</h3>
          <p className="text-xs text-ink/50">{new Date(r.data_hora).toLocaleString("pt-BR")}</p>
        </div>
        <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={classificacaoPorNota(r.nota) === "Promotor" ? "success" : classificacaoPorNota(r.nota) === "Detrator" ? "danger" : "warning"}>
          {classificacaoPorNota(r.nota) ?? "—"}
        </Badge>
        <Badge tone="neutral">Nota {r.nota ?? "—"}</Badge>
        {r.categoria_cliente && <Badge tone="neutral">{r.categoria_cliente}</Badge>}
        {r.canal && <Badge tone="neutral">{r.canal}</Badge>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Atendente</p>
          <p className="text-ink">{r.atendente}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tópico</p>
          <p className="text-ink">{r.topico ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">E-mail do cliente</p>
          <p className="text-ink">{r.email || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Telefone</p>
          <p className="text-ink">{r.telefone || r.numero_whatsapp || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo até 1ª resposta</p>
          <p className="text-ink">{formatDuration(r.tempo_primeira_resposta_seg)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tempo até encerramento</p>
          <p className="text-ink">{formatDuration(r.tempo_encerramento_seg)}</p>
        </div>
        {r.tags_cliente && (
          <div className="col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Tags do cliente</p>
            <p className="text-ink">{r.tags_cliente}</p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Comentário</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.comentario || "Sem comentário."}</p>
      </div>

      {r.link_chamado && (
        <a href={r.link_chamado} target="_blank" rel="noreferrer" className="mt-4 inline-block">
          <Button variant="secondary" size="sm">
            <ExternalLink size={13} /> Ver chamado
          </Button>
        </a>
      )}
    </Dialog>
  );
}
