-- =====================================================================
-- Step 10.2-1 — credits: the ledger and spending on the server (docs/reports/plan-10.2-1.md).
--
-- Students pay in advance with credits (Lea, 12 Nov): 1 credit = 1 lecture (its transcription, its
-- first summary, the study assistant on it), counted here in quarter credits ("units": 1 lecture =
-- 4). The server is the only judge: the Edge Functions spend through the functions below (service
-- role only); the app reads its balance and history with my_credits().
--
-- - credit_ledger is append-only: no role may update or delete a row (the service role included);
--   only the service role inserts. No trigger on it, so the account-deletion cascade (deleting the
--   auth user deletes the rows as the table's owner, 20261029152400) runs into nothing.
-- - lecture_id and ref_id have no foreign key: purging a lecture from the trash never changes a
--   student's credits.
-- - base_key says what was paid for (lecture:<id>:block:<n>, summary:<id>, combine:<id>, quiz:<id>,
--   welcome, beta-2026-11, purchase:<txn>). A spend is "already" when a not-reversed spend row with
--   that key exists; a reversed one pays again as the next attempt. A reverse (or, in 10.2-3, a
--   refund) has a key of its own (reverse:<row id>, refund:<txn>) and points at the row it undoes
--   (reverses, unique): exactly once.
-- - Every spend takes a lock per student, so two devices (or two functions) can't spend at once.
-- - One-off (credits_backfill, with fixed keys, safe to run again): every existing account +2 free
--   lectures and +10 beta (Lea, 12 Nov); lectures already transcribed and summaries already written
--   recorded at 0 units ("carry over"), so they are never charged.
-- =====================================================================

create table public.credit_ledger (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  units                integer not null,
  kind                 text not null check (kind in (
                         'grant_free', 'grant_beta', 'grant_admin', 'purchase', 'refund',
                         'spend_lecture', 'spend_summary', 'spend_extra', 'reverse', 'carry_over')),
  base_key             text not null check (char_length(base_key) between 1 and 200),
  attempt              integer not null default 1 check (attempt > 0),
  reverses             uuid unique references public.credit_ledger (id) on delete cascade,
  lecture_id           uuid,
  ref_id               uuid,
  label                text check (label is null or char_length(label) <= 200),
  store_transaction_id text unique,
  product_id           text,
  created_at           timestamptz not null default now(),
  constraint credit_ledger_key unique (user_id, base_key, attempt),
  -- Grants and reverses add, spends and refunds take; a first summary and a carry-over are 0.
  constraint credit_ledger_sign check (
    (kind in ('grant_free', 'grant_beta', 'grant_admin', 'purchase') and units > 0)
    or (kind = 'reverse' and units >= 0)
    or (kind in ('refund', 'spend_lecture', 'spend_extra') and units < 0)
    or (kind = 'spend_summary' and units <= 0)
    or (kind = 'carry_over' and units = 0)
  ),
  -- A reverse or a refund always says what it undoes; nothing else does.
  constraint credit_ledger_reverses check ((kind in ('reverse', 'refund')) = (reverses is not null))
);

comment on table public.credit_ledger is
  'Step 10.2-1: credits in quarter units (1 lecture = 4), append-only; written only by the Edge Functions (service role).';

create index credit_ledger_user_created on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_user_lecture on public.credit_ledger (user_id, lecture_id) where lecture_id is not null;

-- Students read their own rows; nobody updates or deletes; only the service role inserts.
select private.apply_owner_rls('credit_ledger', array['select']);
revoke all on table public.credit_ledger from service_role;
grant select, insert on table public.credit_ledger to service_role;

-- ---------------------------------------------------------------------
-- Spending (service role only; security invoker: the service role writes as itself)
-- ---------------------------------------------------------------------

/**
 * A spend for p_base_key: "already" (a not-reversed spend with that key: nothing charged),
 * "insufficient" (balance below p_units: nothing written), or "spent" (−p_units as the next attempt).
 */
create function public.spend_credits(
  p_user uuid,
  p_base_key text,
  p_units integer,
  p_kind text,
  p_lecture uuid default null,
  p_ref uuid default null,
  p_label text default null
) returns table (outcome text, charged integer, balance_after integer)
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  live_units integer;
  has_live boolean;
  bal integer;
  next_attempt integer;
begin
  if p_units is null or p_units <= 0 or p_kind not in ('spend_lecture', 'spend_extra') then
    raise exception 'spend_credits: a spend takes units > 0 and kind spend_lecture or spend_extra';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || p_user::text, 0));

  select l.units into live_units
  from public.credit_ledger l
  where l.user_id = p_user and l.base_key = p_base_key
    and l.kind in ('spend_lecture', 'spend_summary', 'spend_extra', 'carry_over')
    and not exists (select 1 from public.credit_ledger r where r.reverses = l.id)
  order by l.attempt desc
  limit 1;
  has_live := found;
  select coalesce(sum(l.units), 0)::integer into bal from public.credit_ledger l where l.user_id = p_user;
  if has_live then
    return query select 'already'::text, -live_units, bal;
    return;
  end if;
  if bal < p_units then
    return query select 'insufficient'::text, 0, bal;
    return;
  end if;
  select coalesce(max(l.attempt), 0) + 1 into next_attempt from public.credit_ledger l where l.user_id = p_user and l.base_key = p_base_key;
  insert into public.credit_ledger (user_id, units, kind, base_key, attempt, lecture_id, ref_id, label)
  values (p_user, -p_units, p_kind, p_base_key, next_attempt, p_lecture, p_ref, left(p_label, 200));
  return query select 'spent'::text, p_units, bal - p_units;
end;
$$;

/**
 * A summary of a lecture (mode new), decided here, never by the request: the lecture's first
 * summary is included (0 units) when the lecture is paid; writing it again costs 2. A lecture that
 * isn't paid (a transcript that didn't come from transcribe-chunk) first pays its credit (4 units,
 * lecture:<id>:block:0). "First": no not-reversed summary spend for that lecture.
 */
create function public.spend_summary(
  p_user uuid,
  p_lecture uuid,
  p_summary uuid,
  p_label text default null
) returns table (outcome text, charged integer, balance_after integer)
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  summary_key text := 'summary:' || p_summary::text;
  lecture_key text := 'lecture:' || p_lecture::text || ':block:0';
  live_units integer;
  has_live boolean;
  bal integer;
  is_paid boolean;
  is_first boolean;
  lecture_units integer;
  summary_units integer;
  next_attempt integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || p_user::text, 0));
  select l.units into live_units
  from public.credit_ledger l
  where l.user_id = p_user and l.base_key = summary_key and l.kind = 'spend_summary'
    and not exists (select 1 from public.credit_ledger r where r.reverses = l.id)
  order by l.attempt desc
  limit 1;
  has_live := found;
  select coalesce(sum(l.units), 0)::integer into bal from public.credit_ledger l where l.user_id = p_user;
  if has_live then
    return query select 'already'::text, -live_units, bal;
    return;
  end if;

  is_paid := exists (
    select 1 from public.credit_ledger l
    where l.user_id = p_user and l.lecture_id = p_lecture and l.kind in ('spend_lecture', 'carry_over')
      and not exists (select 1 from public.credit_ledger r where r.reverses = l.id));
  is_first := not exists (
    select 1 from public.credit_ledger l
    where l.user_id = p_user and l.lecture_id = p_lecture and l.kind = 'spend_summary'
      and not exists (select 1 from public.credit_ledger r where r.reverses = l.id));
  lecture_units := case when is_paid then 0 else 4 end;
  summary_units := case when is_first then 0 else 2 end;
  if bal < lecture_units + summary_units then
    return query select 'insufficient'::text, 0, bal;
    return;
  end if;

  if not is_paid then
    select coalesce(max(l.attempt), 0) + 1 into next_attempt from public.credit_ledger l
    where l.user_id = p_user and l.base_key = lecture_key;
    insert into public.credit_ledger (user_id, units, kind, base_key, attempt, lecture_id, label)
    values (p_user, -4, 'spend_lecture', lecture_key, next_attempt, p_lecture, left(p_label, 200));
  end if;
  select coalesce(max(l.attempt), 0) + 1 into next_attempt from public.credit_ledger l where l.user_id = p_user and l.base_key = summary_key;
  insert into public.credit_ledger (user_id, units, kind, base_key, attempt, lecture_id, ref_id, label)
  values (p_user, -summary_units, 'spend_summary', summary_key, next_attempt, p_lecture, p_summary, left(p_label, 200));
  return query select 'spent'::text, lecture_units + summary_units, bal - lecture_units - summary_units;
end;
$$;

/**
 * Gives back the latest not-reversed spend of p_base_key, once ("reversed"); "none" when there is
 * nothing to give back (never spent, or given back already). Its row has its own key.
 */
create function public.reverse_spend(p_user uuid, p_base_key text)
  returns table (outcome text, charged integer, balance_after integer)
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  spend public.credit_ledger;
  bal integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || p_user::text, 0));
  select l.* into spend
  from public.credit_ledger l
  where l.user_id = p_user and l.base_key = p_base_key
    and l.kind in ('spend_lecture', 'spend_summary', 'spend_extra')
    and not exists (select 1 from public.credit_ledger r where r.reverses = l.id)
  order by l.attempt desc
  limit 1;
  select coalesce(sum(l.units), 0)::integer into bal from public.credit_ledger l where l.user_id = p_user;
  if spend.id is null then
    return query select 'none'::text, 0, bal;
    return;
  end if;
  insert into public.credit_ledger (user_id, units, kind, base_key, reverses, lecture_id, ref_id, label)
  values (p_user, -spend.units, 'reverse', 'reverse:' || spend.id::text, spend.id, spend.lecture_id, spend.ref_id, spend.label);
  return query select 'reversed'::text, -spend.units, bal - spend.units;
end;
$$;

/** A grant or a purchase, once per key (and per store transaction): "granted" or "already". */
create function public.grant_credits(
  p_user uuid,
  p_kind text,
  p_base_key text,
  p_units integer,
  p_label text default null,
  p_txn text default null,
  p_product text default null
) returns table (outcome text, charged integer, balance_after integer)
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  added integer;
  bal integer;
begin
  if p_kind not in ('grant_free', 'grant_beta', 'grant_admin', 'purchase') or p_units is null or p_units <= 0 then
    raise exception 'grant_credits: a grant takes units > 0 and a grant or purchase kind';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || p_user::text, 0));
  insert into public.credit_ledger (user_id, units, kind, base_key, label, store_transaction_id, product_id)
  values (p_user, p_units, p_kind, p_base_key, left(p_label, 200), p_txn, p_product)
  on conflict do nothing;
  get diagnostics added = row_count;
  select coalesce(sum(l.units), 0)::integer into bal from public.credit_ledger l where l.user_id = p_user;
  return query select case when added > 0 then 'granted' else 'already' end::text, case when added > 0 then p_units else 0 end, bal;
end;
$$;

revoke execute on function public.spend_credits(uuid, text, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.spend_summary(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.reverse_spend(uuid, text) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, text, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, text, integer, text, uuid, uuid, text) to service_role;
grant execute on function public.spend_summary(uuid, uuid, uuid, text) to service_role;
grant execute on function public.reverse_spend(uuid, text) to service_role;
grant execute on function public.grant_credits(uuid, text, text, integer, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- The app's view: her balance and her last 20 rows (RLS: her own)
-- ---------------------------------------------------------------------

/** { units, history: [{ id, units, kind, label, lecture_id, ref_id, created_at }] }, the 0-unit rows left out of the history. */
create function public.my_credits() returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'units', (select coalesce(sum(l.units), 0)::integer from public.credit_ledger l where l.user_id = (select auth.uid())),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb)
      from (
        select l.id, l.units, l.kind, coalesce(l.label, f.title) as label, l.lecture_id, l.ref_id, l.created_at
        from public.credit_ledger l
        left join public.files f on f.id = l.lecture_id
        where l.user_id = (select auth.uid()) and l.units <> 0
        order by l.created_at desc
        limit 20
      ) h
    )
  );
$$;

revoke execute on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;

-- ---------------------------------------------------------------------
-- New accounts: 2 lectures to start (everything handle_new_user did is kept)
-- ---------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version text := new.raw_user_meta_data ->> 'terms_version';
begin
  insert into public.profiles (id, display_name, initials)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    upper(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.email, ''), 1))
  );

  if version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     and (new.raw_user_meta_data ->> 'age_16') = 'true' then
    insert into public.terms_acceptances (user_id, terms_version, age_confirmed, source)
    values (new.id, version, true, 'sign_up');
  end if;

  -- Step 10.2-1: 2 lectures to start (8 units), once.
  insert into public.credit_ledger (user_id, units, kind, base_key, label)
  values (new.id, 8, 'grant_free', 'welcome', 'Welcome credits')
  on conflict do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- One-off: existing accounts, lectures and summaries (fixed keys: safe to run again)
-- ---------------------------------------------------------------------

create function private.credits_backfill() returns void
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  -- Every account: 2 free lectures, and 10 for the beta friends (Lea, 12 Nov).
  insert into public.credit_ledger (user_id, units, kind, base_key, label)
  select u.id, 8, 'grant_free', 'welcome', 'Welcome credits' from auth.users u
  on conflict do nothing;
  insert into public.credit_ledger (user_id, units, kind, base_key, label)
  select u.id, 40, 'grant_beta', 'beta-2026-11', 'Thanks for testing Studiply' from auth.users u
  on conflict do nothing;

  -- Lectures already transcribed: each 2-hour block their audio covers, at 0 units, so a retry of any
  -- chunk in it is never charged (the chunks transcribed, and the segments of lectures without chunks).
  insert into public.credit_ledger (user_id, units, kind, base_key, lecture_id)
  select distinct c.user_id, 0, 'carry_over', 'lecture:' || c.lecture_id::text || ':block:' || (c.start_ms / 7200000)::text, c.lecture_id
  from public.audio_chunks c
  where c.status = 'transcribed'
  on conflict do nothing;
  insert into public.credit_ledger (user_id, units, kind, base_key, lecture_id)
  select distinct s.user_id, 0, 'carry_over', 'lecture:' || s.lecture_id::text || ':block:' || (s.start_ms / 7200000)::text, s.lecture_id
  from public.transcript_segments s
  on conflict do nothing;

  -- Summaries already written count as each lecture's first: the next one is "again".
  insert into public.credit_ledger (user_id, units, kind, base_key, lecture_id, ref_id)
  select s.user_id, 0, 'spend_summary', 'summary:' || s.id::text, s.file_id, s.id
  from public.summaries s
  where s.status = 'done' and s.mode = 'new' and s.result is not null
  on conflict do nothing;
end;
$$;

revoke execute on function private.credits_backfill() from public;

select private.credits_backfill();
