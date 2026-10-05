-- Funil de CSAT: por canal, chamados resolvidos após 24h e distribuição por janela de tempo até a
-- resolução (até 24h / 24–48h / 48–72h / +72h), só das conversas iniciadas no período filtrado.
-- Demora = resolved_at - current_started_at (horas corridas, mesma âncora do TTR).
-- Mesmos filtros das demais funções de métrica; acesso como o funil (pode_ver_overview()).
-- Rollback: 2026-10-02_resolvidas_apos_24h_rollback.sql
drop function if exists public.resolvidas_apos_24h(timestamptz, timestamptz);
create function public.resolvidas_apos_24h(data_inicio timestamptz, data_fim timestamptz)
returns table(canal text, resolvidas bigint, apos_24h bigint, ate_24h bigint, de_24_48h bigint, de_48_72h bigint, mais_72h bigint)
language sql stable security definer set search_path = public as $$
  with r as (
    select coalesce(public.canal_normalizado(cc.canal), 'Outros') as canal,
           cc.resolved_at - cc.current_started_at as dur
    from public.crisp_conversations cc
    where cc.current_started_at between data_inicio and data_fim
      and cc.status = 'resolved'
      and cc.resolved_at >= cc.current_started_at
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
      and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.pode_ver_overview()
  )
  select canal,
         count(*),
         count(*) filter (where dur > interval '24 hours'),
         count(*) filter (where dur <= interval '24 hours'),
         count(*) filter (where dur > interval '24 hours' and dur <= interval '48 hours'),
         count(*) filter (where dur > interval '48 hours' and dur <= interval '72 hours'),
         count(*) filter (where dur > interval '72 hours')
  from r group by canal order by 2 desc;
$$;
revoke all on function public.resolvidas_apos_24h(timestamptz, timestamptz) from public, anon;
grant execute on function public.resolvidas_apos_24h(timestamptz, timestamptz) to authenticated;
