# Studiply — instructions for Claude Code

Studiply turns recorded lectures into editable study documents. A student records a class, takes live notes, marks moments (Important / Confused / Exam, each with a 1–10 level), chats with a study assistant during class, and then generates a summary that is written into the same editable document. Files live in a Finder/Drive-style library of courses and folders.

Owner: Lea (student, building this to ship on the Apple App Store and as a desktop web app).

## Read these first
- `docs/DESIGN.md` — the product as designed: screens, interactions, colors. **Wins over SUMMARY-SPEC.md when they disagree.**
- `docs/SUMMARY-SPEC.md` — how summaries are structured, subject modules, visuals, PDF export, JSON schemas.
- `docs/BUILD-PLAN.md` — the phases. Work on one phase at a time; don't start the next phase unless asked.
- `README.md` — current architecture (Expo + SQLite, no backend). Phase 1 changes this.

## Stack
- Expo SDK 54, React Native 0.81, TypeScript (strict), expo-router (typed routes).
- Targets: iOS (App Store) and web (desktop browser, the "laptop" version). Android is not a priority.
- Today: expo-sqlite is the only persistence; Whisper and Claude are called from the client with EXPO_PUBLIC keys. Phase 1 moves AI calls and data to a backend (Supabase) so keys are never in the app bundle.
- Colors and type: `src/constants/colors.ts` and `src/constants/typography.ts`. Never hard-code a hex that already exists there.

## Two faces, one app
Studiply is an **iPhone app** (App Store, main recording device) and a **laptop web app** (three-column layout), from one Expo codebase with shared data. Every feature is built for both in the same phase, following `docs/DESIGN.md` (desktop sections + the iPhone section) and the feature table in `docs/BUILD-PLAN.md`. Use platform-specific files (`.ios.tsx` / `.web.tsx`) only where interaction really differs (drag and drop, menus, keyboard toolbar).

## How to work
- Start each task in plan mode: read the relevant code, propose a plan with the files you'll touch, then wait for approval.
- Small, reviewable steps. After each step: `npx tsc --noEmit` must pass, and the app must still start (`npx expo start`).
- Commit after each working step with a clear message. One phase = one branch (`phase-1-backend`, etc.).
- **Commits stay local.** Never run `git push`, create pull requests, or change anything on GitHub unless Lea explicitly asks in that message. GitHub is a separate copy she updates herself.
- Don't delete or rewrite working features unless the plan says so; reuse existing services and components (`folder.service.ts`, `MoveToModal.tsx`, `UndoToast.tsx`, `export.service.ts`, etc.).
- Migrations stay in order: every new migration's timestamp must be later than the newest file in `supabase/migrations/` (currently `20261029151900`). Until that time has passed, name new migrations by hand after it (`20261029152000_…`, `20261029152100_…`) instead of trusting `supabase migration new`. Never rename a migration that is already on the remote.
- Ask before adding a new dependency; prefer Expo-supported packages and check they work on both iOS and web.
- Never put API keys, secrets or user data in the client bundle, logs or git.
- When something can't be tested in Expo Go (custom native modules, TenTap custom extensions), say so and use an EAS development build.
- User-facing text: English UI; study content stays in the lecture's language.

## Product rules that must never break
- The student's own notes and marks are always included in a generated summary (coverage check: every note line's timestamp maps to a block).
- Student edits are never overwritten by regeneration; every document block records its origin: `ai`, `student` or `media`.
- AI suggestions never apply silently; the student accepts or rejects them.
- Audio, transcripts or images are sent to an AI service only after explicit consent (Apple guideline 5.1.2(i)).
- Recording never stops because the student opens the assistant, marks a moment or edits notes.
