-- Limpeza de CSAT (aplicada em produção em 2026-09-25). Rollback no arquivo _rollback ao lado.
-- Resultado: 1 nota falsa apagada, 368 linhas de csat_pending liberadas (restaram 4.052).
-- Depende de public._reaberturas_conversa (2026-09-25_ciclo_pos_pesquisa.sql).
begin;
-- 6) nota falsa: "2 min" (21/09) virou nota 2 da Ketlin
create table public._bkp_csat_nota_falsa_2026_09_25 as
  select * from public.csat_results where id = '43f02614-db57-46de-86b5-e6e4741f5798';
alter table public._bkp_csat_nota_falsa_2026_09_25 enable row level security;
revoke all on public._bkp_csat_nota_falsa_2026_09_25 from anon, authenticated;
delete from public.csat_results where id = '43f02614-db57-46de-86b5-e6e4741f5798';

-- 7) pesquisas presas: conversa reabriu de verdade depois da pesquisa, registro bloqueava pesquisa nova
create table public._bkp_csat_pending_presos_2026_09_25 as
  select p.* from public.csat_pending p
  where p.created_at > now() - interval '40 days'
    and exists (select 1 from public._reaberturas_conversa(p.session_id) r
                where r.eh_real and r.reaberto_em > p.created_at + interval '1 minute');
alter table public._bkp_csat_pending_presos_2026_09_25 enable row level security;
revoke all on public._bkp_csat_pending_presos_2026_09_25 from anon, authenticated;
delete from public.csat_pending p using public._bkp_csat_pending_presos_2026_09_25 b where p.session_id = b.session_id;
commit;
