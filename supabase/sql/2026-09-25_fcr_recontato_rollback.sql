-- Desfaz 2026-09-25_fcr_recontato.sql: volta a regra antiga (mesmo people_id + tópico idêntico, 7 dias).
begin;
CREATE OR REPLACE FUNCTION public.fcr_recontato_resumo(data_inicio timestamp with time zone, data_fim timestamp with time zone, p_canal text DEFAULT NULL::text, p_atendente_nomes text[] DEFAULT NULL::text[], p_tipo_cliente text DEFAULT NULL::text)
 RETURNS TABLE(total_elegiveis bigint, total_fcr bigint, fcr_pct numeric, total_recontato bigint, recontato_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_tipo_cliente is null then
    return query
  with elegiveis as (
    select cc.crisp_id, cc.people_id, cc.topico, cc.resolved_at
    from public.crisp_conversations cc
    where cc.resolved_at between data_inicio and data_fim
      and (public.pode_ver_overview() or (p_atendente_nomes is not null and array_length(p_atendente_nomes,1) = 1 and p_atendente_nomes[1] = (select u.nome from public.users u where u.id = public.current_app_user_id())))
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and cc.people_id is not null
      and cc.topico is not null
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
  ),
  marcado as (
    select
      e.crisp_id,
      exists (
        select 1
        from public.crisp_conversations outro
        where outro.people_id = e.people_id
          and outro.topico = e.topico
          and outro.crisp_id <> e.crisp_id
          and outro.current_started_at > e.resolved_at
          and outro.current_started_at <= e.resolved_at + interval '7 days'
      ) as tem_recontato
    from elegiveis e
  )
  select
    count(*),
    count(*) filter (where not tem_recontato),
    round((count(*) filter (where not tem_recontato))::numeric / nullif(count(*), 0) * 100, 1),
    count(*) filter (where tem_recontato),
    round((count(*) filter (where tem_recontato))::numeric / nullif(count(*), 0) * 100, 1)
  from marcado;
  else
    return query
  with elegiveis as (
    select cc.crisp_id, cc.people_id, cc.topico, cc.resolved_at
    from public.crisp_conversations cc
    where cc.resolved_at between data_inicio and data_fim
      and (public.pode_ver_overview() or (p_atendente_nomes is not null and array_length(p_atendente_nomes,1) = 1 and p_atendente_nomes[1] = (select u.nome from public.users u where u.id = public.current_app_user_id())))
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and cc.people_id is not null
      and cc.topico is not null
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  ),
  marcado as (
    select
      e.crisp_id,
      exists (
        select 1
        from public.crisp_conversations outro
        where outro.people_id = e.people_id
          and outro.topico = e.topico
          and outro.crisp_id <> e.crisp_id
          and outro.current_started_at > e.resolved_at
          and outro.current_started_at <= e.resolved_at + interval '7 days'
      ) as tem_recontato
    from elegiveis e
  )
  select
    count(*),
    count(*) filter (where not tem_recontato),
    round((count(*) filter (where not tem_recontato))::numeric / nullif(count(*), 0) * 100, 1),
    count(*) filter (where tem_recontato),
    round((count(*) filter (where tem_recontato))::numeric / nullif(count(*), 0) * 100, 1)
  from marcado;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recontato_casos(data_inicio timestamp with time zone, data_fim timestamp with time zone, p_canal text DEFAULT NULL::text, p_atendente_nomes text[] DEFAULT NULL::text[], p_tipo_cliente text DEFAULT NULL::text)
 RETURNS TABLE(crisp_id text, cliente_nome text, topico text, atendente text, resolved_at timestamp with time zone, proximo_contato_at timestamp with time zone, link_chamado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with elegiveis as (
    select cc.crisp_id, cc.cliente_nome, cc.people_id, cc.topico, cc.resolved_at,
      public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) as atendente,
      cc.link_chamado
    from public.crisp_conversations cc
    where cc.resolved_at between data_inicio and data_fim
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.is_admin()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and cc.people_id is not null
      and cc.topico is not null
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  )
  select
    e.crisp_id, e.cliente_nome, e.topico, e.atendente, e.resolved_at,
    (
      select min(outro.current_started_at)
      from public.crisp_conversations outro
      where outro.people_id = e.people_id
        and outro.topico = e.topico
        and outro.crisp_id <> e.crisp_id
        and outro.current_started_at > e.resolved_at
        and outro.current_started_at <= e.resolved_at + interval '7 days'
    ) as proximo_contato_at,
    e.link_chamado
  from elegiveis e
  where exists (
    select 1
    from public.crisp_conversations outro
    where outro.people_id = e.people_id
      and outro.topico = e.topico
      and outro.crisp_id <> e.crisp_id
      and outro.current_started_at > e.resolved_at
      and outro.current_started_at <= e.resolved_at + interval '7 days'
  )
  and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or e.atendente = any(p_atendente_nomes))
  order by e.resolved_at desc;
$function$;

commit;
