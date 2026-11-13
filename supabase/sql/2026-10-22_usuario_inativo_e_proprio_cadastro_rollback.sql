-- Rollback de 2026-10-22_usuario_inativo_e_proprio_cadastro.sql (definições anteriores, iguais às de produção em 22/10).
begin;

create or replace function public.prevent_self_privilege_escalation()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$ begin if auth.role() = 'service_role' then return new; end if; if not public.is_admin() then new.aprovado := old.aprovado; new.role_id := old.role_id; new.auth_id := old.auth_id; end if; return new; end; $function$;

create or replace function public.is_admin()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$ select exists ( select 1 from public.users u join public.roles r on r.id = u.role_id where u.auth_id = auth.uid() and r.nome = 'Administrador' ); $function$;

create or replace function public.has_permission(module_slug text)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$ select public.is_admin() or exists ( select 1 from public.user_permissions up join public.modules m on m.id = up.module_id where up.user_id = public.current_app_user_id() and m.slug = module_slug and up.pode_gerenciar = true ); $function$;

commit;
