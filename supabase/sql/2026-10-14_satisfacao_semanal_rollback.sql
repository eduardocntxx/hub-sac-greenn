-- Rollback de 2026-10-14_satisfacao_semanal.sql: função nova, nada mais depende dela no banco.
drop function if exists public.satisfacao_semanal(timestamptz, timestamptz, text);
