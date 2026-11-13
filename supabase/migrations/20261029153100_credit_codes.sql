-- =====================================================================
-- Step 10.2 codes (A) — free-credit codes and the admins (docs/reports/plan-10.2-codes-admin.md;
-- Lea, 12 Nov).
--
-- Lea makes codes (STUDY10) in her dashboard; a student who types one on the web gets its credits,
-- once per account, until the code's total uses run out. The iPhone app never offers codes (App Store
-- rule 3.1.1); that is the app's part, the server takes a code from any signed-in student.
--
-- - The tables are in the `private` schema: the API doesn't expose it, so no student can list codes,
--   read the tries or see who is an admin. Only the functions below reach them.
-- - private.admins: who may use the dashboard. Nobody's address is here: Lea adds her own account in
--   the SQL editor (insert into private.admins (user_id) select id from auth.users where email = …).
--   public.service_set_admin() (service role only) is for the local checks' throwaway admins.
-- - redeem_code(): security definer, the student's own credits lock and a lock per code; 10 wrong tries
--   an hour per account, then too_many; an unknown, switched-off or expired code all answer `invalid`
--   (nothing tells a guesser a code exists). Uses are counted from the ledger itself.
-- - The ledger gains the kind grant_code (a grant: units > 0), key code:<code id> (once per account),
--   ref_id the code, label the code. Still append-only, still no trigger.
-- - admin_codes(), admin_create_code(), admin_set_code_active(): refused (42501) unless an admin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------
create table private.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
revoke all on table private.admins from public, anon, authenticated;

create function private.is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function private.is_admin() from public, anon, authenticated;

/** Whether the signed-in student is an admin (the app shows the Admin entry); says nothing of anyone else. */
create function public.am_i_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select private.is_admin();
$$;
revoke execute on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

/** Local checks only: make or unmake a throwaway admin (service role; Lea uses the SQL editor). */
create function public.service_set_admin(p_user uuid, p_admin boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if p_admin then
    insert into private.admins (user_id, note) values (p_user, 'check') on conflict (user_id) do nothing;
  else
    delete from private.admins where user_id = p_user;
  end if;
end;
$$;
revoke execute on function public.service_set_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.service_set_admin(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Codes and tries
-- ---------------------------------------------------------------------
create table private.credit_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  units           integer not null check (units between 1 and 100),
  max_redemptions integer not null check (max_redemptions between 1 and 100000),
  expires_at      timestamptz,
  active          boolean not null default true,
  note            text check (note is null or char_length(note) <= 200),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
revoke all on table private.credit_codes from public, anon, authenticated;

create table private.code_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index code_attempts_user_at on private.code_attempts (user_id, at desc);
revoke all on table private.code_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The ledger: grant_code
-- ---------------------------------------------------------------------
alter table public.credit_ledger drop constraint credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in (
  'grant_free', 'grant_beta', 'grant_admin', 'grant_code', 'purchase', 'refund',
  'spend_lecture', 'spend_summary', 'spend_extra', 'reverse', 'carry_over'));
alter table public.credit_ledger drop constraint credit_ledger_sign;
alter table public.credit_ledger add constraint credit_ledger_sign check (
  (kind in ('grant_free', 'grant_beta', 'grant_admin', 'grant_code', 'purchase') and units > 0)
  or (kind = 'reverse' and units >= 0)
  or (kind in ('refund', 'spend_lecture', 'spend_extra') and units < 0)
  or (kind = 'spend_summary' and units <= 0)
  or (kind = 'carry_over' and units = 0)
);
-- A code's uses, counted from the ledger.
create index credit_ledger_code_uses on public.credit_ledger (ref_id) where kind = 'grant_code';

-- ---------------------------------------------------------------------
-- Redeeming (any signed-in student; the app offers it on the web only)
-- ---------------------------------------------------------------------
/**
 * redeemed (units added, the new balance) · invalid (unknown, switched off or expired: one wrong try) ·
 * already (on this account) · full (its total uses reached) · too_many (10 wrong tries in the last hour).
 */
create function public.redeem_code(p_code text)
  returns table (outcome text, units integer, balance_after integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wanted text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  c private.credit_codes;
  fails integer;
  bal integer;
begin
  if uid is null then
    raise exception 'redeem_code: not signed in' using errcode = '42501';
  end if;
  -- Her credits lock (spend_credits takes the same), then the code's: its total is never exceeded.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || uid::text, 0));
  select coalesce(sum(l.units), 0)::integer into bal from public.credit_ledger l where l.user_id = uid;

  select count(*)::integer into fails from private.code_attempts a
  where a.user_id = uid and not a.ok and a.at > now() - interval '1 hour';
  if fails >= 10 then
    return query select 'too_many'::text, 0, bal;
    return;
  end if;

  select k.* into c from private.credit_codes k where k.code = wanted;
  if c.id is null or not c.active or (c.expires_at is not null and c.expires_at <= now()) then
    insert into private.code_attempts (user_id, ok) values (uid, false);
    return query select 'invalid'::text, 0, bal;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code:' || c.id::text, 0));

  if exists (select 1 from public.credit_ledger l where l.user_id = uid and l.kind = 'grant_code' and l.ref_id = c.id) then
    return query select 'already'::text, 0, bal;
    return;
  end if;
  if (select count(*) from public.credit_ledger l where l.kind = 'grant_code' and l.ref_id = c.id) >= c.max_redemptions then
    return query select 'full'::text, 0, bal;
    return;
  end if;

  insert into public.credit_ledger (user_id, units, kind, base_key, ref_id, label)
  values (uid, c.units, 'grant_code', 'code:' || c.id::text, c.id, c.code);
  insert into private.code_attempts (user_id, ok) values (uid, true);
  return query select 'redeemed'::text, c.units, bal + c.units;
end;
$$;
revoke execute on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- The dashboard's Codes section (admins only)
-- ---------------------------------------------------------------------
create function public.admin_codes()
  returns table (id uuid, code text, units integer, max_redemptions integer, used integer, expires_at timestamptz, active boolean, note text, created_at timestamptz)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select k.id, k.code, k.units, k.max_redemptions,
           (select count(*)::integer from public.credit_ledger l where l.kind = 'grant_code' and l.ref_id = k.id),
           k.expires_at, k.active, k.note, k.created_at
    from private.credit_codes k
    order by k.created_at desc;
end;
$$;

/** A new code: its words upper-cased and checked; one of a kind (code_taken when it exists). */
create function public.admin_create_code(p_code text, p_units integer, p_max integer, p_expires timestamptz default null, p_note text default null)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  wanted text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  new_id uuid;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if exists (select 1 from private.credit_codes k where k.code = wanted) then
    raise exception 'code_taken' using errcode = '23505';
  end if;
  insert into private.credit_codes (code, units, max_redemptions, expires_at, note, created_by)
  values (wanted, p_units, p_max, p_expires, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()))
  returning credit_codes.id into new_id;
  return new_id;
end;
$$;

create function public.admin_set_code_active(p_id uuid, p_active boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update private.credit_codes set active = p_active where id = p_id;
end;
$$;

revoke execute on function public.admin_codes() from public, anon;
revoke execute on function public.admin_create_code(text, integer, integer, timestamptz, text) from public, anon;
revoke execute on function public.admin_set_code_active(uuid, boolean) from public, anon;
grant execute on function public.admin_codes() to authenticated;
grant execute on function public.admin_create_code(text, integer, integer, timestamptz, text) to authenticated;
grant execute on function public.admin_set_code_active(uuid, boolean) to authenticated;
