-- csat_envios_por_atendente: "pesquisa enviada" deixa de depender só da linha de csat_pending.
-- Problema (2026-10-08, Ana Franca 30/09-06/10): 9 avaliações, 16 enviadas, 4 respondidas. O n8n apaga a linha de
-- csat_pending quando a pesquisa é respondida (nós "Resetar CSAT Pending"), então as respondidas sumiam da conta:
-- enviadas e respondidas ficavam subcontadas e a taxa de resposta saía errada.
-- Agora uma conversa conta como "enviada" se tem a mensagem da pesquisa no Crisp (não se apaga), OU linha em
-- csat_pending, OU avaliação (quem respondeu recebeu pesquisa). Operador = o da csat_pending (dono no envio) quando
-- existe; sem ela, o dono atual da conversa. Mesma assinatura e mesmos filtros (admin, teste, fora do SAC).
-- Rollback: 2026-10-08_csat_envios_por_mensagem_rollback.sql
create or replace function public.csat_envios_por_atendente(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(atendente text, enviadas bigint, respondidas bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select cc.crisp_id,
           cc.operator_crisp_id as dono_atual,
           p.operator_user_id as dono_envio,
           (p.session_id is not null) as tem_pending,
           exists (select 1 from public.csat_results r where r.crisp_id = cc.crisp_id) as respondida
    from public.crisp_conversations cc
    left join public.csat_pending p on p.session_id = cc.crisp_id
    where cc.started_at between data_inicio and data_fim
      and public.is_admin()
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
  ),
  env as (
    select b.*, coalesce(nullif(b.dono_envio, ''), b.dono_atual) as operador
    from base b
    where b.tem_pending or b.respondida
       or exists (select 1 from public.crisp_messages m
                  where m.session_id = b.crisp_id and m.from_type = 'operator'
                    and m.content ilike '%Como você avalia o atendimento que recebeu%')
  )
  select coalesce(a.nome_canonico, nullif(e.operador, ''), '(sem operador)'),
         count(*),
         count(*) filter (where e.respondida)
  from env e
  left join public.operator_id_aliases a on a.operator_crisp_id = e.operador
  where not public.operador_fora_sac(e.operador)
  group by 1;
$function$;
