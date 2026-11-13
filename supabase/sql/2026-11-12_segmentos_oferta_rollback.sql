-- Desfaz 2026-11-12_segmentos_oferta.sql. Tirar antes os 3 nós de segmentos do "Crisp → Hub", senão o PATCH
-- passa a falhar a cada conversa resolvida.
begin;
drop index if exists public.crisp_conversations_segmentos_idx;
alter table public.crisp_conversations drop column if exists segmentos;
commit;
