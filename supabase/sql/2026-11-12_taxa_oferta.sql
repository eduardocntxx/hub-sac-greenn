-- Taxa de oferta do Suporte Estratégico (2026-11-12), 1º indicador do playbook do Felipe.
--
-- taxa de oferta = atendimentos de produtor com oferta ÷ atendimentos de produtor finalizados, por pessoa e por
-- ferramenta. A oferta vem das tags do Crisp gravadas em crisp_conversations.segmentos (2026-11-12_segmentos_oferta.sql):
-- "oferta" sozinha ou uma das seis oferta-orderbump/upsell/checkout/vitrine/closer/vision.
--
-- Regras:
--   - atendimento = conversa resolvida no período (resolved_at), de produtor (chamado_tem_tipo_cliente 'Produtor'),
--     fechada por humano (resolved_operator_crisp_id não vazio e diferente de ia_greenn), sem cliente de teste nem
--     operador fora do SAC. Uma linha por conversa: reabrir e resolver de novo não conta duas vezes.
--   - pessoa = quem resolveu (resolved_operator_*, o último humano que respondeu), pelo nome canônico.
--   - sem_segmentos = conversas resolvidas antes da captura (12/11 ~11:15) ou que o n8n não conseguiu ler no Crisp.
--     Ficam fora de "atendimentos" para não puxar a taxa para baixo.
--
-- Mesmo acesso do Overview: pode_ver_overview() (admin ou usuário ativo e aprovado).
-- Rollback: 2026-11-12_taxa_oferta_rollback.sql

begin;

create or replace function public.taxa_oferta(data_inicio timestamp with time zone, data_fim timestamp with time zone)
 returns table(
   atendente text,
   atendimentos bigint,
   com_oferta bigint,
   sem_segmentos bigint,
   orderbump bigint,
   upsell bigint,
   checkout bigint,
   vitrine bigint,
   closer bigint,
   vision bigint
 )
 language sql
 stable security definer
 set search_path to 'public'
 set statement_timeout to '25s'
as $function$
  with base as (
    select public.nome_canonico_por_operator_id(cc.resolved_operator_crisp_id, cc.resolved_operator_nome) as atendente,
           cc.segmentos
    from public.crisp_conversations cc
    where public.pode_ver_overview()
      and cc.status = 'resolved'
      and cc.resolved_at between data_inicio and data_fim
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, 'Produtor')
      and coalesce(cc.resolved_operator_crisp_id, '') not in ('', 'ia_greenn')
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
      and not public.operador_fora_sac(cc.resolved_operator_crisp_id)
  )
  select b.atendente,
         count(*) filter (where b.segmentos is not null),
         count(*) filter (where b.segmentos && array['oferta', 'oferta-orderbump', 'oferta-upsell', 'oferta-checkout',
                                                      'oferta-vitrine', 'oferta-closer', 'oferta-vision']::text[]),
         count(*) filter (where b.segmentos is null),
         count(*) filter (where 'oferta-orderbump' = any(b.segmentos)),
         count(*) filter (where 'oferta-upsell' = any(b.segmentos)),
         count(*) filter (where 'oferta-checkout' = any(b.segmentos)),
         count(*) filter (where 'oferta-vitrine' = any(b.segmentos)),
         count(*) filter (where 'oferta-closer' = any(b.segmentos)),
         count(*) filter (where 'oferta-vision' = any(b.segmentos))
  from base b
  group by b.atendente
  order by 2 desc, 1;
$function$;

revoke all on function public.taxa_oferta(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.taxa_oferta(timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;
