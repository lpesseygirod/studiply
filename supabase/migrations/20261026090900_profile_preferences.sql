-- Step 4.5 (Lea): things that follow the student across devices, starting
-- with the colour picker's Recent colours. A JSON object owned by the
-- profile (its owner can already read and update it; profiles RLS).

alter table public.profiles
  add column preferences jsonb not null default '{}'::jsonb
    constraint profiles_preferences_object check (jsonb_typeof(preferences) = 'object');

comment on column public.profiles.preferences is
  'Per-account preferences synced across devices (recentColours: [{colour, at}], newest first).';
