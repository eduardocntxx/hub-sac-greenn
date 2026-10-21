-- Remove 4 índices que são cópia exata de outro índice da mesma tabela (advisor do Supabase "duplicate_index" +
-- conferência manual em 14/10/2026). Cada um tem um gêmeo idêntico que continua existindo, então nenhuma consulta
-- perde índice; só deixa de pagar a manutenção dobrada em cada INSERT/UPDATE do n8n.
-- Nenhum deles sustenta constraint (pg_constraint.conindid conferido).
--
--   removido                              gêmeo que fica                     idx_scan do removido em 14/10
--   idx_crisp_conversations_started_at    idx_crisp_started                  0
--   idx_crisp_conversations_crisp_id      crisp_conversations_crisp_id_key   89 mi (o planner passa a usar o unique,
--                                         (unique)                           mesma coluna, mesmo tipo de índice)
--   idx_csat_email                        idx_csat_results_email_atendente   0
--   idx_csat_results_user_id              idx_csat_user                      0
--
-- CONCURRENTLY: não bloqueia escrita em crisp_conversations/csat_results. Não roda dentro de transação — um por vez.
--
-- Rollback (recria com a definição original, um por vez):
--   create index concurrently if not exists idx_crisp_conversations_started_at on public.crisp_conversations using btree (started_at);
--   create index concurrently if not exists idx_crisp_conversations_crisp_id on public.crisp_conversations using btree (crisp_id);
--   create index concurrently if not exists idx_csat_email on public.csat_results using btree (email_atendente);
--   create index concurrently if not exists idx_csat_results_user_id on public.csat_results using btree (user_id);

drop index concurrently if exists public.idx_crisp_conversations_started_at;
drop index concurrently if exists public.idx_crisp_conversations_crisp_id;
drop index concurrently if exists public.idx_csat_email;
drop index concurrently if exists public.idx_csat_results_user_id;
