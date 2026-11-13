-- Rollback de 2026-10-22_storage_limites.sql (volta como estava em 22/10).
begin;

update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('tool-images', 'avatars');

create policy avatars_own_write on storage.objects for insert to public
  with check ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text));
create policy avatars_own_update on storage.objects for update to public
  using ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text));
create policy avatars_own_delete on storage.objects for delete to public
  using ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = (auth.uid())::text));

commit;
