-- 2026-10-22 — limites de upload no Storage.
-- Rollback: 2026-10-22_storage_limites_rollback.sql
--
-- Os dois buckets aceitavam qualquer tipo e tamanho de arquivo. `avatars` (vazio, o front não usa)
-- deixava qualquer conta logada enviar arquivo público para a própria pasta — inclusive conta criada
-- direto em /auth/v1/signup, que está aberto a qualquer domínio. Escrita no `avatars` sai; a leitura
-- pública fica (não há nada lá). `tool-images` segue só admin, agora só imagem até 5 MB.
begin;

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
 where id = 'tool-images';

update storage.buckets
   set file_size_limit = 1048576,
       allowed_mime_types = array['image/png','image/jpeg','image/webp']
 where id = 'avatars';

drop policy if exists avatars_own_write on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;

commit;
