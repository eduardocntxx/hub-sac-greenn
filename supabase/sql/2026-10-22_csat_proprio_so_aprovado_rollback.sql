-- Rollback de 2026-10-22_csat_proprio_so_aprovado.sql (volta as policies como estavam).
begin;

alter policy csat_select_own_or_admin_or_perm_v2 on public.csat_results using (
  (user_id = (select public.current_app_user_id()))
  or (email_atendente = (select u.email from public.users u where u.auth_id = (select auth.uid())))
  or (select public.is_admin())
  or (select public.has_permission('csat'))
  or (select public.has_permission('analytics')));

alter policy crisp_conversations_select_own_or_perm on public.crisp_conversations using (
  (operator_email = (select u.email from public.users u where u.auth_id = (select auth.uid())))
  or (select public.is_admin())
  or (select public.has_permission('csat'))
  or (select public.has_permission('analytics')));

commit;
