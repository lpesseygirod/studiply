# Studiply

Turn a recorded lecture into structured, searchable study notes — on-device,
with no backend.

Students record lectures and never revisit them, because a 50-minute audio file
isn't studiable. Studiply records the lecture, transcribes it, and produces
organised notes you can search, annotate, ask follow-up questions about, and
export as a PDF — filed under the project and folder it belongs to.

![Studiply screenshot](docs/screenshot.png)
<!-- TODO: replace with a real screenshot -->

## Stack

- **Expo** (SDK 54) / **React Native** 0.81 — iOS and Android from one codebase
- **TypeScript** — strict, ~16k lines across `app/` and `src/`
- **expo-router** — file-based routing with typed routes
- **expo-sqlite** — local SQLite; the app's only persistence layer
- **OpenAI Whisper** (`whisper-1`) — speech-to-text
- **Anthropic Claude** — summarisation, note generation, and follow-up Q&A
- **expo-av / expo-file-system / expo-print** — recording, on-device storage, PDF export

### Why no backend

An earlier version ran on Postgres and object storage. It was replaced with
on-device SQLite and the app's document directory, which removed the hosting
cost and the account system, and made the app work fully offline. The schema
in `src/lib/db.ts` still mirrors the Postgres one it replaced, with three
adaptations SQLite forces: booleans as `INTEGER 0/1`, JSON columns as `TEXT`,
and timestamps as ISO-8601 `TEXT` (fixed-width, so lexicographic ordering is
chronological ordering).

The tradeoff is that Whisper and Claude are called directly from the client,
so the API keys ship in the bundle. That's acceptable for personal use and is
documented as such in `src/services/ai.service.ts`; the fix is a thin server
proxy, which is the main thing standing between this and distribution.

## Architecture: how audio becomes notes

    record/active.tsx          expo-av captures audio to a cache URI
            │
            ▼
    storage.service.ts         copies it into the app's document directory,
                               so an OS cache purge can't orphan the session
            │
            ▼
    session.service.ts         creates the session row (SQLite)
            │
            ▼
    ai.service.ts
      ├── transcribeAudio()    multipart POST → OpenAI Whisper
      │                        (25 MB hard limit enforced client-side)
      ├── generateNotes()      transcript + any attached slides/photos
      │                        → Claude → structured summary
      └── logAiUsage()         token counts and per-call cost → ai_usage table
            │
            ▼
    note.service.ts            note persisted, then user-confirmed
            │
            ▼
    note/[id].tsx              read, edit, highlight, ask follow-ups,
                               export to PDF

Everything is layered the same way: screens in `app/` call services in
`src/services/`, services own all SQL and talk to `src/lib/db.ts`, and
`src/lib/mappers.ts` is the single place SQLite rows convert to and from
domain types. No screen writes SQL.

**With no API keys configured, the app still runs end-to-end.** `processSession()`
routes to a mock pipeline that returns a simulated transcript and summary, so
recording, storage, organisation, search and export are all exercisable without
an API account. This was deliberate — it keeps the non-AI 80% of the app
testable for free.

## Status

**Built and working:**

- Audio recording with background-audio support and a live session screen
- Whisper transcription and Claude note generation, with a full offline mock path
- Local anonymous profiles — multiple profiles per device, no remote auth
- Projects, nested folders, and sessions, with move and breadcrumb navigation
- Note editing, text highlighting, and AI follow-up questions on a note
- Attach slides, photos, and documents to a session as extra context
- Full-text search across projects, sessions and notes
- Soft-delete trash with undo, plus per-file retention policies
- PDF export and share
- Per-call AI cost tracking, spend-by-provider breakdown, and a budget cap

**Planned:**

- Quiz generation from notes (`app/(main)/quiz/` is scaffolded and empty)
- A server proxy for the AI calls, so keys leave the client bundle
- Optional sync and cross-device backup

## Running it locally

Requires Node 18+ and the Expo Go app, or an iOS Simulator / Android emulator.

    git clone <repo-url>
    cd Studiply
    npm install
    cp .env.example .env     # optional — see below
    npm start

Then press `i` for iOS, `a` for Android, or scan the QR code with Expo Go.

`node verify-setup.js` checks the environment and reports what's missing.

### API keys are optional

Without them the app runs on the mock AI pipeline and every non-AI feature
works. To enable real transcription and note generation, put your own keys in
`.env`:

    EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
    EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...

`.env` is gitignored. Note that Expo inlines `EXPO_PUBLIC_*` variables into the
bundle, so keys added this way are readable in any build you distribute — use a
key with a spend limit, and see the backend note above.
