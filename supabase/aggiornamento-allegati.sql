-- Aggiornamento: allegati agli avvisi (link, PDF, musica).
-- Da eseguire UNA volta in Supabase: SQL Editor → New query → incolla tutto → Run.
-- (Chi installa da zero con schema.sql ha già tutto e non deve eseguire questo file.)

alter table public.posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Spazio per PDF e file audio (max 20 MB ciascuno).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('allegati', 'allegati', true, 20971520, array[
  'application/pdf',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac'
])
on conflict (id) do nothing;

-- Le regole delle immagini ora valgono anche per gli allegati.
drop policy if exists "membri caricano immagini" on storage.objects;
create policy "membri caricano immagini" on storage.objects for insert to authenticated
  with check (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);

drop policy if exists "membri vedono immagini" on storage.objects;
create policy "membri vedono immagini" on storage.objects for select to authenticated
  using (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);

drop policy if exists "membri eliminano immagini" on storage.objects;
create policy "membri eliminano immagini" on storage.objects for delete to authenticated
  using (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);
