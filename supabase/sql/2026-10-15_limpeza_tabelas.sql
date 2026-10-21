-- Limpeza de tabelas sem uso no schema public (2026-10-15). Ver docs/HISTORICO.md.
--
-- 1. Backups de correções antigas vão para o schema `arquivo` (fora da API, sem acesso de anon/authenticated).
--    Os rollbacks antigos que liam public._bkp_*/_res_ciclo_* passam a ler arquivo.*.
-- 2. Saem: tabelas vazias sem uso (nenhuma referência no front, em função SQL, policy, FK ou fluxo n8n) e a view
--    v_reopened_count_real. Contagem conferida com count(*) em 15/10: todas com 0 linhas, exceto
--    calendar_week_responsibles (4 linhas, última semana 07/09; a tela saiu do Calendário). crisp_ratings e
--    nps_followups (reservadas para uma integração com a API do Crisp que não veio) saem por decisão do usuário.
-- Sem CASCADE: se algo depender de uma delas, o bloco inteiro falha e nada muda.
--
-- Rollback: 2026-10-15_limpeza_tabelas_rollback.sql (recria tudo, com as 4 linhas de calendar_week_responsibles).

begin;
set local app.origem = 'limpeza de tabelas sem uso (2026-10-15)';

create schema if not exists arquivo;
revoke all on schema arquivo from public, anon, authenticated;
comment on schema arquivo is 'Backups de correções de dados. Fora da API; não usar em função nem tela.';
alter table public._bkp_ciclo_pesquisa_2026_09_25 set schema arquivo;
alter table public._bkp_csat_nota_falsa_2026_09_25 set schema arquivo;
alter table public._bkp_csat_pending_presos_2026_09_25 set schema arquivo;
alter table public._bkp_funcoes_csat_2026_10_05 set schema arquivo;
alter table public._res_ciclo_2026_09_25 set schema arquivo;
revoke all on all tables in schema arquivo from anon, authenticated;

drop view public.v_reopened_count_real;
drop table
  public.audit_logs,
  public.calendar_week_responsibles,
  public.clientes_risco,
  public.crisp_ratings,
  public.favorites,
  public.nps_followups,
  public.permissions,
  public.quick_links,
  public.rr_history,
  public.settings,
  public.updates;

commit;
