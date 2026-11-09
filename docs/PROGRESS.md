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
- [x] 1.7 — The app uses the backend (switch services, remove EXPO_PUBLIC keys, prove bundle clean) — part A (local) done 25 Oct 2026; part B (remote project) done; Lea's real data uploaded to the remote on 26 Oct (step 1.9)
- [x] 1.8 — Offline cache and sync (SQLite cache + conflict rule) — done 25 Oct 2026 (iPhone; web stays online-only)
- [x] 1.9 — Move existing data (one-time idempotent migration) — built 26 Oct 2026; the real upload of Lea's own data is done by Lea (steps in the decision below)

## Phase 2 — App shell (`phase-2-shell`)
- [x] 2.1 — Navigation and layout (iPhone tabs + web 3-column, responsive) — done on `phase-2-shell`, matching `docs/design/` (decision below)
- [x] 2.2 — Real data in the shell (top bar, sidebar sections, Record button) — done on `phase-2-shell` (decision below)
- [x] 2.3 — Look and feel (colors/typography, dark mode, Dynamic Type, touch targets, VoiceOver, web shortcuts) — built on `phase-2-shell`; Lea's iPhone/Chrome test and the merge into main are pending (decision below)

## Phase 3 — Library like Finder (`phase-3-library`)
- [x] 3.1 — Spike: drag and drop (web + iPhone) — Lea chose Option B (the browser's drag) on the laptop and Option A (gesture) on the iPhone; the iPhone drag is smooth, the haptic works
- [x] 3.2 — Library grid (tiles, sort, breadcrumb, inline rename)
- [x] 3.3 — Moving files (drop targets, cycle protection, undo, tests) — with Lea's 26 Oct note (one combined Move to… for a lecture's photos and PDFs; "Save a copy to library…"); tested by Lea on the iPhone (drag onto folders and the breadcrumb, Undo, haptic) and in Chrome, plus the title's menu
- [x] 3.4 — Menus (empty-space + item context menus), uploads as library files, Cut / Copy / Paste, keyboard — waiting for Lea's test; migration `20261026090300` on local and remote
- [x] 3.5 — Trash, stars, recent, search — tested by Lea in Chrome and on the iPhone; on the remote since 26 Oct (migrations `20261026090400`–`090700`, `purge-trash` deployed, `CRON_SECRET` and the Vault secrets set, the manual run answered 200)
- [x] 3.6 — Settings in sections (laptop two columns as desktop-05, iPhone list → pages; existing settings moved) — waiting for Lea's test; Phase 3 merges after it

## Phase 4 — Editor like Google Docs (`phase-4-editor`)
- [x] 4.1 — Development build on iPhone (EAS profiles, device registration) — tested by Lea on 27 Oct: installed, reloads on code changes, records with the screen locked
- [x] 4.2 — Spike: one editor, two platforms (TenTap + Tiptap, shared schema, timestamp chip) — passed on the iPhone 28 Oct after three fixes (no new build); report and recommendation in Decisions
- [x] 4.3 — Documents that save themselves (lecture documents with 3 tabs + blank documents anywhere, ProseMirror JSON, autosave, offline writing on iPhone with sync, versions, block origin) — passed Lea's iPhone test 28 Oct, after the restore fix (`c0287ac`)
- [x] 4.4 — Formatting toolbar (web full + iPhone keyboard toolbar; paste from Google Docs/Word keeps formatting) — passed Lea's test 28 Oct; alignment then made visible (four buttons on the laptop, a labelled row in Aa) and spelled "Centre"
- [ ] 4.5 — Inserting things (links, images, tables, KaTeX, comments) — checkpoint A (colour picker, links, tables, the one-row toolbar) built 28 Oct, passed after the table rework; checkpoint B (photos, formulas, comments) built 29 Oct; after test B, checkpoint C (photo layout, the selection bar, formulas as you type, iPhone photo handles and toolbar) built 29 Oct, passed; after test C, the iPhone toolbar without "+" and the typing shortcuts; then 4.5b (page view and zoom)
- [ ] 4.5b — Page view and zoom (pulled forward from 4.7, Lea after test B) — built 29 Oct (checkpoint D, with the iPhone toolbar change and the typing shortcuts); after test D, checkpoint E (pages on the gradient, page setup per document, pulled forward from 4.7) built 29 Oct, passed (test E); a simplicity pass of the editor's look before 4.6, OK'd from screenshots on 29 Oct
- [ ] 4.6 — Studiply blocks (callouts, timestamp chips, mark chips) — built 29 Oct; laptop screenshots OK'd; the iPhone check fixed (it had sent the document after Change to / Remove) and the Mark icon a flag; committed; then the selection bar's Callout ▸ / Mark ▸ / Time ▸ (built 29 Oct; screenshots OK'd by Lea, committed); then test G
- [ ] 4.7c — Formula library (finance first; a formula card with a line for each letter, in English) — built 29 Oct; screenshots OK'd by Lea, committed; then test H
- [ ] 4.7d — Graphs I build (bar, line, pie, scatter from a small data table) — built 29 Oct with the charts module (`charts-engine` merged), decimals with a comma in Spanish; screenshots and checks approved (Lea's advisor), committed; then test I
- [x] 4.7b — Tabs in every document (29 Oct; Transcript stays editable) — built and checked: test:db 329, `npm run check`, Chrome `tabs.mjs` 8/8 and the eight suites, screenshots approved; committed locally. Still to do by Lea: test J on the iPhone, and the migration `20261029151900_document_tabs` on the remote
- [x] 4.7e — Spreadsheet tab — built and checked in Chrome (sheets.mjs 16/16, all ten suites, npm run check, test:db; Lea's run 30 Oct), committed locally. Still to do by Lea: the iOS Simulator check and test K. History: the formula engine from the `sheets-engine` branch, merged as 4586997; plan approved by Lea's advisor 29 Oct (help lines added inside `src/lib/sheets`; no sheet Undo; no migration). Checkpoint 1 built, waiting for the advisor's review: cells stored as blocks of the tab's row and merged cell by cell through the text merge, the laptop grid (A–Z × 1–1,000) with the formula bar, bold, Excel errors, versions; Jest passing; Chrome `sheets.mjs` (checkpoint-1 steps) installed by the advisor: 5/9 on its first run, then 7/9, then 9/9. Fixed: the grid didn't redraw after a load (app); the check clicked cells scrolled off screen, and compared PMT's text and a hand-computed 1347.14 instead of Excel's results within rounding (check). After the screenshot review: numbers are rounded to the cell's measured width as Excel's General does (898.0894 / 898.09 / 898.1, scientific only where Excel would, ### when nothing fits), never cut with "…". Checkpoint 2a built (clicking and dragging references, autocomplete with the bold help line, the fill handle) and approved by the advisor (sheets.mjs all steps). Checkpoint 2b built and approved: Undo / Redo, insert / delete rows and columns (the reference helper `src/lib/sheets/structure.ts`), copy / cut / paste with tab-separated text (bold on whole lines only on filled cells, the full value on the clipboard: accepted). `sheets.mjs` 15 steps: 14/15 on the advisor's first run (a click straight after the grid scrolled hit the cell that was there before: the grid now reads its scroll offset from the page), then 15/15. Checkpoint 3 (the iPhone) built, waiting for the advisor's review and Lea's test K in the iOS Simulator: the bar on the keyboard, taps add references (the dot drags a range), the list above the bar, the fill handle by finger, Undo / Redo, long-press menus (rows and columns; Copy / Cut / Paste), the number font measured on the device; offline Jest `offline-sheet.test.ts`; `sheets.mjs` step 16 (390, touch) written, to be installed. Then the commit of 4.7e
- [x] 4.7 — Writing tools (find & replace, word count, heading outline; page setup already built in 4.5b) — built and checked 30 Oct: Jest and `npm run check`; Chrome `writing.mjs` 19/19 and every suite passing (flows 19, look 12, layout 9, sheets 16, blocks 8 on Lea's side; writing, pages, formatting, inserting, documents, tabs on Claude's); the iPhone bundle rebuilt by Lea; step approved, committed locally. Still to do by Lea: test L
- [ ] 4.8 — Import and export (.docx import; PDF and .docx export), split by Lea's advisor on 30 Oct:
  - [x] 4.8a — PDF export (no new dependency) — built and checked 30 Oct: Jest and `npm run check` (1736); Chrome `export.mjs` 9/9 and all twelve suites passing (flows 19, documents 8, look 12, layout 9, formatting 12, inserting 30, blocks 8, pages 13, tabs 8, sheets 16, writing 19, export 9; the advisor's full run); the iPhone bundle rebuilt; the advisor accepted the four small calls; committed locally. On the way, the page view's measuring scale was fixed (A4 pages started about 1 px off their top margin). Still to do by Lea: test M on the iPhone
  - [x] 4.8b — .docx import and export — **done on the web, verified 30 Oct** (by Lea and her advisor): `npm run check` (1908), `check:bundle` passing (iOS bundle 12.6 MB; the "before" size wasn't measured, so the libraries' added size isn't known), all twenty-two Chrome suites (docx 13/13, library-dnd 11/11; notes-live flaky, a check timing bug fixed after). Committed locally. **Built on `phase-5-recording`** (not `phase-4-editor`). Still to do by Lea: test O on the iPhone. History: plan approved and libraries installed by Lea (mammoth 1.13.0, BSD-2-Clause; docx 9.15.0, MIT; jszip 3.10.2 added to package.json by Lea). Lea's first `docx.mjs` run: 6/11 (the laptop's formula pictures failed: fixed; the rest check bugs, fixed in the check). Lea's second run: 11/12 (the spike's inline formula; the check's screenshot cut it). Formula pictures now cropped to KaTeX's own box and lowered onto the line in Word; every photo that can be transparent is drawn on white (toJpeg, both devices). `npm run check` (1908). Lea's third run (server restarted, bundle rebuilt): 12/13, the transparent logo white everywhere; only the spike's strict pixel overlap (0.560) failed, on identical-looking pictures: the check now compares at device scale 2, ink within 1 px, the same 0.7. Fourth run: 13/13
- [x] 4.9 — Convert old notes (idempotent) — plan approved by Lea's advisor 30 Oct (headings in the lecture's language; highlights as a quote plus Added context; Attachments with the photos shown; no background pass, only when the Summary tab opens; the old notes view unchanged). Built and checked 30 Oct: Jest `legacyNotes.test.ts` (20) and `npm run check` (1756); Chrome `notes.mjs` 8/8 and `documents.mjs` 9/9 (updated for the converted Summary tab, plus the earlier-notes card when the save fails), and all thirteen suites passing on the advisor's full run; committed locally. Still to do by Lea: test N, and the regenerate edge on her list (test N, item 5)

**Phase 4 status (30 Oct):** complete on the web (4.8b, the last step, verified 30 Oct and built on `phase-5-recording`), except:
- **Lea's iPhone tests:** G, H, I, J, K, L, M, N, plus the remote migrations listed under Things Lea must do.

Phase 5 started 30 Oct on `phase-5-recording` (5.1 and 5.2, web halves).

## Phase 5 — Recording with live notes and marks (`phase-5-recording`)
- [ ] 5.1 — Spike: recording in pieces (expo-audio + MediaRecorder, chunk joins) — **web half done** 30 Oct on branch `phase-5-recording`; the iPhone half waits for Lea's OK on expo-audio (1.0.16, MIT) and her phone.
  - **Built:** `src/lib/chunkRecorder.web.ts` (MediaRecorder rotated every 30 s, restart or overlap; chunks handed over in order); `/dev/recording-spike` (development only: uploads each chunk through the app's path to transcribe-chunk, live transcript).
  - **Checked:** Jest `chunkRecorder.test.ts` (4); Chrome `spike.mjs` 3/3 (the advisor's run, no paid calls: the joins measured with a synthetic signal, transcription answered in the page).
  - **Measured (Chrome, WebM / Opus):** restarting the recorder every 30 s loses audio at every join, **gaps of 56.0, 6.0 and 6.0 ms**. Overlapping by 500 ms leaves **no gap**: **overlaps of 464, 494 and 494 ms**.
  - **Decision (Lea's advisor, 30 Oct):** the web records with a **500 ms overlap**; the duplicated words at each join are removed in 5.2.
- [ ] 5.2 — Recorder service (start/pause/resume/stop, queue, recovery, tests) — **shared service + web done and checked** 30 Oct on branch `phase-5-recording`; the iPhone implementation waits for Lea's OK on expo-audio (`platform.ts` is a stub behind the same interface).
  - **Verified (Lea's advisor, 30 Oct):**
    - `recorder.mjs` 7/7 twice; `spike.mjs` 3/3, `flows.mjs` 19/19, `documents.mjs` 9/9 and the other suites pass;
    - `npm run check` 1792;
    - `npm run check:claude` against the local functions: real Anthropic, "All Claude checks passed", with summarize and assistant-chat on the shared join.
  - **Lea's deploy list** gains summarize and assistant-chat (Things Lea must do).
  - **Built:** `src/services/recorder/` (the service, shared; the web's MediaRecorder + IndexedDB + Web Locks; the iPhone's stub). It works like this:
    - **Saved on the device first:** every chunk, and the current chunk every second, in pieces.
    - **Two queue lanes on `createSyncQueue`:** uploads, and transcription once a chunk is uploaded. A refused transcription doesn't block.
    - **The live transcript:** in order, the 500 ms overlaps de-duplicated.
    - **Recovery:** the unfinished chunk is rebuilt from its pieces; Continue or Finish.
  - **Also built:** pause / resume and the pieces in `chunkRecorder.web.ts`; `sendRecordingChunk` / `chunkOnServer` shared with the iPhone's `upload_chunk`; `/dev/recorder` (development only).
  - **Checked:** Jest (23 new: chunk order and pause, the upload queue offline and online, transcription lanes, overlap de-duplication, recovery). Chrome `recorder.mjs` 7/7 (Lea, 30 Oct):
    - offline chunks uploaded 6.3 s after reconnecting;
    - the pause is clean;
    - the reload lost 13 ms.
  - **Decisions (Lea's advisor, 30 Oct):**
    1. **transcribe-chunk is unchanged:** each chunk's raw text stays as stored, and the overlap duplicates are removed where the transcript is assembled. Built:
       - the shared pure `supabase/functions/_shared/transcriptJoin.ts`;
       - `segmentsToTranscript` uses it (the Transcript tab and every full transcript in the app);
       - segments read with their chunk's place.

       8 more Jest tests: rows out of order, a missing chunk, unplaced segments.
    2. **The microphone closes on Pause** and reopens on Resume. `recorder.mjs` now asserts the track is stopped while paused.
  - **Found by Lea's run (5/7, a 52 ms "hole" at the pause join), fixed in the app:** the paused time ended when Resume was asked, not when the new recorder really started (a reopened microphone takes about 50 ms, which nothing records).
    - **The fix:** the paused time now runs from the last chunk's end to the next recorder's start, so the chunk after a pause starts exactly where the one before ended.
    - **Checks:** a Jest test with a slow-starting recorder. The installed `recorder.mjs` passes 7/7 (the pause join exact, 32967 → 32967 ms; the reload lost 0 ms). The new copy checks the joins with no tolerance.
  - **The summarize and assistant-chat functions** (`_shared/lecture-content.ts`) now assemble the transcript with the same shared module (local code; deploying is on Lea's list).
  - **Not yet:**
    - background audio in app.json (with expo-audio);
    - the recording screen (5.3).
- [ ] 5.3 — Recording screen (iPhone + laptop strip) — **web (laptop + the 390 px layout) done and checked** 30 Oct on branch `phase-5-recording`; the iPhone screen waits for expo-audio (until then the iPhone keeps `record/active`).
  - **Verified (Lea's advisor, 30 Oct):** `npm run check` 1813; all sixteen Chrome suites pass:
    - recording 9, recorder 7, spike 3, flows 18, documents 9, notes 8;
    - look 12, layout 9, formatting 12, inserting 30, blocks 8;
    - pages 13, tabs 8, sheets 16, writing 19, export 9.
  - **Lea's list (suggestion):** a Pause button. DESIGN has none; the service supports it.
  - **Follow-up, 30 Oct.** Verified by Lea's advisor: `npm run check` 1830, all seventeen suites (recording 10/10 with the Pause step). The assistant panel's badge says "Paused" while paused.
    - **Pause (Lea: yes):** a small round ❚❚ / ▶ beside the timer, on the laptop strip and the iPhone header. While paused: "Paused · mm:ss", the red dot a ring, the clock and the waveform still, the microphone closed; the pill on other screens says Paused too. Added to DESIGN.md.
    - **The splash tagline typo:** "AUTOMATED STUDY" (it was AUTOMATIVE), and "Automated Study" on the onboarding screen.
    - **Checks:** recording.mjs gains a Pause step; the four checks that find the splash by its text get the new text.
  - **Setup (Lea's option A):** the course, then a folder in it (the course itself or any nested folder, with **+ New folder**); preset when opened from a course or folder.
  - **Start** (`recordingFlow`, `src/services/recording-flow.ts` + `recording.service.ts`):
    1. the microphone first;
    2. transcription consent (declined: it records without a live transcript);
    3. the lecture and its status `recording`;
    4. the recorder.

    The lecture's My notes then opens.
  - **The laptop:** the red strip under the top bar on every screen (`components/recording/RecordingStrip.tsx`): timer (back to the lecture), live waveform, Important · Confused · Exam · Photo board greyed out until 5.5 / 5.6, Stop & summarize. The assistant panel shows "Recording continues".
  - **The iPhone layout** (the web below 1024 px): the lecture's document becomes the iphone-02 recording screen (`RecordingPhone.tsx`):
    - header: back, timer chip, Course › folder, title, waveform;
    - My notes;
    - bottom bar: the marks and Photo greyed out, ✦ Ask greyed out until Phase 6, Stop & summarize.

    Elsewhere a red pill leads back.
  - **Nothing but Stop stops it:**
    - leaving the screen, the assistant, other documents;
    - reload / close asks first; an interrupted recording is offered with Continue / Finish;
    - sign-out asks to stop first;
    - a lost microphone pauses with "Microphone disconnected · Resume".
  - **Stop:** a confirm; saving waits for every chunk (offline: until the connection is back) and the live transcript (at most a minute); then `transcribing` with the length, then today's after-recording step.
  - **Recorder additions:** `level()` (Web Audio analyser) and the microphone-lost pause.
  - **BUILD-PLAN feature table:** the laptop needs internet only to start.
  - **After Lea's run (recording.mjs 6/8), fixed:**
    1. **Truly disabled:** the marks, Photo board and ✦ Ask now use `disabled` + `aria-disabled` (react-native-web 0.21).
    2. **Equally quiet:** on the laptop all four disabled buttons have one look.
    3. **The 390 recording screen as iphone-02:** the title once (header), My notes pageless under a "MY NOTES" label, without the web toolbar card, page sheets or word-count line (`plain` editor prop; the iPhone keeps its keyboard toolbar; Print layout untouched for later). *Replaced on 30 Oct at Lea's request by the normal document screen (see after 5.5).*
    4. **DESIGN.md:** the old "recording screen stays dark" line corrected.
    5. **A tab closed during "Saving…":** the lecture is handed off in the background on the next load (`recordings()`, `settleStopped`), never left `recording`.
  - **Checked:**
    - Jest: 20 new (recording flow, folder picker, clock and saving text, microphone lost);
    - installed `recorder.mjs` 7/7, `documents.mjs` 9/9, `layout.mjs` 9/9 (my runs);
    - new `recording.mjs`, and `flows.mjs` / `ai-flow.mjs` updated for the new web flow: for Lea to install and run.
- [ ] 5.4 — Live notes with timestamps — **web (laptop + 390 px) done and checked** 30 Oct on branch `phase-5-recording`; the iPhone part is in the shared code and the rebuilt `editorHtml.js`, its device check waits for expo-audio and an EAS development build.
  - **Verified (Lea's advisor, 30 Oct):** `npm run check` 1830; all seventeen Chrome suites pass (notes-live 6/6 included).
  - **Lea, separately:** `eas.json` gained a `development-simulator` profile (commit d9bfbc2), for the iOS Simulator builds.
  - **Stamps** (`editor/schema/liveStamps.ts`, both editors): while the lecture records (or pauses), a line of My notes gets a timestamp chip at its first character, with the recorder's time (Lea: first character; nothing before Start or after Stop).
    - **Only lines that were empty:** stamped lines, earlier lines and empty lines get none.
    - **Paste** stamps each new line.
    - **Undo** takes the chip away.
    - **"- ", "# ", "[] "** still work on a stamped line (`typingShortcuts` skips a leading stamp).
    - **Laptop:** a `recordingClock` prop.
    - **iPhone:** `LiveStampsBridge` (native tells the WebView the time twice a second); needs `npm run editor:build`.
  - **`note_lines`** (no migration: the table, trigger, indexes and RLS exist since `20261023155314`):
    - **What:** `editor/noteLines.ts` projects My notes (time, text without the chip, the line's JSON with its formatting, position; list items `<list id>#n`).
    - **When:** `note-lines.service.ts` writes it after each save of a lecture's notes tab: the laptop's save (a failure retries with the next save) and the iPhone's queued `document_edit` (retried with it).
  - **Playing:** a chip plays during the recording on the web from the browser's own copy (`recorder.playback()`: chunks not yet uploaded, uploaded ones from Storage, the chunk being recorded from its pieces). A quiet one-time line "Use headphones: the recording is still running." is shown. At a chunk join playback goes on past the 500 ms overlap (also after the recording).
  - **Checked:** Jest, 16 new (live stamps 7, note lines 3 + 3, playback and overlap 2, recorder playback 1). Chrome `notes-live.mjs` is for Lea to install and run.
  - **After Lea's run (notes-live 5/6, "playing again"), fixed:** a tap on a chip only played when the selection changed (since 4.6), so the chip already selected (tapped again after closing the player) did nothing, on both devices. Seeking inside the chunk being recorded was fine (the first play passed).
    - **The fix:** a tap on a chip is now counted by the chip extension itself (`CHIP_TAP`) and plays every time; the selection that follows doesn't play twice.
    - **Checked:** Jest 1 new; `notes-live.mjs` 6/6 and `blocks.mjs` 8/8 (my runs).
    - **The iPhone bundle** needs `npm run editor:build` again.
- **5.1–5.4 + Pause, iPhone half (expo-audio) — built 30 Oct, waiting for the device checks.** expo-audio ~1.1.1 and expo-asset ~12.0.14 installed by Lea's advisor (Lea: "yes expo-audio").
  - **Verified (Lea's advisor, 30 Oct):** `npm run check:bundle` passes (no key, secret or SQLite where it mustn't be); `npm run check` 1839; all seventeen Chrome suites pass.
  - **Waiting for:**
    1. the EAS builds (`development-simulator` and `development`; expo-audio has native code, so Expo Go and today's dev build can't run it);
    2. the iOS Simulator list (`docs/recording-test/DEVICE-CHECKS.md`);
    3. Lea's 15-minute locked test on her iPhone, with the click track: `docs/recording-test/` (`INSTRUCTIONS.md`, `click-track.html`) and `.claude/skills/web-check/scripts/joins.mjs`.
  - **Known issue:** a crash on iOS loses the chunk being recorded (see Known issues).
  - **Recorder** (`src/lib/nativeChunkRecorder.ts`, pure; `src/services/recorder/platform.ts`):
    - two expo-audio recorders in turn: 30 s chunks overlapping by 500 ms, the next one prepared ahead;
    - **if iOS refuses two at once:** it falls back for good to restarting (a short gap at each join) and says so once in the Metro log ("iOS refused two recorders at once");
    - each finished chunk is moved to the app's documents (`recorder/`), kept in AsyncStorage (`nativeStore.ts`) and uploaded through the same two queue lanes as the web; the file is deleted once uploaded;
    - pause / resume (the chunk ends, the microphone is let go), metering for the waveform, a recorder stopped by iOS (a call) pauses as "Microphone disconnected";
    - **crash recovery keeps every finished chunk; the chunk being recorded is lost (at most 30 s):** an .m4a being written can't be read before it's finished, so the iPhone has no one-second pieces like the web.
  - **Background with the screen locked:** app.json's expo-audio plugin (`enableBackgroundRecording`, `microphonePermission`); the audio session is set for recording in `src/lib/audioSession.ts`.
  - **Screens:** the iPhone now uses the 5.3 recording screen and the 5.4 live stamps (shared code). `record/active` (expo-av) stays only as the fallback for a build without expo-audio's native module (today's dev build, until rebuilt).
  - **Playback:** expo-av and expo-audio did fight over the iOS audio session (expo-av's `setAudioModeAsync` switches the session to playback, which stops expo-audio's recorders: a chip tapped during the lecture would have stopped the recording). `src/lib/audioPlayer.ts` now plays through expo-audio's player on the iPhone (expo-av only in a build without it); the web's player is `audioPlayer.web.ts`, unchanged. While recording, iOS plays through the earpiece unless headphones are in (the headphones hint covers it).
  - **Checked:** Jest 9 new (`nativeChunkRecorder.test.ts` 7: order, overlap, refusal fallback, pause, lost, level, after a crash; `nativeRecovery.test.ts` 2: killed mid-chunk offline on the AsyncStorage store, then pause); `npm run check` 1839; installed `recorder.mjs` 7/7, `recording.mjs` 10/10, `notes-live.mjs` 6/6 (the web unchanged).
  - **Not yet checked:** everything on a device (the Simulator and iPhone lists in `docs/recording-test/DEVICE-CHECKS.md`; the locked test in `docs/recording-test/INSTRUCTIONS.md`).
- [x] 5.5 — Marks with a 1–10 level — **done and checked on the web 30 Oct** (laptop, 390 px; the iPhone in the shared code) on branch `phase-5-recording`.
  - **Verified (Lea's advisor, 30 Oct):** `npm run check` 1855; all eighteen Chrome suites pass (marks 10/10, recording 10/10 with the updated copy). `editorHtml.js` rebuilt by the advisor.
  - **The panel made to match the mockups (Lea, 30 Oct, after comparing). Verified 30 Oct** by Lea's advisor: `npm run check` 1908, all twenty-two Chrome suites; the composites match desktop-01 and iphone-03 (seen by Lea). Committed locally with `marks.mjs` and `notes-live.mjs` (it waits until the editor has the focus before typing).
    - **Laptop (desktop-01):** one slim row the window's width under the strip (time and question · the slider with "1 · …", "n / 10", "10 · …" above it · the salmon note · Cancel / Save mark), the hint below.
    - **iPhone and below 1024 px (iphone-03):** a sheet with a drag handle, a large "n / 10", the ends under the slider, the hint in a grey box, one full-width Save mark; closed by dragging it down or tapping above (`components/DragSheet.tsx`, also the editor's chip sheet).
    - **Slider:** accent track and thumb, no stop dots.
    - **Words:** the ends in lower case.
    - **Checks:** `npm run check` passes; `marks.mjs` updated (layout assertions, both ways of closing the sheet, a composite of the screenshots beside the mockups), to be installed and run by Lea.
    - **Lea's run: 9/11.**
      - **App, the sheet's drag on the web:** a mouse drag selected the sheet's text instead of closing it. It now drags by the handle's strip with pointer events (the iPhone keeps its touch drag).
      - **App, the Exam question:** it wrapped in the laptop row. The column is wider, one line.
      - **Check, the "old" Exam sheet:** a screenshot left from an earlier run stood in for the one the failed step never took. The composites now use only the run's own screenshots.
      - **Check, the Stop failure:** it followed from the sheet left open at 390 px. The step now closes it and restores the width whatever happens.
      - **Check, the focus ring:** the ring in the laptop screenshots came from the check's keys. It is Chrome's keyboard-only ring (`:focus-visible`), so the screenshot levels are now set by a click, and the check asserts no ring on opening or after a click and a ring with the keyboard.
      - **My run of the installed copy with the app fixes: 11/11.**
  - **On Lea's device list** (`docs/recording-test/DEVICE-CHECKS.md`, with the EAS build): the sheet over the keyboard, the light haptic on Save mark, VoiceOver adjusting the slider, a mark while writing and with the keyboard down, a mark made offline (its row arrives once the edit is sent).
  - **Decisions (Lea's advisor, 30 Oct):**
    1. A: a chip deleted by typing deletes its mark when My notes is saved; Undo brings it back.
    2. No marks outside a recording.
  - **The panel** (`components/recording/MarkPanel.tsx`, `LevelSlider.tsx`, `utils/markHints.ts`): inline under the laptop's strip, a small sheet on the iPhone and below 1024 px.
    - It shows the time of the press, the mark's question, the 1–10 slider with labelled ends (starting at 5; drag, tap, VoiceOver, arrow keys), the optional note (500 characters), the one-line hint from SUMMARY-SPEC by band, and Cancel / Save mark.
    - Save gives a light haptic on the iPhone (expo-haptics, already installed).
    - The mark buttons are enabled, in the chips' colours (new `markButton` tokens). Photo board stays disabled until 5.6.
  - **The chip:** 4.6's `markChip` gains `ms` and `note`, plus `markId` for these marks.
    - `placeMark` puts it at the end of the line being written, or on a new last line stamped with its time.
    - Placement goes through the open editor (`services/mark-placement.ts`; the document screen registers while focused), or is saved straight into My notes from another screen.
    - Tapping a linked chip opens the panel (Done, Remove mark with Undo) on both editors, also after the recording.
  - **The rows:** `services/marks.service.ts` `syncMarks` runs after each save of a lecture's My notes, beside `syncNoteLines`, on the laptop's save and the iPhone's queued edit (offline: when it's sent).
    - Each linked chip is its row; a row whose chip is gone is deleted; a chip copied from another lecture is left to that lecture.
    - No migration. The `marks` table's comment is updated in `20261023155314_lecture_data.sql` (comment lines only; nothing to push).
  - **Checked:**
    - `npm run check`: 151 suites, 1855 tests. 16 new: `marks.test` 4, `linkedMarks.test` 7, `markHints.test` 5; `studyBlocks` updated.
    - Installed `blocks.mjs` 8/8 (the first run failed once on the 4.6 playback step, +10 s; then passed) and `notes-live.mjs` 6/6.
    - New `marks.mjs` and an updated `recording.mjs` (the marks are no longer greyed out): for Lea to install and run.
  - **The iPhone bundle** needs `npm run editor:build` (the chip's attributes, `placeMark` and the chip's state cross the bridge).
- **Lea's request, 30 Oct — the phone recording screen is the normal document** ("the document where I am doing notes is the same as the document one"). Done; verified by Lea's advisor (`npm run check` 1855, all eighteen Chrome suites: recording 10/10, pages 14/14).
  - **What changed:** on the iPhone and the web below 1024 px, the recording header and the bottom bar now surround the lecture's normal document screen. That means its tabs (any can be opened while recording), the ⋯ menu (in the header), the save status, the formatting toolbar, the student's own page view and the status line.
  - **The title shows once:** in the header. The page keeps its meta line (`DocumentHeader showTitle`).
  - **Removed:** the simplified "MY NOTES" card and the editor's `plain` mode; it was replaced, not kept as an option.
  - **Unchanged:** live stamps (My notes only), marks (from another tab they go into My notes), Pause and the pill.
  - **Checked:** `npm run check` 1855; installed `marks.mjs` 10/10 and `notes-live.mjs` 6/6 on the new layout. An updated `recording.mjs` checks the new 390 screen, for Lea to install.
  - **Verified (Lea's advisor):** `recording.mjs` 10/10 after its two check fixes (the compact toolbar at 390; back to 1280 even when the 390 step fails); the title's accent line removed when there is no title.
- **Pages at Fit on the web at phone width — fixed 30 Oct** (it was on Lea's look-later list as "a sideways scrollbar under the page at 390 px in Pages view"; with typing it clipped the meta line). Verified by Lea's advisor (pages 14/14 with the new 390 px step, recording 10/10).
  - **The cause:** Fit had a floor of 50 % (`effectiveZoom`, and the editor's `clampZoom`). At 390 px the sheet has about 302 px, so an A4 page needs 38 %; at 50 % it was drawn about 397 px wide. The page area overflowed sideways, and typing scrolled it to keep the caret in view, cutting the meta line ("h · Lecture …") and pushing the page against the left edge.
  - **The fix:** Fit may go down to 25 % (`FIT_MIN_ZOOM`). The student's own zoom steps stay 50–200 %, so zooming in beyond Fit still scrolls sideways, as it should. The page now fits the width with equal margins, and nothing scrolls sideways.
  - **Also:** on the web below 1024 px in Pages, the document's header sits on the gradient above the sheet but was drawn in the white page's colours. It now takes the gradient's colours (the same rule as the laptop and the iPhone's Print layout); this showed as a grey meta line in dark mode.
  - **Checked:** Jest updated (`viewPrefs` Fit at 302 px → 38 %, the floor 25 %; `pageView` zoom 25–200 %); `npm run check` 1855; the installed `recording.mjs` 10/10, run by me, with screenshots `rec-phone-390-typed` and `-dark`.
  - **New assertions:** `pages.mjs` gains a step at 390 px outside a recording (light and dark, opened and after typing): Fit below 50 %, no overflow, not scrolled, equal margins, the meta line whole. `recording.mjs` checks the same at 390 during the recording.
- [x] 5.6 — Board photos — **done and checked on the web 30 Oct** (laptop, 390 px; the iPhone in the shared code) on branch `phase-5-recording`.
  - **Verified (Lea's advisor, 30 Oct):** `npm run check` 1865; all nineteen Chrome suites pass (photos-live 8/8, recording 10/10, marks 10/10). `editorHtml.js` rebuilt by the advisor.
  - **The first photos-live run (5/8) failed in the check, not the app:** it counted ProseMirror's empty `ProseMirror-separator` image (added after a line that ends with a photo) as a photo that never loaded. The check now looks only at Studiply's photo frames.
  - **On Lea's device list, first and the riskiest:** the camera during a recording never stops it (`docs/recording-test/DEVICE-CHECKS.md`).
  - **`src/services/mark-placement.ts`** (a forwarder after the generalisation) was moved to `_to_delete/` by Lea's advisor (Lea's rule: files are moved, never deleted). `_to_delete` is excluded in `tsconfig.json` and `eslint.config.js` and is kept out of git locally.
  - **Decision (Lea's advisor, 30 Oct):** A. The laptop greys out Photo board offline with "Photos need a connection on the laptop"; the recording goes on (the web is online-only since 1.8).
  - **No new dependency, no migration.** Reused: expo-image-picker (camera text already in app.json), 4.5's `addDocPhoto` / photo node / `upload_doc_photo` queue, and the `media` table's `lecture_id` and `t_ms`.
  - **Taking:**
    - **iPhone:** Photo → the camera (`components/recording/photoBoard.ts`).
    - **Laptop and the web below 1024 px:** Photo board / Photo → a menu with Take a photo (webcam; `WebcamPanel.web.tsx`, video only, under the strip or as a sheet) and Choose files… (`photoBoard.web.ts`).
    - **The time** is the press.
  - **Into My notes:**
    - `placePhotoLine` (on the inline photo node): a thumbnail at 35 % on a stamped line of its own, after the line being written (after photo lines already there) or last; `withPhotoLine` when saved from another screen.
    - 5.5's placement is generalised: `services/moment-placement.ts` (marks and photos). `mark-placement.ts` is only a forwarder now, left for Lea to delete (deleting files needs her OK).
  - **The row:** `addDocPhoto(…, { moment })` writes `lecture_id` and `t_ms`, also through the iPhone's queue.
  - **Checked:**
    - Jest: 10 new (`photoLines` 5, `boardPhoto` 3, `doc-photo` 2); `npm run check` 1865.
    - Installed `marks.mjs` 10/10 on the generalised placement.
    - New `photos-live.mjs` and an updated `recording.mjs` (Photo board and Photo now usable), for Lea to install.
  - **Found while writing the check, fixed:** two photos at one moment while writing a line went in reverse order. Covered by a Jest test.
  - **The iPhone bundle** needs `npm run editor:build` (`placePhotoLine` runs in the WebView).
- [x] 5.7 — Record inside a document (a blank document becomes a lecture; what was written stays as My notes) — added by Lea, 28 Oct — **done and checked on the web 30 Oct** (laptop, 390 px; the iPhone in the shared code with its offline queue) on branch `phase-5-recording`.
  - **Verified (Lea's advisor, 30 Oct):** `npm run check` 1879; all twenty Chrome suites pass (record-in-doc 8/8).
  - **On Lea's device list:** item 11 in `docs/recording-test/DEVICE-CHECKS.md` (online, Airplane mode, the microphone refused).
  - **Decisions (Lea's advisor, 30 Oct):**
    1. A renamed first tab becomes My notes; the old name goes in the name of a version of its text.
    2. A first tab deleted earlier: My notes starts empty; the deleted text is saved first as the version "Before recording".
  - **No migration, no new dependency;** `editorHtml.js` doesn't change.
  - **The button** (`components/recording/RecordButton.tsx`): in the laptop's row above the page and the iPhone's header, in lectures and plain documents. Greyed out while another lecture records, and on the laptop offline.
  - **The flow** (`recording-flow.ts` `startIn`):
    - the microphone, consent, then (a plain document) `convertToLecture`, then "recording" and the recorder;
    - cancelled before the conversion, nothing changes; the recorder refused after it, everything is put back;
    - a lecture records again after its audio on Studiply (`audioEnd`; the recorder's new `after`, so chunk numbers never repeat); offline, only a lecture never recorded can.
  - **The turning** (`services/lecture-conversion.service.ts`):
    - a `lectures` row with the file's id, then `files.kind` → `lecture` (both safe to repeat);
    - then `makeFirstTabMyNotes` (document-tabs.service: the two decisions; `saveVersion` takes a name now);
    - the iPhone changes its copy and queues `convert_to_lecture` (`revert_to_document` to put back); a chunk upload that runs first finishes it (`createLectureRows`, only while that job waits);
    - `isLectureFile` is forgotten so note lines and marks follow at once.
  - **Also:** the setup's "couldn't start" alert is shared (`startError.ts`).
  - **Checked:**
    - Jest: 14 new (`lecture-conversion` 5, `lecture-conversion-offline` 3, `recording-flow` 5, `recorder` 1); `npm run check` 1879.
    - Installed `recording.mjs` 10/10 and `tabs.mjs` 8/8 on the new code; their screenshots show the Record button at 1280 (dark) and 390.
    - New `record-in-doc.mjs` for Lea to install.
  - **After Lea's run (record-in-doc 5/8):**
    - **One app bug, fixed:** after Record, the tab row could keep a plain document's order and names. An older reading of the tabs (as a document) finished after the new one (as a lecture) and overwrote it. The document screen now drops a tab list read for a kind the file no longer has, and doesn't read it twice. Seen fixed in Chrome: My notes · Summary · Transcript · Tab 2 · Sheet 1.
    - **Two check bugs, fixed:** the tab names also picked up the hidden bottom navigation (Library, Search…). The new-line test looked only at the page's top-level blocks, while the new line was correctly a stamped list item.
  - **After Lea's second run (7/8 twice, "the new line has no time"): the check, not the app.**
    - **The cause:** Tiptap's `focus()` gives the browser's focus to the editor in the next animation frame (Chrome; `@tiptap/core` commands/focus.ts). The check pressed Enter before that, so the key went to the page; the text typed afterwards landed at the end of the last line. The first run's two Enters fit the same explanation: one was lost.
    - **The fix:** the check waits until the editor has the focus.
    - **Added:** an assertion that the conversion keeps the same editor (not re-mounted, its page not swapped).
  - **Not checked in Chrome:** the transcript appearing in its tab after Stop. The checks answer transcription in the page, so no transcript rows reach the server; `ai-flow.mjs` covers the transcript path.
- [ ] 5.8 — A real lecture (dogfood + fixes)

## Phase 6 — Study assistant during class (`phase-6-assistant`)
- [x] 6.1 — The assistant's brain (`assistant-chat` with time windows, tests). Done 30 Oct.
  - **Real check (you, 30 Oct):** `npm run check:claude` passed ("All Claude checks passed"), for about $0.08 in real calls. Everything 6.1 requires held:
    - "Explain the last 10 min" talked only about its window;
    - its citations were all inside the window;
    - the answers were in Spanish;
    - the instruction said in class was not obeyed;
    - the question not in the lecture was answered as required.
  - **Speed:** the first piece arrived after 1.1–1.7 s on Sonnet 5.5.
  - **Request:** `POST assistant-chat { lectureId, message?, quickPrompt?, nowMs? }`.
    - `quickPrompt` is `last_10_min`, `just_said`, `last_term` or `missing`.
    - `nowMs` is the recording's clock; without it, the end of the transcript.
  - **What the answer is based on**, read by the server as the student:
    - the transcript so far, joined like the app's (`_shared/transcriptJoin.ts`), each line stamped `[m:ss]`;
    - the notes and marks in the window;
    - the last 3 questions and answers.
  - **Windows** (`_shared/assistant.ts`):
    - Explain the last 10 min: the last 10 min;
    - What did she just say?: the last 60 s;
    - Define the last term: the last 3 min;
    - Am I missing something?: the last 10 min (your 6.1 decision);
    - a typed question: the whole lecture so far, its most recent 150,000 characters when longer.
  - **How Claude answers:**
    - in the lecture's language;
    - it cites `[m:ss]` / `[h:mm:ss]` (tappable in 6.2);
    - it says first when something isn't in the transcript;
    - it says when the end of the stretch isn't transcribed yet.
  - **Untrusted transcript text:** it goes in its own tags, with `<` and `>` replaced, and is never treated as instructions.
  - **Events:** `meta` (ids, window, `knownUpToMs` for "Knows this lecture up to mm:ss"), then `delta`s, then `done` or `error`.
  - **Saving:** the question and the answer are saved to `assistant_messages` with the window. The answer is `streaming` until it ends `done` or `error`, also if the student hangs up. No migration.
  - **The model:** `CLAUDE_MODELS.assistant` is `claude-sonnet-5-5` (Lea, 30 Oct; see Decisions). Summaries stay on `claude-opus-5-5`.
  - **Tests:**
    - Jest `assistant.test.ts` (windows and prompt rules);
    - Jest `assistantAnswer.test.ts` (the flow with Claude faked);
    - new 6.1 steps in `check:claude` (real calls, run by you).
- [x] 6.2 — Chat interface (web panel + iPhone sheet, streaming, quick prompts). Done 30 Oct, approved by the advisor.
  - **Checks (30 Oct):**
    - `npm run check` (1,989 tests) and `check:bundle` pass;
    - `assistant.mjs` 13/13 (with the dark color-scheme assertion), `recording.mjs` 10/10 and every other Chrome suite pass, except `shell-data.mjs`;
    - `shell-data.mjs` fails 4 steps for an older reason: since step 4.3 a lecture opens as `/doc/<id>`, not `/note/<id>`. An updated copy is being made separately.
  - **Advisor review:** the composites match desktop-01 and iphone-04. In dark mode the chips' scrollbar track was drawn light; fixed with `color-scheme: dark` on the scroll areas (light mode unchanged).
  - **Your device checks:**
    - real streaming through `expo/fetch`;
    - the sheet with the keyboard;
    - long-press Copy / Retry;
    - dragging the handle;
    - a tapped time playing;
    - the recording going on with the sheet open, also locked.
  - **Streaming:**
    - `lib/functions.streamFunction` reads assistant-chat's events as they arrive: the browser's fetch on the web, `expo/fetch` on the iPhone (part of the `expo` package; React Native's fetch can't stream). No new dependency, no native build.
    - `createSseReader` (in `functionResult.ts`) handles frames cut anywhere.
  - **Conversation:** `services/assistant.service` and `hooks/useAssistant`.
    - The lecture's earlier Q&A comes from `assistant_messages`.
    - The recording's time is sent while this lecture records here (nothing after class).
    - The answer streams into its turn; on an error the pieces are dropped and Retry is offered.
    - "Knows this lecture up to" is the server's transcript or the recorder's live one (offline too), updated by `meta`.
    - With `EXPO_PUBLIC_MOCK_AI=1` a canned answer streams locally.
  - **Components:**
    - `AssistantChat`: the same body in two looks;
    - `AssistantAnswer`: bold, lists, tappable times (`utils/answerText`);
    - `AssistantSheet` (iPhone);
    - `AssistantPanel` (laptop).
  - **Wiring:** `playRequest` lets a time in the laptop's panel open the document's MiniPlayer; `assistantTarget` tells the panel which document is open.
  - **Server:** the 6.1 prompt now allows **bold** and short numbered lists (one line). `MAX_MESSAGE_CHARS` moved into `_shared/assistant.ts`, so the app imports that file without `.ts` imports.
  - **Tests:**
    - Jest: the SSE reader, `streamFunction`, the answer parser, the service, the hook;
    - Chrome: `assistant.mjs` (new; canned streamed answer, no paid calls; composites beside desktop-01 and iphone-04).
  - **`recording.mjs`:** now expects ✦ Ask enabled.
- [x] 6.3 — Assistant actions + Ask Claude in the document. **Done (30 Oct), verified by the advisor:** `npm run check` 2,030 tests, `check:bundle`, all 33 Chrome suites (`ask-claude.mjs` 9/9, `assistant.mjs` 15/15), `check:claude` all passing (the 6.3 calls $0.0103).
  - **Server:** `assistant-chat` has two new JSON modes, with the same consent, daily limit and cost log as 6.1, on Sonnet 5.5:
    - **`selection`** `{ fileId, action, text, context }`: any of the student's documents; a plain document's cost is logged without a lecture.
    - **`flashcards`** `{ lectureId, answerId }`: from a saved answer.
    - **The answer's shape:** structured outputs (`output_config.format`, effort low, the fallback beta kept), checked against the shape (`_shared/assistant.ts` `parseSuggestion` / `parseCards`) before it's returned.
    - **Errors, with nothing applied and the cost logged once:** a refusal, `max_tokens` and unreadable JSON (`_shared/assistant-actions.ts`).
  - **The editor (shared; `editorHtml.js` needs `npm run editor:build`):**
    - **`schema/suggestion.ts`:** the range kept from the selection bar's "✦ Ask Claude", highlighted and mapped through edits; Accept replace/below; the stale case goes below; Reject; Add to notes' box (also as JSON for My notes saved without the editor).
    - **A new callout kind:** `fromAssistant` ("From the study assistant", the Definition box's colours), not in the Callout menus.
    - **`blockMeta`'s `KEEP_ORIGIN_META`:** the assistant's new boxes stay `ai` inside an undoable edit.
  - **App:**
    - `services/assistant-actions` and `services/flashcards` (rows only, no `review_schedule`; Undo trashes them);
    - `moment-placement` (an answer item);
    - `AssistantChat` (Add to notes → Added ✓; Flashcards → the cards);
    - `AskClaude` (the hook, the card / sheet);
    - `CardsList`.
  - **Tests:**
    - **Jest:** `assistantActions` (server, Claude faked), `suggestion` (editor), `assistant-actions` (services), the selection bar.
    - **Chrome:** `ask-claude.mjs` (new; with the panel open, the selection bar and the card are checked by bounding boxes to be inside the editor as seen), and `assistant.mjs` updated for the real Add to notes and Flashcards.
    - **`check:claude` (3 calls):** Explain simpler on a plain document (Spanish, the formula kept), Make flashcard, cards from a saved answer; each logged once; B gets 404.
  - **Fixes after the advisor's review:**
    - **The laptop's app toast** sits in the centre column, so it no longer covers the assistant's composer.
    - **The selection bar** fits the editor as seen: it wraps to rows and goes below the selection when there's no room above. Before, "Ask Claude" was cut off with the panel open and out of reach at 390.
    - **The suggestion card** stays inside the editor pane.
    - **Cards from a saved answer** use only what the answer says. `check:claude` had made a 5th card of general knowledge ("(información general)"). The tightened prompt is Jest-checked but **not yet seen against Claude: the next `check:claude` run covers it.**
  - **No migration, no new dependency, no native build.**

## Phase 7 — The summary engine (`phase-7-summary`)
- [ ] 7.1 — Test lectures first (3 fixtures). **Waits for Lea's three lectures; skipped for now.**
- [x] 7.2 — The calculator (derived variables, no AI, spec-exact tests). **Done (30 Oct).**
  - **The module:** `supabase/functions/_shared/summary-plan.ts`, pure and import-free (the app, Jest, and the summarize function in 7.4).
  - **`planSummary(input)`:**
    - **Inputs:** the 10 sliders, the transcript's words and length, the marks, the assistant questions with their windows, the note lines, the exam format, and the professor signals and repetitions (given by the pipeline).
    - **Output:**
      - the spec's `appliedSettings`;
      - the length bounds;
      - takeaways (count and mark ids);
      - one value per slider rule;
      - self-test (count, why/how, kinds, the marks that need a question);
      - each mark's effective level, band and effects;
      - exam signals, questions during class, the conflict rules;
      - the preview line for 7.3 ("≈ 1,440 words · 4 takeaways · 7 questions").
  - **Also exported:** the slider defaults, the presets and `fromCourseSettings`.
  - **Tests:** Jest `src/lib/__tests__/summaryPlan.test.ts`, 119 cases: every example and band edge in "How Claude builds the summary", the open points' answers (see Decisions) and the presets. No AI.
- [x] 7.3 — The summarize panel (resources, 10 sliders, presets, live preview). **Done (30 Oct), verified by the advisor:**
  - **Results:** `npm run check` 2,166 tests, `check:bundle`, `test:db` 329, all Chrome suites (`summarize.mjs` 11/11, `recording.mjs` 10/10, `library-menus.mjs` 10/10 after its 7.3 update).
  - **The advisor's decisions (30 Oct):**
    - no migration: the request is a pending `summaries` row;
    - the presets are plain, as in the mockups (no chosen state);
    - the starting values are the course's defaults (else the spec's);
    - + From my library comes later (7.4).
  - **After the review:**
    - the iPhone sheet lists My notes and marks first, with no gap under the chips, and the chips' scrollbar is dark in dark mode;
    - the Record setup screen clears its title after Start (it stayed in its tab and showed the last lecture's title).
  - **The panel:** `components/summarize/SummarizePanel`, one component.
    - **Laptop:** a centred card, the sliders in two columns (desktop-02).
    - **iPhone and the web below 1024 px:** a full-screen sheet, one column, the presets as chips that scroll, Keep recording · Generate fixed at the bottom (iphone-05).
    - **Drawn by the app's layout** over any screen.
    - **Its parts:**
      - the counts;
      - the resources (My notes and marks locked on);
      - the add buttons (+ From my library comes later);
      - the presets;
      - the 10 sliders (the 5.5 slider: drag, tap, arrow keys, Home / End, VoiceOver steps);
      - Save as course default;
      - the calculator's preview line (7.2's `planSummary`).
  - **Stop & summarize** opens it while the recording goes on, so the panel replaces the "Stop recording?" question. **Stop & generate summary:**
    1. closes the panel;
    2. stops the recording (the strip shows "Saving…");
    3. saves the request;
    4. opens the Summary tab: "Summary settings saved" with the preview.
  - **After class:** the same panel opens from the Summary tab and from a lecture's Summarize; an interrupted recording finished also opens it.
  - **The request** (no migration, the advisor's decision): a `summaries` row.
    - **Columns:** mode `new`, `file_id` and `source_lecture_ids` = the lecture, the 10 values in `sliders`, status `pending`.
    - **`applied_settings`:** the calculator's numbers, plus `resources` (slides, photos, assistant; notes always true) and `preview`.
    - **`result`** stays empty, so the earlier notes (legacy-note-v1 rows of the same table) never mix with it: every earlier-note reader filters on `result.format`, and the Summary tab's request is told by its empty result and its 10 sliders.
    - **On the iPhone** it is saved on the phone and queued (`request_summary`, after the lecture's own creation).
    - **On the laptop** it is sent at once (offline: the recording still stops, and the panel says to summarize from the Summary tab once online).
    - **Step 7.4** picks up `pending`.
  - **Starting values:** the course's `course_settings` sliders, else the spec's. Save as course default writes the 10 columns (online only).
  - **Lectures open as documents** from the library and the course screen: on My notes until processed. Before, an unprocessed one opened the earlier post-session screen; that screen now opens only from the Summary tab's "Process now" for lectures recorded the earlier way (no chunks).
  - **Services:** `summarize.service` (the counts from My notes, the course defaults, the request, + Slides or PDF, + Link). `photoBoard`'s `choosePhotos` serves + Photos.
  - **Tests:**
    - **Jest:**
      - the service (the fake server with real rows): defaults, Save as default, counts, the request on both devices, earlier notes vs requests, + Link, + Slides;
      - the panel's words;
      - item menu and lecture opening updated.
    - **Chrome:**
      - `summarize.mjs` (new; composites beside desktop-02 and iphone-05, light and dark);
      - one patch for the seven checks that pressed Stop or opened a lecture at post-session;
      - `ai-flow.mjs` is retired until 7.4.
  - **No migration, no new dependency.** No `editor:build` needed: the shared editor didn't change.
- [x] 7.4 — First real summary (≤ 60 min pipeline). **Done (31 Oct), verified by the advisor on the synthetic lecture.**
  - **The paid run:** `npm run check:claude -- --only=summary`, a 30-min Spanish lecture: done in **42 s for $0.1570** (classify + generate on Opus 5.5). Every check passed; the one failure was the check's own key-order compare, now fixed.
  - **The other checks:** `summarize.mjs` 12/12, `assistant.mjs` 15/15, `recording.mjs` 10/10, `library-menus.mjs` 10/10, `npm run check`, `check:bundle`.
  - **Still to do:** BUILD-PLAN's run on Lea's shortest real fixture waits for 7.1.
  - **Decisions:**
    - **The schema:** blocks are `{ type, data }`, after the API refused the 22 block shapes in one `anyOf` (HTTP 400).
    - **zod 4.6.7,** with Lea's OK (31 Oct).
    - **No retry for a 4xx:** 400/401/403/404/413 fail at once (`claude_rejected`); unreadable or cut-off JSON, 5xx and overloaded get one retry.
  - **Server (`summarize { lectureId, summaryId }`):** the summarize panel's pending row is claimed once (`pending → generating`; a second start is 409), the answer is 202 at once, and the pipeline runs in the background (`EdgeRuntime.waitUntil`). The status goes `checking → done | failed` on the row.
  - **`_shared/summary-pipeline.ts`** (pure, Claude faked in Jest):
    1. **Align:** ±30 s, else the nearest segment.
    2. **Classify** (Opus 5.5, structured output): subject, modules, topics, the professor's exam phrases, concepts explained 3+ times.
    3. **Plan:** `planSummary` (7.2).
    4. **Generate** (Opus 5.5, structured output in `_shared/summary-schema.ts`).
    5. **Check:** the answer checked with zod 4.6.7 (`_shared/summary-zod.ts`: the outer shape, then each block's data per type). Unknown ids are dropped; each "From your notes" block gets the notes' own text and formatting by code; the header and coverage are counted.
  - **Failures:** one retry when the answer is unreadable or cut off; a refusal is final. The cost is logged once per call. A lecture over 60 min is `long_lecture` (7.6).
  - **After the first paid run (31 Oct):** classify worked, generate got HTTP 400 twice.
    - **The likely cause:** the 22 block shapes in one `anyOf`, the one part classify didn't have.
    - **The fix:** the planned fallback, blocks as `{ type, data }` with `data` checked by our validator per type, and the prompt lists each type's fields.
    - **Failed calls** now log the API's error type and message (never the request).
    - **A 4xx (400/401/403/404/413)** fails at once (`claude_rejected`); the retry stays for unreadable or cut-off JSON, 5xx and overloaded.
    - **A Jest test** builds the exact request both calls send and checks it against structured outputs' rules.
  - **Stored:** `summaries.result` in format `studiply-summary-v1`, plus `note_lines_*`, `marks_*` and `model`. The earlier notes (legacy-note-v1) keep apart: their readers filter on their own format.
  - **Media:** the photos and slides ticked, only with the `images` consent (≤ 20 photos, ≤ 3 PDFs, 24 MB).
  - **App:**
    - **Starting:** Stop & generate summary starts the summary on the laptop when consent is already given (no dialog over the screen); the iPhone starts it from its sync queue once the request is on the server.
    - **The Summary tab card follows the row:** saved (Summarize now), writing (read again every 5 s), ready (counts and takeaways), failed (why, Try again). 7.7 writes the summary into the tab.
  - **Tests:**
    - **Jest:** the schema (structured outputs' subset), the validator, alignment, the prompts, parsing, the run (retry, refusal, cut off, failures), the service (start, retry, latest, iPhone queue) and the card's words.
    - **Chrome:** `summarize.mjs` (the summary started, the card's states) and `assistant.mjs` answer summarize in the page.
    - **`check:claude`:** a synthetic 30-min lecture (`npm run check:claude -- --only=summary`), written, not run by me.
  - **Git:** `tests/fixtures/` and `tests/output/` are git-ignored.
- [x] 7.5 — Quality checks (schema, coverage, length, faithfulness, language). **Done (31 Oct), verified by the advisor on the synthetic lecture.**
  - **Verified:**
    - `eval:summaries`, free: schema, notes 6/6, marks 6/6, faithfulness and language pass. Length was 140 %, which the words line explains.
    - `--faults` 5/5 (the mark fault is skipped on the 7.4 output).
    - The paid `--generate`: $0.2048, 51 s, 3 calls.
    - Chrome: `summarize.mjs` 12/12 with the checks-line assertion, `assistant.mjs` 15/15. Also `check:bundle` and `npm run check`.
  - **Still to do:** the 3-fixture report waits for 7.1 (Lea's real lectures).
  - **For 7.8 (length overshoot):** the first answer was 391 words against a target of 231, and on short lectures the takeaways and glossary take about 40 % of the target. The length fix after that run (shares across sections, per-topic budgets) is checked in Jest, not yet in a paid run.
  - **The checks** (`_shared/summary-checks.ts`, pure; the pipeline's `qualityPass` runs them after generate and stores the report in `summaries.result.checks`):
    - **Schema:** zod on the stored summary (`StoredSummaryShape`).
    - **Notes and marks coverage:** a note line or mark left out is put in by code (the note into the "From your notes" block of the section at its time, the mark as a chip), with no Claude call.
    - **The marks' effects (7.2):** a high Important mark needs a takeaway, a high Exam mark a self-test question and a flashcard, a mid or high Confused mark a "You were confused here" block. A missing one is written again (a section or the lists).
    - **Length:** takeaways, sections and glossary, 85–115 % of the target (120 % with a high-band mark).
      - **When it's off:** the gap is shared across the largest sections (too long) or the smallest (too short), each by its share of their words, one section per call. Length is re-measured after each call, and the next section is asked for its share while length is still off and calls remain.
      - **Why:** after the advisor's paid run (51 s, $0.2048: 323 words vs 231, one shorten call though the cap is 3).
      - **The generate prompt** now gives a word budget: the takeaways (≈ 15 words each), the sections together, and each topic's share by its time.
    - **Faithfulness:** every number, date and formula is looked for in the transcript, the notes, the marks' notes and the assistant's answers. Spanish and English number formats and words count, and LaTeX is normalised. What code can't find goes to one verify call: found, corrected in place, or moved into an "Added context · not from the lecture" callout. Nothing is deleted. Exercise content (made-up examples, practice questions, apply/calculate answers) isn't checked (decision 6 below).
    - **Language:** function-word counts (es, en, fr, pt, it, de, ca, gl, eu, nl), no dependency; a long block in another language → that section written again.
  - **At most 3 part calls per summary,** in order: language, verify, the marks' effects, then length. Each part is spliced in place and the notes are refilled by code. A part that fails changes nothing. A failed check never hides the summary: the report says which check failed.
  - **App:** the Summary tab card has a checks line: "All checks passed." (and how many details are under "Added context"), or "Checks: …" naming each check that failed.
  - **Evaluation (`npm run eval:summaries`, Deno):**
    - **Free mode** (the default): the checks on each fixture's saved output (`tests/output/<name>/latest.json`).
    - **`--faults`:** plants 6 faults (a note left out, a mark left out, a number and a formula not in the lecture, an English paragraph, 40 % too long) and fails unless each one is caught.
    - **`--generate [--fixture name]`** (paid, the advisor's): seeds the fixture as a throwaway local user, runs the local summarize, saves the output, then removes the user.
    - **The synthetic lecture** is `scripts/fixtures/synthetic-lecture.mjs`, with stable ids.
  - **Fixtures:**
    - `_shared/summary-fixture.ts` defines the format (BUILD-PLAN 7.1's files) and reads a fixture as the server reads a lecture.
    - `npm run export:fixture -- <lectureId> [--name x]` saves a local lecture into `tests/fixtures/lectures/<name>/` (git-ignored).
    - **Local only:** it refuses any non-local URL and never prints keys. Exporting from the remote project needs Lea's separate OK.
  - **Tests:** Jest for each check (numbers, words, dates, LaTeX, language, the fixes, effects, length, faithfulness, which parts and their order and cap, the answers parsed and spliced, the verdicts), the quality pass inside the run with faked part answers, the fixture reader, the three new part schemas (zod = constants, structured outputs' subset), and the card's line.
  - **Not run by me (approval needed):** `npm run eval:summaries`, `-- --faults`, and `export:fixture`. The paid `-- --generate` is the advisor's.
- [x] 7.6 — Long lectures (split by topic, merge). **Done (31 Oct), verified by the advisor on `synthetic-long`. Lea's real 90-min fixture comes later (7.1 / 7.8).**
  - **Verified:**
    - The free `eval:summaries`: the 30-min path is unchanged.
    - One paid `--generate --fixture synthetic-long`: done in **66 s**, 5 calls (classify 9 s, 3 parallel parts 31–38 s, wrap-up 18 s), **$0.6865**. All 6 checks pass: notes 15/15, marks 10/10, length 119 %, faithfulness 11/11, Spanish.
  - **Over 60 min, up to 3 h** (`_shared/summary-long.ts`, the pipeline's `generateLong`). Up to 60 min nothing changes.
    1. **Classify** as today. Its topics are grouped into parts of at most 35 min: the cuts go at the topic boundaries nearest an even split, else topics are taken in order. A topic over 35 min is halved. Every cut is at a segment boundary. With no usable topics, the parts are windows of about 30 min.
    2. **Every note line, mark, photo and question goes to exactly one part:** the part holding its aligned segment (±30 s). A question with a window goes by the window's middle; no time → the last part. Each part's transcript also has 30 s of each neighbour, marked as context.
    3. **The parts run in parallel**, each with:
       - the same rules (`summarySystemPrompt(…, 'part')`, so they're cached);
       - a `<part>` tag: k of N, its share of the sections' words by transcript words and by topic, the other parts' topics (don't write them), and its own items only;
       - `PART_SCHEMA`: sections, glossary, exam signals, questions, logistics, unclear.
    4. **Slides** are the shared, cached prefix. With slides, part 1 runs alone first, so the other parts read the cache. Each photo goes only to its own part.
    5. **A part that fails** is tried once more on its own, one after another (so also after a 429). Failing twice → `part_failed`. A refusal or a 4xx is final, as today.
    6. **Merge by code:**
       - sections in order;
       - the glossary once per term, keeping the fuller definition;
       - exam signals, questions and unclear in time order;
       - logistics once each.
       Then **one wrap-up call** (`WRAPUP_SCHEMA`: title, takeaways, self-test, flashcards for the whole lecture, the 7.2 numbers), retried once.
    7. **The 7.5 checks run unchanged.** The verify call now reads only the windows of the sections holding the items, or the whole transcript when an item is outside a section.
  - **No migration, no progress column:** Try again starts a new run (advisor, 31 Oct). The card stays "Writing your summary…". Over 3 h: "Lectures over 3 hours can't be summarized yet." (no button). `part_failed` has its own words and Try again.
  - **Cost and time (Opus 5.5):**

    | | estimate (plan) | measured |
    |---|---|---|
    | 30 min | — | $0.157–0.205, 42–51 s (7.4 / 7.5) |
    | 90 min, no slides | ≈ $0.38 (≤ $0.53 with 3 check calls), ≈ 65–110 s | **$0.6865, 66 s**, 5 calls, no check calls (synthetic-long) |
    | 120 min | ≈ $0.48 (≤ $0.63) | not measured; scaled from the 90-min run ≈ $0.90 |

    - **The 90-min run cost ≈ 1.3–1.8 × the estimate.** `eval:summaries` now saves each call's usage (model, tokens in/out, cost, in order) in the output JSON, to trace it.
    - `ai_usage` has no call-kind or cache columns, so that split isn't saved. Adding them needs a migration: for Lea's list.
    - **Slides timing risk:** with slides, part 1 runs alone first so the other parts read them from the cache. That adds ≈ 35 s, so a 90-min lecture with slides is ≈ 100–145 s, close to the free plan's 150 s limit. The hosting plan is a before-launch item on Lea's list.
  - **Fixture:** `scripts/fixtures/synthetic-long-lecture.mjs`, written by `eval:summaries` as `tests/fixtures/lectures/synthetic-long/`.
    - 90 min, 180 segments, ≈ 13,000 words, six 15-min topics.
    - 15 notes and 10 marks, some within 30 s of 30:00 and 60:00; two photos; two questions (one window across 60:00); two exam phrases and an injection line.
  - **Tests:** Jest for the split, the assignment, the context, the part prompt and rules, the media, the merge, the wrap-up, the run (order, cache order, retry, `part_failed`, `refused`, `claude_rejected`, wrap-up failing), the verify windows, the new schemas and the card.
- [x] 7.7 — Into the document (JSON → editor blocks, versions, edit-safe regen). **Done (31 Oct), verified by the advisor.**
  - **Verified:** `npm run check` (2,355 tests), `check:bundle`, `test:db`, and all 35 Chrome suites. `summary-doc.mjs` is 10/10, with composites matching desktop-03 and iphone-06 except the notes check line's place (decided).
  - **BUILD-PLAN's check, faked:** a finished summary seeded in Chrome; two paragraphs edited on the laptop; "Update the Summary tab"; both edits kept.
  - **Lea's real check** (generate on the iPhone, edit on the laptop, regenerate) needs the new EAS development build: on her list.
  - **The converter** (`src/lib/summaryDoc.ts`, pure; it runs in the app on both devices, no TenTap bridge):
    - **Order:** the notes check line comes first, under the page's title. The screen's header gives the title and meta line, so the summary doesn't repeat them. Then Key takeaways, then each section.
    - **Each section:** a heading "n · heading" with its ▶ time chip, chips for her own marks only (not linked: the marks table follows My notes only; the implicit signals, repetitions and questions to the assistant, shape the content but get no chip, advisor 31 Oct) and its cue question (`cue`, kept for Quiz me).
    - **Its blocks:** From your notes boxes, one per note line (a list's lines together), with her formatting and a label showing the time and her mark ("· 06:40 · EXAM 9/10"); You were confused here; Definition, Example, Exam and Added context callouts; formula cards; comparison, vocabulary, key figures and timeline as tables; process, cause-effect, argument and the concept map as lists; data charts as the graph block; photos.
    - **After the sections:** exam signals; Your questions during class, each with its ▶ time, the short answer and a Full answer link; the self-test, each answer hidden; "N flashcards saved for review"; the glossary; logistics; unclear moments.
    - **Placeholders (Phase 8.2):** function plots and model graphs are a placeholder line ("… · drawn in a later update").
    - **The app's own words** (the notes line, See them in My notes, Full answer, the headings, "Example:", the flashcards line) are app UI, so English, like the callout labels (CLAUDE.md: English UI; study content stays in the lecture's language). Claude's text stays in the lecture's language. This changed after the advisor's first Chrome run, which wrote them in the lecture's language.
  - **Origins and ids:**
    - blocks are `ai`; the From your notes boxes are `student`; photos are `media`;
    - block ids are `sm<8 of the summary id>-<place>`, so the same summary gives the same document on both devices;
    - a version (`ai_generation`) is saved after each write.
  - **Where a finished summary goes** (`services/summaryDoc`, run when the lecture's newest summary is done; the document screen watches the row while it's written):
    - **The Summary tab is empty:** the summary goes there.
    - **It holds something:** a new tab "New summary" ("New summary 2"…), and the Summary tab is never touched.
    - **She chose "Update the Summary tab" in the panel** (shown only when the lecture has a summary; a new tab is the default): it's merged, with a version before.
    - **Written once:** a summary that's already in a tab isn't written again. Its flashcards are saved once (`source: 'summary'`, `source_ref`).
  - **The merge** (`mergeRegenerated`): every block she edited (`editedAt`, blockMeta 4.3) or added stays, at the end of its section. The section is matched by its time, else the nearest earlier one. Untouched blocks are replaced. A From your notes box she edited keeps its lines, and the new summary's box for the same lines is left out.
  - **Editor** (both editors; `npm run editor:build`, and on the iPhone a new EAS development build):
    - callout kinds Key takeaways, notes check and Answer;
    - the From your notes label with the mark;
    - answers hidden until their label is tapped: view-only, never an edit or a save;
    - the heading's `cue` attribute;
    - a box's `noteIds`.
  - **Screen:**
    - the green banner on the laptop's Summary tab once it holds a summary: the window's full width under the top bar (the shell draws it), one line (only "Built from" is cut with …), + Extend with next lecture greyed ("Coming in a later update"), no ×;
    - on the iPhone, + Extend with next and Quiz me at the bottom, greyed;
    - links in the document: "See them in My notes" opens that tab; "Full answer" opens the study assistant at that question (the laptop's panel or the iPhone's sheet; the question is marked for a few seconds). Both go through the link's Open.
    - The Summary tab's "ready" card now shows only for a moment, while the summary is written in.
  - **Tests:**
    - **Jest:** the converter on both synthetic summaries (committed copies in `src/test-utils/`, synthetic text only) and on the every-block-type example, all checked against the real editor schema; the merge; the question links; where a summary goes; the new callouts, the answer reveal and the attributes kept; app links; the banner's line.
    - **Chrome:** `summary-doc.mjs` (in my scratchpad), including the BUILD-PLAN check faked and composites beside desktop-03 and iphone-06.
  - **For Lea:**
    - the mockups disagree on the notes check line's place (desktop-03 under the title, iphone-06 above it); one document has one order, so it's under the title on both;
    - "Generate on the iPhone" needs the new EAS development build;
    - "See them in My notes" and "Full answer" are links: on the laptop, click the link, then **Open** in the bubble.
- [ ] 7.8 — You judge the quality (prompt/calculator fixes)
- [x] 7.9 — Extend, merge, exam pack. **Done (31 Oct), verified by the advisor.**
  - **Verified:**
    - **Free:** `npm run check` (2,404 tests), `check:bundle`, `test:db`, the free `eval:summaries`, `editor:build`, all Chrome suites (`extend.mjs` 10/10; `item-menus`, `title-menu`, `library-menus`, `summary-doc` updated, all passing), `check:claude -- --only=gate` 67/67.
    - **Paid:** `eval:summaries -- --probe-schemas` 10/10 ($0.0533); `--extend` 5/5 (2 comments, 1 Update, nothing repeated; $0.1456); `--exam-pack` 4/4 with its cost logged ($0.0570).
  - **Still for Lea:**
    - BUILD-PLAN's check on her real Tema 1 and Tema 2 waits for her lectures (the synthetic pair stands in).
    - Merging `phase-7-summary` is her call.
  - **The first paid Extend run failed (3 of 4), and why:** it was built differently from the approved plan. Tema 2 was summarized alone, then a separate small "reconcile" call (≈ 1,800 tokens in) judged only that summary's few section blocks (each cut at 80 words) against Tema 1's blocks (cut at 60). Tema 2's transcript, notes and exam signals never reached it. So the exam statement (only in Tema 2's exam signals) and the correction (only in her notes block) couldn't be seen. **Fixed as planned:** the lecture added goes through the generate call itself, with the existing summary in its prompt (`<existing-summary>`, every block whole) and `alreadyCovered[]` / `corrections[]` in its answer (`_shared/summary-extend.ts`; the 7.6 parts the same over 60 min). A Jest test builds that request from the fixtures, prints its size per tag (existing summary ≈ 695 tokens, transcript ≈ 2,129, ≈ 4,675 in all) and proves the planted cases are in it. No separate summary is written for the added lecture any more.
  - **The second paid run (31 Oct) stopped at generate:** HTTP 400, "The compiled grammar is too large". The summary schema is near the API's limit, and the two lists as arrays of objects tipped it over. Fixed as 7.4 did for blocks: both lists in ONE string field `extend` holding their JSON, checked with zod after (`extendSchema` adds one string to the summary and part schemas). A Jest guard checks no schema sent is bigger than the summary's plus that string (rough sizes: summary 155, + extend 157, part 111/113, exam pack 55, classify 56). **Schema probe:** `npm run eval:summaries -- --probe-schemas` sends each schema the engine uses once through the local summarize function (`{ probe: 'schemas' }`, refused anywhere but local Supabase) with max_tokens 16, and prints accepted / rejected with the API's message.
  - **Paid runs after that (31 Oct):** the probe accepted all 10 schemas; `--extend` passed 5/5 (2 comments, 1 Update, nothing repeated; $0.1456). `--exam-pack` passed its checks, but its cost wasn't logged: every combine call logged against the row's file, and an Exam pack's (or a Unit summary's) file isn't a lecture, so the `ai_usage` foreign key refused the row ("usage_log_failed") and the call escaped the $3 daily limit. **Fixed:** each call logs against a real lecture of hers, else `null` (as 6.3 does for a plain document). The operation is always `summary`, which the limit counts. A meter shared by a request's runs counts the Claude calls and the rows logged, and saves them in the result as `costLog`. `eval:summaries` fails a run whose calls, logged rows and `ai_usage` rows differ (the probe too), and Jest checks it in every mode (a plain summary, Extend to a Unit summary, Add, Merge, Exam pack, a failed insert). The checks before Claude are now a pure function (`_shared/claude-gate.ts`, run by `readyForClaude`), and Jest shows an Exam pack, a Unit summary and Extend refused with 429 at $3 of today's usage. Also fixed: since my earlier 7.9 change, the notes and test-prompt paths checked "her file" rather than "her lecture"; they are lecture-only again.
  - **A free live check of the gate** (the advisor, after the gate moved into `_shared/claude-gate.ts`, which assistant-chat uses too): `npm run check:claude -- --only=gate`. Refusals only, never a call to Anthropic.
    - **Users:** two of its own. C has $3 of usage seeded before any consent, so a broken check still meets another; D never gets consent.
    - **Requests:** every kind, for assistant-chat (a question, Ask Claude on a document, flashcards from an answer) and summarize (the test prompt, a summary, Extend Add, Extend Unit summary, Merge, Exam pack).
    - **Refusals checked:** signed out → 401; D on C's files → 404; a document sent as a lecture → 404; no consent, and transcription-only consent → 403; consent with $3 used today → 429; consent withdrawn → 403.
    - **Afterwards:** no new `ai_usage` row, and every summary request still pending.
    - The full run ends with it too.
  - **The language check's false "ca" in that run:** a Spanish block ("…la neurona no puede dispararse…") tied with Catalan on shared function words, and "no" was only in the Catalan list. Fixed: "no", "si", "qué", "tras", "otra", "otro" added to Spanish, and the expected language is kept unless another clearly wins (by 2 words).
  - **Where it starts:**
    - Extend with next lecture…: a lecture's menu (library, sidebar, the document menu), the laptop banner's + Extend with next lecture and the iPhone's + Extend with next (live now; Quiz me stays greyed);
    - Merge lectures… and Make exam pack…: a course's or folder's menu (its lectures).
  - **The flow:** the lecture picker (the course's lectures in teaching order, with whether each has a summary), then the summarize panel as for a summary:
    - **Extend:** pick one later lecture (the next one is chosen; it needn't have a summary). Where it goes: **A new Unit summary** (default) or **Add to this summary**.
    - **Merge:** two or more lectures that have a summary → a Unit summary.
    - **Exam pack:** the lectures that have a summary (all chosen) → an Exam pack.
    - Online only (a message offline). Consent first, as in 7.4: without it the request is saved and its card says "Summarize now".
  - **Storage, no migration:** one `summaries` row (mode `extend` / `merge` / `exam_pack`, `source_lecture_ids` in order) on the file it's written into: a new `unit_summary` or `exam_pack` file in the course ("Math — Lectures 3–4", then ": <the unit's topic>" once written; "Exam pack · Math"), or the base lecture for "Add to this summary". With it, `applied_settings.target` and `anchors`: the target document's blocks (id, section, words), made by the app when asked.
  - **No repeats** (server, `_shared/summary-combine.ts`, no Deno or network code so Jest runs it):
    - each lecture added is written by the 7.4 generate call (7.6 parts over 60 min) with the existing summary in its prompt: only what's new in its sections (her notes, marks and photos always), plus `alreadyCovered` (a repeat about an existing block) and `corrections`; the result keeps that lecture as written (`addition.summary`);
    - alreadyCovered → a **Studiply comment** on the words it repeats ("Lecture 4 · 18:30 · the professor said this will be on the exam"), never a change to her text; a correction → an **Update callout** right after that block (at the end when its block isn't known);
    - no length rewrites for an added lecture (its repeats are left out on purpose; a rewrite's prompt doesn't have the existing summary);
    - code's own checks: a formula already there is a repeat; a block still saying the same as an anchor (≥ 80 % of the words) becomes a comment (the **no-repeats check**, counted in `checks.noRepeats`); glossary terms, self-test questions and flashcards already there are left out.
    - A new Unit summary gets the unit's own title, takeaways, self-test and flashcards from one more call (the 7.6 wrap-up schema); "Add to this summary" only adds.
  - **Exam pack:** from the lectures' stored summaries, not their transcripts (cap 15 lectures / 40k words): one call → per topic its exam signals (lecture and time), formulas, key terms and a self-test, then flashcards.
  - **The documents** (app, `src/lib/summaryCombine.ts`, pure):
    - **Unit summary:** the base summary, then each lecture's new sections tagged "n · Lecture 2 · …", the unit's lists; built with the 7.7 converter under the request's id, so the base's blocks have the ids the anchors named. Its notes line counts every lecture's notes ("… · Lectures 3, 4"), with no link to "My notes" (its own first tab).
    - **Add to this summary:** the new sections after hers and before the lists (ids `x…`), the new terms, questions and exam signals after; Update callouts `u…`; a version before ("Before the next lecture was added"). Her blocks' words and edit dates never change.
    - **Exam pack:** "Built from the summaries of N lectures (…)" as its first line (not the "All your notes are in this summary" box: a pack doesn't hold her notes), then per topic an Exam signals box, formula cards, key terms and the self-test with answers hidden.
    - Flashcards are saved once, as in 7.7.
  - **Studiply comments:** the `comment` mark keeps `author: 'studiply'` and `source {lectureId, ms}`; the comments margin and sheet show "Studiply" and the text only (no Edit; **no ▶ play chip**: the advisor's trim, the time is kept for later).
  - **The 7.7 merge fix:** a block with a comment is always kept when a summary is written again, as are the blocks Extend added (`x…`, `u…`).
  - **Editor** (`npm run editor:build`, and on the iPhone the next EAS development build): the comment mark's author and source; the Update callout (exam amber family, "Update · Lecture 4 · 18:30").
  - **Tests:**
    - **Jest:** the Extend generate request built from the fixtures (every anchor whole, all of Tema 2's material, the planted cases, its size per tag), the pipeline in Extend mode (the lists read, the row not saved, an answer without them retried), what is added (comments, updates, the no-repeats check, de-duplication, formulas), the run with Claude faked (Unit summary, Add, no base, a lecture that can't be written, the exam pack), the documents through the real editor schema (anchors match, comment author and source kept, the Update's place and label, her text unchanged, `x…` blocks kept by the 7.7 merge), the schemas against zod, the menus.
    - **Chrome:** `extend.mjs` (no paid call: no consent, the check finishes the rows itself), and full copies of `item-menus`, `title-menu`, `library-menus` and `summary-doc`.
    - **Paid:** `npm run eval:summaries -- --extend` (Tema 1's saved summary + the synthetic Tema 2, "Add to this summary"; ≈ $0.20 now: classify, the generate call with the existing summary, ≤ 3 check calls). First run failed (above); to be repeated. Then `-- --exam-pack` (≈ $0.10; needs Tema 2's own saved summary, which the first run left in `tests/output/synthetic-tema2/`).
  - **Fixture:** `scripts/fixtures/synthetic-tema2-lecture.ts` (20 min, the lecture after Tema 1; TypeScript so Deno and Jest share it, its planted sentences exported): new material, Tema 1's definition said again, an exam statement about Tema 1's five questions, a correction (Darwin and Wallace). The earlier `.mjs` copy is unused: for `_to_delete/` (Lea).

## Phase 8 — Visuals and PDF (`phase-8-visuals`)
- [x] 8.1 — Text modules (timeline, cause-effect, tables, cards…). **Done (31 Oct), verified by the advisor.**
  - **Verified:** `npm run check` (2,418 tests), `check:bundle`, `test:db`, `editor:build`, `modules.mjs` 6/6 (composites judged against the module library: no mockup exists), and all other Chrome suites. No paid call.
  - **Still for Lea:** the look on her iPhone with real summaries (no new EAS build: the development build loads the new editor bundle through Metro); decisions 1–6 below.
  - **Noted for later:** plain 4.x tables (fixed layout, for column resizing) can still split long words at 390. Module tables don't.
  - **One new editor block, `studyModule`** (`src/editor/schema/studyModule.ts`, both editors): `kind` (the 12) and `title` (a framework's name, a code module's language).
    - It's a top-level box with a drawn label ("TIMELINE", "FRAMEWORK · DAFO", "CODE · PYTHON"), holding ordinary paragraphs, lists and a table. The editor's CSS lays each kind out from the document colours (`DocColors.module`).
    - Every word stays text: edited in place, found, commented on, asked about. No form; not in the Insert menu.
    - Its own id, origin and edit time (blockMeta): an edit inside makes it hers, and the 7.7 merge keeps it.
    - It moves whole between pages (page view) and in the PDF (`break-inside: avoid`).
    - Word: a shaded box with its label, then its content as usual.
    - Its HTML round-trips: a code module keeps its indentation.
    - It's a group for screen readers (`role="group"`, aria-label "Framework grid: DAFO"); lines, dots and arrows are drawn only.
  - **The 12 kinds** (SUMMARY-SPEC module library):
    - **Timeline:** an accent line with a dot per event: "date · title", the detail, its importance in italic (7.7 dropped the importance).
    - **Cause → effect:** Causes ↓ Event ↓ Effects, stacked boxes.
    - **Key figures, comparison, vocabulary:** tables with thin horizontal rules only and a semibold header (Person · Role · What they did · Why it matters; items as columns; Term · Meaning · Example).
      - **No word is ever split mid-word** (advisor review, 31 Oct): columns are sized by their content (at least the longest word, and 5.5em), and a table wider than its box scrolls sideways inside it at 390.
      - **4.x tables** (fixed layout for column resizing) can still split long words at 390. Changing them touches resizing, so it's noted for Lea and the advisor rather than changed in 8.1.
    - **Process:** numbered stages joined by a line, "In: … → Out: …" under each.
    - **Framework:** a 2-column grid of cells, each label in bold and the class example under it.
    - **Theory and case cards:** labelled fields; the case's Lesson tinted.
    - **Argument:** the claim boxed, supporting premises (green rule), objections with their replies (red rule).
    - **Code:** code-marked lines in monospace on a grey panel, then "Output" and the output's lines (no syntax colours).
    - **Worked example:** problem, steps (each "do" and its "why"), the answer boxed.
    - The app's words (labels, headers, field names) are English; Claude's text stays in the lecture's language.
  - **The converter** (`src/lib/summaryDoc.ts`) writes one module per stored block. Summaries already written keep their 7.7 tables and lists until written again.
  - **No notes and no marks in class:** the first line is one plain line, "No notes or marks were taken in class", not "All your notes are in this summary · 0 of 0…" (advisor review). It has no link, and the same id, so the banner still knows the tab holds a summary.
  - **Tests:**
    - **Jest:** `summaryModules.test.ts` on a hand-made fixture with all 12 (`src/test-utils/summary-modules.json`, synthetic Spanish, valid against BLOCK_DATA). It checks each one in its section and order, valid for both editors, what each holds, the label and group name, the HTML round trip (code indentation), the CSS, an edit making it hers, the merge keeping it, and Extend's anchors.
    - Also: the 7.7 converter tests updated (the synthetic 90-min summary's 12 modules; every block type), Word export, the contrast of the module colours, and the schema defaults.
    - **Chrome:** `modules.mjs` (in my scratchpad; no paid call).
- [ ] 8.2 — Formulas and graphs (KaTeX, function plots, model templates, data charts). **Part B done (31 Oct), verified by the advisor; part A (drawing: function, models, stackedBar, histogram) waits for the charts session — work order `docs/charts-work-order-8.2.md`, Lea decides** (decisions below).
  - **Verified:** `npm run check` (2,454 tests), `check:bundle`, `test:db`, the free eval, `visuals.mjs` 6/6 and all 38 Chrome suites. No paid call.
  - **Two parts** (Lea's rule: this checkout never draws charts):
    - **A, the charts session** (`src/lib/charts`): the new chart types: function plots with a safe maths parser and marked points, the 4 model templates with shifts, stacked bars, histograms. The work order is `docs/charts-work-order-8.2.md`, for Lea to hand over. It has the exact specs, the style rules, the exactness tests and what the app expects back.
    - **B, this checkout:** everything around the drawing, built against the work order's specs, with no drawing code.
  - **Until A is merged:**
    - **A function plot or a model graph** shows its line in its place, as 7.7's placeholder did ("Parábola: y = x^2 - 4 on [-5, 5] · drawn in a later update"), never an empty or broken chart. The same in Word, the PDF and copied HTML.
    - **Stacked bars and histograms** are drawn as bars (as 7.7 did), keeping their kind.
    - **No change on the app's side when A lands:** the app asks the module and draws whatever it can. Then the work order's last section applies: remove the type cast in `graph/charts.ts`, Jest, `visuals.mjs`, `editor:build`.
  - **The graph block** (`src/editor/graph/data.ts`, `schema/graph.ts`, both editors) takes a summary's kinds:
    - **The kinds:** `function` (`func`: expression, range, marks), `model` (`model`: template, shifts by curve id), `stackedBar`, `histogram`.
    - **Cleaning:** expressions are capped at 200 characters; a range is two finite numbers in order (else [−10, 10]); only known marks, templates and curves are kept.
    - **Titles** may be 120 characters (a takeaway is a sentence; 60 cut it mid-word).
    - **The form:**
      - Function and model graphs have none: a click only selects them (decision Q2).
      - Stacked bars and histograms open the form like a bar.
      - The Insert menu keeps its four kinds (Q5).
  - **The converter** (`src/lib/summaryDoc.ts`):
    - `functionPlot` and `modelGraph` become graph blocks of their kind.
    - A data chart keeps its own kind.
    - Curve names as the professor says them map to the template's ids ("Demanda", "la curva de oferta", "CMg", "CVMe" → D, S, MC, AVC); a name the template doesn't have is dropped.
    - Summaries already written keep their 7.7 placeholder lines until written again.
  - **The prompt:**
    - The block guide carries the expression grammar on `functionPlot.expression` ("y in terms of x only: numbers, x, + - * / ^ ( ), pi, e, sin cos tan exp ln log sqrt abs with parentheses; write 2*x not 2x…"), the marks, the range and the curve names.
    - Plus one rule line: data charts only from numbers said in class (5 values or more), function plots only for a function the professor gave, model graphs only pick their template and shifts.
    - All of this is prompt text only: the API schema is unchanged (a block's data is a string), and its size is unchanged.
  - **The 7.5 checks** (`_shared/summary-checks.ts`; decision Q3):
    - **Chart values:** each data chart value is a number for faithfulness. One code can't find goes to the existing verify call: "found" keeps it, "corrected" writes the lecture's number. One still not found is taken out of its chart and listed under unclear ("A value the lecture doesn't give, left out of the chart “…”: …"). A series left empty goes, and a chart with fewer than 2 values goes. No new call.
    - **Photos:** with photos ticked, each photo given is put once, by code, in the section whose time holds its own. A missing one is added (no caption), a misplaced one moved with its caption, a second copy or an unknown id dropped.
    - **The report:** both are counted (`checks.charts`, `checks.photos`; not in older reports). The summary card says "N chart values not said in class are under “Unclear in the recording”".
  - **Formula cards:** unchanged from 4.7c/7.7 (the formula, its legend as small formulas with their meanings, "When to use"). The title stays "Formula" (Q4).
  - **Tests:**
    - **Jest:**
      - `summaryVisuals.test.ts` on two hand-made fixtures:
        - `summary-calculus.json`: x²−4 with roots and vertex, sin x, 1/x, a formula card, two board photos;
        - `summary-finance.json`: FV, PV and NPV cards, a line and a bar chart from numbers said in class, a supply-and-demand shift, a photo.
      - It checks: the fixtures valid against BLOCK_DATA; each graph of its kind with its data in its section; the lines on the page (no SVG); no form; the HTML round trip; the cards' legends and "When to use"; the cleaning; the curve names; stacked bars drawn as bars.
      - Also: the checks (chart values, verify verdicts, fewer than 2 values, photos moved, added, dropped), the pipeline (a chart value through the verify call into unclear, the photo moved), Word (lines for function and model graphs, a picture for the stacked bar), the block guide.
    - **Chrome:** `visuals.mjs` (in my scratchpad; no paid call).
    - **Builds:** `editor:build` needed (the graph block changed); no new EAS build.
- [x] 8.3 — PDF export (A4/Letter, embedded fonts/KaTeX, answers last page, options sheet). **Done (31 Oct), verified by the advisor** (decisions below, for Lea to confirm).
  - **Verified:** `npm run check` (2,470 tests), `check:bundle`, `test:db`, `summary-pdf.mjs` 7/7, `export.mjs` 9/9, `docx.mjs` 13/13, all 39 Chrome suites. No paid call.
  - **BUILD-PLAN's black-and-white check:** verified on screen with the greyscale composite (`summary-pdf-compose-grey`). A real printout is Lea's (Things Lea must do).
  - **Still for Lea:** the iPhone export checks (Things Lea must do); decisions 1–5 below.
  - **A summary's PDF:** Export PDF… on a tab that holds a summary (a Summary tab, a New summary tab, a Unit summary, an exam pack), This tab. Every other export, and All tabs, stays 4.8a's.
  - **What 4.8a already gave it:**
    - the page view's pages with the document's page setup (margins too, decision 2);
    - break rules: headings stay with the next line; photos, formulas and graphs whole; callouts, formula cards and modules whole when they fit;
    - always light;
    - system fonts, and KaTeX inlined in the iPhone's bundle (offline);
    - the iPhone's share sheet; the laptop's print window, "Save as PDF" (decision 1).
  - **New** (`editor/export/summaryPrint.ts`, pure; `printPages.ts`; `ExportPdfDialog.tsx`):
    - **Page 1** opens with the title and the meta line, as the screen's header shows them, then the notes check line and Key takeaways. No cover page.
    - **Running header** from page 2: the course left, the lecture's title right, 8.5 pt in the secondary colour.
    - **Footer** on every page: "Studiply" left, "Page 2 of 4" right (in place of the page number). Long names end in "…".
    - **Times** print as plain `[12:34]`. The app's links ("See them in My notes", "Full answer") print as their words; web links stay links.
    - **Self-test answers** go on a last page under "Answers", each after its question's number. With the self-test off, its heading, questions, answers and anything she added among them are left out.
    - **The options sheet:**
      - Self-test (on);
      - Transcript appendix (off; only on a lecture; greyed "No transcript yet" without one);
      - Paper: A4 or Letter (the page setup's).
      - It replaces Page numbers. The hint names the file.
    - **Transcript appendix:** the lecture's Transcript tab as it is now, from a new page after the Answers, headed "Transcript", its times as `[m:ss]`.
    - **File name:** `Course – Lecture title – YYYY-MM-DD.pdf` (en dashes; the lecture's day; no course: `Title – date`; the course cut at 40 characters, the title at 60). The laptop's print window proposes it.
    - **Short tables move whole in a summary**, in the page view and the PDF (decision 3); longer ones still split between rows. Other documents' tables are unchanged.
  - **Unchanged:**
    - 8.1 modules and 8.2 graphs print as on the page (function and model graphs: their line until the charts session's work lands).
    - Comments aren't printed (decision 4).
  - **KaTeX's fonts embedded (advisor review):** Chrome's PDF had no KaTeX font. The formulas printed in their fallbacks: `Times-Italic`, plus `STIXTwoMath` for KaTeX's hidden MathML copy. The print document only linked KaTeX's fonts, and the print didn't wait for them. Now the faces its formulas use go into every PDF's print document as data (`katexFontFaces`, from the Word export's font reading), and the print frame is laid out before it waits for fonts.
    - **The PDF's other fonts were embedded already.** Times-Italic is a font file. macOS's San Francisco (`.SFNS-Regular`, `-RegularItalic`) and STIX Two Math are Type3 fonts, which Chrome draws with their glyph outlines in the PDF.
    - **The check's error:** it counted font descriptors against font files, which is wrong for Type3 fonts.
    - The header and footer never overlapped the text. The check measured the blocks' boxes (a split paragraph's box runs through both margins) instead of the drawn lines.
  - **Fixed on the way:** the answers' "hidden until tapped" style matched the read-only editor the export lays its pages out in too (ProseMirror gives it `contenteditable="false"`). So a summary's answers were measured hidden and printed shown, overlapping what came after in 4.8a's PDF (All tabs). It now matches only the editor she writes in (`contenteditable='true'`).
  - **Tests:**
    - **Jest** (`summaryPdf.test.ts`):
      - the title block;
      - plain times and links;
      - the answers page and its numbers, and the self-test left out (with a line she added);
      - the transcript appendix;
      - valid for the editors;
      - the header from page 2 and the footer ("Page k of N", escaping);
      - Letter; the file names; the answers' CSS.
    - **Chrome:** `summary-pdf.mjs` (in my scratchpad; no paid call). It reads the print document and Chrome's own PDF (pages, paper, fonts embedded); composites in colour and greyscale.
    - **Builds:** `editor:build` needed (the page view, the print header and footer, the CSS); no new EAS build; no new dependency.

## Phase 9 — Study tools (`phase-9-study`)
- [ ] 9.1 — Quiz me and flashcards. **Built (31 Oct), not committed, for the advisor's review** (decisions below; the migration local only).
  - **Quiz me in the document** (`src/editor/schema/quizMe.ts`, both editors):
    - **Per section:** a "Quiz me" pill on each summary section heading with a cue question (7.7). It hides the section's blocks and shows "? <cue>" with Reveal; Reveal shows it again.
    - **All sections at once:**
      - the iPhone's dark Quiz me button under the summary (now live; it reads "Show all" while on);
      - the document menu's "Quiz me" / "Show all sections" (both devices).
      - It covers a Summary tab, a New summary tab, a Unit summary, an exam pack.
    - **View only:** a plugin state and decorations, so no save, no `editedAt`, no version, no undo step. It's per device and per opening.
    - **Not in exports:** no pill in the read-only editor the PDF export lays its pages out in.
  - **Flashcards' sources:**
    - Unchanged: the assistant's Flashcards and Make flashcard (6.3), and a summary's own flashcards (7.7).
    - **New:** a summary also saves its key terms (glossary, `kind` term → "TERM") and its self-test (`kind` question → "QUESTION"), by code, with its own cards.
    - **Each front once per lecture** (case, spacing and `**` ignored), so a summary written again adds only new cards. One saved before 9.1 gets its terms and questions the next time the lecture opens.
    - Unit summaries and exam packs (7.9) still save only their own flashcards.
  - **Review** (`app/(main)/review`, `src/components/review/`, `src/services/review.service.ts`, `src/lib/review/`):
    - **Flashcards** (desktop-08 / iphone-10):
      - The due cards, the longest-waiting first; "Card n of N"; the progress bar; "From your marks: …" (when the cards are one lecture's).
      - The card: its label (TERM · QUESTION · FLASHCARD; with the course on the iPhone) and "Click / Tap to flip".
      - **Again · Hard · Good · Easy:** on the laptop each shows its next interval; keys 1–4.
      - **Flip and skip:** Space flips (laptop), a tap flips (iPhone). A swipe skips on the iPhone, → on the laptop; the card stays due.
      - **The back:** the answer, "From <lecture>", Delete card (Undo).
      - **End:** "All done for today · N cards reviewed today".
    - **Quiz me** (desktop-07, as far as the data allows): the summaries' self-test questions.
      - The order: the due cards' lectures first, then the others, newest summary first; questions in summary order.
      - "Question n of N", the lecture's "From your marks" line, the progress bar.
      - The chip "Exam 9/10 · from 06:40" when the question came from her mark (its type and level from the section's chips, its time from the exam signal or the section).
      - Show answer (the answer in the card), Next question. No answer options or hints (those come with 9.1b's quizzes).
    - **Laptop:** no sidebar. The top bar shows "Review today · Course › Lecture" over the lecture's title, and Quiz me | Flashcards (`?mode=quiz`).
    - **iPhone (the Review tab):** "Review", "N due today", Flashcards | Quiz me.
  - **The rating rule** (`lib/review/schedule.ts`, SM-2-like):
    - Again: due in 1 minute (back in the session), the card starts over, ease −0.20.
    - A new card: Hard 1 day, Good 3 days, Easy 7 days.
    - After that: Hard × 1.2 (at least a day more), Good × ease, Easy × ease × 1.3.
    - Ease: Hard −0.15, Easy +0.15, never under 1.3. Whole days, at most 365.
    - The day 1/3/7/21 lecture reminders stay 9.2's.
  - **Sync and offline:**
    - **Laptop:** writes a rating at once with `review_card` (the later review of a card wins).
    - **iPhone:**
      - It keeps `flashcards` and `review_schedule` in its copy (the library download), so Review works offline.
      - A rating is written there and queued (`review_card`, the latest rating per card). Opening Review brings its copy up to date first.
      - Review today counts from that copy (offline too).
    - **Delete card** needs a connection.
  - **Migration `20261029152000_review_cards.sql`** (local; Lea pushes it after a dry run):
    - `flashcards.kind`, and `review_schedule.last_grade` takes `hard`;
    - a trigger gives every live card its review row (due at once), removes it when the card goes to the trash, and adds it back when it's restored;
    - the backfill for cards saved before;
    - `review_card(…)` (the later review wins, the student's own cards only).
    - pgTAP `16_review_cards.test.sql`. `01_isolation` no longer inserts the card's row by hand (the trigger does).
  - **Tests:**
    - **Jest:**
      - `review.test.ts`: the rule, the cards, the deck, the counts, the quiz decks, the session;
      - `quizMe.test.ts`: the pills, hide and reveal, all at once, never an edit, no pill read-only;
      - updated: the 7.7 placement (cards per lecture) and `useLayoutMode` (`review`).
    - **Chrome:** `review.mjs` (in my scratchpad; no paid call), with composites beside desktop-07, desktop-08 and iphone-10, light and dark.
    - **Builds:** `editor:build` needed (the Quiz me plugin and its CSS); no new EAS build; no new dependency.
- [ ] 9.1b — Create a quiz, in three parts (the advisor's plan, approved 2 Nov).
  - [ ] **9.1b-1 — data, calculator, panel (no AI). Built (2 Nov), not committed, for the advisor's review** (the migration local only).
    - **Migration `20261029152100_quizzes.sql`:**
      - new tables `quizzes` (settings, the calculator's plan, status pending → generating → ready | failed, soft delete), `quiz_sources` (lecture, resource or past exam), `quiz_questions` (8 types, the type's fields in `data`, `answer_text`, explanation, hint, Added context, the source: lecture and time or file and page, focus, difficulty, `from_question_id`), `quiz_attempts`, `quiz_answers`; owner-only (`apply_owner_rls`, composite foreign keys);
      - the score trigger: an attempt's points, score out of 10 and pass/fail always from its answers;
      - wrong answers into review: an answer graded wrong or partly makes one flashcard for its question (`source` quiz, `kind` question; a multiple-choice card lists its options), or brings it back from the trash; 9.1's trigger then schedules it. A grade she changes to correct trashes a card never reviewed, unless another answer to the question is still wrong;
      - `course_settings.quiz_*` (10 slider defaults), `files.past_exam_format`, `ai_usage` operation `quiz`, `flashcards.source` `quiz` with one card per question (unique index).
      - pgTAP `17_quizzes.test.sql` (38); `01_isolation` covers the 5 new tables (129).
    - **The calculator** (`supabase/functions/_shared/quiz-plan.ts`, no imports; Jest `quizPlan.test.ts`): BUILD-PLAN's 10 sliders → numbers and one slot per new question (category, type, difficulty, focus, recall or understanding, lecture). Number of questions 5 × the value; the wrong answers that come back first; the mix where Definitions, Calculations and Theory vs practice pull against each other (the worked example D 8, C 3, T 7, 25 questions → 7 · 3 · 5 · 10); Exam focus (3 questions per flagged moment at most; at 10 only flagged moments, a shorter quiz and a notice when there are too few); My weak spots; a difficulty table; the types (a past exam's shares in 9.1b-2). Whole numbers throughout.
    - **The settings** (`_shared/quiz-settings.ts`): what Create saves, the choices' defaults, the check.
    - **New quiz** (`src/components/quiz/NewQuizPanel.tsx`; the rules in `src/lib/quiz/panel.ts`, Jest `quizPanel.test.ts`; data in `src/services/quiz.service.ts`): desktop-02's frame on the laptop, iphone-05's full-screen sheet on the iPhone. The course; the topic (Whole course, folders, lectures; one without a transcript greyed); resources (My notes and marks always, the lectures' summaries and their slides and photos, files **+ From my library** or uploaded into the course); past exams (shown with "Format read in a later update"); the 10 sliders, presets (Quick check, Exam tomorrow, Deep understanding, Reset) and Save as course default; the choices; the calculator's preview line. **Create quiz** saves the quiz pending with its settings, plan and sources; nothing calls a function (the questions are written in 9.1b-2). Needs a connection.
    - **The summarize panel is unchanged:** its slider rows, presets, resource cards and rows and add buttons are now shared pieces (`src/components/panel/`), drawn exactly as before; its "+ From my library" stays greyed.
    - **Review → Quiz me:** + New quiz and every quiz, newest first (title · questions · "Saved · written in a later update" · Take, greyed until 9.1b-3); its … menu (right-click, long-press): Delete quiz, with Undo. The iPhone keeps `quizzes` in its copy, so the list shows offline.
    - **Tests:** Jest +88 (2,579); pgTAP as above; Chrome `quiz.mjs` (in my scratchpad), with composites beside desktop-02 and iphone-05.
    - **Builds:** no `editor:build`, no EAS build, no new dependency.
  - [ ] **Cancel recording (Lea, 6 Nov; before 9.1b-2). Built (6 Nov), not committed, for the advisor's review.** DESIGN "Discard recording".
    - **Where:** the Stop & summarize panel's red Discard recording (laptop: far left of the footer; iPhone: a link at the end of the sheet), opened from a recording only; the document menu's Recording › Discard recording… (last), on both devices. It asks "Discard this recording?" (Cancel · Discard) with the lecture's or document's title; the recording goes on until Discard.
    - **What it does** (`services/discard-recording.service.ts`, `recording-flow` `discard`, the recorder's `discard`): the microphone closes; the recording's waiting upload and transcription jobs are removed and one in flight is waited for (20 s at most); the audio left on the device is deleted (never sent, never offered as interrupted). A new lecture goes to Recently Deleted (keeping the audio that reached Studiply before Discard), with Undo. Recorded inside a document: My notes saved as the version "Before discarding the recording", this recording's time chips taken off and its mark chips kept as words (`editor/discardRecording.ts`, the editor's `unstamp`); only this recording's chunks, segments and audio files deleted; a plain document is a document again (its photos kept); a lecture keeps its earlier audio and gets its status and length back. No summary request, no AI call.
    - **A late upload or transcription** (`services/recorder/discarded.ts`): checked before it sends and after it wrote; one that still lands after Discard runs the clean-up again, which deletes by the recording's range.
    - **iPhone offline:** its copy changes at once; the server half is queued (`discard_recording`, after the lecture's own creation or conversion).
    - **Tests:** Jest +32 (2,611): the recorder (offline, an upload waited for, an upload and a transcription that answer after Discard leave nothing, an earlier recording kept), the flow, the service, the notes. Chrome `discard-recording.mjs` (in my scratchpad).
    - **Builds:** `editor:build` needed (the editors' `unstamp`); no EAS build, no migration, no new dependency.
  - [ ] **Graphs redrawn from photos (Lea, 6 Nov; the approved plan). Built (8 Nov), not committed, for the advisor's review.** DESIGN "Graphs redrawn from her photos", SUMMARY-SPEC "Where the visual comes from" (source 5).
    - **When:** Visuals 5 or more (the calculator's `visualsFromPhotos`), the photos ticked and sent (images consent). Then the generate prompt has the photo rule (`PHOTO_CHARTS_RULE`) and the Visuals line adds "redraw the graphs in the photos".
    - **Blocks** (`summary-zod.ts`, all optional so older summaries still pass): `fromPhoto` on dataChart, functionPlot and modelGraph; dataChart adds pie and scatter and `approx` on a point.
    - **Checks** (`summary-checks.ts` `fixPhotoCharts`, before `fixPhotos`): a photo it wasn't given → an ordinary chart (data) or gone (function, model); below Visuals 5 or without the photos → gone; at most 2 per photo; fewer than 2 values → gone; another section → moved to its photo's, before the photo. Faithfulness and `fixCharts` skip a graph from a given photo. Report `photoCharts { pass, kept, approxValues, removed, moved, cleared }`.
    - **Document** (`summaryDoc.ts`): the graph, the photo small (35 %, `media`), the italic caption "Redrawn from your photo at mm:ss — check the values" (`ai`); the full-size photo dropped in that section. "≈7.5" in the table; `editor/graph/data.ts` `readNumber` reads ≈ and ~.
    - **Free eval** (`scripts/eval-summaries.ts`): 4 new `--faults` (a photo not given, Visuals 3, 1 value, the wrong section); the fixture `synthetic-chart` (`scripts/fixtures/synthetic-chart-lecture.ts`, 10 min, a bar chart 2019–2023: 12, 15, 9, 18, 21, the values never said); its saved summary compared with the photo (±10 %, kind, series, section, the photo's time). Its photo is drawn by the web-check folder's `chart-photo.mjs`.
    - **Tests:** Jest +17 (2,639). One paid run by the advisor (≈ $0.10–0.15, cap $0.30).
    - **Builds:** `editor:build` needed (`readNumber` is in the iPhone's editor). `summarize` redeployed for the remote (Lea). No migration, no new dependency, `src/lib/charts` untouched.
  - [ ] **9.1b-2 — the quiz written. Built (8 Nov), not committed, for the advisor's review** (the approved plan, `docs/reports/plan-9.1b-2.md`; its §7 recommendations adopted). DESIGN "Quizzes being written".
    - **The `quiz` Edge Function:** `{ quizId }` claims the quiz (pending, failed, or "generating" with no news for 5 min) → 202, then writes it in the background; `{ mode: 'format', fileId }` reads a past exam's format on Sonnet 5.5 once and saves it on the file. Through `claudeGate` (new `ownQuiz`); `quiz` counts for today's limit; every call logged in `ai_usage` (operation `quiz`, the quiz's first lecture; a format read against none).
    - **The run** (`_shared/quiz-pipeline.ts`, everything injected): the plan computed again on the server (`quiz-input.ts`, the panel's rules moved there); exam and weak slots given their spans; the material as one cached prefix; batches of at most `QUIZ_BATCH` (15), the later ones on the first one's first event, each tried once more (a 4xx not); the checks (`quiz-checks.ts`); one verify call; one repair call; the wrong questions that come back copied; a fixed shuffle; saved, ready (fewer when some couldn't be checked) or failed with a code. The row is read before every call (batches, verify, repair): Delete stops it. A time budget skips repair after 110 s and verify after 130 s.
    - **The checks:** the type's data (zod, `quiz-zod.ts`); the slot's type and span (±90 s); the form per type; the source (lecture and time, file and page); duplicates; a past exam's stem copied; the language; faithfulness (7.5's finder; a calculation or application question's numbers are an exercise's, its formulas are checked): added in the explanation → Added context, a right answer not supported → dropped. The report in `quizzes.checks`.
    - **The app:** Create saves and starts (`startQuiz`: the permissions, then the function); Quiz me's row follows the quiz (every 5 s while writing), Start, Try again (`src/lib/quiz/status.ts`); a past exam's format read when it's added (its line, Number of questions to its length, the preview with its mix). The app never writes a quiz's status.
    - **Migration `20261029152200_quiz_checks.sql`** (local): `quizzes.checks jsonb`; pgTAP `18_quiz_checks.test.sql` (5).
    - **Free eval:** `npm run eval:quizzes` (saved quizzes checked again; `--faults`: 13 faults planted in `scripts/fixtures/quiz-good-answer.ts`, also run by Jest); `--generate` (PAID, the advisor's): `synthetic-pair` (Tema 1 and 2, the synthetic past exam `scripts/fixtures/synthetic-past-exam.ts`).
    - **Tests:** Jest +74 (2,713). Chrome `quiz.mjs` rewritten for 9.1b-2 (in my scratchpad), the AI answered in the page and the server's part played by the check.
    - **Builds:** no `editor:build`, no EAS build, no new dependency. `quiz` deployed and the migration pushed by Lea (Things Lea must do).
    - **After the paid run (advisor, 8 Nov):** every multiple-choice right option was first: the server now saves each new one's options in a fixed shuffled order (seeded by the quiz and its slot), `correct` moved with them, the answer text the same; `eval:quizzes` fails when 4 or more all have the right option in one place. Hints that gave the answer away: a prompt rule (point to the moment or the concept family; never the answer, a paraphrase of it, or an option ruled out by name), and a code check that empties a hint holding a content word of the right answer the question doesn't (`hintGivesAway`; a paraphrase in other words can't be told by code); `checks.hintsDropped`.
  - [ ] **9.1b-3 — taking, grading, results, offline. Built (8 Nov), not committed, for the advisor's review** (the approved plan, `docs/reports/plan-9.1b-3.md`; its five §6 recommendations adopted, first option each). DESIGN "Taking a quiz".
    - **Grading in code** (`_shared/quiz-grade.ts`, no imports: the app offline, Jest and the function): every type; numbers in Spanish and English formats ("1.234,5", "1,234.5", "1.234" both ways, "3/4", "1,2e3", % and units); words without case, accents or outer punctuation, typos by word length (0 under 6 letters, 1 from 6, 2 from 10); pairs, steps and blanks by share (partly from half; any right blank); a short answer code can't match and every long one `pending` for Claude; unanswered wrong (stored as `{}`: the column is never SQL null).
    - **Grading by Claude** (`quiz` function, `{ mode: 'grade', quizId, attemptId }`; `_shared/quiz-grading.ts`; `GRADE_SCHEMA` in the probe): Sonnet 5.5 (`CLAUDE_MODELS.quizGrade`) sees only the question, model answer, key points and her answer; a one-line reason in the quiz's language; written only where the answer is still pending (her grade, also one set while the call runs, wins); logged in `ai_usage` (quiz); 502 `grading_failed` leaves them pending.
    - **The app:** `src/lib/quiz/session.ts` (each attempt's own order, pairs and steps shown shuffled per question and never in the right order, resume, time, keys, the score as the trigger, Resume/Last); `src/services/quiz-attempt.service.ts` (load, start, save with code grading, finish with unanswered as wrong, her grade keeping `original_verdict`, the grading call, a file source opened); `src/components/quiz/QuizScreen.tsx`, `AnswerArea.tsx`, `QuizFeedback.tsx`, `QuizResults.tsx`; the route `app/(main)/review/quiz/[id].tsx` (full screen on the iPhone); QuizList: Take/Resume, "Last: 7.5 / 10", Results. Hints recorded (`hint_used`), no penalty.
    - **Offline (iPhone):** `quiz_questions`, `quiz_attempts`, `quiz_answers` downloaded with the library; `quiz_attempt`, `quiz_answer` (one per question, the latest wins) and `quiz_grade` queued in order (no permission / today's limit: kept as failed; offline: tried again; then a download). The laptop is online only.
    - **No migration.** pgTAP `19_quiz_taking.test.sql` (13).
    - **Free eval:** `npm run eval:quizzes -- --grading` (40 answers in `scripts/fixtures/quiz-answers.ts` graded as expected; 14 planted grading faults each caught). `--grade` (PAID, the advisor's: 8 Spanish answers through the local function, ≈ $0.03, cap $0.10; saved to `tests/output/quiz-grade/`).
    - **Tests:** Jest +45 (2,758). Chrome `quiz.mjs` extended (in my scratchpad): every type taken with the keys, the AI's grades played, results and her grade, Resume, Results, both time limits, at the end, 390, the laptop offline; composites beside desktop-07 and iphone-10.
    - **Builds:** no `editor:build` (nothing in the editor bundle), no new dependency (expo-sharing and expo-file-system were there). `quiz` must be redeployed for grading (Things Lea must do).
- [ ] 9.2 — Spaced review and course settings

## Phase 10 — App Store and web launch (`phase-10-launch`)
- [x] **10.1 — Apple's rules inside the app. Committed `10de9c9`** (the approved plan, `docs/reports/plan-10.1.md`; D0–D8 adopted, first option each). DESIGN "Apple's rules (step 10.1)".
  - **Sign in with Apple:** `expo-apple-authentication` 8.0.8 (installed by the advisor; plugin and `ios.usesAppleSignIn` in app.json) on the iPhone, Apple's JS sign-in on the web (no client secret); both through `supabase.auth.signInWithIdToken` with a hashed nonce (`src/services/apple-auth*.ts`). The sign-in screen: Continue with Apple above "or with email"; the iPhone's welcome step (iphone-11). Settings → Account: Email, Sign in with Apple Linked / Not linked (D6: no Link button yet).
  - **Delete account** (Settings → Account's red card; under Sign out on the iPhone's list): type DELETE; the `delete-account` Edge Function (her own token; the service role only inside) removes her files in the three buckets (`account_storage_objects`), revokes her Apple token when configured (else skipped and logged), then deletes her auth user (every table cascades); idempotent. The device is then signed out and wiped. Online only.
  - **AI consent:** one screen (`components/consent`: desktop-09's card, iphone-12's full screen) replaces the three alerts; `ensureConsent` keeps its signature (13 callers unchanged); one Allow writes the three scopes under `2026-11-store-1`. Settings → AI & privacy: "Use AI on my lectures" (iphone-08) with its date; off in one tap (`withdraw_ai_consent()`, the server's time), also offline (`lib/consentGate`: nothing sent from this device at once; queued `consent_withdraw` on the iPhone). After withdrawal: the app sends nothing to an AI function; the server refuses; a summary or quiz being written stops before its next call (`consent_withdrawn`).
  - **Recording reminder:** before the first recording, once per account (`profiles.preferences.recordingReminderSeen`); the same text under Settings → Recording.
  - **Permission texts** (app.json): microphone (the same in Info.plist, expo-av, expo-audio), camera, photo library rewritten; notifications have no text on iOS (9.2 explains them in the app).
  - **Migrations** (local): `20261029152300_store_rules.sql`; `20261029152400_cascade_safe_triggers.sql` (the advisor's review: deleting an account failed with "permission denied for table quiz_attempts", because the auth service deletes as `supabase_auth_admin`, which has no table grants, and AFTER triggers fired by the cascade run as it. Every trigger checked; `quiz_answer_touch_attempt` now skips on DELETE when the caller may not update attempts, which only the account cascade is, and it deletes the attempts too). pgTAP `20_store_rules.test.sql` (19): the deletion is done as `supabase_auth_admin` where the session may take that role, and is skipped otherwise (the local stack refuses it: "permission denied to set role"); every AFTER update/delete trigger in public is listed, so a new one must be checked. **`npm run check:account-deletion` is the end-to-end guard for the cascade** (through the real auth service): run it after any migration that adds a trigger or a table with a user_id, as part of the web checks.
  - **Free checks:** `npm run check:account-deletion` (two accounts with a row in every table and files in every bucket; nothing of the deleted one left, the other untouched; idempotent).
  - **Tests:** Jest +33 (2,791). Chrome: new `account.mjs`; `quiz.mjs`, `flows.mjs`, `ai-flow.mjs`, `testuser.mjs` updated (in my scratchpad).
  - **Builds:** no `editor:build`. EAS development build needed for the iPhone's Sign in with Apple, the permission texts and the device wipe (Things Lea must do).
- [ ] **10.1b — Legal pages, privacy and accessibility before launch** (the approved plan, `docs/reports/plan-10.1b.md`; D1–D10 adopted, the recommendation each). Five sub-steps.
  - [ ] **10.1b-3 — Audio auto-delete. Built (9 Nov), not committed, for the advisor's review.** DESIGN "Recordings deleted 3 days after transcription".
    - **Migration `20261029152600_audio_auto_delete`** (local): `lectures.transcribed_at` (the server's time when the last chunk of a recorded lecture is transcribed: an AFTER trigger on `audio_chunks` status, or the lecture's BEFORE trigger when it moves past recording with every chunk done) and `lectures.audio_deleted_at`. `audio_delete_after` is now the server's: `transcribed_at + 3 days` while on `delete_3_days` and not deleted, null otherwise, set on every write (changing the setting changes or clears it; an app's own date is replaced). D9 (`private.audio_retention_before_auto_delete`, run once): **nothing recorded before 10.1b-3 is auto-deleted; Lea can delete old audio herself.** Every existing lecture on `delete_3_days` whose audio isn't deleted → `delete_manually` with no date, whether it had no date or one the app set (even a past one); only lectures still being recorded, uploaded or transcribed without a date keep the new default. `audio_purge_plan(due)` / `audio_purge(lecture_ids)` (service role).
    - **purge-trash** (local; deploy is Lea's): after the trash, the due recordings: their files removed through the Storage API, then their chunks' paths cleared and the lectures marked deleted (only once the files are gone; a failure leaves them for the next night). The two parts run independently. The response adds `audio: { lectures, chunks, objects }`.
    - **App:** defaults to Delete in 3 days (`useUserSettings`, post-session, the review screen, which starts on her Settings default); `bulkApplyRetention` no longer sends a date, and "Delete now" marks the lecture deleted; the notes' Source Files say "Deletes on …" / "Recording: Deleted on …" (`utils/audioRetention`, `getLectureAudio`).
    - **Tests:** Jest +6 (2,847). pgTAP: new `22_audio_auto_delete` (26), `20`'s trigger list adds `audio_chunks.audio_chunk_transcribed`. `npm run check:purge` extended (two students' due recordings deleted, the rest kept; refuses if anyone else's recording is due). Chrome: new `audio.mjs` (in my scratchpad).
  - [x] **10.1b-2 — Sign-up: the Terms and 16+. Committed `769990f`.** DESIGN "Accepting the Terms, 16 or older".
    - **Sign-up:** two unticked boxes ("I agree to the Terms of Service and the Privacy Policy", both linked; "I am 16 or older", D2) above Create account, greyed until both (`components/legal/TermsCheckboxes`); the iPhone's welcome has them in place of iphone-11's footer line. The acceptance goes in the sign-up metadata (`terms_version` = LEGAL_VERSION, `age_16`).
    - **Migration `20261029152500_terms_acceptance`** (local): table `terms_acceptances` (version, 16+ confirmed, `sign_up` / `gate`, `accepted_at` = the server's `now()`); the new-user trigger (`create or replace private.handle_new_user`) saves the sign-up's (only a well-formed version with `age_16` true; anything else never stops the account being made). A student may only insert her own row, only the version, 16+ and source (the time and owner can't be given); nobody can change or delete a row; a version is accepted once. Cascades with the account (no trigger).
    - **The gate** (`components/legal/TermsGateHost`, mounted in `app/_layout.tsx`): after sign-in, an account with no acceptance (first Sign in with Apple, older accounts, Lea's own) is asked once; "I don't agree" signs out (D3). Boxes ticked before Continue with Apple are saved instead of asking. Only when the server answers (offline: never blocks); "accepted" remembered per account on the device (`services/terms.service`).
    - **Tests:** Jest +12 (2,841): terms.service. pgTAP: new `21_terms_acceptance` (24), `00` and `01` (+5) list the table. `check:account-deletion` and `account.mjs` count it. Chrome: new `signup.mjs`; `testuser.mjs` gives every test user an acceptance (`terms: false` for none), `account.mjs` (in my scratchpad).
  - [x] **10.1b-1 — The legal pages. Committed `ff7d818`, `8730e0f`.** DESIGN "The legal pages".
    - **Pages:** `/privacy`, `/terms`, `/refunds`, `/cookies`, `/legal` in `app/(legal)/`, which the root layout lets through signed out. One component draws the blocks (`components/legal`); tables become cards on the iPhone. The iPhone shows the same screens from texts bundled with the app (D7).
    - **From markdown, no dependency:** `scripts/lib/legal.cjs` reads the subset the texts use (title, headings, bold-only lines as subheadings, lists, tables, **bold**, web addresses, emails, links between the pages) into `src/legal/texts.generated.ts` with `LEGAL_VERSION` (the newest "Last updated" date, or `draft`, plus 8 hex of a SHA-256 of the five files; today `draft-…`), saved at sign-up in 10.1b-2. `npm run build:legal` writes it; a Jest test fails when it is behind docs/legal (outside CI it also rewrites the file, as Jest writes a missing snapshot).
    - **Open-source licences** on `/legal`, generated from `package-lock.json` (run-time packages, platform binaries left out) and each package's `package.json` and licence file: name, version, licence, source, copyright line; in full, the licences with no permissive choice (libheif-js 1.23.5, LGPL-3.0, with the libheif-js and libheif sources and the note that the `.wasm` can be replaced; lightningcss MPL-2.0) and Apache NOTICE files (xcode). `src/legal/licences.generated.ts`, kept up to date by the same test.
    - **Links:** Settings (under the laptop's menu; the foot of the iPhone's list), sign-up and sign-in (in a sheet, so the form is kept; the checkboxes are 10.1b-2), the consent screen's Privacy policy (in a sheet over it).
    - **Texts:** the cookie policy's one new line for Apple's sign-in script (D5); nothing else changed. New `docs/legal/data-breach-plan.md` (not published).
    - **`npm run check:launch`** (not in `npm run check`; on the launch checklist): fails while a bracketed detail is left in docs/legal (Apple's `Settings → [your name] →` path isn't one) or a text says DRAFT, when the generated files are stale, when git tracks a file in `tests/fixtures/` or `tests/output/`, or when text a student reads (app/, src/components/, app.json, the texts) names OpenAI or Whisper. Today it fails on the first two: 44 brackets (36 in the five texts, 8 in the breach plan's contacts) and 5 DRAFT lines.
    - **Tests:** Jest +13 (2,808, one of them runs `check-launch.mjs` itself). Chrome: new `legal.mjs` (in my scratchpad).
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
- **Database tests are separate from `npm run check` (step 1.2).** `npm run test:db` (pgTAP, 197 tests in `supabase/tests/database/` since step 1.7) needs Docker and the local stack, so it isn't in the pre-commit hook; run it after any migration change. `00_rls_enabled` fails if a new table is added without RLS or a policy, or if `anon` gets any access.
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
- **whisper-1's replacement: ElevenLabs Scribe v2, built in but off (29 Oct 2026, branch `transcribe-model`).** OpenAI shuts down `whisper-1`, `gpt-4o-transcribe` and `gpt-4o-transcribe-diarize` on 26 Feb 2027. Its successor `gpt-transcribe` returns no timestamps (only `whisper-1` takes `timestamp_granularities`, per OpenAI's guide), so the time chips need another provider. Compared on 29 Oct (Artificial Analysis AA-WER, list prices):
  - Scribe v2: 2.2 %, $0.22/h ($0.0037/min), word times; ElevenLabs lists Spanish as ≤ 5 % WER.
  - Voxtral Small Transcribe 3: 2.1 %, $0.004/min, segment times only; released 20 Oct and its docs contradict each other.
  - Groq `whisper-large-v3`: today's Whisper quality at $0.00185/min.
  - Deepgram Nova-3 multilingual: about 5.3 %, $0.0052/min.
  - `gpt-transcribe`: 3.3 %, $0.0045/min, no times.

  Nobody publishes Spanish numbers for all of them, hence `npm run compare:transcribe`.

  How it works:
  - **Provider setting.** `TRANSCRIBE_PROVIDER` (Edge Function secret) picks the provider. Unset or `openai` is `whisper-1`, exactly as before. `elevenlabs` is Scribe v2 with `ELEVENLABS_API_KEY`. An unknown value or a missing key answers `not_configured`.
  - **Request.** Scribe is asked for word times only: no sound tags, no speakers. The lecture language is sent when it is set.
  - **Sentences.** `wordsToSegments` (`_shared/transcript.ts`) groups the words into one segment per sentence. A sentence ends after `. ? ! …`, before a pause of 1 s or more, or once it runs past 30 s. Unlike Whisper's segments, these don't stretch over pauses, so there can be gaps between them.
  - **Confidence and language.** Confidence = exp(mean word logprob). A detected language counts only with `language_probability` ≥ 0.5. Three-letter codes (`spa`) map to `es`.
  - **No silence filter for Scribe.** It has no `no_speech_prob`, so Whisper's rule for invented phrases doesn't apply.
  - **ElevenLabs' copy.** After each chunk, the function deletes ElevenLabs' stored transcript (`DELETE /v1/speech-to-text/transcripts/{id}`); if that fails it logs `provider_copy_kept`.
  - **Shared code.** Both providers share the retry rules (`_shared/post-audio.ts`).
  - **Tests.** Jest: `transcript.test.ts` and `transcribeProviders.test.ts` (mocked fetch). Not yet run against the real services; see Things Lea must do.
- **`transcribe-chunk` request and order of checks (step 1.5).** `POST /functions/v1/transcribe-chunk` with the user's token and `{ lectureId, seq, storagePath, startMs }`. The order: signed in (401) → valid body, path in the caller's own `{userId}/` folder (400 / 403) → own lecture (404) → consent (403 `consent_required`) → daily limit (429 `daily_limit`) → download → Whisper (502 on failure) → cost into `ai_usage` → chunk row + segments. Nothing is downloaded or sent to OpenAI before the consent and limit checks. `seq` makes it idempotent: a chunk already `transcribed` with the same path is answered from the database with no second OpenAI call or charge. The function reads and writes as the student (RLS applies); only the `ai_usage` insert uses the service role, injected by the Supabase runtime, never from a file in the repo. Logs hold ids, status and timings only, never audio, text or keys.
- **Daily transcription limit: 6 hours of audio per rolling 24 h (step 1.5).** It is the sum of `ai_usage.audio_seconds` for `transcription`, checked before each chunk. A placeholder until plans arrive in step 10.2.
- **Consent version `dev-2026-10` (step 1.5; `dev-2026-10-elevenlabs` since 29 Oct 2026, when the text started naming ElevenLabs).** Edge Functions only count `ai_consent` rows with `CONSENT_POLICY_VERSION` from `_shared/transcript.ts` and `withdrawn_at` null; they never grant consent. Until the step 10.1 screen exists, the check script's test user gives consent with its own client (the same insert the screen will make), and Lea's own account uses `supabase/snippets/grant-transcription-consent-local.sql` (local only).
- **A lecture's language can be unknown (step 1.5).** `lectures.language` is now nullable with no default, and must be an ISO code (`^[a-z]{2,3}$`). null means Whisper detects the language; the detected code is stored on the lecture if it was still empty, and a language set by the student is always sent as is and never overwritten. Step 1.9 must map the old app's `'auto'` to null.
- **Edge Functions live outside the app's tooling (step 1.5).** `supabase/functions/` is excluded from `tsconfig.json` and eslint (Deno globals, `npm:` imports). Pure rules live in `_shared/transcript.ts` with no Deno code, so Jest tests them from `src/lib/__tests__/transcript.test.ts`. Local secrets go in `supabase/functions/.env` (git-ignored; template `supabase/functions/.env.example`), and `supabase functions serve` reads it only when it starts.
- **Edge Functions are type-checked by Deno (step 1.6).** `npm run typecheck:functions` (`deno check` on every `supabase/functions/*/index.ts`, and through their imports every `_shared/` file) is part of `npm run check`, so of the pre-commit hook. It needs no Docker; the first run needs a connection to download the packages into Deno's cache. `--node-modules-dir=none` makes Deno resolve `npm:` imports from its own cache, as the edge runtime does, instead of the app's `node_modules` (the root `package.json` would otherwise make it look there). Supabase's `edge-runtime.d.ts` doesn't load under Deno 2.9, so `assistant-chat` declares the one `EdgeRuntime` function it uses itself.
- **Shared checks for AI functions (step 1.6).** `_shared/guard.ts` holds sign-in, own lecture, consent and usage-today (read page by page, so the 1000-row API cap no longer matters) and the one service-role write, the `ai_usage` insert. `transcribe-chunk` uses it with unchanged checks, codes and messages (`check:transcribe` re-run). The consent version moved to `_shared/policy.ts`.
- **Claude model and settings (step 1.6).** `CLAUDE_MODELS` in `supabase/functions/_shared/claude.ts` is the one config place, one entry per function; both were `claude-opus-5-5`, Anthropic's recommended default (Oct 2026, $4 / $20 per million input / output tokens), until the study assistant moved to Sonnet 5.5 in step 6.1 (next decision). Thinking is always on for Opus 5.5; the skeletons use `effort: low` and `max_tokens` 4096. The SDK is `npm:@anthropic-ai/sdk@0.135.0` (the latest 0.x; 1.0 was only days old), pinned in the import. The SDK retries connection errors, 429 and 5xx twice.
- **The study assistant runs on Claude Sonnet 5.5; summaries stay on Opus 5.5 (Lea, 30 Oct 2026, step 6.1).** `CLAUDE_MODELS.assistant` is `claude-sonnet-5-5`; it covers `assistant-chat`'s questions and quick prompts, and its clarify mode. `CLAUDE_MODELS.summary` stays `claude-opus-5-5` for `summarize` (notes now, the summary engine in Phase 7).
  - **Why:** half the price ($2 / $10 per million input / output tokens, against $4 / $20; a cache read is $0.20 on both), and quicker answers in class. The answers are short and based on the transcript.
  - **Estimated per question:**
    - "What did she just say?": about $0.006;
    - "Explain the last 10 min": about $0.012;
    - a typed question at 90 min: about $0.05 ($0.01 with the transcript cached).
  - **Checked against the Claude API reference (30 Oct):** the prices in `PRICES`, and that the same request settings are valid for Sonnet 5.5 (no thinking parameter, `effort: low`, no temperature, `fallbacks: "default"`).
  - **Switching back** is one line in `CLAUDE_MODELS`. `claude.test.ts` ("match the decisions in docs/PROGRESS.md") and `npm run check:claude` (which reads the models from that file) follow it.
- **Step 6.3's choices (the advisor, 30 Oct 2026; reversible, for Lea to confirm or change):**
  1. **Explain simpler and Rewrite:** Accept replaces the selected text. If the text changed after asking, Insert below instead.
  2. **An accepted replacement makes its block `student`**, so regeneration never removes it. Example / Go deeper boxes are `ai` until she edits them.
  3. **Add to notes:** a "From the study assistant · m:ss" box with the question first; at the recording's time while recording, at the end of My notes after class. It isn't a note line (coverage). "Added ✓" after.
  4. **Flashcards:** `flashcards` rows only, no `review_schedule` (Phase 9 owns review). A toast says "N flashcards saved".
  5. **iPhone:** Ask Claude is in Studiply's own selection bar; no native build.
  6. **The suggestion's look** (no mockup): a card under the selection on the laptop, a drag sheet on the iPhone, Accept · Reject. Existing styles only.

  **Trims:** no Copy on the suggestion card; the cards aren't editable (card editing is Phase 9).
- **Step 9.1 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **Four ratings as the mockups:** Again · Hard · Good · Easy (1 min, 1 day, 3 days, 7 days for a new card); `hard` added to the database. BUILD-PLAN said three.
  2. **Review's Quiz me tab** follows desktop-07 as far as the data allows: the summaries' self-test questions, one per card, with the mark chip, Show answer and Next question. No A–D options and no Show hint (they come with 9.1b's quizzes). The order: lectures in Review-today order, questions in summary order.
  3. **A swipe on the iPhone skips** to the next card (iphone-10's hint); it doesn't rate.
  4. **"From your marks: …"** only when the session's cards are one lecture's (that lecture's Exam and Confused marks).
  5. **Term and question cards are saved by code** with the summary's own; cards can only be deleted in 9.1 (no editing).
  6. **The laptop's Quiz me on all sections** is in the document menu (desktop-03 has no button).
  7. **Lea's iPhone check** is on her list.
- **Step 8.3 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **The laptop keeps the print window's "Save as PDF"** (no new dependency). It proposes the new file name. A true download would need a PDF library and would give pictures of the pages instead of text.
  2. **A summary's margins follow the document's page setup** (Normal 2.54 cm), so the page view and the PDF match, not SUMMARY-SPEC's 20 mm.
  3. **Short tables move whole in summaries**, in the page view too.
  4. **Comments aren't printed** (Studiply's either).
  5. **The iPhone's checks are on Lea's list** (Things Lea must do).
- **Step 8.2 (31 Oct):**
  1. **Who draws the new chart types: Lea's decision.** The work order for the charts session is written (`docs/charts-work-order-8.2.md`); this checkout carries the new kinds and shows their line until the module draws them.

  The advisor's decisions, for Lea to confirm:

  2. **Function plots and model graphs aren't editable in 8.2** (BUILD-PLAN doesn't ask; written again by regenerating). **Suggestion for Lea:** the graph form for them later: the expression, its range and marks; each curve's shift.
  3. **Chart values not said in class** are taken out and listed under "Unclear in the recording" (a chart with fewer than 2 values goes); **photos are placed at their time by code.**
  4. **The formula card's title stays "Formula"** (the summary schema has no name for it, and it's near the grammar limit).
  5. **The Insert menu is unchanged:** the new graph kinds come only from summaries.

  Made while building part B, accepted by the advisor, for Lea to confirm:

  6. **Stacked bars and histograms are drawn as bars until the charts module has them** (as 7.7), and the form edits them like a bar.
  7. **A data chart with fewer than 2 values is removed**, also when Claude wrote it that way.
  8. **Graph titles may be 120 characters** (60 cut a takeaway sentence mid-word); the form allows the same.
  9. **The unclear line for a removed chart value is app text in English** ("A value the lecture doesn't give, left out of the chart “…”: …").
  10. **A function's placeholder line is plain text** ("y = x^2 - 4"), not 7.7's inline formula: it sits inside the graph block.
  11. **A function's expression isn't faithfulness-checked** (a "corrected" verdict could break its grammar), as before.
  12. **The prompt changes** (the grammar in the block guide, one Graphs rule line) take effect on the next paid run; the API schema and its size are unchanged.
- **Step 8.1 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **No new dependency of any kind.** The code module is code-marked lines (as 7.7), monospace, with its language in the label, then "Output" the same way. **Suggestion for Lea:** syntax colours (`lowlight`) and a real code block (`@tiptap/extension-code-block`, today only installed through TenTap) later, with her OK.
  2. **Summaries already written are untouched** until they're written again (then the untouched blocks become modules; her edited ones stay).
  3. **The modules aren't in the Insert menu** (8.1 renders the summary's).
  4. **Cause → effect top-to-bottom** (stacked boxes, ↓) on both devices.
  5. **No mockup shows the modules:** the advisor judges the look from the composites against the module library; Lea reviews later.
  6. **Module tables never split a word** (columns by content, a scroll box when wider); **a lecture with no notes and no marks** starts with "No notes or marks were taken in class" (advisor review).
- **Step 7.9 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **Extend has both targets:** "A new Unit summary" (the default) and "Add to this summary".
  2. **The exam pack is built from the stored summaries,** not the transcripts (cheaper; cap 15 lectures / 40k words).
  3. **The Update callout** is in the exam amber family.
  4. **Studiply comments** keep their author and source (the lecture and time) on the mark; the margin and sheet show "Studiply" and "Lecture 4 · 18:30 · …" only. **Trim:** no ▶ play chip in 7.9 (BUILD-PLAN keeps the time "so later" it can play the recording).
  5. **A synthetic Tema 2** fixture for the paid runs (a repeat, an exam statement about Tema 1, a correction).
  6. **A Unit summary and an Exam pack get a document's menus:** in the library (Open · Rename… · Move to… · Cut · Add to Favorites · Delete, plus Move out inside a folder) and in their document screen (Comments, Export PDF…, and the rest). DESIGN's earlier "Open · Favorites" predates them and would have left them undeletable.
  7. **Menus scroll when taller than the window** (the laptop's anchored menus; a lecture's document menu passed 900 px with Extend added).
- **Step 7.7 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **Where a new summary goes:** the choice is in the summarize panel, shown only when the lecture already has a summary. The default is a new tab ("New summary").
  2. **Extend with next lecture (7.9) and Quiz me (9.1)** are shown greyed, "Coming in a later update" (they're in the mockups).
  3. **The green banner** shows on the lecture's Summary tab when it holds a summary, with no close × (the mockup has none).
  4. **The Full answer link** to the saved assistant answer is built now, minimal: the laptop's panel and the iPhone's sheet open at that question.
  5. **Copies of the two synthetic summaries** are committed as Jest fixtures (synthetic text only).
  6. **The new EAS development build** for the new editor blocks is on Lea's list.
  7. **The notes check line goes under the title on both** (desktop-03): the mockups disagree, and one document has one order.
- **Step 7.6 (the advisor's decisions, 31 Oct, for Lea's list):**
  1. **A 3-hour cap for now** (planned at ≈ $0.80 per summary at most; the measured 90-min cost suggests ≈ $1.30 for 3 h). Longer lectures fail with "Lectures over 3 hours can't be summarized yet."
  2. **Merge by code plus one wrap-up call** (title, takeaways, self-test, flashcards), not a full Claude merge call. It's cheaper (≈ $0.05 vs ≈ $0.25) and keeps the parts as written.
  3. **Slides are cached:** sent once as a prefix shared by every part, with part 1 first so the others read the cache.
  - **Not done (advisor):** no migration and no checkpoint or resume. The run fits in one function call (≈ 65–110 s < 150 s), and the hosting plan is a before-launch item on Lea's list.
- **Step 7.5 (the advisor's decisions, 31 Oct, for Lea to confirm):**
  1. **Missing notes and marks are put in by code** (no Claude call): a note into the "From your notes" block of its section, a mark as a chip.
  2. **At most 3 part calls per summary** (≈ $0.15 and ≈ 30 s at most on top of the summary).
  3. **Length counts** the takeaways, sections and glossary; not the notes, self-test, flashcards or header.
  4. **Unverified items go to one verify call,** then are corrected in place or moved into "Added context · not from the lecture"; never deleted.
  5. **The fixture exporter is written in this step** (`scripts/export-fixture.mjs`, local Supabase only).
  6. **Faithfulness skips exercise content** (after the free evaluation: all 8 numbers it couldn't find in the 7.4 output were made-up exercise numbers the spec asks for). Its numbers, dates and formulas aren't checked, and moving them would break the blocks.
     - **Skipped:** confusedHere's `example` and `practiceQuestion`, "example" callouts, and the answers of apply and calculate self-test questions.
     - **Still checked,** as the lecture's content: paragraphs, takeaways, definitions and other callouts, formula blocks, worked examples (as the professor did them), exam signals, the glossary, recall and why answers, and flashcards.
     - **The language check** still reads everything.
- **Step 7.4: zod (Lea OK'd it, 31 Oct).** This replaces the advisor's earlier "no zod" decision of the same day.
  - **Version and scope:** zod **4.6.7** exactly (MIT), **server-side only**.
    - The Edge Functions import `npm:zod@4.6.7`, pinned like the SDK.
    - It is a devDependency for Jest, which maps that specifier to the installed zod (`moduleNameMapper`), so Jest runs the very same file; tsconfig's `paths` does the same for tsc.
    - **The app never imports it:** only type imports reach the summary files.
  - **What checks what:**
    - `_shared/summary-zod.ts` checks Claude's answers: the outer summary, the classify answer, and each block's `data` per type (the spec's block shapes); it also writes the prompt's block guide.
    - `parseSummary` keeps the semantic work: notes copied by code, ids that exist, coverage.
  - **The API contract stays the JSON Schema constants** (`_shared/summary-schema.ts`, structured outputs). `z.toJSONSchema` adds safe-integer minimum/maximum to whole numbers, which structured outputs refuse, so a Jest test checks zod and the constants agree.
  - **The hand-written validator `checkSchema` is gone** (no file became unused).
- **Step 7.4, the earlier "no zod" decision (the advisor's, 31 Oct, replaced above):**
  - **What it was:** BUILD-PLAN's "validate the JSON with zod" was to become structured outputs (`output_config.format`) with one JSON Schema constant (`_shared/summary-schema.ts`), plus our own small validator and `parseSummary` for what a schema can't say (ids exist, notes copied by code).
  - **What structured outputs accept (the claude-api reference):** basic types, enum, const, anyOf, allOf, $ref/$defs, additionalProperties: false with every field required. Not recursive schemas, minimum/maximum/multipleOf, minLength/maxLength, or complex array limits. The schema stays inside that, and a Jest test checks it.
  - **First run:** a new schema's first request compiles it once (cached 24 h).
  - **Fallback:** if the API ever refuses the schema as too complex, blocks become `{ type, data }`.
  - **Classify:** on Opus 5.5 too (Lea's rule: summaries on Opus).
  - **Hosted Supabase stops a function at 150 s (free) / 400 s (paid):** the run is in the background, but the limit still applies. It's a before-launch item on Lea's list, not a 7.4 blocker.
- **Step 7.2's answers to the spec's open points (advisor, 30 Oct, for Lea to confirm; reversible):**
  - **A. Self-test 1 vs high marks:** high Exam and Important marks still get their self-test question. The count is max(the slider's count, the questions they need).
  - **B. Takeaways:** they rise to fit the high Important marks, up to 5. Beyond 5, a bullet carries several marks (`fromMarkIds[]` in 7.4).
  - **D2. Follow my marks** scales the assistant question's Confused 6 (her own action), **but not** repetition: it's the lecture's signal, like the professor's exam phrases, so it stays Important 6 (mid).
  - **E. Detection:** the professor's exam phrases and repetitions are inputs to the calculator. The pipeline (7.4) decides how to find them.
  - **G. Follow my marks 1:** the student's marks are chips only (the spec: "at 1 they only show as chips").
  - **H. The exam format sets the question kinds:**
    - multiple choice → recall + apply;
    - essay → why + apply;
    - problem-solving → calculate + apply;
    - open book → apply + why;
    - oral → why + recall;
    - not set → recall + apply.

    30 % are why/how in every case.

  **Engineering, settled:**
  - **C:** a high-band mark raises the length check's upper bound from 115 % to 120 % of the target.
  - **D:** "already marked" = a Confused mark of hers inside the question's window, ±30 s.
  - **F:** why/how = round(30 %), half up.
  - **I:** whole-word targets, no minimum; "high" = the 8–10 band.

  All are in SUMMARY-SPEC as notes under the tables.
- **Server-side fallbacks on (step 1.6).** Every Claude call sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): if Claude declines a request for policy reasons, Anthropic re-runs it on its recommended model for that kind of refusal inside the same call. The cost is priced per attempt from `usage.iterations`, each at its own model's price (a model missing from the price table is priced like the dearest one, so a limit is never undercounted), and `ai_usage.model` records the model that answered. Only a refusal by the whole chain reaches the student: an `error` event `refused` (assistant) or 422 `refused` (summarize).
- **`assistant-chat` and `summarize` (step 1.6).** `POST /functions/v1/assistant-chat` `{ lectureId, message }` (max 4000 characters) and `POST /functions/v1/summarize` `{ lectureId }`, with the user's token. Order of checks: signed in (401) → server has the key (500 `not_configured`) → valid body (400) → own lecture (404) → `assistant_summary` consent (403 `consent_required`) → daily limit (429 `daily_limit`). Nothing reaches Anthropic before all of them pass. `summarize` still answers a fixed test prompt (Phase 7). `assistant-chat` has its real prompts and saves `assistant_messages` since step 6.1 (see Phase 6 above). Logs hold ids, status, timings and token counts only, never the message, the answer or keys.
- **Streaming format (step 1.6).** `assistant-chat` answers `text/event-stream`: `event: delta` `{ text }` for each piece, then `event: done` `{ model, stopReason, usage, costUsd }`, or `event: error` `{ code, error }` instead of done, after which the app discards the pieces it got. Errors found before streaming starts stay plain JSON like the other functions. `summarize` answers JSON `{ text, model, stopReason, usage, costUsd }`, but streams from Anthropic itself because real summaries will be long.
- **Claude's cost is logged once, when the answer ends (step 1.6).** If the student hangs up mid-answer, the answer still runs to the end (kept alive with `EdgeRuntime.waitUntil`) and is logged, because Anthropic bills it either way. If Claude fails mid-answer, the part already written is logged. `check:claude` proves one row per answer, also after hanging up.
- **Daily Claude limit: $3 per rolling 24 h (step 1.6).** It is the sum of `ai_usage.cost_usd` for `assistant` + `summary`, checked before each call; a placeholder until plans arrive in step 10.2. Consent scope for both functions is `assistant_summary`; transcription consent alone doesn't allow them.
- **How the old screens read the new schema (step 1.7).** Services keep their old signatures and types (`Project`, `Session`, `Note`…) and `src/lib/cloudRows.ts` maps the step 1.2 rows onto them: a project is a `courses` row; a session is a `files` row (kind lecture) plus its `lectures` row; status draft/recording/transcribing/failed stay, processing and review are stored as transcribing, completed as ready (uploading reads as transcribing); language `'auto'` is null; recording mode has no column (it is passed through the recording flow and stored with the note). The "Project Files" pseudo-session is a lecture titled `Project Files`, as before. Phases 2–4 rebuild the screens on the new model.
- **Old structured notes live in `summaries.result` (step 1.7).** One `summaries` row per note (`mode` new, `status` done, `result.format` = `legacy-note-v1`); a note goes to Trash with its lecture. The Phase 4 editor and Phase 7 engine replace it with document blocks; step 1.9 moves old notes the same way.
- **Trash without transactions (step 1.7).** PostgREST has no multi-statement transaction, so each action writes children first, then the parent, with one shared `deleted_at`; restore brings back the children with that same timestamp. Because deleting a course or folder cascades to its contents, restoring a lecture or folder also restores its trashed folders and course. Permanent deletes remove the lectures' Storage files after the rows (best effort). Creating a lecture removes its `files` row again if the `lectures` insert fails.
- **Recording files (step 1.7).** After Stop, each 20-minute chunk is uploaded to `audio-chunks` at `{uid}/{lectureId}/{seq}.m4a|webm|mp4` (the server names the Whisper file by its extension) with an `audio_chunks` row (seq, start, duration); recording has ended, so uploads never interrupt it; Retry on failure. Photos (JPEG) and PDFs go to `photos` / `slides` with `media` rows; a PDF's original name is in `media.caption` because Storage paths must be ASCII. Screens show files through 1-hour signed links. Audio retention is per lecture and only affects audio (photos and PDFs are study material and stay); `delete_now` keeps the chunks' transcript.
- **Study notes and clarify on the server (step 1.7).** The old app's prompts moved into `supabase/functions/_shared/legacy-notes.ts`; `summarize` with `task: 'notes'` reads the transcript and (with `includeMedia` and `images` consent) photos and PDFs itself and returns a JSON note enforced by structured outputs; `assistant-chat` with `mode: 'clarify'` explains highlighted parts in plain text. `max_tokens` 4k / 8k / 16k per level, because thinking counts toward it. Without `task` / `mode` the step 1.6 test prompts answer unchanged.
- **Consent prompt for development (step 1.7).** Before the first call of each scope (transcription, assistant_summary, images) the app asks Allow / Not now and inserts `ai_consent` with `dev-2026-10`; Not now sends nothing and keeps the lecture. Remembered per app session, forgotten on sign-out. Step 10.1's real screen and policy version replace it.
- **Simulated AI is development only (step 1.7).** `EXPO_PUBLIC_MOCK_AI=1`, or Edge Functions that can't be reached at all (no `supabase functions serve`), make `ai.service.ts` use a simulated transcript, note and clarification: no consent asked, nothing sent, nothing counted. Ignored when `__DEV__` is false. A real error from a reachable function is never hidden behind it.
- **Usage instead of credits (step 1.7).** Students no longer bring OpenAI or Anthropic accounts: the budget/"piggy bank" screens and provider pings are gone. Settings, Manage Account and the Record screen show today's use from `ai_usage` against `DAILY_LIMIT_SECONDS` and `DAILY_CLAUDE_LIMIT_USD`, imported from the Edge Functions' Deno-free rules so app and server agree.
- **Settings per device (step 1.7).** The schema has no settings table, so the old General settings are kept per device (AsyncStorage / localStorage, key `studiply.settings.<userId>`); only the default language is in the cloud (`profiles.default_language`). Phase 7's course sliders replace most of them. The step 1.3 SQLite bridge (local profile on sign-in, name mirroring) is gone; `localProfile` keeps only "Delete data on this device".
- **No SQLite on the web, enforced (step 1.7).** `db.web.ts` is deleted: nothing on the web imports `src/lib/db`, a new import would fail the web build, and `npm run check:bundle` checks the web bundle for `expo-sqlite` / `wa-sqlite`.
- **Dialogs that work in a browser (step 1.7).** `Alert` with buttons, `Alert.prompt` and `ActionSheetIOS` do nothing on the web. Screens use `src/components/dialogs` (`showAlert`, `showActionSheet`, `promptText`, `menuTriggerProps`): native dialogs on iPhone, a modal drawn by `DialogHost` on the web, item menus on long-press (iPhone) and right-click at the pointer (web). A lint rule (`no-restricted-properties`) blocks the old APIs outside the helper. On the web, Export PDF opens the print dialog and files open in a new tab.
- **A way out of the recording flow (step 1.7).** The recording, post-session and review screens (tab bar hidden) have a "‹ Library" button: recording asks "Stop and leave?" and saves first, review asks before dropping unsaved notes, post-session leaves directly. Leaving closes the record stack so the Record tab starts fresh.
- **Browser checks (step 1.7).** The project skill `.claude/skills/web-check` drives headless Chrome over the DevTools protocol (no new dependency) with a throwaway local user that is removed afterwards: `flows.mjs` (menus, dialogs, library, recording flow, settings; free) and `ai-flow.mjs` (spoken lecture → transcript → notes → clarify; about $0.05, or free with `WEB_CHECK_MOCK=1`). Real speech is fed by replacing `getUserMedia`; Chrome's fake-audio file flag stays silent in headless mode.
- **Bundle check (step 1.7).** `npm run check:bundle` exports the web and iOS bundles and searches them for the actual key values on the Mac (`.env`, `supabase/functions/.env`, local service-role key, secret key, JWT secret), key-shaped strings, the key variable names, `service_role`, the OpenAI / Anthropic API hosts, and SQLite in the web bundle; a control (the public anon key must be found) proves the search works. Run on the code from before 1.7 it finds the Anthropic key in both bundles; on part A's code every count is 0. Not part of `npm run check` (two full exports, a few minutes).
- **Old app keys removed and revoked (25 Oct 2026, step 1.7).** `EXPO_PUBLIC_OPENAI_API_KEY` and `EXPO_PUBLIC_ANTHROPIC_API_KEY` were deleted from Lea's `.env` (the OpenAI one was already empty) after the bundle check had run with the Anthropic value still present, and Lea revoked both old keys in the OpenAI and Anthropic consoles. Only the Edge Functions hold AI keys now (`supabase/functions/.env` locally; `supabase secrets` remotely in part B); `verify-setup.js` warns if an AI key reappears in `.env`.
- **Offline on iPhone, online on the web (step 1.8).** The iPhone keeps a copy of the library in its own SQLite file, `studiply-cache.db` (`src/lib/cache`), separate from the old `studiply.db` that step 1.9 uploads. Rows are stored exactly as Supabase returns them, so the same `cloudRows` mappers serve both. Reads go through `readThrough`:
  - **Online with a usable session:** Supabase answers, and the answer is kept.
  - **Offline, or before the session is refreshed:** the cache answers (`localQueries`, the same filters as the service queries).
  - **The whole library is also downloaded in the background:** rows changed since last time (updated_at, re-read a minute back) plus id lists so rows deleted elsewhere disappear, and transcripts of the 20 latest lectures. This runs after sign-in, on back online, and on foreground at most every 2 minutes.
  - **Rows changed on the iPhone and not synced yet are "dirty":** downloads never replace or drop them, and online answers show them (`withLocalRows`).
  - **The web has no cache:** `store.web.ts` / `sync/index.web.ts` / `pendingFiles.web.ts` twins. `check:bundle` proves the web bundle has no `expo-sqlite`.
- **What works offline (step 1.8, Lea 25 Oct).**
  - **Works:** reading the library, notes and transcripts; editing notes; starting a lecture and recording; attaching photos and PDFs.
  - **Needs a connection:** creating, renaming, moving or trashing courses and folders ("You're offline. Try again when you're back online."), Search, Recently Deleted and Generate.
  - **Not shown offline:** photos and audio that aren't on the phone show a placeholder.
- **Connectivity by probing Supabase, not NetInfo (step 1.8).**
  - Every request reports to `src/lib/connectivity.ts`. While offline, `GET /auth/v1/health` runs every 10 s and on foreground.
  - This also notices "Wi-Fi on, backend down", which is how offline is tested locally (`supabase stop`).
  - Supabase requests get a 20 s timeout. Edge Functions don't, because summarize can take minutes.
  - No new dependency.
- **Staying signed in offline (step 1.8).**
  - When the access token has expired and can't be refreshed, supabase-js reports "no session" but keeps the stored one. AuthProvider then signs in from the stored session (Keychain / localStorage, key `sb-<host>-auth-token`) with the profile cached on the device, and refreshes it once the backend answers.
  - If Supabase hasn't answered within the 1.5 s splash, the stored session is shown so the library doesn't wait for its ~25 s retry loop.
  - Reads stay on the cache until the session is refreshed, because an anonymous request would return no rows and empty the cache.
  - Sign-out works offline: the stored session is removed by the app.
- **The sync queue (step 1.8, `src/lib/sync/queue.ts`, 25 tests).** Changes made on the iPhone are saved locally first, then queued in the cache database (`outbox`). Rules:
  - **Order:** first in, first out, one flush at a time. It runs when online with a usable session, on enqueue, back online, session refreshed and foreground.
  - **Transient failures** (network, 408, 429, 5xx, timeout): the flush stops and the operation stays first, with a backoff of 1 s, 2 s, 4 s … up to 5 minutes. **Back online, foreground and Sync now clear the backoff.**
  - **401:** the session is refreshed once, then the operation is retried.
  - **Refused** (other 4xx, a Postgres 23xxx/42xxx error, a file gone): the operation is marked failed and kept, and only its own key (note or lecture) waits behind it.
  - **Merging:** waiting edits of the same note or lecture are merged.
  - **Time limits:** each run has one (2 min, uploads 10 min).
  - **Safe to repeat:** handlers can run twice (upserts by ids made on the phone; local files deleted only after their row exists).
  - **No overlap between instances:** handlers, a lock and the listeners live on `globalThis`, so a development reload can't leave two queues sending at once. That happened in Lea's test 3.
  - **Lecture first:** every operation for a lecture first makes sure the lecture exists on the server, creating it from the iPhone's copy if not. Nothing in the queue ever deletes a lecture.
  - **Error details:** `lastError` keeps the HTTP status and the server's code and message.
  - **Writes one at a time:** writes to the cache database are serialized. expo-sqlite transactions aren't exclusive, so overlapping writes could fail or roll each other back.
- **The conflict rule for a note edited on two devices (step 1.8, `src/lib/noteBlocks.ts`).**
  - **Blocks:** until the Phase 4 editor, the "blocks" are the sections of the old note: title, summary, key concepts, formulas, definitions, tags, unclear parts, clarifications and confirmed.
  - **What each block remembers:** `summaries.result.blocks[key] = { origin: ai|student, editedAt, device }`. editedAt is the device clock at the edit, never earlier than the version it replaces plus 1 ms. A generated note's blocks are `ai`, an edited block becomes `student`, and old notes count as `ai` at `created_at`.
  - **What an edit carries:** each block's value when the student started editing (its base) and the new value.
  - **The merge, against the server:**
    - server still at the base → apply;
    - server already has the new value → nothing to do;
    - both changed it → **the newer edit wins** (a tie goes to the larger device id), and the other side's whole note is stored in `document_versions` (reason `conflict`, `file_id` + `summary_id`, `content.conflict = { blocks, side, device, editedAt, editId }`; the same edit never stores it twice).
    - Different blocks on two devices both survive.
  - **Write safety:** the write is a compare-and-swap on `updated_at`; if another write came first, the client reads and merges again, up to 3 times.
  - **Who runs it:** the web merges at once. The iPhone saves locally, queues the edit, and shows "Saved on this iPhone · syncs when you're back online", then "Saved". When the other device's newer edit won, a one-time notice appears.
  - **Known limit:** the rule trusts device clocks.
- **Recordings queued on the iPhone (step 1.8).**
  - **Chunks:** each finished chunk moves from the iOS cache folder (which iOS may empty) to `documents/pending-uploads/<lectureId>/`. After Stop, the chunks are queued in order.
  - **Online:** "Saving recording… %" follows the queue.
  - **Offline:** "Saved on this iPhone. It uploads automatically when you're back online." with Continue (no more dead-end Retry).
  - **Photos and PDFs:** queued the same way, with an id made on the phone; the thumbnail comes from the local file until uploaded.
  - **Lectures started offline:** created by the queue, with an id made on the phone. Online creation is unchanged.
  - **Generate:** waits for the uploads, and says it needs a connection offline.
  - **Web:** unchanged (uploads at once).
- **Sign-out with unsynced changes (step 1.8).**
  - Settings shows "All changes synced" / "N changes waiting to sync" / "N changes couldn't sync · Try again".
  - Sign-out with unsynced changes asks first: **Sync now** (online only; signs out if everything went through, asks again otherwise), **Cancel**, **Sign out anyway** (the changes are lost).
  - Sign-out clears the cache, the queue and the pending files of that student.
- **Development helpers (step 1.8, `__DEV__` only).** Settings → General → DEVELOPMENT has:
  - **Simulate offline**, for two-device tests where the browser must stay online;
  - the **sync queue** list, with each operation's tries, next try and last error;
  - **Sync now**.

  `[sync]` lines are printed in the Metro terminal.
- **Move to…, Move to another lecture…, Save to library… (after step 1.8, 26 Oct).** The logic is UI-free in `src/services/move.service.ts`, so Phase 2 drag and drop calls the same code:
  - `moveItem` (lecture, folder, library file → a course or folder), `moveMediaToLecture` and `saveMediaToLibrary` each return an `undo()` that restores the exact old place.
  - `canMoveTo` (pure) refuses a folder into itself or a subfolder, and reports "same place"; drop targets can use it.
  - The screens use `src/hooks/useMoveFlow.tsx` (picker, errors, "Moved ‘X’ to Y" toast with Undo). `MoveToModal` can now pick a lecture, hides the moving folder, and turns "Move Here" off where the item already is.
  - All of this is online only.
- **Library files (Save to library…).** A lecture's photo or PDF can be saved as its own file in a course or folder:
  - a `files` row of kind `pdf` or **`image`** (new kind, migration `20261026090000_standalone_images`), with its own media row (`file_id` set, `lecture_id` null) and **its own copy** of the Storage object;
  - the lecture keeps its photo; removing it there, or deleting the lecture, never touches the library copy;
  - the course screen lists them in a FILES section per folder, with Open / Rename / Move to / Delete;
  - they're readable offline from the iPhone cache like lectures (`libraryFilesIn`).
- **Deleting goes by rows, never by path prefix.** A photo moved to another lecture keeps its old Storage path (`{uid}/{oldLecture}/…`). `trash.service` collects the objects to remove from the media and audio rows of the files being deleted, so deleting the old lecture can't take the moved photo. Covered by Jest, pgTAP and the Chrome check.
- **Retention is audio only.** "Delete now / after 3 days" acts on a lecture's `audio_chunks`. Photos, PDFs and library files are never removed by it; only the student deletes them. Covered by a test.
- **Migration timestamps stay in order (26 Oct).** `20261026090000_standalone_images` was dated in the future and is already on the remote, so it keeps its name; every new migration must be dated after the newest one (rule in `CLAUDE.md` → How to work).
- **Moving the earlier version's data (step 1.9).**
  - **What happens:** Settings → Earlier version data (and a card on Library, "Later" hides it until the next start) reads the old `studiply.db` and its files read-only, lists each old profile with counts and first names (nothing ticked), and uploads the ticked ones (`src/services/legacyImport/`).
  - **Ids and dates kept:** the old UUIDs become the new rows' ids, and dates are kept. Rows are upserted with `ignoreDuplicates`; transcripts, recordings and photos/PDFs already on the server are skipped. It's safe to repeat and resumes after a failure.
  - **Every section of an old note is `student`**, clarifications included: the old app didn't record who wrote what, and regeneration must never overwrite text the student typed (Lea, 26 Oct).
  - **Old trash:** it goes to Recently Deleted with its date; anything deleted more than 30 days ago is left out, and so are deleted notes.
  - **Files:** photos are converted to JPEG. Files no longer on the iPhone (old photos/PDFs only kept the picker's cache URI) are listed, not uploaded. AI usage history and budgets can't be moved.
  - **Verification:** after the upload every expected row and file is checked on the server. "Remove the old copy from this iPhone" appears only after that, and is the only thing that deletes old data.
  - **"Already uploaded"** is remembered per Supabase URL + account + data set (real or development sample), so a local test upload never blocks the real upload to the remote project.
  - **Development** uses only `studiply-sample.db` / `documents/legacy-sample/` (DEVELOPMENT → Create / Use sample earlier-version data), never the real data.
- **npm audit policy.** At the start of Phase 1, after `npx expo install --fix`, run `npm audit --omit=dev` and only fix what affects the shipped app. Dev-tool warnings are left alone. Never use `npm audit fix --force`.

- **App shell (step 2.1), following the mockups in `docs/design/`.**
  - **Library absorbs Home** (the design has no Home): `/` redirects to `/library`, and the recording flow returns there. The iPhone Library is laid out like `iphone-01-library`; on the laptop it is "My library" without the search field and avatar (they are in the top bar).
  - **Five iPhone tabs:** Library · Search · ● Record · Review · Settings (`src/navigation/mainTabs.ts`). Record is a 64 px raised red circle (`Colors.recording` #CC3333) with a white ring, in the exact middle. Review is a placeholder until the study phase.
  - **Laptop shell (web ≥ 1024 px):** top bar, sidebar and assistant around the same Tabs navigator, which keeps its place in the tree, so resizing never loses the open screen. What shows depends on the screen kind (`screenKindFor`): library screens (search + Record lecture, sidebar), documents (title area, assistant, Share disabled until Phase 4), settings (Back to library, no panels). The sidebar and assistant collapse; the state is kept per device in `studiply.layout`.
  - **New tokens:** `recording` #CC3333, `text.onGradient` #3A3A48, `accentDark` #4F43B0 (from the design README); sizes in `src/constants/layout.ts`. The gradient is behind Library, Search, Review, Settings, the course screen and the note; their contents are restyled in 2.2/2.3.
  - **Done in 2.2:** the real top-bar breadcrumb and "Saved · time", the open course expanding in the sidebar, Starred / Exam packs / Review today and its badge.
  - **Done in 2.3:** the rest of the palette, dark mode, Dynamic Type, keyboard shortcuts.
  - **Checks:** `.claude/skills/web-check/scripts/layout.mjs` (shell per screen kind, collapse after a reload, 1280 → 1023 → 1280, the 390 px tab bar geometry); `flows.mjs` now runs on Library and uses the top-bar Record lecture button.
  - **Duplicates removed:** the 87 `* 2.*` Finder/iCloud copies, 4 empty `* 2` test folders and `supabase/.gitignore 2` were byte-identical to their originals and were deleted; `.gitignore` ignores `* 2.*` and `* 2`. `.git/index 2` (an old copy of git's own index from 23 Oct) was left alone.

- **Real data in the shell (step 2.2).**
  - **Sections:** Recent (files of every kind, newest change first), Favorites (courses, folders and files with `starred_at`, newest first) and Exam packs (`files` of kind `exam_pack`) come from `src/services/shelf.service.ts` and open offline on the iPhone from the cache. On the laptop they are `/library?section=…` (sidebar links), on the iPhone the Library chips.
  - **Review today** counts `review_schedule` rows due by the end of today. It is **online only** (the study tables aren't cached yet), so the badge is hidden offline. Phase 9 fills the schedule.
  - **Course counts** are items of every kind (`itemCount`), as in the mockups; `sessionCount` (lectures) is kept for the screens that use it.
  - **Top bar:** the focused screen publishes its place through `src/components/shell/ShellContext.tsx`. The note shows course › folder path › title and "Saved · time" (from the note's `updated_at`; "Saving…" / "Not saved" around a save). The recording flow shows its course and title. Record lecture preselects the course and folder the student is in. The course screen opens at `?folder=`.
  - **Favorites pulled forward from 3.4** (Lea, 26 Oct): "Add to / Remove from Favorites" in the menus of courses, folders, lectures and library files, and in the laptop sidebar's right-click menus; online only; Undo restores the previous value (`src/utils/star.ts`). The rest of the 3.4 menus stays in 3.4.
  - **Starred → Favorites** (Lea): every user-visible "Starred / Star / Unstar" became Favorites / Add to Favorites / Remove from Favorites; the URL is `?section=favorites`. The database column (`starred_at`) and the code names (`getStarredItems`, `setStarredAt`) stay.
  - **Bug fixed (Chrome):** the laptop sidebar's courses and course tree had no right-click menu, so there was no way to add them to Favorites there (the iPhone has no sidebar). They now have Open + Add to / Remove from Favorites; checked in `shell-data.mjs`.
  - **Favorites for everything, without reordering** (Lea):
    - **Lecture photos/PDFs:** `media.starred_at`, in the menus of Project Files, post-session and the note's Source Files. They show in Favorites as "Photo 2 · Clase 1" and open their lecture.
    - **Migration `20261026090100_favorites_everywhere`:**
      - on courses, folders, files and media only, a favorite-only change keeps `updated_at`;
      - every other table keeps the plain trigger (Lea: so big rows such as summaries aren't serialized);
      - `changed_at` moves on every update of those four tables, and the iPhone downloads them by it, so a favorite set on the laptop still reaches the iPhone.
      - pgTAP: `05_favorites`.
      - **Pushed to the remote after Lea's OK.** `migration list` shows local = remote up to `20261026090100`. Remote types match local (19 tables, 220 columns). A schema dump shows `set_updated_at_favorites` on courses, files, folders and media, and the plain trigger everywhere else.
    - **Project Files numbering:** photos there are now numbered within their lecture (oldest first), like the lecture's own screens and Favorites. Before, "Photo 2" there could be "Photo 1" in the lecture.
  - **PDFs and images** open their course at their folder until files get a viewer; documents, unit summaries and exam packs the same until Phases 4 and 7.
  - **Checks:** `.claude/skills/web-check/scripts/shell-data.mjs` (counts, badge, sections, top bar, crumbs, folder links, Record lecture, Star / Unstar with Undo in the database, iPhone chips and long-press). `flows.mjs` clicks scoped away from the sidebar's course tree.

- **Look and feel (step 2.3).**
  - **Background:** the full gradient everywhere (not `gradientSubtle`; BUILD-PLAN text fixed).
  - **Dark mode** (Lea approved after two rounds of screenshots): the light gradient dimmed, dark text on it, dark-grey cards, dimmed-salmon search fields, the note's title card on the dark card. Settings → General → Appearance: System / Light / Dark per device; `app.json` follows the system. The recording screen stays dark; the PDF stays light.
  - **Palettes:** `LightColors` / `DarkColors` of one shape in `colors.ts`. Screens use `useThemedStyles(makeStyles)`. A contrast test checks every pair in both (4.5:1 text, 3:1 icons), and a guard test fails on any color literal outside `colors.ts`.
  - **Contrast fixes along the way (light too):**
    - the active tab label and selected chips use `#4F43B0`;
    - the error red is `#C23B3B`;
    - text straight on the gradient uses the on-gradient colors;
    - the recording screen's warning banner is darker.
  - **Accessibility:**
    - `IconButton` (44 pt, always labelled) replaced 16 unnamed icon buttons;
    - the Library chips have a 44 pt touch area;
    - Larger Text is capped only on tab labels, chips and the timer.
  - **Shortcuts (web), Lea's choice:**
    - ⌥N (new document, "coming soon" until the editor), ⌥⇧N (new folder in the open course), ⌥R (record lecture with the current course): matched by `event.code`;
    - "/" (search) and "?" (the shortcuts sheet): matched by the character typed;
    - never while typing, with a dialog open, or with ⌘/Ctrl.
  - **Old look removed:**
    - the cream backgrounds and the letter-spaced STUDIPLY headers (the onboarding and splash keep the brand);
    - the note shows "‹ Course" as in iphone-06.
  - **Differences from the mockups that remain** (later steps):
    - Settings is still the simple list, not the two-column layout of desktop-05;
    - the note keeps its card layout until the editor (Phase 4);
    - the course screen is not yet the Finder grid of desktop-04 (Phase 3);
    - post-session and the recording screen will be redesigned in Phase 5.
  - **Checks:** `.claude/skills/web-check/scripts/look.mjs` (light/dark colors, Appearance surviving a reload, 44 pt named icon buttons at 390 px, every shortcut).

- **Drag-and-drop spike (step 3.1, throwaway).** Settings → General → DEVELOPMENT → Drag-and-drop spike (development builds only). It has 3 folders and 5 files in memory, plus the top level and Trash as targets. Nothing is saved.
  - **Option A, gesture (`src/lib/dnd/GestureDrag.tsx`, ~280 lines, both devices):**
    - built on `react-native-gesture-handler`;
    - **iPhone:** a 350 ms long-press lifts the item with a light haptic. Releasing without moving opens the menu, as DESIGN.md asks; moving drags.
    - **Web:** the drag starts after 5 px, so a click opens and a right-click shows the menu;
    - the ghost follows the pointer on the JS thread (no `react-native-reanimated` yet).
  - **Option B, the browser's own drag (`src/lib/dnd/html5.web.ts`, ~80 lines, web only):**
    - the native drag image;
    - the page scrolls while dragging;
    - **files dragged from Finder arrive** (`dataTransfer.files`), which Option A can't do.
  - **Shared (`src/lib/dnd/rules.ts`, tested):**
    - `hitTest`;
    - `canDrop`: not where it already is; a folder never into itself or its own subfolders; Trash always.
  - **Measured in Chrome (`dnd-spike.mjs`, 10 steps pass):**
    - **A:** a real mouse drag onto a folder (dashed highlight while hovering) and onto Trash; Undo; the subfolder rule; click and right-click.
    - **B:** the same moves, plus a PDF "from Finder" onto a folder.
    - Both feel immediate on the laptop.
  - **Not done in the spike:** scrolling the list while dragging with Option A (it needs auto-scroll near the edges; 3.3 adds it).
  - **The iPhone can't be checked here.** Lea checks long-press then move, long-press then release (the menu), normal scrolling, the haptic, and smoothness. If it isn't smooth, `react-native-reanimated` is added (Lea's OK) to move the ghost on the native thread.
  - **Recommendation:** **B on the web + A on the iPhone**, with `rules.ts` and the drop handlers shared.
    - **Why:** the sidebar's "COURSES · DROP FILES HERE" needs files from Finder (only B), and B gives native auto-scroll and drag image. The iPhone has no native drag without a new library, and A works there.
    - **The cost:** two small drag front-ends (~80 + ~280 lines) over one set of rules.
    - **The alternative:** A everywhere is one code path, but no Finder files and its own auto-scroll.
  - **Cleanup:** the spike screen and its DEVELOPMENT link are removed in 3.3; `src/lib/dnd` stays for the chosen option.
  - **New dependency:** `expo-haptics` (Lea's OK).

- **Library grid (step 3.2).** The course screen is now the Finder-style view: header with breadcrumb, Sort and (iPhone) grid/list; a toolbar; tiles with meta; select / double-click / Enter on the laptop, tap on the iPhone; folders created and renamed in place (Lea: clicking elsewhere saves, Esc cancels). Components in `src/components/library/`, data from `getCourseContents` (`shelf.service.ts`), helpers in `src/utils/libraryGrid.ts`, preferences in `src/lib/libraryPrefs.ts`, one name rule in `src/utils/names.ts`.
  - The old Project Files list stays as "Photos & PDFs from lectures", collapsible (Lea), and opens after an upload: toolbar uploads still go to the course's hidden "Project Files" lecture until 3.4 adds "Upload slides or PDF" as a library file.
  - Removed: the separate FOLDERS / FILES / SESSIONS sections, the floating New Folder / New Recording buttons and the New Folder sheet; the "Notes ✓" badge (the tile shows the lecture's state instead).
  - Waits for 3.3: moving by drag (with the 3.1 choice), the dashed highlight on real folders, Undo and ⌘Z; the spike screen is removed then. Waits for 3.4: the empty-space menu, New document, Upload as a library file.
  - Checks: `.claude/skills/web-check/scripts/library-grid.mjs` (10 steps, results checked in the database).
- **Step 3.2 feedback (Lea, 25 Oct).**
  - **Sort "didn't work":** the cause was data, not the screen. Migration `20261026090100` (favorites) ran `update … set changed_at = updated_at` while the old `updated_at` trigger was active, so every course, folder, file and media row got the same `updated_at` (the migration's time), and Date edited fell back to the name order. The real times had been copied to `changed_at`. Repair: `20261026090200_restore_updated_at.sql` puts them back with the trigger disabled (pgTAP `06_restore_updated_at`). Rows whose favourite changed after the first migration keep the later time. The check now seeds a PDF edited long ago and requires Kind, Name and Date edited to give three different orders.
  - **"+ New" menu** (`src/components/NewMenu.tsx`, items in `newMenuItems.ts`): anchored menu on the laptop, action sheet on the iPhone. Menu items can now be disabled with a hint and carry an icon (`DialogButton.disabled / hint / icon`); on the iPhone a disabled item explains itself in an alert, because the native sheet can't grey items out. New folder and Upload run the open course's shell commands (`newFolder`, the new `upload`), so they are enabled only where a course screen registered them (`hasShellCommand`).
  - **New course dialog** (`src/components/NewCourseDialog.tsx`) replaces the full-width `NewProjectModal` (deleted) in the sidebar, the Library and the recording setup.
  - **"Project" → "Course"** in every user-facing text (menus, dialogs, recording setup, search, Move to…, account deletion text, error messages).
  - Checks: `.claude/skills/web-check/scripts/new-menu.mjs` (1280 and 390 px, results checked in the database).
  - **Remote:** `20261026090200_restore_updated_at` pushed with Lea's OK (25 Oct), after a pgTAP control showing the trigger would overwrite the restore if left on, that it is switched on again on all four tables, and that `changed_at` moves so the iPhone downloads the corrected times (its pull saves whole rows). Local and remote migration lists match.
  - **One item menu** (`src/hooks/useItemMenu.tsx`, the pure part in `src/utils/itemMenu.ts`) for the grid, the laptop sidebar (which only had Open and Favorites) and Library's Recent and sections; the per-screen menus in `project/[id].tsx` and `library/index.tsx` are gone. Labels are now the same everywhere ("Delete", "Rename…", "Export PDF"; "Session" is "Lecture" in the confirmations). Changes reload every screen through `notifyLibraryUpdated()`. Deleting the open course or folder from the sidebar leaves it. Renaming a course follows the name rule (`updateProject` uses `cleanName`).
  - **Empty-space menu** in the course grid (right-click / long-press), moved forward from 3.4 at Lea's request; the toolbar stays. A right-click a tile already handled no longer reaches the space around it (`menuTriggerProps` skips handled events). Sort's menu is shared with the header (`showSortMenu`).
  - Checks: `.claude/skills/web-check/scripts/item-menus.mjs` (12 steps at 1280 and 390 px, results checked in the database).

- **Moving files by drag and drop (step 3.3).** The 3.1 choice in the real library: the browser's own drag on the laptop (`src/lib/dnd/html5.web.ts`, hooks in `useHtml5Drag.ts`), the gesture on the iPhone (`src/lib/dnd/GestureDrag.tsx`), one rule and one drop for both.
  - **One rule:** `canDrop` (`src/lib/dnd/rules.ts`) asks `canMoveTo`, now pure in `src/utils/moveRules.ts` (re-exported by `move.service.ts`), so a drop and Move to… never disagree; `moveItem` asks again against the server, and the database refuses folder cycles. Hover checks use every folder's parent (`getFolderLinks`, works offline).
  - **One drop:** `src/hooks/useLibraryDrop.ts` (move, a lecture photo out of its lecture, Trash with `restoreItem` as Undo), called with each screen's Undo toast: the sidebar uses the shell's toast, the course screen its own.
  - **Targets:** folder tiles and rows, breadcrumb parts above the current level, sidebar courses and folders, Trash (laptop only). Not "My library" (items outside every course aren't shown anywhere yet). Dashed `accent` border with `accentLight` when allowed; refused targets show nothing (laptop: "not allowed", no drop; iPhone: the reason on the drag preview).
  - **Lea's choices:** files from the Finder wait for 3.4 ("Coming soon", nothing uploaded); Trash drops don't ask (Undo), the Delete menu item still does.
  - **⌘Z / Ctrl+Z** (`src/lib/undo.ts`): every Undo toast (`useUndoToast`, now also on the course and Library screens) offers its action; ⌘Z runs the last one once and hides its toast. Not in fields (their own text undo) or dialogs.
  - **A lecture's photos and PDFs (Lea, 26 Oct):** `moveMediaToLibrary` gives the media row to a new library file (a move, not a copy; the Storage object stays; favourite and name kept; Undo gives it back and deletes the file). If the media update fails after the file row was created, the file row is deleted again (Lea; tested). The picker's new `pick: 'either'` mode lists folders and lectures. Menus: "Move to…" and "Save a copy to library…" (course screen, post-session, the note's Source Files). Dragging one to Trash is refused (deleting it is permanent).
  - **iPhone:** gesture-handler's ScrollView and RefreshControl on the course screen; auto-scroll within 80 pt of the top or bottom (targets move with the list); the empty-space long-press ignores a press that started on an item; VoiceOver keeps open and the menu (`DraggableView`'s accessibility actions). Not checkable in Chrome: Lea tests on the iPhone.
  - **Removed:** the 3.1 spike screen, its DEVELOPMENT link, its route and `dnd-spike.mjs`.
  - **iPhone fix (Lea: nothing could be dropped on a folder or the breadcrumb on the iPhone; Chrome fine).** No simulator here, so fixed by reading the code for what the working spike didn't have, plus a debug overlay to confirm on the phone:
    - the empty-space long-press was a React Native Pressable around the tiles; its 400 ms timer could race the tile's 350 ms lift and open a native action sheet, which cancels the drag. On the iPhone it is now a gesture-handler long-press (500 ms) that a tile's hold beats natively;
    - auto-scroll ran before the drag area was measured (height 0 read as "near the bottom") and scrolled the list away under the finger: `edgeSpeed` waits for the measurement;
    - a release before the targets were measured dropped nowhere: the drop now waits for them.
    - **Development only:** Settings → General → DEVELOPMENT → **Drag debug overlay** (`src/lib/dnd/dragDebug.ts`, `DragDebugOverlay.tsx`: the gesture's events with times since the finger went down, finger, hovered target, measured targets, what the drop did) and **Drag: plain ScrollView** (React Native's ScrollView and pull-to-refresh instead of gesture-handler's, to compare). Both start off every time the app starts (not saved; Lea, after the fix worked).
    - Jest drives the real gestures (`GestureDrag.test.tsx`, gesture-handler's jest-utils with `react-test-renderer` from jest-expo; a local type declaration, no new dependency).
  - **The title's menu (Lea):** the course or folder you're in, from its title (⌄): `useItemMenu.open(item, anchor, { skip: ['open'], dialogRename: true })`. After Delete the course screen goes up one level. The course screen now uses the app's Undo toast (`useAppUndo`, rendered by the main layout on both devices), so Undo stays visible after leaving the screen. The breadcrumb re-reads the folder names on every reload, and follows a folder moved to another course. Checks: `title-menu.mjs` (9 steps).

- **Menus, uploads as files, Cut / Copy / Paste, keyboard (step 3.4).**
  - **Uploads are library files** (`src/services/library-upload.service.ts`): a `files` row (image or pdf) with its own media row (file_id) and Storage object at `{userId}/{fileId}/{mediaId}.{ext}`. Laptop: uploaded at once, each step undone if a later one fails. iPhone: local rows + a new `upload_library_file` queue job (safe to repeat; loaded with `source-file.service` so queued uploads go out without opening a course). `useLibraryUpload` runs several files ("Uploading 2 of 5", one toast with Undo to the Trash, one message for refused files). Tiles of files not uploaded yet say "Waiting to upload" (`pendingLibraryFileIds`). The hidden "Project Files" lecture is no longer used (`getOrCreateProjectUploadSession` and `lectureTitled` removed).
  - **Finder and clipboard (laptop):** files dropped from the Finder go where they are dropped (folder tile, breadcrumb, sidebar course or folder, the empty grid; never Trash); ⌘V adds a copied image or PDF. An outer drop target no longer overrides an inner one's answer, and every highlight clears on any drop.
  - **Migration `20261026090300_project_files_to_library`:** each hidden "Project Files" lecture (none of a real lecture's data) gives its photos and PDFs to new files at its place (name = caption, else "Photo N" / "Document N", plus the extension; date and favourite kept; Storage objects untouched), then the emptied lecture is deleted. `private.project_files_to_library()` returns counts per course. pgTAP 19 (with Lea's: deleting the hidden lecture never deletes the moved media rows or their Storage objects). Pushed to the remote with Lea's OK (25 Oct) after the dry run and a read-only count: the remote had no data at all (0 users, courses, files; the real import had gone to local Supabase), so nothing changed there; local and remote migration lists match.
  - **Menus:** item menus gain Move out, Cut, Copy and the Summarize / Make exam pack placeholders (`itemActions(item)`, `actionHint`); the empty-space menu gains New document (greyed out) and Paste (`pasteLabel`); the iPhone gets "…" in the course header. `src/lib/clipboard.ts` holds one cut or copied item; `useLibraryDrop.pasteHere` moves (cut) or copies (`saveMediaToLibrary`, "… copy") with Undo.
  - **Keyboard:** web menus focus their first item, ↑ / ↓ / Tab / Home / End / Enter / Space, focus back on close (`nextMenuIndex`, captured so Enter chooses once). ⇧F10 / Menu key, ⌘X / ⌘C (shell commands that can decline, so the browser's copy still works), ⌘V through the paste event.
  - **Not built:** New document (Phase 4), Summarize and exam packs (Phase 7), copying lectures and folders, multi-select (Left to later).
  - **The earlier-version import (Lea, after the real import went to local Supabase by mistake):** the old "Project Files" session (titled so, with no recording, transcript or notes) now becomes library files directly: each photo or PDF a file at the session's place ("Photo N.jpg" or the PDF's name, old dates and trash state, the photo's id as the file's id so a second upload adds nothing), uploaded under `{fileId}/`; no hidden lecture. The device sample has such a session (a PDF and a photo). Development builds show the server: a "Server: LOCAL" / "Server: REMOTE (xmym…)" badge in Settings → DEVELOPMENT and at the top of Earlier version data, and the button reads "Upload to REMOTE (xmym…)" (`describeBackend`, `BackendBadge`).
  - Checks: `library-menus.mjs` (10 steps, database and Storage); `library-dnd.mjs` now uploads Finder files and pastes a screenshot; Jest for uploads (laptop and queue), the menu rules, clipboard, Paste, the menu keys and shortcuts.
  - Checks: `.claude/skills/web-check/scripts/library-dnd.mjs` (10 steps, every result checked in the database); Jest for the rules (three levels, cycles, same place, across courses, media and Trash), `moveMediaToLibrary` and its Undo and clean-up, `undo.ts`, ⌘Z.

- **Trash, Recent, Search (step 3.5).** Lea's answers: auto-empty on the server, daily (the sign-in clean-up stays as a backup); Recent = opened or edited; offline the iPhone searches what is on it, and says so.
  - **Recently Deleted** shows each item's real kind and icon (before, every file said "Session"), where it was ("from Math › Tema 1", `utils/trash.ts`), "Deleted 3 days ago · 27 days left", and lists what was deleted with its folder or course once, under it (same `deleted_at`). Restore shows "Restored 'X' to {place}" with Undo; restore, delete forever and Empty now refresh the library at once (`notifyLibraryUpdated`). The Restore button is labelled for VoiceOver ("Restore X").
  - **Nightly clean-up:** migration `20261026090400` adds `trash_purge_plan(older_than)` (the Storage objects, found through rows, so a photo moved out of a lecture is never listed with it) and `trash_purge(older_than)` (files, folders, courses; the database cascades), service role only. Edge Function `purge-trash` (`verify_jwt = false`; it accepts only the `x-cron-secret` header, compared in constant time) lists, removes the objects through the Storage API (SQL can't: `protect_delete`), then deletes the rows; if Storage fails it keeps the rows and tries again the next night, so no file is left without its row. Logs counts only. Migration `20261026090500` enables `pg_cron` and `pg_net` and schedules `private.run_trash_purge()` daily at 03:15 UTC; it reads `project_url` and `cron_secret` from Vault and does nothing without them (local Supabase, until Lea sets them on the remote). `npm run check:purge` tests it end to end locally (needs `supabase functions serve` and a `CRON_SECRET` in `supabase/functions/.env`; a random local one was added there, git-ignored) and refuses to run if anything else in the local trash is older than 30 days, because the function purges every user's old trash.
  - **Recent:** opening a lecture (notes, post-session) or a library file sets `files.last_opened_at` (`markOpened`, at most once a minute per file; offline only this iPhone's copy, the server learns at the next online open). Migration `20261026090600`: the favourites trigger also keeps `updated_at` when only `last_opened_at` changes (`changed_at` still moves for the iPhone's download). Recent orders by the later of the two times. Instead of the planned generated `recent_at` column, the app merges the newest `limit` edited with the newest `limit` opened (exact: the top `limit` by either time are always among those, and `files_user_opened_idx` already serves the second), so rows built on the iPhone need no extra column.
  - **Search:** migration `20261026090700` adds `unaccent` and `pg_trgm`, trigram indexes on the normalized course and folder names, file titles, note text and transcript segments, and `public.search_library(q, max_results)` (security invoker: owner RLS; never the trash; the newest confirmed note per lecture, as the app shows; at most 1 note hit and 3 term hits per lecture, 3 transcript lines per lecture). Its pure helpers (`norm`, `json_list`, `note_fields`, `note_text`) live in a schema of their own, `search`, with usage for signed-in users: the indexes run them as the student on every save, and putting them in `private` would have meant opening `private` (found by the existing pgTAP tests failing; fixed before committing). The schema is not exposed by the API. `utils/searchText.ts` normalizes like the database (accents, case, the Catalan middle dot, ß/æ/ø/ł…), maps highlights back to the original letters, cuts snippets between words, and writes the count line; `lib/cache/localSearch.ts` is the same search over the iPhone's cache. "Term" means a key concept's or definition's term until the glossary (Phase 7). `searchAll` and the `SearchResult` type are removed.
  - **Search screen and opening at the match:** iphone-09 (chips, count line, badges, marked snippets; new colour token `found`, contrast-tested in both appearances). A lecture opens with `?find=` (and `?at=` for a transcript hit): `FoundText` marks the word in the summary (`HighlightableText` gained `find`), concepts, formulas, definitions and the transcript, which opens line by line with times; the screen scrolls to the first match or the hit's own line (`findInNote`). Read-only marks; the editor comes in Phase 4.
  - Checks: pgTAP 08–11 (purge, schedule, recent, search: 299 in all); Jest for the trash rows, purge rules, Recent order and throttle, search text, local search, hits and `findInNote` (720 Jest tests in all); `check:purge` (20 checks); Chrome `trash.mjs` (6 steps) and `search.mjs` (5 steps), `flows.mjs` now also restores. Favorites needed nothing new (done in 2.2).

- **`start:remote` showed LOCAL on the iPhone (26 Oct, found by Lea before the real import).** In development, Expo SDK 54's client module `expo/virtual/env` merges `.env`, `.env.development`, `.env.local` and `.env.development.local` **over** `process.env`, so `.env`'s `127.0.0.1` beat the remote URL that `scripts/start-remote.mjs` had set (the bundle Metro served contained both; the app read the `.env` one). The badge was right. Fix: `start:remote` also passes `EXPO_PUBLIC_REMOTE_SUPABASE_URL` / `_ANON_KEY`, names no .env file may use (it refuses to start if one does, or if a .env file sets `EXPO_PUBLIC_MOCK_AI`), and `src/lib/supabase.ts` prefers that pair (`pickSupabaseEnv`, tested). Checked by fetching the iOS bundle from a `start:remote` Metro: the `.env` module only overrides the local names. Production builds are unaffected (Babel inlines the build's own variables).

- **Lea's real courses on the remote (26 Oct).** The old copy on the iPhone was gone (the September import had gone to local Supabase), so `scripts/copy-to-remote.mjs` copied Calculus, Finance, Programming and Crypto from the local account to the remote one: 4 courses with their settings, 3 folders, 4 lectures, 4 notes (all 36 blocks still `student`), 3,479 transcript lines, 14 recording chunks and their 14 Storage files (≈58 MB); ids, titles and dates kept. The first `--apply` was interrupted after 13 of 14 recordings; running it again uploaded only the missing one (`--compare`: local and remote match). The two sample courses uploaded by mistake ("Psicobiología (sample)", "Test course") were deleted for good through the purge (`deleted_at` set 31 days back, then `private.run_trash_purge()`: 200, 4 Storage files, 6 files, 2 folders, 2 courses). Local was only read.

- **Settings in sections (step 3.6).** Same sections on both devices, one route each (`src/utils/settingsSections.ts`, tested): Account, Summaries, Recording, AI & privacy, Storage & sync, Notifications, Appearance, Your data, Development (development builds only, name kept by Lea). Laptop: `settings/_layout.tsx` shows the section menu (`SettingsMenu`) beside the page in a 1,124 px column (`Layout.settingsMaxWidth`); iPhone: the list and a stack of pages. Every page uses `SettingsPage` ("‹ Settings" and the big title on the iPhone; the title in the right column on the laptop; Recently Deleted and Earlier version data get "‹ Your data").
  - **Moved, not rewritten** (step 1 made the groups components with no visible change, checked by flows/look/layout): `src/components/settings/` (PreferenceSettings, AccountSettings, AiUsageSettings, StorageSettings, DevelopmentSettings, StatusBanners) and `useUserSettings`. The old General and Security screens are removed; Manage Account became Account.
  - **Nothing lost** (checked by `settings.mjs`, every setting by name in its section):

    | Was | Now |
    |---|---|
    | General → Appearance, Keyboard shortcuts | Appearance |
    | General → Recording (mode, Lecture Mode, language) | Recording |
    | General → AI processing (level, title, tags, formulas, definitions, unclear parts) | Summaries |
    | General → Source files (default retention) | Storage & sync |
    | General → Development (server, Simulate offline, sync panel, drag debug, sample) | Development |
    | Manage Account → Profile and Edit profile | Account |
    | Manage Account → AI usage today, cost breakdown, About these limits | AI & privacy |
    | Manage Account → Source files, Delete data on this device | Storage & sync |
    | Manage Account / Security → Sign out | Account (and the iPhone list) |
    | Security → "stored in your Studiply account" | Account |
    | Security → "sent to OpenAI or Anthropic only after you allow it" | AI & privacy |
    | Settings list → AI today banner | AI & privacy (the iPhone row shows "N% used today") |
    | Settings list → sync line | iPhone list, Account, Storage & sync |
    | Settings list → Recently Deleted, Earlier version data | Your data |

  - **Not built** (from the mockups, later phases): password change, Sign in with Apple, signed-in devices, Delete account, Export my data, notification times. The iPhone rows show values only where they are real.
  - Checks: `settings.mjs` (5 steps), `flows.mjs`, `look.mjs` and `layout.mjs` updated to the new routes; Jest for the sections and values.

- **Development build (step 4.1).** `expo-dev-client` (Lea's OK) replaces Expo Go on the iPhone; builds run on EAS in the cloud (no Xcode on the Mac). `eas.json`: development (dev client, internal distribution, registered devices), preview (internal; real airplane-mode tests) and production (build number from EAS, auto-increment). Signing is EAS-managed: the distribution certificate and provisioning profile live on Expo's servers, the Apple password goes to Apple only; `credentials.json` / `credentials/` are git-ignored. Bundle id `com.studiply.app` (fallback `com.leapesseygirod.studiply` if Apple says it's taken; it can't change after the App Store release).
  - **Native settings checked before the first build** (`npx expo config --type introspect`): microphone, camera and photo library texts, background audio (`UIBackgroundModes: audio`), local networking for development (Expo's template: `NSAllowsLocalNetworking`). `expo-camera` isn't used (photos go through `expo-image-picker`). Removed the generic Face ID text (`expo-secure-store` `faceIDPermission: false`; the app never asks for Face ID). Standard encryption only (`usesNonExemptEncryption: false`). `npm audit --omit=dev` unchanged; expo-doctor 18/18.
  - **Not avoidable later:** step 4.2's editor (TenTap) brings native code (`react-native-webview`), so a second development build comes with 4.2; moving recording from `expo-av` to `expo-audio` (Phase 5, `expo-av` is deprecated in SDK 54) will need another.
  - **Not in 4.1:** EAS environment variables (remote Supabase URL and anon key) for preview and production builds: Phase 10.
  - **Recording in the development build.** The first try failed with "Prepare encountered an error: recorder not prepared" (Expo Go worked with the same expo-av 16.0.8). `startRecorder` (`app/(main)/record/active.tsx`) now tries the speech preset, again after setting the audio session once more, then on iOS a 44.1 kHz / 64 kbps fallback (≈10 MB per 20 minutes instead of 5) kept for the rest of the lecture; each failed attempt is logged in Metro (`[recording] …`, with the microphone permission). Which attempt succeeded on Lea's iPhone isn't known yet: if Metro shows `[recording] … fallback`, make 44.1 kHz the default. Phase 5 replaces expo-av anyway.
  - **SIMULATED AI badge (development).** Notes came back simulated with `npm run start:local`: `.env` doesn't set `EXPO_PUBLIC_MOCK_AI`, but `supabase functions serve` wasn't running, so local Supabase answered 502/503 and the development fallback (`lib/aiMode.ts`) simulated. A badge at the top of every screen now says "SIMULATED AI · EXPO_PUBLIC_MOCK_AI=1" (forced) or "SIMULATED AI · functions not running" (the last AI call fell back); a real answer clears it. Development builds only.
- **Editor spike (step 4.2): report and recommendation (28 Oct).**
  - **Packages (Lea's OK, installed by Lea):** `@10play/tentap-editor` 1.1.0 and `react-native-webview` 13.15.0 (iPhone); Tiptap **3.32.0** pinned exactly (`core`, `pm`, `react`, `starter-kit`, `extension-table`), one copy of each; Vite, `@vitejs/plugin-react`, `vite-plugin-singlefile`, `@types/react-dom` (build only). `npm audit`: nothing new (see Known issues).
  - **One schema by construction.** `src/editor/bridges` is the one list (TenTap's start kit, the timestamp chip, tables, the paste report). The iPhone hands it to TenTap; the WebView bundle (`editor-web/`) runs it; the laptop turns it into Tiptap extensions with TenTap's own `resolveBridgeExtensions`. A Jest test builds both schemas as TenTap does and compares nodes, marks and attributes.
  - **TenTap's sources, not its prebuilt web bundle.** `@10play/tentap-editor/web` carries its own copy of Tiptap and ProseMirror; extensions added on top (tables) would bring a second ProseMirror, a known source of bugs. TenTap exports its sources (`./src/*`, imported with the `.ts` extension, hence `allowImportingTsExtensions`; Jest transforms them), so the bundle has one copy of everything (684 kB, 215 kB gzipped). An upgrade of TenTap means `npm run editor:build` again.
  - **The laptop runs Tiptap in the page**, not TenTap's iframe shim: real browser paste and shortcuts, no Metro config. `editorHtml.js` is committed, so Metro and EAS need no build step.
  - **Timestamp chip:** inline atom `timestampChip { ms }`, shown as "4:12" (`formatHitTime`), HTML `<span data-timestamp-ms>`. A tap selects it, and both editors report the selected chip (the iPhone through the bridge state). Playback comes in 4.6 / 5.4.
  - **Saving:** a `document` file "Editor spike (development)" at My library, its `notes` tab in `public.documents`; no migration. The screen (Settings → Development → Editor spike), the service and the file go when 4.3 starts.
  - **Found in Chrome (27–28 Oct, `editor-spike.mjs`, 12/12):**
    - Round trip both ways: JSON saved on the laptop opens in the iPhone's editor unchanged, and the iPhone's (with a chip at 4:12) comes back to the laptop identical, chip shown and tap reported.
    - Paste (clipboard HTML shaped like Google Docs' and Word's, written by Claude; the real paste is Lea's check): **both editors make the same document.** Google Docs keeps headings, bold, italic, underline, text colour, bullet and numbered lists and the table; it loses **highlights** (`background-color` spans; Tiptap's Highlight reads only `<mark>`). Word keeps the same, but its **lists arrive as paragraphs starting with "·"** (Word writes list items as `<p style="mso-list:…">`) and highlights are lost. Both are for step 4.4 (paste rules).
    - 20 pages (9,762 words, 50 chips, 89 KB of JSON): into the laptop editor in 18 ms, typing 6–8 ms from key press to update; the iPhone's editor in desktop Chrome 10 ms (a phone is slower: timed on the iPhone).
  - **Lea's tests (development build with the WebView, 28 Oct):**
    - Round trip iPhone ↔ laptop: **identical, chips included, both directions** ✓.
    - Paste in Chrome from a real Google Docs page: **nothing lost** (50 headings, 124 list items, bold, italic, colour) ✓.
    - Paste on the iPhone: "Bold 7 → 7, nothing lost". A Google Docs paste on the iPhone isn't reported yet.
    - 20 pages and the chip tap on the iPhone: not reported in the first test; both fine in the retest.
    - **Three problems, all in Studiply's code, fixed 28 Oct (`38e754a`; JavaScript only, no new build):**
      1. **No toolbar above the keyboard.** React Native's `KeyboardAvoidingView` measures itself against its parent, not the screen; the editor starts ~200 pt down the spike screen, so it lifted the toolbar too little and left it under the keyboard. Now TenTap 1.1's `EditorKeyboardAvoidingView`, which measures in the window, wraps the editor and the toolbar.
      2. **The keyboard never closed.** A **Done** button next to the toolbar (`blur()`, now on the editor handle of both devices); dragging the page closes it too (touch events in the WebView bundle: a finger that moved more than 12 px; a tap or a long press that turns into a selection keeps it); on the spike screen a tap above the editor, Save, Load, Show JSON and Delete close it (Insert chip keeps it). The real document screen (4.3) does the same.
      3. **Dark mode: dark page, dark text.** The page now always uses the light palette (`editorCss` takes no colours; `color-scheme: light`; the WebView's own background white), on both devices; the app around it and TenTap's toolbar follow the appearance. Now in DESIGN.md. Pasted text from Docs and Word carries explicit black, so a dark page could never have worked for it anyway.
  - **Findings:**

    | Area | iPhone (TenTap 1.1 in a WebView) | Laptop (Tiptap 3.32 in the page) |
    |---|---|---|
    | One schema, round trip | Identical both ways with chips (Lea) | Identical both ways (Lea, Chrome check) |
    | Keyboard and toolbar | Toolbar was under the keyboard and the keyboard never closed; fixed, retest passed | Browser keyboard and shortcuts (⌘B, ⌘Z) work |
    | Performance, 20 pages (9,762 words, 50 chips) | Smooth scrolling and typing on the phone (retest; not timed); the same bundle in desktop Chrome loads it in 10 ms | 18–22 ms to load, 6–8 ms key press to update |
    | Paste from Google Docs | Not tried on the iPhone yet; the same HTML gives the same JSON as on the laptop | Real page: nothing lost (50 headings, 124 list items) |
    | Paste from Word | Same JSON as the laptop for the same HTML | Sample only: lists become "·" paragraphs, highlights lost (4.4) |
    | Dark mode | The page was unreadable; fixed: always white (retest passed) | Always white |
    | Web compatibility | n/a | No iframe, no Metro changes; TenTap's web shim not used |

  - **Retest (Lea, 28 Oct): passed.** The toolbar sits on top of the keyboard; Done and dragging the page close the keyboard; in dark mode the page is white; 20 pages scroll and take typing smoothly (no time noted); a chip tap reports its time. A Google Docs paste on the iPhone wasn't tried (optional).
  - **Recommendation (taken): continue with TenTap 1.1 + Tiptap 3.32 into 4.3.** BUILD-PLAN's check passed on its two points: a document from the iPhone opens identical in the browser with its chips, and a real Google Docs page pasted in Chrome kept its headings, bold and lists. The three iPhone problems were in how Studiply used TenTap (layout and theme), not limits of TenTap, and were fixed in JavaScript.
    - **Risks to carry into 4.3/4.4:**
      - **TenTap's sources are imported by file path** (`@10play/tentap-editor/src/...`), which isn't a public API. TenTap is pinned to 1.1.0 exactly, and every upgrade needs `npm run editor:build` and the Chrome check.
      - **TenTap 1.1 is three weeks old.**
      - **Word's lists and highlights from both apps** need paste rules (4.4).
      - **The phone's speed was judged by feel, not timed;** 4.3 times a long document on the phone.
- **Documents that save themselves (step 4.3, 28 Oct).**
  - **Blocks:** every top-level block has `blockId`, `origin` (ai / student / media, default student) and `editedAt` (`src/editor/schema/blockMeta.ts`, in the shared bridge list, so both editors). A plugin keeps them right: new ids for new blocks and duplicates (Enter, paste), the id kept when a block's type changes, the same ids on every device for a document saved without them; a student edit makes the block `student` with the time. Loading, the other device's changes, restoring and generated content (transcript, later AI) are system changes and keep origin and time. Nested paragraphs (in lists and tables) carry the attributes too (ProseMirror can't limit them to the top level); only top-level ones are used.
  - **The merge** (`src/editor/docBlocks.ts`): step 1.8's rule over blocks. An edit carries each changed block's base and new value plus the edited order; per block the server still having the base applies it, the same value is skipped, both changed → the newer `editedAt` wins (tie: the server) and the other copy is kept as a `conflict` version; an edit beats a delete either way; new and moved blocks go after the closest earlier block that still exists; text written on an empty tab goes after the other device's. **A list or table is one block**: two devices editing different items of one list is a conflict on the list (newer wins, the other copy in version history).
  - **Saving** (`document.service.ts`): laptop: compare-and-swap on `updated_at` (3 tries, then later), conflict versions written once per edit; iPhone: cached (dirty) and queued (`create_document`, `document_edit` with merge, `rename_document`, `save_version`), so writing and creating documents works offline; `documents` joins the cache and the pull. A tab both devices created ends as one row.
  - **Autosave** (`documentSession.ts`, `useDocumentSync`): 1 s after typing; "Saving…" / "Saved · 10:31" / "Saved on this iPhone" / "Not saved · trying again"; the open document checks the server every 5 s (only `updated_at`) and takes the other device's blocks without moving the cursor or losing what is being typed (`applyBlocks`, `rebase`). **No Realtime**: polling meets "a few seconds" without a schema change; Realtime can come with co-editing.
  - **Versions:** one at the end of each editing session (leaving the document, which in the tab navigator means losing focus; the app or browser tab going to the background at most every 5 min); restore keeps the current text as "Before restore" and saves the old one as a new edit dated now (origins kept); **named versions** (Lea): `document_versions.name`, only the name can be updated (migration `20261026090800`, local only so far); **thinning**: after 30 days the "Edited" versions are cut to the last of each day; named, AI, before-restore and conflict versions never. `saveVersion(…, 'ai_generation')` is ready for the summary engine.
  - **Screens:** `/doc/[id]` for blank documents (title + one page) and lectures (My notes · Summary · Transcript), as the mockups (white page on the gradient, accent line, editable title, meta line). Summary without a document shows the earlier-format notes with **Open notes** (today's notes view, kept until 4.9). Transcript is made once from the segments (a paragraph per segment with its chip, origin media, ids from the time) and is editable; Search still reads the segments. New document in the New menu, the course empty-space menu and ⌥N; lectures open on Summary, documents in the editor; Search hits still open the notes view. Documents' item menu: Rename, Move, Move out, Cut, Favorite, Delete (no Copy yet).
  - **Restore bug (Lea's test, 28 Oct) and fix.** A version restored on the laptop never showed on the iPhone with the document open. Two causes:
    1. **The iPhone kept a stale copy.** After sending an edit, it marked its cached copy clean only if nothing else for that tab was queued. A session version queued behind the edit (the app going to the background) counted, so the copy stayed "unsynced" for good. Every check and pull then showed the iPhone's own copy instead of the server's. Now only waiting edits count (`waitingEdits`). Opening a document with no edits waiting also repairs a copy left stuck before the fix.
    2. **A restore kept the old blocks' times.** Only the merge used "now", so an iPhone edit made before the restore but sent after it could beat the restore. The restored blocks are now saved dated now (`makeDocEdit` with restamp, `stampBlocks`), so a restore wins on every device over anything written before it, and an edit made after it wins as usual.
    - **Tests:** restore on the laptop while the iPhone has the document open (the iPhone shows it on its next check and sends nothing back); an old iPhone edit arriving after a restore loses and is kept as a conflict copy; a stuck copy is repaired on open. Both new tests fail with the old code.
  - **The spike** (screen, service, sample, Development row, Chrome check) is gone; the "Editor spike (development)" file in Lea's local database is now an ordinary document she can trash.
  - **Chrome** (`documents.mjs`, 8/8): new document in a folder with its title selected; title and text saved; another device's block in ~2 s with the local text kept; a version on leaving; version history: name, restore (with "Before restore"), thinning keeps the named one; lecture tabs, earlier notes, transcript chips; 390 px and dark. flows, layout, settings, item-menus, look (⌥N now creates), search, new-menu, library-menus pass.
- **Formatting (step 4.4, 28 Oct).**
  - **Packages (Lea's OK):** `@tiptap/extension-text-align` 3.32.0 (new) and `@tiptap/extension-text-style` 3.32.0 as a direct dependency (already there through TenTap). One ProseMirror copy (all 3.32.0); the npm audit count is unchanged.
  - **Schema** (`FormatBridge` in the shared list, so both editors): Title block, page break block, line spacing (1, 1.15, 1.5, 2) and indent (0–8) on paragraphs, headings and Title (indent on quotes too; in a list it nests the item), font family and size in the text style, alignment. Fonts: System, Rounded (Lea), Serif, Monospace; Normal is 15 (the mockup).
  - **One set of commands and state** (`src/editor/format`): the laptop's toolbar calls them directly; the iPhone's toolbar and panels send them through the bridge, which reports the state back. Clear formatting removes text formatting and the paragraph's align, spacing and indent, and keeps links and the block style (as Google Docs).
  - **Paste rules** (`src/editor/paste`): see DESIGN. The 4.2 losses are fixed: Docs' highlights and Word's lists and highlights now come through (Jest on a real editor and Chrome, both editors give the same document).
  - **⌘⇧R, ⌘⇧J, ⌘⇧V (Lea):** R and J are handled by the editor and their keydown is blocked from Chrome (the page didn't reload in the check). ⌘⇧V lets the browser's paste happen (the only way to read the clipboard without a permission prompt). The editor inserts it as plain text and blocks it from the browser. The plain mark ends when the keys are released, so a ⌘⇧V with an empty clipboard can't turn a later paste plain (found by the check). **Limit:** the check's keystrokes may not reach Chrome's own menu shortcuts, so Lea's keyboard is the final word.
  - **Found by the check and fixed:** crossing the 1024 px layout width (a resized window) remounted the editor, so the page briefly showed the last saved text. The screen now keeps one tree for both layouts.
  - **iPhone:** our own keyboard toolbar, plus the Aa and colour panels in place of the keyboard (TenTap's CustomKeyboard, whose native module is already in the build). It is checked only by building the iOS bundle; Lea tests it on the phone. The fallback, if the custom keyboard misbehaves, is an ordinary bottom sheet.
  - **Chrome** (`formatting.mjs`, 10/10): every toolbar control and the shortcuts, read from the JSON; R/J/V; the three paste samples with nothing lost on both editors; the Psicobiología page rebuilt; 1280 / 390, light and dark. documents, flows, layout, look, item-menus, settings and search pass.
  - **Lea's test (28 Oct): passed**, except that "Centre" alignment was hard to find. The menu said "Center" (the rest of the app says "colour"), and alignment sat in a dropdown on the laptop and in an icon-only row lower in Aa. It's now **Centre**, with four buttons always visible in the laptop toolbar and a labelled row right under the styles in Aa. ⌘⇧L/E/R/J are in the Chrome check.
  - **Page view and zoom (Lea's request, for 4.7):** in BUILD-PLAN 4.7 with the feasibility and the recommendation (a page view of our own that only changes the display, matching the export; Tiptap's paid "Pages" only as the last option).
- **Step 4.5, checkpoint A (28 Oct): colour picker, links, tables, the one-row toolbar.**
  - **Packages (Lea's OK):** `@tiptap/extension-mathematics` 3.32.0, `katex` 0.18.11, `@tiptap/extension-file-handler` 3.32.0, `@tiptap/extension-image` 3.32.0 (direct). One ProseMirror (all 3.32.0), and the npm audit count is unchanged. The last three are used in checkpoint B.
  - **Recent colours, synced across devices (Lea):**
    - Migration `20261026090900`: `profiles.preferences` jsonb (an object), local only so far.
    - `preferences.service` keeps a copy on each device and merges with the account's list by time (union, newest first, 10), so neither device loses a colour. The iPhone queues the update when offline.
  - **The colour picker:** the 10 base colours are in `DocColors.palette`; their shades are worked out by `shadesOf`, so the no-hard-coded-colour test stays meaningful. `ColorGrid` and `SpectrumPicker` are shared by the laptop popovers and the iPhone's colour and table panels.
  - **Links:** `cleanUrl` allows only http, https, mailto and tel, and completes "uned.es" and email addresses. With nothing selected, a link inserts its text and the cursor then leaves the link.
  - **Tables:** cells and headers have `backgroundColor` (a pasted cell's shading is kept as the cell's colour, not turned into a highlight); columns resize on the laptop; the `table` command covers insert, rows, columns, header row, cell colour and delete.
  - **The toolbar (Lea's idea):**
    - Laptop: one row plus ⌄ (remembered per device in `lib/toolbarPrefs`). Each tool's real width is measured once shown, and what doesn't fit moves into the second row: at 1280 px with the assistant panel open, highlight onwards go behind ⌄; at 1440, image and table; without the panel, everything fits.
    - A tool hidden behind ⌄ still answers its shortcut: ⌘K opens the link dialog under the toolbar (found by the check).
    - iPhone: most-used first, then a ⋯ row; the + panel and the table panel replace the keyboard.
  - **Found and fixed along the way:**
    - The block-meta plugin's follow-up transaction dropped the marks set for the next typed text (found by the link test).
    - Pressing the link bubble blurred the text and hid the bubble before the click landed (found by the check).
- **Step 4.5, after test A (28 Oct): tables reworked.** Lea: colours, links and the toolbar passed; "Delete table doesn't work" (iPhone and web), "I can't type after a table at the end", editing should happen on the table itself, rows × columns typed, a hex field on the iPhone.
  - **Why Delete table looked broken** (found in Chrome, two copies open): a copy of the document open elsewhere compared its editor's content with what it last received; content written without the schema's defaults (`colspan: 1`, `indent: 0`…, e.g. pasted before 4.5, the AI later) made every table look "typed here", so that copy refused the deletion and its next save brought the table back. Blocks now compare without default attributes (`schema/defaults.ts`, checked against the real schema by a test). Also: with select all, the table tools showed but couldn't act (now hidden); "Table ▾" was easy to miss behind ⌄ (now on the table).
  - **Room to type** (`schema/blockSpacing.ts`): a paragraph after every table and at the end (a system change with a fixed id, `<table id>-after`, so two devices adding it make one block); the gap cursor; Enter at the start of a top table's first cell adds a line above.
  - **On the table:** the floating bar (`table/tableBar.ts`, both editors), the laptop's right-click menu and bar menus (`TableMenus.web.tsx`), the laptop's hover handles (`table/tableHandles.ts`), merge and split, Table size… (`table/resize.ts`, up to 50 × 20, asks before removing text). "Table ▾" left the main toolbar.
  - **iPhone:** the bar's menus as action sheets and the table panel; numbers typed on the number pad and colour codes with letters and numbers, through the app's prompt (the panels sit where the keyboard goes, so a field in them can't bring one up).
  - **Not possible here:** a long-press menu in a cell on the iPhone (a long press in text selects words and shows the magnifier); the bar does that job.
  - **Chrome:** `inserting.mjs` 7/7 (grid, shade, hex, Automatic; Recent colours on the account and from "another device"; ⌘K, completion, the bubble, an unsafe address refused; the second row remembered; tables; the iPhone bundle reads the same table; the narrow window). formatting.mjs (opens ⌄ first) and the other suites pass.
  - **Not checkable here:** the iPhone toolbar, the + and table panels and the colour panel. The iOS bundle builds; Lea tests them.
- **Step 4.5, table retest (28 Oct): all passed except the hover "+" on the laptop**, which disappeared before it could be clicked. The "+" showed only while the pointer was within 12 px of a boundary, and only above or left of the table's own edges, so a hand drifting on its way (or aiming at the lower half of the last row's "+") lost it; the buttons were also rebuilt on every mouse move.
  - **Fix** (`table/tableHandles.ts`): the pointer is followed on the whole page; the handles stay while it is over the table or a margin around it (the grips' side plus 16 px), and go 300 ms after it leaves; a "+" stays at its boundary until the pointer nears another; the buttons are rebuilt only when what they show changes; the "+" is a 24 px target around its 16 px circle.
  - **Chrome:** `inserting.mjs` gains a step with the real mouse moving in small steps from a cell, drifting off the line, to each "+" (a row, a column, the last row's from below the table): the "+" never disappears on the way, it is under the pointer and 24 px, and pressing there inserts; leaving the table, the handles are still there at once and gone 0.6 s later. It failed on the old code ("disappeared at step 3") and passes now: 13/13.
- **Step 4.5, checkpoint B (29 Oct): photos, formulas, comments.**
  - **Photos (step 6):** the `image` node is Studiply's (`schema/photo.ts`, in place of TenTap's image): `src` `media:<id>` for a photo added here (a pasted picture keeps its address), `width` in % of the page so it's the same size on both devices. A media row per photo (kind photo, `file_id` the document, `lecture_id` null), the JPEG at `photos/{userId}/{fileId}/{mediaId}.jpg` (`doc-photo.service.ts`).
    - **Laptop:** the Image button (several at once), dropping files on the page (between paragraphs, never splitting one), pasting a screenshot (a pasted page with pictures goes through the normal paste). Each shows at once from the browser while it uploads; one that fails is taken out and the student told. Corner handles on a selected photo drag its width.
    - **iPhone:** + → Photo (several) or Take photo; kept on the phone and queued (`upload_doc_photo`, behind the document's own creation), so it works offline. The WebView asks native for each photo (`bridges/photo.ts`): the phone's copy as a data URI (`lib/photoCache`, kept until sign-out), or the signed link, then kept. A selected photo shows Small / Medium / Large / Full width in the keyboard toolbar.
    - **What shows instead:** "Loading photo…", "Photo — shows when online" (asked again every 20 s), "Photo not uploaded yet" (another device still sending it), "This picture can't be shown" (a pasted address that doesn't answer).
    - **Chrome** (`inserting.mjs`, photos): Image button → media row, Storage object, the signed link after a reload; a drop and a pasted screenshot; a corner drag saves the width in %; the iPhone bundle draws the placeholder and asks native. Jest: 28 new tests (`photos.test.ts`, `doc-photo.test.ts`).
  - **Formulas (step 7):** Tiptap's `inlineMath` and `blockMath` with KaTeX in both editors (each configured on its own: display formulas in KaTeX's display mode, centred); invalid LaTeX shows in red instead of breaking the page. `schema/formula.ts`: one `setFormula` (puts one in or changes the selected one, which stays selected, so the formula in the text changes as the student types), Remove, Done (an empty one goes; the cursor moves after it). A display formula at the end gets a line after it, like a table.
    - **Laptop:** ∑ in the toolbar, or a click on a formula: a popover with Inline / Display, the LaTeX, starters (Fraction, Power, Root, Sum, Integral), a KaTeX preview, Remove and Done. KaTeX's fonts: its stylesheet links them relatively, which the web bundler doesn't serve, so `katexFonts.web.ts` declares them again from the TTF files (fetched only when used).
    - **iPhone:** + → Formula, or tapping a formula: a sheet (its own keyboard: letters and numbers, no autocorrect) with the same pieces; the text above is the preview. The WebView bundle carries KaTeX with its woff2 fonts only (a Vite plugin drops the woff/ttf copies): 0.73 → 1.37 MB.
    - **Found by the check and fixed:** a display formula at the very end left the cursor past the last block, which crashed the toolbar's state (`blockOf`); leaving a document right after an edit didn't save that edit (the session read the editor after it was gone; separate commit).
  - **Comments (step 8):** a `comment` mark on the words (`schema/comments.ts`: id, text, time, resolved), so a comment travels with its block (sync, merge, versions) with no table or migration; several can cover the same words; typing at the edge doesn't extend one. Commands through `runFormat`; the format state carries the comment at the cursor and the whole list (for the iPhone).
    - **Laptop** (`Comments.web.tsx`): the toolbar's Comment or ⌘⌥M opens a composer under the words. With room beside the page (the shell's centre pane ≥ 1144 px: the shell measures it, `components/shell/commentMargin.ts`, and widens the columns while the margin shows), a margin of cards level with their words, following the scroll; otherwise a click on commented words opens its card as a popover. Cards: Edit · Resolve (Reopen) · Delete (asks first).
    - **iPhone:** + → Comment (the app's prompt); with the cursor in commented words, Comment comes first in the keyboard toolbar (an action sheet: Edit · Resolve · Delete).
    - **Both:** the document menu's **Comments** lists every comment (open, then Resolved) as cards; pressing one selects its words (`CommentsSheet.tsx`).
    - **Chrome** (`inserting.mjs`, comments): the margin card level with its words at 1800 px; ⌘⌥M, a click on the words, Edit and Delete at 1280; the document menu's list with the resolved one. Jest: `comments.test.ts` (10), including a comment merging into the server copy with its block.
- **Step 4.5, after test B (29 Oct): checkpoint C.** Lea: photos should wrap like Pages / Word; a bar over selected words with Comment first; `$…$` and maths typed as text; a finger can't resize a photo on the iPhone; the iPhone toolbar like the laptop's; the page view now (moved to its own step, **4.5b**, Lea's OK).
  - **Photo layout** (`schema/photo.ts`, `photoBar.ts`, `PhotoMenu.web.tsx`): `wrap` (break, left, right) and `align` on the photo; In line with text is a second node, `inlineImage`, and switching converts (in line → its own paragraph; back → before its paragraph). The photo bar (layouts, alignments, sizes, Delete) is drawn by both editors over a selected photo; the laptop also has a right-click menu, the iPhone a Layout sheet. Wrapped photos float; the editor contains its floats (`display: flow-root`).
  - **Selection bar** (`format/selectionBar.ts`): Comment · B · I · Highlight · Link over selected words; above on the laptop (after the mouse is released), below on the iPhone. Comment and Link reach the device as the table bar's presses do. Checked: react-native-webview's custom edit-menu items (`menuItems`) switch off iOS's Copy, Paste, Select All (its `canPerformAction` returns NO for them), so the iOS menu isn't used.
  - **Formulas as you type** (`schema/mathSuggest.ts`, `schema/formula.ts`): `$…$` (Pandoc's rule) turns into a formula as the closing `$` is typed, handled directly in one step; maths typed as text gets a "Make formula" chip (laptop: by the cursor, Tab; iPhone: keyboard toolbar). Nothing changes unless it's taken.
  - **iPhone photo handles:** the corner handles take touches (24 px on a touch screen); the WebView's drag-to-close-the-keyboard ignores a touch on a handle; on a phone the photo bar leaves the sizes to the keyboard toolbar so it fits.
  - **iPhone toolbar** (`iphone/KeyboardToolbar.tsx`): one row that never scrolls, fitted to the width with the laptop's rule (`toolbarFit.ts`, `splitRow`), an arrow for the second row (remembered); chips on a row of their own.
  - **Found along the way, not fixed (needs your OK):** Tiptap's typing shortcuts don't fire in Studiply's editor: "- " or "1. " for a list, "# " for a heading, "> " for a quote, `$$…$$`. Tiptap 3.32 inserts the typed character first and gives up when another plugin then changes the document, which the block plugin (4.3) always does, as it stamps the edit. `$…$` is handled directly, so it works. Fixing the rest means teaching the block plugin to let those through (or running the rules ourselves), a small step of its own.
  - **Chrome** (`inserting.mjs` part C): the photo bar's layouts with the text checked to flow beside a wrapped photo, centring, In line, the right-click menu; the selection bar above a real mouse selection, B, Highlight, Comment, Link, and below the selection on a touch screen; `$x^2$` typed, "$5 and $10" left alone, sqrt(x) then Make formula; a finger (touch events) dragging a corner handle on the iPhone bundle, the editor keeping focus. Jest: photo layout, the selection bar, maths detection and the `$` rule, the toolbar's fitting and the iPhone toolbar rendered (`keyboardToolbar.test.tsx`).
- **Step 4.5, test C passed (29 Oct) on both devices.** Lea: take the "+" out of the iPhone toolbar and put its items in the second row; fix the typing shortcuts; plan 4.5b (OK'd, with the Markdown marks).
  - **iPhone toolbar** (`iphone/KeyboardToolbar.tsx`, `iphone/InsertPanels.tsx`): no "+" panel; Photo, Take photo, Table, Formula and Comment are buttons at the end of the second row (after what didn't fit the first), so the arrow is always there and shows everything at once. Link stays a main tool. Table opens **New table** (rows and columns, Cancel / Insert) in place of the keyboard.
  - **Typing shortcuts fixed** (`schema/typingShortcuts.ts`, in FormatBridge, so on both devices): Studiply runs them itself, putting the typed character in and applying the shortcut in one change, so the block plugin's stamp comes after both and nothing gives up. Tiptap's rule helpers make the changes; Backspace right after gives back what was typed (Tiptap's `undoInputRule` reads the record the plugin keeps; the stamp that follows doesn't clear it); ⌘Z undoes the shortcut alone. The list: "- " / "* " / "+ ", "1. " (any start), "[] " / "[x] ", "# " / "## " / "### " (the three Studiply heading levels), "> ", `$$…$$` (display alone on a line, with a new line after it; inline in a sentence), `$…$` (moved here from `formula.ts`, the money rule unchanged), `**bold**`, `*italic*`, `~~strike~~`, `==highlight==` (Lea's OK). Left out: `![](url)` (a picture from the web without the photo flow), backticks, `_x_`. Tiptap's own runner stays underneath for IME composition. In the "?" sheet and DESIGN.
  - **Checked:** Jest (`typingShortcuts.test.ts`: each shortcut, only at the start of a line, the block's id and origin, Backspace and Undo, `$$…$$` both ways, the marks, applied once); Chrome (`formatting.mjs`: each one typed key by key, `$$x^2$$` then typing on the new line, `**muy**`, Backspace right after "- ").
- **Step 4.5b, page view and zoom (29 Oct, checkpoint D).** Our own page view, as BUILD-PLAN's feasibility note recommended; no new dependency, nothing stored in the document.
  - **Spike first** (a 10-page document of headings, 1–4-sentence paragraphs, lists, a 28-row table, a display formula and a page break, in Chrome): every one of its 338 lines of text inside its page's text area at 74 % and 150 %; a real click lands on the letter under it at both zooms (CSS `zoom` keeps ProseMirror's coordinates right in Chrome); measuring the whole document takes under 1 ms. It found three things, fixed: a gap drawn as a table row must span the table's own columns (999 made the table 21,000 px tall); a gap must allow for the space between a list item's edge and its first line; the laptop's sheet (794 px) is wider than the centre column with the assistant open, hence **Fit**.
  - **How:** `page/pageLayout.ts` (the rules, pure: lines split with two at least on each page, headings kept with the next line, rows and photos whole, page breaks) and `page/pageView.ts` (measures with the gaps hidden, draws each gap as a widget: a block, a line break inside a paragraph, or a table row; remeasures 120 ms after typing, on resize, fonts and photos; zoom is CSS `zoom` on the editor, so bars and handles beside it are unaffected). `lib/viewPrefs.ts` keeps each device's choice. The table's hover handles skip gap rows, and their "near a line" distance follows the zoom (at Fit, rows are smaller on screen; without this the "+" jumped to the next line again, which the real-mouse check caught; the "+" stays 24 px).
  - **Laptop:** Pages at Fit by default; the toolbar's Zoom menu and Pages button (behind ⌄ when the window is narrow); ⌘+ / ⌘− / ⌘0; "Page n of m" while scrolling; zoomed beyond the column, the page scrolls sideways (never at Fit).
  - **iPhone:** **…** → Print layout (the same pages fitted to the width), pinch to zoom (WebKit's `gesturechange`, as the WebView turns off the browser's zoom; also in Pageless), "Page n of m" while scrolling, the zoom kept on the phone. Checked in Chrome on the iPhone bundle at 390 px with touch and dispatched gesture events; **the real pinch, Safari's CSS zoom and sideways panning need your iPhone.**
  - **Not yet:** a photo wrapped left / right (floating) that crosses the end of a page isn't moved (its paragraph is); page setup (Letter, margins) comes in 4.7; the export uses these rules in 4.8.
  - **Checked:** Jest (`page/__tests__`: the break rules, the list item's space, the view settings in one change and never in the document or Undo; `lib/__tests__/viewPrefs.test.ts`); Chrome `pages.mjs` (7 steps) and the other suites, now with the laptop in Pages.
- **Step 4.5b, after test D (29 Oct): checkpoint E.** Lea: no grey panel and no scroll box around the pages; white pages straight on the gradient (also in Print layout and dark mode); then page setup per document, Google Docs style.
  - **Pages on the gradient** (`page/pageView.ts`, `editorCss.ts`): the editor was one white sheet with grey bands painted on it, so the gaps couldn't show what's behind. Now, once its pages are drawn, the editor is transparent and a layer behind the text draws each white page (soft shadow, its number); the gaps are empty space. Laptop: in Pages the shell gives the document the whole centre pane (`components/shell/commentMargin.ts` now also says `pages`), the page area is transparent and scrolls as one (no card; the scrollbar has no track); the tabs row and the toolbar keep the document's width at the top; the title is on the gradient (`DocumentHeader` `onGradient`); the comments margin scrolls beside the sheet. iPhone, Print layout: no white card, a transparent WebView (`RichText` style) and page background. Pageless is unchanged.
  - **Page setup** (`page/pageSetup.ts`, pure): A4 / Letter, portrait / landscape, margins in cm (Normal, Narrow, Wide or typed; less than 5 × 5 cm of text is lowered), page numbers (off, bottom centre, bottom right, top right), the gap (None, Small, Medium, Large). The plugin draws the sheet from it (size and padding on the editor's style; `setPageSetup`, and `setup` in the `view` command for the iPhone); `pageLayout.ts` takes separate top and bottom margins.
  - **Saved per document:** migration `20261029151759_document_page_setup.sql` adds `documents.page_setup` (jsonb, null = the defaults), **applied locally only**. `document.service.ts`: `openDocument` returns it, `setPageSetup` writes it (creating an empty row for a tab nothing was written in; the iPhone keeps it on the phone and queues `document_page_setup`, the latest wins); the row's `updated_at` moves, so the other device's 5-second check picks it up (`useDocumentSync` carries it; a check during this device's own save doesn't bring the old one back). Version history stays text only. **Set as default** goes to `profiles.preferences.pageSetup` (`preferences.service.ts`, queued on the iPhone) and new documents take it.
  - **The dialog** (`components/editor/PageSetupDialog.tsx`): **…** → **Page setup…** on both devices; Set as default, Cancel, OK.
  - **Checked:** Jest (page setup geometry, presets, lowering, cleaning saved values; the view command; the service on the laptop and the iPhone's queue; a new document with the default); Chrome `pages.mjs` (13 steps): the gap's colour sampled from the screen is the gradient's (not grey, not white) in light and dark, each page white with a shadow, one scroll area as wide as the pane; Letter landscape with Narrow margins, numbers top right and gap Large drawn, in the database and after a reload; typed and lowered margins; a change made on the server (the other device) shown within the check; Set as default on the account; the iPhone bundle with a transparent background and Letter landscape fitted. The other suites with it.
- **Simplicity pass before 4.6 (29 Oct).** Lea, after test E: some symbols and the organisation confuse; every icon named, words where an icon isn't obvious, fewer and clearer toolbar groups, menus with headings and plain words, page setup with pictures; every feature kept. Planned, built, shown as before / after screenshots (a private comparison page) and OK'd before committing.
  - **One list of names** (`src/editor/toolNames.ts`): tooltips with shortcuts on the laptop (`components/editor/ToolTip.web.tsx`), long-press names and second-row captions on the iPhone, menu items, VoiceOver. The bars inside the document name their buttons with `editor/barHint.ts` (hover / long press).
  - **Laptop toolbar** (`FormatToolbar.web.tsx`): undo, redo · Text · Format · Paragraph (Align ▾, Spacing ▾) · Insert ▾ · View ▾, separators between groups; behind ⌄ strikethrough, Clear formatting, checklist, Indent. **iPhone toolbar** (`iphone/KeyboardToolbar.tsx`): separators, long-press names, a second row in titled groups with captions (its height now also right on the web: `'auto'`, not `undefined`).
  - **Photo bar** in words; **Layout…** where it doesn't fit (a request like the table bar's: the laptop's photo menu, the iPhone's layout sheet). **Menu headings:** `section` on `DialogButton` (the document's … menu: Review, Page, Document), `PopoverHeading` (table and photo menus). **Plain words** in the formula editor, zoom, indent, page setup. **Page setup** drawn: a picture of the page as set and drawn tiles for every choice.
  - **Screenshots:** `app/dev/editor-preview.tsx`, a development-only page drawing the iPhone's keyboard toolbar and Page setup sheet in Chrome at 390 px (a release build goes home; the keyboard-accessory hook has a web stand-in, `iphone/keyboardAccessory.web.ts`).
  - **Checked:** Jest (1018: names, the iPhone toolbar's groups and captions); all Chrome suites (the checks open the Insert, Align and View menus and use Layout… when the photo bar is compact); the iOS bundle.
- **Step 4.6, Studiply blocks (29 Oct).**
  - **Callouts** (`schema/callout.ts`, in `bridges/blocks.ts`, both editors): a top-level block (`BLOCK_TYPES`: ids, origin, merge) with `kind` (definition, example, exam, warning, fromNotes, confused, addedContext), `level` and `ms`; the label is drawn from them (not text) and a click on it asks the device for its menu (laptop `BlockMenus.web.tsx`, iPhone action sheets through `calloutRequest`). `setCallout` wraps the selected top-level blocks; `removeCallout` keeps the text; Enter / Backspace as in a list.
  - **Mark chips** (`schema/markChip.ts`): an inline chip `markChip` (`kind`, `level`, `markId` for Phase 5); a click selects it and asks for its menu (`components/editor/MarkForm.tsx`: laptop popover, iPhone `iphone/MarkSheet.tsx`).
  - **Timestamp chips** (the 4.2 node): by hand (Insert ▾ → Timestamp, `parseClock`); a tap opens **the mini player** (`components/editor/MiniPlayer.tsx`) under the document: the lecture's `audio_chunks` with signed links (`services/lecture-audio.service.ts`, `chunkAt`), piece after piece, ±10 s.
  - **Playback goes through one file, `src/lib/audioPlayer.ts`** (Lea): the only place expo-av plays audio. expo-av is deprecated in SDK 54; when the Expo SDK is upgraded before TestFlight, and when Phase 5 moves recording off expo-av (`record/index.tsx`, `record/active.tsx` still import it), only this file changes to expo-audio.
  - **Not yet:** playing needs a connection (the phone's copies of chunks are kept only until they're uploaded; Phase 5 plays from the local file during and right after recording); a chip in a lecture being recorded says it plays once the recording has stopped.
  - **Colours:** `DocColors.callout`, `markChip`, `timestamp` (SUMMARY-SPEC where it gives them; Example, Common mistake and Added context are new), every label ≥ 4.5:1 (contrast test). The recording screen's mark buttons keep their earlier colours (Confused purple, Exam salmon) until Phase 5 aligns them with the spec.
  - **Checked:** Jest (`studyBlocks.test.ts`: labels, wrapping, kinds and level, Remove keeps the text, Enter / Backspace, HTML both ways, mark chips, typed times; `lecture-audio.test.ts`: the chunk with a moment in it, deleted audio); Chrome `blocks.mjs` (6 steps: each callout typed in with its label and colour, the label's menu, mark chips, a timestamp, the iPhone bundle, a lecture with a two-piece recording playing from 0:07 in its second piece, +10 s, a blank document with no recording).
  - **After Lea's review of the screenshots:** the iPhone screenshot showed the first callout as Example and no Added context. The app was right; the check had sent the iPhone the document after its Change to / Remove step. The iPhone step now comes first, at a phone's width, and checks all seven kinds (label, fill, then kind, level and text after typing in each box); `studyBlocks.test.ts` round-trips all seven in JSON and HTML. The Mark icon is a flag on both devices (✦ is the assistant's).
  - **The selection bar's Callout ▸ · Mark ▸ · Time ▸** (Lea, after the review; Comment · B · I · Highlight · Link kept): `format/selectionBar.ts` (small inline pictures and a word; a divider, or a second row on a touch screen), `SELECTION_MENU_EVENT` for the laptop's popovers under the button, `selectionRequest` for the iPhone's sheets. `insertMarkChip` / `insertTimestampChip` put the chip after selected words instead of replacing them. Checked: `selectionBar.test.ts` (the eight buttons, no Callout in a table, presses reach both devices), `studyBlocks.test.ts` (chips after the words, one Undo), Chrome `blocks.mjs` step 7 (laptop: Mark ▸ / Time ▸ after the words, Callout ▸ keeps them inside; iPhone bundle: below the words, two rows, no sideways scroll; the row divider once overflowed by 2 px).
- **Step 4.7b, tabs in every document (29 Oct).** BUILD-PLAN 4.7b as planned, nothing more.
  - **Data (part 1):** migration `20261029151900_document_tabs` (`tab` is the tab's id, `t-<uuid>` for an added one; `title`, `position`, `deleted_at`, `kind`; `unique (file_id, tab)` and RLS unchanged; no existing row rewritten: null means the defaults). `src/services/document-tabs.service.ts`: the list (`orderTabs`), add (at most 30, "Tab N", empty page, the document's page setup), rename, move (only the moved tab's `position`, the midpoint), delete (soft) and restore; the laptop writes at once, the iPhone queues `create_tab` / `tab_meta` under `fileId:tab`. Page setup is written to every tab. Deleted on one device and edited on another: an edit reaching a deleted tab brings it back (`applyDocEdit`), a delete arriving after a newer edit than its device had seen is dropped (`seenEditedAt`). Checked: Jest `document-tabs.test.ts` (16) and `offline-tabs.test.ts` (6); pgTAP `15_document_tabs` (16; run by Lea's advisor, 329 in all).
  - **Screens (part 2):** `components/editor/DocumentTabs.tsx` for every document (it replaces the lecture-only pill and the iPhone's segmented control): the tabs in a pill (the open one `accentLight` / `accentDark`), **+** beside it; laptop: a second click on the open tab renames it, right-click → Rename · Delete, drag to move (a thin accent line where it goes); iPhone and narrow windows: the row scrolls sideways, long-press → Rename · Move left · Move right · Delete. Delete shows Undo. A lecture's three tabs have no menu and never move; a plain document with one tab shows only **+ Add tab**. The "tab kept" notice: `takeKeptTabs` (iPhone) and the save session's `kept` (laptop). Version history names the tab. On the web the tabs carry `aria-selected` (react-native-web 0.21 ignores `accessibilityState`), and the row can't be text-selected (a press that selected text is cancelled); the graph form's type buttons and the formula form's mode buttons got the same `aria-selected` fix. Checked: `npm run check`; Chrome `tabs.mjs` 8/8 (+ Add tab and its name, rename by menu and by a second click with nothing selected in the row, drag, delete + Undo, a lecture's fixed tabs, a reload, 1280 / 390 light and dark, long-press Move left, no tab under "+"), run by Lea; flows, documents, look, layout, formatting, inserting, blocks and pages pass. The 390 px scrollbar under the page area predates 4.7b (not changed; fixed 30 Oct, see after 5.5).
- **Step 4.9, earlier notes into the Summary tab (30 Oct).** BUILD-PLAN 4.9 with the advisor's decisions:
  - headings in the lecture's language;
  - highlights as a quote plus an Added context callout;
  - Attachments with the photos shown (not copied);
  - no background pass;
  - the old notes view unchanged.

  No migration, no server script, nothing run against the remote.
  - **What is converted:** a lecture's newest `summaries` row in format legacy-note-v1 (step 1.9's import of the old app, and the generate flow until Phase 7) → the lecture's Summary tab document (`src/services/legacyNotes/convert.ts`, pure).
    - **Sections:** the title; the summary's markdown (paragraphs, `#` headings, `-` / `1.` lists, bold, italic); key concepts; formulas (KaTeX, or text when KaTeX can't read them); Definition callouts; unclear parts; Clarify highlights; tags; Attachments.
    - **Origins:** each block keeps its section's origin (`ai` / `student` from the note's meta; `student` without it, as 1.9 decided; `media` for attachments). Ids come from section and place.
  - **When:** the document screen, when a lecture's Summary tab opens with no document (`run.ts`, `index.ts`). It never writes over a document that is there. The old row is only read (new `getNoteResultBySession` beside `getNoteBySession`, same lookup). Saved with `saveDocument` (merged by block; queued offline on the iPhone). On a failure the tab shows the earlier-notes card (its text now says it tries again) and the next opening tries again.
  - **The regenerate edge:** see test N, item 5.
  - **Checked:** Jest `legacyNotes.test.ts` (20: every section, headings per language, origins and times, the same note gives the same document, loose old JSON, the editor takes the document as it is; the runner: once, never over a document, a regenerated note doesn't reach the tab, the old note only read, the other device's conversion, failures write nothing); `npm run check`.
  - **`notes.mjs`'s seeding failed on Lea's first run** (my values didn't match the schema). It wrote the app's "completed" where `lectures.status` is "ready" (Lea fixed that), and uploaded a PNG where the photos bucket takes JPEG only.
    - **Corrected:** every seeded value checked against the migrations; the photo is a real JPEG drawn on a canvas in Chrome; the seeding runs inside the run's `try`, so a failure there still removes the test user.
  - **The advisor's full run:** `notes.mjs` 8/8 (after the splash fix), and every other suite passes except `documents.mjs` (6/8). Its lecture steps waited for the "Notes in the earlier format" card, which 4.9 now converts by design.
    - **`documents.mjs` updated:** both steps now expect the converted Summary tab (and its summary row), and the notes view still opens. Every other assertion is unchanged.
    - **New step for the card where it still shows:** the browser refuses the Summary tab's save, so the card appears with Open notes, nothing is saved, and the card says it tries again. Once saving works, the next opening converts the note.
  - **`documents.mjs` 9/9 (the advisor's run).**
  - **Fixed after it, as the advisor asked:** a lecture's Summary tab could briefly show "No summary yet" (with Process now) before its note had loaded, because the screen loads the file first, then the note.
    - **Now:** the Summary tab stays in its loading state until the lecture's note lookup has finished (`noteCheckedFor` in the document screen), then converts or says "No summary yet".
    - **New assertion in `notes.mjs`:** a watcher installed before the app runs records whether "No summary yet" or its texts ever appear during the first opening of an unconverted lecture's Summary tab; it must never.
    - **Checked:** `npm run check`; the installed `notes.mjs` 8/8 and `documents.mjs` 9/9 pass with the fix.
  - **Approved (30 Oct):** all thirteen suites pass on the advisor's full run (notes 8, documents 9, flows 19, look 12, layout 9, formatting 12, inserting 30, blocks 8, pages 13, tabs 8, sheets 16, writing 19, export 9). The advisor installed `notes.mjs` and `documents.mjs` and added `notes.mjs` to the web-check SKILL.md. Committed as one local commit.
  - **Not yet:** test N (Things Lea must do), with the regenerate edge (item 5) on Lea's list.
- **Step 4.8a, PDF export (30 Oct).** BUILD-PLAN 4.8's PDF part, split from .docx (4.8b, which needs Lea's OK for a library). No new dependency, no migration.
  - **Pages as the page view's:**
    - each tab goes in a hidden editor with the document's page setup, Pages on, at 100 % and no gap, and the page view lays it out with `pageLayout.ts`;
    - each page becomes a box of the paper's size with its blocks where they were placed (a block running on is cut in the blank margin and shows its next part on the next page);
    - graphs, formulas, callouts, chips and photos are the editor's own drawing (`src/editor/export/printPages.ts`).
  - **The dialog (both devices):** the menu's Page group → Export PDF… (sheet tabs too): This tab / All tabs (each tab from a new page, its name as a Heading 1), Page numbers (on by default, through the file).
  - **Sheet tabs:** print a table of their values (`sheetTable.ts`).
  - **Laptop:** the browser's print window at the paper's size, where Save as PDF writes the file, as `export.service` already did for lecture notes (a one-click download would need a PDF library).
  - **iPhone:** the editor bundle in a small WebView of its own (`PdfRenderer`, export bridge) builds the same pages; expo-print writes the PDF in points (the pages drawn at 3/4) and the share sheet opens.
  - **Small calls (in the report):**
    - numbers on by default even when the page setup has them Off (then bottom centre);
    - in the document screen, the lecture's earlier-notes export gives way to Export PDF… (it stays in the library menu and the notes view);
    - sheets without column letters or row numbers.
  - **Checked:** Jest `exportPdf.test.ts` (11: the sheet table, the tab heading, pages per block, number places, paper in points, the print document's page sizes, numbers 1…n, iOS scale); `npm run check`.
  - **Lea's first run of `export.mjs`: 8/9.**
    - **The failure:** All tabs expected "Tab 1" at the text area's top (96 px); it was at 117 px.
    - **The cause, in the check:** the page view keeps a document's first block's own space before (a Heading 1's top margin, 0.8 em = 21 px; the page is `display: flow-root`). Word and Google Docs do the same. Only after a page gap is it dropped, which is why the text after the page break sits at 96 px. The PDF matches the page view, as it should.
    - **The corrected check:** each tab's heading must be the first block on its page, at the top margin plus a Heading 1's space before (read from the editor's CSS). A new assertion checks that page 1's title sits in the PDF exactly where the open editor's page view draws it.
  - **The corrected check: 9/9**, but Lea's review of the screenshot found a table drawn over "2. Final" on page 5, and "Tab 1" looking smaller than the other tab names.
    - **Measured (temporary logging, removed):** a table was drawn 9 px lower in the PDF than in the page view. Its top margin (0.6 em) collapses out of its wrapper in the editor, but stayed inside the print's positioned block box. So the PDF differed from the page view (rows could even cross the bottom margin).
    - **Fixed (app):** each block is placed once in the print's own boxes, off screen, while the pages are built. How far its box lands below its wrapper (its inset) is measured, and the block is moved up by that much. This covers any block, not only tables. Jest covers the placement.
    - **The full-size print never overlapped** (17 px between the table and the heading after the fix, 8 px before). The overlap in the picture, and the different-looking heading, came from the overview's CSS `zoom`, which lays the text out again at a tiny size. The overview now shrinks the pages with a transform, so it shows the real layout.
    - **All three tab headings are Heading 1 at 26.25 px.**
    - **New assertions:**
      - every block starts on the same page and at the same top as in the open editor's page view (within 1 px; This tab, Letter landscape);
      - no two blocks overlap in the PDF (every export) or in the page view;
      - every tab's name heading has the same font, size, weight and height as the others and as a Heading 1.
  - **The new check: 7/9.** The page-view comparison found blocks off by 1.3 px from page 4 (A4) and by 7.2 px on page 5 (Letter landscape, at Fit).
    - **The real cause (page view, `pageView.ts`):** `measure()` took the zoom as `box.width / dom.offsetWidth`, but `offsetWidth` is whole pixels. An A4 sheet is 793.7 px wide (794 in `offsetWidth`), so even at 100 % the ratio was 0.99962. Every measured position came out 0.04 % too far down (about 1 px by the third page), every gap that much short, and the pages started off their top margin (95.2 px instead of 96). This affected papers whose width isn't whole pixels (A4 portrait and landscape; Letter's 816 px is). The check computed the same ratio when reading the open page view, so the two disagreed.
    - **Fixed:** the scale is now the zoom the page view sets itself (`shownZoom`), exactly. Pages start exactly at their top margin ("Después…" at 96.0 px in the PDF).
    - **Also found and fixed:** the page view now measures again when the document's height changes (a block that grows after the pages were drawn) and on every `loadingdone` of fonts (KaTeX's arrive after the first measure). A gap is redrawn when it changes by any fraction of a pixel: its widget key and the "same layout" test used whole pixels. The export's "settled" waits for loading fonts and compares heights to the hundredth, and takes the blocks again until two takes agree.
    - **The 7.2 px in Letter landscape at Fit (78 %)** is the browser drawing text and table rows at that zoom (the rows a fraction taller each). At 100 % the same comparison passes. The PDF is the 100 % page, so the check now compares at 100 % (⌘0, the document opened again), with the 1 px tolerance unchanged.
    - **Checked:** `npm run check`; the installed `export.mjs` and `pages.mjs` (13/13) after the fix.
  - **Approved (30 Oct):** `export.mjs` 9/9 and all twelve suites on the advisor's full run. The advisor rebuilt `editorHtml.js` and added `export.mjs` to the web-check SKILL.md. Committed as one local commit.
  - **Not yet:** test M on the iPhone (Things Lea must do; expo-print and the share sheet can't be checked in Chrome).
- **Step 4.8b, .docx import and export (30 Oct).** BUILD-PLAN 4.8's Word part, as planned. New dependencies (Lea's OK, installed by Lea): mammoth 1.13.0 (import) and docx 9.15.0 (export), both pure JavaScript, both loaded only when an import or export starts, neither in the editor WebView bundle. No migration.
  - **Export (both devices):** the menu's Page group has Export PDF… and Export Word…, one dialog with PDF / Word at its top (This tab / All tabs, Page numbers).
    - **Built from the JSON** (`src/editor/export/docxBuild.ts`): a section per tab with the page setup's paper, orientation and margins; Title and Heading 1–3 as Word's styles; bold, italic, underline, strike, colours, highlights (shading in Studiply's colour), fonts, sizes, alignment, line spacing, indents, links, line breaks; Word lists (each numbered list from its own start); checklists as ☐ / ☑; tables with cell colours and column widths; page breaks; callouts and formula cards as shaded lines with a coloured edge and their label; chips as their text on their colour; the page field in the footer (or the header, top right). All tabs: a section each with its name as a Heading 1, the numbers running on. Sheet tabs: 4.8a's table of values.
    - **Pictures** (`docxPictures.ts`, `pictures.ts`): formulas (KaTeX's HTML in an SVG `foreignObject`, with KaTeX's stylesheet and the fonts it uses as data) and graphs (the module's SVG) drawn on a canvas at 2×; an inline formula lowered by how far it reaches below the line. Photos as their files at their width. A formula that can't be drawn is its LaTeX; the dialog says how many pictures are missing.
    - **Laptop:** the file downloads (`<title>.docx`). **iPhone:** the pictures come from the export WebView (`PdfRenderer`, new export-bridge messages), the file is written to the cache and the share sheet opens.
  - **Import (both devices):** a .docx from Upload (laptop: + New → Upload document; iPhone: Upload → PDF or Word (Files)) or dropped from the Finder becomes a document in the open course or folder, named after the file (`docx-import.service.ts`).
    - mammoth reads it with a style map (Title, Subtitle, quotes, underline, highlights, page breaks); the HTML goes through the paste rules and the schema (`wordImport.ts`; in the export WebView on the iPhone); every block is the student's.
    - The document is created with its text, then each picture becomes a photo of it (queued on the iPhone) and the document is saved with them.
    - A note after the import lists what the file had that isn't kept, found in the file itself: headers and footers (not a page number alone), comments, tracked changes (the text as if accepted), text boxes (their text kept as lines), equations, text colours, background colours, pictures Studiply can't show (EMF / WMF). An old .doc is refused with a message.
  - **Checked:** Jest `docx.test.ts` (15: the pictures asked for, the XML of the export, the import of a .docx made with the docx library, the note, `importDocx` with the services mocked, a round trip); `npm run check`. Chrome `docx.mjs` written, to be installed and run by Lea.
  - **Lea's first run of `docx.mjs`: 6/11.**
    - **The laptop's two formula pictures failed (app).** KaTeX's stylesheet declares its fonts with links the web bundler doesn't serve, at weights "400" / "700"; `katexFonts.web.ts` declares the same faces again from the served files, as "normal" / "bold". The picture code kept a face per literal weight, so it took KaTeX's link, the font didn't load, and the formula was left out. **Fixed:** weights read as one face (400 = normal, 700 = bold), every file a face names tried (the page's own declaration first), and a font recognised by its first bytes (not by what the server calls it). A failed picture now gives a reason (never the formula), in `window.studiplyDocx.reasons` and the console.
    - **A display formula's picture had a blank band under it (app):** the point used to find the baseline (only needed inline) started a line of its own after the display block. It is now only added to inline formulas.
    - **Steps 2–4 failed because step 1 did (check).** On my run with the font fix, steps 2–10 pass and the file has all four pictures.
    - **Step 1, then (check):** the live formula's screenshot was blank. `captureBeyondViewport` makes Chrome lay the window out as tall as the page, so the app moved the formula away from where it was measured. The picture itself was right.
    - **Step 11's size gap (check):** the standalone bundle page has no app stylesheet (the app injects `editorCss` with its 15 px text), so the live formula was at the browser's 16 px and the picture at 15 px (332 / 312 ≈ 16 / 15; the same KaTeX glyphs). The check now draws the picture at the page's own text size.
  - **Lea's second run: 11/12.** The spike's inline formula: picture 95 × 43 dark pixels, live 94 × 39.
    - **The cause, in the check:** it photographed the live formula's `.katex` element. Inline, that is an inline box only as tall as the font's line, and a fraction reaches beyond it: the screenshot cut the formula's top and bottom off. The glyphs and widths matched.
    - **The picture (Lea: crop it to the formula's own box):** it is now KaTeX's own box (its `.katex-base` pieces together, each as tall as its strut: the formula's height above the baseline and depth below), with 1 px around, at 2×, instead of the line around it. An inline formula is lowered in Word by how far that box reaches below the baseline. `cropBox` in `pictures.ts`, Jest-tested.
    - **The check (`docx.mjs`, 13 steps):** the live screenshot is the same box (never `.katex`); a new assertion that it isn't cut at its edges; the picture must be that box's size within a pixel; and the inline formula's lowering in Word must match the live formula's depth within 2 half points. The thresholds are unchanged.
  - **Lea's third run: 12/13.** Only the spike's inline formula: overlap 0.560, the two pictures identical by eye.
    - **The cause, in the measure:** a strict pixel-for-pixel overlap on a ~95 × 40 px formula is mostly anti-aliasing (an edge one pixel over), and the live crop was stretched to the picture's ink size before comparing.
    - **The check now:**
      - the live formula is screenshotted at device scale 2, the picture's own resolution (not a 1× shot enlarged);
      - both are aligned by their ink's top left, never scaled;
      - a dark pixel matches when the other picture has ink within 1 px.
    - **The bar stays:** 0.7 of all dark pixels in both; the size within 8 %; the box within a pixel; the lowering within 2 half points.
  - **Every photo on white (Lea, after the second run):** `toJpeg`, which every photo goes through (pasted, dropped, picked, taken, uploaded to the library, imported from Word, an avatar), draws a picture that can be transparent on white before the JPEG.
    - **Laptop:** `toJpeg.web.ts` draws every picture on white on a canvas (also the resize and JPEG; it replaces expo-image-manipulator there).
    - **iPhone:** React Native has no canvas and expo-image-manipulator's iOS side has no background fill. So `utils/imageAlpha.ts` reads the file's first bytes: a PNG with alpha or tRNS, a GIF, a WebP with alpha, a 32-bit BMP. Only those go to the editor bundle's WebView (`export/flatten.ts` through the export bridge), mounted at the app's root by `PictureFlattenerHost` only while pictures wait (`lib/pictureFlattener.ts`). Camera photos never do. One that can't be drawn there is refused, never saved black.
    - **The Word import's own flattening (from the first run) is gone:** toJpeg now does it for every picture.
    - **Jest:** `imageAlpha.test.ts` (4), `toJpeg.test.ts` (4), `pictureFlattener.test.ts` (3); `docx.test.ts` adjusted.
    - **Chrome:** the logo imported in a Word file, put straight into a document (Insert → Image) and uploaded to the library, each read back from Storage.
    - **Before that, the web dev server must be restarted:** it keeps resolving `../utils/toJpeg` to the native file it found before `toJpeg.web.ts` existed. My run without a restart showed the imported logo black: the old conversion, no white.
  - **Transparent pictures on import (Lea, after the first run):** a PNG, GIF, WebP or BMP from a Word file is drawn on white before it becomes a JPEG photo (`export/flatten.ts`; in the export WebView on the iPhone, a new bridge message), so a transparent logo isn't a black box. One that can't be drawn is left out and counted in the note. Jest: 3 tests added (`onWhite`, a failed flatten, the font-face helpers). `docx.mjs`: a step that imports a transparent logo and reads the stored JPEG back (white around the red square), and the bundle's flattening.
- **Step 4.7, writing tools (30 Oct).** BUILD-PLAN 4.7 as written. Page setup was already built in 4.5b and is unchanged. No new dependency, no migration.
  - **Shared** (`src/editor/writing`): find & replace (`find.ts`), counts (`counts.ts`) and the outline (`outline.ts`), all in the editor both devices run, through `runFormat` and `formatState`.
    - Matching stays inside a paragraph and works across bold and links. Whole words means no letter or digit next to the match. Replace all is one transaction, so one Undo.
  - **Laptop:**
    - the find bar under the toolbar (⌘F; ⌘⇧H opens it with Replace);
    - the status line under the page: "Page n of m" and the word count (a click gives the details);
    - the outline (⌘⌥A): a column left of the page at ≥ 1,024 px while the page keeps its room, over the page otherwise;
    - the document menu's Tools group: Find and replace, Outline, Word count;
    - the shortcuts sheet lists ⌘F / ⌘⇧H and ⌘⌥A.
  - **iPhone:** from the same menu: the find bar over the text, the outline as a sheet, and the word count's details in an alert.
  - **Sheet tabs:** none of these tools. The menu shows only Version history, there is no status line, and ⌘F is the browser's own find.
  - **Checked:**
    - Jest `writing.test.ts` (14: find with case, whole words, across bold, wrapping, replace, replace all with one undo, special characters, recount; counts against Google Docs' rules and the selection line; the outline's levels, current section and jump);
    - `npm run check`.
  - **Lea's first run of `writing.mjs`: 12/17.**
    - **The cause (the app):** after Replace all no match was left, so the Replace all button turned itself off and the focus fell to the page. Esc was only heard in the search box, so the bar stayed open. ⌘Z then never reached the text, Replace all stayed in the document ("El VPN" in the outline), and the bar stayed open with Match case on for the later steps.
    - **Fixed:**
      - Esc closes the bar from anywhere in it, or when the focus is nowhere (captured on the window, because the text box stops Esc before it bubbles up);
      - a replace that leaves no match puts the focus in the search box;
      - ⌘F or the menu with the bar already open puts the focus back in the search box (with newly selected words as the search).
    - **The check (`writing.mjs`):** two of its messages were syntax errors (Lea removed them; they now read the page only when they fail). The word count step now puts the cursor down first, because the undone Replace leaves its words selected, as Undo does.
  - **Layout, after Lea's review:** the word count line and "Page 2 of 2" covered a line of text.
    - Both are now pills in a status line under the page, outside it.
    - The check asserts at 1280, 900 and 390, light and dark, and in Pageless at 1280, with the text scrolled half-way and words selected, that no visible text line is under them, that they are off the page and that they are inside the window.
    - Also found in the screenshots: with the assistant open at 1280, the outline column left the page under 50 %, so the page scrolled sideways. The outline now sits beside the page only while the page keeps its room, and lies over the page otherwise.
  - **`writing.mjs` 19/19** (Lea's run, 30 Oct), and the status / outline screenshots approved. The iPhone's fading "Page n of m" stays as it is (test D).
  - **A regression found by Lea's full run:** `blocks.mjs` failed at the selection bar step (the chip went to the end of the line, not after "Esto entra").
    - **Cause:** the status line under the page made the page's scrolling area about 40 px shorter. A line just written at the bottom then sat 14 px above the area's edge, and a drag across it reached the browser's autoscroll edge. The page scrolled under the mouse and the selection ran to the end of the line.
    - **Fix (laptop editor):** the line being written keeps room above the page's bottom edge. Within 48 px of the edge, the page scrolls it up to 64 px (ProseMirror's `scrollThreshold` / `scrollMargin`).
    - **Checked:** `blocks.mjs` 8/8, plus writing, pages, formatting, inserting, documents and tabs.
  - **Approved (30 Oct):** every Chrome suite passes (Lea: flows 19, look 12, layout 9, sheets 16, blocks 8). Lea rebuilt `editor-web/build/editorHtml.js` and added `writing.mjs` to the web-check SKILL.md. Committed as one local commit.
  - **Not yet:** test L (Things Lea must do).
  - **Unchanged:** the iPhone's "Page n of m" (drawn in the WebView at the bottom left while scrolling, fading after a moment, as approved in test D).
- **Step 4.7e, the spreadsheet tab (29–30 Oct).** BUILD-PLAN 4.7e with Lea's 30 Oct additions (Undo / Redo, insert / delete rows and columns, copy / cut / paste), in three checkpoints reviewed by Lea's advisor. The formula engine is `src/lib/sheets` (merged from `sheets-engine`); this step added inside it only `help.ts` (the 18 functions' groups, argument names, one-line help), `context.ts` (the function and argument at the cursor, read with the engine's tokenizer) and `structure.ts` (references after inserting or deleting rows and columns, `$` ones too), each with tests.
  - **Data:** a tab with `kind = 'sheet'`; its content is one `sheetCell` block per cell that isn't empty (`src/lib/sheetDoc.ts`: the address is the block id; what was typed, bold, `editedAt`, origin `student`). The text merge, the iPhone's queue, versions and Restore work on cells unchanged: different cells on two devices are both kept; the same cell, the newer wins and the other is a version. No migration. Values are calculated on the device.
  - **The grid** (`src/components/sheet/`): A–Z × 1–1,000, virtualised rows, a row redrawn only when its cells or the selection on it change; letters and numbers stay in view; the grid scrolls inside the tab, never the page. Numbers are rounded to the cell's measured width as Excel's General (canvas on the laptop; the iPhone measures its system font with `FontProbe.tsx`), never cut with "…".
  - **Laptop:** the formula bar (↶ ↷, the name, the formula, **B**), typing, arrows / Enter / Tab, double-click / F2, Delete, ⌘B, Excel errors with an explanation line; clicking and dragging references into a formula; autocomplete with the help line (current argument in bold), kept inside the grid; the fill handle; ⌘Z / ⌘⇧Z (one step per action); right-click a row number / column letter → Insert / Delete; ⌘C / ⌘X / ⌘V (values out as tab-separated text, such text in; a paste moves references like the fill). The grid reads its scroll offset from the page (a click right after a scroll hit the old cell).
  - **iPhone** (and the web at 390): the bar under the grid, on the keyboard while typing (Return goes on to the next cell, ✓ ends); tap to select, tap again to type; taps add references with the keyboard up, the dot on a reference drags a range; the list and help line just above the bar, the edited cell kept whole above them; the fill handle by finger; long-press a row number / column letter (Insert / Delete) or a cell (Copy · Cut · Paste through the system clipboard).
  - **Choices accepted by the advisor:** bold on whole rows or columns only on filled cells; the full value on the clipboard. Known issues: an insert while the other device edits offline; cut doesn't redirect references.
  - **Checked:** Jest (`sheetDoc`, `sheetMerge`, `sheetDisplay`, `sheetEditing`, `sheet2b`, `offline-sheet`, and the engine's `help`, `context`, `structure`: 1709 tests in all); Chrome `sheets.mjs` 16/16 and `tabs.mjs` 8/8 (+ asks Document · Spreadsheet), with flows, documents, look, layout, formatting, inserting, blocks and pages passing (Lea's run of the full tree, 30 Oct). Not yet: the iOS Simulator run and test K (Things Lea must do).
- **Step 4.7d, graphs (29 Oct).** Lea: graphs built in a document from a small table. The drawing is a separate module (`src/lib/charts`, built by another session on branch `charts-engine`, merged 29 Oct); 4.7d is everything around it.
  - **The block** (`schema/graph.ts`): a top-level atom (`BLOCK_TYPES`), its data in its attributes (`kind`, `title`, `xLabel`, `yLabel`, `series`, `rows`; cells as typed text, read as numbers with a comma or point when drawn, `graph/data.ts`); at most 3 series, 50 rows, 60 characters; HTML `<figure data-graph>` with a description. A node view draws it at the text width (redrawn when the width changes). Allowed inside a callout.
  - **Editing:** `GraphForm` (shared): laptop popover under the graph, iPhone sheet; each change is `{ type: 'graph', action: 'set' }`, so the graph redraws as the student types. The format state carries a graph's data only while it is selected (it crosses to the iPhone at every change). A graph low on the screen scrolls up before its form opens; with no room below it (a short window, a graph at the top), the laptop's form opens beside the page at the window's right edge.
  - **The module's door:** `graph/charts.ts`, the only file that knows its API (`renderChart`, `describeChart`): the table becomes named series of x/y points; the SVG carries its own title and description for screen readers; each graph's SVG ids come from its block id. Narrower than 420 px (a phone), a graph is drawn 420 px wide and scaled down, so labels like "2019" don't break. Pies with more than 8 slices put the smallest together (the module's rule).
  - **Decimals with a comma** (Lea): 18,5 when a number in the graph was typed with a comma, or the document is in Spanish. The document screen passes the language (the lecture's, else the account's `default_language`) to both editors, which set `lang` on the page (also the spellchecker's language) and tell graphs to redraw (`LANG_EVENT`); the module writes a point, so `commaDecimals` rewrites only the SVG's text, never its coordinates. If the charts module gets a decimal option later, only `graph/charts.ts` changes.
  - **Checked:** Jest `graph.test.ts` (numbers read, limits, scatter and pie notes, insert / set / delete, HTML both ways, cleaning, the iPhone's state, the module's SVG drawn with its title, two graphs with their own ids, in a callout) and the module's own tests (`src/lib/charts/__tests__`); Chrome `inserting.mjs` (Insert ▾ → Graph, typing values, + Row, the four types each redrawn, Done and reopening, the iPhone bundle); screenshots of the four kinds on both devices and in grey (printing).
- **Step 4.7c, formula library (29 Oct).** Lea: ready-made finance formulas, grouped, with a search box; inserted nicely written with a line for each letter; editable after. Plan OK'd; legend in English (Lea).
  - **The library** (`src/editor/formulas/library.ts`): ten entries in three groups, each with its LaTeX (multi-letter symbols as one word, `\mathit{PV}`), the formula in plain text for the list, the legend (symbol, meaning) and search words (Spanish names too); `searchFormulas` ignores case and accents. Another subject is more entries.
  - **The formula card** (`schema/formulaCard.ts`, in `bridges/blocks.ts`): a top-level block (`BLOCK_TYPES`) holding a display formula and the legend line(s) (`blockMath paragraph+`), its title drawn from an attribute; allowed inside a callout. `insertFormulaCard` puts it after the cursor's line (in place of an empty one) with a line after it. Enter on an empty last line leaves it (`schema/boxKeys.ts`, now shared with callouts); Backspace in an empty card removes it; Pages keeps it whole. Colours `DocColors.formulaCard` (contrast tested); on a phone the formula draws a little smaller so WACC fits.
  - **Picking:** `components/editor/FormulaLibrary.tsx`, the same list on both devices: laptop Insert ▾ → Formula from the library (popover); iPhone the formula sheet's From the library. One format command, `{ type: 'formulaCard', id }`: the editor has the library, so only the id crosses to the iPhone's WebView.
  - **Not in it:** the "?" sheet lists only keyboard and typing shortcuts, and the library has none, so it isn't there. A "when to use it" line (SUMMARY-SPEC's formula card has one) comes with 8.2's summary cards.
  - **Checked:** Jest `formulaCard.test.ts` (every formula and legend symbol draws with KaTeX and each symbol is in its formula; search incl. VAN, TIR, préstamo, valor actual; inserting, an empty line replaced, unknown id, editing the formula keeps the legend, Enter / Backspace, HTML both ways, inside a callout); contrast test; Chrome `inserting.mjs` (search "annuity" narrows the list, four cards from the menu with their titles, formulas and legends drawn by KaTeX, the formula edited through its editor with the legend kept, the iPhone bundle at 390 px draws the same four).
- **Step 4.5, checkpoint B: what the student can't do yet (by design or later):** pasting images on the iPhone (the system paste into the WebView), Word's own equations (OMML) when pasted, shared comments and replies (after launch). A photo copied into another document points to the same file (Known issues).
- **Decimal comma kept (Lea, 30 Oct).** Decimals keep being written with a comma (18,5) where 4.7d put it: typed with a comma, or in a Spanish document (graphs). The spreadsheet's formulas stay in English style in 4.7e (commas between arguments, a point for decimals), as the engine reads them.
- **Course picker when recording: option A (Lea, 30 Oct), for step 5.3 (recording screens).** The setup picks the course and then a folder in it, with "+ New folder" in the picker to make one on the spot.
- **Spreadsheet additions to 4.7e (Lea, 30 Oct: "I want that part mostly completed").** In 4.7e after all, on both devices:
  - Undo / Redo of cell changes;
  - insert and delete rows and columns, with references moving as in Excel;
  - copy, cut and paste of a cell range, references moving on paste as with the fill.

  Planned into checkpoint 2 (laptop) and checkpoint 3 (iPhone). BUILD-PLAN 4.7e updated. Lea's advisor, 30 Oct:
  - the helper that moves references for an insert or delete goes inside `src/lib/sheets`, with tests (on `$` references too, as Excel does);
  - the offline insert limit and cut not redirecting references are accepted (Known issues). Still out: .xlsx, charts in a sheet, several sheets per tab, styles beyond bold, number formats, column widths, Spanish-style formulas.

## Things Lea must do

- **Cancel recording — on your iPhone** (after `editor:build`): start a recording by accident and Discard it from ⋯ (in airplane mode too, then go online: nothing is uploaded, the lecture is in Recently Deleted with its notes); record inside a document, Discard: your notes are there, the marks as words, the version "Before discarding the recording".
  - **Suggestion, not built:** Discard for an interrupted recording (today it has Continue and Finish).

- **Step 9.1b — your decisions, adopted for now (the advisor, 2 Nov; reversible):**
  - Opus 5.5 writes quizzes; Sonnet 5.5 grades answers and reads a past exam's format.
  - A past exam's length is its number of questions (it sets Number of questions).
  - Past exams set the format only, never the questions' content.
  - "Partly" counts as wrong: those questions come back and become review cards.
  - The presets and defaults (every slider 5, Number of questions 2); uploaded files become normal course files.
  - **Suggestions, not built:** renaming a quiz; a quiz's attempt history.
- **Step 9.1b — the migration `20261029152100_quizzes` on the remote:** after a dry run, when you're ready (after 9.1b is done).
- **Step 9.1b-3 — redeploy `quiz`** (`supabase functions deploy quiz`): grading written answers needs it (no migration, no new secret).
- **Step 9.1b-2 — deploy the `quiz` function and push `20261029152200_quiz_checks`** (after a dry run): `supabase functions deploy quiz`. No new secret (it uses the same Anthropic key). The free plan stops a function at 150 s: a 50-question quiz may come back with fewer questions until the paid plan (400 s), already a before-launch item.

- **Step 9.1 — review on your iPhone** (after `editor:build`, and the migration below pushed to the remote; no new EAS build):
  - review 10 cards on the iPhone, once in airplane mode too, then see them reviewed on the laptop (fewer due, each card's next date);
  - the swipe to skip; Quiz me under a summary.
- **Step 9.1 — the migration `20261029152000_review_cards` on the remote:** after a dry run (`supabase db push --dry-run`), when you're ready.

- **Step 8.3 — a summary's PDF on your iPhone** (after `editor:build`; no new EAS build). Export a Summary tab:
  - in airplane mode: formulas, graphs and the photo are all there;
  - the file's name in Files ("Course – Lecture – date.pdf");
  - the title on page 1, the header from page 2, "Page n of N";
  - the Answers page; Letter; the transcript appendix;
  - the share sheet (AirDrop, Mail);
  - BUILD-PLAN's check: print one summary PDF in black and white (from the laptop or the iPhone). Everything should be readable, and nothing cut between pages. The greyscale composite passed on screen.
- **Step 8.2 — hand the charts work order to the charts session** (`docs/charts-work-order-8.2.md`, branch `charts-engine`): function plots, model templates, stacked bars, histograms. Until it's merged, function plots and model graphs show a line of text in their place.
- ~~**Step 5.4 — rebuild the iPhone editor bundle** (`npm run editor:build`)~~ — done by Lea, 30 Oct (with the chip-tap fix). Trying it on the phone needs an EAS development build, together with expo-audio.
- ~~**Step 5.3 — suggestion to decide: a Pause button**~~ — Lea said yes (30 Oct); built beside the timer (see 5.3).
- **Step 5.2 — deploy `summarize` and `assistant-chat` to the remote (your step; 5.2 is committed).**
  - **What changed:** both now read the transcript through `_shared/lecture-content.ts`, which joins the chunks' 500 ms overlaps with `_shared/transcriptJoin.ts`, as the app does.
  - **Tested locally:** `npm run check:claude` passed against the local functions (30 Oct).
  - **No migration, no secret:** `supabase functions deploy summarize` and `supabase functions deploy assistant-chat`.
  - **transcribe-chunk is unchanged.**
- **Docker Desktop must be running** before `supabase start` (and before anything that uses the local database, including `npm run test:db` and `npm run gen:types`).
- **Never apply migrations to the remote project yourself** (`supabase db push`, or anything with `--linked`). The CLI is still linked to the remote project; the schema goes there in step 1.7.
- **Old-app backup** is at `~/Documents/Projects/Apps/Studiply-backup-2026-10-23/` (outside the repo, private permissions): schema, all rows including the 15 old accounts, roles, and the 17 empty files. It may contain other people's personal data (emails), so delete it once you're sure nothing in it is needed (suggestion: at the end of Phase 1).
- **Paused project "leapessey's Project"** (`xpcnrgkqcvbdywvshpsc`) exists in the same Supabase account, not inspected. Delete it in the dashboard if unused (the free plan limits active projects).
- **Testing login on your iPhone (step 1.3).** Docker on, `supabase start`, then `npm run start:local`. iPhone and Mac on the same Wi-Fi (or the Mac on your iPhone's Personal Hotspot if the network blocks it). Scan the QR code with Expo Go and allow "Local Network" if iOS asks; if macOS asks whether Docker may accept incoming connections, allow it. Codes arrive in Mailpit: http://127.0.0.1:54324 on the Mac, or `http://<Mac IP>:54324` in Safari on the iPhone (the IP is in Expo's `exp://…` line). If Mailpit doesn't load on the iPhone, the phone can't reach the Mac.
- **Before real users (step 1.7 or 10.3): set up a custom SMTP email sender for the remote Supabase project.** The built-in sender only allows a few emails per hour, so sign-up and password-reset codes would stop arriving. ~~Also copy the two code templates from `supabase/templates/` into the remote project's email templates.~~ Done by Lea in the dashboard on 26 Oct (Confirm sign up: "Your Studiply code"; Reset password: "Reset your Studiply password"; bodies from `confirmation.html` and `recovery.html`). The CLI can't do it: `supabase config diff` / `config push` (2.122) don't compare template content (a changed template still showed "no differences"), so after editing a template, update it in the dashboard too (Authentication → Emails → Templates). The code length (6) and expiry (1 h) are compared and match.
- **Testing the profile photo (step 1.4).** Same setup as the login test above. Settings → Manage Account → Edit profile → Add photo, on iPhone and in the browser: the progress shows, then the photo appears in the modal, on the account card and on the Settings screen. In Studio (http://127.0.0.1:54323) → Storage → `photos` → your user id → `profile/` there is one `.jpg`; changing the photo replaces it, Remove photo deletes it and brings the initials back. To see the retries, start an upload in the browser with DevTools → Network → Offline: "Connection problem. Retrying (n/3)…", then an error; switch back to Online and try again.
- ~~**Step 10.1 — account deletion must also delete Storage files.**~~ Done in 10.1: `delete-account` removes every object under `{userId}/` in `audio-chunks`, `slides` and `photos` before the account.
- **Step 10.1 — what only you can do** (type every value yourself; never paste one into a chat):
  1. **Apple Developer → Identifiers → App ID `com.studiply.app`:** tick **Sign in with Apple**.
  2. **Apple Developer → Identifiers → Services IDs:** make one for the web (suggested `com.studiply.web`), enable Sign in with Apple, add the web app's domain and a return URL on it (the web sign-in page; Apple's popup needs one registered).
  3. **Apple Developer → Keys:** make a key with **Sign in with Apple**, download the `.p8` once (keep it safe), note its **Key ID** and your **Team ID**.
  4. **Apple Developer → Sign in with Apple for Email Communication:** register the address or domain Studiply's emails come from, or emails to "Hide my email" addresses are dropped.
  5. **Supabase dashboard (remote) → Authentication → Providers → Apple:** enable it; **Client IDs** `com.studiply.app,com.studiply.web` (your Services ID). No secret key is needed (the web uses Apple's JS sign-in, the advisor's D1).
  6. **Supabase dashboard → Authentication → URL Configuration:** add the web app's sign-in URL to the redirect URLs.
  7. **Function secrets (remote), for revoking an Apple token when an account is deleted:** `supabase secrets set` `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the whole `.p8` text), `APPLE_BUNDLE_ID` (`com.studiply.app`), `APPLE_SERVICES_ID`. Locally the same names in `supabase/functions/.env` (names in `.env.example`). Without them accounts are still deleted; the revocation is skipped and logged as skipped.
  8. **The web app's public settings:** `EXPO_PUBLIC_APPLE_SERVICES_ID` and `EXPO_PUBLIC_APPLE_REDIRECT_URI` in `.env` / the web build (public: the browser sends them to Apple).
  9. **Local Apple sign-in on a device:** `supabase/config.toml` `[auth.external.apple]` stays `enabled = false` (switching it on can stop `supabase start` if the CLI wants values that aren't there). To try Sign in with Apple against local Supabase, set `enabled = true` and `client_id = "com.studiply.app,com.studiply.web"`, then restart.
  10. **Deploy** (after the advisor's review): push `20261029152300_store_rules` and `20261029152400_cascade_safe_triggers` (dry run first; the second fixes deleting an account that has quiz answers, also for the live project); deploy `delete-account` (new) and redeploy `transcribe-chunk`, `summarize`, `assistant-chat` and `quiz` (the new consent version; until they are redeployed the remote refuses every AI call with `consent_required`, because the app now writes `2026-11-store-1`).
  11. **An EAS development build** for the iPhone checks below (Expo Go can't do Sign in with Apple for Studiply).
- **Step 10.1b-1 — the legal texts, before launch** (`npm run check:launch` lists each one with its file and line):
  1. **Fill the bracketed details** in `docs/legal/*.md`: your full legal name, postal address, NIF, phone, website; the support and privacy emails; the date in each file (then remove "DRAFT, to be reviewed before launch"); the backup days in the privacy policy §7 (your Supabase plan's backup retention); keep or remove the RevenueCat lines and the free plan / free trial lines once 10.2 decides them; and the contacts at the end of `data-breach-plan.md`. Then `npm run build:legal` and commit the texts with the two generated files.
  2. **Have the texts reviewed by a lawyer or gestor**, with two questions from the plan: is the libheif notice (source links, the LGPL text, the replaceable `.wasm`) enough under LGPL-3.0 (D10), and keep or drop the Terms' sharing lines (§5, §10) while sharing isn't built (D8).
  3. **Read `docs/legal/data-breach-plan.md`** and keep the breach register with your business records.
  4. **iPhone (EAS development build):** open Settings → Terms / Privacy / Legal and the consent screen's Privacy policy; check they open offline and read well with Larger Text and VoiceOver.
- **Step 10.1b-2 — accepting the Terms:**
  1. **Push** `20261029152500_terms_acceptance` (dry run first) with the build that has the boxes. Every existing account (yours too) sees "Before you continue" once after its next sign-in; "I don't agree" signs out.
  2. **iPhone (EAS development build):** the welcome's two boxes; Continue with Apple with them ticked (no gate after) and without (the gate); the gate with VoiceOver.
- **Step 10.1b-3 — audio auto-delete:**
  1. **Push** `20261029152600_audio_auto_delete` (dry run first), **then deploy `purge-trash`** (the old function doesn't delete recordings; the new one needs the migration's functions). Nothing recorded before 10.1b-3 is auto-deleted: your existing lectures on "Delete in 3 days" (with or without a date) become "Delete manually"; delete old audio yourself when you want to (Delete now, after a recording or in the lecture's files).
  2. **Ship the app with it:** the app no longer dates recordings itself.
  3. **`docs/legal/README.md`'s "Not true yet" line** about the 3-day deletion can go once both are live.
  4. **iPhone (EAS development build):** record a short lecture, check the review screen starts on "Delete in 3 days" and the notes say "Deletes on …" after transcription.
- **Testing transcription locally (step 1.5).** Docker on, `supabase start`, then in a second terminal `supabase functions serve` (restart it after changing `supabase/functions/.env`). Then `npm run check:transcribe`: it speaks a sample lecture with macOS `say`, prints the segments with their times, and cleans up. Each run makes two short OpenAI calls (well under a cent).
- **Testing Claude locally (step 1.6).** Docker on, `supabase start`, then in a second terminal `supabase functions serve` (restart it after changing `supabase/functions/.env`). Then `npm run check:claude`: it shows the streamed answer arriving in pieces with their timings, checks consent, the limit and the cost log, and cleans up. Each run makes four short Anthropic calls (well under a cent). The very first call after starting `functions serve` can answer 502 while the runtime downloads the SDK; run it again.
- **Step 1.7 — Anthropic key on the remote project.** Set it yourself with `supabase secrets set ANTHROPIC_API_KEY=…` for the remote project (or in the dashboard → Edge Functions → Secrets), never in the app or git. ~~Revoke the old app key~~ — done 25 Oct 2026 (it was in the old web and iOS bundles; part A's bundle check found it). The server key in `supabase/functions/.env` is a different key and stays.
- **Step 1.7 — OpenAI key on the remote project.** Set it yourself with `supabase secrets set OPENAI_API_KEY=…` for the remote project (or in the dashboard → Edge Functions → Secrets), never in the app or git. ~~Revoke the old app key~~ — done 25 Oct 2026. The server key in `supabase/functions/.env` is a different key and stays.
- **Checking the bundles (step 1.7).** `npm run check:bundle` (Docker and `supabase start` on, so it can also look for the local service-role key) builds the web and iOS bundles and prints a table of hits; every line must be 0 and the control must find the anon key. Run it before every TestFlight build and web deploy.
- **Real AI notes, locally or on the remote (step 4.1).** The SIMULATED AI badge at the top says when notes are simulated.
  - **Local:** Docker on, `supabase start`; in a second terminal `supabase functions serve` (it reads the OpenAI and Anthropic keys from the git-ignored `supabase/functions/.env`; restart it after changing that file); then `npm run start:local`, without `EXPO_PUBLIC_MOCK_AI` in `.env`. Real calls cost money (well under a cent per short lecture) and ask for consent first.
  - **Remote:** `npm run start:remote`. The functions (`transcribe-chunk`, `summarize`, `assistant-chat`) are deployed with their keys set as secrets, so nothing else is needed; it uses the remote account and its consent and usage rows.
  - **Simulated on purpose:** `EXPO_PUBLIC_MOCK_AI=1 npm run start:local` (the badge says so). `start:remote` refuses to start if a .env file sets it.
- **Testing in the browser without spending (step 1.7).** Start Expo with `EXPO_PUBLIC_MOCK_AI=1 npx expo start` for simulated transcripts and notes: no consent dialogs, no OpenAI or Anthropic calls, no `ai_usage` rows.
- **Switching transcription to ElevenLabs Scribe v2 (Lea, 29 Oct 2026).** OpenAI shuts `whisper-1` down on 26 Feb 2027. Branch `transcribe-model` is merged into `phase-4-editor`; steps 3 and 4 below are done, and an unset `TRANSCRIBE_PROVIDER` now means ElevenLabs (so audio never goes to OpenAI under consent that names ElevenLabs; without `ELEVENLABS_API_KEY` the function answers `not_configured`). Left for Lea: 1, 2, 5, 6. In order:
  1. **Decide whether ElevenLabs' data terms are acceptable.** What they say (checked 29 Oct 2026):
     - **Training.** ElevenLabs' privacy policy says it uses personal information "to research, build, train and improve our AI models". Third-party reviews say this is on by default below Enterprise. To opt out: your ElevenLabs account → Terms and Privacy → **Data use**. The opt-out only covers audio sent afterwards, so **turn it off before the first real recording**, including the comparison below. (OpenAI doesn't train on API audio by default.)
     - **Retention.** By default ElevenLabs keeps requests "to enhance services, troubleshoot issues, and ensure the security" of its systems, and history is on. Deleting a transcript removes it from their database, but debugging and moderation logs may still hold it. Deleted data stays in backups for up to 30 days. `transcribe-chunk` deletes each transcript as soon as it has it; the audio itself has no delete call.
     - **Zero retention.** Zero Retention Mode (`enable_logging=false` on the request) exists but is **Enterprise only**, for select customers. If you get it, add `?enable_logging=false` to the URL in `_shared/elevenlabs.ts`.
     - **EU processing.** Data is stored in the **United States** by default (EU-U.S. Data Privacy Framework, Standard Contractual Clauses). EU data residency (`api.eu.residency.elevenlabs.io`) is also **Enterprise only**.
     - **What to do.** Either accept the self-serve terms (opt out of training; name ElevenLabs and US storage in the privacy policy), or ask ElevenLabs sales about Enterprise with zero retention and EU residency. Also check whether a DPA is available for your plan; as an API customer ElevenLabs acts as processor under your contract.
     - Sources: [privacy policy](https://elevenlabs.io/privacy-policy), [Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), [API reference](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).
  2. **Compare on your own lectures.** Put `ELEVENLABS_API_KEY=…` in `supabase/functions/.env` (main folder; never in git). Run `npm run compare:transcribe -- <chunk.m4a> --language es` on a Spanish chunk, then an English one (no Supabase needed; about $0.36 per hour of audio for both). It prints speed, cost, language and how much the two disagree, and writes `compare.txt` (both side by side, minute by minute) to a temp folder; delete that folder afterwards. Listen where they differ and check that the time chips land where the sentence starts.
  3. **Done 29 Oct: migration `20261029151800_ai_usage_elevenlabs.sql`** (local only until pushed). Add `'elevenlabs'` to the `ai_usage.provider` check (`20261023155457_study_and_ai.sql:66` allows only `openai` and `anthropic`). Without it every Scribe chunk fails with a 500 *after* being paid for, because the cost log is written first.
  4. **Done 29 Oct: app text and usage.** Consent version `dev-2026-10-elevenlabs` (everyone is asked again); the privacy policy and terms name ElevenLabs.
     - The consent dialog (`consent.service.ts:28-29`) and Settings (`AccountSettings.tsx:261`) say audio goes to OpenAI. Name ElevenLabs, raise `CONSENT_POLICY_VERSION` so students are asked again (Apple 5.1.2(i)), and update the privacy policy.
     - `ai-usage.service.ts:98` counts transcription minutes only from `openai` rows; count by `operation = 'transcription'` instead.
     - `record/review.tsx:353` says "Whisper is converting…".
  5. **Local test.** Add `TRANSCRIBE_PROVIDER=elevenlabs` to `supabase/functions/.env`, restart `supabase functions serve`, run `npm run check:transcribe`. It now checks whichever provider is set.
  6. **Remote.** Push the migration (dry run first), then `supabase secrets set ELEVENLABS_API_KEY=… TRANSCRIBE_PROVIDER=elevenlabs` and deploy `transcribe-chunk`. **Until then, transcription against the remote project stops:** the deployed function still checks consent version `dev-2026-10`, and this build asks for `dev-2026-10-elevenlabs`, so it answers `consent_required` and nothing is sent anywhere. `TRANSCRIBE_PROVIDER=openai` switches back to `whisper-1` until 26 Feb, but only with consent text naming OpenAI again.
  7. **After 26 Feb.** Remove the `whisper-1` path (`_shared/openai.ts`, `fromWhisper`/`toSegments`) and the OpenAI key, unless something else uses it by then.
- ~~**Step 10.1 — real consent version.**~~ Done: `2026-11-store-1`; consent given during development no longer counts (everyone is asked again).
- **Testing offline (step 1.8).** Expo Go needs Wi-Fi to reach Metro, so "offline" means stopping the backend while the phone stays on Wi-Fi:
  - **Offline:** `supabase stop` (never `--no-backup`).
  - **Back online:** `supabase start`, then restart `supabase functions serve`.
  - The app notices within about 10 s or when it comes to the foreground.
  - For a two-device test with the browser online, use Settings → General → DEVELOPMENT → Simulate offline on the iPhone. **Sync now** and the queue list are there too.
  - After changing the app's code, reload it fully (shake → Reload) before an offline test.
- **Step 1.9 — upload your real earlier-version data yourself** (after testing with the sample):
  1. `npm run start:remote` (the remote project, not the Mac).
  2. In the app: Settings → General → DEVELOPMENT → turn **Use sample earlier-version data** off.
  3. Sign in with your real account.
  4. Settings → Earlier version data (or the Home card): compare the profiles' counts and first course/lecture names, and tick only your real profile (not the one with local test lectures). Then **Upload**.
  5. Check in the browser that the courses, lectures, notes and recordings are there.
  6. Only then, **Remove the old copy from this iPhone**.
- ~~**Step 3.5 — the nightly clean-up and search on the remote project**~~ — done 26 Oct with Lea's OK: the 4 migrations pushed (the remote had 0 users and no old trash), `purge-trash` deployed with `--no-verify-jwt`, a new `CRON_SECRET` (generated in a shell variable, passed to `supabase secrets set` and to Vault through `<(…)`, never printed or saved; both copies have the same SHA-256) and `project_url` in Vault. `select private.run_trash_purge();` answered 200 (`{"ok":true,"objects":0,…}`); the job `purge-trash` runs daily at 03:15 UTC. To change the secret later, set both copies again (`supabase secrets set` and `vault.update_secret`).
- **A new iPhone, or native changes (step 4.1).** Register the phone with `eas device:create`, then `npm run build:dev:ios` again and install from the QR code. A new native module, permission text or plugin in `app.json` also needs a new build; JavaScript changes don't.
- ~~**Step 4.3 — the named-versions migration on the remote project**~~ — done 28 Oct with Lea's OK: dry run showed only `20261026090800_document_version_names.sql`; pushed; `supabase migration list --linked` shows all 16 migrations on both sides.
- **Step 4.5 — test A (no new build).** `npm run start:local`, reload the app on the iPhone (shake → Reload) and the laptop page.
  1. **Colours:** text colour, highlight and a table cell's colour from the grid (a shade), from Recent colours, and from More colours… (the spectrum; a hex on the laptop), on both devices. A colour picked on the laptop shows in Recent on the iPhone, and the other way.
  2. **Links:** ⌘K on the laptop (try "uned.es"), the bubble's Open / Edit / Remove; on the iPhone the Link button, then Open / Edit / Remove on a link.
  3. **Tables:** on the iPhone, + → Table 3 × 3, then add a row and a column, Header row, a cell colour. It looks right on the laptop; drag a column wider there. *(Passed except tables; see the table retest.)*
  4. **Toolbar:** the laptop's ⌄ row (open after a reload if you left it open); narrow the window and watch tools move into it. On the iPhone, ⋯ for the second row (remembered).
- **Step 4.5 — table retest (no new build).** Reload the app on the iPhone and the laptop page.
  - **Laptop:**
    1. Right-click a cell: every item works (insert, delete row / column / table, Header row, Cell colour…, Merge and Split after dragging across cells, Table size…).
    2. Hover over a table: the grips select a row or column (then Delete or colour it); the "+" between rows and between columns inserts one. *(Retest after the fix: move from a cell to the "+" loosely, it must stay; also the last row's "+" and the last column's.)*
    3. The bar above the table: Rows, Columns, Colour, Header, ⋯ and Delete.
    4. Insert table: type 6 × 4; Table size… to change it (try 60: lowered to 50; shrinking over text asks first).
    5. A table on the last line: click below it or press ↓, then type. A table at the very top: Enter at the start of its first cell, or ↑, then type above it.
  - **iPhone:**
    1. Tap in a table: the bar shows above it. Rows, Columns and ⋯ open sheets; Colour opens the colour panel; Delete removes the table (Undo brings it back).
    2. + → Table: tap a number and type 6 × 4.
    3. More colours…: Type code, then `1a7f5a` (with or without #).
    4. Typing after a table, and above one at the top, as on the laptop.
    5. Delete a table on the laptop while the iPhone has the document open: it goes on both and stays gone.
- **Step 4.5 — test B (no new build).** `npm run start:local`, reload the app on the iPhone (shake → Reload) and the laptop page.
  1. **Photos, iPhone:** + → Photo (pick two), and + → Take photo; then the same with the iPhone offline (Settings → General → DEVELOPMENT → Simulate offline): they show at once and upload when back online. Tap a photo: Small / Medium / Large / Full width.
  2. **Photos, laptop:** the Image button; drag a photo from Finder onto the page; paste a screenshot (⌘⇧4, then ⌘V). Select a photo and drag a corner. The iPhone's photos show on the laptop and the other way, at the same width.
  3. **Formulas:** on the iPhone, + → Formula, type the compound-interest formula `A = P\left(1 + \frac{r}{n}\right)^{nt}` (or build it with the starters), switch Display on and off, Done. It looks right on the laptop; click it there, change it, Remove another one.
  4. **Comments:** select words and add a comment on both devices (laptop: the toolbar's Comment or ⌘⌥M; iPhone: + → Comment). Laptop: with the assistant closed (or a wide screen) the cards sit beside the page; with it open, click the tinted words. Edit, Resolve, Reopen (document menu → Comments), Delete, on both.
- **Step 4.5 — test C (no new build).** Reload the app on the iPhone and the laptop page.
  1. **Photo layout:** select a photo; from the bar above it try In line, Wrap left, Wrap right, Break text and the three alignments, on both devices; the text flows around a wrapped photo; the other device shows the same. Laptop: right-click a photo. iPhone: Layout in the keyboard toolbar.
  2. **Selection bar:** select words on the laptop (the bar above) and on the iPhone (below; iOS's Copy / Paste still there): Comment, B, I, Highlight, Link.
  3. **Formulas as you type:** type `$x^2$` (it becomes a formula), `$5 and $10` (it stays text), `sqrt(x)` then a space and take Make formula (laptop: Tab or the chip; iPhone: the toolbar).
  4. **iPhone photo handles:** select a photo and drag a corner with your finger; Small / Medium / Large / Full width still work.
  5. **iPhone toolbar:** one row, the arrow for the rest, still open after leaving and coming back.
- **Step 4.5 / 4.5b — test D (no new build).** Reload the app on the iPhone (shake → Reload) and the laptop page.
  1. **iPhone toolbar:** no "+"; the arrow opens a second row ending with Photo, Take photo, Table, Formula, Comment; Table asks for rows and columns.
  2. **Typing shortcuts** on both devices, at the start of a line: "- ", "1. ", "[] ", "# ", "## ", "> "; `$$x^2$$` alone on a line (a display formula); `**bold**`, `*italic*`, `==highlight==`. Backspace right after one gives the text back.
  3. **Laptop pages:** open a long document: A4 pages with gaps, page numbers, "Page n of m" following the scroll; a long paragraph continues on the next page; a page break starts a new page. Switch to Pageless and back (the Pages button, or the Zoom menu).
  4. **Laptop zoom:** ⌘+ up to 150 % and ⌘0 back; the Zoom menu's Fit; reload: still the same. Type and select at 150 %. Hover a table on a later page: its handles.
  5. **iPhone:** **…** → Print layout: the same pages as the laptop, fitted to the screen; pinch to zoom in and out (and in Pageless); leave the document and come back: still the same. Typing in Print layout still works (the keyboard, the toolbar).
- **Step 4.5b — test E (no new build).** Reload the app on the iPhone and the laptop page.
  1. **Laptop, Pages:** white pages on the gradient, the gradient in the gaps, a shadow on each page; one scrollbar at the right of the centre area; the toolbar stays at the top while you scroll. The same in dark mode. Pageless as before. With comments, the margin beside the page.
  2. **iPhone, Print layout:** the same pages on the gradient (light and dark); typing, the keyboard toolbar and pinch still work.
  3. **Page setup** (… → Page setup…), each on one device and checked on the other: Letter + Landscape; Narrow, then typed margins; page numbers Top right, then Off; gap Large, then None; leave and reopen; Set as default, then a new document starts with it.
- **Simplicity pass — test F (no new build; short).** Reload the app on the iPhone and the laptop page.
  1. **Laptop:** hover a few tools (name and shortcut); Insert ▾, Align ▾ and View ▾; the … menu's headings; right-click a table and a photo.
  2. **iPhone:** long-press toolbar buttons (their names); open the arrow: titled groups with names under the icons; the … menu's order; select a photo: **Layout…** opens the layout sheet.
  3. **Page setup** on both: the drawing of the page changes as you choose.
- **Step 4.6 — test G (no new build).** Reload the app on the iPhone and the laptop page.
  1. **Laptop:** Insert ▾ → Study blocks → Callout: one of each kind; type in each; click a label: Change to, Level (You were confused here), Remove callout. Insert ▾ → Mark and Timestamp; click a mark chip and change it.
  2. **iPhone:** the same blocks show the same; in the second row, Callout, Mark and Time; tap a label and a mark chip; change a mark's level and check it on the laptop.
  3. **Selection bar:** select words on both devices: Comment · B · I · Highlight · Link, then Callout ▸ · Mark ▸ · Time ▸ (on the iPhone a second row, below the words, with iOS's Copy / Paste still above). Callout ▸ boxes the paragraph with its text; Mark ▸ and Time ▸ put their chip right after the words.
  4. **Playing:** in a recorded lecture (an old one with its audio kept), add a timestamp (Insert ▾ → Timestamp, e.g. 2:00) and tap it: the player plays from 2:00; −10 s / +10 s; a blank document says it has no recording.
- **Step 4.7b — the tabs migration on the remote project.** `20261029151900_document_tabs.sql` is applied locally only: `supabase db push --linked --dry-run`, then `supabase db push --linked`, with the earlier ones not pushed yet.
- **Step 4.7b — test J (no new build).** On the laptop: + Add tab in a document, name it, type in it; rename by clicking the open tab again and from the right-click menu; drag a tab to the front; delete one and Undo. On the iPhone: the same tabs in the same order; long-press → Move left, Rename, Delete + Undo. Offline on the iPhone: add and rename a tab, then go online and see it on the laptop. Delete a tab on the laptop while the iPhone, offline, writes in it: after syncing the tab is back with the iPhone's text and the notice. Restore a version in one tab: the other tabs don't change. A lecture: My notes · Summary · Transcript stay first and have no menu.
- **Step 4.9 — test N (earlier notes; no new build).** First on the local copy, then (Lea's decision) her real account.
  1. Open a lecture whose notes came from the earlier app (step 1.9) and go to its Summary tab. It becomes a document: the title, the summary, the sections with Spanish headings for a Spanish lecture, the Definition callouts, the highlights (quote plus Added context), the photos under Adjuntos.
  2. Compare it with the old notes (a search result for a word in them opens the notes view; the library's Export PDF of the lecture exports them): nothing is missing.
  3. Open the same lecture on the iPhone: the same Summary tab, not converted a second time.
  4. Type in the Summary tab, close and reopen: the typing stays.
  5. **To know (Lea's list):** while the generate flow still writes the earlier format (until Phase 7), generating a lecture's notes again after its Summary tab exists does **not** change the Summary tab.
     - **The student sees:** their Summary tab exactly as it was.
     - **Where the new notes are:** they're saved and nothing is lost, but they're nearly out of sight. The Summary tab no longer shows the "earlier notes" card with Open notes (that only shows while the tab has no document). They're reached only from a search result, which opens the old notes view (it shows the newest note), and the library's Export PDF of the lecture exports them.
     - **Result:** the Summary tab and the newest notes then differ.
- **Step 4.8a — test M (PDF export; after `npm run editor:build`, no new native build).**
  1. **Laptop:** in a long document with a page break, a callout, a formula, a graph and a photo: … → Export PDF… → This tab → Export → Save as PDF. Open it on the Mac:
     - the pages match the page view;
     - the page break starts a page;
     - numbered 1…n.
  2. **All tabs** in a document with a sheet tab: each tab starts a new page with its name on top; the numbers go on; the sheet is a table of its values.
  3. **Page setup Letter landscape, numbers off:** the PDF follows it.
  4. **iPhone, the same document:**
     - … → Export PDF… → "Preparing the PDF…" → the share sheet → Save to Files;
     - open it: A4 (or the page setup's paper), the same pages and numbers as the laptop's, photos and formulas there.
  5. **iPhone, from a sheet tab:** … → Export PDF… works.
- **Step 4.8b — test O (Word import and export; after `npm run editor:build`, no new native build).**
  1. **Laptop, import:** a real Word file from your courses: + New → Upload document in a course folder. Compare the document with Word: headings, lists, tables, pictures; the note lists what isn't kept.
  2. **Laptop, export:** the same document → … → Export Word… → This tab, then All tabs. Open both in Word on the Mac: headings in Word's navigation pane, lists numbered, the page numbers, the formulas and graphs sharp when zoomed in; then Export PDF… of it too.
  3. **iPhone, import:** Upload → PDF or Word (Files) → a .docx; then the same in Airplane mode (the document and its photos are there at once and sync later).
  4. **iPhone, export:** … → Export Word… → "Preparing the Word file…" → the share sheet → Save to Files; open it in Word or Pages: the formulas are pictures that look as in the app (the iPhone's WebView draws them: Safari's way, which Chrome can't check).
- **Step 4.7 — test L (writing tools; after `npm run editor:build`, no new native build).**
  1. **Laptop:**
     - **Find:** in a long document, ⌘F, type a word: "1 of N", every match marked; Enter / ⇧Enter go round; turn on Aa, then Whole words: the count narrows.
     - **Replace:** ⌘⇧H, replace one match, then Replace all; ⌘Z once brings back everything Replace all changed.
     - **Word count:** watch the status line while typing; select a sentence and see "x of N words"; click the line for the details.
     - **Outline:** ⌘⌥A. Click a heading: the page jumps there. Write in another section: the mark follows. Add a heading: it appears in the outline.
  2. **iPhone, the same document:**
     - **Find:** … → Find and replace: search, ↑ ↓, Aa, Whole words, Replace and All, then Done (the marks go).
     - **Outline:** … → Outline: tap a heading, the sheet closes at that heading.
     - **Word count:** … → Word count.
  3. **A sheet tab:** its … menu has only Version history.
- **Step 4.7e — test K (the spreadsheet tab; the iOS Simulator dev build or the iPhone).**
  1. **Laptop, a loan table:**
     - "+" → Spreadsheet;
     - A1:A4 Amount, Rate, Months, Payment; B1 200000, B2 3.5%, B3 360, B4 `=PMT(B2/12, B3, -B1)` (898.09);
     - C1:C12 the months 1–12 with a fill (C1 1, C2 `=C1+1`, drag C2's corner to C12);
     - D1 `=$B$4*C1` dragged down to D12: each row multiplies the same payment.
  2. **iPhone, the same sheet, laptop numbers:** the same numbers, rounded to fit and never cut with "…" (also bold and in the narrow cells), and the grid scrolls both ways inside the tab.
  3. **iPhone, typing:**
     - tap a cell, tap it again: the bar on the keyboard;
     - type `=SUM(`, tap B1, drag the dot on B1 down to B3, type `)`, ✓: 200360.035;
     - Return goes on to the cell below with the keyboard up.
  4. **iPhone, `=PM`:** the list just above the bar; tap PMT; the help line shows **rate** in bold.
  5. **iPhone, the fill handle:** a cell's small corner square by finger, down two rows, then ↶ in the bar.
  6. **iPhone, long-presses:**
     - long-press row number 2 → Insert row above (the payment moves down to row 5, still 898.09), then ↶;
     - long-press a cell → Copy, long-press another → Paste (the references move);
     - paste the copied value in Notes too.
  7. **Offline:** on the iPhone, Airplane mode; change B2 to 4%, and type in an empty cell. Meanwhile on the laptop change B1 to 250000. Then turn Airplane mode off: both devices show B1 250000, B2 4% and the payment 1193.54.
  8. **NPV and IRR:** `=NPV(10%, -10000, 3000, 4200, 6800)` gives 1,188.44, and `=IRR` of -70000, 12000, 15000, 18000, 21000, 26000 gives 0.0866 (8.66%), as in Excel.
- **Step 4.7d — test I (no new build).** A bar graph of 5 values on the iPhone (Graph in the second row); change one value on the laptop and see it on both; switch it to Line and Pie; print it in black and white.
- **Step 4.7c — test H (no new build).** Reload the app on the iPhone and the laptop page.
  1. **Laptop:** Insert ▾ → Formula from the library; search "annuity", then "VAN"; insert both; click a formula and change a number; the legend stays.
  2. **iPhone:** Formula (second row) → From the library; insert NPV and WACC; tap a formula to edit it; type in the legend.
  3. Both devices show the same cards; in Pages a card never splits.
- **Step 4.5b — the page-setup migration on the remote project.** `20261029151759_document_page_setup.sql` (adds `documents.page_setup`) is applied locally only. When you're ready: `supabase db push --linked --dry-run` (it should list only this one, plus the recent-colours one if that isn't pushed yet), then `supabase db push --linked`. Until then, page setup can't be saved against the remote project.
- **Step 4.5 — the recent-colours migration on the remote project.** `20261026090900_profile_preferences.sql` is applied locally only; the dry run shows only it, and Lea said OK to push (28 Oct). The push was blocked by Claude Code's safety check, so Lea runs it: `supabase db push --linked`, then `supabase migration list --linked`.
- **Before step 10.4 (TestFlight):** upgrade to the latest Expo SDK and re-run `npm audit --omit=dev`, so the `query-string` / `decode-uri-component` issue (see Known issues) is fixed before launch. The iPhone already records and plays through expo-audio (step 5.1–5.4, iPhone half); with the upgrade, remove expo-av: the web's player (`src/lib/audioPlayer.web.ts`), the fallback in `audioPlayer.ts`, and `record/index.tsx` / `record/active` (the fallback recording path) are its last users.

## Known issues

- **iPhone: a crash during a recording loses the chunk being recorded, up to 30 s** (step 5.1–5.4, iPhone half, 30 Oct). An .m4a that AVAudioRecorder is still writing has no index yet and can't be read, so the iPhone can't save one-second pieces as the web does (the web loses at most about a second). Every finished chunk is kept and sent after the restart, and Continue records on after the last one. A shorter loss would need shorter chunks or a recorder that writes a streamable format (not in expo-audio 1.1).

- ~~**Audio isn't deleted after 3 days yet**~~ — built in step 10.1b-3 (live once the migration is pushed and purge-trash deployed). (Found 29 Oct 2026.) New lectures are marked `delete_3_days`, but no deletion date is set, the review screen after a recording starts on "Delete manually" (and saves it), and no scheduled job deletes audio whose date has passed. The privacy policy draft already promises deletion 3 days after transcription; build it before launch (BUILD-PLAN 10.1b, docs/legal/README.md).

- **A photo copied into another document points to the same file** (step 4.5). Copying text with a photo copies its `media:<id>` reference, not the file; if the first document is deleted and purged, the copy shows "Photo not uploaded yet". To be handled with copying documents (later).
- **Pasted pictures keep their address** (step 4.5): a picture pasted from a web page or Google Docs is shown from where it came from, not uploaded; if that address stops answering, the box says "This picture can't be shown".

- **Spreadsheet: inserting or deleting rows and columns while the other device edits offline** (accepted by Lea's advisor 30 Oct, for 4.7e checkpoint 2b). A cell's address is its id, so an insert or delete gives the cells after it new ids. If the other device, offline, edits one of those cells at the same time, its edit lands at the cell's old address: nothing is lost (it is in the sheet and in version history), but it can be in the wrong row or column. The fix would be cell ids that don't follow the address.
- **Spreadsheet: cut and paste doesn't redirect references** (accepted 30 Oct, 4.7e checkpoint 2b). The moved formulas are kept as they are (as Excel does), but other cells that pointed at the cut cells keep pointing at the old place; Excel redirects them.

- **Text inside documents isn't searched yet** (step 4.3). Search finds documents by title; their text (and edits to a lecture's Transcript tab) is not indexed. To be added with the next Search change (it needs a search migration).
- **Copying a document** isn't offered yet (Cut and Move are); copying its text and versions comes later.
- **Palette incomplete for the designed summary** (AUDIT risk #11). `src/constants/colors.ts` is missing tokens DESIGN.md/SUMMARY-SPEC.md require: recording `#CC3333` (only `error: #D94F4F` exists), "From your notes" green `#E8F5EE`/`#1F6B45`, exam `#FFFBEB`/`#FFE4B5`/`#7A4A00`, accent-on-light `#4F43B0`, salmon label `#8A3B22`. Must be added to `colors.ts`, never hard-coded inline. To be handled in **step 2.3** (Look and feel).
- ~~**Web: `expo-sqlite` worker fails to bundle**~~ (found in step 0.3; fixed in step 1.3 by `src/lib/db.web.ts`, so web no longer imports `expo-sqlite`).
- **Lint warnings left on purpose** (step 0.3) — fixing them changes when effects run, so they need a behavior review, not a lint pass:
  - `react-hooks/exhaustive-deps` in `app/(main)/project/[id].tsx` (×3), `app/(main)/record/active.tsx`, `app/(main)/record/review.tsx` (×2), `app/_layout.tsx`, `src/components/MoveToModal.tsx`, `src/components/SplashScreen.tsx`, `src/components/UndoToast.tsx`.
  - Unused `sourceFiles` state in `app/(main)/record/review.tsx` (still set from `getActiveSourceFiles`; remove when that screen is rebuilt).
- **npm audit: `decode-uri-component` DoS in the app bundle** (found at Phase 1 start, accepted). `npm audit --omit=dev` (after `expo install --fix`, 23 Oct 2026): of 18 findings, only `nanoid`, `query-string` and `decode-uri-component` ship in the iOS bundle; the rest are build tools that run only on the Mac. `nanoid` was updated to 3.3.20. `decode-uri-component@0.2.2` (exponential decoding of malformed percent-encoded input, so a crafted deep link could freeze the app) is pulled in by `query-string@7`, which `expo-router` depends on directly; the fix (0.5.x) needs an Expo SDK major upgrade. Low impact (local DoS, needs the user to open a crafted link). Fix before launch: see Things Lea must do. **Rechecked in step 4.2 (27 Oct)** after adding TenTap, the WebView, Tiptap and Vite: 16 findings, exactly the 16 the lockfile before them had, so none comes from the new packages (Vite's own `postcss` 8.5.32 is fixed; the flagged 8.4.49 is Expo's). Still only `query-string` / `decode-uri-component` ship in the app; every other one is a Mac-side build or dev tool (Expo CLI, Metro, Babel, config plugins, the dev server). `npm audit fix` without `--force` would pull SDK 58 packages into an SDK 54 app, so it isn't run.
- **"Delete data on this device" only deletes this device's data** (step 1.3; renamed and reworded in step 1.7). It removes what earlier versions stored on the iPhone and signs out; the Supabase account, its rows and its Storage files stay, and the dialog now says so. Real account deletion needs a server function and comes in step 10.1. On web it says it's not available yet. Since step 1.9 it is also only the current account's old profile; "Remove the old copy from this iPhone" (Earlier version data) removes the whole old database and its files, after a verified upload.
- ~~**Opening the app offline more than an hour after the last use shows the login screen**~~ (step 1.3; fixed in step 1.8: the stored session is used offline and refreshed when the backend answers).
- ~~**Security screen still says "Your data is stored on this device"**~~ (found in step 1.3; fixed in step 1.7: it now says the library is in the student's cloud account and that AI services get data only after consent).
- ~~**Web: library empty and saving fails after login**~~ (step 1.3; fixed in step 1.7: the web reads and writes Supabase).
- ~~**Edge Function code isn't type-checked**~~ (found in step 1.5; fixed in step 1.6: `deno check` is part of `npm run check`).
- **Daily limits can be slightly exceeded by parallel requests** (step 1.5, same for Claude in step 1.6). Each limit is checked before the AI call, so requests sent at the same moment can all pass, and a Claude answer's cost is only known once it ends. At most a few calls' worth; the server-enforced limits in step 10.2 should count atomically. (Since step 1.6 usage is read page by page, so the 1000-row API cap no longer matters.)
- ~~**The app still transcribes on the device**~~ (step 1.5; fixed in step 1.7: transcription goes through `transcribe-chunk`, and the app has no AI key).
- **Between step 1.7 part A and part B the app only works when the phone can reach the Mac's local Supabase** (step 1.7a). All data and AI calls now go to Supabase, which is still the local stack (`supabase start` + `supabase functions serve`) until part B points the app at the remote project. On iPhone that means the same Wi-Fi (or the Mac on the phone's hotspot) as in the step 1.3 login test; away from the Mac the library doesn't load and nothing saves.
- **Multi-step writes aren't atomic** (step 1.7). Trashing, restoring and permanently deleting a course or folder, and creating a lecture, are several PostgREST calls in a safe order (see the Trash decision). A failure partway can leave part of a group trashed or restored; it is always visible and fixable in Recently Deleted. If this matters, move them into database functions (RPC) in a later step.
- **General settings don't follow the student to another device** (step 1.7, by design). They are per device until Phase 7 replaces them with course settings; only the default language syncs.
- **Course cards on wide web windows are very tall** (seen in step 1.7). The square cards grow with the window width; the Phase 2 layout replaces this screen.
- **Choosing "Not now" shows the error screen titled "Something went wrong"** (step 1.7). The message below is right ("Nothing was sent. Your recording is saved…"); the title is generic. To polish when the review screen is rebuilt (Phase 7).
- **`[UNCERTAIN]…[/UNCERTAIN]` marks show as raw text on the review screen** (old behaviour, kept in step 1.7). The note prompt still asks for them; Phase 4's editor should render them.
- **The conflict rule trusts device clocks** (step 1.8). A phone whose clock is far off can win or lose a conflict it shouldn't. Nothing is lost either way: the other version is in `document_versions`.
- **Conflict versions can't be seen in the app yet** (step 1.8). They're in `document_versions` (Studio); version history with restore comes in step 4.3.
- **Offline, photos and audio that aren't on the phone show a placeholder** (step 1.8), and post-session lists no "Recording" entry for a recording that hasn't uploaded yet. Caching files for offline viewing isn't planned for v1.
- **A lecture permanently deleted on another device can come back** (step 1.8, rare). If the iPhone still has unsynced changes or uploads for it, the queue recreates it from the iPhone's copy rather than lose the recording.
- **Recently Deleted, Generate and course/folder changes need a connection** (step 1.8, by design). Search works offline on the iPhone over what is on it, and says so (step 3.5); on the laptop it needs a connection.
- ~~**Library files aren't on Home or in Search yet**~~ (26 Oct; Search and Recent list them since step 3.5, and there is no Home screen since Phase 2). They show in their course/folder (FILES). Recently Deleted lists them like lectures. Phase 2/3 rebuild these screens.
- **The FILES section is per folder, but PROJECT FILES still lists every photo/PDF of the course's lectures at every level** (old screen, Phase 2 replaces it).
- **`src/types/supabase.ts` is unformatted** (found in step 1.2). `supabase gen types` prints a hint to format it with `oxfmt`; no formatter is installed and adding one is a new dependency, so it's left as generated. It type-checks and lints clean.

## Left to later

Schema pieces step 1.2 deliberately left out; each comes as its own migration in the step listed.

- ~~**Storage buckets and policies**~~ — done in step 1.4.
- **PowerPoint (.pptx) slides in the media tray, with text extraction** — Phase 7. Needs the pptx MIME type (`application/vnd.openxmlformats-officedocument.presentationml.presentation`) added to the `slides` bucket in a new migration.
- ~~**Choose the Claude model per function**~~ — decided 30 Oct 2026 (Decisions): Sonnet 5.5 for `assistant-chat`, Opus 5.5 for `summarize`. Worth a second look at Phase 7 on the golden lectures, with the speed and cost from `check:claude` and real classes.
- **Course glossary and professor's name as a Whisper prompt** — step 5.2 / Phase 7. Pass them to `transcribe-chunk` as Whisper's `prompt` (max 224 tokens), so technical terms and names are spelled right (SUMMARY-SPEC "The lecture input"). `course_settings.professor` exists; the glossary comes with the summary engine.
- **Resumable uploads (TUS)** — only if step 5.2 shows audio chunks failing on bad connections.
- ~~**Sync columns**~~ — done differently in step 1.8: per-block times in the note itself plus `document_versions.file_id` and reason `conflict` (migration `20261025010000_document_version_conflicts`), no revision columns.
- ~~**Full-text search indexes**~~ — done in step 3.5 (trigram indexes; glossary terms come with the glossary in Phase 7, key concepts and definitions stand in until then).
- ~~**Trash auto-empty after 30 days**~~ — done in step 3.5 (`purge-trash` + `pg_cron`; on the remote after Lea's setup).
- **Comments** (margin comments on documents) — step 4.5.
- **AI suggestions** (pending accept/reject changes from Ask Claude) — step 6.3.
- **Sharing a summary: invited people only** (v1 feature, "Share a summary with classmates"; Lea 29 Oct, BUILD-PLAN 10.1b: private, by email invitation, never the audio, transcript or slides; access can be taken back) — Phase 8, not public `share_links`.
- **Plans and entitlements** (subscription state, server-enforced AI limits) — step 10.2.
- **Multi-select (Lea, 3.3)** — ⌘/Shift-click on the laptop, a select mode on the iPhone, with moving (drag or Move to…) and deleting several items at once. Not built yet.
