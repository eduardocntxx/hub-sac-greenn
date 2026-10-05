create or replace function public.csat_envios_por_atendente(data_inicio timestamptz, data_fim timestamptz)
returns table(atendente text, enviadas bigint, respondidas bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(a.nome_canonico, nullif(p.operator_user_id,''), '(sem operador)'),
         count(*),
         count(*) filter (where exists (select 1 from csat_results r where r.crisp_id = p.session_id))
  from csat_pending p
  left join operator_id_aliases a on a.operator_crisp_id = p.operator_user_id
  where p.created_at between data_inicio and data_fim
    and public.is_admin()
    and not public.operador_fora_sac(p.operator_user_id)
  group by 1;
$$;
