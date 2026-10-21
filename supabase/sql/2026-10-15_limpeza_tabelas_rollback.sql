-- Rollback de 2026-10-15_limpeza_tabelas.sql: recria tabelas, view, constraints, índices, RLS, policies, triggers e
-- grants como estavam em 15/10/2026 (gerado de pg_catalog), devolve os backups ao public e as 4 linhas de
-- calendar_week_responsibles. Os rollbacks antigos que leem os backups apontam para arquivo.*; se rodar este,
-- troque de volta para public.* neles.

begin;
set local app.origem = 'rollback da limpeza de tabelas (2026-10-15)';

-- audit_logs
create table public.audit_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  tabela text,
  registro_id uuid,
  acao text,
  dados jsonb,
  created_at timestamp with time zone default now()
);
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.audit_logs add constraint audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id);
alter table public.audit_logs enable row level security;
create policy audit_logs_admin_read on public.audit_logs as permissive for select to authenticated using (is_admin());
create policy audit_logs_insert_own on public.audit_logs as permissive for insert to authenticated with check ((user_id = current_app_user_id()));
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.audit_logs to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.audit_logs to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.audit_logs to service_role;

-- calendar_week_responsibles
create table public.calendar_week_responsibles (
  id uuid default gen_random_uuid() not null,
  semana_inicio date not null,
  user_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now()
);
alter table public.calendar_week_responsibles add constraint calendar_week_responsibles_pkey PRIMARY KEY (id);
alter table public.calendar_week_responsibles add constraint calendar_week_responsibles_semana_inicio_key UNIQUE (semana_inicio);
alter table public.calendar_week_responsibles add constraint calendar_week_responsibles_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.calendar_week_responsibles add constraint calendar_week_responsibles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.calendar_week_responsibles enable row level security;
create policy calendar_week_responsibles_select on public.calendar_week_responsibles as permissive for select to authenticated using (( SELECT usuario_aprovado() AS usuario_aprovado));
create policy calendar_week_responsibles_write_admin on public.calendar_week_responsibles as permissive for all to authenticated using (is_admin()) with check (is_admin());
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.calendar_week_responsibles to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.calendar_week_responsibles to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.calendar_week_responsibles to service_role;
insert into public.calendar_week_responsibles (id, semana_inicio, user_id, created_by, created_at) values
  ('1adcc3d4-9743-4c35-af09-b5b8651714a5', '2026-08-24', '4f35947a-b1d8-4ffb-8710-ecc25a4caabd', '9974986f-a189-4570-8f43-731b83043c86', '2026-08-27 19:14:57.191202+00'),
  ('8a5ca4e2-a626-483c-ac32-147265fd0afc', '2026-08-10', '4f35947a-b1d8-4ffb-8710-ecc25a4caabd', '9974986f-a189-4570-8f43-731b83043c86', '2026-08-14 23:15:05.931136+00'),
  ('45c32715-0670-48d1-9e69-5bbacc67b689', '2026-08-31', '950080cf-dc5b-4fb7-b900-2c384fcb6fd6', '9974986f-a189-4570-8f43-731b83043c86', '2026-08-31 17:21:06.543578+00'),
  ('8f635ce0-1e36-4c5e-a1be-cc7ce0cd8f89', '2026-09-07', '16cbcb57-9685-4676-9134-a4e3a8d8a18f', '9974986f-a189-4570-8f43-731b83043c86', '2026-09-02 23:37:45.360528+00');

-- clientes_risco
create table public.clientes_risco (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  email text not null,
  descricao text,
  nivel text default 'baixo'::text not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.clientes_risco add constraint clientes_risco_pkey PRIMARY KEY (id);
alter table public.clientes_risco add constraint clientes_risco_nivel_check CHECK ((nivel = ANY (ARRAY['baixo'::text, 'medio'::text, 'alto'::text])));
alter table public.clientes_risco add constraint clientes_risco_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.clientes_risco enable row level security;
create policy clientes_risco_select_perm on public.clientes_risco as permissive for select to authenticated using ((is_admin() OR has_permission('reclame_aqui'::text)));
create policy clientes_risco_write_perm on public.clientes_risco as permissive for all to authenticated using ((is_admin() OR has_permission('reclame_aqui'::text))) with check ((is_admin() OR has_permission('reclame_aqui'::text)));
CREATE TRIGGER trg_clientes_risco_updated_at BEFORE UPDATE ON public.clientes_risco FOR EACH ROW EXECUTE FUNCTION set_updated_at();
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.clientes_risco to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.clientes_risco to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.clientes_risco to service_role;

-- crisp_ratings
create table public.crisp_ratings (
  id uuid default gen_random_uuid() not null,
  crisp_rating_id text,
  conversation_id uuid,
  operator_id uuid,
  nota integer,
  comentario text,
  created_at timestamp with time zone default now()
);
alter table public.crisp_ratings add constraint crisp_ratings_pkey PRIMARY KEY (id);
alter table public.crisp_ratings add constraint crisp_ratings_crisp_rating_id_key UNIQUE (crisp_rating_id);
alter table public.crisp_ratings add constraint crisp_ratings_nota_check CHECK (((nota >= 1) AND (nota <= 5)));
alter table public.crisp_ratings add constraint crisp_ratings_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES crisp_conversations(id) ON DELETE CASCADE;
alter table public.crisp_ratings add constraint crisp_ratings_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES users(id);
CREATE INDEX idx_crisp_ratings_created ON public.crisp_ratings USING btree (created_at);
CREATE INDEX idx_crisp_ratings_operator ON public.crisp_ratings USING btree (operator_id);
alter table public.crisp_ratings enable row level security;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.crisp_ratings to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.crisp_ratings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.crisp_ratings to service_role;

-- favorites
create table public.favorites (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  module_id uuid,
  created_at timestamp with time zone default now()
);
alter table public.favorites add constraint favorites_pkey PRIMARY KEY (id);
alter table public.favorites add constraint favorites_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE;
alter table public.favorites add constraint favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX idx_favorites_user ON public.favorites USING btree (user_id);
alter table public.favorites enable row level security;
create policy favorites_own on public.favorites as permissive for all to authenticated using ((user_id = current_app_user_id())) with check ((user_id = current_app_user_id()));
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.favorites to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.favorites to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.favorites to service_role;

-- nps_followups
create table public.nps_followups (
  id uuid default gen_random_uuid() not null,
  nps_response_id uuid not null,
  user_id uuid,
  status_contato text,
  forma_contato text,
  conversa_fluiu text,
  observacoes text,
  necessita_retorno boolean default false,
  proximo_contato timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.nps_followups add constraint nps_followups_pkey PRIMARY KEY (id);
alter table public.nps_followups add constraint nps_followups_nps_response_id_fkey FOREIGN KEY (nps_response_id) REFERENCES nps_responses(id) ON DELETE CASCADE;
alter table public.nps_followups add constraint nps_followups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.nps_followups enable row level security;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.nps_followups to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.nps_followups to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nps_followups to service_role;

-- permissions
create table public.permissions (
  id uuid default gen_random_uuid() not null,
  role_id uuid,
  module_id uuid,
  visualizar boolean default true,
  criar boolean default false,
  editar boolean default false,
  excluir boolean default false
);
alter table public.permissions add constraint permissions_pkey PRIMARY KEY (id);
alter table public.permissions add constraint permissions_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE;
alter table public.permissions add constraint permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
CREATE INDEX idx_permissions_role ON public.permissions USING btree (role_id);
alter table public.permissions enable row level security;
create policy permissions_admin_only on public.permissions as permissive for all to authenticated using (is_admin()) with check (is_admin());
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.permissions to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.permissions to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.permissions to service_role;

-- quick_links
create table public.quick_links (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  descricao text,
  icone text,
  url text not null,
  ordem integer default 0,
  ativo boolean default true,
  created_at timestamp with time zone default now()
);
alter table public.quick_links add constraint quick_links_pkey PRIMARY KEY (id);
alter table public.quick_links enable row level security;
create policy quick_links_select_auth on public.quick_links as permissive for select to authenticated using (( SELECT usuario_aprovado() AS usuario_aprovado));
create policy quick_links_write_admin on public.quick_links as permissive for all to authenticated using (is_admin()) with check (is_admin());
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.quick_links to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.quick_links to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.quick_links to service_role;

-- rr_history
create table public.rr_history (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  periodo text not null,
  csat numeric,
  csat_variacao numeric,
  atendimentos integer,
  atendimentos_variacao numeric,
  tempo_medio text,
  tempo_medio_variacao numeric,
  meta_batida boolean,
  aprendizados text,
  dificuldades text,
  plano_de_acao text,
  objetivos text,
  created_at timestamp with time zone default now()
);
alter table public.rr_history add constraint rr_history_pkey PRIMARY KEY (id);
alter table public.rr_history add constraint rr_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.rr_history enable row level security;
create policy rr_history_delete_admin on public.rr_history as permissive for delete to public using (is_admin());
create policy rr_history_insert_own on public.rr_history as permissive for insert to authenticated with check ((user_id = current_app_user_id()));
create policy rr_history_select_own_or_admin on public.rr_history as permissive for select to authenticated using (((user_id = current_app_user_id()) OR is_admin()));
create policy rr_history_update_own_or_admin on public.rr_history as permissive for update to authenticated using (((user_id = current_app_user_id()) OR is_admin())) with check (((user_id = current_app_user_id()) OR is_admin()));
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.rr_history to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.rr_history to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.rr_history to service_role;

-- settings
create table public.settings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  tema text default 'light'::text,
  idioma text default 'pt-BR'::text,
  notificacoes boolean default true,
  created_at timestamp with time zone default now()
);
alter table public.settings add constraint settings_pkey PRIMARY KEY (id);
alter table public.settings add constraint settings_user_id_key UNIQUE (user_id);
alter table public.settings add constraint settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public.settings enable row level security;
create policy settings_own_or_admin on public.settings as permissive for all to authenticated using (((user_id = current_app_user_id()) OR is_admin())) with check (((user_id = current_app_user_id()) OR is_admin()));
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.settings to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.settings to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.settings to service_role;

-- updates
create table public.updates (
  id uuid default gen_random_uuid() not null,
  titulo text not null,
  descricao text,
  categoria text,
  publicado boolean default true,
  created_at timestamp with time zone default now()
);
alter table public.updates add constraint updates_pkey PRIMARY KEY (id);
CREATE INDEX idx_updates_data ON public.updates USING btree (created_at DESC);
alter table public.updates enable row level security;
create policy updates_select_auth on public.updates as permissive for select to authenticated using (( SELECT usuario_aprovado() AS usuario_aprovado));
create policy updates_write_admin on public.updates as permissive for all to authenticated using (is_admin()) with check (is_admin());
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.updates to anon;
grant DELETE, INSERT, MAINTAIN, SELECT, UPDATE on public.updates to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.updates to service_role;

-- v_reopened_count_real
create view public.v_reopened_count_real with (security_invoker=true) as
 WITH marcado AS (
         SELECT crisp_conversation_state_history.session_id,
            crisp_conversation_state_history.event_at,
            crisp_conversation_state_history.state,
            lag(crisp_conversation_state_history.state) OVER (PARTITION BY crisp_conversation_state_history.session_id ORDER BY crisp_conversation_state_history.event_at) AS estado_anterior,
                CASE
                    WHEN crisp_conversation_state_history.state = 'resolved'::text THEN crisp_conversation_state_history.event_at
                    ELSE NULL::timestamp with time zone
                END AS resolved_ts
           FROM crisp_conversation_state_history
        ), com_fecha AS (
         SELECT marcado.session_id,
            marcado.event_at AS reaberto_em,
            marcado.estado_anterior,
            marcado.state,
            COALESCE(min(marcado.resolved_ts) OVER (PARTITION BY marcado.session_id ORDER BY marcado.event_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), now()) AS fecha_em
           FROM marcado
        ), candidatos AS (
         SELECT com_fecha.session_id,
            com_fecha.reaberto_em,
            com_fecha.fecha_em
           FROM com_fecha
          WHERE com_fecha.estado_anterior = 'resolved'::text AND (com_fecha.state = ANY (ARRAY['pending'::text, 'unresolved'::text]))
        )
 SELECT session_id,
    count(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM crisp_messages m
          WHERE m.session_id = candidatos.session_id AND m.message_timestamp >= (candidatos.reaberto_em - '00:00:10'::interval) AND m.message_timestamp < candidatos.fecha_em AND (m.from_type = 'user'::text OR m.operator_crisp_id IS NOT NULL))))::integer AS reopened_count_real
   FROM candidatos
  GROUP BY session_id;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.v_reopened_count_real to service_role;

-- backups de volta ao public
alter table arquivo._bkp_ciclo_pesquisa_2026_09_25 set schema public;
alter table arquivo._bkp_csat_nota_falsa_2026_09_25 set schema public;
alter table arquivo._bkp_csat_pending_presos_2026_09_25 set schema public;
alter table arquivo._bkp_funcoes_csat_2026_10_05 set schema public;
alter table arquivo._res_ciclo_2026_09_25 set schema public;
drop schema arquivo;

commit;
