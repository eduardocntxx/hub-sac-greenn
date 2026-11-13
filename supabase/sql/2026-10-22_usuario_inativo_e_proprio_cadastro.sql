-- 2026-10-22 — desligamento e edição do próprio cadastro.
-- Rollback: 2026-10-22_usuario_inativo_e_proprio_cadastro_rollback.sql
--
-- 1) O colaborador podia mudar o próprio `email` (passava a ler o CSAT de outro atendente, que é ligado
--    por e-mail) e o próprio `ativo` (desativado se reativava pela API). O gatilho travava só
--    aprovado/role_id/auth_id. O front não edita nenhum dos dois (Perfil: nome/cargo/equipe/horário).
--    A trava agora vale só pra requisição com usuário logado (auth.uid() preenchido); sem JWT de
--    usuário (service_role, SQL editor, CLI) não trava — antes o SQL manual de `postgres` também era
--    desfeito em silêncio, porque is_admin() é falso fora de uma sessão de usuário.
-- 2) is_admin() e has_permission() ignoravam `ativo`: admin desativado com login seguia admin, e
--    colaborador desativado seguia lendo o que a permissão libera (ex.: csat_results inteira).
begin;

create or replace function public.prevent_self_privilege_escalation()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_admin() then
    new.aprovado := old.aprovado;
    new.role_id := old.role_id;
    new.auth_id := old.auth_id;
    new.email := old.email;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$function$;

create or replace function public.is_admin()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.users u join public.roles r on r.id = u.role_id
    where u.auth_id = auth.uid() and u.ativo and r.nome = 'Administrador'
  );
$function$;

create or replace function public.has_permission(module_slug text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.is_admin() or exists (
    select 1 from public.user_permissions up
    join public.modules m on m.id = up.module_id
    join public.users u on u.id = up.user_id
    where up.user_id = public.current_app_user_id()
      and u.ativo and u.aprovado
      and m.slug = module_slug and up.pode_gerenciar = true
  );
$function$;

commit;
