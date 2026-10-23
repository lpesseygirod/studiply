# Studiply — Progress

Tracks every step in `docs/BUILD-PLAN.md` (0.1 → 10.6). Tick a step only when its **Check** passes. Keep the three sections at the bottom up to date as you go.

## Phase 0 — Set up and safety net
- [x] 0.1 — Manual setup (rename folder, add design docs, repo privacy, install Docker/Supabase/EAS CLIs, create accounts)
- [x] 0.2 — Audit (`docs/AUDIT.md`, `docs/PROGRESS.md`)
- [x] 0.3 — Safety net (npm check scripts, first unit tests, pre-commit hook)

## Phase 1 — Backend and safe API keys (`phase-1-backend`)
- [ ] 1.1 — Connect Supabase (CLI, local dev, .env public URL + anon key)
- [ ] 1.2 — Database schema (SQL migrations + RLS + RLS tests)
- [ ] 1.3 — Login (email, Supabase Auth)
- [ ] 1.4 — File storage (private buckets + policies + helper)
- [ ] 1.5 — Transcription on the server (`transcribe-chunk` Edge Function)
- [ ] 1.6 — Claude on the server (`assistant-chat` + `summarize` skeletons)
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
- **npm audit policy.** At the start of Phase 1, after `npx expo install --fix`, run `npm audit --omit=dev` and only fix what affects the shipped app. Dev-tool warnings are left alone. Never use `npm audit fix --force`.

## Things Lea must do

- **Before step 10.4 (TestFlight):** upgrade to the latest Expo SDK and re-run `npm audit --omit=dev`, so the `query-string` / `decode-uri-component` issue (see Known issues) is fixed before launch.

## Known issues

- **Palette incomplete for the designed summary** (AUDIT risk #11). `src/constants/colors.ts` is missing tokens DESIGN.md/SUMMARY-SPEC.md require: recording `#CC3333` (only `error: #D94F4F` exists), "From your notes" green `#E8F5EE`/`#1F6B45`, exam `#FFFBEB`/`#FFE4B5`/`#7A4A00`, accent-on-light `#4F43B0`, salmon label `#8A3B22`. Must be added to `colors.ts`, never hard-coded inline. To be handled in **step 2.3** (Look and feel).
- **Web: `expo-sqlite` worker fails to bundle** (pre-existing, found in step 0.3). `Unable to resolve "./wa-sqlite/wa-sqlite.wasm"` — the repo has no `metro.config.js` adding `wasm` to `resolver.assetExts` (and expo-sqlite on web also needs COOP/COEP headers). The web app shell bundles; the database worker doesn't. iOS bundles fine. Not fixed by decision: web stops loading `expo-sqlite` in Phase 1 (see Decisions).
- **Lint warnings left on purpose** (step 0.3) — fixing them changes when effects run, so they need a behavior review, not a lint pass:
  - `react-hooks/exhaustive-deps` in `app/(main)/project/[id].tsx` (×3), `app/(main)/record/active.tsx`, `app/(main)/record/review.tsx` (×2), `app/_layout.tsx`, `src/components/MoveToModal.tsx`, `src/components/SplashScreen.tsx`, `src/components/UndoToast.tsx`.
  - Unused `sourceFiles` state in `app/(main)/record/review.tsx` (still set from `getActiveSourceFiles`; remove when that screen is rebuilt).
- **npm audit: `decode-uri-component` DoS in the app bundle** (found at Phase 1 start, accepted). `npm audit --omit=dev` (after `expo install --fix`, 23 Oct 2026): of 18 findings, only `nanoid`, `query-string` and `decode-uri-component` ship in the iOS bundle; the rest are build tools that run only on the Mac. `nanoid` was updated to 3.3.20. `decode-uri-component@0.2.2` (exponential decoding of malformed percent-encoded input, so a crafted deep link could freeze the app) is pulled in by `query-string@7`, which `expo-router` depends on directly; the fix (0.5.x) needs an Expo SDK major upgrade. Low impact (local DoS, needs the user to open a crafted link). Fix before launch: see Things Lea must do.
