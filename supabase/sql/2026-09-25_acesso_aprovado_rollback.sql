-- Desfaz 2026-09-25_acesso_aprovado.sql (a função usuario_aprovado() fica, sem uso).
begin;
do $d$ declare r record; nome text; begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^_.*_base$'
           and p.proname in ('_analytics_evolucao_base','_analytics_summary_base','_atendente_escalado_sabado_base','_chamados_evolucao_base',
            '_colaboradores_online_base','_conversas_evolucao_base','_dashboard_atendimento_summary_base','_distinct_canais_base',
            '_distribuicao_canal_conversas_base','_distribuicao_status_conversas_base','_migracoes_por_plataforma_base','_migracoes_resumo_base') loop
    nome := regexp_replace(r.proname, '^_(.*)_base$', '\1');
    execute format('drop function public.%I(%s)', nome, pg_get_function_identity_arguments(r.oid));
    execute format('alter function public.%I(%s) rename to %I', r.proname, pg_get_function_identity_arguments(r.oid), nome);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', nome, pg_get_function_identity_arguments(r.oid));
  end loop;
end $d$;
grant execute on function public._primeiras_respostas_humanas(timestamptz, timestamptz), public.reopened_count_real_periodo(timestamptz, timestamptz),
  public.horario_por_nome(text), public.marcar_conversa_estado(text, text), public.marcar_conversa_resolvida(text),
  public.refresh_cobertura_semanal(), public.resetar_csat_pending_se_livre(text), public.team_csat_monthly(),
  public.team_ranking(timestamptz, timestamptz), public.upsert_operator_alias(text, text, text) to authenticated;
do $d$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname='public' and cmd='SELECT'
           and qual ilike '%usuario_aprovado%' and tablename <> 'helpdesks' loop
    execute format('alter policy %I on public.%I using (true)', r.policyname, r.tablename);
  end loop;
end $d$;
alter policy helpdesks_select on public.helpdesks using (((status = 'finalizado'::text) OR (created_by = current_app_user_id()) OR is_admin() OR has_permission('helpdesks'::text)));
notify pgrst, 'reload schema';
commit;
