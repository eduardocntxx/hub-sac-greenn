-- Desfaz 2026-09-25_limpeza_csat.sql: devolve a nota apagada e as pesquisas pendentes a partir dos backups.
-- Atenção: devolver as linhas de csat_pending volta a bloquear pesquisa nova nessas conversas.
begin;
insert into public.csat_results select * from public._bkp_csat_nota_falsa_2026_09_25
  on conflict do nothing;
insert into public.csat_pending select * from public._bkp_csat_pending_presos_2026_09_25
  on conflict do nothing;
commit;
