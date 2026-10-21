-- csat_pending.dispensado: conversa resolvida SEM pesquisa (botão "Resolver sem avaliação" do widget CSAT do Crisp).
-- O n8n grava uma linha em csat_pending ANTES de resolver a conversa: é essa linha que impede o fluxo
-- "Estado é Resolved? -> Salvar CSAT Pending (Atômico)" de mandar a pesquisa quando a conversa muda para resolved.
-- Sem esta coluna, a linha contaria como pesquisa "enviada" em csat_envios_por_atendente e csat_funil_canal e
-- derrubaria a taxa de resposta de quem dispensou. A linha dispensada é gravada com respondido = true (para uma
-- mensagem "1 ..." do cliente depois não ser lida como nota) e dispensado = true.
-- Aplicada em 2026-10-13 (testada: linha criada, conversa resolvida em ~250 ms, nenhuma mensagem de pesquisa).
-- Reabertura: o gatilho trg_csat_pending_substitui_antigo (2026-10-05) troca a linha de um ciclo anterior, então uma
-- conversa dispensada que o cliente reabre e que é resolvida de novo volta a receber pesquisa. Dentro do mesmo ciclo
-- a dispensa continua valendo (resolver de novo não manda pesquisa).
-- Rollback: 2026-10-13_csat_pending_dispensado_rollback.sql

alter table public.csat_pending
  add column if not exists dispensado boolean not null default false;

-- 1) csat_envios_por_atendente: linha dispensada não conta como pesquisa enviada.
--    Única mudança: tem_pending = (p.session_id is not null and not p.dispensado).
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
           (p.session_id is not null and not p.dispensado) as tem_pending,
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

-- 2) csat_funil_canal: "enviadas" ignora linha dispensada.
--    Única mudança: "and not p.dispensado" dentro do exists.
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
         count(*) filter (where cc.status = 'resolved' and exists (select 1 from public.csat_pending p where p.session_id = cc.crisp_id and not p.dispensado)),
         count(*) filter (where exists (select 1 from public.csat_results r where r.crisp_id = cc.crisp_id))
  from public.crisp_conversations cc
  where cc.started_at between data_inicio and data_fim
    and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
    and not public.operador_fora_sac(cc.operator_crisp_id)
    and public.pode_ver_overview()
  group by 1
  order by 2 desc;
$function$;
