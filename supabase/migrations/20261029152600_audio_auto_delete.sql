-- =====================================================================
-- Step 10.1b-3 — Audio auto-delete, on by default: a lecture's recording is deleted 3 days after
-- it has been transcribed (privacy policy §7); the transcript, notes and summaries stay.
--
-- 1. lectures.transcribed_at: when the last audio chunk of a lecture that is no longer being
--    recorded or uploaded became 'transcribed' (the server's time). lectures.audio_deleted_at: when
--    the nightly job deleted the recording (the app says "Deleted on …").
-- 2. The date is the server's: audio_delete_after = transcribed_at + 3 days while the setting is
--    'delete_3_days' and the audio isn't deleted yet; null otherwise. A BEFORE trigger on lectures
--    sets it on every write, so changing the setting changes or clears the date, and a client can't
--    set another one. An AFTER trigger on audio_chunks (status → transcribed) stamps transcribed_at
--    when the last chunk is done; a lecture whose chunks were all transcribed during the recording
--    is stamped when its status moves past recording / uploading (the BEFORE trigger).
-- 3. D9, no backfill: nothing recorded before this step is deleted automatically. Every existing
--    lecture on 'delete_3_days' whose audio isn't deleted becomes 'delete_manually' with no date:
--    the undated ones (never dated by the app) and the ones the app had dated (the student chose
--    "Delete in 3 days" after a recording; the app set now + 3 days), even if that date has passed.
--    Deleting audio can't be undone, keeping it can: she can delete old audio herself. Only lectures
--    still being recorded, uploaded or transcribed, with no date yet, keep the new default.
-- 4. audio_purge_plan(due) / audio_purge(lecture_ids): for the nightly purge-trash function only
--    (service role), as trash_purge_plan / trash_purge (20261026090400): the files of lectures
--    whose date has passed, then (after the function removed them through the Storage API) their
--    chunks' storage_path cleared and the lecture marked audio_deleted_at. Chunk rows stay, so the
--    transcript keeps its place; the app already treats a chunk without a path as deleted audio.
--
-- Account deletion: the cascade deletes rows and never updates these columns, so neither trigger
-- runs in it. The AFTER trigger is added to pgTAP 20's reviewed list (it only updates the same
-- student's lecture, and only on an UPDATE of a chunk's status).
-- =====================================================================

alter table public.lectures
  add column transcribed_at   timestamptz,
  add column audio_deleted_at timestamptz;

-- ---------------------------------------------------------------------
-- D9: run once, below, before the triggers exist (a function so pgTAP 22 can check it on rows
-- made the old way). Returns how many lectures became "Delete manually". Dated or not, nothing
-- recorded before this step is left for the nightly job.
-- ---------------------------------------------------------------------

create function private.audio_retention_before_auto_delete()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  update public.lectures
     set audio_retention = 'delete_manually',
         audio_delete_after = null
   where audio_retention = 'delete_3_days'
     and audio_deleted_at is null
     and (audio_delete_after is not null or status not in ('recording', 'uploading', 'transcribing'));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.audio_retention_before_auto_delete() from public;

select private.audio_retention_before_auto_delete();

-- ---------------------------------------------------------------------
-- The date
-- ---------------------------------------------------------------------

create function private.lecture_audio_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Recorded and uploaded, every chunk transcribed (chunks transcribed while recording count now).
  if tg_op = 'UPDATE'
     and new.transcribed_at is null
     and new.status not in ('draft', 'recording', 'uploading')
     and exists (select 1 from public.audio_chunks c where c.lecture_id = new.id)
     and not exists (select 1 from public.audio_chunks c where c.lecture_id = new.id and c.status <> 'transcribed') then
    new.transcribed_at := now();
  end if;

  new.audio_delete_after := case
    when new.audio_retention = 'delete_3_days' and new.transcribed_at is not null and new.audio_deleted_at is null
      then new.transcribed_at + interval '3 days'
  end;
  return new;
end;
$$;

create trigger lecture_audio_dates
  before insert or update on public.lectures
  for each row execute function private.lecture_audio_dates();

-- The last chunk transcribed: stamp the lecture (its BEFORE trigger then sets the date).
create function private.audio_chunk_transcribed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.lectures l
     set transcribed_at = now()
   where l.id = new.lecture_id
     and l.transcribed_at is null
     and l.status not in ('draft', 'recording', 'uploading')
     and not exists (select 1 from public.audio_chunks c where c.lecture_id = new.lecture_id and c.status <> 'transcribed');
  return null;
end;
$$;

create trigger audio_chunk_transcribed
  after update of status on public.audio_chunks
  for each row
  when (new.status = 'transcribed' and old.status is distinct from 'transcribed')
  execute function private.audio_chunk_transcribed();

-- ---------------------------------------------------------------------
-- The nightly job (purge-trash), service role only
-- ---------------------------------------------------------------------

-- Every lecture whose recording is due (its date passed, not deleted yet), with each of its stored
-- chunks; a due lecture whose files are already gone is listed once with a null path, so it is
-- still marked deleted.
create function public.audio_purge_plan(due timestamptz)
returns table (lecture_id uuid, bucket text, path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, 'audio-chunks', a.storage_path
    from public.lectures l
    left join public.audio_chunks a on a.lecture_id = l.id and a.storage_path is not null
   where l.audio_retention = 'delete_3_days'
     and l.audio_delete_after <= due
     and l.audio_deleted_at is null
   order by l.id, a.storage_path;
$$;

-- After their files were removed: the chunks lose their path, the lectures are marked deleted.
-- Only the listed lectures (the files the function removed), whatever their setting is now.
create function public.audio_purge(lecture_ids uuid[])
returns table (lectures integer, chunks integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_chunks integer;
  n_lectures integer;
begin
  update public.audio_chunks a set storage_path = null
   where a.lecture_id = any (lecture_ids) and a.storage_path is not null;
  get diagnostics n_chunks = row_count;
  update public.lectures l set audio_deleted_at = now()
   where l.id = any (lecture_ids) and l.audio_deleted_at is null;
  get diagnostics n_lectures = row_count;
  return query select n_lectures, n_chunks;
end;
$$;

revoke execute on function public.audio_purge_plan(timestamptz) from public, anon, authenticated;
revoke execute on function public.audio_purge(uuid[]) from public, anon, authenticated;
grant execute on function public.audio_purge_plan(timestamptz) to service_role;
grant execute on function public.audio_purge(uuid[]) to service_role;
