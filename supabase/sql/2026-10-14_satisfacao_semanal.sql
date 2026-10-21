-- satisfacao_semanal: CSAT e NPS semana a semana (quarta a terça), para comparar volume e satisfação.
--
-- Pedido de 14/10/2026 (time de CS, via usuário): "o último neutro ou detrator do NPS foi em 01/10" — melhora de
-- satisfação ou queda no volume? Uma linha por semana entre p_inicio e p_fim, inclusive semanas sem dado (é assim que
-- uma semana com 0 respostas de NPS aparece; o NPS parou de chegar no Hub em 04/10).
--
-- CSAT segue as regras das funções que já existem, para os números baterem com os cards:
--   enviadas/respondidas = csat_funil_canal (conversas que nasceram na semana; enviada = resolvida com csat_pending
--                          não dispensado; respondida = tem avaliação em csat_results).
--   positivas (4–5) / negativas (1–3) = csat_distribuicao_notas (avaliação na semana da conversa,
--                          coalesce(started_at, data_hora)). Não existe neutro no CSAT.
-- p_tipo_cliente filtra pelo tipo da conversa (chamado_tem_tipo_cliente, ex. 'Produtor'); avaliação sem conversa
-- ligada usa csat_results.categoria_cliente. null = todos.
-- NPS = nps_responses pela data da resposta (régua 9–10 / 7–8 / 0–6, a mesma da coluna gerada `classificacao`).
-- Sem filtro de tipo: a pesquisa NPS é só de produtores.
--
-- Acesso: tudo exige pode_ver_overview(); as colunas de NPS vêm null para quem não é admin nem tem a permissão 'nps'
-- (mesma regra do RLS de nps_responses). null ≠ 0: a tela só acusa "sem respostas" quando vem 0.
--
-- Rollback:
--   drop function if exists public.satisfacao_semanal(timestamptz, timestamptz, text);

create or replace function public.satisfacao_semanal(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_tipo_cliente text default null
)
returns table(
  semana date,
  csat_enviadas bigint,
  csat_respondidas bigint,
  csat_positivas bigint,
  csat_negativas bigint,
  nps_respostas bigint,
  nps_promotores bigint,
  nps_neutros bigint,
  nps_detratores bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with acesso as (
    select public.pode_ver_overview() as overview,
           public.is_admin() or public.has_permission('nps') as nps
  ),
  -- Quarta-feira que abre a semana de cada data (isodow: seg = 1 ... dom = 7; qua → +0, ter → +6).
  semanas as (
    select s::date as semana
    from acesso a,
         generate_series(
           (select d - ((extract(isodow from d)::int + 4) % 7) from (select (p_inicio at time zone 'America/Sao_Paulo')::date as d) x)::timestamp,
           (p_fim at time zone 'America/Sao_Paulo')::date::timestamp,
           interval '1 week'
         ) s
    where a.overview
  ),
  conv as (
    select x.d - ((extract(isodow from x.d)::int + 4) % 7) as semana,
           count(*) filter (where x.enviada) as enviadas,
           count(*) filter (where x.respondida) as respondidas
    from (
      select (cc.started_at at time zone 'America/Sao_Paulo')::date as d,
             cc.status = 'resolved'
               and exists (select 1 from public.csat_pending p where p.session_id = cc.crisp_id and not p.dispensado) as enviada,
             exists (select 1 from public.csat_results r where r.crisp_id = cc.crisp_id) as respondida
      from public.crisp_conversations cc
      where cc.started_at between p_inicio and p_fim
        and not public.cliente_e_teste(cc.cliente_nome, cc.cliente_email)
        and not public.operador_fora_sac(cc.operator_crisp_id)
        and public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
    ) x
    group by 1
  ),
  notas as (
    select x.d - ((extract(isodow from x.d)::int + 4) % 7) as semana,
           count(*) filter (where x.nota >= 4) as positivas,
           count(*) filter (where x.nota <= 3) as negativas
    from (
      select (coalesce(cc.started_at, r.data_hora) at time zone 'America/Sao_Paulo')::date as d, r.nota
      from public.csat_results r
      left join public.crisp_conversations cc on cc.crisp_id = r.crisp_id
      where coalesce(cc.started_at, r.data_hora) between p_inicio and p_fim
        and not public.cliente_e_teste(r.cliente, r.email)
        and not public.csat_atendente_fora_sac(r.email_atendente)
        and (p_tipo_cliente is null
             or case when cc.crisp_id is not null then public.chamado_tem_tipo_cliente(cc.tipo_cliente, p_tipo_cliente)
                     else r.categoria_cliente = p_tipo_cliente end)
    ) x
    group by 1
  ),
  nps as (
    select x.d - ((extract(isodow from x.d)::int + 4) % 7) as semana,
           count(*) as respostas,
           count(*) filter (where x.nota >= 9) as promotores,
           count(*) filter (where x.nota between 7 and 8) as neutros,
           count(*) filter (where x.nota <= 6) as detratores
    from (
      select (n.data_resposta at time zone 'America/Sao_Paulo')::date as d, n.nota
      from public.nps_responses n
      where n.data_resposta between p_inicio and p_fim
    ) x
    group by 1
  )
  select s.semana,
         coalesce(c.enviadas, 0),
         coalesce(c.respondidas, 0),
         coalesce(t.positivas, 0),
         coalesce(t.negativas, 0),
         case when a.nps then coalesce(n.respostas, 0) end,
         case when a.nps then coalesce(n.promotores, 0) end,
         case when a.nps then coalesce(n.neutros, 0) end,
         case when a.nps then coalesce(n.detratores, 0) end
  from semanas s
  cross join acesso a
  left join conv c on c.semana = s.semana
  left join notas t on t.semana = s.semana
  left join nps n on n.semana = s.semana
  order by s.semana;
$function$;

revoke execute on function public.satisfacao_semanal(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.satisfacao_semanal(timestamptz, timestamptz, text) to authenticated, service_role;
