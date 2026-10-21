-- SAC — Migrações: contar o que aconteceu na semana, não o status de hoje do que foi aberto na semana.
--
-- Em 15/10/2026 a RR de 07–13/10 mostrava 0 finalizadas e 0 canceladas; na Centralização (ticket_status_history)
-- foram 3 finalizadas e 2 canceladas na semana, e 8 finalizadas na semana anterior (a RR mostrava 3).
-- Três causas:
--   1. _migracoes_resumo_base filtrava por ticket_created_at no período e contava pelo status atual: "finalizada"
--      era "aberta nesta semana e já finalizada" (quase nunca acontece) e os números de semanas passadas mudavam
--      a cada abertura do relatório.
--   2. O fluxo do n8n não mandava SLA desde a carga inicial (23/09): 48 migrações sem sla_state e 126 com SLA
--      congelado naquela data. A linha de SLA do PPTX saía "0 · 0 · 0".
--   3. O Schedule Trigger "A cada hora" só tinha triggerAtMinute (sem o campo de intervalo em horas) e rodava
--      1x por dia, às 00:40 — todas as 48 linhas novas têm synced_at às 00:40.
-- Além disso o upsert nunca apagava: o ticket 7468086c… (24/09) foi apagado na Centralização e seguia contando.
--
-- O que muda:
--   - migracoes_sync ganha finalizado_em, cancelado_em, historico_status (lista {status, changed_at} da
--     Centralização) e os campos de visão macro (faturamento_mensal, data_prevista_inicio, gerente, cs, sac).
--     Texto livre do cliente (telefone, área de membros, descrição) fica de fora de propósito.
--   - sync_migracoes(payload) (só service_role): upsert + remove o que sumiu da origem, numa transação.
--     Payload vazio ou que não seja array dá erro em vez de esvaziar a tabela.
--   - _migracoes_resumo_base, mesma assinatura (wrapper e grants ficam como estão):
--       finalizados / cancelados = finalizado_em / cancelado_em dentro do período;
--       em_progresso / aguardando = status no fim do período (ou agora, se o período não acabou), pelo histórico;
--       'pausada' (coluna própria no kanban da Centralização, parada) conta em aguardando — antes não entrava em
--       nenhum card;
--       total = novas (abertas no período) — mesmo valor que o total tinha antes;
--       sla_* = SLA da fila aberta no último sync (não depende do período; status finalizado/cancelado vem 'na').
--   - _migracoes_por_plataforma_base não muda: continua "novas por plataforma".
-- O n8n novo (gestao-tickets/n8n/sync-migracoes-hub.json) chama migracoes_para_hub() na Centralização e
-- sync_migracoes() aqui, de hora em hora. Enquanto o fluxo antigo rodar, linha nova chega sem histórico:
-- o resumo cai pro status atual nesse caso.
--
-- Rollback: 2026-10-15_migracoes_sync_v2_rollback.sql

begin;

alter table public.migracoes_sync
  add column if not exists finalizado_em timestamptz,
  add column if not exists cancelado_em timestamptz,
  add column if not exists historico_status jsonb not null default '[]'::jsonb,
  add column if not exists faturamento_mensal text,
  add column if not exists data_prevista_inicio date,
  add column if not exists gerente text,
  add column if not exists cs text,
  add column if not exists sac text;

create or replace function public.sync_migracoes(payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_gravadas bigint;
  v_removidas bigint;
begin
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'sync_migracoes: payload vazio ou não é array — nada foi alterado';
  end if;

  insert into public.migracoes_sync (
    ticket_id, nome_completo, email_greenn, plataforma_origem, tipo_hospedagem, status, ticket_created_at,
    titulo, assignee_email, last_message_at, prazo_em, sla_state, idle_hours, limit_hours,
    faturamento_mensal, data_prevista_inicio, gerente, cs, sac,
    finalizado_em, cancelado_em, historico_status, synced_at
  )
  select
    r.ticket_id, r.nome_completo, r.email_greenn, r.plataforma_origem, r.tipo_hospedagem, r.status, r.ticket_created_at,
    r.titulo, r.assignee_email, r.last_message_at, r.prazo_em, r.sla_state, r.idle_hours, r.limit_hours,
    r.faturamento_mensal, r.data_prevista_inicio, r.gerente, r.cs, r.sac,
    r.finalizado_em, r.cancelado_em, coalesce(r.historico_status, '[]'::jsonb), now()
  from jsonb_to_recordset(payload) as r(
    ticket_id uuid, nome_completo text, email_greenn text, plataforma_origem text, tipo_hospedagem text,
    status text, ticket_created_at timestamptz, titulo text, assignee_email text, last_message_at timestamptz,
    prazo_em timestamptz, sla_state text, idle_hours numeric, limit_hours numeric, faturamento_mensal text,
    data_prevista_inicio date, gerente text, cs text, sac text, finalizado_em timestamptz,
    cancelado_em timestamptz, historico_status jsonb
  )
  on conflict (ticket_id) do update set
    nome_completo = excluded.nome_completo,
    email_greenn = excluded.email_greenn,
    plataforma_origem = excluded.plataforma_origem,
    tipo_hospedagem = excluded.tipo_hospedagem,
    status = excluded.status,
    ticket_created_at = excluded.ticket_created_at,
    titulo = excluded.titulo,
    assignee_email = excluded.assignee_email,
    last_message_at = excluded.last_message_at,
    prazo_em = excluded.prazo_em,
    sla_state = excluded.sla_state,
    idle_hours = excluded.idle_hours,
    limit_hours = excluded.limit_hours,
    faturamento_mensal = excluded.faturamento_mensal,
    data_prevista_inicio = excluded.data_prevista_inicio,
    gerente = excluded.gerente,
    cs = excluded.cs,
    sac = excluded.sac,
    finalizado_em = excluded.finalizado_em,
    cancelado_em = excluded.cancelado_em,
    historico_status = excluded.historico_status,
    synced_at = excluded.synced_at;
  get diagnostics v_gravadas = row_count;

  delete from public.migracoes_sync ms
  where not exists (
    select 1 from jsonb_array_elements(payload) e where (e->>'ticket_id')::uuid = ms.ticket_id
  );
  get diagnostics v_removidas = row_count;

  return jsonb_build_object('gravadas', v_gravadas, 'removidas', v_removidas);
end;
$function$;

revoke execute on function public.sync_migracoes(jsonb) from public, anon, authenticated;
grant execute on function public.sync_migracoes(jsonb) to service_role;

create or replace function public._migracoes_resumo_base(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(finalizados bigint, em_progresso bigint, aguardando bigint, cancelados bigint, total bigint, sla_ok bigint, sla_risco bigint, sla_atrasado bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select
      m.*,
      coalesce(
        (select h->>'status'
           from jsonb_array_elements(m.historico_status) h
          where (h->>'changed_at')::timestamptz <= least(data_fim, now())
          order by (h->>'changed_at')::timestamptz desc
          limit 1),
        -- Sem histórico (linha gravada pelo fluxo antigo do n8n): status atual, se já existia no corte.
        case when jsonb_array_length(m.historico_status) = 0 and m.ticket_created_at <= least(data_fim, now())
             then m.status end
      ) as status_no_corte
    from public.migracoes_sync m
  )
  select
    count(*) filter (where finalizado_em between data_inicio and data_fim),
    count(*) filter (where status_no_corte in ('aberto','em_andamento','fila_de_inicio')),
    count(*) filter (where status_no_corte in ('aguardando_retorno','pausada')),
    count(*) filter (where cancelado_em between data_inicio and data_fim),
    count(*) filter (where ticket_created_at between data_inicio and data_fim),
    count(*) filter (where sla_state = 'ok'),
    count(*) filter (where sla_state = 'risco'),
    count(*) filter (where sla_state = 'atrasado')
  from base;
$function$;

commit;

notify pgrst, 'reload schema';
