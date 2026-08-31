import type { DbCsatResult } from "@/types/database";
import type { AtendimentoComMetricas } from "@/services/api";
import { classificacaoPorNota } from "@/lib/utils";

export function exportCsatToCsv(rows: DbCsatResult[], filename = "csat.csv") {
  const header = [
    "Data",
    "Colaborador",
    "Canal",
    "Tópico",
    "Categoria do cliente",
    "Nota",
    "Classificação",
    "Tempo 1ª resposta (s)",
    "Tempo encerramento (s)",
    "Comentário",
  ];

  const linhas = rows.map((r) => [
    new Date(r.data_hora).toLocaleString("pt-BR"),
    r.users?.nome ?? r.atendente,
    r.canal ?? "",
    r.topico ?? "",
    r.categoria_cliente ?? "",
    r.nota ?? "",
    classificacaoPorNota(r.nota) ?? "",
    r.tempo_primeira_resposta_seg ?? "",
    r.tempo_encerramento_seg ?? "",
    (r.comentario ?? "").replace(/"/g, '""'),
  ]);

  const csv = [header, ...linhas]
    .map((linha) => linha.map((v) => `"${v}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAtendimentosToCsv(rows: AtendimentoComMetricas[], filename = "atendimentos.csv") {
  const header = [
    "Cliente",
    "E-mail do cliente",
    "Atendente",
    "Canal",
    "Tipo de cliente",
    "Status",
    "Início",
    "1ª resposta humana",
    "Resolução",
    "Tempo até 1ª resposta (s)",
    "Tempo até resolução (s)",
    "Tempo em aberto até agora (s) — só quando ainda não resolvido, não é valor final",
    "Tempo ativo do atendente atual (s)",
    "Link do chamado",
  ];

  const linhas = rows.map((r) => [
    r.cliente_nome ?? "",
    r.cliente_email ?? "",
    r.operator_nome ?? "",
    r.canal ?? "",
    r.tipo_cliente ?? "",
    r.status === "resolved" ? "Resolvido" : r.status === "pending" ? "Pendente" : (r.status ?? ""),
    new Date(r.current_started_at).toLocaleString("pt-BR"),
    r.primeira_resposta_humana_at ? new Date(r.primeira_resposta_humana_at).toLocaleString("pt-BR") : "",
    r.resolved_at ? new Date(r.resolved_at).toLocaleString("pt-BR") : "",
    r.invalido_sem_resposta_humana || r.invalido_resposta_antes_inicio || r.invalido_tempo_negativo
      ? ""
      : (r.tempo_primeira_resposta_seg ?? ""),
    r.tempo_resolucao_seg ?? "",
    r.tempo_aberto_seg ?? "",
    r.tempo_ativo_seg ?? "",
    r.link_chamado ?? "",
  ]);

  const csv = [header, ...linhas]
    .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

