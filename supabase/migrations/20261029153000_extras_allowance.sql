-- =====================================================================
-- Step 10.2-1b — a fair-use cap on the AI extras (docs/reports/plan-10.2-1b.md; Lea, 12 Nov).
--
-- The study assistant (questions, quick prompts, Clarify, Ask Claude on a selection, flashcards from
-- an answer), quiz grading and reading a past exam's format cost no credits. They share an allowance in
-- dollars over a rolling 30 days, enforced by the Edge Functions (claude-gate) with this function:
--   $0.50 while the account is active (a lecture credit spent in the last 30 days, or an account whose
--   first credit row is younger than 30 days) + $0.30 per lecture credit spent in the last 30 days (not
--   given back), at most $12.
-- Nothing here can be forged by a student: ai_usage is select-only for her (cost_usd >= 0) and the
-- credit ledger is append-only by privilege; the account's age is its first ledger row (the welcome
-- grant), not profiles.created_at, which she may update.
--
-- ai_usage tells quiz writing (paid in credits: `quiz`) from grading (`quiz_grade`) and the past exam's
-- format (`quiz_format`). Rows logged before keep `quiz` (nothing is rewritten): for up to 30 days they
-- count as paid, a small undercount that ends by itself.
-- my_credits() keeps everything it returned and adds `extras: { left, resets_at }` for the app.
-- =====================================================================

alter table public.ai_usage drop constraint ai_usage_operation_check;
alter table public.ai_usage
  add constraint ai_usage_operation_check
    check (operation in ('transcription', 'assistant', 'summary', 'ocr', 'image_analysis', 'quiz', 'quiz_grade', 'quiz_format'));

/**
 * Her extras allowance now (RLS: her own rows): { allowance_usd, used_usd, left (0–1), resets_at (when
 * the oldest counted use leaves the 30 days, or null), lectures (spent in the 30 days), active }.
 */
create function public.extras_allowance() returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  lectures as (
    select count(*)::integer as n
    from public.credit_ledger l, me
    where l.user_id = me.uid and l.kind = 'spend_lecture' and l.created_at > now() - interval '30 days'
      and not exists (select 1 from public.credit_ledger r where r.reverses = l.id)
  ),
  account as (
    select min(l.created_at) as since from public.credit_ledger l, me where l.user_id = me.uid
  ),
  used as (
    select coalesce(sum(u.cost_usd), 0)::numeric as usd, min(u.created_at) as oldest
    from public.ai_usage u, me
    where u.user_id = me.uid and u.operation in ('assistant', 'quiz_grade', 'quiz_format')
      and u.created_at > now() - interval '30 days'
  ),
  allowance as (
    select
      lectures.n,
      (lectures.n > 0 or coalesce(account.since > now() - interval '30 days', false)) as active,
      least(12.00, (case when lectures.n > 0 or coalesce(account.since > now() - interval '30 days', false) then 0.50 else 0 end) + 0.30 * lectures.n)::numeric as usd
    from lectures, account
  )
  select jsonb_build_object(
    'allowance_usd', a.usd,
    'used_usd', used.usd,
    'left', case when a.usd <= 0 then 0 else greatest(0, least(1, round(1 - used.usd / a.usd, 4))) end,
    'resets_at', case when used.oldest is null then null else used.oldest + interval '30 days' end,
    'lectures', a.n,
    'active', a.active
  )
  from allowance a, used;
$$;

revoke execute on function public.extras_allowance() from public, anon;
grant execute on function public.extras_allowance() to authenticated, service_role;

-- my_credits() as in 20261029152900, plus `extras` (what's left of the allowance, never in dollars).
create or replace function public.my_credits() returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'units', (select coalesce(sum(l.units), 0)::integer from public.credit_ledger l where l.user_id = (select auth.uid())),
    'beta', exists (select 1 from public.credit_ledger l where l.user_id = (select auth.uid()) and l.kind = 'grant_beta'),
    'extras', (select jsonb_build_object('left', e -> 'left', 'resets_at', e -> 'resets_at') from (select public.extras_allowance() as e) x),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc, h.id), '[]'::jsonb)
      from (
        select
          l.id, l.units, l.kind, coalesce(l.label, f.title) as label, l.lecture_id, l.ref_id, l.created_at,
          case when split_part(k.key, ':', 1) in ('lecture', 'summary', 'combine', 'quiz') then split_part(k.key, ':', 1) end as what,
          case when split_part(k.key, ':', 1) = 'lecture' and split_part(k.key, ':', 4) ~ '^[0-9]{1,6}$'
               then split_part(k.key, ':', 4)::integer end as block
        from public.credit_ledger l
        left join public.credit_ledger o on o.id = l.reverses
        cross join lateral (select case when l.reverses is not null then o.base_key else l.base_key end as key) k
        left join public.files f on f.id = l.lecture_id
        where l.user_id = (select auth.uid()) and l.units <> 0
        order by l.created_at desc, l.id
        limit 20
      ) h
    )
  );
$$;

revoke execute on function public.my_credits() from public, anon;
grant execute on function public.my_credits() to authenticated;
