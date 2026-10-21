-- Rollback de 2026-10-14_backlog_aguardando_cliente.sql.
-- Volta backlog_por_idade e backlog_casos sem a coluna aguardando_cliente (o front novo só esconde a informação).

begin;

drop function if exists public.backlog_por_idade(text, text[], text);

create function public.backlog_por_idade(p_canal text default null::text, p_atendente_nomes text[] default null::text[], p_tipo_cliente text default null::text)
 returns table(faixa text, total bigint, com_humano bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if p_tipo_cliente is null then
    return query
  with base as (
    select cc.first_human_operator_crisp_id, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
  )
  select
    case
      when b.idade_dias <= 1 then '0-1 dia'
      when b.idade_dias <= 3 then '2-3 dias'
      when b.idade_dias <= 7 then '4-7 dias'
      else '+7 dias'
    end,
    count(*),
    count(*) filter (where b.first_human_operator_crisp_id is not null)
  from base b
  group by 1;
  else
    return query
  with base as (
    select cc.first_human_operator_crisp_id, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  )
  select
    case
      when b.idade_dias <= 1 then '0-1 dia'
      when b.idade_dias <= 3 then '2-3 dias'
      when b.idade_dias <= 7 then '4-7 dias'
      else '+7 dias'
    end,
    count(*),
    count(*) filter (where b.first_human_operator_crisp_id is not null)
  from base b
  group by 1;
  end if;
end;
$function$;

revoke all on function public.backlog_por_idade(text, text[], text) from public, anon;
grant execute on function public.backlog_por_idade(text, text[], text) to authenticated, service_role;

drop function if exists public.backlog_casos(text, text, text[], integer, integer, text, text);

create function public.backlog_casos(p_faixa text, p_canal text default null::text, p_atendente_nomes text[] default null::text[], p_limit integer default 15, p_offset integer default 0, p_direcao text default 'asc'::text, p_tipo_cliente text default null::text)
 returns table(crisp_id text, cliente_nome text, operator_nome text, topico text, canal text, status text, current_started_at timestamp with time zone, idade_dias numeric, link_chamado text, total_count bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select cc.*, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias_calc
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.is_admin()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  ),
  filtrado as (
    select b.*
    from base b
    where case
        when p_faixa = '0-1 dia' then b.idade_dias_calc <= 1
        when p_faixa = '2-3 dias' then b.idade_dias_calc > 1 and b.idade_dias_calc <= 3
        when p_faixa = '4-7 dias' then b.idade_dias_calc > 3 and b.idade_dias_calc <= 7
        when p_faixa = '+7 dias' then b.idade_dias_calc > 7
        else false
      end
  )
  select
    f.crisp_id, f.cliente_nome,
    public.nome_canonico_por_operator_id(f.operator_crisp_id, f.operator_nome),
    f.topico, public.canal_normalizado(f.canal) as canal, f.status, f.current_started_at,
    round(f.idade_dias_calc::numeric, 1),
    f.link_chamado,
    count(*) over() as total_count
  from filtrado f
  order by (case when p_direcao = 'desc' then f.current_started_at end) desc,
           (case when coalesce(p_direcao, 'asc') = 'asc' then f.current_started_at end) asc
  limit p_limit offset p_offset;
$function$;

revoke all on function public.backlog_casos(text, text, text[], integer, integer, text, text) from public, anon;
grant execute on function public.backlog_casos(text, text, text[], integer, integer, text, text) to authenticated, service_role;

commit;
