-- Rollback de 2026-10-15_migracoes_sync_v2.sql.
-- Volta _migracoes_resumo_base pro filtro por ticket_created_at + status atual, remove sync_migracoes e as colunas
-- novas. Reimportar o fluxo antigo do n8n (GET ticket_migracoes + upsert em migracoes_sync) antes de rodar isto,
-- senão o fluxo novo passa a falhar na chamada de sync_migracoes.

begin;

drop function if exists public.sync_migracoes(jsonb);

create or replace function public._migracoes_resumo_base(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(finalizados bigint, em_progresso bigint, aguardando bigint, cancelados bigint, total bigint, sla_ok bigint, sla_risco bigint, sla_atrasado bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    count(*) filter (where status = 'finalizado'),
    count(*) filter (where status in ('aberto','em_andamento','fila_de_inicio')),
    count(*) filter (where status = 'aguardando_retorno'),
    count(*) filter (where status = 'cancelado'),
    count(*),
    count(*) filter (where sla_state = 'ok'),
    count(*) filter (where sla_state = 'risco'),
    count(*) filter (where sla_state = 'atrasado')
  from public.migracoes_sync
  where ticket_created_at between data_inicio and data_fim;
$function$;

alter table public.migracoes_sync
  drop column if exists finalizado_em,
  drop column if exists cancelado_em,
  drop column if exists historico_status,
  drop column if exists faturamento_mensal,
  drop column if exists data_prevista_inicio,
  drop column if exists gerente,
  drop column if exists cs,
  drop column if exists sac;

commit;

notify pgrst, 'reload schema';
