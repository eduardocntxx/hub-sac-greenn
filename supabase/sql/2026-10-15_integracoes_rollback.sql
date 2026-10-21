-- Rollback de 2026-10-15_integracoes_base.sql.
-- Antes, desagendar os jobs de integração que chamam Edge Functions (cron.unschedule) e religar no n8n o fluxo
-- correspondente. pg_net fica instalado (inofensivo sem chamadas); para tirar também: drop extension pg_net;

begin;
delete from vault.secrets where name = 'cron_secret_integracoes';
drop table if exists public.integracao_execucoes;
commit;
