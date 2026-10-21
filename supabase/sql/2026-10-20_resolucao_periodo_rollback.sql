-- Desfaz 2026-10-20_resolucao_periodo.sql. O front que chama resolucao_periodo para de mostrar o cartão
-- "Conversas resolvidas" (fica "—") até voltar para a versão anterior.
drop function if exists public.resolucao_periodo(timestamp with time zone, timestamp with time zone, text, text[], text);
