-- Desfaz 2026-09-25_ciclo_pos_pesquisa.sql: volta as colunas de tempo das conversas corrigidas pro valor do backup.
-- Atenção: tira o nó "HTTP"/"HTTP2" do Widget CSAT antes, senão a função (se não for dropada) continua corrigindo.
begin;
update public.crisp_conversations c set
  current_started_at = b.current_started_at, reopened_count = b.reopened_count,
  resolved_at = b.resolved_at, resolution_time = b.resolution_time, resolution_time_minutes = b.resolution_time_minutes,
  first_response_at = b.first_response_at, first_response_time = b.first_response_time,
  first_response_time_minutes = b.first_response_time_minutes,
  first_human_response_at = b.first_human_response_at, first_human_response_time = b.first_human_response_time,
  first_human_response_time_minutes = b.first_human_response_time_minutes,
  first_human_operator_crisp_id = b.first_human_operator_crisp_id, first_human_operator_nome = b.first_human_operator_nome
from public._bkp_ciclo_pesquisa_2026_09_25 b
join public._res_ciclo_2026_09_25 r on r.crisp_id = b.crisp_id and r.alterado
where c.crisp_id = b.crisp_id;
drop function if exists public.corrigir_ciclo_pos_pesquisa(text);
drop function if exists public._reaberturas_conversa(text);
commit;
