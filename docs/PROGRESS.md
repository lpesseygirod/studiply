# Studiply — Progress

Tracks every step in `docs/BUILD-PLAN.md` (0.1 → 10.6). Tick a step only when its **Check** passes. Keep the three sections at the bottom up to date as you go.

## Phase 0 — Set up and safety net
- [x] 0.1 — Manual setup (rename folder, add design docs, repo privacy, install Docker/Supabase/EAS CLIs, create accounts)
- [x] 0.2 — Audit (`docs/AUDIT.md`, `docs/PROGRESS.md`)
- [ ] 0.3 — Safety net (npm check scripts, first unit tests, pre-commit hook)

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

_none yet_

## Things Lea must do

_none yet_

## Known issues

- **Palette incomplete for the designed summary** (AUDIT risk #11). `src/constants/colors.ts` is missing tokens DESIGN.md/SUMMARY-SPEC.md require: recording `#CC3333` (only `error: #D94F4F` exists), "From your notes" green `#E8F5EE`/`#1F6B45`, exam `#FFFBEB`/`#FFE4B5`/`#7A4A00`, accent-on-light `#4F43B0`, salmon label `#8A3B22`. Must be added to `colors.ts`, never hard-coded inline. To be handled in **step 2.3** (Look and feel).
