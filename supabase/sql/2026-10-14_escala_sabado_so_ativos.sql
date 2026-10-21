-- Rodízio de sábado: só quem está ativo entra na conta.
--
-- Problema: _atendente_escalado_sabado_base contava todo mundo de escala_sabado, inclusive usuário inativo. A Brenda
-- Coutinho (inativa) estava na posição #2 e o Calendário mostrava ela de plantão em 17/10/2026 e a cada 4 semanas.
-- Segundo problema, latente: a conta casava "posicao = resto + 1", então remover alguém do meio da lista (posições
-- 1, 3, 4) deixava um sábado sem ninguém a cada volta e a última posição nunca era escalada.
--
-- Correção: a ordem passa a ser row_number() sobre posicao, só com usuários ativos. Inativo continua na lista (pode
-- voltar a ficar ativo) mas é pulado.
--
-- Data de referência: com 3 pessoas ativas em vez de 4, a conta muda. Para a sequência continuar de onde estava
-- (10/10 Eduardo -> próximo ativo na ordem), data_referencia passa de 2026-01-03 para 2026-10-10:
--   10/10 Eduardo (igual antes), 17/10 Ana Franca, 24/10 Ana Paula, 31/10 Eduardo...
--   Os sábados 26/09 e 03/10 continuam iguais; de 19/09 para trás o Calendário passa a mostrar o rodízio novo
--   (antes de 19/09 o histórico exibido muda).
-- Ajustável em Administração -> Escalas se o time combinou outra ordem.
--
-- Rollback: 2026-10-14_escala_sabado_so_ativos_rollback.sql

create or replace function public._atendente_escalado_sabado_base(p_data date)
 returns table(user_id uuid, nome text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with cfg as (select data_referencia from public.escala_sabado_config limit 1),
  ativos as (
    select u.id, u.nome,
           row_number() over (order by e.posicao) as ordem,
           count(*) over () as n
    from public.escala_sabado e
    join public.users u on u.id = e.user_id
    where u.ativo
  ),
  semanas as (
    select ((p_data - (select data_referencia from cfg)) / 7)::int as diff
  )
  select a.id, a.nome
  from ativos a
  cross join semanas s
  where a.ordem = (((s.diff % a.n) + a.n) % a.n) + 1;
$function$;

update public.escala_sabado_config set data_referencia = date '2026-10-10';
