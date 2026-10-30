---
name: web-check
description: Drive the Studiply web app in headless Chrome against local Supabase to check that a change works in the browser — menus and dialogs (right-click, long-press, prompts), library actions, the recording flow — with screenshots. Use after changing screens, dialogs, navigation or services, before telling Lea what to retest on the web.
---

# web-check — run the web app in Chrome and check it

A small headless-Chrome driver over the DevTools protocol (`scripts/cdp.mjs`, Node's built-in WebSocket, the installed Google Chrome; no Playwright or other dependency), a throwaway local test user (`scripts/testuser.mjs`), and the main flows (`scripts/flows.mjs`).

It only runs against **local** Supabase: `testuser.mjs` reads the service key from `supabase status` at run time and refuses any other URL. Nothing is stored or printed.

## Before you start
- Docker is running, `supabase start` is up. For AI steps also `supabase functions serve`.
- Port 8123 is free (Lea's own Expo runs on 8081; leave it alone).

## Run the flows

1. Start a web dev server of your own, in the background:
   ```bash
   CI=1 BROWSER=none npx expo start --web --port 8123
   ```
   `CI=1` means **no reloads**: after changing code, stop and start it again.
2. Wait until it serves (poll; don't sleep a fixed time):
   ```bash
   for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:8123 && break; sleep 1; done
   ```
3. Run the checks (2–3 minutes; the first page load bundles the app):
   ```bash
   node .claude/skills/web-check/scripts/flows.mjs
   ```
   It prints `PASS | step` / `FAIL | step | reason` lines, any `window.alert/confirm` dialogs and console errors, and the screenshot folder. Exit code 1 on any failure.
4. **Look at the screenshots** (Read the PNGs in the printed folder, default `<os tmp>/studiply-web-check/shots`). A step can pass while the page looks wrong; failures save `fail-<n>.png`.
5. Stop the server: `lsof -ti:8123 -sTCP:LISTEN | xargs kill`.

The test user and its library, rows and Storage files are deleted at the end, also when a step fails.

## Check the app shell (layout)

`scripts/layout.mjs` (about a minute): the laptop shell per kind of screen (Library: top bar with search and Record + sidebar; a note: + the assistant panel; Settings: no panels), collapsing remembered after a reload, resizing 1280 → 1023 → 1280 on the same screen, and at 390 px the five tabs with Record raised in the exact middle. Screenshots `layout-*.png`; compare them with `docs/design/`.
```bash
node .claude/skills/web-check/scripts/layout.mjs
```

## Check the shell's real data

`scripts/shell-data.mjs` (about two minutes): favorites (`starred_at`), an exam pack, a note and a due review are inserted with the service role, then it checks the sidebar counts and Review today badge, Recent / Favorites / Exam packs, a note's top bar (Course › title, "Saved · time") and its course expanding in the sidebar, the crumb and folder links, Record preselecting the course, Add to / Remove from Favorites with Undo (checked in the database), also from the sidebar's right-click menus and on a lecture's photos (Project Files, the note, post-session; "Photo 2 · Lecture 1" in Favorites opens the lecture), that favorites don't change `updated_at` or the Recent/course order, and the iPhone chips and long-press menu at 390 px.
```bash
node .claude/skills/web-check/scripts/shell-data.mjs
```

## Check the look and feel (step 2.3)

`scripts/look.mjs` (about three minutes): light and dark (it switches `prefers-color-scheme` with `Emulation.setEmulatedMedia`) — the card and gradient colors, Settings → Appearance overriding the system and surviving a reload, every icon-only button named and at least 44×44 at 390 px, and the keyboard shortcuts (⌥R, ⌥⇧N, ⌥N, /, ?, Esc; nothing while typing in a field). Screenshots `look-*.png` in both appearances at 390 and 1280.
```bash
node .claude/skills/web-check/scripts/look.mjs
```

## Check drag and drop in the library (step 3.3)

`scripts/library-dnd.mjs`: the browser's own drag through Chrome's drag interception (`htmlDrag(from, to, { midway })`; a PDF "from Finder" with `htmlDrag(null, to, { files: [path] })`). A PDF down three levels of folders and back up through the breadcrumb, with Undo (toast) and ⌘Z (`chord({ code: 'KeyZ', key: 'z', meta: true })`); a folder refused on itself and on its own subfolder (no dashed highlight, nothing moves); drops on a sidebar course, a sidebar folder and Trash; a lecture photo dropped on a folder (it becomes a library file) and its combined Move to…; "Coming soon" for files from the computer. The dashed highlight is read mid-drag from the target's computed `border-style`. Every result is checked in the database. The iPhone's gesture drag can't be checked here (Lea tests it).
```bash
node .claude/skills/web-check/scripts/library-dnd.mjs
```

## Check the library grid (step 3.2)

`scripts/library-grid.mjs`: in a course, New folder named in place (Enter saves, Esc cancels, clicking elsewhere saves), Sort, a click selects and a double-click or Enter opens, a nested folder and the breadcrumb, Rename in place from the right-click menu (all checked in the database), and at 390 px the list view remembered after a reload and the long-press menu. On the web a single click selects a tile; open it with `doubleClick(text)`.
```bash
node .claude/skills/web-check/scripts/library-grid.mjs
```

## Check the "+ New" menu (step 3.2 feedback)

`scripts/new-menu.mjs`: the sidebar New menu anchored under its button, greyed-out items with their hints outside a course, the New course dialog next to the button (name + colour → created and opened, Esc cancels), New folder and Record inside a course, no "Project" text left on the record setup, the Library menu and Search, and at 390 px the Library + menu and dialog. Click menu items with `clickItem(text)`: buttons with the same text under the menu's overlay come first in the DOM.
```bash
node .claude/skills/web-check/scripts/new-menu.mjs
```

## Check the item and empty-space menus (step 3.2 feedback)

`scripts/item-menus.mjs`: the sidebar's right-click menu for a course, folder and lecture equals the grid's; Rename…, Add to Favorites and Delete (+ Undo) from the sidebar; the empty-space menu in a course (right-click; long-press at 390 px), its New folder, Sort by… and Record; a right-click on a tile still shows the tile's menu.
```bash
node .claude/skills/web-check/scripts/item-menus.mjs
```

## Check menus, uploads and Cut / Copy / Paste (step 3.4)

`scripts/library-menus.mjs`: Upload through the browser's file picker (`chooseFiles(paths, trigger)`: Chrome's file-chooser interception, then `DOM.setFileInputFiles`), a Finder PDF dropped on a sidebar course, Cut / Paste and Copy / Paste (a copy has its own Storage object), Move out, the greyed-out items' hints, ⇧F10 / arrows / Enter / Esc in a menu, ⌘X / ⌘V (a synthetic `paste` event), and at 390 px the "…" button. Move between folders **inside the app** (double-click a folder, click a breadcrumb): `nav()` reloads the page and empties the app's clipboard.
```bash
node .claude/skills/web-check/scripts/library-menus.mjs
```

## Check the title's menu (step 3.3 feedback)

`scripts/title-menu.mjs`: the course or folder title (with ⌄) opens the menu of the course or folder you're in (click, right-click; tap at 390 px): Rename… (the title follows), Add to Favorites, Delete (up one level, Undo), Move to… another course (the screen follows), and deleting the course (back to the Library, Undo). Checked in the database.
```bash
node .claude/skills/web-check/scripts/title-menu.mjs
```

`scripts/settings.mjs`: Settings in sections. Laptop: `/settings` opens Account beside the menu; every section opens from the menu (highlighted, read from the computed background `colors.accentLight`) at its own route and holds every setting moved from the old General, Manage Account and Security screens, found by name (sections that load first are polled for up to 8 s); Your data → Recently Deleted in the right column with "‹ Your data". 390 px: the list's rows by `aria-label` ("Summaries, Standard", "AI & privacy, 0% used today"), a page with "‹ Settings" (`[aria-label="Back to Settings"]`) and back, the profile card, Sign out.

```bash
node .claude/skills/web-check/scripts/settings.mjs
```

`scripts/trash.mjs`: Recently Deleted with rows trashed by the service role (a folder and its lecture with the same `deleted_at`, as the app does): each row's kind and place ("PDF · from Math › Funcions", "Deleted today · 30 days left"), the lecture deleted with its folder not listed on its own, Restore with its toast ("Restored 'Lecture 1' to Math") and Undo, the library showing it at once after "‹ Back to library" (sidebar count, course grid), restoring a folder bringing its lecture back, Delete forever (row and Storage file gone) and Empty. Restore buttons are found by their label (`[aria-label="Restore <name>"]`). Laptop Settings pages have no sidebar.

```bash
node .claude/skills/web-check/scripts/trash.mjs
```

`scripts/search.mjs`: a lecture's transcript, note and a PDF are inserted with the service role, then "filogenetico" (no accent) must find the transcript line ("Transcript 18:22"), the summary, the key-concept term and the PDF title, never the trashed lecture; the count line, the marked word (read from the computed background colour `colors.found`), the chips, opening the transcript hit (the note's URL has `find` and `at`, the word is marked and on screen), opening counting for Recent without moving `updated_at`, and the page at 390 px. Rows are found by their `aria-label` ("Clase 4, Transcript 18:22"). The `files` trigger sets `updated_at` to now() on every edit, so a check can't backdate it; edit another file later instead.

```bash
node .claude/skills/web-check/scripts/search.mjs
```

## Check documents (step 4.3)

`scripts/documents.mjs`: New document in a folder (the New menu) opens with its title selected; the title and the text save themselves ("Saved ·", the `files` / `documents` rows, a block with origin student and its time); a block written by "another device" (service role) appears within a few seconds while the local text stays; leaving (inside the app: a page reload cuts the save short) keeps a session version; version history: name a version, restore an older text ("Before restore" kept); thinning keeps a named old version and a day's last edit; a lecture: tabs, the earlier-format notes card with Open notes (→ `/note/`), the Transcript tab made from the segments with chips (origin media); 390 px and dark mode (the page stays white).

```bash
node .claude/skills/web-check/scripts/documents.mjs
```

## Check inserting (step 4.5)

`scripts/inserting.mjs`, checkpoint A:
- **Colour picker:** the grid (10 colours × 6), a shade, More colours… with a hex, Automatic.
- **Recent colours:** saved to the account's `profiles.preferences`, and a colour written there by "another device" (the service role) shows after a reload.
- **Links:** ⌘K, `uned.es` completed, the bubble (Open · Edit · Remove), `javascript:` refused.
- **The toolbar:** the ⌄ row remembered after a reload; in a narrow window, tools move into it.
- **Tables (after test A), all with real clicks:**
  - inserted on the last line with a typed size (6 × 4), then a click below it and typing;
  - the floating bar (rows, columns, colour, header, ⋯ → Table size…, 60 lowered to 50);
  - right-click in a cell: delete row, delete column; drag across cells, merge, split;
  - hover handles: "+" between rows, a column grip then delete column;
  - the "+" with the real mouse (`mouseMove` in small steps, drifting off the line like a hand): from a cell to the row "+", the column "+" and the last row's "+" from below the table; it must not disappear on the way, be under the pointer and 24 px, and insert when pressed there; leaving the table, the handles stay a moment (300 ms) then go;
  - a table at the very top: Enter in its first cell, then ↑ (the gap cursor), make a line above;
  - two copies open (a second Chrome on port 9334): a table deleted on one is gone on the other and stays gone after the other types;
  - the iPhone bundle reads the same table and draws the bar (the check copies the editor's styles into that page, as the app injects them).
- **Part B (checkpoint B), photos:** the Image button through Chrome's file chooser (`chooseFiles`), then the `media` row, the Storage object and, after a reload, the picture from its signed link; a PNG dropped on the page (`htmlDrag` with files; it must not split the line it lands on) and a pasted screenshot (a `ClipboardEvent` with a `File`); a corner handle dragged (the width saved in %); the iPhone bundle's placeholder and its `photo-need` message (caught through a fake `ReactNativeWebView`). The test PNG is made by the script (`makePng`).
- **Part B, formulas:** ∑, typing the compound-interest formula (one formula in the text, changed as it is typed), the preview, Display, Done, KaTeX's fonts loaded (none failed; KaTeX's own `@font-face` rules stay "unloaded" on the laptop because ours replace them); a click on a formula opens it, Remove; the iPhone bundle draws inline and display formulas with its fonts.
- **Part B, comments:** at 1800 px (room for the margin with the assistant open) a comment's card sits level with its words, Resolve hides it; at 1280 ⌘⌥M, a click on the words opens the card, Edit, Delete (the app's confirmation); the document menu's Comments, with Resolved.
- **Part C (after test B):** photo layout from the photo bar (the next paragraph's first character must sit beside a wrapped photo), centring, In line, the right-click menu; the selection bar above a real mouse selection (B, Highlight, Comment, Link) and below the selection on a touch screen (`Emulation.setTouchEmulationEnabled` + `pointer: coarse`, set before the page loads); typing `$x^2$`, "$5 and $10", `sqrt(x)` then the Make formula chip; a finger (`Input.dispatchTouchEvent`) dragging a photo's corner on the iPhone bundle. The iPhone bundle's page gets the laptop page's editor styles (`PAGE_CSS`), plus the iPhone's own side margins.
- **Screenshots:** `ins-*.png`.

Tools hidden behind ⌄ aren't in the page: open it (`More tools`) before clicking them. Seed documents through the editor (or with every default attribute): hand-written JSON without them behaves like content from outside, which is what the defaults fix is about.

```bash
node .claude/skills/web-check/scripts/inserting.mjs
WEB_CHECK_ONLY='real mouse' node .claude/skills/web-check/scripts/inserting.mjs   # only the steps whose name contains this
```

## Check formatting (step 4.4)

`scripts/formatting.mjs`:
- every toolbar control (by its `aria-label`) and Google Docs' shortcuts, read back from the document JSON;
- ⌘⇧R and ⌘⇧J do the editor's action, their keydown is blocked from Chrome and the page isn't reloaded; ⌘⇧V's paste (sent while the keys are down, as a browser does) goes in as plain text and is blocked from the browser;
- the paste samples in `src/editor/paste/__tests__/clipboard.json` (Google Docs, Word, Word with Title, nested lists and a page break) lose nothing, and give the same document in the laptop editor and the iPhone bundle;
- the Psicobiología page rebuilt with the toolbar, staying on screen across the 1024 px width; screenshots `fmt-*.png`.

```bash
node .claude/skills/web-check/scripts/formatting.mjs
```

## Check Studiply's blocks (step 4.6)

`scripts/blocks.mjs`: each callout from Insert ▾ → Callout, typed in (label, fill, border); a click on a label (Level); mark chips (Insert ▾ → Mark, a click to change, Remove); a timestamp typed in a prompt; the iPhone bundle at phone width with all seven kinds (each kind's label and fill, then typing in each box keeps its kind, level and text), screenshot `blocks-iphone`; then Change to and Remove callout (after the iPhone step, so the iPhone sees all seven); the selection bar (Mark ▸ and Time ▸ put their chip after the dragged words, Callout ▸ boxes the paragraph with them; in the iPhone bundle at phone width with touch emulated: below the words, the three in a second row, nothing scrolling sideways; screenshots `blocks-selection-laptop` / `-iphone`). A drag over words that are already selected starts a text drag, not a new selection: put the cursor elsewhere first; a lecture with a recording made in the check (two 5-second WAV tones uploaded to local `audio-chunks` with their `audio_chunks` rows): a click on its 0:07 chip plays from 0:07 in the second piece (the player's "At 0:07 of 0:10"), +10 s, and a blank document's "This document has no recording."

```bash
node .claude/skills/web-check/scripts/blocks.mjs
```

`inserting.mjs` also checks the formula library (step 4.7c): Insert ▾ → Formula from the library, the search narrowing the list, four cards (title, KaTeX formula, legend symbols), a card's formula edited through the formula editor with its legend kept, and the iPhone bundle at 390 px. Screenshots `ins-formula-library-1280`, `ins-formula-cards-1280`, `ins-formula-cards-iphone-390`. The iPhone's formula sheet with its library: `/dev/editor-preview?show=formula`, then From the library. It also checks graphs (step 4.7d): Insert ▾ → Graph, typing values and + Row in the form, Bar / Line / Pie / Scatter each redrawn (the charts module's SVG and its title), Done and a click reopening the form, the iPhone bundle at 390 px; screenshots `ins-graph-form-1280`, `ins-graph-iphone-390`. The iPhone's graph sheet: `/dev/editor-preview?show=graph`.

## After the simplicity pass (before 4.6)

- Tools that moved into menus: **Insert ▾** (its items are labelled "Insert table", "Insert image", "Insert formula", "Insert comment", "Insert link", "Insert page break"), **Align ▾** ("Align left", "Align centre", "Align right", "Justify"), **View ▾** (Pages / Pageless and the zoom; "Fit to window"). `inserting.mjs`'s `toolbarTool()` opens Insert first; `formatting.mjs` opens Align. Indent is "Less indent" / "More indent".
- The photo bar is **compact** (`studiply-photo-bar-compact`: one "Layout…" button, aria-label "Photo layout") wherever it doesn't fit, e.g. the 1280 px window with the assistant open; the photo step then uses Layout… and its menu.
- The iPhone's keyboard toolbar and Page setup sheet can be screenshotted at `/dev/editor-preview?show=toolbar` and `?show=pagesetup` (development only; open the toolbar's second row with "More tools").

## Check the page view and zoom (step 4.5b)

`scripts/pages.mjs` (a 10-page document of headings, long paragraphs, lists, a 28-row table, a formula and a page break):
- Pages by default on the laptop: the page count, every line of text inside its page's text area (rects against the A4 geometry), a paragraph split across a gap, the page break starting a page, "Page n of m" following the scroll;
- Pages ↔ Pageless and ⌘+ to 150 % remembered after a reload, ⌘0, the zoom menu's Fit; at 150 % a real click lands on the letter under it and typing goes there;
- the table's hover handles on a later page (a gap drawn as a table row);
- the iPhone bundle at 390 px with touch: Print layout fits the width, the scrolling label, a pinch (WebKit's gesture events, dispatched), nothing opaque behind the pages, a Letter landscape setup still fitted;
- pages on the gradient (after test D): the colour in the gap between two pages, read from a 1 × 1 screenshot (decoded with Node's zlib), matches the gradient beside the page and is neither grey nor white, in light and dark; one scroll area as wide as the centre pane;
- page setup: the dialog (… → Page setup…), the sheet drawn from it, the `documents.page_setup` row, a reload, typed and lowered margins, a change on the server shown within the document's check, Set as default on the profile.

```bash
node .claude/skills/web-check/scripts/pages.mjs
```

## Run the AI flow (recording → transcript → notes → clarify)

`scripts/ai-flow.mjs` records about 12 s of a spoken lecture (macOS `say`, played as the page's microphone), stops, generates notes through both consent dialogs, highlights a sentence and asks Clarify, confirms, opens the note, and checks the database (transcript, confirmed note with its clarification, lecture `ready`, consent rows, `ai_usage`).

- **Real** (default): needs `supabase functions serve` with the keys in `supabase/functions/.env`. Calls ElevenLabs Scribe v2 (the transcription default since 29 Oct 2026; `ELEVENLABS_API_KEY` needed) and Claude: **about $0.05 per run** — run it when the AI path changed, not as a routine check.
  ```bash
  node .claude/skills/web-check/scripts/ai-flow.mjs
  ```
- **Simulated** (free): start the dev server with `EXPO_PUBLIC_MOCK_AI=1 CI=1 BROWSER=none npx expo start --web --port 8123`, then
  ```bash
  WEB_CHECK_MOCK=1 node .claude/skills/web-check/scripts/ai-flow.mjs
  ```
  It expects no consent dialogs, no `ai_consent` rows and no `ai_usage` rows.

## Writing a new check

Copy the pattern of `flows.mjs`:

```js
import { launch } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const user = await makeUser();          // confirmed user + signed-in supabase client
const data = await seed(user.client);   // Math (folder Funcions, Lecture 1), Science
const b = await launch();               // fresh Chrome profile every time
try {
  await b.signIn('http://localhost:8123', user.email, user.password);
  await b.click('Math', { button: 'right' });   // right-click by visible text
  await b.waitText('Rename', { exact: true });
  await b.shot('my-check');
  const { data: row } = await admin.from('courses').select('name').eq('id', data.course.id).single();
} finally {
  await b.close();
  await dropUser(user.id);
}
```

Driver API: `launch({ micWav, width, height })`, `resize(width, height)`, `nav(url)`, `waitText(text, {exact, timeout, exclude})`, `hasText(text, exact)`, `click(text, {button: 'right', holdMs, exact, nth, exclude})`, `clickAt(x, y)`, `clickSelector(css)`, `fill(css, text)`, `type(text)`, `press('Enter' | 'Escape' | 'Tab')`, `chord({ code, key, alt, shift, meta, ctrl, text })`, `doubleClick(text, {exact, nth, exclude})`, `mouseDrag(from, to, { steps, midway })`, `mouseMove(from, to, { steps, pauseMs, midway })` (no button held: hover effects see every position), `pressHere({ x, y })` (a click without moving first), `htmlDrag(from, to, { files, midway })`, `onEvent(method, fn)` (keys with modifiers, e.g. ⌥R is `{ code: 'KeyR', key: '®', alt: true }`), `shot(name)`, `evaluate(js)`, `errors()`, `dialogs` (native browser dialogs seen), `signIn(base, email, password)`.

Check results in the database with `admin` (service role, local only), not just on screen.

## Gotchas (all hit while building this)
- **The default window (1280×900) is the laptop layout**: the sidebar repeats course names, so clicks on them pass `exclude: '[data-testid=sidebar]'`. The shell parts have test ids `top-bar`, `sidebar`, `assistant-panel`, `document-header`, `section-list`, `sidebar-current` (the highlighted tree item). The open course's tree repeats folder and lecture names in the sidebar too. Below 1024 px the tab bar shows instead.
- **Fresh profile every launch**: a kept profile restores the previous run's session (for a user that no longer exists) and skips sign-in.
- **Text is matched as rendered**: labels styled with `textTransform: 'uppercase'` read as `UNDO`, not `Undo`.
- **Off-screen elements**: the driver scrolls the target into view before clicking (wide windows make the square course cards very tall).
- **Start Recording is disabled until a title is typed** (`input[placeholder^="e.g."]`). The microphone is Chrome's fake device (a beep once a second, which Whisper heard as "you"; Scribe may hear nothing); the recording uploads as `.webm`.
- **Real speech**: `launch({ micWav })` replaces getUserMedia with a Web Audio stream of the file. Chrome's own `--use-file-for-fake-audio-capture` stays silent in headless mode, whatever the WAV format.
- **Summary sentences are `<span>`s on the web** (nested Text); other text is in `<div>`s.
- **A full reload shows the splash screen for ~2 s**; wait before a screenshot (text checks pass underneath it, the screenshot shows only the splash).
- **`editor.commands.focus()` right after a page load doesn't take the focus** in the app page (headless Chrome hasn't focused the document yet): click into `.ProseMirror` with `clickSelector` instead. In the standalone iPhone bundle it works.
- **Shortcuts with ⌥ or ⇧ need `keyCode`** (`chord({ code: 'Digit1', key: '¡', meta: true, alt: true, keyCode: 49 })`): on a Mac ⌥1 types "¡", and editors find the shortcut from the key code. `chord` releases Shift itself; a raw `Input.dispatchKeyEvent` with Shift must send its own Shift keyUp (keyCode 16), or ProseMirror thinks Shift is still down and pastes everything as plain text.
- **`type()` inserts text without key presses** (`Input.insertText`): no `keydown`. Where a key press matters (the editor's typing time, shortcuts), use `chord({ code: 'KeyE', key: 'e', text: 'e' })`.
- **Killing a check midway leaves its Chrome (port 9333) and its `ui-…@test.dev` user**: stop that Chrome and drop the user with `dropUser` before the next run.
- **On the web, Alert with buttons, Alert.prompt and ActionSheetIOS do nothing.** The app uses `src/components/dialogs` (a lint rule enforces it); a missing menu usually means something bypasses it.
- **TouchableOpacity drops an `onContextMenu` prop on the web**: right-click menus are wired through `menuTriggerProps`' ref.
- iPhone behaviour (native action sheets, Alert.prompt, the real microphone) can't be checked here; list it for Lea to retest.

`scripts/tabs.mjs` (step 4.7b, about two minutes): a plain document with one tab and "+ Add tab"; + adds "Tab 2" (name prompt, opens with its own text); rename from the right-click menu and by double-clicking the open tab (nothing in the tab row gets text-selected); drag a tab to the front (only its own position changes); delete and Undo; a lecture's My notes · Summary · Transcript first and fixed, an added tab after them; a reload keeping names and order; at 390 px the row scrolls sideways with no tab under "+", long-press → Move left, Delete and Undo. Screenshots `tabs-*.png` (1280 and 390, light and dark). The recording steps in `flows.mjs` need `supabase functions serve` running.

`scripts/sheets.mjs` (step 4.7e, 16 steps, about five minutes): "+ Add tab" → Spreadsheet; a loan table whose PMT, NPV and IRR match Excel within rounding; Excel errors and their explanation line; keyboard moves and editing; bold kept after a reload; another device's cell merged while typing; versions and Restore; pointing (clicks and drags add references), autocomplete and the help line with the current argument in bold, the list never scrolling the card; the fill handle ($ fixed); Undo/Redo; insert/delete rows and columns with references moving; copy/cut/paste (tab-separated in and out); numbers rounded to fit, never "…"; at 390 with touch emulated, the bar under the grid, taps and the range dot, the fill by finger, long-press menus, the edited cell kept above the list. Screenshots `sheets-*.png`. Measure a target cell before the handle you drag to it (bringing a cell into view scrolls the grid).

`scripts/writing.mjs` (step 4.7, 19 steps): find & replace (⌘F, ⌘⇧H, match case, whole words, ↑ ↓, Replace, Replace all saved, one ⌘Z brings it all back), the word and character count line (whole and selection) and "Page n of m" as pills under the page that never cover text (1280, 900, 390, light and dark, Pageless), the outline (⌘⌥A, beside the page at 1440, over it when there's no room, following the cursor, a click jumps), the Document menu's Tools, a sheet tab without these tools. Screenshots `writing-*.png`. After changing the editor, run `npm run editor:build` so the iPhone bundle has it.
