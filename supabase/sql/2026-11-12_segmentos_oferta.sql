-- Segmentos crus da conversa do Crisp (2026-11-12), para a taxa de oferta do Suporte Estratégico.
--
-- O fluxo "Crisp → Hub" resume meta.segments num tipo_cliente único (Final, Produtor, SDR, Bluee) e descarta o
-- resto, então as tags oferta-* do playbook (oferta-orderbump, oferta-upsell, oferta-checkout, oferta-vitrine,
-- oferta-closer, oferta-vision) nunca chegavam ao Hub. Esta coluna guarda a lista inteira. Quem grava é o
-- próprio "Crisp → Hub", quando a conversa é resolvida: "Resolvida? (segmentos)" → "Crisp | Buscar Segmentos"
-- → "Supabase | Gravar Segmentos". tipo_cliente não muda.
--
-- Aplicar ANTES de colar os nós no n8n: sem a coluna, o PATCH falha a cada conversa resolvida.
-- Rollback: 2026-11-12_segmentos_oferta_rollback.sql

begin;

alter table public.crisp_conversations add column if not exists segmentos text[];

create index if not exists crisp_conversations_segmentos_idx
  on public.crisp_conversations using gin (segmentos);

commit;
