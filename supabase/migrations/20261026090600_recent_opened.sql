-- Step 3.5: Recent = opened or edited (like Finder and Drive).
--
-- Opening a file sets files.last_opened_at. Like adding a favorite, that is
-- not an edit: updated_at ("Date edited", the grid's sort) stays, while
-- changed_at still moves so the iPhone's offline copy downloads it. Recent
-- orders by the later of the two (the app merges the newest by updated_at
-- with the newest by last_opened_at; files_user_opened_idx serves the latter).
--
-- Same trigger function as 20261026090100, now also for last_opened_at.
-- Only files has that column; on courses, folders and media removing the
-- missing key changes nothing.

create or replace function private.set_updated_at_favorites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.changed_at = now();
  if (to_jsonb(new) ->> 'starred_at' is distinct from to_jsonb(old) ->> 'starred_at'
      or to_jsonb(new) ->> 'last_opened_at' is distinct from to_jsonb(old) ->> 'last_opened_at')
     and (to_jsonb(new) - 'starred_at' - 'last_opened_at' - 'updated_at' - 'changed_at')
       = (to_jsonb(old) - 'starred_at' - 'last_opened_at' - 'updated_at' - 'changed_at') then
    -- Only the favorite or the "last opened" time changed: keep the "last edited" time.
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;
