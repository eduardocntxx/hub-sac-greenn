-- Rollback da recuperação de 15 notas de CSAT por e-mail (2026-10-15, ver docs/HISTORICO.md).
-- O INSERT foi feito com os dados montados de crisp_conversations/crisp_messages/csat_pending (arquivo local
-- ~/Downloads/n8n-backup/.recuperar_15.sql, fora do repo por ter dado de cliente). Desfaz só as linhas inseridas
-- naquele dia para estas 15 conversas.
begin;
set local app.origem = 'rollback recuperar 15 notas CSAT de e-mail (2026-10-15)';
with alvo(crisp_id) as (values
  ('session_0fbc0802-38ac-4838-8795-8e38ee6b3008'), ('session_136f8cc1-eefb-4b79-9ea5-6e69b6b6fa13'),
  ('session_18b96526-5404-42a6-8bc7-049562c8ebf6'), ('session_1a97ff7b-ed18-4362-bf2d-f3cfde84eabe'),
  ('session_366cf1e4-dcc7-413e-8f39-2f39c5cd89d9'), ('session_42ddcc71-952f-4110-bd75-8a27e6720d59'),
  ('session_568c2116-7f43-4b3a-9077-c21ace98e86d'), ('session_5ae0a461-438d-4400-94b7-47feff9b9078'),
  ('session_654e3a4c-e4b0-41a5-9cec-cf54173c79ba'), ('session_6f0f8d2d-5e29-4547-acdd-b5d50aa95731'),
  ('session_78f6ba19-ddef-4252-89d2-0e0c79bddc2d'), ('session_ad48f5a8-6447-4a37-863b-c4192a1dc27b'),
  ('session_b7fbfaff-7870-4a34-a8cd-0aa784ac61dd'), ('session_ec7e8a6b-862e-4683-9fdd-eae98aa7dc4d'),
  ('session_edea040e-448a-4908-9625-8f351c3f229b')
), del as (
  delete from public.csat_results cr using alvo a
  where cr.crisp_id = a.crisp_id and cr.created_at >= '2026-10-15 13:00+00' and cr.created_at < '2026-10-15 15:00+00'
  returning cr.crisp_id
)
update public.csat_pending p set respondido = false where p.session_id in (select crisp_id from del);
commit;
