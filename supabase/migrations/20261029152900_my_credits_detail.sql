-- =====================================================================
-- Step 10.2-2 — my_credits() says what each row was for (docs/reports/plan-10.2-2.md).
--
-- Read-only, security invoker (RLS: her own rows), no table. Everything it returned before is kept
-- ({ units, history: [{ id, units, kind, label, lecture_id, ref_id, created_at }] }); added:
-- - per history row `what`: lecture | summary | combine | quiz (from its base_key; for a reverse or a
--   refund, from the row it undoes), else null (grants and purchases are told by `kind`);
-- - per history row `block`: the 2-hour block of a lecture's spend (0 = the first);
-- - `beta`: whether she has the beta grant (it may be older than the last 20 rows).
-- =====================================================================

create or replace function public.my_credits() returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select jsonb_build_object(
    'units', (select coalesce(sum(l.units), 0)::integer from public.credit_ledger l where l.user_id = (select auth.uid())),
    'beta', exists (select 1 from public.credit_ledger l where l.user_id = (select auth.uid()) and l.kind = 'grant_beta'),
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
