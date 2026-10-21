-- Fecha no Hub a conversa que a Crisp resolveu por último mas ficou "pendente" (2026-10-19).
--
-- Conferência do backlog: das 3.235 abertas, 4 tinham "resolved" como último evento da Crisp. Só esta está
-- resolvida de fato: resolved 15:44:58 → unresolved 15:45:01 → resolved 15:45:04 (fluxo de CSAT), sem mensagem
-- depois; o PATCH do "unresolved" (ou da pesquisa das 15:45:00) chegou depois do "resolved" no n8n.
-- As outras 3 (session_372ba7fd, session_66b6fa7e, session_52821ecc) têm mensagem depois da última resolução, e em
-- 30 dias qualquer mensagem depois de resolver reabriu a conversa na Crisp (cliente 2048/2049, bot 156/158,
-- humano 27/33): o evento "unresolved" delas se perdeu, então ficam pendentes.
--
-- Campos iguais aos que o "Crisp → Hub" grava num resolved (nó "Code in JavaScript" + "HTTP Request3").
-- Rollback: 2026-10-19_fechar_conversa_presa_rollback.sql
--
-- Aplicado em 20/10/2026 pelo usuário: 0 linhas alteradas. A conversa já tinha sido fechada às 03:12 (20/10) por um
-- processo com service_role (10 conversas no mesmo instante, resolved_at = last_message_at, sem evento novo nem
-- app.origem); o backup guardou esse estado já corrigido, então o rollback não muda nada.

begin;
set local app.origem = '2026-10-19 conversa resolvida na Crisp presa como pendente (eventos fora de ordem)';

create table arquivo._bkp_conversa_presa_2026_10_19 as
select * from public.crisp_conversations where crisp_id = 'session_91f0d962-10a1-4dbe-80d9-e952a232a11a';

update public.crisp_conversations cc
set status = 'resolved',
    resolved_at = ue.event_at,
    first_resolved_at = coalesce(cc.first_resolved_at, ue.event_at),
    resolution_time = floor(extract(epoch from ue.event_at - cc.current_started_at))::int,
    resolved_operator_crisp_id = cc.operator_crisp_id,
    resolved_operator_nome = cc.operator_nome
from (
  select h.state, h.event_at from public.crisp_conversation_state_history h
  where h.session_id = 'session_91f0d962-10a1-4dbe-80d9-e952a232a11a'
  order by h.event_at desc limit 1
) ue
where cc.crisp_id = 'session_91f0d962-10a1-4dbe-80d9-e952a232a11a'
  and cc.status <> 'resolved'
  and ue.state = 'resolved'
  and not exists (select 1 from public.crisp_messages m where m.session_id = cc.crisp_id and m.message_timestamp > ue.event_at);

commit;
