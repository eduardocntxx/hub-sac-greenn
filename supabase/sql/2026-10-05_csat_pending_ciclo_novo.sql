-- Conversa reaberta de verdade e resolvida de novo volta a receber pesquisa de CSAT.
-- Antes: o n8n grava csat_pending com ON CONFLICT DO NOTHING; a linha de uma pesquisa antiga NÃO respondida
-- (respondido = false) nunca era apagada na reabertura (o fluxo só apaga se respondido = true), então o
-- "Criou Pending Agora?" dava falso e a pesquisa não saía (451 conversas bloqueadas em 05/10, 230 resolvidas
-- de novo sem pesquisa desde 26/09; caso session_546c3344..., 03/09 -> 05/10).
-- Agora: no INSERT, a linha existente de um ciclo ANTERIOR (criada antes de crisp_conversations.current_started_at
-- menos 1 min) é substituída. Linha do ciclo atual segue bloqueando (o fluxo resolve a conversa várias vezes
-- durante a pesquisa, sem loop). BEFORE INSERT roda antes da checagem de conflito, então o ON CONFLICT passa a inserir.
-- Rollback: 2026-10-05_csat_pending_ciclo_novo_rollback.sql
create or replace function public._csat_pending_substitui_antigo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.csat_pending p
  using public.crisp_conversations cc
  where p.session_id = new.session_id and cc.crisp_id = new.session_id
    and p.created_at < cc.current_started_at - interval '1 minute';
  return new;
end $$;
revoke all on function public._csat_pending_substitui_antigo() from public, anon, authenticated;
drop trigger if exists trg_csat_pending_substitui_antigo on public.csat_pending;
create trigger trg_csat_pending_substitui_antigo before insert on public.csat_pending
  for each row execute function public._csat_pending_substitui_antigo();
