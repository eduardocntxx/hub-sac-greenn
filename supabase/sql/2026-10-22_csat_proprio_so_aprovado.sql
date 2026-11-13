-- 2026-10-22 — "ver o próprio CSAT/conversa pelo e-mail" só pra usuário ativo e aprovado.
-- Rollback: 2026-10-22_csat_proprio_so_aprovado_rollback.sql
--
-- Furo: o self-signup cria a conta já confirmada sem provar que a pessoa é dona do e-mail, e a policy
-- liberava as linhas com email_atendente = e-mail da conta sem olhar `aprovado`. Quem cadastrasse o
-- e-mail de um atendente sem conta no Hub lia as avaliações dele (nome/telefone/e-mail do cliente)
-- sem aprovação. Testado em bloco desfeito: conta pendente 175 -> 0 linhas; colaborador aprovado e
-- admin sem mudança (1073 -> 1073).
begin;

alter policy csat_select_own_or_admin_or_perm_v2 on public.csat_results using (
  (((user_id = (select public.current_app_user_id()))
    or (email_atendente = (select u.email from public.users u where u.auth_id = (select auth.uid()))))
   and (select public.usuario_aprovado()))
  or (select public.is_admin())
  or (select public.has_permission('csat'))
  or (select public.has_permission('analytics')));

-- operator_email é sempre NULL hoje, mas o ramo tem o mesmo formato: fecha junto.
alter policy crisp_conversations_select_own_or_perm on public.crisp_conversations using (
  ((operator_email = (select u.email from public.users u where u.auth_id = (select auth.uid())))
   and (select public.usuario_aprovado()))
  or (select public.is_admin())
  or (select public.has_permission('csat'))
  or (select public.has_permission('analytics')));

commit;
