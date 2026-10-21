-- Backlog: separar "esperando o cliente" de "esperando o atendimento".
--
-- Em 14/10/2026 havia 3.147 conversas abertas (status <> 'resolved'), 2.362 com mais de 7 dias. Em 1.864 delas
-- (1.340 das +7 dias) a última mensagem visível foi de um atendente humano — quase sempre um follow-up do tipo
-- "Seu desafio permanece?" ou "Poderia me confirmar se seu caso já foi solucionado?" — e ninguém resolveu a
-- conversa na Crisp depois. O card de backlog somava tudo como se fosse fila do time.
--
-- Regra: aguardando_cliente = a última mensagem da conversa (ignorando nota interna e evento) foi de um operador
-- humano. Bot (Atendente IA*, origin crisp.im:bot / allan.godoy, conta IA Greenn b8b993a0..., marcador ia_greenn)
-- não conta: a última mensagem do bot pode ser "seu caso já está com a equipe", que é espera do time. Conversa sem
-- mensagem gravada (buraco de 01–07/09 ou anterior a 08/09) não entra na contagem de backlog_por_idade e volta
-- null em backlog_casos (desconhecido — a tela mostra "—").
-- Custo medido: ~105 ms com cache quente para as ~3.150 abertas (lateral pelo índice session_id, message_timestamp).
--
-- backlog_casos ganha a mesma coluna (calculada só para a página devolvida) e um desempate único no order by.
-- Mudança de tipo de retorno: DROP + CREATE, e os grants são refeitos iguais aos de antes
-- (authenticated e service_role; sem public/anon). Colunas antigas mantidas: o front antigo continua funcionando.
--
-- Rollback: 2026-10-14_backlog_aguardando_cliente_rollback.sql

begin;

drop function if exists public.backlog_por_idade(text, text[], text);

create function public.backlog_por_idade(p_canal text default null::text, p_atendente_nomes text[] default null::text[], p_tipo_cliente text default null::text)
 returns table(faixa text, total bigint, com_humano bigint, aguardando_cliente bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if p_tipo_cliente is null then
    return query
  with base as (
    select cc.crisp_id, cc.first_human_operator_crisp_id, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
  )
  select
    case
      when b.idade_dias <= 1 then '0-1 dia'
      when b.idade_dias <= 3 then '2-3 dias'
      when b.idade_dias <= 7 then '4-7 dias'
      else '+7 dias'
    end,
    count(*),
    count(*) filter (where b.first_human_operator_crisp_id is not null),
    count(*) filter (where ult.do_atendente)
  from base b
  left join lateral (
    select m.from_type = 'operator'
       and coalesce(m.operator_crisp_id, '') not in ('b8b993a0-dd61-487a-b89b-7503756d8eb2', 'ia_greenn')
       and coalesce(m.operator_nome, '') not ilike 'Atendente IA%'
       and coalesce(m.origin, '') not ilike '%crisp.im:bot%'
       and coalesce(m.origin, '') not ilike '%allan.godoy%' as do_atendente
    from public.crisp_messages m
    where m.session_id = b.crisp_id and coalesce(m.message_type, '') not in ('note', 'event')
    order by m.message_timestamp desc
    limit 1
  ) ult on true
  group by 1;
  else
    return query
  with base as (
    select cc.crisp_id, cc.first_human_operator_crisp_id, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and public.pode_ver_overview()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  )
  select
    case
      when b.idade_dias <= 1 then '0-1 dia'
      when b.idade_dias <= 3 then '2-3 dias'
      when b.idade_dias <= 7 then '4-7 dias'
      else '+7 dias'
    end,
    count(*),
    count(*) filter (where b.first_human_operator_crisp_id is not null),
    count(*) filter (where ult.do_atendente)
  from base b
  left join lateral (
    select m.from_type = 'operator'
       and coalesce(m.operator_crisp_id, '') not in ('b8b993a0-dd61-487a-b89b-7503756d8eb2', 'ia_greenn')
       and coalesce(m.operator_nome, '') not ilike 'Atendente IA%'
       and coalesce(m.origin, '') not ilike '%crisp.im:bot%'
       and coalesce(m.origin, '') not ilike '%allan.godoy%' as do_atendente
    from public.crisp_messages m
    where m.session_id = b.crisp_id and coalesce(m.message_type, '') not in ('note', 'event')
    order by m.message_timestamp desc
    limit 1
  ) ult on true
  group by 1;
  end if;
end;
$function$;

revoke all on function public.backlog_por_idade(text, text[], text) from public, anon;
grant execute on function public.backlog_por_idade(text, text[], text) to authenticated, service_role;

drop function if exists public.backlog_casos(text, text, text[], integer, integer, text, text);

create function public.backlog_casos(p_faixa text, p_canal text default null::text, p_atendente_nomes text[] default null::text[], p_limit integer default 15, p_offset integer default 0, p_direcao text default 'asc'::text, p_tipo_cliente text default null::text)
 returns table(crisp_id text, cliente_nome text, operator_nome text, topico text, canal text, status text, current_started_at timestamp with time zone, idade_dias numeric, link_chamado text, total_count bigint, aguardando_cliente boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with base as (
    select cc.*, extract(epoch from (now() - cc.current_started_at)) / 86400 as idade_dias_calc
    from public.crisp_conversations cc
    where cc.status <> 'resolved'
      and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email) and not public.operador_fora_sac(cc.operator_crisp_id)
      and public.is_admin()
      and (p_canal is null or public.canal_normalizado(cc.canal) = p_canal)
      and (p_atendente_nomes is null or array_length(p_atendente_nomes,1) is null or public.nome_canonico_por_operator_id(cc.operator_crisp_id, cc.operator_nome) = any(p_atendente_nomes))
      and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
  ),
  filtrado as (
    select b.*
    from base b
    where case
        when p_faixa = '0-1 dia' then b.idade_dias_calc <= 1
        when p_faixa = '2-3 dias' then b.idade_dias_calc > 1 and b.idade_dias_calc <= 3
        when p_faixa = '4-7 dias' then b.idade_dias_calc > 3 and b.idade_dias_calc <= 7
        when p_faixa = '+7 dias' then b.idade_dias_calc > 7
        else false
      end
  ),
  pagina as (
    select f.*, count(*) over() as total_calc
    from filtrado f
    order by (case when p_direcao = 'desc' then f.current_started_at end) desc,
             (case when coalesce(p_direcao, 'asc') = 'asc' then f.current_started_at end) asc,
             f.crisp_id
    limit p_limit offset p_offset
  )
  select
    pg.crisp_id, pg.cliente_nome,
    public.nome_canonico_por_operator_id(pg.operator_crisp_id, pg.operator_nome),
    pg.topico, public.canal_normalizado(pg.canal) as canal, pg.status, pg.current_started_at,
    round(pg.idade_dias_calc::numeric, 1),
    pg.link_chamado,
    pg.total_calc,
    ult.do_atendente
  from pagina pg
  left join lateral (
    select m.from_type = 'operator'
       and coalesce(m.operator_crisp_id, '') not in ('b8b993a0-dd61-487a-b89b-7503756d8eb2', 'ia_greenn')
       and coalesce(m.operator_nome, '') not ilike 'Atendente IA%'
       and coalesce(m.origin, '') not ilike '%crisp.im:bot%'
       and coalesce(m.origin, '') not ilike '%allan.godoy%' as do_atendente
    from public.crisp_messages m
    where m.session_id = pg.crisp_id and coalesce(m.message_type, '') not in ('note', 'event')
    order by m.message_timestamp desc
    limit 1
  ) ult on true
  order by (case when p_direcao = 'desc' then pg.current_started_at end) desc,
           (case when coalesce(p_direcao, 'asc') = 'asc' then pg.current_started_at end) asc,
           pg.crisp_id;
$function$;

revoke all on function public.backlog_casos(text, text, text[], integer, integer, text, text) from public, anon;
grant execute on function public.backlog_casos(text, text, text[], integer, integer, text, text) to authenticated, service_role;

commit;
