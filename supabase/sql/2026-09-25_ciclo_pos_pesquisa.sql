-- 2026-09-25 — desfaz o reinício de ciclo causado por resposta à pesquisa de CSAT (ver CLAUDE.md, seção 10).
-- Aplicado em produção (riiwphsvqlatqtaqaemd) em 2026-09-25: 771 linhas no backup, 522 corrigidas.
-- Rollback: 2026-09-25_ciclo_pos_pesquisa_rollback.sql
begin;
-- Reaberturas de uma conversa, marcando se são reais (mesma regra de reopened_count_real_periodo).
create or replace function public._reaberturas_conversa(p_session_id text)
 returns table(reaberto_em timestamptz, eh_real boolean)
 language sql stable security definer set search_path to 'public'
as $f$
  with marcado as (
    select h.event_at, h.state,
      lag(h.state) over (order by h.event_at) as estado_anterior,
      case when h.state = 'resolved' then h.event_at end as resolved_ts
    from public.crisp_conversation_state_history h where h.session_id = p_session_id
  ),
  com_fecha as (
    select event_at, estado_anterior, state,
      coalesce(min(resolved_ts) over (order by event_at desc rows between unbounded preceding and 1 preceding), now()) as fecha_em
    from marcado
  )
  select c.event_at, exists (
      select 1 from public.crisp_messages m
      where m.session_id = p_session_id
        and m.message_timestamp >= c.event_at - interval '10 seconds' and m.message_timestamp < c.fecha_em
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
                         or q.content ilike '%Feedback em um clique%' or q.content ilike '%Feedback rápido%')))
    )
  from com_fecha c
  where c.estado_anterior = 'resolved' and c.state in ('pending','unresolved');
$f$;

-- Desfaz o "reinício" de ciclo causado por resposta à pesquisa de CSAT (uma conversa).
create or replace function public.corrigir_ciclo_pos_pesquisa(p_session_id text)
 returns table(inicio_antes timestamptz, inicio_depois timestamptz, alterado boolean)
 language plpgsql security definer set search_path to 'public' set statement_timeout to '30s'
as $f$
declare
  c public.crisp_conversations%rowtype;
  v_inicio timestamptz; v_resolvido timestamptz; v_reab int;
  v_fr timestamptz; v_fh timestamptz; v_fh_id text; v_fh_nome text;
begin
  select * into c from public.crisp_conversations cc where cc.crisp_id = p_session_id;
  if not found or c.status <> 'resolved' then return; end if;
  -- só mexe em conversa iniciada depois que o histórico de estado passou a ser gravado (18/08/2026)
  if c.started_at < timestamptz '2026-08-18 14:24:25+00' then return; end if;
  -- só mexe se o início atual está numa reabertura que NÃO é real (resposta à pesquisa)
  if not exists (select 1 from public._reaberturas_conversa(p_session_id) r
                 where not r.eh_real and abs(extract(epoch from r.reaberto_em - c.current_started_at)) <= 120)
     or exists (select 1 from public._reaberturas_conversa(p_session_id) r
                where r.eh_real and abs(extract(epoch from r.reaberto_em - c.current_started_at)) <= 120) then
    return query select c.current_started_at, c.current_started_at, false; return;
  end if;

  select greatest(c.started_at, max(r.reaberto_em) filter (where r.eh_real)),
         count(*) filter (where r.eh_real)
    into v_inicio, v_reab
    from public._reaberturas_conversa(p_session_id) r where r.reaberto_em < c.current_started_at - interval '120 seconds';
  select count(*) filter (where r.eh_real) into v_reab from public._reaberturas_conversa(p_session_id) r;

  select min(h.event_at) into v_resolvido from public.crisp_conversation_state_history h
   where h.session_id = p_session_id and h.state = 'resolved' and h.event_at >= v_inicio;
  if v_resolvido is null or v_inicio >= c.current_started_at then
    return query select c.current_started_at, c.current_started_at, false; return;
  end if;

  v_fr := c.first_response_at;
  if v_fr is null or v_fr < v_inicio or v_fr > v_resolvido then
    select min(m.message_timestamp) into v_fr from public.crisp_messages m
     where m.session_id = p_session_id and m.from_type = 'operator'
       and m.message_timestamp >= v_inicio and m.message_timestamp <= v_resolvido
       and not (m.content ilike '%greenn_csat%' or m.content ilike '%Como você avalia o atendimento%'
                or m.content ilike '%Obrigado pela sua avaliação%' or m.content ilike '%Muito obrigado pelo seu retorno%');
  end if;

  v_fh := c.first_human_response_at; v_fh_id := c.first_human_operator_crisp_id; v_fh_nome := c.first_human_operator_nome;
  if v_fh is null or v_fh < v_inicio or v_fh > v_resolvido then
    select m.message_timestamp, m.operator_crisp_id, m.operator_nome into v_fh, v_fh_id, v_fh_nome
      from public.crisp_messages m
     where m.session_id = p_session_id and m.from_type = 'operator'
       and m.operator_crisp_id is not null and m.operator_crisp_id <> 'ia_greenn'
       and not (coalesce(m.origin,'') ilike '%crisp.im:bot%' or coalesce(m.origin,'') ilike '%allan.godoy%'
                or coalesce(m.operator_nome,'') ilike 'Atendente IA%')
       and coalesce(m.content,'') not ilike '%não recebemos novas mensagens neste chamado%'
       and m.message_timestamp >= v_inicio and m.message_timestamp <= v_resolvido
     order by m.message_timestamp limit 1;
    if not found then v_fh := null; v_fh_id := null; v_fh_nome := null; end if;
  end if;

  update public.crisp_conversations cc set
    current_started_at = v_inicio,
    reopened_count = v_reab,
    resolved_at = v_resolvido,
    resolution_time = extract(epoch from v_resolvido - v_inicio)::int,
    resolution_time_minutes = floor(extract(epoch from v_resolvido - v_inicio) / 60)::int,
    first_response_at = v_fr,
    first_response_time = case when v_fr is null then null else extract(epoch from v_fr - v_inicio)::int end,
    first_response_time_minutes = case when v_fr is null then null else floor(extract(epoch from v_fr - v_inicio) / 60)::int end,
    first_human_response_at = v_fh,
    first_human_response_time = case when v_fh is null then null else extract(epoch from v_fh - v_inicio)::int end,
    first_human_response_time_minutes = case when v_fh is null then null else floor(extract(epoch from v_fh - v_inicio) / 60)::int end,
    first_human_operator_crisp_id = v_fh_id,
    first_human_operator_nome = v_fh_nome
  where cc.crisp_id = p_session_id;

  return query select c.current_started_at, v_inicio, true;
end $f$;

revoke execute on function public._reaberturas_conversa(text) from public, anon, authenticated;
revoke execute on function public.corrigir_ciclo_pos_pesquisa(text) from public, anon, authenticated;
grant execute on function public.corrigir_ciclo_pos_pesquisa(text) to service_role;
create table public._bkp_ciclo_pesquisa_2026_09_25 as
  select * from public.crisp_conversations cc
  where cc.status = 'resolved' and cc.started_at >= '2026-08-18' and cc.current_started_at > cc.started_at + interval '2 minutes';
alter table public._bkp_ciclo_pesquisa_2026_09_25 enable row level security;
revoke all on public._bkp_ciclo_pesquisa_2026_09_25 from anon, authenticated;
create table public._res_ciclo_2026_09_25 as
  select b.crisp_id, r.* from public._bkp_ciclo_pesquisa_2026_09_25 b, lateral public.corrigir_ciclo_pos_pesquisa(b.crisp_id) r;
alter table public._res_ciclo_2026_09_25 enable row level security;
revoke all on public._res_ciclo_2026_09_25 from anon, authenticated;
commit;
