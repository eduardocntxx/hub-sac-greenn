-- Agenda a Edge Function sync-migracoes no minuto 40 de cada hora (2026-10-15). Ver docs/HISTORICO.md.
-- Substitui o fluxo do n8n de migrações (o antigo, 1x por dia às 00:40, deve ser desligado no n8n).
-- Pré-requisitos: 2026-10-15_integracoes_base.sql aplicado, função publicada, segredo `cron_secret_integracoes`
-- no Vault igual ao CRON_SECRET da função, e CENTRALIZACAO_URL/CENTRALIZACAO_SERVICE_KEY nos segredos da função.
-- A resposta de cada chamada fica em net._http_response (pg_net); o resultado da sincronização, em
-- integracao_execucoes.
--
-- Rollback: select cron.unschedule('sync-migracoes-hora'); e religar o fluxo no n8n.

select cron.schedule(
  'sync-migracoes-hora',
  '40 * * * *',
  $cron$
  select net.http_post(
    url := 'https://riiwphsvqlatqtaqaemd.supabase.co/functions/v1/sync-migracoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_integracoes')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
