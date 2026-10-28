-- Bacheca Parrocchiale Santa Maria delle Grazie
-- Da eseguire una volta in Supabase: Dashboard → SQL Editor → New query → incolla tutto → Run.
-- PRIMA di eseguire:
--   1. crea il tuo account in Authentication → Users → Add user → Create new user (spunta "Auto Confirm User");
--   2. metti la stessa email nell'ultima istruzione in fondo al file.

-- ============================================================
-- Tabelle
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Persone abilitate a gestire la bacheca. Il proprietario le aggiunge dall'area riservata.
create table if not exists public.members (
  email       text primary key check (email = lower(email)),
  name        text not null check (char_length(name) between 1 and 80),
  role        text not null check (role in ('proprietario', 'amministratore', 'responsabile')),
  areas       text[] not null default '{}'
              check (areas <@ array['Avvisi', 'Celebrazioni', 'Eventi', 'Catechesi', 'Carità', 'Oratorio']),
  created_at  timestamptz not null default now(),
  -- un responsabile deve avere almeno un'area
  check (role <> 'responsabile' or cardinality(areas) > 0)
);

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 5000),
  category    text not null check (category in ('Avvisi', 'Celebrazioni', 'Eventi', 'Catechesi', 'Carità', 'Oratorio')),
  event_date  timestamp,
  expires_on  date,
  pinned      boolean not null default false,
  image_path  text,
  -- allegati: [{ "type": "link" | "pdf" | "audio", "name": "...", "url" | "path": "..." }]
  attachments jsonb not null default '[]'::jsonb,
  author      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ============================================================
-- Funzioni di controllo dei permessi
-- ============================================================

create or replace function public.my_email() returns text
language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Ruolo dell'utente collegato (null se la sua email non è tra i membri).
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.members where email = public.my_email() $$;

-- true se l'utente collegato può gestire gli avvisi di quella categoria.
create or replace function public.can_manage(cat text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = public.my_email()
      and (role in ('proprietario', 'amministratore') or cat = any(areas))
  )
$$;

-- Autore e date vengono impostati dal database, non dal browser.
create or replace function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.my_email();
    new.author := (select name from public.members where email = new.created_by);
    new.created_at := now();
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.author := old.author;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_stamp on public.posts;
create trigger posts_stamp before insert or update on public.posts
for each row execute function public.posts_stamp();

-- ============================================================
-- Regole di sicurezza (Row Level Security)
-- ============================================================

alter table public.members enable row level security;
alter table public.posts enable row level security;

-- Avvisi: tutti leggono quelli ancora validi; chi gestisce un'area vede anche quelli scaduti.
drop policy if exists "lettura avvisi" on public.posts;
create policy "lettura avvisi" on public.posts for select to anon, authenticated
  using (expires_on is null or expires_on >= current_date or public.can_manage(category));

drop policy if exists "crea avvisi" on public.posts;
create policy "crea avvisi" on public.posts for insert to authenticated
  with check (public.can_manage(category));

-- Vale sia per la categoria attuale sia per quella nuova: un responsabile non può spostare avvisi fuori dalla sua area.
drop policy if exists "modifica avvisi" on public.posts;
create policy "modifica avvisi" on public.posts for update to authenticated
  using (public.can_manage(category))
  with check (public.can_manage(category));

drop policy if exists "elimina avvisi" on public.posts;
create policy "elimina avvisi" on public.posts for delete to authenticated
  using (public.can_manage(category));

-- Membri: ognuno vede la propria scheda, il proprietario vede tutti e ne cambia ruolo e aree.
-- Aggiunta e rimozione passano dalle funzioni qui sotto, che creano/eliminano anche l'account.
-- Il proprietario non può essere modificato o rimosso dall'app (solo dall'SQL Editor).
drop policy if exists "lettura membri" on public.members;
create policy "lettura membri" on public.members for select to authenticated
  using (email = public.my_email() or public.my_role() = 'proprietario');

drop policy if exists "crea membri" on public.members;
drop policy if exists "elimina membri" on public.members;

drop policy if exists "modifica membri" on public.members;
create policy "modifica membri" on public.members for update to authenticated
  using (public.my_role() = 'proprietario' and role <> 'proprietario')
  with check (role <> 'proprietario');

-- ============================================================
-- Account con password (gestiti solo dal proprietario, senza email di conferma)
-- ============================================================

-- Controlla che chi chiama sia il proprietario e che la persona indicata non lo sia.
create or replace function public.verifica_gestione(v_email text) returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.my_role() is distinct from 'proprietario' then
    raise exception 'Solo il proprietario può gestire le persone abilitate';
  end if;
  if exists (select 1 from public.members where email = v_email and role = 'proprietario') then
    raise exception 'Il proprietario non si può modificare da qui';
  end if;
end;
$$;

-- Crea l'account (già confermato) e lo abilita con il ruolo scelto.
create or replace function public.crea_membro(p_email text, p_password text, p_name text, p_role text, p_areas text[])
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid := gen_random_uuid();
begin
  perform public.verifica_gestione(v_email);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email non valida'; end if;
  if char_length(coalesce(p_password, '')) < 8 then raise exception 'La password deve avere almeno 8 caratteri'; end if;
  if p_role not in ('amministratore', 'responsabile') then raise exception 'Ruolo non valido'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) or exists (select 1 from public.members where email = v_email) then
    raise exception 'Esiste già un account con questa email';
  end if;

  insert into public.members (email, name, role, areas)
  values (v_email, trim(p_name), p_role, case when p_role = 'responsabile' then coalesce(p_areas, '{}') else '{}' end);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', trim(p_name)), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );
end;
$$;

create or replace function public.reimposta_password(p_email text, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
begin
  perform public.verifica_gestione(v_email);
  if not exists (select 1 from public.members where email = v_email) then raise exception 'Persona non trovata'; end if;
  if char_length(coalesce(p_password, '')) < 8 then raise exception 'La password deve avere almeno 8 caratteri'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where lower(email) = v_email;
end;
$$;

-- Toglie l'accesso ed elimina l'account.
create or replace function public.rimuovi_membro(p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  perform public.verifica_gestione(v_email);
  delete from public.members where email = v_email;
  delete from auth.users where lower(email) = v_email;
end;
$$;

revoke execute on function public.verifica_gestione(text) from public, anon, authenticated;
revoke execute on function public.crea_membro(text, text, text, text, text[]) from public, anon;
revoke execute on function public.reimposta_password(text, text) from public, anon;
revoke execute on function public.rimuovi_membro(text) from public, anon;
grant execute on function public.crea_membro(text, text, text, text, text[]) to authenticated;
grant execute on function public.reimposta_password(text, text) to authenticated;
grant execute on function public.rimuovi_membro(text) to authenticated;

-- ============================================================
-- Immagini e allegati (Storage)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('immagini', 'immagini', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- PDF e file audio (max 20 MB ciascuno).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('allegati', 'allegati', true, 20971520, array[
  'application/pdf',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac'
])
on conflict (id) do nothing;

drop policy if exists "membri caricano immagini" on storage.objects;
create policy "membri caricano immagini" on storage.objects for insert to authenticated
  with check (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);

-- Necessaria anche per poter eliminare (la visualizzazione pubblica passa dal link diretto).
drop policy if exists "membri vedono immagini" on storage.objects;
create policy "membri vedono immagini" on storage.objects for select to authenticated
  using (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);

drop policy if exists "membri eliminano immagini" on storage.objects;
create policy "membri eliminano immagini" on storage.objects for delete to authenticated
  using (bucket_id in ('immagini', 'allegati') and public.my_role() is not null);

-- ============================================================
-- Proprietario (tu): usa la stessa email dell'account creato in Authentication → Users,
-- sostituisci email e nome, poi esegui.
-- ============================================================

insert into public.members (email, name, role)
values (lower('LA-TUA-EMAIL@esempio.it'), 'Don Domenico', 'proprietario')
on conflict (email) do update set role = 'proprietario', name = excluded.name;
