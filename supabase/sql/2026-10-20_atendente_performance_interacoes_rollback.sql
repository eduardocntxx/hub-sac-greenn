-- Desfaz 2026-10-20_atendente_performance_interacoes.sql: volta a definição anterior de _atendente_performance_base.
CREATE OR REPLACE FUNCTION public._atendente_performance_base(data_inicio timestamp with time zone, data_fim timestamp with time zone, p_canal text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_modo_tempo text DEFAULT 'uteis'::text, p_tipo_cliente text DEFAULT NULL::text)
 RETURNS TABLE(operator_nome text, operator_email text, total_atendimentos bigint, tfr_medio numeric, tempo_resolucao_medio numeric, csat_medio numeric, total_avaliacoes bigint, total_interacoes bigint, total_mensagens bigint, posicao bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_tipo_cliente is null then
    return query
  with humanas as (
    select * from public._primeiras_respostas_humanas(data_inicio, data_fim)
  ),
  base as (
    select
      cc.*,
      h.primeira_resposta_humana_at,
      h.primeiro_atendente_humano,
      h.primeiro_atendente_humano_crisp_id,
      public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) as nome_exibicao,
      case when cc.resolved_at is not null and cc.resolved_at >= cc.current_started_at then
        case when p_modo_tempo = 'corridas'
          then extract(epoch from (cc.resolved_at - cc.current_started_at)) / 60
          else (
            select coalesce(sum(extract(epoch from (upper(parte) - lower(parte)))), 0) / 60
            from generate_series(
              (cc.current_started_at at time zone 'America/Sao_Paulo')::date,
              (cc.resolved_at at time zone 'America/Sao_Paulo')::date,
              interval '1 day'
            ) as gs(dia)
            join public.cobertura_semanal cs on cs.dow = extract(dow from gs.dia)::int and not exists (select 1 from public.calendar_holidays ch where ch.data = gs.dia)
            cross join lateral unnest(cs.cobertura) as r
            cross join lateral unnest(
              tsmultirange(tsrange(gs.dia::date::timestamp + make_interval(mins => lower(r)), gs.dia::date::timestamp + make_interval(mins => upper(r))))
              * tsmultirange(tsrange(cc.current_started_at at time zone 'America/Sao_Paulo', cc.resolved_at at time zone 'America/Sao_Paulo'))
            ) as parte
          )
        end
      end as resolucao_min,
      case when h.primeira_resposta_humana_at is not null and h.primeira_resposta_humana_at >= cc.current_started_at then
        case when p_modo_tempo = 'corridas'
          then extract(epoch from (h.primeira_resposta_humana_at - cc.current_started_at)) / 60
          else (
            select coalesce(sum(extract(epoch from (upper(parte) - lower(parte)))), 0) / 60
            from generate_series(
              (cc.current_started_at at time zone 'America/Sao_Paulo')::date,
              (h.primeira_resposta_humana_at at time zone 'America/Sao_Paulo')::date,
              interval '1 day'
            ) as gs(dia)
            join public.cobertura_semanal cs on cs.dow = extract(dow from gs.dia)::int and not exists (select 1 from public.calendar_holidays ch where ch.data = gs.dia)
            cross join lateral unnest(cs.cobertura) as r
            cross join lateral unnest(
              tsmultirange(tsrange(gs.dia::date::timestamp + make_interval(mins => lower(r)), gs.dia::date::timestamp + make_interval(mins => upper(r))))
              * tsmultirange(tsrange(cc.current_started_at at time zone 'America/Sao_Paulo', h.primeira_resposta_humana_at at time zone 'America/Sao_Paulo'))
            ) as parte
          )
        end
      end as tfr_resp_min
    from public.crisp_conversations cc
    left join humanas h on h.session_id = cc.crisp_id
    where cc.current_started_at between data_inicio and data_fim
      and public.pode_ver_overview()
      and cc.operator_nome is not null
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_status is null or cc.status = p_status)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
  ),
  volume as (
    select
      nome_exibicao as operator_nome,
      max(base.operator_email) as operator_email,
      sum(1 + coalesce(reopened_count, 0)) as total_atendimentos,
      round(avg(resolucao_min)::numeric, 1) as tempo_resolucao_medio
    from base
    group by nome_exibicao
  ),
  tfr_por_respondente as (
    select
      public.nome_canonico_por_operator_id(primeiro_atendente_humano_crisp_id, primeiro_atendente_humano) as atendente,
      round(avg(tfr_resp_min)::numeric, 1) as tfr_medio
    from base
    where primeiro_atendente_humano is not null
    group by 1
  ),
  csat as (
    select atendente, round(avg(nota)::numeric, 2) as csat_medio, count(nota) as total_avaliacoes
    from public.csat_results
    where coalesce((select cc.started_at from public.crisp_conversations cc where cc.crisp_id = csat_results.crisp_id), csat_results.data_hora) between data_inicio and data_fim
      and not public.cliente_e_teste(cliente, email) and not public.csat_atendente_fora_sac(email_atendente)
    group by atendente
  ),
  -- "Interações": quantos chamados o atendente mandou mensagem no período,
  -- independente de quando o ciclo (current_started_at) começou. Diferente
  -- de "Chamados" (que só conta ciclo novo no período) — cobre também
  -- chamados que começaram antes mas em que ele trabalhou dentro do
  -- período selecionado. Pedido do usuário pra bater com o que o painel
  -- nativo do Crisp mostra (conversas com atividade no período).
  interacoes as (
    select
      public.nome_canonico_por_operator_id(m.operator_crisp_id, m.operator_nome) as operator_nome,
      count(distinct m.session_id) as total_interacoes,
      count(*) as total_mensagens
    from public.crisp_messages m
    join public.crisp_conversations cc on cc.crisp_id = m.session_id
    where m.message_timestamp between data_inicio and data_fim
      and m.operator_crisp_id is not null
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_status is null or cc.status = p_status)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
    group by 1
  )
  select
    v.operator_nome, v.operator_email, v.total_atendimentos,
    t.tfr_medio, v.tempo_resolucao_medio,
    s.csat_medio, coalesce(s.total_avaliacoes, 0) as total_avaliacoes,
    coalesce(i.total_interacoes, 0) as total_interacoes,
    coalesce(i.total_mensagens, 0) as total_mensagens,
    row_number() over (order by v.total_atendimentos desc) as posicao
  from volume v
  left join tfr_por_respondente t on t.atendente = v.operator_nome
  left join csat s on s.atendente = v.operator_nome
  left join interacoes i on i.operator_nome = v.operator_nome
  order by posicao;
  else
    return query
  with humanas as (
    select * from public._primeiras_respostas_humanas(data_inicio, data_fim)
  ),
  base as (
    select
      cc.*,
      h.primeira_resposta_humana_at,
      h.primeiro_atendente_humano,
      h.primeiro_atendente_humano_crisp_id,
      public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) as nome_exibicao,
      case when cc.resolved_at is not null and cc.resolved_at >= cc.current_started_at then
        case when p_modo_tempo = 'corridas'
          then extract(epoch from (cc.resolved_at - cc.current_started_at)) / 60
          else (
            select coalesce(sum(extract(epoch from (upper(parte) - lower(parte)))), 0) / 60
            from generate_series(
              (cc.current_started_at at time zone 'America/Sao_Paulo')::date,
              (cc.resolved_at at time zone 'America/Sao_Paulo')::date,
              interval '1 day'
            ) as gs(dia)
            join public.cobertura_semanal cs on cs.dow = extract(dow from gs.dia)::int and not exists (select 1 from public.calendar_holidays ch where ch.data = gs.dia)
            cross join lateral unnest(cs.cobertura) as r
            cross join lateral unnest(
              tsmultirange(tsrange(gs.dia::date::timestamp + make_interval(mins => lower(r)), gs.dia::date::timestamp + make_interval(mins => upper(r))))
              * tsmultirange(tsrange(cc.current_started_at at time zone 'America/Sao_Paulo', cc.resolved_at at time zone 'America/Sao_Paulo'))
            ) as parte
          )
        end
      end as resolucao_min,
      case when h.primeira_resposta_humana_at is not null and h.primeira_resposta_humana_at >= cc.current_started_at then
        case when p_modo_tempo = 'corridas'
          then extract(epoch from (h.primeira_resposta_humana_at - cc.current_started_at)) / 60
          else (
            select coalesce(sum(extract(epoch from (upper(parte) - lower(parte)))), 0) / 60
            from generate_series(
              (cc.current_started_at at time zone 'America/Sao_Paulo')::date,
              (h.primeira_resposta_humana_at at time zone 'America/Sao_Paulo')::date,
              interval '1 day'
            ) as gs(dia)
            join public.cobertura_semanal cs on cs.dow = extract(dow from gs.dia)::int and not exists (select 1 from public.calendar_holidays ch where ch.data = gs.dia)
            cross join lateral unnest(cs.cobertura) as r
            cross join lateral unnest(
              tsmultirange(tsrange(gs.dia::date::timestamp + make_interval(mins => lower(r)), gs.dia::date::timestamp + make_interval(mins => upper(r))))
              * tsmultirange(tsrange(cc.current_started_at at time zone 'America/Sao_Paulo', h.primeira_resposta_humana_at at time zone 'America/Sao_Paulo'))
            ) as parte
          )
        end
      end as tfr_resp_min
    from public.crisp_conversations cc
    left join humanas h on h.session_id = cc.crisp_id
    where cc.current_started_at between data_inicio and data_fim
      and public.pode_ver_overview()
      and cc.operator_nome is not null
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_status is null or cc.status = p_status)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  ),
  volume as (
    select
      nome_exibicao as operator_nome,
      max(base.operator_email) as operator_email,
      sum(1 + coalesce(reopened_count, 0)) as total_atendimentos,
      round(avg(resolucao_min)::numeric, 1) as tempo_resolucao_medio
    from base
    group by nome_exibicao
  ),
  tfr_por_respondente as (
    select
      public.nome_canonico_por_operator_id(primeiro_atendente_humano_crisp_id, primeiro_atendente_humano) as atendente,
      round(avg(tfr_resp_min)::numeric, 1) as tfr_medio
    from base
    where primeiro_atendente_humano is not null
    group by 1
  ),
  csat as (
    select atendente, round(avg(nota)::numeric, 2) as csat_medio, count(nota) as total_avaliacoes
    from public.csat_results
    where coalesce((select cc.started_at from public.crisp_conversations cc where cc.crisp_id = csat_results.crisp_id), csat_results.data_hora) between data_inicio and data_fim
      and not public.cliente_e_teste(cliente, email) and not public.csat_atendente_fora_sac(email_atendente)
    group by atendente
  ),
  -- "Interações": quantos chamados o atendente mandou mensagem no período,
  -- independente de quando o ciclo (current_started_at) começou. Diferente
  -- de "Chamados" (que só conta ciclo novo no período) — cobre também
  -- chamados que começaram antes mas em que ele trabalhou dentro do
  -- período selecionado. Pedido do usuário pra bater com o que o painel
  -- nativo do Crisp mostra (conversas com atividade no período).
  interacoes as (
    select
      public.nome_canonico_por_operator_id(m.operator_crisp_id, m.operator_nome) as operator_nome,
      count(distinct m.session_id) as total_interacoes,
      count(*) as total_mensagens
    from public.crisp_messages m
    join public.crisp_conversations cc on cc.crisp_id = m.session_id
    where m.message_timestamp between data_inicio and data_fim
      and m.operator_crisp_id is not null
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_status is null or cc.status = p_status)
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
    group by 1
  )
  select
    v.operator_nome, v.operator_email, v.total_atendimentos,
    t.tfr_medio, v.tempo_resolucao_medio,
    s.csat_medio, coalesce(s.total_avaliacoes, 0) as total_avaliacoes,
    coalesce(i.total_interacoes, 0) as total_interacoes,
    coalesce(i.total_mensagens, 0) as total_mensagens,
    row_number() over (order by v.total_atendimentos desc) as posicao
  from volume v
  left join tfr_por_respondente t on t.atendente = v.operator_nome
  left join csat s on s.atendente = v.operator_nome
  left join interacoes i on i.operator_nome = v.operator_nome
  order by posicao;
  end if;
end;
$function$;
