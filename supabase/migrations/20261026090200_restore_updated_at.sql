-- Repairs "last edited" (updated_at) after 20261026090100_favorites_everywhere.
--
-- That migration filled the new changed_at with `update … set changed_at =
-- updated_at` while the old trigger was still active, and the trigger set
-- updated_at = now() on every row: every course, folder, file and media row
-- got the migration time as its "last edited" date (Recent and "Date
-- edited" lost their order). The same statement copied each row's real
-- updated_at into changed_at (SET reads the row before the trigger), so:
--
--   * rows untouched since then have changed_at < updated_at, and their
--     real updated_at is changed_at: it is put back;
--   * rows edited since then have a genuine new updated_at (= changed_at):
--     left alone;
--   * rows whose favorite changed since then (changed_at moved, updated_at
--     kept the migration time) can't be recovered and are left as they are.
--
-- changed_at is set to now() on the repaired rows so the iPhone's offline
-- copy downloads the corrected dates. The triggers are switched off for
-- the repair so they don't stamp now() again.

create function private.restore_updated_at(table_name text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  fixed integer;
begin
  execute format('alter table public.%I disable trigger set_updated_at', table_name);
  execute format(
    'update public.%I set updated_at = changed_at, changed_at = now() where changed_at < updated_at',
    table_name);
  get diagnostics fixed = row_count;
  execute format('alter table public.%I enable trigger set_updated_at', table_name);
  return fixed;
end;
$$;

select private.restore_updated_at('courses');
select private.restore_updated_at('folders');
select private.restore_updated_at('files');
select private.restore_updated_at('media');
