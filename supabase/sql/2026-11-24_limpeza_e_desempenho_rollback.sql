-- Rollback de 2026-11-24_limpeza_e_desempenho.sql.

-- 6.
select cron.unschedule('reaberturas-reais-15min');
select cron.schedule('reaberturas-reais-5min', '*/5 * * * *', $$select public.atualizar_reaberturas_reais(now() - interval '2 days')$$);

-- 5.
alter publication supabase_realtime add table public.crisp_conversations, public.csat_results;

-- 4 e 3. (O histórico do cron apagado não volta; não tem backup, é só log.)
select cron.unschedule('cron-log-7-dias');
select cron.unschedule('auditoria-n8n-30-dias');
-- Auditoria apagada: reimportar o backup pelo psql (não roda pelo SQL editor):
--   \copy public.auditoria_log (id, tabela, operacao, registro_id, alterado_em, usuario_id, auth_uid, papel, origem, antes, depois)
--     from '~/Downloads/hub-backups/auditoria_log_n8n_ate_2026-10-25.csv' with (format csv, header true, null 'NULL')

-- 2 e 1.
create index if not exists idx_csat_data on public.csat_results using btree (data_hora desc);
create index if not exists idx_csat_results_classificacao on public.csat_results using btree (classificacao_csat);
create index if not exists idx_csat_results_primeira_resposta on public.csat_results using btree (primeira_resposta_humana);
create index if not exists idx_csat_results_tempo_resposta on public.csat_results using btree (tempo_primeira_resposta_seg);
create index if not exists idx_crisp_conversations_created on public.crisp_conversations using btree (created_at);
create index if not exists idx_crisp_conversations_operator on public.crisp_conversations using btree (operator_id);
create index if not exists idx_crisp_conversations_operator_email on public.crisp_conversations using btree (operator_email);
create index if not exists operator_routing_history_session_idx on public.operator_routing_history using btree (session_id);
create index if not exists crisp_conversation_state_history_session_idx on public.crisp_conversation_state_history using btree (session_id);
create index if not exists idx_crisp_messages_session on public.crisp_messages using btree (session_id);
