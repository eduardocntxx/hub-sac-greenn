-- Desfaz 2026-10-20_fcr_recontato_plano.sql: volta a definição anterior de fcr_recontato_resumo (sem materialized).
CREATE OR REPLACE FUNCTION public.fcr_recontato_resumo(data_inicio timestamp with time zone, data_fim timestamp with time zone, p_canal text DEFAULT NULL::text, p_atendente_nomes text[] DEFAULT NULL::text[], p_tipo_cliente text DEFAULT NULL::text)
 RETURNS TABLE(total_elegiveis bigint, total_fcr bigint, fcr_pct numeric, total_recontato bigint, recontato_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_tipo_cliente is null then
    return query
  with base as (
    select cc.crisp_id, cc.cliente_nome, cc.topico, cc.link_chamado, cc.people_id,
      lower(nullif(btrim(cc.cliente_email), '')) as email,
      public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) as atendente,
      coalesce(cc.first_resolved_at, cc.resolved_at) as ref
    from public.crisp_conversations cc
    where (cc.resolved_at >= data_inicio or cc.first_resolved_at >= data_inicio)
      and (public.pode_ver_overview() or (p_atendente_nomes is not null and array_length(p_atendente_nomes,1) = 1 and p_atendente_nomes[1] = (select u.nome from public.users u where u.id = public.current_app_user_id())))
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      
  ),
  elegiveis as (
    select b.* from base b
    where b.ref between data_inicio and data_fim
      and (b.people_id is not null or b.email is not null)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or b.atendente = any(p_atendente_nomes))
  ),
  outras as (
    select o.crisp_id, o.people_id, lower(nullif(btrim(o.cliente_email), '')) as email, o.started_at, o.current_started_at
    from public.crisp_conversations o
    where o.current_started_at > data_inicio and o.started_at <= data_fim + interval '7 days'
  ),
  voltas as (
    select e.crisp_id, least(case when o.started_at > e.ref then o.started_at end,
                             case when o.current_started_at > e.ref then o.current_started_at end) as quando, e.ref
    from elegiveis e join outras o on o.people_id = e.people_id and o.crisp_id <> e.crisp_id
    union all
    select e.crisp_id, least(case when o.started_at > e.ref then o.started_at end,
                             case when o.current_started_at > e.ref then o.current_started_at end), e.ref
    from elegiveis e join outras o on o.email = e.email and o.crisp_id <> e.crisp_id
  ),
  nova as (
    select v.crisp_id, min(v.quando) as prox from voltas v
    where v.quando <= v.ref + interval '7 days'
    group by v.crisp_id
  ),
  reab as (
    select e.crisp_id from elegiveis e
    where exists (select 1 from public._reaberturas_conversa(e.crisp_id) r
                  where r.eh_real and r.reaberto_em > e.ref and r.reaberto_em <= e.ref + interval '7 days')
  )
  select
    count(*),
    count(*) filter (where n.crisp_id is null and r.crisp_id is null),
    round((count(*) filter (where n.crisp_id is null and r.crisp_id is null))::numeric / nullif(count(*), 0) * 100, 1),
    count(n.crisp_id),
    round(count(n.crisp_id)::numeric / nullif(count(*), 0) * 100, 1)
  from elegiveis e left join nova n on n.crisp_id = e.crisp_id left join reab r on r.crisp_id = e.crisp_id;
  else
    return query
  with base as (
    select cc.crisp_id, cc.cliente_nome, cc.topico, cc.link_chamado, cc.people_id,
      lower(nullif(btrim(cc.cliente_email), '')) as email,
      public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) as atendente,
      coalesce(cc.first_resolved_at, cc.resolved_at) as ref
    from public.crisp_conversations cc
    where (cc.resolved_at >= data_inicio or cc.first_resolved_at >= data_inicio)
      and (public.pode_ver_overview() or (p_atendente_nomes is not null and array_length(p_atendente_nomes,1) = 1 and p_atendente_nomes[1] = (select u.nome from public.users u where u.id = public.current_app_user_id())))
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  ),
  elegiveis as (
    select b.* from base b
    where b.ref between data_inicio and data_fim
      and (b.people_id is not null or b.email is not null)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or b.atendente = any(p_atendente_nomes))
  ),
  outras as (
    select o.crisp_id, o.people_id, lower(nullif(btrim(o.cliente_email), '')) as email, o.started_at, o.current_started_at
    from public.crisp_conversations o
    where o.current_started_at > data_inicio and o.started_at <= data_fim + interval '7 days'
  ),
  voltas as (
    select e.crisp_id, least(case when o.started_at > e.ref then o.started_at end,
                             case when o.current_started_at > e.ref then o.current_started_at end) as quando, e.ref
    from elegiveis e join outras o on o.people_id = e.people_id and o.crisp_id <> e.crisp_id
    union all
    select e.crisp_id, least(case when o.started_at > e.ref then o.started_at end,
                             case when o.current_started_at > e.ref then o.current_started_at end), e.ref
    from elegiveis e join outras o on o.email = e.email and o.crisp_id <> e.crisp_id
  ),
  nova as (
    select v.crisp_id, min(v.quando) as prox from voltas v
    where v.quando <= v.ref + interval '7 days'
    group by v.crisp_id
  ),
  reab as (
    select e.crisp_id from elegiveis e
    where exists (select 1 from public._reaberturas_conversa(e.crisp_id) r
                  where r.eh_real and r.reaberto_em > e.ref and r.reaberto_em <= e.ref + interval '7 days')
  )
  select
    count(*),
    count(*) filter (where n.crisp_id is null and r.crisp_id is null),
    round((count(*) filter (where n.crisp_id is null and r.crisp_id is null))::numeric / nullif(count(*), 0) * 100, 1),
    count(n.crisp_id),
    round(count(n.crisp_id)::numeric / nullif(count(*), 0) * 100, 1)
  from elegiveis e left join nova n on n.crisp_id = e.crisp_id left join reab r on r.crisp_id = e.crisp_id;
  end if;
end;
$function$;
