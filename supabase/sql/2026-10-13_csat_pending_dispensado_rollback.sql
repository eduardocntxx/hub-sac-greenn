-- Rollback de 2026-10-13_csat_pending_dispensado.sql.
-- Restaura csat_envios_por_atendente e csat_funil_canal como estavam antes da migração e remove a coluna.
-- Ordem importa: funções primeiro (elas leem p.dispensado), coluna por último.
-- Antes de rodar: desativar/remover no n8n os nós "Dispensar CSAT (Resolver sem avaliação)" e, se aplicado,
-- o campo dispensado do nó "Salvar CSAT Pending (Atômico - Manual)", senão o insert dá 400 (coluna inexistente).
-- Efeito nos números: linhas que tinham dispensado = true voltam a contar como "pesquisa enviada".

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

create or replace function public.csat_funil_canal(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(canal text, conversas bigint, com_humano bigint, resolvidas bigint, enviadas bigint, respondidas bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
$function$;

alter table public.csat_pending drop column if exists dispensado;
