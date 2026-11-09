-- =====================================================================
-- Step 10.1 — the account cascade must not run into a trigger that touches another table.
--
-- Deleting an account (delete-account → auth.admin.deleteUser) is a DELETE on auth.users run by
-- supabase_auth_admin, which has no grants on our tables. The cascade's own deletes (and its set-null
-- updates, with their BEFORE triggers) run as each table's owner; AFTER row triggers are queued and
-- fire at the end of the statement as supabase_auth_admin. So an AFTER trigger fired by the cascade
-- must not read or write another table.
--
-- Every trigger, checked (the advisor's review, 9 Nov):
--   AFTER DELETE:  quiz_answer_touch_attempt (quiz_answers) — the only one. It touched the answer's
--                  attempt to recompute its score ("permission denied for table quiz_attempts").
--                  Fixed below: on DELETE, skipped when the caller may not update attempts. Only the
--                  account cascade deletes answers that way, and it deletes their attempts too:
--                  there is nothing to recompute. (Checking whether the attempt still exists would
--                  itself be refused; the privilege check reads no table.)
--   AFTER UPDATE of a column the cascade never sets: quiz_answer_review (verdict),
--                  flashcard_schedule (deleted_at), folders_cascade_course (course_id: folders are
--                  deleted with their course). The cascade's set-null updates (course_id, file_id,
--                  source_file_id, from_question_id, lecture_id, chunk_id, reply_to, summary_id)
--                  don't fire them.
--   AFTER INSERT only: create_course_settings, on_auth_user_created.
--   BEFORE (run as the owner, NEW only): set_updated_at, set_updated_at_favorites,
--                  folders_before_write, files_before_write, quiz_attempt_score.
-- pgTAP 20_store_rules lists every AFTER update/delete trigger in public: a new one fails it until it
-- is checked here and added there.
-- =====================================================================

create or replace function private.quiz_answer_touch_attempt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not pg_catalog.has_table_privilege('public.quiz_attempts', 'UPDATE') then
    -- The account cascade (supabase_auth_admin): its attempt goes too.
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update public.quiz_attempts set max_points = max_points where id = old.attempt_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.attempt_id <> old.attempt_id) then
    update public.quiz_attempts set max_points = max_points where id = new.attempt_id;
  end if;
  return null;
end;
$$;
