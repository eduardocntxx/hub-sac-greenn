-- Volta csat_envios_por_atendente à versão de 2026-10-05 (conta só linhas de csat_pending).
create or replace function public.csat_envios_por_atendente(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(atendente text, enviadas bigint, respondidas bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
$function$;
