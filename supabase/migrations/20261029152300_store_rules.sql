-- =====================================================================
-- Step 10.1 — Apple's rules inside the app.
--
-- 1. withdraw_ai_consent(): Settings → AI & privacy's switch off. Withdraws every consent row of the
--    caller that isn't withdrawn yet, with the server's time (a device clock behind the server would
--    break withdrawn_at >= granted_at). Security invoker: RLS and the existing grant (update of
--    withdrawn_at, own rows only) apply. Returns how many rows it withdrew.
-- 2. account_storage_objects(uid): the Storage objects of one account, for the delete-account
--    Edge Function (service role only). Deleting the auth user cascades to every public table
--    (each user_id references auth.users on delete cascade) but not into Storage (20261023164719):
--    the function removes these through the Storage API first.
-- =====================================================================

create function public.withdraw_ai_consent() returns integer
  language sql
  security invoker
  set search_path = ''
as $$
  with withdrawn as (
    update public.ai_consent
       set withdrawn_at = greatest(now(), granted_at)
     where user_id = (select auth.uid())
       and withdrawn_at is null
    returning 1
  )
  select count(*)::integer from withdrawn;
$$;

revoke execute on function public.withdraw_ai_consent() from public, anon;
grant execute on function public.withdraw_ai_consent() to authenticated;

-- Every bucket that holds a student's files (each object's path starts with her id): audio-chunks
-- (recordings), slides (PDFs and slides, library PDFs), photos (board photos, document photos, library
-- images, the profile photo).
-- Called only by the delete-account function with the service role (as trash_purge_plan, 20261026090400).
create function public.account_storage_objects(uid uuid)
  returns table (bucket_id text, name text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id in ('audio-chunks', 'slides', 'photos')
     and (storage.foldername(o.name))[1] = uid::text
   order by o.bucket_id, o.name;
$$;

revoke execute on function public.account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_objects(uuid) to service_role;
