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
- **ElevenLabs Scribe v2** — speech-to-text with word times, called only by the `transcribe-chunk` Edge Function (the default since 29 Oct 2026; `TRANSCRIBE_PROVIDER=openai` still selects OpenAI's `whisper-1` until it shuts down on 26 Feb 2027, but only with consent text naming OpenAI)
- **Anthropic Claude** (`claude-opus-5-5`) — notes and clarifications, called only by the `summarize` and `assistant-chat` Edge Functions
- **expo-audio / expo-print** — recording and playback on the iPhone (since step 5.1–5.4's iPhone half; expo-av stays only for builds without expo-audio and the web's player), and PDF export

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

Formula cards (step 4.7c, `schema/formulaCard.ts`, also in `bridges/blocks.ts`) come from the formula library, `src/editor/formulas/library.ts` (the entries: LaTeX, plain text, legend, search words); the list is `components/editor/FormulaLibrary.tsx` on both devices, and the format command `{ type: 'formulaCard', id }` inserts one. Callouts and cards share their Enter rule (`schema/boxKeys.ts`) and, with graphs, where an inserted box goes (`schema/placeBlock.ts`).

Graphs (step 4.7d, `schema/graph.ts`, also in `bridges/blocks.ts`) keep their data in the block (`graph/data.ts`: limits, reading typed numbers, what is left out); the form is `components/editor/GraphForm.tsx` (laptop `GraphPopover.web.tsx`, iPhone `iphone/GraphSheet.tsx`), the command `{ type: 'graph', … }`. The drawing comes from `src/lib/charts` (a separate module); `graph/charts.ts` is the only file that talks to it.

### Tabs (step 4.7b)

Each tab of a document is a `documents` row: `tab` is `notes`, `summary`, `transcript` or `t-<uuid>` for an added tab, with `title`, `position`, `deleted_at` and `kind` (migration `20261029151900_document_tabs`). `src/services/document-tabs.service.ts` lists them (`listTabs`, `orderTabs`: a lecture's three first and fixed) and adds, renames, moves and deletes them; on the iPhone these queue as `create_tab` and `tab_meta` under the tab's key (`fileId:tab`), before its edits. Content, versions and conflict copies work per row as before (`document.service.ts`); page setup is written to every tab. An edit that reaches a deleted tab brings it back, and a delete that arrives after a newer edit is dropped (`takeKeptTabs` / the session's `kept` say so once). The row is `components/editor/DocumentTabs.tsx` on both devices.

### Spreadsheet tab (step 4.7e)

A tab with `kind = 'sheet'`. Its row's content is one `sheetCell` block per cell that isn't empty (`src/lib/sheetDoc.ts`: the address is the block id; input, bold, `editedAt`, origin), so the text merge (`editor/docBlocks.ts`), the iPhone's queue, versions and Restore work on cells unchanged; no migration. Values are calculated on the device by the formula engine `src/lib/sheets` (merged from the `sheets-engine` branch; its index is the API; this step added `help.ts`, `context.ts` and `structure.ts` there). The screen is `src/components/sheet/`: `SheetTab.tsx` (the autosave's editor, selection, editing, pointing, fill, Undo, lines, clipboard), `SheetGrid.tsx` (the virtualised grid, presses by mouse or touch), `FormulaBar.tsx`, `FunctionHints.tsx`; the pure parts with their tests: `sheetDisplay.ts` (Excel's General rounding to the measured width), `sheetEditing.ts`, `sheetHistory.ts`, `sheetStructure.ts`, `sheetClipboard.ts`. Text is measured with a canvas on the laptop (`measure.web.ts`) and with `FontProbe.tsx` on the iPhone (`measure.ts`). The Chrome check is `sheets.mjs`.

### Names and the simplicity pass (before 4.6)

Every editor tool's name and shortcut is in `src/editor/toolNames.ts`, read by the laptop's tooltips (`components/editor/ToolTip.web.tsx`), the iPhone toolbar's long-press names and captions, the menus and VoiceOver; the bars drawn inside the document name their buttons with `editor/barHint.ts`. Menus take headings (`section` on `DialogButton`, `PopoverHeading`). `app/dev/editor-preview.tsx` (development only) draws the iPhone's keyboard toolbar and Page setup sheet in a browser for screenshots.

### Page view and zoom (step 4.5b)

Pages are drawn, never stored: `src/editor/page/pageView.ts` (in FormatBridge, so both editors) measures the document with no gaps and inserts each page gap as a widget decoration (a block between blocks, a line break inside a paragraph, a row in a table); `page/pageLayout.ts` is the pure rule set (widow / orphan, headings kept with the next line, page breaks), for the export (4.8) too. Zoom is CSS `zoom` on the editor. Each device keeps Pages / Pageless and its zoom in `lib/viewPrefs.ts`: the laptop's toolbar and ⌘+ / ⌘− / ⌘0 (`StudiplyEditor.web.tsx`, `FormatToolbar.web.tsx`), the iPhone's **…** → Print layout and a pinch (WebKit gesture events in the WebView, the `view` format command and state).

Since test D the pages sit on the app's gradient (the editor is transparent; a layer behind the text draws each white page) and follow the document's **page setup** (`page/pageSetup.ts`; `documents.page_setup`, saved by `setPageSetup` in `document.service.ts`, queued as `document_page_setup` on the iPhone; the dialog is `components/editor/PageSetupDialog.tsx`; the default for new documents is in `profiles.preferences.pageSetup`).

Recording in chunks (step 5.1, the spike): `src/lib/chunkRecorder.web.ts` rotates the browser's MediaRecorder every 30 s on one microphone stream, so each chunk is a standalone WebM / Opus file.
- **Two modes:** restart (stop and start in one task) or overlap (the next chunk starts `overlapMs` before the previous one stops).
- **Order:** chunks are handed over in their order.
- **The iPhone's:** `nativeChunkRecorder.ts` (expo-audio, below); the spike's `chunkRecorder.ts` stays a stub (the spike screen is the web's).
- **The dev screen:** `/dev/recording-spike` (development only) uploads each chunk through `createSourceFile` and `transcribe-chunk` and shows the live transcript.
- **The check:** `spike.mjs` measures the joins with a synthetic signal.

The recorder service (step 5.2), `src/services/recorder/`, records with 30-second chunks overlapping by 500 ms. **`service.ts` is the same on every platform**:
- `start` / `pause` / `resume` / `stop`;
- `recover`, `continueRecording` and `finish`;
- `snapshot`, which gives the chunks and the live transcript.

**What `service.ts` does:**
- **Saves on the device first:** every chunk, plus a piece of the current chunk every second.
- **Sends through two `createSyncQueue` lanes:**
  - `upload_chunk` (`sendRecordingChunk`, shared with the iPhone's queue);
  - `transcribe_chunk`, queued once the chunk is uploaded.

  A refused transcription is noted on its chunk and blocks nothing.
- **Recovers:** a recording nobody holds any more has its unfinished chunk rebuilt from its pieces, and is marked interrupted.

**The other files:**
- **The overlap de-duplication** is one shared, pure module without imports, `supabase/functions/_shared/transcriptJoin.ts`, so the app and the Edge Functions can both use it:
  - `joinTranscript`: the live transcript;
  - `joinSegmentRows`: the full transcript.

  Each chunk's raw text stays in `transcript_segments` as transcribe-chunk stored it; the duplicates are removed where the transcript is assembled.
  - **In the app:** `segmentsToTranscript` (`lib/cloudRows.ts`), which the Transcript tab, notes and clarifications read.
  - **On the server:** `lectureTranscript` (`_shared/lecture-content.ts`), which summarize and assistant-chat read.
  - **The segments it reads** carry their chunk's place: `withChunkPlaces`, in `transcript.service` and the iPhone's transcript pull.

  Rows may come in any order; a missing chunk leaves its neighbours alone.
- **`platform.web.ts`:**
  - MediaRecorder (`chunkRecorder.web.ts`, with pause and one-second pieces); the microphone is closed while paused and opened again on Resume;
  - IndexedDB `studiply-recorder` (the recordings, the chunks, the pieces, the two lanes);
  - Web Locks (who holds a recording, and one tab sending).
- **`platform.ts`** (the iPhone; both platforms' service is built by `build.ts`):
  - `lib/nativeChunkRecorder.ts`: two expo-audio recorders in turn, 30-second .m4a chunks overlapping by 500 ms (if iOS refuses two at once, it restarts instead and logs it once); pause, metering, a recorder stopped by iOS reported as a lost microphone;
  - each finished chunk moved to the app's documents (`recorder/`) and deleted once uploaded; the recordings and the two lanes in AsyncStorage (`nativeStore.ts`);
  - recording with the screen locked: app.json's expo-audio plugin (`enableBackgroundRecording`) and `lib/audioSession.ts`;
  - **recovery** keeps every finished chunk; the one being recorded is lost (at most 30 s: an unfinished .m4a can't be read, so there are no pieces);
  - `supported` is false in a build without expo-audio's native module (`lib/expoAudio.ts`).

**The dev screen:** `/dev/recorder` (development only; Chrome check `recorder.mjs`).

**The recording screens (step 5.3)** sit on top of it.
- **`services/recording-flow.ts`:** the pure flow, tested with fakes:
  - **Start:** the microphone first, consent, the lecture, its status, the recorder;
  - **Stop:** waits until every chunk is sent and the live transcript has caught up, then `transcribing`;
  - **interrupted recordings:** Continue or Finish.
- **`recording.service.ts`:** the app's flow, with its real parts.
- **The shell (`app/(main)/_layout.tsx`):**
  - `RecordingStrip` (laptop) and `RecordingPill` (iPhone layout) show on every screen;
  - `RecordingHost` runs the recovery at sign-in and the browser's "leave?" question while recording.
- **The iPhone recording screen** is the lecture's own document: `doc/[id].tsx` draws `RecordingPhoneHeader` and `RecordingPhoneBar` around My notes when its lecture records at phone width.
- **`hooks/useRecorder.ts`:**
  - `useRecorder()` gives the clock and the waveform, 10 times a second, for the strip and the header only;
  - `useRecorderState()` gives just the state, for screens that must not redraw that often;
  - `useRecordingFlow()` gives the saving and interrupted states.
- **The setup's folder picker:** `utils/folderTree.ts`.

**The iPhone** goes through the same flow and screens. `record/active` (expo-av) is kept only as the fallback for a build without expo-audio's native module.

**Playback** (`lib/audioPlayer.ts`) uses expo-audio's player on the iPhone: expo-av's audio mode would switch the session away from recording and stop the recorder. The player leaves the session to `lib/audioSession.ts` (the recording mode while recording; iOS then plays through the earpiece unless headphones are in). The web's player is `audioPlayer.web.ts`.

**Marks (step 5.5)** are linked mark chips in the lecture's My notes (`editor/schema/markChip.ts`: `markId`, kind, level, `ms`, note).
- **Making one:** the strip's and the bar's buttons open `components/recording/MarkPanel.tsx` (state in `markPanelState.ts`, the slider in `LevelSlider.tsx`, the words in `utils/markHints.ts`).
- **Where the chip goes:** Save mark puts the chip in through `services/mark-placement.ts`. That's the open editor's `placeMark` (the document screen registers while focused), or otherwise a new stamped last line saved into My notes.
- **The `marks` rows follow My notes:** `services/marks.service.ts` runs after each save of the notes tab, beside `note-lines.service`. A chip deleted by typing deletes its row; Undo brings it back.
- **Tapping a linked chip** opens the same panel inside both editors (`BlockMenus.web.tsx`, `iphone/MarkSheet.tsx`).

Earlier notes (step 4.9) live in `src/services/legacyNotes`:
- **`convert.ts`** is pure: a `summaries` row in format legacy-note-v1 → the Summary tab's document. Block ids come from section and place, origins from the note's section meta, and headings are in the lecture's language.
- **`run.ts`** converts only when the tab has no document, and only reads the old row.
- **`index.ts`** wires the app's services (`openDocument`, `getNoteResultBySession`, `getSourceFiles`, `saveDocument`).

The document screen calls it when a lecture's Summary tab opens with no document. There's no background pass, no migration and no server script.

The PDF export (step 4.8a) lives in `src/editor/export`:
- **`printPages.ts`** runs in a page (the laptop's own, or the iPhone's WebView). It puts each tab in a hidden editor with the document's page setup, Pages on, at 100 % and no gap. The page view lays it out (`pageLayout.ts`, so the PDF's pages are the page view's). Then each page becomes a box of the paper's size holding its blocks where they were placed, with numbers through the file.
- **`sheetTable.ts`** turns a sheet tab into a table of its values.

The dialog is `components/editor/ExportPdfDialog.tsx` (the document menu's Export PDF…). `services/export.service.ts` (`exportDocumentPdf`) prints on the laptop (the browser's print window, Save as PDF; the last print document is `window.studiplyPrint` for the Chrome check). On the iPhone it asks `editor/PdfRenderer.tsx`, the editor bundle in a small WebView of its own, through the export bridge (`bridges/export.ts`). It then writes the PDF with expo-print at the paper's size in points (the pages drawn at 3/4, as expo-print lays CSS px out as points) and opens the share sheet.

The writing tools (step 4.7) live in `src/editor/writing`, inside the shared editor, so both devices use the same code:
- `find.ts` is the find & replace plugin: the matches, the highlights and the `find` format command. Replace all is one transaction.
- `counts.ts` counts words and characters the way Google Docs does.
- `outline.ts` lists the title and headings and finds the section the cursor is in.

The counts and the outline travel in `formatState`, so the iPhone gets them over FormatBridge. A jump is the `outline` format command. ⌘F / ⌘⇧H / ⌘⌥A are FormatBridge shortcuts that send DOM events, which the laptop opens its tools on. The laptop's find bar is `editor/FindBar.web.tsx`; the status line and the outline column are in `StudiplyEditor.web.tsx`. The iPhone's tools are `editor/iphone/FindBar.tsx` and `OutlineSheet.tsx`. Both devices draw the outline with `components/editor/OutlineList.tsx`. The document menu opens a tool through the editor handle's `tool(...)`.

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
