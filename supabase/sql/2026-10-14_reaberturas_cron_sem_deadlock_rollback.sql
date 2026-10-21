-- Rollback de 2026-10-14_reaberturas_cron_sem_deadlock.sql.
-- Volta a função sem o advisory lock (o deadlock diário de 06:30 volta) e o job de 5 min para 7 dias.

create or replace function public.atualizar_reaberturas_reais(p_desde timestamp with time zone)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '0'
as $function$
declare n integer;
begin
  delete from public.reaberturas_reais where reaberto_em >= p_desde;
  with inicio_msgs as (select min(message_timestamp) as em from public.crisp_messages),
  sessoes as (
    select distinct h2.session_id from public.crisp_conversation_state_history h2
    where h2.event_at >= p_desde and h2.state = any(array['pending','unresolved'])
  ),
  hist as (
    select h.session_id, h.event_at, h.state,
      lag(h.state) over w as estado_anterior,
      lag(h.event_at) over w as anterior_em,
      min(case when h.state = 'resolved' then h.event_at end)
        over (partition by h.session_id order by h.event_at rows between 1 following and unbounded following) as fecha_em
    from public.crisp_conversation_state_history h
    join sessoes s on s.session_id = h.session_id
    window w as (partition by h.session_id order by h.event_at)
  ),
  candidatos as (
    select session_id, event_at as reaberto_em, anterior_em, coalesce(fecha_em, now()) as fecha_em
    from hist
    where estado_anterior = 'resolved' and state = any(array['pending','unresolved']) and event_at >= p_desde
  )
  insert into public.reaberturas_reais (session_id, reaberto_em)
  select distinct c.session_id, c.reaberto_em
  from candidatos c cross join inicio_msgs im
  where case
    when c.reaberto_em < im.em then c.reaberto_em - c.anterior_em > interval '10 minutes'
    else exists (
      select 1 from public.crisp_messages m
      where m.session_id = c.session_id
        and m.message_timestamp >= c.reaberto_em - interval '10 seconds'
        and m.message_timestamp < c.fecha_em
        and m.from_type = 'user'
        and coalesce(m.content, '') not ilike '%Como você avalia o atendimento%'
        and not exists (
          select 1 from public.crisp_messages p
          where p.session_id = m.session_id and p.from_type <> 'user'
            and p.message_timestamp < m.message_timestamp
            and p.message_timestamp >= m.message_timestamp - interval '24 hours'
            and (p.content ilike '%greenn_csat%' or p.content ilike '%Como você avalia o atendimento%'
                 or p.content ilike '%Obrigado pela sua avaliação%' or p.content ilike '%crisp.beta.limited/rate%'
                 or p.content ilike '%Feedback em um clique%' or p.content ilike '%Feedback rápido%')
            and not exists (
              select 1 from public.crisp_messages q
              where q.session_id = m.session_id and q.from_type <> 'user'
                and q.message_timestamp > p.message_timestamp and q.message_timestamp < m.message_timestamp
                and not (q.content ilike '%greenn_csat%' or q.content ilike '%Como você avalia o atendimento%'
                         or q.content ilike '%Obrigado pela sua avaliação%' or q.content ilike '%crisp.beta.limited/rate%'
                         or q.content ilike '%Feedback em um clique%' or q.content ilike '%Feedback rápido%'))
        )
    )
  end
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$function$;

select cron.schedule(
  'reaberturas-reais-5min',
  '*/5 * * * *',
  $$select public.atualizar_reaberturas_reais(now() - interval '7 days')$$
);
