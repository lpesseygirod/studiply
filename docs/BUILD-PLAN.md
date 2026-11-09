# Studiply — Build Plan with Claude Code

Oct 23, 2026 · @Lea

## How to use this plan

Build Studiply in 11 phases split into about 50 small steps. Each step is one Claude Code prompt and ends with something you can check yourself. Small steps take more messages, but each one is easy to verify, and a mistake never spreads further than one step.

**The routine for every step** (always the same three messages)

1. Open Terminal in the Studiply folder, run `claude`, switch to plan mode (Shift+Tab until it says *plan mode*) and paste the **start message**:

```markdown
Read CLAUDE.md and docs/PROGRESS.md. We are doing step [X.Y] of docs/BUILD-PLAN.md. Tell me in 3 lines what is already done, what this step needs, and anything blocking it. Then wait.
```

2. Paste the **step prompt** from this plan. Claude Code proposes a plan; read it, ask about anything unclear, then approve. Test what it asks you to test, on the iPhone and in the browser.
3. When the step's **Check** passes, paste the **end message**, then type `/clear`:

```markdown
Run npm run check. If everything passes, update docs/PROGRESS.md (step done, decisions made, anything I must do by hand, known issues) and commit with the message "step [X.Y]: [short title]". If something fails, fix it first and tell me what it was.
```

If a check fails, don't move on: tell Claude Code exactly what you saw (see *When things go wrong* at the end). Some steps are marked **Spike**: they test a risky technical idea with a small prototype before building on it. If a spike fails, stop and ask me or Claude Code for another approach; that's what spikes are for.

**The one big decision: Studiply needs a backend again**

Today the app has no server: everything is in SQLite on the phone, and the Whisper and Claude keys ship inside the app (your README says so). Three things we designed make a backend unavoidable:

- **App Store:** keys inside the app can be extracted by anyone, who would then spend your money. AI calls must go through a server.
- **Laptop + iPhone:** the same library on two devices needs sync.
- **Live assistant during class:** the lecture must be transcribed in small chunks while recording, which is a server job.

The plan uses **Supabase** (your code already mentions migrating to Supabase Edge Functions): login, a Postgres database, file storage for audio and slides, and Edge Functions that hold the API keys. SQLite stays on the phone as an offline cache, so recording still works without internet.

**The laptop version** is the same Expo codebase running on the web (you already have `react-native-web` installed), so you build one app, not two. A native Mac app can come later.

**Files that tell Claude Code everything we designed** (put them in your repo in Phase 0): `CLAUDE.md`, `docs/DESIGN.md`, `docs/SUMMARY-SPEC.md` and `docs/BUILD-PLAN.md` (this plan).

## Every feature, on iPhone and laptop

Studiply is one app with two faces: the **iPhone app** (App Store) for recording in class and reviewing on the go, and the **laptop version** (web) for writing and studying with three columns. Every feature exists on both and syncs through the backend; only the way you use it changes. **v1** = needed for the first App Store release; **Later** = after launch.

### Library and files

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Courses as colored folders, nested folders | Library tab, list or grid | Left sidebar + main grid | 3 | v1 |
| Move files between folders | Long-press and drag; or Move to… sheet | Drag and drop onto folder, breadcrumb, sidebar course or Trash | 3 | v1 |
| Menu on empty space (New folder, New document, New recording, Upload, Paste, Sort) | Long-press empty space or “…” button | Click or right-click empty space | 3 | v1 |
| Menu on a file (Open, Rename, Move out, Add to Favorites, Summarize / Exam pack, Trash) | Long-press the file | Right-click the file | 3 | v1 |
| New folder with inline rename | Yes | Yes | 3 | v1 |
| Undo after every move or delete | Undo toast | Undo toast + Cmd+Z | 3 | v1 |
| Recent, Favorites, Exam packs, Review today, Trash | Library tab sections | Sidebar | 3, 9 | v1 |
| Search notes, lectures and terms | Search tab | Search field in top bar | 3 | v1 |
| Import slides/PDFs from other apps | Share sheet from Mail, Files, Safari (share extension) | Drag files from Mac Finder into a folder | 3, 10 | Later (iPhone extension) |

### Recording in class

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Record lecture | Big Record button; keeps recording with screen locked or app in background | Record button; browser recording | 5 | v1 |
| Live transcription in 30-second chunks | Yes | Yes | 5 | v1 |
| Recording without internet, uploaded later | Yes | Needs internet only to start; then keeps recording offline and uploads later (step 5.2) | 5 | v1 |
| Timer and live waveform | Top of the recording screen | Red strip under the top bar | 5 | v1 |
| Marks: Important, Confused, Exam with 1–10 slider and note | Large buttons at the bottom, slider in a small sheet, haptic tap on save | Buttons in the strip, inline slider panel | 5 | v1 |
| Live notes stamped with the recording time | Notes editor above the mark buttons | My notes tab | 5 | v1 |
| Photo of the board or slide | Camera button, stamped with the time | File picker or webcam | 5 | v1 |
| Record from inside any document (a blank document becomes a lecture; what I wrote stays as My notes) | Record button in the document header | Record button above the page | 5 | v1 |
| Marks without unlocking the phone | Lock Screen / Dynamic Island Live Activity with timer and mark buttons | — | 5 | Later (needs native code) |
| Start recording fast | Action Button or Siri Shortcut | Cmd+R | 5 | Later (iPhone) |
| Reminder to check recording is allowed in class | First recording | First recording | 10 | v1 |

### Document editor (like Google Docs)

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Blank documents anywhere in the library (write anything, not only lecture notes) | “+” / long-press empty space → New document | New button / right-click → New document | 4 | v1 |
| Tabs: My notes, Summary, Transcript (lecture documents) | Segmented control at the top | Tabs above the toolbar | 4 | v1 |
| Text styles: Title, Heading 1, Heading 2, Subheading, Normal, Quote | “Aa” button opens a style sheet | Style dropdown | 4 | v1 |
| Bold, italic, underline, strikethrough, text color, highlight | Toolbar above the keyboard, scrolls sideways | Full toolbar | 4 | v1 |
| Bullet, numbered and checklists, alignment | Keyboard toolbar | Toolbar | 4 | v1 |
| Paste from Google Docs or Word keeps the formatting | Yes | Yes | 4 | v1 |
| Links, images, tables, formulas (KaTeX), comments | “+” insert menu; keyboard-toolbar buttons for a selected photo, a link or a comment; formula and comment sheets | Toolbar buttons; photos dropped or pasted; comments in a margin beside the page | 4 | v1 |
| Colour picker like Word's (shades, Recent colours synced across devices, More colours… spectrum, hex on the laptop) | Colour panel | Toolbar popovers | 4 | v1 |
| Paste an image on the iPhone (the system paste into a document) | Paste | — | — | Later |
| Select text → Ask Claude (explain simpler, example, go deeper, flashcard, rewrite) | Edit menu that pops up on selection | Floating menu on selection | 6 | v1 |
| Tap a timestamp to replay the audio | Mini player at the bottom | Mini player | 4, 5 | v1 |
| Autosave, offline editing, sync | Yes (writing offline, synced when back online) | Yes (online) | 4 | v1 |
| Version history and restore | Document menu | Document menu | 4 | v1 |
| Formula library (finance first: PV, FV, annuity, NPV, IRR, EAR, WACC, CAPM…), with a line for each letter | Formula sheet → From the library | Insert ▾ → Formula ▸ From the library | 4 | v1 |
| Graphs I build (bar, line, pie, scatter) from a small data table | Second row → Graph; data in a sheet | Insert ▾ → Graph; data under the graph | 4 | v1 |
| Spreadsheet with Excel formulas (=A1+B2, SUM, IF, XLOOKUP, PMT, NPV, IRR…), autocomplete, help line, fill by dragging | Grid with a formula bar above the keyboard | Grid with a formula bar | 4 | v1 |
| Find & replace | Document menu → Find | Cmd+F / Cmd+Shift+H | 4 | v1 |
| Word count | Document menu | Document menu + status line | 4 | v1 |
| Outline of the headings to jump around | Sheet from the document menu | Outline beside the page | 4 | v1 |
| Line spacing, increase/decrease indent, page breaks | "Aa" sheet | Toolbar + shortcuts | 4 | v1 |
| Page setup for printing (A4 / Letter, margins) | Document menu | Document menu | 4 | v1 |
| Page view: separate pages with gaps and the page count, matching the export; "Pageless" switch | Pageless by default, "Print layout" switch | Pages by default | 4 | v1 |
| Zoom | Pinch to zoom | 50–200 %, ⌘+ / ⌘−, remembered per device | 4 | v1 |
| Import a Word document (.docx) | Files picker (from the share sheet later, with the share extension) | Upload or drag from Finder | 4 | v1 |
| AI suggestions accepted or rejected, never automatic | Yes | Yes | 6, 7 | v1 |
| Export PDF (any document, with its page setup) | Share sheet (AirDrop, Files, Mail) | Download | 4, 8 | v1 |
| Page numbers and new pages at page breaks in PDF and Word export | Yes | Yes | 4 | v1 |
| Export Word (.docx) | Share sheet | Download | 4 | v1 |
| Export Markdown | Share sheet | Download | 8 | Later |
| Real-time co-editing and sharing a document with others | — | — | — | Later (after launch) |
| Automatic table of contents (from the headings, updated on request) | Document menu | Insert menu | — | Later |
| Footnotes | "+" insert menu | Insert menu, ⌘⌥F | — | Later |
| Headers and footers (in page view and in the export) | Document menu | Double-click the page top / bottom | — | Later |

### Study assistant (Claude-style chat)

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Chat during class without stopping the recording | Half-height sheet over the recording screen, so notes stay visible | Right-hand panel | 6 | v1 |
| Quick prompts: Explain the last 10 min, What did she just say?, Define the last term, Am I missing something? | Chips above the keyboard | Chips above the composer | 6 | v1 |
| Streaming answers with tappable timestamps | Yes | Yes | 6 | v1 |
| Copy, Retry, Add to notes, Flashcards under each answer | Yes | Yes | 6 | v1 |
| Ask by voice | iOS keyboard dictation | — | 6 | v1 (built into iOS) |
| Answers saved with the lecture and used in the summary | Yes | Yes | 6, 7 | v1 |

### Summary

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Stop & summarize panel with extra resources (notes always included) | Full-screen sheet | Centered panel | 7 | v1 |
| 10 sliders from 1 to 10, presets, Save as course default | Sliders stacked in one column | Two columns | 7 | v1 |
| Summary written into the same document | Summary tab | Summary tab | 7 | v1 |
| Subject templates and modules (timeline, formulas, cases…) | Yes | Yes | 7, 8 | v1 |
| Marks steer the summary; confused moments explained step by step | Yes | Yes | 7 | v1 |
| All notes included, with “N of N lines” check | Yes | Yes | 7 | v1 |
| Extend with next lecture, Merge lectures, Exam pack | Document menu | Document menu + right-click in Library | 7 | v1 |
| Graphs and visuals drawn from formulas, templates and spoken numbers | Yes | Yes | 8 | v1 |
| Regenerate one section only | Long-press section | Section menu | 7 | Later |

### Studying and account

| Feature | iPhone | Laptop | Phase | When |
| --- | --- | --- | --- | --- |
| Quiz me (hide a section, answer its cue question) | Tap to reveal | Click to reveal | 9 | v1 |
| Create a quiz (course and lectures, resources, past exams as the model, 10 sliders, question types, time limit, grading, wrong answers come back) | Review → New quiz (full-screen sheet) | Review → New quiz (centered panel) | 9 | v1 |
| Flashcards and review screen | Swipe cards | Keyboard: space to flip | 9 | v1 |
| Spaced review reminders (day 1, 3, 7, 21; exam date) | Push notifications | Review today count | 9 | v1 |
| Course settings (subject, level, exam format, exam date, language, slider defaults) | Settings screen | Settings panel | 9 | v1 |
| Login with email or Apple, same library on all devices | Yes | Yes | 1 | v1 |
| AI consent screen and withdrawal in Settings | Yes | Yes | 10 | v1 |
| Delete account in the app | Yes | Yes | 10 | v1 |
| Export my data | Share sheet | Download | 10 | v1 |
| Legal pages (privacy, terms, refunds, cookies, legal notice), agreement and age 16 at sign-up | Links in Settings and sign-up | Pages on the web, linked | 10 | v1 |
| Plan and payment for AI use | In-App Purchase | Same account, managed on iPhone | 10 | v1 |
| Dark mode, Dynamic Type, VoiceOver | Yes | Dark mode, keyboard navigation | 2, 10 | v1 |
| Share a summary with classmates | Invited people only (no audio, transcript or slides) or PDF | Invited people only or PDF | 8, 10 | v1; live co-editing later |

The iPhone screens are described in `docs/DESIGN.md` (section *iPhone*), so every prompt below builds both versions at once.

## Phase 0 — Set up and safety net

**Step 0.1 — You (no Claude Code yet)**

- [ ] Rename the folder ` Projects  ` (it has a space at the end) to `Projects`. Trailing spaces in paths break scripts and build tools.
- [ ] Download this plan as Markdown (the doc's download menu) and save it as `docs/BUILD-PLAN.md`. Copy `CLAUDE.md` into the repo root and `DESIGN.md` and `SUMMARY-SPEC.md` into `docs/`.
- [ ] Commit: `git add CLAUDE.md docs && git commit -m "Add design docs and build plan"`.
- [ ] Your GitHub repo is **public**. No API keys are committed (I checked); make it private if you don't want the code visible before launch.
- [ ] Install Docker Desktop (Supabase runs locally in Docker for development), the Supabase CLI (`brew install supabase/tap/supabase`) and the EAS CLI (`npm install -g eas-cli`).
- [ ] Create accounts: Supabase, Anthropic API, OpenAI API. The **Apple Developer Program** (yearly paid membership) is needed from Phase 4, to install test builds on your iPhone.

**Step 0.2 — Audit**

```markdown
Read CLAUDE.md, docs/DESIGN.md, docs/SUMMARY-SPEC.md and docs/BUILD-PLAN.md, then explore the whole codebase (app/, src/, app.json, package.json).

Create two files:
1. docs/AUDIT.md: a table of every feature in DESIGN.md, SUMMARY-SPEC.md and the feature table in BUILD-PLAN.md with status (exists / partly / missing) and the files involved; the technical risks you see (at least: expo-av for recording, EXPO_PUBLIC API keys, the 25 MB Whisper limit, anything that won't run on web); and what each phase can reuse.
2. docs/PROGRESS.md: a checklist of every step in BUILD-PLAN.md (0.1 to 10.6), with 0.1 ticked, plus empty sections "Decisions", "Things Lea must do" and "Known issues".

Don't change any code.
```

**Check:** read `docs/AUDIT.md`. If it lists a risk this plan doesn't cover, tell Claude Code to add it to Known issues.

**Step 0.3 — Safety net**

```markdown
Set up checks that run before every commit, so mistakes are caught early:
- npm scripts: "typecheck" (tsc --noEmit), "test" (jest-expo), "lint" (expo lint), and "check" that runs all three.
- First unit tests for the pure helpers that exist (src/lib/mappers.ts, src/utils/tokens.ts, src/utils/file-size.ts).
- A local git pre-commit hook that runs npm run check before every commit (nothing on GitHub; never push).
Fix anything the new checks find, in small commits. Don't change app behavior.
```

**Check:** `npm run check` passes on your Mac, and a commit with a deliberate type error is blocked by the hook.

## Phase 1 — Backend and safe API keys

Branch `phase-1-backend`. Everything after this depends on it, so check each step carefully.

**Step 1.1 — Connect Supabase.** First, you: create a Supabase project in an **EU region** (your users and you are in Europe), and keep the project URL and keys open. Never paste secret keys into the chat; Claude Code will tell you which file to put them in.

```markdown
Step 1.1: connect this repo to my Supabase project. Create the supabase/ folder with the CLI, set up local development with supabase start, and add .env entries for the public URL and anon key only (never the service role key in the app). Make sure .env is git-ignored. Tell me each command I must run myself and what I should see.
```

**Check:** `supabase start` runs, and the local Supabase Studio opens in your browser.

**Step 1.2 — Database schema**

```markdown
Step 1.2: write the Postgres schema as SQL migrations in supabase/migrations, based on src/lib/db.ts plus everything DESIGN.md and SUMMARY-SPEC.md need: courses and nested folders (parent_id), documents (ProseMirror JSON, one row per tab: notes, summary, transcript) with document_versions, lectures (recording metadata, duration, transcript quality), transcript_segments, note_lines (with recording timestamp), marks (type, level 1-10, timestamp, note), media (slides, photos, readings, with timestamps), assistant_messages, course_settings (subject type, exam format, exam date, summary language, the 10 slider defaults), flashcards, review_schedule, ai_usage and ai_consent. Add Row Level Security on every table so a user only ever sees their own rows. Add pgTAP or SQL tests proving one user cannot read another user's data.
```

**Check:** the migration runs on local Supabase, and the RLS tests pass. Ask Claude Code to show you the tables in Supabase Studio.

**Step 1.3 — Login (email)**

```markdown
Step 1.3: replace the current auth with Supabase Auth using email (magic link or password, recommend one). Adapt AuthProvider, useAuth and the onboarding screens; keep their design. Sessions persist on iPhone (secure storage) and web. Sign in with Apple comes in step 10.1, not now.
```

**Check:** you can sign up, close the app, reopen it still logged in, log out, and log in again, on iPhone and in the browser.

**Step 1.4 — File storage**

```markdown
Step 1.4: create private Supabase Storage buckets for audio chunks, slides/PDFs and photos, with policies so only the owner can read or write their files. Write a small storage helper used by the app, with upload progress and retries.
```

**Check:** upload a photo from the app; it appears in Studio under your user's folder and can't be opened by a second test account.

**Step 1.5 — Transcription on the server**

```markdown
Step 1.5: create the transcribe-chunk Edge Function. It receives an audio chunk reference and its start time, checks the user is logged in, has AI consent and is under a daily limit, calls OpenAI transcription with the key stored as a Supabase secret, saves timestamped transcript_segments and logs cost in ai_usage. Add a test script that sends a sample audio file.
```

**Check:** the test script returns text with correct timestamps, and the OpenAI key exists only in Supabase secrets.

**Step 1.6 — Claude on the server**

```markdown
Step 1.6: create the assistant-chat and summarize Edge Functions as working skeletons: auth, consent and limit checks, Anthropic key as a secret, streaming responses for assistant-chat, ai_usage logging. Use the current recommended Claude model from Anthropic's documentation and keep the model name in one config place. The real prompts come in Phases 6 and 7; for now they answer a simple test prompt.
```

**Check:** a test call returns a streamed answer.

**Step 1.7 — The app uses the backend**

```markdown
Step 1.7: switch the app's services (folder, project, note, session, source-file, search, trash, ai, credit-check, ai-usage) to Supabase and the Edge Functions. Remove EXPO_PUBLIC_OPENAI_API_KEY and EXPO_PUBLIC_ANTHROPIC_API_KEY everywhere, including the settings screen check and .env.example. Keep the mock pipeline for when there is no network in development. Then build the web bundle and search it to prove no API key is inside.
```

**Check:** the app works as before, and Claude Code shows you the bundle search with zero keys found.

**Step 1.8 — Offline cache and sync**

```markdown
Step 1.8: keep expo-sqlite on iPhone as a local cache: library and documents readable offline, edits saved locally and synced when back online, recordings queued for upload. Explain the conflict rule you choose for a document edited on two devices (I'd like: newest version wins per block, the other kept in version history) and implement it. Add tests for the sync queue.
```

**Check:** turn on Airplane mode, open a document, edit it, turn Airplane mode off: the edit appears in the browser.

**Step 1.9 — Move my existing data**

```markdown
Step 1.9: write a one-time migration that uploads my existing local SQLite data and files (projects, folders, sessions, notes, recordings) to my Supabase account the first time I log in on this version. It must be safe to run twice and must never delete local data until the upload is confirmed.
```

**Check:** all your old notes and recordings appear on the web version. Phase 1 is done: merge the branch.

## Phase 2 — App shell on iPhone and laptop

Branch `phase-2-shell`.

**Step 2.1 — Navigation and layout**

```markdown
Step 2.1: build the app shell from docs/DESIGN.md (Layout section and iPhone section). iPhone: bottom tab bar Library · Search · Record (big raised red center button) · Review · Settings (docs/design iphone-01), documents full screen. Web at 1024 px or wider: top bar, left library sidebar, center document area, right assistant panel (placeholder for now); sidebar and assistant can collapse; narrower windows fall back to the iPhone-style layout. Use expo-router layouts and platform files only where needed. Empty placeholder content is fine in this step.
```

**Check:** resize the browser window from wide to narrow and back; the layout switches cleanly. The iPhone shows the tab bar.

**Step 2.2 — Real data in the shell**

```markdown
Step 2.2: wire the shell to the Phase 1 data: top bar with gradient logo tile, breadcrumb Course › Document, title, "Saved · time", red Record lecture button (#CC3333), Share, avatar; sidebar with New, search field, Recent, Starred, Exam packs, Review today, Courses with color dots (the open course expands to its files) and Trash. iPhone Library tab shows the same sections.
```

**Check:** your real courses and documents appear in both places, and opening one shows its title in the top bar.

**Step 2.3 — Look and feel**

```markdown
Step 2.3: apply the visual rules everywhere in the shell: colors only from src/constants/colors.ts (background: the full gradient, as in docs/design; dark mode: the same gradient dimmed, with dark-grey cards), sizes from typography.ts, Dynamic Type on iPhone, 44 px minimum touch targets, VoiceOver labels on icon buttons, and web keyboard shortcuts ⌥N, ⌥⇧N, ⌥R, / and ? (Cmd+N and Cmd+Shift+N belong to the browser). Compare with the mockup description in DESIGN.md and list anything that differs.
```

**Check:** switch your iPhone to dark mode and to a larger text size; everything stays readable. Merge the branch.

## Phase 3 — Library like Finder

Branch `phase-3-library`.

**Step 3.1 — Spike: drag and drop**

```markdown
Step 3.1 (spike): find the drag-and-drop approach that works on both web (mouse, drop targets, right-click) and iPhone (long-press to lift and drag onto a folder). Build a tiny throwaway screen with 3 folders and 5 files to prove it on both. Compare 2 options and recommend one, with the trade-offs. Don't touch the real library yet.
```

**Check:** on both the laptop and the iPhone you can drag a file onto a folder in the test screen. If one platform fails, ask for the other option before going on.

**Step 3.2 — Library grid**

```markdown
Step 3.2: build the Library from docs/DESIGN.md (Library section): grid of tiles for folders, documents, recordings and PDFs with name and meta, list/grid toggle on iPhone, breadcrumb "My library › Course", Sort (Kind, Name, Date edited), double-click / tap to open, New folder created in inline rename mode (Enter saves, Esc cancels).
```

**Check:** create, rename and open nested folders on both devices.

**Step 3.3 — Moving files**

```markdown
Step 3.3: add moving with the approach from step 3.1: drop onto a folder tile (dashed #7B6FD4 highlight), onto the breadcrumb to move up, onto a course in the sidebar, onto Trash. Block a folder from being dropped into itself or its children. Every move shows UndoToast with Undo (and Cmd+Z on web). Keep MoveToModal as the accessible alternative. Add tests for the move rules.
```

**Check:** move a file in and out of three levels of folders, undo each move, and try to drop a folder into its own child (it must refuse).

**Step 3.4 — Menus**

```markdown
Step 3.4: add the menus from DESIGN.md. Empty space (click or right-click on web, long-press or the "…" button on iPhone): New folder, New document, New recording, Upload slides or PDF, Paste, Sort by name, Sort by date edited. On an item (right-click / long-press): Open, Rename, Move to…, Move out, Add to Favorites (already built in 2.2), Summarize recording or Make exam pack (placeholder until Phase 7), Move to Trash. Menus close on Escape or outside click and work with the keyboard.
```

**Check:** every menu item works or clearly says "coming soon".

**Step 3.5 — Trash, stars, recent, search**

```markdown
Step 3.5: finish Trash (restore, delete forever, auto-empty after 30 days), Favorites, Recent, and search across document titles, note text, transcripts and glossary terms, on both devices.
```

**Check:** search a word you said in a recorded lecture and find it.

**Step 3.6 — Settings in sections**

```markdown
Step 3.6: rebuild Settings from docs/design desktop-05-settings and iphone-07-settings, with the same sections on both devices: Account, Summaries, Recording, AI & privacy, Storage & sync, Notifications, Appearance, Your data, and Development (development builds only). Laptop (1024 px and wider): two columns centred on the gradient, a white menu card on the left (the open section highlighted) and the section on the right with its title and white cards; one route per section. iPhone: the Settings list opens one page per section ("‹ Settings" and the big title), with a short value on the right of each row where it is real (summary level, recording language, today's AI use, storage, theme). Move the existing settings, don't rewrite them: profile, sign-in methods, sync status and Sign out → Account; AI processing defaults → Summaries; recording defaults → Recording; AI usage today, cost breakdown and the limits note → AI & privacy (the consent card comes in step 10.1); default file retention, source-file storage, failed syncs and "Delete data on this device" → Storage & sync; a "Reminders come with Review" card → Notifications; Light / Dark / System and Keyboard shortcuts → Appearance; Recently Deleted and Earlier version data → Your data (opening inside the right column on the laptop); Simulate offline, sync and drag debugging, sample data and the server badge → Development.
```

**Check:** on the laptop Settings looks like desktop-05 and every existing setting is in its section; on the iPhone the list opens the same sections; nothing from the old General, Manage Account and Security screens is lost. Merge the branch.

## Phase 4 — Editor like Google Docs

Branch `phase-4-editor`. You need the Apple Developer Program from here on.

**Step 4.1 — Development build on your iPhone**

```markdown
Step 4.1: set up EAS so I can install a development build of Studiply on my iPhone instead of Expo Go (needed for the editor's native parts). Configure eas.json with development, preview and production profiles, register my iPhone, and walk me through every command and every Apple screen I'll see.
```

**Check:** the Studiply development build opens on your iPhone and reloads when code changes.

**Step 4.2 — Spike: one editor, two platforms**

```markdown
Step 4.2 (spike): prove the editor approach on a throwaway screen: TenTap (@10play/tentap-editor) on iPhone and Tiptap on web, sharing one ProseMirror schema, with one custom node (a timestamp chip). Save the JSON from the iPhone and open it on web, and the reverse. Also paste a formatted page from Google Docs and from Word (headings, bold, lists, a table) on both. Report any problems (keyboard, performance with 20 pages of text, web compatibility, what paste loses) and recommend whether to continue.
```

**Check:** a document written on the iPhone opens identical in the browser, chip included, and a page pasted from Google Docs keeps its headings, bold and lists. If not, stop here and ask for alternatives.

**Step 4.3 — Documents that save themselves**

```markdown
Step 4.3: make every lecture a document with three tabs (My notes, Summary, Transcript), and let me create blank documents anywhere in the library (New document in the New menu and the empty-space menu, in a course, a folder or My library; a title, one page, nothing else) that I can use for anything, not only lecture notes. Both use the editor from 4.2, stored as ProseMirror JSON in Supabase with the SQLite cache. Autosave with "Saved · time"; on the iPhone I can keep writing offline (new documents too) and it syncs when I'm back online, using the block-level conflict rule from step 1.8 (nothing I wrote is ever lost). Version snapshots (each AI generation and the end of each editing session), version history with restore, and an origin attribute on every block (ai, student, media) that switches to student when the student edits it. Add tests for the origin rule and for offline edits syncing.
```

**Check:** create a blank document in a folder and write in it; edit on the laptop, see it on the iPhone a few seconds later; write on the iPhone while offline (development build: `supabase stop` or Settings → Development → Simulate offline, because airplane mode would also cut the app off from Metro; real airplane-mode tests only with a preview build), go back online and see it on the laptop; restore an older version.

**Step 4.4 — Formatting toolbar**

```markdown
Step 4.4: build the formatting tools from DESIGN.md. Laptop: full toolbar (undo/redo, text style Title/Heading 1/Heading 2/Subheading/Normal/Quote, font, size −/+, bold, italic, underline, strikethrough with active state, text color, highlight, bullet/numbered/check lists, align, line spacing, increase/decrease indent, page break, clear formatting) plus Cmd+B/I/U shortcuts and the other Google Docs shortcuts. iPhone: keyboard toolbar that scrolls sideways plus an "Aa" sheet for styles, size, alignment, line spacing, indent and page breaks. Pasting from Google Docs or Word keeps headings, bold/italic/underline, colours, highlights, lists, links and tables (mapped to our styles); "Paste without formatting" (Cmd+Shift+V) is there too.
```

**Check:** recreate your Psicobiología notes page (titles, bold, underline, highlight, lists) on both devices; copy a page from Google Docs and one from Word and paste them: they look the same.

**Step 4.5 — Inserting things**

```markdown
Step 4.5: add links, images (from Photos, camera or files), tables, formulas with KaTeX (inline and display), and comments in the margin (laptop) or as a sheet (iPhone).
Also (Lea):
- **A colour picker like Word's** for text colour, highlight and table cells, on both devices: about 10 base colours with 5 lighter/darker shades below each, Recent colours (synced across devices), Automatic/None, and More colours… (a full spectrum, plus a hex field on the laptop).
- **Tables:** rows and columns, a header row, cell colours.
- **Photos:** from Photos and the camera on the iPhone, drag and paste on the laptop, resize.
- **The laptop toolbar** on one row of the most-used tools with ⌄ for a second row (remembered per device; tools that don't fit move there). The iPhone keyboard toolbar likewise puts the most-used tools first, with a "more" row.
```

**Check:** insert the formula for compound interest and a 3×3 table on the iPhone; both look right on the laptop.

**Step 4.5b — Page view and zoom (pulled forward from 4.7, Lea after test B)**

```markdown
Step 4.5b: a page view like Word's: A4 pages with gaps between them and the page count ("Page 3 of 12"), with a Pages / Pageless switch in the toolbar (laptop: Pages by default; iPhone: Pageless by default, the same switch). It only changes the display (the document stays one pageless JSON; see "Page view in 4.7: what is feasible" below for the approach), with A4 and standard margins until page setup comes in 4.7. Zoom: 50–200 % on the laptop (⌘+ / ⌘−, a zoom menu, remembered per device) and pinch-to-zoom on the iPhone. Start with a short spike against real documents; plan first.
```

**Built 29 Oct** (see PROGRESS, checkpoint D): our own display-only page view (`src/editor/page/`), Fit / 50–200 % zoom, Print layout and pinch on the iPhone; the break rules in `pageLayout.ts` are the ones 4.8's export must follow.

**Check:** a 10-page document shows its pages with gaps on the laptop and the right page count; a long paragraph splits between pages; switch to Pageless and back; zoom to 150 % and back with ⌘+ / ⌘− (remembered after a reload); pinch to zoom on the iPhone; Pages on the iPhone shows the same pages.

**Step 4.6 — Studiply blocks**

```markdown
Step 4.6: create the custom blocks the summary will use, as editor extensions on both platforms, styled with the app palette from SUMMARY-SPEC.md (Color system): callouts (Definition, Example, Exam signal, Warning, From your notes, You were confused here, Added context) with text labels, timestamp chips (tap to play the audio from that moment), mark chips ("Confused 7/10"). Students can edit text inside them.
```

**Built 29 Oct** (see PROGRESS): callouts with their labels and menu, mark chips, timestamp chips with a mini player (playback in one file, `src/lib/audioPlayer.ts`, to move to expo-audio with the SDK upgrade).

**Check:** insert one of each block on the laptop; they look the same on the iPhone.

**Order after 4.6 (Lea, 29 Oct):** 4.7c formula library → 4.7d graphs → 4.7b tabs → 4.7e spreadsheet (a kind of tab) → 4.7 writing tools → 4.8 import and export → 4.9.

**Step 4.7c — Formula library** (Lea, 29 Oct; built first, see the order above)

```markdown
Step 4.7c: a library of ready-made formulas next to the Formula insert, on both devices: Insert ▾ → Formula ▸ From the library (iPhone: in the formula sheet), grouped (Time value of money · Valuation · Cost of capital) with a search box. Picking one inserts a formula card: the formula drawn properly with KaTeX (fractions, exponents, Σ) and under it one short line saying what each letter means. Everything stays editable after inserting (the formula in the formula editor, the line as text).
First list (finance):
- Present value: PV = FV / (1 + r)^n · Future value: FV = PV × (1 + r)^n
- Annuity (present value): PV = C × [1 − (1 + r)^−n] / r
- Perpetuity: PV = C / r · Growing perpetuity: PV = C / (r − g)
- NPV = −C₀ + Σ Cₜ / (1 + r)^t · IRR: the r that makes NPV = 0
- Effective annual rate: EAR = (1 + APR/m)^m − 1
- WACC = E/V × r_e + D/V × r_d × (1 − T) · CAPM: r = r_f + β × (r_m − r_f)
The list is data in one file (name, group, LaTeX, the line for each letter), so other subjects (statistics, economics) can be added later. The formula card is the block 8.2 uses for the summary's formula cards.
```

**Check:** search "annuity" on the laptop and insert it; insert NPV and WACC on the iPhone; edit one after inserting; they look the same on both devices and in the PDF.

**Step 4.7d — Graphs I build** (Lea, 29 Oct; was 8.2b)

```markdown
Step 4.7d: a graph block I build myself in any document, on both devices: Insert ▾ → Graph (iPhone: the second row's Insert group). Pick the type (bar, line, pie, scatter), enter or edit the data in a small table (laptop: under the graph when it is selected; iPhone: a sheet), and the graph updates as I type. A title, axis labels and series names. Drawn as SVG by our own code in the style of SUMMARY-SPEC "Graphs and visuals" ( labels on the lines, solid/dashed/dotted so it prints in black and white, a text description for screen readers). The data lives in the block, so it syncs and merges like any block (origin student). PDF and Word export (4.8, 8.3) include it as a picture; 8.2 reuses this drawing for the summary's charts. Ask before adding any chart library (the plan is to draw them ourselves).
```

**Check:** make a bar chart of 5 values on the iPhone, change one value on the laptop: the bars change on both; switch it to line and pie; print it in black and white.

**Step 4.7b — Tabs in every document** (asked 29 Oct; after graphs, before the spreadsheet)

```markdown
Step 4.7b: Google Docs–style tabs in every document, on both devices: "+" adds a tab, and I can rename, reorder (drag on the laptop; Move left / Move right in the long-press sheet on the iPhone for a first version) and delete tabs (with Undo; at least one stays). Lectures keep My notes, Summary and Transcript as fixed tabs (not renamed, moved or deleted), followed by any added tabs; plain documents start with one tab ("Tab 1") and can have more. The Transcript stays editable as since 4.3, to correct misheard words (Lea, 29 Oct). Laptop: a tab row above the toolbar; iPhone: a tab row that scrolls sideways, replacing the segmented control.
- Data: each tab is a documents row; `tab` is its id (notes / summary / transcript as today, added tabs `t-<uuid>` made on the device), with `title`, `position` (moving a tab writes only its own position), `deleted_at` (soft delete) and `kind` (`summary` for a summary tab, `sheet` for a spreadsheet tab from 4.7e). `unique (file_id, tab)` stays; nothing in existing documents is rewritten.
- Offline: `create_tab` and `tab_meta` queue ops per tab; edits merge per tab block by block as today; a tab deleted on one device and edited offline on another comes back with a notice.
- Versions stay per tab (history, Restore, "Before restore"); page setup becomes the document's (saved to every tab; a new tab copies it).
- A new summary that isn't added to the existing one goes into its own tab, "New summary" (`kind = summary`), after Summary and Transcript; the tab model supports it here, Phase 7 writes it.
- 4.8's export offers This tab or All tabs, with page numbers.
- Not in the first version: nested tabs, tab icons, a list of deleted tabs, remembering the last open tab, search inside tabs; at most 30 tabs.
```

**Check:** add, rename, move and delete tabs on the laptop and see them on the iPhone; do the same offline on the iPhone, then go online; restore a version in one tab without touching another; a lecture's My notes, Summary and Transcript stay first and fixed.

**Step 4.7e — Spreadsheet tab** (Lea, 29 Oct; was 8.4; after tabs, 4.7b)

```markdown
Step 4.7e: a spreadsheet as a tab of any document ("+" → Spreadsheet; a tab with `kind = sheet`, 4.7b), on both devices: cells, rows and columns, and formulas that work like Excel.
- Typing "=" in a cell starts a formula; clicking (tapping) other cells adds them (=A1+B2); ranges by dragging (A1:A10).
- Autocomplete of functions while I type: Basic SUM, AVERAGE, MIN, MAX, COUNT, ROUND · Logic IF, AND, OR · Lookup VLOOKUP, XLOOKUP · Finance PV, FV, PMT, NPV, IRR, RATE, NPER. Under the formula, a short help line for the function being typed, with the current part in bold: PMT(**rate**, nper, pv).
- Dragging a cell's corner copies its formula to the cells next to it, with the references moving as in Excel ($A$1 stays).
- Laptop: a grid with a formula bar; iPhone: the grid with the formula bar above the keyboard and the cell references by tap.
- Data: the tab's row holds the cells (value or formula, bold); between devices the cells merge one by one (two devices changing different cells both keep their change), so it works offline, and versions work per tab as for text. Results are calculated on the device. Errors as in Excel (#DIV/0!, #REF!, #NAME?).
- Export: PDF and Word (4.8), "This tab" or "All tabs", as a table of the values.
- Also in this step (Lea, 30 Oct), on both devices:
  - Undo and Redo of cell changes (⌘Z / ⌘⇧Z and the toolbar's undo / redo on the laptop);
  - insert and delete rows and columns (right-click a row number or column letter on the laptop, long-press it on the iPhone), with references moving as in Excel (a deleted cell's references become #REF!);
  - copy, cut and paste of a cell range (⌘C / ⌘X / ⌘V on the laptop; Copy / Paste in the cell's sheet on the iPhone), references moving on paste as with the fill.
- Not in the first version: .xlsx import and export, charts inside the sheet (a graph block can take its data from a sheet later), several sheets per tab, cell styles beyond bold, number formats (%, €, decimals) and column widths.
The formula engine is built separately (Lea, 29 Oct: another Claude Code session, branch `sheets-engine`, worktree `../Studiply-sheets`, a standalone module with its own tests). This step does not write a formula engine: it plugs that module in (parsing, calculating, the function list and help lines, moving references when copying) and builds the grid, the editing and the syncing around it.
```

**Check:** a loan table on the laptop with PMT and a column filled by dragging the corner; open it on the iPhone, change the rate offline, go online: the laptop shows the new payments; =NPV and =IRR give the same results as Excel for the same numbers.

**Step 4.7 — Writing tools**

```markdown
Step 4.7: add the writing tools of a full word processor, on both devices: find & replace (match case, whole words, next/previous, replace all, with Undo; Cmd+F and Cmd+Shift+H on the laptop), word and character count (whole document and selection; a status line on the laptop), an outline of the headings to jump around (beside the page on the laptop, a sheet on the iPhone; it follows as I write), and page setup for printing (A4 or Letter, portrait or landscape, margins; saved with the document, shown as page edges on the laptop, used by printing and PDF export).

Also a page view and zoom, like Word and Google Docs (**moved to step 4.5b**, Lea after test B), and page setup (**moved too**, after test D: built with 4.5b, per document; 4.7 keeps find & replace, word count and the outline):
- **Page view:** separate A4/Letter pages with gaps between them and the page count ("Page 3 of 12"). The pages match what the PDF and Word export will produce (page setup's size and margins, page breaks), with a "Pageless" switch. The laptop starts with pages and the iPhone pageless, with a "Print layout" switch.
- **Zoom:** 50–200 % on the laptop (⌘+ / ⌘−, a zoom menu, remembered per device), and pinch-to-zoom on the iPhone.

Start with a short spike comparing the page-view options (see the recommendation below) and ask before adding any library.
```

**Check:** in a 10-page document, replace a word everywhere and undo it; the word count matches Google Docs for the same text; jump to a heading from the outline on both devices; switch to Letter with 2 cm margins and print a preview; in page view the page count and where each page ends match the PDF; zoom to 150 % and back with ⌘+ / ⌘− (it is remembered after a reload); pinch to zoom on the iPhone; Print layout on the iPhone shows the same pages.

**Step 4.8 — Import and export**

```markdown
Step 4.8: import a Word document (.docx) as a new document in the open course or folder (laptop: upload or drag from Finder; iPhone: the Files picker; importing from other apps' share sheet comes later with the share extension), keeping headings, formatting, lists, tables and images; and export any document as PDF (with its page setup) and as Word (.docx), on both devices (laptop: download; iPhone: share sheet). Both start a new page at every page break and number the pages (an option, on by default). With tabs (4.7b), export asks This tab or All tabs (each tab from a new page with its name as a heading, page numbers through the whole file). Lecture summaries still get their designed PDF in Phase 8; this is the plain document export. Ask before adding any library for .docx.
```

**Check:** import a real Word file from your courses and compare it with Word; export it again as .docx and PDF and open both on the Mac: page breaks start new pages and the pages are numbered.

**Split (Lea's advisor, 30 Oct):**
- **4.8a, PDF export (no new dependency):** any document on both devices (laptop: the print window's Save as PDF; iPhone: the share sheet), with its page setup, the page view's pages (pageLayout.ts), page numbers (an option, on by default), This tab / All tabs; sheet tabs as a table of values; graphs, formulas, callouts and photos as they look. Built 30 Oct.
- **4.8b, .docx import and export:** after Lea chooses the libraries (comparison in the 4.8a report: mammoth for import, docx for export).

**Step 4.9 — Convert old notes**

```markdown
Step 4.9: convert all existing notes from the old format into the new document format, keeping text, highlights and attachments. Safe to run twice; keep the old data until I confirm.
```

**Check:** open three old notes and compare them with how they looked before. Merge the branch.

**Later, after launch (not in Phase 4):** real-time co-editing (several people writing in the same document at once, with their cursors) and sharing a document with others to edit or comment. Phase 8 only adds sharing a summary with invited people (read-only; no audio, transcripts or slides, 10.1b) and PDFs. Also later: an automatic table of contents, footnotes, and headers and footers (Lea, step 4.4).

**Page view in 4.7: what is feasible (checked 28 Oct 2026, step 4.4).**
- **Tiptap's own "Tiptap Pages"** is a paid Pro extension (needs a paid Tiptap plan and a private package registry; still marked alpha). It is the most complete option, with page formats, headers and footers, and Word export. But it would be the first paid dependency, and it would have to run inside the iPhone's WebView bundle too. Its exact 2026 terms weren't confirmed, so it isn't recommended unless the free routes fail.
- **Free community extensions** (`tiptap-pagination-plus`, MIT; `tiptap-extension-pagination`, ISC) exist but are young. Several change the document itself (page nodes), which would break the block ids, the merge and the origin rule (4.3).
- **Recommendation: a page view of our own, which only changes the display.**
  - **How:** the document stays one pageless JSON. In page view, the editor measures its blocks and draws page gaps, page edges and "Page n of m" as decorations (nothing is saved). It moves a block that doesn't fit to the next page, and splits a long paragraph between lines.
  - **Same rules as the export:** the PDF/Word export (4.8) uses the same page size, margins, page breaks and keep-together rules, so the count matches.
  - **Zoom** is a CSS scale of the page on the laptop and the WebView's own pinch-zoom on the iPhone.
  - **Cost and risk:** about one step of work. The risk is splitting long tables and lists exactly as Word does, so 4.7 starts with a spike against real documents.
  - **If that spike shows the count can't match the export,** try `tiptap-pagination-plus` next, and Tiptap Pages last, after asking about the cost.
  - **Sources:** tiptap.dev/blog/release-notes/structured-paginated-real-meet-tiptap-pages · npmjs.com/package/tiptap-pagination-plus · github.com/hugs7/tiptap-extension-pagination

## Phase 5 — Recording with live notes and marks

Branch `phase-5-recording`. This is the riskiest technical part, so it starts with a spike.

**Step 5.1 — Spike: recording in pieces**

```markdown
Step 5.1 (spike): prove we can record a long lecture in 30-second chunks without losing audio between chunks: on iPhone with expo-audio (replacing expo-av), with the screen locked and the app in the background for 15 minutes; on web with MediaRecorder. Upload each chunk to transcribe-chunk and show the live transcript on a throwaway screen. Measure any gap or overlap between chunks and the battery use; propose a fix if there are gaps (for example overlapping chunks).
```

**Check:** record 15 minutes with the phone locked; the transcript has no missing sentences at the chunk joins. If it does, don't continue until the fix works.

**Step 5.2 — Recorder service**

```markdown
Step 5.2: turn the spike into a real recorder service: start, pause, resume, stop; chunks saved on the device first and uploaded through the Phase 1 queue (works without internet and uploads later); live transcript appended in order; recovery if the app crashes mid-lecture (no audio lost); background audio mode configured in app.json. Add tests for chunk ordering and the upload queue.
```

**Check:** start recording, turn on Airplane mode for 5 minutes, turn it off: the transcript fills in the missing part.

**Step 5.3 — Recording screen**

```markdown
Step 5.3: build the recording screens from DESIGN.md. iPhone: course › title, red dot + timer, live waveform, My notes editor in the middle, bottom bar with large buttons Important, Confused, Exam, Camera, Stop & summarize. Laptop: red recording strip under the top bar with timer, waveform and the same buttons. Nothing except Stop may stop the recording.
The recording setup picks the course, then a folder in it, with "+ New folder" in the picker (Lea, 30 Oct: option A).
```

**Check:** record 5 minutes on each device while switching tabs and opening other screens; the recording never stops.

**Step 5.4 — Live notes with timestamps**

```markdown
Step 5.4: in My notes during recording, every new line gets the current recording time as a timestamp chip; tapping a chip plays the audio from that moment (after recording, or from the local file during). Store each line in note_lines with its timestamp and keep the formatting.
```

**Check:** write 5 notes during a test recording, then tap each timestamp: it plays the right moment.

**Step 5.5 — Marks with a 1–10 level**

```markdown
Step 5.5: add the marks from DESIGN.md: Important, Confused and Exam each open a panel (inline on laptop, small sheet on iPhone) with the time, its own question, a 1-10 slider with labeled ends, an optional note, a one-line hint of the effect (from SUMMARY-SPEC.md "What each mark does"), and Save mark with a light haptic on iPhone. Saved marks appear in My notes as chips ("Confused 7/10"); tapping a chip changes its level. Stored in the marks table.
```

**Check:** add one of each mark at different levels, change one afterwards, and see them all in Supabase.

**Step 5.6 — Board photos**

```markdown
Step 5.6: Photo board: camera on iPhone, file picker or webcam on the laptop; each photo is saved with its timestamp, shown as a thumbnail in My notes at that moment, and stored in Storage.
```

**Check:** take two photos during a test recording; they appear at the right times.

**Step 5.7 — Record inside a document**

```markdown
Step 5.7: add a Record button inside every document (iPhone: in the document header; laptop: in the row above the page). In a lecture it starts recording into that lecture (its My notes tab stays the notes editor). In a blank document it turns the document into a lecture with the three tabs (My notes, Summary, Transcript): what I already wrote stays as My notes, with its formatting and version history, and the new lines get timestamps from the recording. Nothing I wrote may be lost or moved elsewhere; if the recording is cancelled before anything was saved, the document stays a blank document. Add tests for turning a document into a lecture (its notes kept, offline on the iPhone too).
```

**Check:** in a blank document with a few lines, tap Record, take notes for a minute and stop: it is now a lecture, My notes holds the old lines plus the new timestamped ones, and the transcript appears in its tab.

**Step 5.8 — A real lecture**

No prompt: record a full real class with notes, marks and photos. Then tell Claude Code everything that went wrong or felt slow, and ask it to fix those issues one by one before merging.

## Phase 6 — Study assistant during class

Branch `phase-6-assistant`.

**Step 6.1 — The assistant's brain**

```markdown
Step 6.1: write the real assistant-chat Edge Function: it receives the question, the live transcript so far, my notes and marks; quick prompts use a time window ("last 10 min" = now - 10 min to now, "what did she just say" = last 60 s, "define the last term" = last 3 min). Answers stream, stay in the lecture's language, cite timestamps, say clearly when something isn't in the transcript, and are saved to assistant_messages with their window. Add tests for the time-window selection.
```

**Check:** run the test script with a sample transcript; "explain the last 10 minutes" only talks about that window.

**Step 6.2 — Chat interface**

```markdown
Step 6.2: build the Claude-style chat from DESIGN.md (Study assistant): right panel on the laptop, half-height sheet over the recording screen on iPhone (drag up for full height). Student messages in a light rounded bubble on the right, answers as full-width text streaming in, with Copy, Retry, Add to notes and Flashcards under each. Header "Knows this lecture up to mm:ss" and "Recording continues" badge. Quick prompt chips. Composer: multi-line, Enter sends, Shift+Enter new line, + attach, "Context: this lecture" chip, send arrow disabled until there's text. Tappable timestamps.
```

**Check:** during a test recording, ask three questions on each device; the recording keeps going and answers arrive in a few seconds.

**Step 6.3 — Assistant actions and Ask Claude in the document**

```markdown
Step 6.3: make the actions work: Add to notes inserts the answer into My notes at the current time (origin ai, marked as from the assistant); Flashcards creates cards from the answer. Then add Ask Claude on any text selection in the editor (Explain simpler, Give an example, Go deeper, Make flashcard, Rewrite section); results arrive as suggestions the student accepts or rejects, never applied silently.
```

**Check:** select a paragraph, ask for a simpler version, reject it, then accept another. Merge the branch.

## Phase 7 — The summary engine

Branch `phase-7-summary`. Everything here follows docs/SUMMARY-SPEC.md, mainly *The summary request*, *How Claude builds the summary* and *How to generate it*. Quality matters most here, so this phase has its own test lectures.

**Step 7.1 — Test lectures first**

You: pick 3 real recorded lectures of different types (Psicobiología, Corporate Finance, Calculus), each with your notes and some marks.

```markdown
Step 7.1: save my 3 chosen lectures as test fixtures in tests/fixtures/lectures (transcript, notes, marks, assistant questions, media list, course settings), kept out of git (tests/fixtures/ in .gitignore; 10.1b). Remove anything personal I point out. These are the golden set for every later summary step.
```

**Check:** the 3 fixture folders exist and contain everything listed.

**Step 7.2 — The calculator (no AI yet)**

```markdown
Step 7.2: implement the derived variables from SUMMARY-SPEC.md "How Claude builds the summary" as one pure TypeScript module shared by the app and the Edge Function: target words from Length and transcript words, takeaways, explanation mode, prerequisites, examples, visual budget, exam weighting, self-test size, vocabulary, resource use, mark strength (effective level = level × slider ÷ 7, rounded, clamped 1-10), mark bands and effects, implicit signals (assistant questions as Confused 6 over their window, professor exam phrases, repetition) and the conflict rules. Write unit tests that reproduce every example in the spec's tables exactly (e.g. 12,000 words at Length 5 → 1,440; Self-test 5 → 7; Confused 7 with Follow my marks 7 → mid band).
```

**Check:** `npm run test` shows every spec example passing. This is what makes the summaries predictable.

**Step 7.3 — The summarize panel**

```markdown
Step 7.3: build Stop & summarize from DESIGN.md (Recording flow, part 2): centered panel on laptop, full-screen sheet on iPhone. Header with counts; extra resources as checkboxes (My notes and marks always included and locked); add buttons; the 10 sliders 1-10 with labeled ends and values; presets First time learning, Quick review, Exam tomorrow, Reset with the exact values from SUMMARY-SPEC.md; Save as course default; Keep recording / Stop & generate summary. Show a small live preview line from the calculator ("≈ 1,440 words · 4 takeaways · 7 questions").
```

**Check:** move the sliders and see the preview change; save defaults, open another lecture of the same course, and see them loaded.

**Step 7.4 — First real summary (short lecture)**

```markdown
Step 7.4: implement the summarize Edge Function pipeline for lectures up to 60 minutes: align notes, marks, photos and questions to transcript segments (±30 s), classify subject and pick modules, compute derived variables with the 7.2 module, build the prompt with the rules in "How to generate it", call Claude, validate the JSON with zod against the schema in the spec (retry once if invalid), store it. Run it on the shortest fixture and save the output JSON in tests/output.
```

**Check:** open the output with Claude Code and check together: all note lines present, all marks used, takeaways count right, language right.

**Step 7.5 — Quality checks**

```markdown
Step 7.5: add the quality checks from the spec: schema, notes coverage 100%, marks coverage, length within ±15% of target (notes excluded), faithfulness (every number, date and formula found in transcript, slides or notes, else corrected or labeled Added context), language. Failed parts are regenerated alone, not the whole summary. Write an evaluation script that runs all 3 fixtures and prints a report per check.
```

**Check:** the report shows all checks passing for the 3 fixtures (or explains why not).

**Step 7.6 — Long lectures**

```markdown
Step 7.6: for lectures over 60 minutes, split the transcript by topic, generate each part with its share of the target length, then merge into one summary (one set of takeaways, one glossary, one self-test). Run the evaluation on all fixtures again.
```

**Check:** a 90-minute fixture produces one coherent summary that passes the checks.

**Step 7.7 — Into the document**

```markdown
Step 7.7: convert the JSON into editor blocks in the Summary tab using the Phase 4 custom blocks: header with "built from", the notes check line ("All your notes are in this summary · N of N lines and M of M marks used"), takeaways, sections with mark chips and timestamps, From your notes blocks keeping my formatting, You were confused here blocks, exam signals, Your questions during class, self-test with hidden answers, flashcards saved. Origin ai, my notes student. Save a version. Regenerating never overwrites blocks I edited. The green banner "Summary added to this document" appears with Extend with next lecture. A new summary that I haven't chosen to add to the existing summary goes into its own new tab, "New summary" ("New summary 2"…; 4.7b), after Summary and Transcript; the Summary tab is never touched by it.
```

**Check:** generate a summary on the iPhone, edit two paragraphs on the laptop, regenerate: your two edits are still there.

**Step 7.8 — You judge the quality**

No new feature. Read each of the 3 fixture summaries next to the recording and write what's wrong (too long, missed the formula at 12:30, explanation too hard for slider 1…). Then:

```markdown
Step 7.8: here is my review of the 3 summaries: [paste your notes]. Fix the prompt and, if needed, the calculator rules, then rerun the evaluation and show me before/after for each point. Don't change the spec's numbers without asking me.
```

**Check:** repeat until you'd happily study from all 3 summaries.

**Step 7.9 — Extend, merge, exam pack**

```markdown
Step 7.9: implement Extend with next lecture, Merge lectures and Exam pack as described in SUMMARY-SPEC.md: the existing summary JSON plus the new lecture go in; new sections tagged by lecture; takeaways, glossary, timelines and self-test merged; professor corrections shown as update callouts; result saved as a new Unit summary; originals untouched. Available from the document menu and the Library item menu. When the result isn't added to an existing summary, it goes into a new "New summary" tab (4.7b).

Adding a new summary to an existing one (asked 29 Oct; also when I extend):
- Don't repeat anything that's already in the summary: only what's new is added (new sections tagged by lecture; glossary terms, formulas and self-test questions that aren't there yet).
- If something new is about a part that's already there (for example the professor says it will be on the exam), don't add it again: add a comment on that existing text saying what was said, with the time in the recording ("Lecture 4 · 18:30: the professor said this will be on the exam"). Comments never change my text, so this works on blocks I edited too; I can resolve or delete them.
- Comments made this way say they come from Studiply and keep the lecture and the time (the comment mark gains `author` and `source {lectureId, ms}`), so later the time can play the recording.
- The quality checks get a "no repeats" check: no added block says the same as an existing one; anything that would repeat becomes a comment or is left out.
```

**Check:** extend Tema 1 with Tema 2 and make an exam pack of the course. Add Tema 2's summary to Tema 1's: nothing already in Tema 1 appears twice, and where the professor came back to a part (e.g. "this will be on the exam") there is a comment on it with the time instead of a copy. Merge the branch.

## Phase 8 — Visuals and PDF

Branch `phase-8-visuals`.

**Step 8.1 — Text modules**

```markdown
Step 8.1: render the text-based summary modules from SUMMARY-SPEC.md as editor blocks on both platforms: timeline, cause-effect chain, key figures, comparison table, process steps, framework grid, theory card, case card, argument map, code block, vocabulary table, worked example. Follow the module library descriptions and the app palette. Use the fixtures to check each appears where expected.
```

**Check:** each module looks right on iPhone and laptop in the fixture summaries.

**Step 8.2 — Formulas and graphs**

```markdown
Step 8.2: render formula cards (KaTeX with the variable legend), function plots drawn exactly from the expression, model graph templates (supply-demand, IS-LM, normal curve, cost curves) where Claude only picks the template and shifts, data charts only from numbers in the transcript, and captured photos at their timestamp (formula cards are 4.7c's block; charts use 4.7d's drawing). Follow "Graphs and visuals": the takeaway as the title, labels directly on the curves, at most 3 series, dashed/dotted lines so they work in black and white, a text description for screen readers. Never AI-generated images.
```

**Check:** the Calculus fixture shows a correct plot of a function from the lecture; the Finance fixture shows its formulas.

**Step 8.3 — PDF export**

```markdown
Step 8.3: export the document as PDF following SUMMARY-SPEC.md "PDF export": A4 by default (Letter option), header and page numbers, no block split across pages, fonts and KaTeX embedded so it works offline, self-test answers on the last page, timestamps as plain text, file name "Course – Lecture – YYYY-MM-DD.pdf", options sheet (self-test yes/no, transcript appendix yes/no, paper size). iPhone: share sheet; laptop: download.
```

**Check:** print one PDF in black and white; everything is readable and nothing is cut between pages. Merge the branch.

## Phase 9 — Study tools

Branch `phase-9-study`.

**Step 9.1 — Quiz me and flashcards**

```markdown
Step 9.1: Quiz me toggle on every summary section (hides the content, shows its cue question, tap/click to reveal); flashcards from key terms, the self-test, the assistant's Flashcards button and "Make flashcard" on selections; a review screen (swipe on iPhone, space to flip on laptop) with Again / Good / Easy.
```

**Check:** review 10 cards on the iPhone; they show up as reviewed on the laptop.

**Step 9.1b — Create a quiz** (Lea, 29 Oct; in Review, next to Quiz me)

```markdown
Step 9.1b: create a quiz from my material, on both devices: Review → New quiz (laptop: a centered panel; iPhone: a full-screen sheet, like the summarize panel in 7.3).
- What it covers: pick the course, then the topic in it (one lecture, a few, or the whole course). Add resources for the quiz (files, slides, notes from the library or uploaded). Add example quizzes or past exams: the new quiz copies their format (the same question types, length and style of wording).
- 10 sliders from 1 to 10, with labelled ends and the value shown, presets and "Save as course default" as for the summary sliders: Difficulty (how tricky) · Number of questions · Definitions · Calculations / exercises · Theory vs. practice · Exam focus (stick to what was flagged "will be on the exam": Exam marks and the professor's exam phrases) · My weak spots (parts I marked Confused or got wrong before) · Trap answers (how close the wrong options are to the right one) · Memory vs. understanding · Detail (big ideas only, or small details too). The numbers go through a small calculator like 7.2's (one module with unit tests): e.g. Number of questions 1 → 5 … 10 → 50, and where sliders pull against each other (Definitions, Calculations, Theory vs. practice) the calculator decides the mix, not the AI.
- Choices: question types (multiple choice, true/false, short answer, fill in the blank, long answer, match pairs, put steps in order, calculation with a numeric answer, checked with a tolerance) · time limit (none, total minutes, or per question) · language (the course's, or another) · answers shown after each question or at the end · explanations with a link to the moment in the recording (a timestamp chip that plays it, 4.6) · hints on or off · grading (a score out of 10, or pass/fail with a threshold) · questions I get wrong come back in the next quiz (and go into spaced review, 9.2).
- Rules: questions only from the chosen lectures and resources (an explanation that adds something is labelled Added context); every question keeps its source (lecture and time, or file and page); resources and past exams go to the AI only with consent, as audio does; long and short answers are graded by the AI against the model answer with a one-line reason, and I can change the grade.
- Data: quizzes (settings, sources, questions), attempts (answers, score, time), wrong answers linked to their question; owner-only like every table. Taking a quiz works offline; making one needs a connection.
```

**Check:** a quiz from two Finance lectures with a past exam attached: question types and wording match the exam; with Exam focus 10 it only asks what was flagged; answer two wrong and they come back in the next quiz; tap an explanation's time and the recording plays from there.

**Step 9.2 — Spaced review and course settings**

```markdown
Step 9.2: spaced review reminders on day 1, 3, 7 and 21 after each lecture (expo-notifications on iPhone), planned backwards from the course exam date when there is one; "Review today" count in the sidebar and Library; course settings screen (subject type, exam format, exam date, summary language, the 10 slider defaults).
```

**As planned (9 Nov, docs/reports/plan-9.2.md):** no subject type in the course settings (Lea: Claude identifies each lecture's subject); built on `phase-10-launch` in three sub-steps (9.2-1 the plan, the count and the lectures card; 9.2-2 course settings; 9.2-3 reminders and Settings → Notifications' switch). Lea added: a "Study reminders for this lecture" switch in the summarize panel (on by default; Save as course default saves it too), and Study reminders… in the lecture's menu.

**Check:** set an exam date two weeks away and see the review plan change. Merge the branch.

## Phase 10 — App Store and web launch

Branch `phase-10-launch`. A rejection costs days, so go slowly here.

**Step 10.1 — Apple's rules inside the app**

```markdown
Step 10.1: add what App Review requires: Sign in with Apple next to email login; account deletion inside the app (Settings > Account) that deletes all my data and files in Supabase; an AI consent screen before anything is sent to an AI service, clearly naming ElevenLabs (transcription) and Anthropic (summaries and assistant) and what is sent (audio, transcripts, notes, photos), with explicit permission (App Review Guideline 5.1.2(i)); in Settings → AI & privacy the consent card from docs/design iphone-08-ai-privacy: "Use AI on my lectures", where the data goes, the date it was allowed, and a switch to withdraw it that is as easy as giving it (GDPR), after which nothing is sent to an AI service until the student allows it again; a reminder before the first recording to check recording is allowed in the class; clear microphone, camera, photo library and notification permission texts in app.json.
```

**Check:** create a test account, give consent, record, then delete the account; everything disappears from Supabase. Withdraw consent in Settings → AI & privacy, then try an AI action: it asks again and sends nothing before the answer.

**Step 10.1b — Legal pages, privacy and accessibility before launch** (Lea, 29 Oct)

```markdown
Step 10.1b: everything the legal texts promise, working before launch, on both devices:
- Legal pages: turn docs/legal into pages of the web version (/privacy, /terms, /refunds, /cookies, /legal), readable without signing in, linked from Settings (both devices) and from sign-up. The bracketed details in docs/legal/README.md are filled in first; the texts are reviewed by a lawyer or gestor.
- Sign-up: a required "I agree to the Terms and Privacy Policy" checkbox, unticked, with both linked; the account can't be created without it, and the date (and the texts' version) is saved with the account. Minimum age 16, as in the texts: asked at sign-up (a date of birth or "I am 16 or older"), and under 16 can't sign up.
- Your data: "Delete my account" (10.1) and "Export my data" (a download on the laptop, the share sheet on the iPhone: documents, notes, marks, transcripts, summaries and settings as files, plus the audio that is still kept) both working before launch, from Settings → Account / Your data, as the texts name them.
- Accessibility: a label for every image and every button that is only an icon (VoiceOver and screen readers); colour contrast checked in light and dark (the token tests extended to every screen's colours); keyboard on the laptop: a sensible Tab order, a visible focus ring, Escape closes menus, popovers and dialogs.
- Privacy by default: shared summaries are private (only invited people, by email; never the audio, the transcript or the slides; access can be taken back); audio auto-delete on by default, 3 days after transcription, as the privacy policy says (not built yet: new lectures are marked `delete_3_days` but no date is set, the review screen starts on Delete manually, and no scheduled job deletes audio whose date has passed; build all three); test fixtures (real lectures, 7.1) kept out of git (`tests/fixtures/` in .gitignore, kept on the Mac only).
- A short data-breach plan in docs/legal: who checks what, how affected users are told, and notice to the AEPD (Agencia Española de Protección de Datos) within 72 hours (GDPR art. 33).
- Transcription is ElevenLabs since 29 Oct 2026 (the consent text, Settings, privacy policy and terms name it; consent was asked again with a new version): the 10.1 consent screen and the AI & privacy card name it too.
```

**Check:** sign up on the web without ticking the box: refused; with it: the date is saved. Open each legal page signed out. Export my data and open the files; delete the account; nothing is left in Supabase. VoiceOver on the iPhone reads every button; Tab through the laptop's library and editor with a visible focus; Escape closes every menu. `git status` never shows a fixture.

**Step 10.2 — Paying for AI**

```markdown
Step 10.2: calculate my real cost per 90-minute lecture from ai_usage on the fixtures and real use, propose a free tier and subscription with prices that cover it, then implement it with Apple In-App Purchase (for example via RevenueCat). The Edge Functions enforce the limits, not the app. The laptop version uses the same account and plan.
```

**Check:** buy the subscription in the sandbox with a test Apple account, and see the limit change.

**Step 10.3 — Pages and store listing**

```markdown
Step 10.3: create a privacy policy page and a support page on the web version, link them in the app, and prepare everything for App Store Connect: App Privacy answers matching exactly what we collect, age rating answers, EU trader status, description, keywords, screenshot list with sizes, and a demo account with sample lectures for the reviewer. Put it all in docs/APP-STORE.md.
```

**Check:** read the privacy policy; it matches what the app really does.

**Step 10.4 — TestFlight**

```markdown
Step 10.4: create the production build with EAS, upload it to TestFlight, and walk me through inviting testers. Set up crash reporting so I see errors from testers.
```

**Check:** the app installs from TestFlight on your iPhone and a friend's.

**Step 10.5 — Beta with classmates**

You: give TestFlight to 5–10 classmates for at least two weeks of real classes. Collect what they report, then:

```markdown
Step 10.5: here is the beta feedback: [paste]. Sort it into must fix before launch / later, then fix the must-fix items one by one, with a new TestFlight build at the end.
```

**Step 10.6 — Launch**

```markdown
Step 10.6: deploy the web version to production on a real URL, submit the iOS build for App Review with the notes from docs/APP-STORE.md, and give me a checklist for launch day and for answering a rejection if it happens.
```

**Check:** Studiply is on the App Store and the laptop version is live.

## When things go wrong

| Situation | What to say to Claude Code |
| --- | --- |
| An error appears | Paste the full error and say: “This happens when I \[what you did\]. Find the cause before changing anything.” |
| It works on web but not on iPhone (or the reverse) | “This works on \[web\] but not on \[iPhone\]. Check platform differences and fix it without breaking the other one.” |
| The change got too big or messy | “Stop. Show me what you changed with git diff --stat, then undo back to the last commit that worked.” |
| You don't understand what it did | “Explain what you just changed in simple words, file by file.” |
| A summary is bad | Paste the summary and what's wrong (“too long”, “missed the formula at 12:30”) and ask it to change the prompt, not the code around it. |
| The session gets slow or confused | Commit what works, type `/clear`, and start again with the phase prompt plus “continue from where docs/AUDIT.md and git log say we are”. |

Three habits that keep the project healthy: commit after every working step, test on the real iPhone (not only the simulator) after every phase, and record a real lecture as early as Phase 5 so you find problems while they're cheap to fix.
