-- =====================================================================
-- Step 1.2 · Migration 1 — profiles, library (courses, folders, files)
-- and documents.
--
-- Conventions used by every Studiply table:
--   - user_id references auth.users and cascades, so deleting an account
--     deletes all of its rows (step 10.1).
--   - Parent tables expose unique (id, user_id); children reference them
--     with a composite foreign key (parent_id, user_id). Foreign key checks
--     bypass RLS, so this is what stops a user from attaching a row to
--     someone else's course, folder or lecture.
--   - Recording times are integer milliseconds from the start of the
--     recording (t_ms); wall-clock times are timestamptz.
--   - Trash is deleted_at, star is starred_at (null = not starred).
--   - Every table has RLS: a user only ever sees and changes their own rows.
-- =====================================================================

-- Helpers live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Enables RLS on a table and gives the owner exactly the operations listed.
-- Grants match the policies, so an operation without a policy is refused
-- with "permission denied" instead of silently matching zero rows.
create function private.apply_owner_rls(
  table_name text,
  ops text[] default array['select', 'insert', 'update', 'delete'],
  owner_column text default 'user_id'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  owner_check text := format('(select auth.uid()) = %I', owner_column);
  op text;
begin
  execute format('alter table public.%I enable row level security', table_name);
  execute format('revoke all on table public.%I from anon, authenticated', table_name);

  foreach op in array ops loop
    execute format('grant %s on table public.%I to authenticated', op, table_name);

    case op
      when 'select' then
        execute format(
          'create policy "Owner can read" on public.%I for select to authenticated using (%s)',
          table_name, owner_check);
      when 'insert' then
        execute format(
          'create policy "Owner can insert" on public.%I for insert to authenticated with check (%s)',
          table_name, owner_check);
      when 'update' then
        execute format(
          'create policy "Owner can update" on public.%I for update to authenticated using (%s) with check (%s)',
          table_name, owner_check, owner_check);
      when 'delete' then
        execute format(
          'create policy "Owner can delete" on public.%I for delete to authenticated using (%s)',
          table_name, owner_check);
      else
        raise exception 'Unknown operation %', op;
    end case;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Profiles (one per auth user, created at sign-up)
-- ---------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text,
  initials         text,
  avatar_url       text,
  default_language text not null default 'en',
  pdf_paper_size   text not null default 'a4' check (pdf_paper_size in ('a4', 'letter')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, initials)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    upper(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.email, ''), 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Courses and their settings
-- ---------------------------------------------------------------------

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#F5E0D8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text not null default 'folder',
  sort_order  integer not null default 0,
  is_archived boolean not null default false,
  starred_at  timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

-- Asked once when a course is created, editable anytime (SUMMARY-SPEC.md,
-- "Course settings this adds"). The slider defaults are the spec's defaults.
create table public.course_settings (
  course_id              uuid primary key,
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_type           text check (subject_type in (
                           'history', 'math', 'finance', 'science', 'law', 'business',
                           'social', 'programming', 'language', 'philosophy')),
  exam_format            text check (exam_format in (
                           'multiple_choice', 'essay', 'problem_solving', 'open_book', 'oral')),
  exam_date              date,
  summary_language       text, -- null = the lecture's language
  professor              text,
  slider_starting_point  smallint not null default 2 check (slider_starting_point between 1 and 10),
  slider_length          smallint not null default 5 check (slider_length between 1 and 10),
  slider_depth           smallint not null default 6 check (slider_depth between 1 and 10),
  slider_examples        smallint not null default 5 check (slider_examples between 1 and 10),
  slider_visuals         smallint not null default 4 check (slider_visuals between 1 and 10),
  slider_exam_focus      smallint not null default 5 check (slider_exam_focus between 1 and 10),
  slider_self_test       smallint not null default 5 check (slider_self_test between 1 and 10),
  slider_language        smallint not null default 4 check (slider_language between 1 and 10),
  slider_extra_resources smallint not null default 6 check (slider_extra_resources between 1 and 10),
  slider_follow_marks    smallint not null default 7 check (slider_follow_marks between 1 and 10),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);

-- Every course always has a settings row.
create function private.create_course_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.course_settings (course_id, user_id) values (new.id, new.user_id);
  return new;
end;
$$;

create trigger create_course_settings
  after insert on public.courses
  for each row execute function private.create_course_settings();

-- ---------------------------------------------------------------------
-- Folders (nested) and files (library items)
-- ---------------------------------------------------------------------
-- A null course_id means the item sits at the "My library" root.
-- course_id is kept equal to the parent folder's course by triggers below.

create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id  uuid,
  parent_id  uuid,
  name       text not null,
  sort_order integer not null default 0,
  starred_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (parent_id is distinct from id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.folders (id, user_id) on delete cascade
);

-- A file is one tile in the library. A lecture file has up to three
-- documents (notes, summary, transcript) plus a row in lectures.
create table public.files (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id      uuid,
  folder_id      uuid,
  kind           text not null check (kind in ('lecture', 'document', 'pdf', 'unit_summary', 'exam_pack')),
  title          text not null,
  sort_order     integer not null default 0,
  starred_at     timestamptz,
  last_opened_at timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade,
  foreign key (folder_id, user_id) references public.folders (id, user_id) on delete cascade
);

-- Before a folder is written: take the parent's course, and refuse to move a
-- folder into itself or one of its subfolders.
create function private.folders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    select f.course_id into new.course_id
    from public.folders f
    where f.id = new.parent_id;

    if tg_op = 'UPDATE' and exists (
      with recursive ancestors (id) as (
        select new.parent_id
        union
        select f.parent_id
        from public.folders f
        join ancestors a on f.id = a.id
        where f.parent_id is not null
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'A folder cannot be moved into itself or one of its subfolders'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- After a folder changes course, its subfolders and files follow.
-- Each subfolder update fires this trigger again, so the whole tree moves.
create function private.folders_cascade_course()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.folders
  set course_id = new.course_id
  where parent_id = new.id and course_id is distinct from new.course_id;

  update public.files
  set course_id = new.course_id
  where folder_id = new.id and course_id is distinct from new.course_id;

  return null;
end;
$$;

create function private.files_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    select f.course_id into new.course_id
    from public.folders f
    where f.id = new.folder_id;
  end if;
  return new;
end;
$$;

create trigger folders_before_write
  before insert or update of parent_id, course_id on public.folders
  for each row execute function private.folders_before_write();

create trigger folders_cascade_course
  after update of course_id on public.folders
  for each row
  when (old.course_id is distinct from new.course_id)
  execute function private.folders_cascade_course();

create trigger files_before_write
  before insert or update of folder_id, course_id on public.files
  for each row execute function private.files_before_write();

-- ---------------------------------------------------------------------
-- Documents (one row per tab) and their versions
-- ---------------------------------------------------------------------
-- content is ProseMirror JSON. Each block's origin (ai, student, media)
-- is a node attribute inside it (step 4.3), not a column here.

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_id    uuid not null,
  tab        text not null check (tab in ('notes', 'summary', 'transcript')),
  content    jsonb not null default '{"type": "doc", "content": []}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (file_id, tab),
  foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade
);

-- Snapshots: one per AI generation and one at the end of each editing
-- session. Versions are never edited, only added or deleted.
-- summary_id gets its foreign key in migration 2, where summaries is created.
create table public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null,
  content     jsonb not null,
  reason      text not null check (reason in ('ai_generation', 'session_end', 'restore')),
  summary_id  uuid,
  created_at  timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.courses
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.course_settings
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.folders
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.files
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.documents
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index courses_user_idx            on public.courses (user_id);
create index course_settings_user_idx    on public.course_settings (user_id);
create index folders_user_course_idx     on public.folders (user_id, course_id);
create index folders_parent_idx          on public.folders (parent_id);
create index folders_course_idx          on public.folders (course_id);
create index files_user_folder_idx       on public.files (user_id, folder_id);
create index files_course_idx            on public.files (course_id);
create index files_folder_idx            on public.files (folder_id);
create index files_user_opened_idx       on public.files (user_id, last_opened_at desc);
create index documents_user_idx          on public.documents (user_id);
create index document_versions_doc_idx   on public.document_versions (document_id, created_at desc);
create index document_versions_user_idx  on public.document_versions (user_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- Profiles are created by the sign-up trigger and deleted with the account.
select private.apply_owner_rls('profiles', array['select', 'update'], 'id');
select private.apply_owner_rls('courses');
-- Settings rows are created by the course trigger and deleted with the course.
select private.apply_owner_rls('course_settings', array['select', 'insert', 'update']);
select private.apply_owner_rls('folders');
select private.apply_owner_rls('files');
select private.apply_owner_rls('documents');
select private.apply_owner_rls('document_versions', array['select', 'insert', 'delete']);
