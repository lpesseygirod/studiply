-- Step 4.5 (20261026090900): a profile's preferences are an object its owner
-- can change; nobody else can.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-00000000000e', 'prefs@test.dev'),
  ('dddddddd-0000-0000-0000-00000000000f', 'other-prefs@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-00000000000e", "role": "authenticated"}';

select is((select preferences from public.profiles where id = 'dddddddd-0000-0000-0000-00000000000e'), '{}'::jsonb, 'new profiles start with no preferences');

update public.profiles set preferences = '{"recentColours": [{"colour": "#DC2626", "at": 1}]}' where id = 'dddddddd-0000-0000-0000-00000000000e';
select is((select preferences->'recentColours'->0->>'colour' from public.profiles where id = 'dddddddd-0000-0000-0000-00000000000e'), '#DC2626', 'the owner saves them');

select throws_ok(
  $$ update public.profiles set preferences = '[1, 2]' where id = 'dddddddd-0000-0000-0000-00000000000e' $$,
  '23514', null, 'preferences are an object');

set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-00000000000f", "role": "authenticated"}';
update public.profiles set preferences = '{"x": 1}' where id = 'dddddddd-0000-0000-0000-00000000000e';
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-00000000000e", "role": "authenticated"}';
select ok((select preferences ? 'recentColours' from public.profiles where id = 'dddddddd-0000-0000-0000-00000000000e'), 'another user can''t change them');

select * from finish();
rollback;
