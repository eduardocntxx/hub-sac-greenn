-- atualizar_reaberturas_reais: fim do deadlock diário + janela menor no job de 5 em 5 minutos.
--
-- Problema 1 (deadlock): às 06:30 os dois jobs do pg_cron rodam juntos ("reaberturas-reais-diario", 60 dias, e
-- "reaberturas-reais-5min", que também cai em 06:30). Os dois fazem DELETE + INSERT em reaberturas_reais em ordens
-- diferentes e um mata o outro com "deadlock detected". Falhou em 6 dos 7 dias de 07/10 a 14/10 — a reconciliação
-- de 60 dias praticamente nunca rodava. Correção: pg_advisory_xact_lock no início da função; quem chega depois
-- espera o outro terminar (o diário leva ~10 s).
--
-- Problema 2 (custo): o job de 5 min levava ~3,1 s em qualquer hora do dia (mesmo de madrugada) reprocessando 7
-- dias. Medido em 14/10: a consulta leva ~1,9 s com cache frio (cada execução do cron é uma sessão nova e lê do
-- disco as mensagens de ~1.900 conversas) e ~160 ms com cache quente; com 2 dias, ~310 ms frio / ~60 ms quente.
-- Em 1.623 reaberturas desde 10/09, 99,1% têm a mensagem do cliente em até 2 dias do evento (14 passaram disso,
-- máximo de 16 dias). Esses casos raros passam a entrar pelo job diário (60 dias), com até 24 h de atraso.
--
-- Rollback: 2026-10-14_reaberturas_cron_sem_deadlock_rollback.sql

create or replace function public.atualizar_reaberturas_reais(p_desde timestamp with time zone)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '0'
as $function$
declare n integer;
begin
  -- Serializa execuções concorrentes (job diário x job de 5 min): sem isso dão deadlock às 06:30.
  perform pg_advisory_xact_lock(hashtext('public.atualizar_reaberturas_reais'));

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

-- Job de 5 min: 7 dias -> 2 dias. O diário (60 dias, 06:30) continua igual.
select cron.schedule(
  'reaberturas-reais-5min',
  '*/5 * * * *',
  $$select public.atualizar_reaberturas_reais(now() - interval '2 days')$$
);
