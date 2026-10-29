# Studiply

Turn a recorded lecture into structured, searchable study notes — on iPhone
and in the browser, with your library in the cloud.

Students record lectures and never revisit them, because a 50-minute audio file
isn't studiable. Studiply records the lecture, transcribes it, and produces
organised notes you can search, annotate, ask follow-up questions about, and
export as a PDF — filed under the project and folder it belongs to.

![Studiply screenshot](docs/screenshot.png)
<!-- TODO: replace with a real screenshot -->

## Stack

- **Expo** (SDK 54) / **React Native** 0.81 — iPhone app and desktop web app from one codebase
- **TypeScript** — strict, across `app/` and `src/`
- **expo-router** — file-based routing with typed routes
- **Supabase** — Postgres with Row Level Security, Auth, private Storage buckets, and Edge Functions (Deno)
- **OpenAI Whisper** (`whisper-1`) — speech-to-text, called only by the `transcribe-chunk` Edge Function
- **Anthropic Claude** (`claude-opus-5-5`) — notes and clarifications, called only by the `summarize` and `assistant-chat` Edge Functions
- **expo-av / expo-print** — recording and PDF export

### The backend (since step 1.7)

All data lives in Supabase: the schema and its owner-only RLS policies are in
`supabase/migrations/`, private files (audio chunks, photos, slides) in
Storage buckets whose paths start with the owner's user id. **The app holds no
AI key.** Whisper and Claude are called by Edge Functions with keys kept on
the server; the app sends only the student's own login token, and the
functions check consent and a daily limit before anything leaves the server.
`expo-sqlite` stays on iPhone only, for the earlier version's data (read and
uploaded by step 1.9, `src/services/legacyImport`) and the offline cache
(step 1.8); the web build never loads it.

### Offline on iPhone (since step 1.8)

The iPhone keeps a copy of the library in `studiply-cache.db` (`src/lib/cache`)
and keeps working without a connection:

- **Reading:** reads go to Supabase when it answers and to the copy when it doesn't (`readThrough`).
- **Background download:** a library download keeps the copy complete.
- **Sync queue:** note edits, lectures started offline, recordings, photos and PDFs are saved on the phone first and sent in order by the sync queue (`src/lib/sync`).
- **Conflicts:** a note block edited on two devices keeps the newer edit; the other one goes to `document_versions` (`src/lib/noteBlocks.ts`).
- **Detecting offline:** connectivity is decided by probing Supabase (`src/lib/connectivity.ts`).
- **Staying signed in:** the student stays signed in offline even after the token has expired.
- **The web:** it stays online-only and shows a banner when the backend can't be reached.

## Architecture: how audio becomes notes

    record/active.tsx          expo-av records 20-minute chunks; after Stop
            │                  they are uploaded (source-file.service →
            │                  cloud-storage.service, with progress and retries;
            │                  on iPhone through the sync queue, so offline
            │                  recordings upload later)
            ▼
    Storage audio-chunks       {userId}/{lectureId}/{seq}.m4a, plus an
                               audio_chunks row each
            │
            ▼
    ai.service.ts              asks consent once per kind of data (consent.service)
      ├── transcribeAudio()    → Edge Function transcribe-chunk, per chunk
      │                          → Whisper → transcript_segments
      ├── generateNotes()      → Edge Function summarize (task notes): reads
      │                          the transcript, photos and PDFs itself → Claude
      │                          (structured JSON note)
      └── clarifyContent()     → Edge Function assistant-chat (mode clarify)
            │                    Each function logs its cost in ai_usage.
            ▼
    note.service.ts            the confirmed note, in summaries.result
            │
            ▼
    note/[id].tsx              read, edit, highlight, clarify, export to PDF

Screens in `app/` call services in `src/services/`; services talk to Supabase
through `src/lib/supabase.ts` (tables) and `src/lib/functions.ts` (Edge
Functions), and `src/lib/cloudRows.ts` maps the new schema onto the types the
screens use. No screen queries the database. Alerts, menus and prompts go
through `src/components/dialogs` so they also work in a browser.

**Without network AI in development, the app still runs end-to-end.** Set
`EXPO_PUBLIC_MOCK_AI=1` (or leave `supabase functions serve` off) and
`ai.service.ts` uses a simulated transcript and note: nothing is sent and
nothing is counted. Store builds never simulate.

## Status

**Built and working:**

- Audio recording with background-audio support, uploaded to private cloud storage
- Whisper transcription and Claude note generation through Edge Functions (no keys in the app), with consent asked first and a development-only simulated path
- Email + password login with Supabase Auth (6-digit email codes for sign-up and password reset); sessions persist in the Keychain on iPhone and localStorage on web
- Projects, nested folders, and sessions, with move and breadcrumb navigation
- Note editing, text highlighting, and AI follow-up questions on a note
- Attach slides, photos, and documents to a session as extra context
- Full-text search across projects, sessions and notes
- Soft-delete trash with undo, plus per-file retention policies
- PDF export and share
- Per-call AI cost tracking on the server, today's use against a daily limit, spend by provider and operation
- The same library, notes and recordings on iPhone and in the browser
- Offline on iPhone: library, notes and transcripts readable, note edits and new recordings saved and synced later, with a per-block conflict rule
- Moving the earlier version's on-device data to the account (Settings → Earlier version data), safe to repeat and checked on the server

**Planned:**

- Quiz generation from notes (`app/(main)/quiz/` is scaffolded and empty)
- The remote Supabase project (step 1.7 part B)
- The app shell, library, editor and summary engine from `docs/BUILD-PLAN.md`

## Running it locally

Requires Node 18+ and, on the iPhone, the Studiply **development build**
(step 4.1; it replaces Expo Go because the editor needs native code).

    git clone <repo-url>
    cd Studiply
    npm install
    cp .env.example .env     # then add the local Supabase URL and anon key
    npm run start:local      # local Supabase; npm run start:remote for the remote project

Then scan the QR code with the iPhone's Camera ("Open in Studiply"), or press
`w` for the browser. Press `s` in Metro to switch to Expo Go if you need it.

### The development build (iPhone)

Built in the cloud by EAS (`eas.json`); no Xcode needed. Signing is managed by
EAS (certificate and provisioning profile on Expo's servers, never in git).

    eas device:create         # register an iPhone (Website → open the link on the phone)
    npm run build:dev:ios     # build; install from the QR code it prints

A new iPhone, or a change to native code or `app.json` (a new native module,
permission text or plugin), needs a new build; JavaScript changes don't. The
first time you open it, iOS asks for Developer Mode (Settings → Privacy &
Security → Developer Mode → Restart).

### The editor (step 4.2)

The iPhone's editor is a web page inside a WebView (TenTap), built from
`editor-web/` into `editor-web/build/editorHtml.js`, which is committed. After
changing anything it imports (`src/editor/bridges`, `src/editor/schema`,
`src/editor/pasteReport.ts`) or upgrading TenTap or Tiptap:

    npm run editor:build      # once
    npm run editor:dev        # or: rebuild on every change (Metro reloads the app)

The laptop's editor is Tiptap in the page with the same extensions.

### Formatting (step 4.4)

The formatting tools are one set of commands and one state (`src/editor/format`) for both devices. The laptop's toolbar (`FormatToolbar.web.tsx`) calls them directly. The iPhone's keyboard toolbar and its Aa and colour panels (`src/editor/iphone`, shown in place of the keyboard with TenTap's CustomKeyboard) send them through `FormatBridge`. Pasted Google Docs and Word HTML is rewritten into Studiply's styles by `src/editor/paste/rules.ts`.

### Inserting and colours (step 4.5)

The colour picker (`src/components/editor/ColorGrid.tsx`, `SpectrumPicker.tsx`) is shared by both devices. Its Recent colours sync through `profiles.preferences` (`preferences.service.ts`, merged by time). Links (`format/links.ts`, `cleanUrl`), tables (`bridges/table.ts`, the `table` command) and the iPhone's + and table panels (`src/editor/iphone/InsertPanels.tsx`) build on the same commands as the formatting tools.

Tables are edited on the table itself: the floating bar (`src/editor/table/tableBar.ts`, drawn by both editors; it asks each device for its menus), the laptop's right-click menu and bar menus (`TableMenus.web.tsx`) and hover handles (`table/tableHandles.ts`), and Table size… (`table/resize.ts`, up to 50 × 20). `schema/blockSpacing.ts` keeps a line to type in after every table (with a fixed id, so two devices add the same one) and adds the gap cursor. Blocks compare without attributes at their schema default (`schema/defaults.ts`), so content written without them isn't taken for an edit.

Photos, formulas and comments (step 4.5, checkpoint B):
- **Photos** are Studiply's `image` node (`schema/photo.ts`) with `src` `media:<id>`: a `media` row and a JPEG in the photos bucket (`doc-photo.service.ts`; the iPhone queues `upload_doc_photo`). Each editor resolves `media:` through `src/editor/media/photoSource.ts`: the laptop from a signed link, the iPhone's WebView by asking native through `bridges/photo.ts` (the phone's copy as a data URI, kept in `lib/photoCache`). Laptop: `photos.web.ts` (Image button, drop, paste).
- **Formulas** are Tiptap's `inlineMath` / `blockMath` (`bridges/math.ts`, KaTeX), edited with `schema/formula.ts`'s `setFormula`: `FormulaPopover.web.tsx` on the laptop, `iphone/FormulaSheet.tsx` on the iPhone, both around `components/editor/FormulaForm.tsx`. The WebView bundle inlines KaTeX's woff2 fonts (a Vite plugin in `editor-web/vite.config.mts`); the laptop declares the TTF ones from assets (`katexFonts.web.ts`).
- **After test B (checkpoint C):** photo layout (`wrap` / `align` on the photo, the `inlineImage` node, the shared photo bar `photoBar.ts`, the laptop's `PhotoMenu.web.tsx`); the selection bar (`format/selectionBar.ts`, both editors); `$…$` and the "Make formula" suggestion (`schema/mathSuggest.ts`, handled in `schema/formula.ts`); the iPhone toolbar fitted to the width like the laptop's (`toolbarFit.ts`).
- **Comments** are a `comment` mark (`schema/comments.ts`), so they travel with their block. Laptop: `Comments.web.tsx` (composer, margin, popover); the shell makes room for the margin (`components/shell/commentMargin.ts`). Both: the document menu's list (`components/editor/CommentsSheet.tsx`).

### Studiply's blocks (step 4.6)

Callouts (`schema/callout.ts`) and mark chips (`schema/markChip.ts`) are in `bridges/blocks.ts`; their menus are `BlockMenus.web.tsx` (laptop) and action sheets / `iphone/MarkSheet.tsx` (iPhone), through `calloutRequest` / `markChipRequest` in the format state. A tap on a timestamp chip opens `components/editor/MiniPlayer.tsx`, which plays the lecture's `audio_chunks` (`services/lecture-audio.service.ts`) through `src/lib/audioPlayer.ts`, the only file that plays audio with expo-av (to switch to expo-audio with the SDK upgrade).

### Names and the simplicity pass (before 4.6)

Every editor tool's name and shortcut is in `src/editor/toolNames.ts`, read by the laptop's tooltips (`components/editor/ToolTip.web.tsx`), the iPhone toolbar's long-press names and captions, the menus and VoiceOver; the bars drawn inside the document name their buttons with `editor/barHint.ts`. Menus take headings (`section` on `DialogButton`, `PopoverHeading`). `app/dev/editor-preview.tsx` (development only) draws the iPhone's keyboard toolbar and Page setup sheet in a browser for screenshots.

### Page view and zoom (step 4.5b)

Pages are drawn, never stored: `src/editor/page/pageView.ts` (in FormatBridge, so both editors) measures the document with no gaps and inserts each page gap as a widget decoration (a block between blocks, a line break inside a paragraph, a row in a table); `page/pageLayout.ts` is the pure rule set (widow / orphan, headings kept with the next line, page breaks), for the export (4.8) too. Zoom is CSS `zoom` on the editor. Each device keeps Pages / Pageless and its zoom in `lib/viewPrefs.ts`: the laptop's toolbar and ⌘+ / ⌘− / ⌘0 (`StudiplyEditor.web.tsx`, `FormatToolbar.web.tsx`), the iPhone's **…** → Print layout and a pinch (WebKit gesture events in the WebView, the `view` format command and state).

Since test D the pages sit on the app's gradient (the editor is transparent; a layer behind the text draws each white page) and follow the document's **page setup** (`page/pageSetup.ts`; `documents.page_setup`, saved by `setPageSetup` in `document.service.ts`, queued as `document_page_setup` on the iPhone; the dialog is `components/editor/PageSetupDialog.tsx`; the default for new documents is in `profiles.preferences.pageSetup`).

### Documents (step 4.3)

A blank document is a `files` row of kind `document` with one `documents`
row (tab `notes`); a lecture has up to three (`notes`, `summary`,
`transcript`). The content is ProseMirror JSON whose top-level blocks carry
`blockId`, `origin` (ai / student / media) and `editedAt`
(`src/editor/schema/blockMeta.ts`). Saving sends a block edit that the
server merges with the other device's (`src/editor/docBlocks.ts`, the step
1.8 rule: the newer edit of a block wins, the other is kept in
`document_versions`). The iPhone saves in its cache and queues the edit, so
writing works offline; the open document checks for the other device's
changes every 5 s (`src/editor/documentSession.ts`, `useDocumentSync`).
A version is kept at the end of each editing session; versions can be
named, restored, and old unnamed ones are thinned after 30 days.

`node verify-setup.js` checks the environment and reports what's missing.

### Local Supabase, login and email

Everything runs against local Supabase. Start Docker Desktop, then:

    supabase start
    supabase functions serve     # second terminal: transcription and Claude
    npm run start:local

- **Emails** (sign-up and password-reset codes) never leave your Mac. They land
  in Mailpit: http://127.0.0.1:54324 (from an iPhone: `http://<Mac IP>:54324`).
- **Users** are listed in Studio: http://127.0.0.1:54323 → Authentication.
- **Real iPhone:** `.env` keeps `http://127.0.0.1:54321`. In development the app
  swaps `127.0.0.1` for your Mac's network address (the one the development
  build already uses to load the app, see `src/lib/supabaseUrl.ts`). The iPhone and Mac must be on
  the same Wi-Fi; if the network blocks devices from seeing each other (common
  on school Wi-Fi), use the iPhone's Personal Hotspot.
- **Web:** the browser reads and writes the same Supabase data as the iPhone.

### AI keys live on the server

The app never holds an OpenAI or Anthropic key (Expo inlines every
`EXPO_PUBLIC_*` variable into the bundle, so none may be a secret). The Edge
Functions read them from `supabase/functions/.env` locally (git-ignored; see
`supabase/functions/.env.example`, restart `supabase functions serve` after
changing it) and from `supabase secrets set` on the remote project. Without
them, develop with `EXPO_PUBLIC_MOCK_AI=1`.

`npm run check:bundle` builds the web and iOS bundles and proves that no key
is inside.
