-- Funil de CSAT / pesquisas por atendente / resolvidas após 24h: a população passa a ser "conversas que
-- NASCERAM no período" (started_at, que nunca muda) — a mesma do card "Total de conversas" do slide Crisp.
-- Antes usavam current_started_at (início do ciclo atual, que anda quando o cliente volta a escrever): o funil
-- dava 2.106 contra 1.987 do card, e as conversas "entravam e saíam" do período conforme eram redatadas.
-- Tempo até resolver (resolvidas_apos_24h) segue medido do ciclo atual (resolved_at - current_started_at).
-- Rollback: 2026-10-05_funil_conversas_por_nascimento_rollback.sql
create or replace function public.csat_funil_canal(data_inicio timestamptz, data_fim timestamptz)
returns table(canal text, conversas bigint, com_humano bigint, resolvidas bigint, enviadas bigint, respondidas bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.canal_normalizado(cc.canal), 'Outros'),
         count(*),
         count(*) filter (where cc.first_human_operator_crisp_id is not null),
         count(*) filter (where cc.status = 'resolved'),
         count(*) filter (where cc.status = 'resolved' and exists (select 1 from public.csat_pending p where p.session_id = cc.crisp_id)),
         count(*) filter (where exists (select 1 from public.csat_results r where r.crisp_id = cc.crisp_id))
  from public.crisp_conversations cc
  where cc.started_at between data_inicio and data_fim
    and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
    and not public.operador_fora_sac(cc.operator_crisp_id)
    and public.pode_ver_overview()
  group by 1
  order by 2 desc;
$$;

create or replace function public.csat_envios_por_atendente(data_inicio timestamptz, data_fim timestamptz)
returns table(atendente text, enviadas bigint, respondidas bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(a.nome_canonico, nullif(p.operator_user_id,''), '(sem operador)'),
         count(*),
         count(*) filter (where exists (select 1 from csat_results r where r.crisp_id = p.session_id))
  from csat_pending p
  join crisp_conversations cc on cc.crisp_id = p.session_id
  left join operator_id_aliases a on a.operator_crisp_id = p.operator_user_id
  where cc.started_at between data_inicio and data_fim
    and public.is_admin()
    and not public.operador_fora_sac(p.operator_user_id)
    and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
  group by 1;
$$;

create or replace function public.resolvidas_apos_24h(data_inicio timestamptz, data_fim timestamptz)
returns table(canal text, resolvidas bigint, apos_24h bigint, ate_24h bigint, de_24_48h bigint, de_48_72h bigint, mais_72h bigint)
language sql stable security definer set search_path = public as $$
  with r as (
    select coalesce(public.canal_normalizado(cc.canal), 'Outros') as canal,
           cc.resolved_at - cc.current_started_at as dur
    from public.crisp_conversations cc
    where cc.started_at between data_inicio and data_fim
      and cc.status = 'resolved'
      and cc.resolved_at >= cc.current_started_at
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
      and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.pode_ver_overview()
  )
  select canal, count(*),
         count(*) filter (where dur > interval '24 hours'),
         count(*) filter (where dur <= interval '24 hours'),
         count(*) filter (where dur > interval '24 hours' and dur <= interval '48 hours'),
         count(*) filter (where dur > interval '48 hours' and dur <= interval '72 hours'),
         count(*) filter (where dur > interval '72 hours')
  from r group by canal order by 2 desc;
$$;
