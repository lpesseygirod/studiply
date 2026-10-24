# Studiply — Progress

Tracks every step in `docs/BUILD-PLAN.md` (0.1 → 10.6). Tick a step only when its **Check** passes. Keep the three sections at the bottom up to date as you go.

## Phase 0 — Set up and safety net
- [x] 0.1 — Manual setup (rename folder, add design docs, repo privacy, install Docker/Supabase/EAS CLIs, create accounts)
- [x] 0.2 — Audit (`docs/AUDIT.md`, `docs/PROGRESS.md`)
- [x] 0.3 — Safety net (npm check scripts, first unit tests, pre-commit hook)

## Phase 1 — Backend and safe API keys (`phase-1-backend`)
- [x] 1.1 — Connect Supabase (CLI, local dev, .env public URL + anon key)
- [x] 1.2 — Database schema (SQL migrations + RLS + RLS tests)
- [x] 1.3 — Login (email, Supabase Auth)
- [x] 1.4 — File storage (private buckets + policies + helper)
- [x] 1.5 — Transcription on the server (`transcribe-chunk` Edge Function)
- [x] 1.6 — Claude on the server (`assistant-chat` + `summarize` skeletons)
- [ ] 1.7 — The app uses the backend (switch services, remove EXPO_PUBLIC keys, prove bundle clean)
- [ ] 1.8 — Offline cache and sync (SQLite cache + conflict rule)
- [ ] 1.9 — Move existing data (one-time idempotent migration)

## Phase 2 — App shell (`phase-2-shell`)
- [ ] 2.1 — Navigation and layout (iPhone tabs + web 3-column, responsive)
- [ ] 2.2 — Real data in the shell (top bar, sidebar sections, Record button)
- [ ] 2.3 — Look and feel (colors/typography, dark mode, Dynamic Type, touch targets, VoiceOver, web shortcuts)

## Phase 3 — Library like Finder (`phase-3-library`)
- [ ] 3.1 — Spike: drag and drop (web + iPhone)
- [ ] 3.2 — Library grid (tiles, sort, breadcrumb, inline rename)
- [ ] 3.3 — Moving files (drop targets, cycle protection, undo, tests)
- [ ] 3.4 — Menus (empty-space + item context menus)
- [ ] 3.5 — Trash, stars, recent, search

## Phase 4 — Editor like Google Docs (`phase-4-editor`)
- [ ] 4.1 — Development build on iPhone (EAS profiles, device registration)
- [ ] 4.2 — Spike: one editor, two platforms (TenTap + Tiptap, shared schema, timestamp chip)
- [ ] 4.3 — Documents that save themselves (3 tabs, ProseMirror JSON, autosave, versions, block origin)
- [ ] 4.4 — Formatting toolbar (web full + iPhone keyboard toolbar)
- [ ] 4.5 — Inserting things (links, images, tables, KaTeX, comments)
- [ ] 4.6 — Studiply blocks (callouts, timestamp chips, mark chips)
- [ ] 4.7 — Convert old notes (idempotent)

## Phase 5 — Recording with live notes and marks (`phase-5-recording`)
- [ ] 5.1 — Spike: recording in pieces (expo-audio + MediaRecorder, chunk joins)
- [ ] 5.2 — Recorder service (start/pause/resume/stop, queue, recovery, tests)
- [ ] 5.3 — Recording screen (iPhone + laptop strip)
- [ ] 5.4 — Live notes with timestamps
- [ ] 5.5 — Marks with a 1–10 level
- [ ] 5.6 — Board photos
- [ ] 5.7 — A real lecture (dogfood + fixes)

## Phase 6 — Study assistant during class (`phase-6-assistant`)
- [ ] 6.1 — The assistant's brain (`assistant-chat` with time windows, tests)
- [ ] 6.2 — Chat interface (web panel + iPhone sheet, streaming, quick prompts)
- [ ] 6.3 — Assistant actions + Ask Claude in the document

## Phase 7 — The summary engine (`phase-7-summary`)
- [ ] 7.1 — Test lectures first (3 fixtures)
- [ ] 7.2 — The calculator (derived variables, no AI, spec-exact tests)
- [ ] 7.3 — The summarize panel (resources, 10 sliders, presets, live preview)
- [ ] 7.4 — First real summary (≤ 60 min pipeline)
- [ ] 7.5 — Quality checks (schema, coverage, length, faithfulness, language)
- [ ] 7.6 — Long lectures (split by topic, merge)
- [ ] 7.7 — Into the document (JSON → editor blocks, versions, edit-safe regen)
- [ ] 7.8 — You judge the quality (prompt/calculator fixes)
- [ ] 7.9 — Extend, merge, exam pack

## Phase 8 — Visuals and PDF (`phase-8-visuals`)
- [ ] 8.1 — Text modules (timeline, cause-effect, tables, cards…)
- [ ] 8.2 — Formulas and graphs (KaTeX, function plots, model templates, data charts)
- [ ] 8.3 — PDF export (A4/Letter, embedded fonts/KaTeX, answers last page, options sheet)

## Phase 9 — Study tools (`phase-9-study`)
- [ ] 9.1 — Quiz me and flashcards
- [ ] 9.2 — Spaced review and course settings

## Phase 10 — App Store and web launch (`phase-10-launch`)
- [ ] 10.1 — Apple's rules inside the app (Sign in with Apple, account deletion, AI consent, recording reminder, permission texts)
- [ ] 10.2 — Paying for AI (cost model, IAP / RevenueCat, server-enforced limits)
- [ ] 10.3 — Pages and store listing (privacy/support pages, App Store Connect, `docs/APP-STORE.md`)
- [ ] 10.4 — TestFlight (production build, testers, crash reporting)
- [ ] 10.5 — Beta with classmates (feedback triage + fixes)
- [ ] 10.6 — Launch (web to production, submit for App Review, launch-day checklist)

---

## Decisions

- **Phase 0 stays on `main`**; one branch per phase starts in Phase 1 (`phase-1-backend`, …).
- **Pre-commit hook lives in `.githooks/`** (tracked) and is enabled with `git config core.hooksPath .githooks`; the `prepare` script sets this on every `npm install`. No husky.
- **Lint warnings don't block commits; errors do.** `expo lint` only fails on errors. Remaining warnings are listed under Known issues.
- **Tests live in `__tests__/` folders under `src/`**, never under `app/` (expo-router would treat them as routes).
- **No SQLite on web.** Don't add the Metro `wasm` / COOP-COEP config. In Phase 1 the web version reads directly from Supabase and SQLite stays iPhone-only (step 1.8), so during Phase 1 web stops loading `expo-sqlite` entirely (platform-specific files, e.g. `.web.ts`).
- **Remote Supabase project reset (23 Oct 2026).** The existing "Studiply" project (`xmymneartjmdsawlwzyl`, eu-west-1, Postgres 17) held the old app's backend: 10 tables, 2 functions, 1 trigger, 13 RLS policies, 15 auth users (13 anonymous, 1 email, 1 Google), and a `source-files` bucket with 17 files that were all 0 bytes (uploads never completed). After a full backup, Lea approved and Claude ran: drop all old `public` objects (explicit list, no cascade), delete the bucket and its files, delete all auth users. Remote is now empty; new schema comes from migrations in step 1.2. Google sign-in provider left enabled for now, to be decided in step 1.3.
- **Local development uses local Supabase.** `.env` points `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` at `supabase start` (http://127.0.0.1:54321). The remote URL and anon key come in step 1.7 via EAS environment variables. The service_role key is never in `.env` or the app.
- **Sources of truth for notes and marks (step 1.2).** The ProseMirror JSON of a lecture's `notes` document is the source of truth for the student's notes. `note_lines` is an index derived from it by `block_id` (unique per document), rebuilt by the app on every save and never edited directly; it exists for the coverage check and the summarize pipeline. For marks, the `marks` table is the source of truth: a mark chip in a document stores only the mark id, and type, level and note are always read from the table (changing the level from the chip updates the row). Written as a comment in `supabase/migrations/…_lecture_data.sql`.
- **Database schema shape (step 1.2).** A library tile is a row in `files` (`kind`: lecture, document, pdf, unit_summary, exam_pack); its tabs are rows in `documents` (one per tab: notes, summary, transcript). `lectures.id` = `files.id`. Items can sit at the "My library" root (null `course_id`); triggers keep `course_id` equal to the parent folder's and refuse folder cycles. Every table has owner-only RLS (`private.apply_owner_rls`) and children use composite `(parent_id, user_id)` foreign keys so nobody can attach rows to another user's data. `ai_usage` is read-only for users (only Edge Functions write it); on `ai_consent` users can only insert and set `withdrawn_at`. Block origin (ai, student, media) lives in the ProseMirror JSON, not in columns. Migrations are applied to local Supabase only until step 1.7.
- **No seed data in migrations (step 1.2).** Migrations create structure only: no example courses, folders or files, and no course names anywhere in the schema. The only inserts are triggers (profile on sign-up, settings row on course creation). Example rows live only inside the pgTAP tests, which always roll back.
- **Database tests are separate from `npm run check` (step 1.2).** `npm run test:db` (pgTAP, 127 tests in `supabase/tests/database/`) needs Docker and the local stack, so it isn't in the pre-commit hook; run it after any migration change. `00_rls_enabled` fails if a new table is added without RLS or a policy, or if `anon` gets any access.
- **Generated database types (step 1.2).** `npm run gen:types` writes `src/types/supabase.ts` from the local database; rerun it after every migration. The old hand-written `src/types/database.ts` stays until step 1.7 switches the services.
- **Login is email + password with 6-digit email codes (step 1.3).** Magic links were rejected: students would need their mail open on every sign-in (lab PCs, borrowed laptops), university mail filters often pre-open single-use links, and links back into the iPhone app need deep links. Email is only used to confirm the address at sign-up and to reset a password, and both times the student types a code from the email into the app (`supabase/templates/`), so no redirect URLs are configured. Passwords need 8+ characters. Google sign-in isn't in the app; whether the remote Google provider stays on is decided in step 1.7.
- **Session storage (step 1.3).** iPhone: Keychain via `expo-secure-store`, split into ~1.8 KB chunks because SecureStore rejects large values (`src/lib/secureStorage.ts`). Web: localStorage (`secureStorage.web.ts`). Tokens auto-refresh only while the app is in the foreground.
- **Local Supabase from a real iPhone (step 1.3).** `.env` stays on `127.0.0.1`. In development on native, `src/lib/supabaseUrl.ts` replaces a loopback host with the Mac's LAN address from Metro (`Constants.expoConfig.hostUri`), so nothing needs editing when the Mac's IP changes. Production URLs and web are left alone.
- **Bridge from Supabase users to the SQLite services (step 1.3).** Until step 1.7 the iPhone services still read SQLite rows keyed by `user_id`, so after sign-in `ensureLocalProfile` creates a local profile + settings row with the Supabase user id. Local profiles from before 1.3 and their data stay on the device untouched (not visible while signed in) and are uploaded in step 1.9. Name edits write to Supabase `profiles` and the local row. The profile shown in the app comes from Supabase, with the session's `display_name` as the offline fallback.
- **Web has no local database (step 1.3).** `src/lib/db.web.ts` replaces `db.ts` on web: reads return nothing, writes fail with a message. This makes the web build bundle (it failed before on `wa-sqlite.wasm`); real web data comes from Supabase in step 1.7.
- **Storage buckets (step 1.4).** Three private buckets, created by a migration (`…_storage.sql`) so they reach the remote project with the schema in step 1.7: `audio-chunks` (25 MiB, the Whisper limit; audio types), `slides` (50 MiB; PDF, PNG, JPEG), `photos` (10 MiB; **JPEG only**). Every object path starts with the owner's user id (`{userId}/…`) and the four policies on `storage.objects` check that first segment against `auth.uid()`, for signed-in users only; anon has no access. `supabase/tests/database/03_storage.test.sql` (60 tests) proves user B can't read, list, overwrite, move or delete user A's files; `npm run check:storage` proves the same through the real Storage API with two throwaway users it deletes afterwards (local only; it refuses any other URL).
- **Photos are always JPEG (step 1.4).** Board photos will be sent to Claude, which can't read HEIC, so every picked image goes through `src/utils/toJpeg.ts` (`expo-image-manipulator`, longest side max 2048 px, quality 0.8) and the `photos` bucket rejects anything else.
- **Upload helper (step 1.4).** `src/services/cloud-storage.service.ts` (not to be confused with the on-device `storage.service.ts`) adds the `{userId}/` prefix itself and uploads to the Storage REST endpoint directly, because supabase-js can't report upload progress: iPhone through `expo-file-system` upload tasks, web through `XMLHttpRequest` (`src/lib/uploadTransport*.ts`). Retry rules live in `src/lib/retry.ts` (unit tested): network errors, 408, 429 and 5xx are retried three times after ~1 s, 2 s and 4 s; an expired token is refreshed once; anything else fails at once with a plain message. Storage reports most errors as HTTP 400 with the real status in the JSON body, which the helper reads. No resumable (TUS) uploads: photos and 30-second audio chunks are small.
- **Profile photo (step 1.4).** `profiles.avatar_url` was renamed `avatar_path`: it holds a path in the private `photos` bucket (`{userId}/profile/avatar-{timestamp}.jpg`), shown through a 1-hour signed URL cached in memory. Each change uploads under a new name (no stale cached image) and then deletes the old file. The old SQLite `profiles.avatar_url` column is untouched (local only, unused).
- **Database tests count only their own rows (step 1.4).** The local database now holds real test accounts, so tests must filter by their test user ids, never count a whole table (the account-deletion test in `02_rules` was fixed this way).
- **Transcription model: `whisper-1` (step 1.5).** OpenAI's docs (Oct 2026) recommend `gpt-transcribe` ($0.0045/min), but it returns text only: asked for `verbose_json` it answers 400 "Use 'json' or 'text'" (checked on 24 Oct 2026 by the probe at the end of `npm run check:transcribe`). Only `whisper-1` ($0.006/min) gives segment timestamps, and it shuts down on 26 Feb 2027 (see Things Lea must do). Model and price are constants in `supabase/functions/_shared/transcript.ts`. Segments Whisper rates as probably silence with low confidence (`no_speech_prob > 0.6` and `avg_logprob < -1`, the open-source Whisper thresholds) are dropped, because that is where it invents phrases like "Thanks for watching". Confidence = `exp(avg_logprob)`. Whisper adds a pause to the end of the segment before it, so segments touch with no gaps.
- **`transcribe-chunk` request and order of checks (step 1.5).** `POST /functions/v1/transcribe-chunk` with the user's token and `{ lectureId, seq, storagePath, startMs }`. The order: signed in (401) → valid body, path in the caller's own `{userId}/` folder (400 / 403) → own lecture (404) → consent (403 `consent_required`) → daily limit (429 `daily_limit`) → download → Whisper (502 on failure) → cost into `ai_usage` → chunk row + segments. Nothing is downloaded or sent to OpenAI before the consent and limit checks. `seq` makes it idempotent: a chunk already `transcribed` with the same path is answered from the database with no second OpenAI call or charge. The function reads and writes as the student (RLS applies); only the `ai_usage` insert uses the service role, injected by the Supabase runtime, never from a file in the repo. Logs hold ids, status and timings only, never audio, text or keys.
- **Daily transcription limit: 6 hours of audio per rolling 24 h (step 1.5).** It is the sum of `ai_usage.audio_seconds` for `transcription`, checked before each chunk. A placeholder until plans arrive in step 10.2.
- **Consent version `dev-2026-10` (step 1.5).** Edge Functions only count `ai_consent` rows with `CONSENT_POLICY_VERSION` from `_shared/transcript.ts` and `withdrawn_at` null; they never grant consent. Until the step 10.1 screen exists, the check script's test user gives consent with its own client (the same insert the screen will make), and Lea's own account uses `supabase/snippets/grant-transcription-consent-local.sql` (local only).
- **A lecture's language can be unknown (step 1.5).** `lectures.language` is now nullable with no default, and must be an ISO code (`^[a-z]{2,3}$`). null means Whisper detects the language; the detected code is stored on the lecture if it was still empty, and a language set by the student is always sent as is and never overwritten. Step 1.9 must map the old app's `'auto'` to null.
- **Edge Functions live outside the app's tooling (step 1.5).** `supabase/functions/` is excluded from `tsconfig.json` and eslint (Deno globals, `npm:` imports). Pure rules live in `_shared/transcript.ts` with no Deno code, so Jest tests them from `src/lib/__tests__/transcript.test.ts`. Local secrets go in `supabase/functions/.env` (git-ignored; template `supabase/functions/.env.example`), and `supabase functions serve` reads it only when it starts.
- **Edge Functions are type-checked by Deno (step 1.6).** `npm run typecheck:functions` (`deno check` on every `supabase/functions/*/index.ts`, and through their imports every `_shared/` file) is part of `npm run check`, so of the pre-commit hook. It needs no Docker; the first run needs a connection to download the packages into Deno's cache. `--node-modules-dir=none` makes Deno resolve `npm:` imports from its own cache, as the edge runtime does, instead of the app's `node_modules` (the root `package.json` would otherwise make it look there). Supabase's `edge-runtime.d.ts` doesn't load under Deno 2.9, so `assistant-chat` declares the one `EdgeRuntime` function it uses itself.
- **Shared checks for AI functions (step 1.6).** `_shared/guard.ts` holds sign-in, own lecture, consent and usage-today (read page by page, so the 1000-row API cap no longer matters) and the one service-role write, the `ai_usage` insert. `transcribe-chunk` uses it with unchanged checks, codes and messages (`check:transcribe` re-run). The consent version moved to `_shared/policy.ts`.
- **Claude model and settings (step 1.6).** `CLAUDE_MODELS` in `supabase/functions/_shared/claude.ts` is the one config place, one entry per function; both are `claude-opus-5-5`, Anthropic's recommended default (Oct 2026, $4 / $20 per million input / output tokens). Thinking is always on for this model; the skeletons use `effort: low` and `max_tokens` 4096. The SDK is `npm:@anthropic-ai/sdk@0.135.0` (the latest 0.x; 1.0 was only days old), pinned in the import. The SDK retries connection errors, 429 and 5xx twice.
- **Server-side fallbacks on (step 1.6).** Every Claude call sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): if Claude declines a request for policy reasons, Anthropic re-runs it on its recommended model for that kind of refusal inside the same call. The cost is priced per attempt from `usage.iterations`, each at its own model's price (a model missing from the price table is priced like the dearest one, so a limit is never undercounted), and `ai_usage.model` records the model that answered. Only a refusal by the whole chain reaches the student: an `error` event `refused` (assistant) or 422 `refused` (summarize).
- **`assistant-chat` and `summarize` (step 1.6).** `POST /functions/v1/assistant-chat` `{ lectureId, message }` (max 4000 characters) and `POST /functions/v1/summarize` `{ lectureId }`, with the user's token. Order of checks: signed in (401) → server has the key (500 `not_configured`) → valid body (400) → own lecture (404) → `assistant_summary` consent (403 `consent_required`) → daily limit (429 `daily_limit`). Nothing reaches Anthropic before all of them pass. Both still answer a fixed test prompt; Phase 6 / 7 bring the real prompts, and `assistant_messages` isn't written yet. Logs hold ids, status, timings and token counts only, never the message, the answer or keys.
- **Streaming format (step 1.6).** `assistant-chat` answers `text/event-stream`: `event: delta` `{ text }` for each piece, then `event: done` `{ model, stopReason, usage, costUsd }`, or `event: error` `{ code, error }` instead of done, after which the app discards the pieces it got. Errors found before streaming starts stay plain JSON like the other functions. `summarize` answers JSON `{ text, model, stopReason, usage, costUsd }`, but streams from Anthropic itself because real summaries will be long.
- **Claude's cost is logged once, when the answer ends (step 1.6).** If the student hangs up mid-answer, the answer still runs to the end (kept alive with `EdgeRuntime.waitUntil`) and is logged, because Anthropic bills it either way. If Claude fails mid-answer, the part already written is logged. `check:claude` proves one row per answer, also after hanging up.
- **Daily Claude limit: $3 per rolling 24 h (step 1.6).** It is the sum of `ai_usage.cost_usd` for `assistant` + `summary`, checked before each call; a placeholder until plans arrive in step 10.2. Consent scope for both functions is `assistant_summary`; transcription consent alone doesn't allow them.
- **npm audit policy.** At the start of Phase 1, after `npx expo install --fix`, run `npm audit --omit=dev` and only fix what affects the shipped app. Dev-tool warnings are left alone. Never use `npm audit fix --force`.

## Things Lea must do

- **Docker Desktop must be running** before `supabase start` (and before anything that uses the local database, including `npm run test:db` and `npm run gen:types`).
- **Never apply migrations to the remote project yourself** (`supabase db push`, or anything with `--linked`). The CLI is still linked to the remote project; the schema goes there in step 1.7.
- **Old-app backup** is at `~/Documents/Projects/Apps/Studiply-backup-2026-10-23/` (outside the repo, private permissions): schema, all rows including the 15 old accounts, roles, and the 17 empty files. It may contain other people's personal data (emails), so delete it once you're sure nothing in it is needed (suggestion: at the end of Phase 1).
- **Paused project "leapessey's Project"** (`xpcnrgkqcvbdywvshpsc`) exists in the same Supabase account, not inspected. Delete it in the dashboard if unused (the free plan limits active projects).
- **Testing login on your iPhone (step 1.3).** Docker on, `supabase start`, then `npx expo start`. iPhone and Mac on the same Wi-Fi (or the Mac on your iPhone's Personal Hotspot if the network blocks it). Scan the QR code with Expo Go and allow "Local Network" if iOS asks; if macOS asks whether Docker may accept incoming connections, allow it. Codes arrive in Mailpit: http://127.0.0.1:54324 on the Mac, or `http://<Mac IP>:54324` in Safari on the iPhone (the IP is in Expo's `exp://…` line). If Mailpit doesn't load on the iPhone, the phone can't reach the Mac.
- **Before real users (step 1.7 or 10.3): set up a custom SMTP email sender for the remote Supabase project.** The built-in sender only allows a few emails per hour, so sign-up and password-reset codes would stop arriving. Also copy the two code templates from `supabase/templates/` into the remote project's email templates.
- **Testing the profile photo (step 1.4).** Same setup as the login test above. Settings → Manage Account → Edit profile → Add photo, on iPhone and in the browser: the progress shows, then the photo appears in the modal, on the account card and on the Settings screen. In Studio (http://127.0.0.1:54323) → Storage → `photos` → your user id → `profile/` there is one `.jpg`; changing the photo replaces it, Remove photo deletes it and brings the initials back. To see the retries, start an upload in the browser with DevTools → Network → Offline: "Connection problem. Retrying (n/3)…", then an error; switch back to Online and try again.
- **Step 10.1 — account deletion must also delete Storage files.** Deleting an account cascades through every database row, but not into Storage: the server function must also remove every object under `{userId}/` in `audio-chunks`, `slides` and `photos`.
- **Testing transcription locally (step 1.5).** Docker on, `supabase start`, then in a second terminal `supabase functions serve` (restart it after changing `supabase/functions/.env`). Then `npm run check:transcribe`: it speaks a sample lecture with macOS `say`, prints the segments with their times, and cleans up. Each run makes two short OpenAI calls (well under a cent).
- **Testing Claude locally (step 1.6).** Docker on, `supabase start`, then in a second terminal `supabase functions serve` (restart it after changing `supabase/functions/.env`). Then `npm run check:claude`: it shows the streamed answer arriving in pieces with their timings, checks consent, the limit and the cost log, and cleans up. Each run makes four short Anthropic calls (well under a cent). The very first call after starting `functions serve` can answer 502 while the runtime downloads the SDK; run it again.
- **Step 1.7 — Anthropic key on the remote project.** Set it yourself with `supabase secrets set ANTHROPIC_API_KEY=…` for the remote project (or in the dashboard → Edge Functions → Secrets), never in the app or git. Once 1.7 removes `EXPO_PUBLIC_ANTHROPIC_API_KEY` from the app, **revoke that old key** in the Anthropic Console: it has been inside app bundles. Use a new key for the server.
- **Step 1.7 — OpenAI key on the remote project.** Set it yourself with `supabase secrets set OPENAI_API_KEY=…` for the remote project (or in the dashboard → Edge Functions → Secrets), never in the app or git. Once 1.7 removes `EXPO_PUBLIC_OPENAI_API_KEY` from the app, **revoke that old key** in the OpenAI dashboard: it has been inside app bundles.
- **Before 26 Feb 2027 — replace `whisper-1`.** OpenAI shuts it down that day. Check whether `gpt-transcribe` (or its successor) returns timestamps by now (the last line of `npm run check:transcribe` says so), then change `TRANSCRIBE_MODEL` / `PRICE_PER_MINUTE_USD` in `supabase/functions/_shared/transcript.ts`. If no model gives timestamps, sentence times must be estimated.
- **Step 10.1 — real consent version.** The consent screen gets a real `policy_version`; update `CONSENT_POLICY_VERSION` to match, so consent given during development no longer counts.
- **Before step 10.4 (TestFlight):** upgrade to the latest Expo SDK and re-run `npm audit --omit=dev`, so the `query-string` / `decode-uri-component` issue (see Known issues) is fixed before launch.

## Known issues

- **Palette incomplete for the designed summary** (AUDIT risk #11). `src/constants/colors.ts` is missing tokens DESIGN.md/SUMMARY-SPEC.md require: recording `#CC3333` (only `error: #D94F4F` exists), "From your notes" green `#E8F5EE`/`#1F6B45`, exam `#FFFBEB`/`#FFE4B5`/`#7A4A00`, accent-on-light `#4F43B0`, salmon label `#8A3B22`. Must be added to `colors.ts`, never hard-coded inline. To be handled in **step 2.3** (Look and feel).
- ~~**Web: `expo-sqlite` worker fails to bundle**~~ (found in step 0.3; fixed in step 1.3 by `src/lib/db.web.ts`, so web no longer imports `expo-sqlite`).
- **Lint warnings left on purpose** (step 0.3) — fixing them changes when effects run, so they need a behavior review, not a lint pass:
  - `react-hooks/exhaustive-deps` in `app/(main)/project/[id].tsx` (×3), `app/(main)/record/active.tsx`, `app/(main)/record/review.tsx` (×2), `app/_layout.tsx`, `src/components/MoveToModal.tsx`, `src/components/SplashScreen.tsx`, `src/components/UndoToast.tsx`.
  - Unused `sourceFiles` state in `app/(main)/record/review.tsx` (still set from `getActiveSourceFiles`; remove when that screen is rebuilt).
- **npm audit: `decode-uri-component` DoS in the app bundle** (found at Phase 1 start, accepted). `npm audit --omit=dev` (after `expo install --fix`, 23 Oct 2026): of 18 findings, only `nanoid`, `query-string` and `decode-uri-component` ship in the iOS bundle; the rest are build tools that run only on the Mac. `nanoid` was updated to 3.3.20. `decode-uri-component@0.2.2` (exponential decoding of malformed percent-encoded input, so a crafted deep link could freeze the app) is pulled in by `query-string@7`, which `expo-router` depends on directly; the fix (0.5.x) needs an Expo SDK major upgrade. Low impact (local DoS, needs the user to open a crafted link). Fix before launch: see Things Lea must do.
- **"Delete all data" only deletes this device's data** (step 1.3). It removes the local profile and files and signs out; the Supabase account and its rows stay. Real account deletion needs a server function and comes in step 10.1. On web it says it's not available yet.
- **Opening the app offline more than an hour after the last use shows the login screen** (step 1.3). The stored access token has expired and can't be refreshed without a connection, so Supabase reports no session. The stored session isn't deleted on a network error, so it should come back once online, but that path isn't tested yet; logging in again always works. To handle in step 1.8 (offline cache).
- **Security screen still says "Your data is stored on this device"** (found in step 1.3). Outdated now that there is an account; left as is on purpose. Reword it in **step 1.7**, when the data moves to the cloud (`app/(main)/settings/security.tsx`).
- **Web: library empty and saving fails after login** (step 1.3, by design). See the `db.web.ts` decision; fixed when step 1.7 switches the services to Supabase.
- ~~**Edge Function code isn't type-checked**~~ (found in step 1.5; fixed in step 1.6: `deno check` is part of `npm run check`).
- **Daily limits can be slightly exceeded by parallel requests** (step 1.5, same for Claude in step 1.6). Each limit is checked before the AI call, so requests sent at the same moment can all pass, and a Claude answer's cost is only known once it ends. At most a few calls' worth; the server-enforced limits in step 10.2 should count atomically. (Since step 1.6 usage is read page by page, so the 1000-row API cap no longer matters.)
- **The app still transcribes on the device** (step 1.5, by design). `src/services/ai.service.ts` keeps calling OpenAI with `EXPO_PUBLIC_OPENAI_API_KEY` in 20-minute chunks until step 1.7 switches it to `transcribe-chunk`, and step 5.2 sets the real chunk length.
- **`src/types/supabase.ts` is unformatted** (found in step 1.2). `supabase gen types` prints a hint to format it with `oxfmt`; no formatter is installed and adding one is a new dependency, so it's left as generated. It type-checks and lints clean.

## Left to later

Schema pieces step 1.2 deliberately left out; each comes as its own migration in the step listed.

- ~~**Storage buckets and policies**~~ — done in step 1.4.
- **PowerPoint (.pptx) slides in the media tray, with text extraction** — Phase 7. Needs the pptx MIME type (`application/vnd.openxmlformats-officedocument.presentationml.presentation`) added to the `slides` bucket in a new migration.
- **Choose the Claude model per function** — Phase 6 / 7. Consider a faster, cheaper model (Sonnet) for `assistant-chat` during class (latency and cost) and keep Opus for `summarize`; compare quality and speed on real lectures before deciding. Keep one config place per function (`CLAUDE_MODELS` in `supabase/functions/_shared/claude.ts`), and add the chosen model's price to the table there.
- **Course glossary and professor's name as a Whisper prompt** — step 5.2 / Phase 7. Pass them to `transcribe-chunk` as Whisper's `prompt` (max 224 tokens), so technical terms and names are spelled right (SUMMARY-SPEC "The lecture input"). `course_settings.professor` exists; the glossary comes with the summary engine.
- **Resumable uploads (TUS)** — only if step 5.2 shows audio chunks failing on bad connections.
- **Sync columns** (revision / conflict tracking for the offline cache) — step 1.8.
- **Full-text search indexes** (titles, note text, transcripts, glossary terms) — step 3.5.
- **Trash auto-empty after 30 days** (scheduled job) — step 3.5.
- **Comments** (margin comments on documents) — step 4.5.
- **AI suggestions** (pending accept/reject changes from Ask Claude) — step 6.3.
- **`share_links` table: read-only share links for summaries** (v1 feature, "Share a summary with classmates") — Phase 8.
- **Plans and entitlements** (subscription state, server-enforced AI limits) — step 10.2.
