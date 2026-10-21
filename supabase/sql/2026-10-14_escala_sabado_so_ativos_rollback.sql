-- Rollback de 2026-10-14_escala_sabado_so_ativos.sql.
-- Volta a conta com todo mundo da lista (inclusive inativos) e a data de referência anterior.

create or replace function public._atendente_escalado_sabado_base(p_data date)
 returns table(user_id uuid, nome text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (select data_referencia from public.escala_sabado_config limit 1),
  total as (select count(*) as n from public.escala_sabado),
  semanas as (
    select ((p_data - (select data_referencia from cfg)) / 7)::int as diff
  )
  select u.id, u.nome
  from public.escala_sabado e
  join public.users u on u.id = e.user_id
  cross join total t
  cross join semanas s
  where t.n > 0
    and e.posicao = (((s.diff % t.n) + t.n) % t.n) + 1;
$function$;

update public.escala_sabado_config set data_referencia = date '2026-01-03';
