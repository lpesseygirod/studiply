-- =====================================================================
-- Step 10.1b-2 — Accepting the Terms and the Privacy Policy, and the minimum age (16).
--
-- terms_acceptances: one row each time a student accepts the legal texts: which version (the app's
-- LEGAL_VERSION, src/legal/texts.generated.ts), that she confirmed she is 16 or older, how (at
-- sign-up, or at the one-time gate after sign-in), and when: always the server's time.
--
-- Who can write it:
--   - the new-user trigger (sign-up with email: the app sends terms_version and age_16 in the
--     sign-up metadata after both boxes were ticked);
--   - the student herself (the gate, and Sign in with Apple when the boxes were ticked before):
--     insert only, her own row, only terms_version, age_confirmed and source. accepted_at and
--     user_id take their defaults (now(), auth.uid()) and can't be given.
-- Nobody can change or delete a row (no grant), so an acceptance can't be rewritten or moved to
-- another version; a version is accepted once (unique). Deleting the account deletes them
-- (on delete cascade, by the table's owner: no trigger here).
-- =====================================================================

create table public.terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  age_confirmed boolean not null check (age_confirmed),
  source        text not null check (source in ('sign_up', 'gate')),
  accepted_at   timestamptz not null default now(),
  unique (user_id, terms_version)
);

create index terms_acceptances_user_idx on public.terms_acceptances (user_id, accepted_at desc);

select private.apply_owner_rls('terms_acceptances', array['select']);

grant insert (terms_version, age_confirmed, source) on table public.terms_acceptances to authenticated;
create policy "Owner can accept" on public.terms_acceptances
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- The sign-up form's acceptance, from the metadata the app sends (auth.service signUp). Only a
-- well-formed version with age_16 = true is kept; anything else creates no row, and the gate asks
-- after sign-in (a malformed value must never stop the account from being created).
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
  return new;
end;
$$;
