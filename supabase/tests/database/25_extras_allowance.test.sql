-- Step 10.2-1b (20261029153000_extras_allowance): the AI extras' allowance over 30 days.
--   ai_usage takes quiz_grade and quiz_format (and nothing unknown). extras_allowance(): $0.50 while
--   active (a lecture spent in 30 days, or a first ledger row younger than 30 days), + $0.30 per lecture
--   spent in 30 days (not given back; carry-over and older spends don't count), at most $12; used = the
--   assistant, quiz_grade and quiz_format costs of the last 30 days (not summaries or quiz writing);
--   left clamped to 0–1; resets_at when the oldest counted use leaves the 30 days. Her own rows only;
--   anon can't call it. my_credits() keeps its keys and gains extras.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000251', 'extras-a@test.dev'),
  ('dddddddd-0000-0000-0000-000000000252', 'extras-b@test.dev'),
  ('dddddddd-0000-0000-0000-000000000253', 'extras-c@test.dev');

-- B's account is old: its first ledger row (the welcome grant) 40 days ago.
update public.credit_ledger set created_at = now() - interval '40 days' where user_id = 'dddddddd-0000-0000-0000-000000000252';

-- ---------------------------------------------------------------------
-- ai_usage's operations
-- ---------------------------------------------------------------------
select lives_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model, cost_usd) values ('dddddddd-0000-0000-0000-000000000253', 'quiz_grade', 'anthropic', 'claude-sonnet-5-5', 0) $$,
  'quiz_grade is an operation');
select lives_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model, cost_usd) values ('dddddddd-0000-0000-0000-000000000253', 'quiz_format', 'anthropic', 'claude-sonnet-5-5', 0) $$,
  'quiz_format is an operation');
select throws_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model) values ('dddddddd-0000-0000-0000-000000000253', 'chat', 'anthropic', 'x') $$,
  '23514', null, 'an unknown operation is refused');

-- ---------------------------------------------------------------------
-- The allowance
-- ---------------------------------------------------------------------
create function pg_temp.allowance_of(uid uuid) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  result := public.extras_allowance();
  reset role;
  return result;
end;
$$;

select is(pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000251') - 'resets_at',
  '{"allowance_usd": 0.50, "used_usd": 0, "left": 1, "lectures": 0, "active": true}'::jsonb,
  'a new account: $0.50, all left');
select is(pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') -> 'allowance_usd', '0'::jsonb,
  'an old account with no lecture in 30 days: nothing (an idle account costs nothing)');
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') ->> 'left')::numeric, 0::numeric, '…so none left');

do $$ begin perform public.spend_credits('dddddddd-0000-0000-0000-000000000252', 'lecture:a2500000-0000-0000-0000-000000000001:block:0', 4, 'spend_lecture', 'a2500000-0000-0000-0000-000000000001'); end $$;
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') ->> 'allowance_usd')::numeric, 0.80, 'a lecture recorded: active again, $0.50 + $0.30');

-- A spend given back, a carry-over and a spend older than 30 days add nothing.
do $$
begin
  perform public.spend_credits('dddddddd-0000-0000-0000-000000000252', 'lecture:a2500000-0000-0000-0000-000000000001:block:1', 4, 'spend_lecture', 'a2500000-0000-0000-0000-000000000001');
  perform public.reverse_spend('dddddddd-0000-0000-0000-000000000252', 'lecture:a2500000-0000-0000-0000-000000000001:block:1');
  perform public.spend_credits('dddddddd-0000-0000-0000-000000000252', 'lecture:a2500000-0000-0000-0000-000000000003:block:0', 4, 'spend_lecture', 'a2500000-0000-0000-0000-000000000003');
end $$;
insert into public.credit_ledger (user_id, units, kind, base_key, lecture_id) values
  ('dddddddd-0000-0000-0000-000000000252', 0, 'carry_over', 'lecture:a2500000-0000-0000-0000-000000000002:block:0', 'a2500000-0000-0000-0000-000000000002');
update public.credit_ledger set created_at = now() - interval '31 days' where base_key = 'lecture:a2500000-0000-0000-0000-000000000003:block:0';
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') ->> 'lectures')::int, 1, 'a reversed spend, a carry-over and an older spend don''t count');
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') ->> 'allowance_usd')::numeric, 0.80, '…the allowance stays $0.80');

-- At most $12: C records 45 lectures in 30 days.
do $$
begin
  perform public.grant_credits('dddddddd-0000-0000-0000-000000000253', 'grant_admin', 'test', 400, 'test');
  perform public.spend_credits('dddddddd-0000-0000-0000-000000000253', 'lecture:' || gen_random_uuid() || ':block:0', 4, 'spend_lecture') from generate_series(1, 45);
end $$;
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000253') ->> 'allowance_usd')::numeric, 12.00, 'at most $12 every 30 days');

-- ---------------------------------------------------------------------
-- What counts as used
-- ---------------------------------------------------------------------
insert into public.ai_usage (user_id, operation, provider, model, cost_usd, created_at) values
  ('dddddddd-0000-0000-0000-000000000251', 'assistant', 'anthropic', 'claude-sonnet-5-5', 0.10, now() - interval '2 days'),
  ('dddddddd-0000-0000-0000-000000000251', 'quiz_grade', 'anthropic', 'claude-sonnet-5-5', 0.05, now() - interval '1 day'),
  ('dddddddd-0000-0000-0000-000000000251', 'quiz_format', 'anthropic', 'claude-sonnet-5-5', 0.05, now()),
  ('dddddddd-0000-0000-0000-000000000251', 'summary', 'anthropic', 'claude-sonnet-5-5', 1.00, now()),
  ('dddddddd-0000-0000-0000-000000000251', 'quiz', 'anthropic', 'claude-opus-5-5', 1.00, now()),
  ('dddddddd-0000-0000-0000-000000000251', 'assistant', 'anthropic', 'claude-sonnet-5-5', 0.30, now() - interval '31 days');
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000251') ->> 'used_usd')::numeric, 0.20,
  'used: the assistant, grading and format of the last 30 days (not summaries, quiz writing, or older use)');
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000251') ->> 'left')::numeric, 0.6, 'left: 1 − 0.20 / 0.50');
select ok(
  abs(extract(epoch from ((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000251') ->> 'resets_at')::timestamptz - (now() + interval '28 days')))) < 5,
  'resets_at: when the oldest counted use (2 days ago) leaves the 30 days');
insert into public.ai_usage (user_id, operation, provider, model, cost_usd) values ('dddddddd-0000-0000-0000-000000000251', 'assistant', 'anthropic', 'claude-sonnet-5-5', 1.00);
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000251') ->> 'left')::numeric, 0::numeric, 'left never goes below 0');

-- ---------------------------------------------------------------------
-- Her own rows; who may call it; my_credits()
-- ---------------------------------------------------------------------
select is((pg_temp.allowance_of('dddddddd-0000-0000-0000-000000000252') ->> 'used_usd')::numeric, 0::numeric, 'another student''s use never counts for her');
select ok(not has_function_privilege('anon', 'public.extras_allowance()', 'execute'), 'anon can''t call it');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000251", "role": "authenticated"}';
select ok(
  public.my_credits() ?& array['units', 'beta', 'history', 'extras'] and (public.my_credits() -> 'extras') ?& array['left', 'resets_at'],
  'my_credits keeps its keys and gains extras { left, resets_at }');
reset role;

select * from finish();
rollback;
