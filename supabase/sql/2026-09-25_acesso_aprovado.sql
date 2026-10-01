-- 2026-09-25 — leitura/RPC só pra usuário do Hub ativo e aprovado (ver CLAUDE.md, seção 10).
-- Aplicado em produção (riiwphsvqlatqtaqaemd) em 2026-09-25. Rollback: 2026-09-25_acesso_aprovado_rollback.sql
begin;

-- 1) Quem pode ler dado interno: usuário do Hub vinculado, ativo e aprovado (ou admin)
create or replace function public.usuario_aprovado()
 returns boolean language sql stable security definer set search_path to 'public'
as $f$
  select exists (select 1 from public.users u
                 where u.auth_id = auth.uid() and u.ativo and u.aprovado)
      or public.is_admin();
$f$;
revoke execute on function public.usuario_aprovado() from public, anon;
grant execute on function public.usuario_aprovado() to authenticated, service_role;

-- 2) Policies SELECT "using (true)" -> só aprovado (roles fica aberta: o perfil do pendente faz join nela)
do $d$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname='public' and cmd='SELECT' and qual='true' and tablename <> 'roles' loop
    execute format('alter policy %I on public.%I using ((select public.usuario_aprovado()))', r.policyname, r.tablename);
  end loop;
end $d$;
alter policy helpdesks_select on public.helpdesks using (
  ((status = 'finalizado'::text) and (select public.usuario_aprovado()))
  or (created_by = current_app_user_id()) or is_admin() or has_permission('helpdesks'::text));

-- 3) Funções sem checagem que o front não chama (n8n/internas): só service_role/owner
revoke execute on function public._primeiras_respostas_humanas(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.reopened_count_real_periodo(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.horario_por_nome(text) from public, anon, authenticated;
revoke execute on function public.marcar_conversa_estado(text, text) from public, anon, authenticated;
revoke execute on function public.marcar_conversa_resolvida(text) from public, anon, authenticated;
revoke execute on function public.refresh_cobertura_semanal() from public, anon, authenticated;
revoke execute on function public.resetar_csat_pending_se_livre(text) from public, anon, authenticated;
revoke execute on function public.team_csat_monthly() from public, anon, authenticated;
revoke execute on function public.team_ranking(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.upsert_operator_alias(text, text, text) from public, anon, authenticated;

-- 4) RPCs usadas pelo front sem checagem: vira _x_base + wrapper com mesma assinatura que exige aprovado
do $d$ declare r record; base text; callargs text; vol text; begin
  for r in select p.oid, p.proname from pg_proc p
           where p.pronamespace='public'::regnamespace and p.proname in
           ('analytics_evolucao','analytics_summary','atendente_escalado_sabado','chamados_evolucao',
            'colaboradores_online','conversas_evolucao','dashboard_atendimento_summary','distinct_canais',
            'distribuicao_canal_conversas','distribuicao_status_conversas','migracoes_por_plataforma','migracoes_resumo') loop
    base := '_' || r.proname || '_base';
    select coalesce(string_agg(quote_ident(n), ', ' order by o), '')
      into callargs from unnest((select proargnames[1:pronargs] from pg_proc where oid=r.oid)) with ordinality t(n,o);
    select case provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end into vol from pg_proc where oid=r.oid;
    execute format('alter function public.%I(%s) rename to %I', r.proname, pg_get_function_identity_arguments(r.oid), base);
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', base, pg_get_function_identity_arguments(r.oid));
    execute format($w$create function public.%I(%s) returns %s language sql %s security definer set search_path to 'public'
                     as $b$ select * from public.%I(%s) where (select public.usuario_aprovado()) $b$$w$,
                   r.proname, pg_get_function_arguments(r.oid), pg_get_function_result(r.oid), vol, base, callargs);
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, pg_get_function_identity_arguments(r.oid));
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.proname, pg_get_function_identity_arguments(r.oid));
  end loop;
end $d$;

notify pgrst, 'reload schema';
commit;
