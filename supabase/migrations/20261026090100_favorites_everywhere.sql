-- Favorites for everything, and favorites that don't reorder (step 2.2).
--
-- 1. Photos and PDFs inside a lecture (media) can be favorites: starred_at.
-- 2. Adding or removing a favorite leaves updated_at alone, so Recent and
--    the course list keep their order. Only courses, folders, files and
--    media (the tables with starred_at) get the new trigger; every other
--    table keeps private.set_updated_at() (updated_at = now()), so big rows
--    such as summaries are never serialized on save.
-- 3. changed_at moves on every update of those four tables. The iPhone's
--    offline copy downloads changes by it (a favorite-only change has to
--    reach it too); nothing orders by it.

alter table public.media add column starred_at timestamptz;

alter table public.courses add column changed_at timestamptz not null default now();
alter table public.folders add column changed_at timestamptz not null default now();
alter table public.files   add column changed_at timestamptz not null default now();
alter table public.media   add column changed_at timestamptz not null default now();

update public.courses set changed_at = updated_at;
update public.folders set changed_at = updated_at;
update public.files   set changed_at = updated_at;
update public.media   set changed_at = updated_at;

create index courses_changed_idx on public.courses (user_id, changed_at);
create index folders_changed_idx on public.folders (user_id, changed_at);
create index files_changed_idx   on public.files (user_id, changed_at);
create index media_changed_idx   on public.media (user_id, changed_at);

create function private.set_updated_at_favorites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.changed_at = now();
  if new.starred_at is distinct from old.starred_at
     and (to_jsonb(new) - 'starred_at' - 'updated_at' - 'changed_at')
       = (to_jsonb(old) - 'starred_at' - 'updated_at' - 'changed_at') then
    -- Only the favorite changed: keep the "last edited" time.
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger set_updated_at on public.courses;
drop trigger set_updated_at on public.folders;
drop trigger set_updated_at on public.files;
drop trigger set_updated_at on public.media;

create trigger set_updated_at before update on public.courses
  for each row execute function private.set_updated_at_favorites();
create trigger set_updated_at before update on public.folders
  for each row execute function private.set_updated_at_favorites();
create trigger set_updated_at before update on public.files
  for each row execute function private.set_updated_at_favorites();
create trigger set_updated_at before update on public.media
  for each row execute function private.set_updated_at_favorites();
