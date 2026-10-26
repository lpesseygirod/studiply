-- The repair of "last edited" after the favorites migration (20261026090200).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000007', 'restore@test.dev');

-- A flattened row (updated_at = the migration time, real time in changed_at),
-- a row edited since (equal), and a favorite changed since (changed_at later).
insert into public.courses (id, user_id, name, updated_at, changed_at) values
  ('c7000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000007', 'Flattened', '2026-10-25 16:27:48+00', '2026-04-08 10:00:00+00'),
  ('c7000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000007', 'Edited since', '2026-10-25 18:00:00+00', '2026-10-25 18:00:00+00'),
  ('c7000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000007', 'Starred since', '2026-10-25 16:27:48+00', '2026-10-25 19:00:00+00'),
  ('c7000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000007', 'Control', '2026-10-25 16:27:48+00', '2026-04-08 10:00:00+00');

-- Why the repair switches the trigger off: with it on, the same update is overwritten with now().
update public.courses set updated_at = changed_at where id = 'c7000000-0000-0000-0000-000000000004';
select is((select updated_at from public.courses where id = 'c7000000-0000-0000-0000-000000000004'), now(), 'control: with the trigger on, a plain restore UPDATE is overwritten');

select is(private.restore_updated_at('courses') >= 1, true, 'the repair reports what it fixed');
select is((select updated_at from public.courses where id = 'c7000000-0000-0000-0000-000000000001'), '2026-04-08 10:00:00+00'::timestamptz, 'a flattened row gets its real last-edited time back');
select is((select updated_at from public.courses where id = 'c7000000-0000-0000-0000-000000000002'), '2026-10-25 18:00:00+00'::timestamptz, 'a row edited since keeps its time');
select is((select changed_at from public.courses where id = 'c7000000-0000-0000-0000-000000000001'), now(), 'the repaired row is marked changed, so the iPhone downloads it');
select is((select changed_at > '2026-10-25 16:27:48+00' from public.courses where id = 'c7000000-0000-0000-0000-000000000001'), true, 'changed_at moves past every older row, so an iPhone cursor from before the repair picks it up');
select is((select updated_at from public.courses where id = 'c7000000-0000-0000-0000-000000000003'), '2026-10-25 16:27:48+00'::timestamptz, 'a row starred since (not recoverable) is left alone');
select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'set_updated_at' and t.tgenabled = 'O'
      and c.relname in ('courses', 'folders', 'files', 'media') and c.relnamespace = 'public'::regnamespace),
  4, 'the trigger is switched on again on all four tables');
update public.courses set name = 'Flattened, renamed' where id = 'c7000000-0000-0000-0000-000000000001';
select is((select updated_at from public.courses where id = 'c7000000-0000-0000-0000-000000000001'), now(), 'after the repair an edit stamps "last edited" again');

select * from finish();
rollback;
