-- Integrações em código (Edge Functions + pg_cron) no lugar do n8n: base comum (2026-10-15). Ver docs/HISTORICO.md.
--
-- 1. pg_net: deixa o pg_cron chamar Edge Functions (net.http_post).
-- 2. integracao_execucoes: uma linha por execução de job (ok/erro + detalhe). Leitura só admin; escrita só pela
--    service_role (as Edge Functions), que ignora RLS.
-- O segredo que o cron manda às funções fica no Vault (`cron_secret_integracoes`) e nos segredos das funções
-- (`CRON_SECRET`), criado à parte: o valor não entra neste arquivo (o repositório é público).
--
-- Rollback: 2026-10-15_integracoes_rollback.sql

begin;

create extension if not exists pg_net with schema extensions;

create table public.integracao_execucoes (
  id bigint generated always as identity primary key,
  job text not null,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  ok boolean not null,
  detalhe jsonb not null default '{}'::jsonb
);
create index integracao_execucoes_job_iniciado_idx on public.integracao_execucoes (job, iniciado_em desc);

alter table public.integracao_execucoes enable row level security;
create policy integracao_execucoes_select_admin on public.integracao_execucoes
  for select to authenticated using ((select public.is_admin()));
revoke all on public.integracao_execucoes from anon, authenticated;
grant select on public.integracao_execucoes to authenticated;

commit;
