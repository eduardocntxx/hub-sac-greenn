-- Desfaz 2026-11-12_taxa_oferta.sql. A página Suporte Estratégico passa a mostrar erro até voltar.
drop function if exists public.taxa_oferta(timestamp with time zone, timestamp with time zone);
