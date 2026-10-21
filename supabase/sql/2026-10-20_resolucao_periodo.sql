-- Cartão "Conversas resolvidas" do Overview na mesma base de "Chamados" (2026-10-20).
--
-- O cartão mostrava reabertura_por_tipo_cliente.total_resolvidos (conversas com resolução no período, venham de quando
-- vierem, + as que só foram reabertas no período) dividido pelas conversas que começaram no período: em 19–20/10 deu
-- 342 de 268 (127,6%). Os dois números medem coisas diferentes:
--   - resolvidas: das conversas que começaram no período (mesma base de contagem_periodo.total_conversas), quantas
--     estão resolvidas agora. 19–20/10: 122 de 268, igual ao funil do CSAT.
--   - fechadas: conversas com resolução dentro do período (evento resolved em state_history ou first_resolved_at /
--     resolved_at no período), sem as só reabertas. 19–20/10: 301, das quais 176 começaram antes do período.
-- reabertura_por_tipo_cliente não muda: o "total_resolvidos" dela continua sendo o denominador da taxa de reabertura.
--
-- Custo medido: ~0,25 s para 2 dias e para 30 dias (3 execuções, cache quente).
-- Rollback: 2026-10-20_resolucao_periodo_rollback.sql

begin;

create function public.resolucao_periodo(data_inicio timestamp with time zone, data_fim timestamp with time zone, p_canal text default null::text, p_atendente_nomes text[] default null::text[], p_tipo_cliente text default null::text)
 returns table(conversas bigint, resolvidas bigint, fechadas bigint, fechadas_de_antes bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
 set statement_timeout to '45s'
as $function$
begin
  if p_tipo_cliente is null then
    return query
    with filtradas as (
      select cc.crisp_id, cc.started_at, cc.status
      from public.crisp_conversations cc
      where public.pode_ver_overview()
        and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
        and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
        and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
    ),
    fechadas_periodo as (
      select h.session_id as crisp_id
      from public.crisp_conversation_state_history h
      where h.state = 'resolved' and h.event_at between data_inicio and data_fim
      union
      select cc.crisp_id
      from public.crisp_conversations cc
      where cc.first_resolved_at between data_inicio and data_fim or cc.resolved_at between data_inicio and data_fim
    )
    select count(*) filter (where f.started_at between data_inicio and data_fim),
           count(*) filter (where f.started_at between data_inicio and data_fim and f.status = 'resolved'),
           count(*) filter (where fp.crisp_id is not null),
           count(*) filter (where fp.crisp_id is not null and f.started_at < data_inicio)
    from filtradas f
    left join fechadas_periodo fp on fp.crisp_id = f.crisp_id;
  else
    return query
    with filtradas as (
      select cc.crisp_id, cc.started_at, cc.status
      from public.crisp_conversations cc
      where public.pode_ver_overview()
        and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
        and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
        and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
        and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
    ),
    fechadas_periodo as (
      select h.session_id as crisp_id
      from public.crisp_conversation_state_history h
      where h.state = 'resolved' and h.event_at between data_inicio and data_fim
      union
      select cc.crisp_id
      from public.crisp_conversations cc
      where cc.first_resolved_at between data_inicio and data_fim or cc.resolved_at between data_inicio and data_fim
    )
    select count(*) filter (where f.started_at between data_inicio and data_fim),
           count(*) filter (where f.started_at between data_inicio and data_fim and f.status = 'resolved'),
           count(*) filter (where fp.crisp_id is not null),
           count(*) filter (where fp.crisp_id is not null and f.started_at < data_inicio)
    from filtradas f
    left join fechadas_periodo fp on fp.crisp_id = f.crisp_id;
  end if;
end;
$function$;

revoke all on function public.resolucao_periodo(timestamp with time zone, timestamp with time zone, text, text[], text) from public, anon;
grant execute on function public.resolucao_periodo(timestamp with time zone, timestamp with time zone, text, text[], text) to authenticated, service_role;

commit;
