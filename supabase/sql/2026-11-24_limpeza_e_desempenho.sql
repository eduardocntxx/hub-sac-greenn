-- 2026-11-24: limpeza do banco e desempenho (aprovado pelo usuário). Rollback ao lado.
-- Medições em docs/HISTORICO.md (2026-11-23 e 2026-11-24).

set lock_timeout = '5s';
set app.origem = 'limpeza e desempenho 2026-11-24';

-- 1. Índices repetidos: session_id sozinho já é coberto por (session_id, data). Testado com
--    hypopg_hide_index (mesmo resultado por hash, tempo igual ou menor).
drop index if exists public.idx_crisp_messages_session;
drop index if exists public.crisp_conversation_state_history_session_idx;
drop index if exists public.operator_routing_history_session_idx;

-- 2. Índices sem uso (0 a 7 leituras desde 20/08): colunas sempre vazias ou nunca lidas.
drop index if exists public.idx_crisp_conversations_operator_email;  -- operator_email sempre NULL
drop index if exists public.idx_crisp_conversations_operator;        -- operator_id (5 leituras)
drop index if exists public.idx_crisp_conversations_created;         -- created_at (7 leituras)
drop index if exists public.idx_csat_results_tempo_resposta;         -- nunca preenchido pelo n8n
drop index if exists public.idx_csat_results_primeira_resposta;
drop index if exists public.idx_csat_results_classificacao;          -- classificacao_csat não é usada
drop index if exists public.idx_csat_data;                           -- métricas usam o started_at da conversa

-- 3. Auditoria: UPDATEs automáticos do n8n em crisp_conversations ficam 30 dias. Mudanças do
--    app (authenticated) e de script manual (postgres, com app.origem) ficam pra sempre.
--    Backup das 22.754 linhas apagadas aqui: ~/Downloads/hub-backups/auditoria_log_n8n_ate_2026-10-25.csv
delete from public.auditoria_log
where tabela = 'crisp_conversations' and papel = 'service_role' and origem is null
  and alterado_em < '2026-10-25 00:00:00-03';

select cron.schedule(
  'auditoria-n8n-30-dias',
  '20 5 * * *',
  $$delete from public.auditoria_log
    where tabela = 'crisp_conversations' and papel = 'service_role' and origem is null
      and alterado_em < now() - interval '30 days'$$
);

-- 4. Histórico do pg_cron: 7 dias.
delete from cron.job_run_details where end_time < now() - interval '7 days';
select cron.schedule('cron-log-7-dias', '30 5 * * 0', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 5. Realtime: cada gravação do n8n em crisp_conversations passava pelo Realtime (1,7 milhão de
--    consultas, ~7,5 h de banco) e csat_results não tinha ninguém escutando. O Overview passa a
--    atualizar a cada 2 min com a aba visível (useAtualizacaoOverview).
alter publication supabase_realtime drop table public.crisp_conversations, public.csat_results;

-- 6. Reaberturas: de 5 em 5 min (média 2,2 s, ~9 h de banco) pra 15 em 15 min. A janela continua
--    sendo de 2 dias, então o resultado é o mesmo, só chega até 15 min depois.
select cron.unschedule('reaberturas-reais-5min');
select cron.schedule('reaberturas-reais-15min', '*/15 * * * *', $$select public.atualizar_reaberturas_reais(now() - interval '2 days')$$);
