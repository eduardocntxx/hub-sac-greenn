-- _atendente_performance_base: tira o cálculo de reopened_count_real_periodo, cujo resultado era descartado.
--
-- A base usava reopened_count_real_periodo(data_inicio, data_fim) (~2 s com 30 dias, recalcula reaberturas
-- mensagem a mensagem) só para a coluna total_atendimentos do CTE "volume". O único chamador,
-- atendente_performance, não lê essa coluna (conta chamados por chamados_periodo_base desde 2026-10-01) nem a
-- posicao da base (recalcula). Medido em 14/10: era metade do custo da base.
-- total_atendimentos da base passa a ser 1 + reopened_count (contador do n8n); continua não sendo usado.
-- Aplicado dentro de um bloco que compara a saída de atendente_performance antes/depois em 3 cenários e aborta
-- (desfaz) se qualquer linha mudar.
--
-- Rollback (as três substituições inversas):
--   do $$ declare d text; begin
--     d := pg_get_functiondef('public._atendente_performance_base'::regproc);
--     d := replace(d, E'      cc.*,\n      h.primeira_resposta_humana_at,', E'      cc.*,\n      vrc.reopened_count_real,\n      h.primeira_resposta_humana_at,');
--     d := replace(d, E'    left join humanas h on h.session_id = cc.crisp_id\n', E'    left join humanas h on h.session_id = cc.crisp_id\n    left join public.reopened_count_real_periodo(data_inicio, data_fim) vrc on vrc.session_id = cc.crisp_id\n');
--     d := replace(d, 'sum(1 + coalesce(reopened_count, 0))', 'sum(1 + coalesce(reopened_count_real, reopened_count, 0))');
--     execute d;
--   end $$;

do $$
declare
  d text; antes text; dif bigint;
  admin_sub text := (select auth_id::text from public.users where nome = 'Eduardo Nicolau');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin_sub, 'role', 'authenticated')::text, true);

  create temp table _antes on commit drop as
    select 1 as cenario, * from public.atendente_performance(now() - interval '30 days', now(), null, null, 'uteis', null)
    union all select 2, * from public.atendente_performance(now() - interval '7 days', now(), null, null, 'corridas', 'Produtor')
    union all select 3, * from public.atendente_performance(now() - interval '7 days', now(), 'WhatsApp', null, 'uteis', null);

  d := pg_get_functiondef('public._atendente_performance_base'::regproc);
  antes := d;
  d := replace(d, E'      vrc.reopened_count_real,\n', '');
  d := replace(d, E'    left join public.reopened_count_real_periodo(data_inicio, data_fim) vrc on vrc.session_id = cc.crisp_id\n', '');
  d := replace(d, 'sum(1 + coalesce(reopened_count_real, reopened_count, 0))', 'sum(1 + coalesce(reopened_count, 0))');
  if d = antes or position('reopened_count_real' in d) > 0 then
    raise exception 'substituição não bateu com a definição atual';
  end if;
  execute d;

  create temp table _depois on commit drop as
    select 1 as cenario, * from public.atendente_performance(now() - interval '30 days', now(), null, null, 'uteis', null)
    union all select 2, * from public.atendente_performance(now() - interval '7 days', now(), null, null, 'corridas', 'Produtor')
    union all select 3, * from public.atendente_performance(now() - interval '7 days', now(), 'WhatsApp', null, 'uteis', null);

  select count(*) into dif from ((table _antes except table _depois) union all (table _depois except table _antes)) x;
  if dif > 0 then
    raise exception 'saída de atendente_performance mudou em % linhas — desfeito', dif;
  end if;
end $$;
