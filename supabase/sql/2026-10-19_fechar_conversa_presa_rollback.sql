-- Desfaz 2026-10-19_fechar_conversa_presa.sql: devolve a conversa ao estado do backup (pendente).
begin;
set local app.origem = 'rollback 2026-10-19_fechar_conversa_presa';
update public.crisp_conversations cc
set status = b.status,
    resolved_at = b.resolved_at,
    first_resolved_at = b.first_resolved_at,
    resolution_time = b.resolution_time,
    resolved_operator_crisp_id = b.resolved_operator_crisp_id,
    resolved_operator_nome = b.resolved_operator_nome
from arquivo._bkp_conversa_presa_2026_10_19 b
where cc.crisp_id = b.crisp_id;
commit;
