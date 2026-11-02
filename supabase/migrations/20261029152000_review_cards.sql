-- Flashcards in review (step 9.1): every live card has its review_schedule row, the card's label
-- comes from its kind, the four ratings of the review screen (Again · Hard · Good · Easy, the
-- mockups desktop-08 / iphone-10), and one call that records a review so that the later of two
-- devices' reviews of a card wins (the iPhone rates offline and sends it later).
--
-- - flashcards.kind: what the card is, for its label: 'term' (a key term, TERM), 'question' (a
--   self-test question, QUESTION), 'card' (any other); null is 'card' (the cards saved before 9.1).
-- - review_schedule.last_grade also takes 'hard'.
-- - A trigger keeps one schedule row per live card: a new card is due at once (its created_at); a
--   card moved to the trash (deleted_at set: Undo after saving, Delete card) loses its row, so it
--   is no longer counted in Review today; taken out of the trash, it gets one again.
-- - Every live card saved before 9.1 gets its row now (due at its created_at).
-- - review_card(...): writes a card's next review only when it is later than the one stored
--   (last_reviewed_at), as the student; Row Level Security limits it to her own cards.
--
-- Row Level Security is unchanged: flashcards' and review_schedule's owner policies
-- (apply_owner_rls) cover the new column, the trigger's writes and the function's update (the
-- function and the trigger run as the student, security invoker).

alter table public.flashcards
  add column kind text
    constraint flashcards_kind check (kind is null or kind in ('term', 'question', 'card'));

comment on column public.flashcards.kind is
  'term: a key term (TERM); question: a self-test question (QUESTION); card or null: any other card (step 9.1).';

alter table public.review_schedule drop constraint review_schedule_last_grade_check;
alter table public.review_schedule
  add constraint review_schedule_last_grade_check check (last_grade in ('again', 'hard', 'good', 'easy'));

create function private.flashcard_schedule() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      insert into public.review_schedule (user_id, flashcard_id, due_at)
      values (new.user_id, new.id, new.created_at)
      on conflict (flashcard_id) do nothing;
    end if;
  elsif new.deleted_at is not null and old.deleted_at is null then
    delete from public.review_schedule where flashcard_id = new.id;
  elsif new.deleted_at is null and old.deleted_at is not null then
    insert into public.review_schedule (user_id, flashcard_id, due_at)
    values (new.user_id, new.id, now())
    on conflict (flashcard_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger flashcard_schedule after insert or update of deleted_at on public.flashcards
  for each row execute function private.flashcard_schedule();

insert into public.review_schedule (user_id, flashcard_id, due_at)
select f.user_id, f.id, f.created_at
from public.flashcards f
where f.deleted_at is null
  and not exists (select 1 from public.review_schedule r where r.flashcard_id = f.id);

create function public.review_card(
  p_flashcard_id uuid,
  p_due_at timestamptz,
  p_interval_days real,
  p_ease real,
  p_reps integer,
  p_grade text,
  p_reviewed_at timestamptz
) returns boolean
  language sql
  security invoker
  set search_path = ''
as $$
  with done as (
    update public.review_schedule
    set due_at = p_due_at,
        interval_days = p_interval_days,
        ease = p_ease,
        reps = p_reps,
        last_grade = p_grade,
        last_reviewed_at = p_reviewed_at
    where flashcard_id = p_flashcard_id
      and (last_reviewed_at is null or last_reviewed_at < p_reviewed_at)
    returning 1
  )
  select exists (select 1 from done);
$$;

comment on function public.review_card(uuid, timestamptz, real, real, integer, text, timestamptz) is
  'Step 9.1: a card''s next review, written only when it is later than the stored one (true: written).';

revoke execute on function public.review_card(uuid, timestamptz, real, real, integer, text, timestamptz) from public, anon;
grant execute on function public.review_card(uuid, timestamptz, real, real, integer, text, timestamptz) to authenticated;
