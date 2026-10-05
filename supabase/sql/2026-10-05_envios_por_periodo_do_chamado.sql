-- csat_envios_por_atendente: a pesquisa pertence ao período do CHAMADO (current_started_at da conversa),
-- não ao dia em que foi disparada. Antes: p.created_at between data_inicio and data_fim (um backlog antigo
-- resolvido em massa em 28/09 inflou envios: IA 2.229, Ana 711 contra 410 chamados).
-- Mesma assinatura/colunas; dono continua sendo quem tinha a conversa no envio (csat_pending.operator_user_id).
-- Conversa que não está em crisp_conversations (anterior a 18/08) não tem período e fica de fora.
-- Rollback: 2026-10-05_envios_por_periodo_do_chamado_rollback.sql
create or replace function public.csat_envios_por_atendente(data_inicio timestamptz, data_fim timestamptz)
returns table(atendente text, enviadas bigint, respondidas bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(a.nome_canonico, nullif(p.operator_user_id,''), '(sem operador)'),
         count(*),
         count(*) filter (where exists (select 1 from csat_results r where r.crisp_id = p.session_id))
  from csat_pending p
  join crisp_conversations cc on cc.crisp_id = p.session_id
  left join operator_id_aliases a on a.operator_crisp_id = p.operator_user_id
  where cc.current_started_at between data_inicio and data_fim
    and public.is_admin()
    and not public.operador_fora_sac(p.operator_user_id)
    and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
  group by 1;
$$;
