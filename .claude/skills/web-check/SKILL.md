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

**Retired since step 7.3: `ai-flow.mjs`.** Stop & summarize now opens the summarize panel, not the earlier after-recording screen (post-session → Generate notes) that this flow drives, so it fails at Stop. It is kept, not deleted; its successor comes with step 7.4 (the summarize pipeline). The earlier screen is still there for lectures recorded the earlier way (their Summary tab's "Process now"); `flows.mjs` reaches it by its address.

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
- **Frames stop when nobody is at the Mac** (2 Nov, review.mjs): without `--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding` (Puppeteer's and Playwright's defaults, now in `cdp.mjs`), a headless Chrome on macOS could stop drawing frames partway through a run. Every animation then stalls: the splash never fades (its "AUTOMATED STUDY" stays in the page), a card stops half-turned, `img.decode()` never resolves. `launch` also turns on focus emulation.
- **A Chrome left over on the port:** `launch` moves to the next free port (and says so) instead of attaching to it. `close()` asks Chrome to quit, kills it after 3 s, and never lets node wait for it.
- **A check always exits:** close Chrome and drop the user in one `finish(code)`, and call `process.exit`. Run it from `finally`, on SIGINT and SIGTERM, and from a watchdog (review.mjs: 15 minutes).
- **Text that is also in the page:** `click(text)` takes the first visible match in the page's order. A menu item whose words are also in the document (Quiz me, a section's pill) needs `exclude: '.ProseMirror'`.
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

`scripts/export.mjs` (step 4.8a, 9 steps): Export PDF… (This tab / All tabs, Page numbers), the PDF's pages built from the page view: A4 and Letter landscape, every line inside its text area, page breaks, numbers 1…n, each tab from a new page with its name as a Heading 1, the sheet as values, the iPhone bundle making the same pages, Chrome's own PDF one page per page; no two blocks overlap and every block starts where the page view puts it (±1 px, compared at 100 %). Screenshots `export-*.png`, the PDF `export-a4.pdf`. Run `npm run editor:build` first after editor changes.

`scripts/notes.mjs` (step 4.9, 8 steps): seeds an earlier-format note (legacy-note-v1) with a JPEG photo and a PDF, opens the lecture's Summary tab and checks the converted document (every section, KaTeX formulas, Definition callouts, highlights as quote + Added context, Attachments, each block's author), the old row unchanged, no second conversion on reload, the student's typing kept, a regenerated note not reaching the tab, a lecture with its own Summary kept, "This lecture has no summary.", dark and 390 px. Screenshots `notes-*.png` (taken after the splash is gone).

`scripts/spike.mjs` (step 5.1 web, about 2.5 min): a synthetic microphone (1 kHz tone + a 5 ms click every 500 ms) recorded in chunks on `/dev/recording-spike`, each chunk decoded and placed in time from its clicks; prints `RESULT` lines per chunk and per join (GAP / overlap in ms). Restart mode vs overlap 500 ms (overlap must show no gap). transcribe-chunk is answered by the page itself; the check fails if any request reaches it, OpenAI or ElevenLabs. Screenshots `spike-*.png`.

`scripts/recorder.mjs` (step 5.2 web, about 2.5 min): the recorder service on `/dev/recorder?chunk=5&overlap=500`, with a synthetic microphone (a 1 kHz tone).
- **Offline for 16 s** (Chrome's own network emulation): the chunks are kept in IndexedDB `studiply-recorder`, not uploaded.
- **Back online:** they upload in order and the transcript fills in.
- **Pause and resume:** the microphone track is stopped while paused, and a new one opens on Resume.
- **A reload mid-chunk:** the chunk is rebuilt from its one-second pieces, at most about 1 s is lost, and the file decodes.
- **Continue and Stop;** every `audio_chunks` file is decoded to its length.

transcribe-chunk is answered by the page itself; the check fails if any request reaches it, OpenAI or ElevenLabs. It prints `RESULT` lines and saves screenshots `recorder-*.png`.

`scripts/recording.mjs` (step 5.3 web, about 3 min): the recording screens on the 5.2 recorder, with a synthetic microphone (a 1 kHz tone) and the app's real 30-second chunks.
- **The setup (option A):** opened from a folder, the course and folder are preset; the picker lists the course and its folders; **+ New folder** makes "Tema 3".
- **Start:** the lecture is made in Math › Tema 3 with status `recording`; its My notes opens with the red strip (timer moving, waveform, marks greyed out).
- **Leaving never stops it:** the course page and another document still show the strip, and a chunk is uploaded meanwhile.
- **The microphone going away** pauses it, then Resume.
- **At 390 px:** the iPhone recording screen, then back to the course, where the red pill leads back.
- **A reload asks first,** then Continue the interrupted recording.
- **Stop & summarize:** confirm, saving, then post-session. The lecture is `transcribing` with its length, and the chunks are in order with no hole.

transcribe-chunk is answered by the page itself; the check fails if any request reaches it, OpenAI or ElevenLabs. Screenshots `rec-*.png` (1280 and 390, light and dark).

`scripts/notes-live.mjs` (step 5.4 web, about 3 min): live notes on a recording, with a synthetic microphone.
- **Stamps:** three lines typed into My notes a few seconds apart (a bold word via `**…**`, a list item via "- ") each start with a chip at the timer's time (± 1.5 s), in order; an empty line gets none.
- **`note_lines`:** the rows hold the time, the text without the chip and the bold.
- **Playing during the recording:** a chip plays that moment from the browser's own copy while recording goes on, with the quiet headphones line once.
- **At 390 px:** a new line is stamped too.
- **After Stop:** a new line gets no chip, and a chip plays from Storage with the time never going back across a chunk join.

transcribe-chunk is answered by the page itself; the check fails if any request reaches it, OpenAI or ElevenLabs. Screenshots `notes-live-1280`, `-1280-dark`, `-390`, `-390-dark`, `notes-live-playing-1280`.

## Measure the iPhone's chunk joins (step 5.1–5.4, iPhone half)

`scripts/joins.mjs` measures the joins of a lecture the **iPhone** recorded while the laptop played the click track (`docs/recording-test/click-track.html`: a click every 50 ms, a longer beep on each whole second). It reads only: the newest lecture with the given title, its `audio_chunks` rows and files on **local** Supabase (the iPhone's development build uses it), decoded in headless Chrome. Nothing is changed, sent or paid for, and no test user is made.

```bash
node .claude/skills/web-check/scripts/joins.mjs "Join test"
```

- **Per join:** the clicks heard in both chunks (the overlap: about 10 with 500 ms), the clicks heard in neither (audio lost, ≈ 50 ms each), how far the next chunk's `start_ms` is off, and the join from the files' lengths (± the AAC padding, a few tens of ms).
- **Also:** chunk order, clicks missed inside a chunk (a dropout while locked), decoded length against `duration_ms`, the phone's clock drift, and whether the joins overlapped (two recorders) or restarted (iOS refused two).
- **Pause / Continue joins** (a chunk starting exactly where the one before ended) are left out; a jump in the clicks (a call) starts a new stretch.
- Exit code 1 if a join lost audio or couldn't be measured. The whole test, step by step: `docs/recording-test/INSTRUCTIONS.md`.
- It can't be checked without a recording from the phone: there is no browser half.

## Check marks while recording (step 5.5)

`scripts/marks.mjs` records with a synthetic microphone (transcription answered in the page, no paid call) and checks each part:
- **The panels:** ★ Important, ? Confused and Exam from the laptop's strip, each with its time, question, labelled ends and hint.
- **Setting levels:** the slider by click and by keyboard.
- **Saving:** a note, Save mark. The chip goes at the end of the line being written, and its `marks` row has the panel's time.
- **Editing a chip:** a click on it changes its level and note. Remove mark, then Undo, brings back the same row.
- **Special cases:** a mark while paused (at the paused moment), and a mark from another screen (a new stamped last line). Offline, the row arrives once back online.
- **390 px:** each mark's sheet.
- **After Stop:** a chip still edits its level. The recording never stopped meanwhile.

```bash
node .claude/skills/web-check/scripts/marks.mjs
```

Screenshots: `mark-panel-*-1280(-dark)`, `mark-sheet-*-390(-dark)`, `mark-edit-1280`, `mark-removed-1280`, `mark-paused-1280`, `marks-chips-1280(-dark)`, `marks-chips-390`.

`scripts/photos-live.mjs` (step 5.6, 8 steps): board photos during a recording with Chrome's fake camera — Photo board → Take a photo (webcam) puts a thumbnail on a new stamped line at the press time with its `media` row (lecture + time) and Storage file; Choose files… adds several in order; a photo while writing goes after the current line; from another screen, a new last line; offline on the laptop Photo board is greyed out and the recording goes on; at 390 px the Photo tile opens the same menu and the webcam as a sheet; Stop; no paid request. Only Studiply's own photos count as "shown" (ProseMirror adds an empty separator `<img>` after a line ending in a photo). Screenshots `photo-*.png`.

`scripts/record-in-doc.mjs` (step 5.7, 8 steps): Record inside a plain document (button beside the tabs on the laptop, in the header on the phone) turns it into a lecture — the first tab's row becomes My notes with its text, formatting and versions (a renamed tab's old name in the "Before recording" version), then Summary · Transcript, then the other tabs (Tab 2, a sheet) unchanged; same editor instance; new lines stamped, old ones not; a mark and a photo; Stop; cancelling at the microphone leaves the document as it was; recording again into the lecture continues its chunk numbers; Record greyed while another lecture records and offline on the laptop; no paid request. After `focus('end')`, wait until the editor really has focus before pressing keys. Screenshots `record-button-*`, `converted-*`, `record-blocked-1280`.

`scripts/assistant.mjs` (steps 6.2 and 6.3, 15 steps, about four minutes): the study assistant's chat during a real recording (synthetic microphone), with no paid call: `assistant-chat` and `transcribe-chunk` are answered in the page, the assistant with a canned Spanish answer streamed in timed pieces (`meta` with the saved answer's id, `delta`s, `done`; bold, a numbered list, the time [0:20]), so the app's own streaming code reads it, and the `flashcards` mode with JSON cards. Laptop: the panel as desktop-01 ("Knows this lecture up to" once the first chunk is transcribed, "Recording continues", the four chips, send disabled while the box is empty); "Explain the last 10 min" — the bubble with the avatar, "FROM 0:00 TO m:ss", the answer arriving in pieces, bold, the list, the underlined time, Copy · Retry · Add to notes · Flashcards, the request carrying the quick prompt and the recording's time; the chips' scroll area has `color-scheme: dark` in dark mode (its scrollbar was drawn light) and `normal` in light mode, on the laptop and at 390; the time plays in the mini player; Copy, "comes later" for +; Add to notes puts a "From the study assistant · m:ss" box (`ai`, the question first, the time a chip) at the end of My notes, then "Added ✓", not twice; Flashcards shows the proposed cards under the answer (not editable), Save cards → "2 flashcards saved", `flashcards` rows (source `assistant`), no `review_schedule`; Retry in place; Shift+Enter makes a new line, Enter sends; offline (the note, chips and send disabled, the draft kept); the panel closed and opened again reads `assistant_messages`. Since 7.4 it gave its consent, so Stop & generate summary would start the summary: `summarize` is answered in the page too (202, nothing written), and the last step checks no request reached it. On the laptop the app's Undo toast stays in the centre column: a toast over the panel once took the next clicks on the composer. 390: ✦ Ask opens the sheet (iphone-04: handle, pill, "Knows…", "0:00 → m:ss", Add to notes and Flashcards only), a long-press gives Copy · Retry, the handle drags it to full height and back, a tapped time closes it and plays, the recording goes on; after Stop, ✦ in the phone header opens it without the pill; a plain document's panel says it answers about lectures; no request reached the server's functions. Never reload during the recording steps (`b.nav` reloads the page and ends the recording): close and open the panel instead, and open other documents only after Stop. Composites beside the mockups, light and dark: `assistant-compare-1280` (desktop-01), `assistant-compare-1280-panel` (the right panel at its own size), `assistant-compare-390` (iphone-04). Screenshots `assistant-panel-1280(-dark)`, `assistant-sheet-390(-dark)`.

`scripts/ask-claude.mjs` (step 6.3, 9 steps, about two minutes): Ask Claude on a selection and the assistant's Add to notes, with no paid call: `assistant-chat`'s `selection` answers are made in the page as the function's JSON (a different "Explain simpler" the second time), and nothing reaches the server's functions. Laptop (1280, a plain Spanish document with a formula, the assistant panel open): selecting text shows "✦ Ask Claude ▸" at the end of the selection bar; at every width the bar shows all its buttons (it wraps to rows; nothing scrolled away or cut), and with the panel open the bar, the card and its Accept · Reject are fully inside the editor as seen — the pane that scrolls the document, inside the window and left of the panel — checked by bounding boxes, the card in light and dark; Explain simpler → the card under the selection, the range highlighted, Reject changes nothing, asked again Accept replaces the paragraph (now `student`) and one Undo brings it back (BUILD-PLAN's check); Give an example → an Example box (`ai`) after the paragraph; Rewrite section with the text edited before Accept → "the text changed" and Insert below (a "From the study assistant" box, the edit kept); Make flashcard → the cards (not editable) → Save cards → "1 flashcard saved", a `flashcards` row (source `selection`) and no `review_schedule`; what each request carried (mode, file, action, the text with the formula as `$…$`, its paragraph). Lecture 1 after class: the panel's Add to notes puts a "From the study assistant · m:ss" box (`ai`, the time a chip) at the end of My notes, then "Added ✓"; offline, Ask Claude says it needs the internet and sends nothing. 390: the assistant sheet with the saved answer, My notes with the box, Go deeper → the suggestion in a drag sheet (not the card) → Accept: an "Added context" box (`ai`). The selection is set through `window.studiplyEditor` (not by dragging) and the bar must be visible before its button is clicked; clicks on a cut-off button land on the editor and close the bar. Composites beside the mockups, light and dark: `ask-compare-1280-document` (desktop-03), `ask-compare-1280-assistant` (desktop-01), `ask-compare-390` (iphone-06, iphone-04). Screenshots `ask-card-1280(-dark)`, `ask-boxes-1280`, `ask-notes-1280`, `ask-assistant-390`, `ask-notes-390`, `ask-sheet-390` (each with `-dark`).

`scripts/summarize.mjs` (step 7.3, 12 steps, about three minutes): Stop & summarize, the summarize panel, during a real recording (synthetic microphone), with no paid call: `transcribe-chunk` is answered in the page and nothing calls `summarize` (7.3 only saves the request). The check puts in the lecture's material itself: a note line with an Important 8 chip (through `window.studiplyEditor`, then waits until My notes is saved), a question and its answer (`assistant_messages`), and 12,000 transcript words (`transcript_segments`, the spec's example), so the preview reads "≈ 1,440 words · 4 takeaways · 7 questions" at the defaults. Laptop: Stop & summarize opens the panel over the recording (desktop-02: the counts, the 2 × 2 resources with My notes and marks locked on, the four add pills with + From my library marked later, the presets beside the sliders' heading, the 10 sliders at the course's `course_settings` values with their "1 · …" / "10 · …" ends, the note, Save as course default · the preview · Keep recording · Stop & generate summary on one row, the card inside the window) and the timer keeps running; My notes can't be unticked, Questions can; →, End and Home move a slider and the preview follows (1,680 / 3,600 with 5 takeaways / 360 with 3); Exam tomorrow sets all 10 ("15 questions"); Save as course default ("Saved as Math’s default", the 10 columns); + Link (the app's prompt, a `link` media row), + Slides or PDF and + Photos (the browser's file chooser answered with `b.chooseFiles`: a `slides` row with its Storage file, a `photo` row at the recording's time), + From my library says it comes later; Keep recording and Esc close it, opened again it shows the course's defaults. 390: the sheet (iphone-05: one column, the short counts and ends, Save as course default after slider 10, the preview just above Keep recording · Generate). Stop & generate summary: the panel closes at once (the strip shows "Saving…"), then the Summary tab's "Summary settings saved" card with the preview; one `summaries` row (mode `new`, `pending`, `result` null, the lecture, the 10 values, `applied_settings` with the calculator's numbers, the resources ticked and the preview). Step 7.4: with the consent given, Stop & generate summary starts the summary at once; `summarize` is answered in the page (202, nothing written or paid), and the check sees one call with that row. A step sets the row's status by hand and follows the Summary tab card: "Writing your summary" (read again every 5 s), "Summary ready" with its counts and takeaways, "The summary wasn't written" with why and Try again. **Any check that gives `assistant_summary` consent and presses Stop & generate summary must answer `/functions/v1/summarize` in the page, or it starts a real, paid summary on `supabase functions serve`.** Screenshot `summarize-ready-1280`. Another lecture of the same course (`/doc/<id>?tab=summary&summarize=1`, what an item's Summarize opens): Cancel · Generate summary with the saved defaults (BUILD-PLAN 7.3's check). No request reached `summarize`, `transcribe-chunk`, Anthropic or OpenAI. The slider's `data-mark="slider"` element takes focus for the keys. Composites beside the mockups, light and dark: `summarize-compare-1280` (desktop-02), `summarize-compare-390` (iphone-05). Screenshots `summarize-1280(-dark)`, `summarize-390(-dark)`, `summarize-requested-1280`.

`scripts/summary-doc.mjs` (step 7.7, 10 steps, about four minutes): the summary written into the lecture's document, with no paid call: every summary is a finished `summaries` row the check puts in (`status: 'done'`, the 30-min synthetic lecture's summary from `src/test-utils/summary-synthetic-30.json`, its photo id swapped for a real `media` row and Storage file), with a question to the assistant and its answer (`assistant_messages`, the Full answer link); nothing calls `summarize`, Anthropic or OpenAI. Laptop: opening the Summary tab writes the summary in (a `documents` row whose blocks have `sm…` ids; `ai`, the From your notes boxes `student`, the photo `media`), an `ai_generation` version and its 2 flashcards once (source `summary`, `source_ref` the summary). What desktop-03 shows: the green banner the window's full width directly under the top bar, on one line (only "Built from …" may be cut with …), "Built from your notes (all 6 lines, 6 marks) + 30 min of audio · board photos · your questions to the assistant", + Extend with next lecture greyed ("Coming in a later update"); under the title the notes check line ("6 of 6 lines and 6 of 6 marks used · shown in green as “From your notes”" + See them in My notes, the link unbroken), KEY TAKEAWAYS, the section headings "1 · Qué es la Psicobiología" with ▶ 0:00 and chips for HER marks only (Important 3/10, Exam 2/10; no 6/10 chip anywhere: repetitions and assistant questions get none), FROM YOUR NOTES · 0:45, YOU WERE CONFUSED HERE · 9/10 · 24:10, Exam signal, Added context, Your questions during class, Self-test with all 7 answers hidden. The app's own words are English (app UI); Claude's text stays Spanish. An answer's label shows it and hides it again, and the document isn't saved for it. See them in My notes and Full answer are clicked on their first line (a wrapped link's box spans two lines; `b.click` aims at its middle) and opened with the link bubble's Open: My notes; the assistant panel with that question marked (`data-focused`). BUILD-PLAN 7.7's check, faked: two paragraphs edited (the cursor put at a paragraph's end, then typed), a second finished summary with other words and `target: 'summary'`: both edits kept in the row and on screen, the untouched paragraphs written again, a version "Before the summary was written again". A third finished summary with no choice: a "New summary" tab opens with it, the Summary tab unchanged. `?summarize=1`: the panel's "where the new one goes", a new tab by default, Update the Summary tab chosen. 390 (pageless as the iPhone starts: the check stores `{ laptop: { pages: false } }` in `studiply.view`, the web's own view setting, Pages by default even at phone width): no banner; + Extend with next and Quiz me at the bottom, greyed. `clickSelector` taps where an element is without scrolling: the check's `tap()` scrolls it into view first, and every page load waits for the splash screen to go (taps before it land on the splash). Composites beside the mockups, light and dark: `summary-doc-compare-1280` (desktop-03), `summary-doc-compare-390` (iphone-06). Screenshots `summary-doc-1280(-dark)`, `summary-doc-390(-dark)`, `summary-doc-answer-1280`, `summary-doc-full-answer-1280`, `summary-doc-panel-1280`.

`scripts/extend.mjs` (step 7.9, 10 steps, about five minutes): Extend with next lecture, Merge lectures and Make exam pack, with no paid call. The test user has no AI consent, so the app saves each request (a pending `summaries` row) and never starts it; the check plays the server and finishes the row itself with a result in the server's format (`studiply-combined-v1` / `studiply-exampack-v1`), built from the 30-min synthetic lecture's summary (Lecture 1) and a second summary made from it (Lecture 2, "La neurona y la sinapsis"); nothing calls `summarize`, Anthropic or OpenAI (checked at the end). Laptop (1280): the banner's + Extend with next lecture opens the lecture picker (Lecture 1 the base, "The summary it's added to"; Lecture 2 chosen); Continue → the summarize panel in Extend form (its title, "Lecture 1 · … + Lecture 2 · …", WHERE IT GOES with A new Unit summary chosen); Generate → a `unit_summary` file "Math — Lectures 1–2" and an `extend` row with both lectures, `target: 'unit'` and anchors keyed by the request (`sm<8 of its id>-s…`), the page showing the summary card while not started. Finished → the Unit summary written in: a section "n · Lecture 2 · La neurona", an Update callout ("Update · Lecture 2 · 11:00") right after the block it corrects, a Studiply comment mark (author `studiply`, source lecture and ms) on the repeated words, the notes line "… · Lectures 1, 2" with no link, the title "…: Bases biológicas de la conducta", its 2 flashcards once. The comment (document menu → Comments): "Studiply", "Lecture 2 · 18:30 · …", no Edit, no ▶. The Unit summary's menus are a document's (its document menu: Comments, Version history, Export PDF…, Rename…, Move to…, Cut, Add to Favorites, Delete, no lecture items; its tile: Open · Rename… · Move to… · Cut · Add to Favorites · Delete; Delete asks "Delete Unit summary", cancelled). Add to this summary (Lecture 1's document menu → Extend with next lecture…, then the radio): the row on the lecture with `target: 'add'` and anchors = its Summary tab's own block ids; finished → only `x…` blocks added, the new section before the lists, her blocks' words unchanged, a version "Before the next lecture was added". Make exam pack… (the course's title menu): both lectures chosen → an `exam_pack` file "Exam pack · Math"; finished → its first block the italic line "Built from the summaries of 2 lectures (1, 2)" and no notes check box (read from the saved document and as the first `.ProseMirror p`: in Pages view the editor's first child is the page number), then "1 · …" topics with Exam signal boxes, a formula card and the self-test's answers hidden. The document menu helper asserts the menu fits the window (a lecture's is taller than 900 px since 7.9: it scrolls) and matches an item by any line of its text (an item's icon is a line of its own). 390 (pageless via `studiply.view`): the picker as a sheet from + Extend with next, the Unit summary, its comment in the comments sheet, the exam pack. A failed step presses Escape twice so an open menu, dialog or picker can't fail the next steps. Composites, light and dark: `extend-compose-1280`, `extend-compose-390`. Screenshots `extend-picker-*`, `extend-panel-1280`, `extend-unit-*`, `extend-update-1280`, `extend-comment-*`, `extend-unit-menu-1280`, `extend-add-1280`, `exampack-picker-1280`, `exampack-*`.

`scripts/modules.mjs` (step 8.1, 6 steps, about three minutes): the summary's twelve text modules as editor blocks (`studyModule`), with no paid call. The summary is a finished `summaries` row the check puts in: the hand-made fixture with all twelve (`src/test-utils/summary-modules.json`, a synthetic Spanish learning-psychology lecture with no notes and no marks); nothing calls `summarize`, Anthropic or OpenAI (checked at the end). It needs `npm run editor:build` done after any change to the editor's schema or CSS. 1280 in Pages (the check stores `{ laptop: { pages: true, zoom: 'fit' } }` in `studiply.view`): the Summary tab gets twelve `studyModule` blocks in the documents row (origin `ai`, one id each `sm…-sN-bM`), on the page in their sections' order (timeline, cause → effect, key figures · comparison, process, framework · theory, case, argument · worked example, code, vocabulary), each with its drawn label ("FRAMEWORK · DAFO", "CODE · PYTHON"), `role="group"` and an aria-label; the first line is the plain "No notes or marks were taken in class" (no notes box). The look, as SUMMARY-SPEC's module library says: the timeline's 2 px line and dots, cause → effect three stacked boxes with ↓ and the Causes / Event / Effects labels, tables with horizontal rules only and a semibold header, numbered process stages, the framework a 2-column grid, the argument's claim boxed, code monospace with its indentation, the worked example's answer boxed; no module split across a page gap; no module scroll box overflowing (`scrollWidth <= clientWidth + 1`). Page view zooms the page with CSS zoom, so computed lengths come back scaled and borders snapped to device pixels: `near()` accepts n, n × zoom, and n × zoom floored or rounded to whole device pixels (at least 1) divided by zoom. Typing in a framework cell makes that module the student's (origin `student`, an `editedAt`) in the saved row; the others stay `ai`. 390, pageless: every module in order, nothing wider than the screen; no word split inside a table cell (each word's `getClientRects()` on one line; cells' `overflow-wrap`/`word-break` normal); every table box `overflow-x: auto` (a table wider than its module scrolls inside it). Crops of each module come from `Page.captureScreenshot` with a clip, at 390 in a 1600 px-tall window so long tables fit. Composites (no mockup exists; judge against the module library), each module cropped and the page in light and dark (the page itself stays light): `modules-compose-1280`, `modules-compose-390`. A failed step presses Escape twice so nothing left open fails the next one. Screenshots `module-<kind>-1280`, `module-<kind>-390`, `modules-page-1280(-dark)`, `modules-page-390(-dark)`.

`scripts/visuals.mjs` (step 8.2, 6 steps, about three minutes): formulas and graphs from a summary, with no paid call. Each summary is a finished `summaries` row the check puts in: the hand-made fixtures `src/test-utils/summary-calculus.json` (Lecture 1) and `summary-finance.json` (a second lecture, "Tema 2 · Finanzas"); their board photos are drawn on a canvas in the page as JPEG (the `photos` bucket refuses PNG: the app only uploads JPEG), uploaded to `photos` with a `media` row (`image/jpeg`) at their time, and their ids written into the fixture (placeholders `photo-board-1`, `photo-board-2`); nothing calls `summarize`, Anthropic or OpenAI (checked at the end). It needs `npm run editor:build` done after any change to the editor's schema or CSS. Until the charts module draws function plots and model graphs (docs/charts-work-order-8.2.md), each shows its line in its place (`.studiply-graph-later`, "… · drawn in a later update"), never an empty figure or an SVG; once the work order is merged, steps 1, 3 and 4 must change to expect the drawings. 1280 in Pages: Calculus' Summary tab gets three `graph` blocks of kind `function` (origin `ai`, ids `sm…-sN-bM`, `func` = expression, xRange, marks as in the fixture); each shows its line; a click selects the graph (`ProseMirror-selectednode`) and opens no graph form (no "Graph type: Bar" button: function and model graphs are regenerate-only in 8.2); the formula card has its display formula, 2 legend symbols typeset and "When to use: …". Both board photos load, each under the section heading that holds its time ("1 · Funciones cuadráticas", "3 · Asíntotas"), as `image` blocks with origin `media`. Finance: three formula cards titled "Formula", each with 4 legend symbols typeset and a "When to use" line; the line and the bar chart drawn (SVG `<title>` = the takeaway, `<desc>` starting "Line chart" / "Bar chart"); the supply-and-demand graph its line "… (D → right) · drawn in a later update" (the professor's "Demanda" stored as curve `D`); the photo under "1 · Valor futuro y valor actual". No graph or card split across a page gap. 390, pageless: nothing wider than the screen, the lines wrap. Composites (no mockup exists): the cards, graphs and photos cropped, and both pages light and dark (the page itself stays light): `visuals-compose-1280`, `visuals-compose-390`. Two gotchas: the documents row is jsonb, which reorders an object's keys, so stored data is compared with keys sorted (`same()`), never by plain `JSON.stringify`; and photos are found as `.studiply-photo` blocks, never by `img` (ProseMirror puts an empty `img.ProseMirror-separator` after an inline node ending a line: a heading's time chip, a formula). A failed step presses Escape twice so nothing left open fails the next one.

`scripts/summary-pdf.mjs` (step 8.3, 7 steps, about four minutes): a summary's PDF (SUMMARY-SPEC "PDF export") on the laptop, with no paid call. The summaries are finished `summaries` rows the check puts in: the 30-min synthetic lecture's (`src/test-utils/summary-synthetic-30.json`, on Lecture 1, its board photo drawn on a canvas as JPEG and uploaded) and the 8.1 modules fixture (`summary-modules.json`, on a second lecture "Tema 3"); Lecture 1 also gets a Transcript tab row (80 paragraphs, each starting with its time chip, transcriptDoc's shape) for the appendix. Nothing calls `summarize`, Anthropic or OpenAI (checked). It needs `npm run editor:build` after editor changes. As `export.mjs`, the print document is caught as `window.studiplyPrint` (with its `fileName`) and shown in a frame (`#print-check`) to read; Chrome's own PDF of it comes from `Page.printToPDF` with the app's address as `<base>`, and is read as text, object by object: `/Type /Page` count, `/MediaBox`, and each font by name and how it is in the file — `file` (a `/FontFile…`), `type3` (Chrome draws fonts it won't embed as files, e.g. macOS's San Francisco `.SFNS-Regular` and `STIXTwoMath-Regular`, as Type3 fonts whose glyph outlines are in the PDF's `/CharProcs`: embedded too; several Type3 font dictionaries share one descriptor, so counting descriptors against font files is wrong), or `none` (only named; fails). When the print has formulas, a `KaTeX_*` font must be among them: printed with only linked fonts, the formulas came out in their fallbacks (`Times-Italic` for KaTeX_Math, `STIXTwoMath` for KaTeX's MathML copy); the export now puts the faces its formulas use into the print as data. The header and footer are checked against the text lines drawn on each page (text node rects, without page gaps, page breaks and `.katex-mathml`), not the blocks' boxes, which run through the margins when a paragraph is split over two pages. Steps: the options sheet on a Summary tab (Self-test checked, Transcript appendix unchecked, A4 checked and Letter not, no Page numbers row, the hint naming `Math – Lecture 1 – YYYY-MM-DD.pdf`) and My notes keeping 4.8a's dialog; the default export (that file name; page 1's first block the title "Lecture 1", then the meta line; no running header on page 1, `Math` / `Lecture 1` from page 2; `Studiply` / `Page k of n` on every page; header and footer clear of the text; no `.ts-chip`, `[m:ss]` present, no "tap to show"; "Answers" first on a page of the last two, one numbered line per self-test question, no `[data-callout="answer"]`; no callout, formula card, module, graph, photo, table or display formula on two pages unless taller than 80 % of a page — found by the same block's HTML on two pages); Chrome's PDF (as many pages, A4 595.28 × 841.89 pt, fonts embedded); the options (self-test off: no Self-test or Answers heading; the appendix: "Transcript" first on a page after the Answers, `[0:05] La psicobiología…` through `(80)`, header and footer on its pages too; Letter: the print's `@page` 21.59 × 27.94 cm and Chrome's PDF 612 × 792 pt); short tables whole in a summary (the modules fixture's page view has no `tr.studiply-page-gap`, and its PDF no table on two pages); the dialog at 390 (no page wider than the screen) and no paid request; composites of every page (scaled 0.6) and the dialogs, in colour and greyscale (the black-and-white check): `summary-pdf-compose`, `summary-pdf-compose-grey`. A failed step removes the print frame and presses Escape twice.

`scripts/review.mjs` (step 9.1, 7 steps, about four minutes): Quiz me and flashcards, with no paid call. Needs the migration `20261029152000_review_cards` applied locally (a card's review row is made by the database), `npm run editor:build` after editor changes, and the dev server on 8123. The summary is a finished `summaries` row (the 30-min synthetic lecture's, `src/test-utils/summary-synthetic-30.json`) on Lecture 1 (course Math); an assistant card and a Make flashcard card are inserted as rows on the same lecture; nothing calls `summarize`, Anthropic or OpenAI (checked). Steps: opening the Summary tab saves the summary's cards (its flashcards, glossary terms as `kind` term, self-test as `kind` question; one per front, case and `**` ignored), each due at once with `reps` 0, and opening it again adds none; Quiz me in the document at 1280 (a `.studiply-quiz-pill` per `h2[data-cue]`; the document menu's "Quiz me" puts a `.studiply-quiz-cue` in every section and hides its blocks (`.studiply-quiz-hidden`, display none); `.studiply-quiz-reveal` shows one; "Show all sections"; a pill alone; the documents row's `updated_at` never changes); Review at 1280 (no sidebar; the top bar reads "Review today · Math › Lecture 1"; Flashcards selected; "Card 1 of N" with N the cards due today in the database, "From your marks: …"; the front's label TERM / QUESTION / FLASHCARD and "Click to flip"; Again / Hard / Good / Easy showing 1 min / 1 day / 3 days / 7 days; Space flips to ANSWER and "From Lecture 1"; key 3 writes Good (reps 1, interval 3, due in 3 days ± 2 min); Again writes due in a minute and the session grows to "Card 3 of N+1"; Hard 1 day and Easy 7 days; → skips without writing `last_reviewed_at`; Delete card trashes the card and removes its review row, the UNDO toast restores both; key 3 until "All done for today"; at most 1 still due (the restored card)); Quiz me at 1280 ("Question 1 of M" for the self-test's M questions; the first question from a mark shows `[data-quiz-chip]` "Exam 9/10 · from 06:40"-style; Show answer puts `[data-quiz-answer]` in the card; Next question hides it); 390 (three new cards inserted; "N due today"; the label ends " · MATH"; "Tap to flip"; the swipe hint; no intervals on the buttons; a mouse drag of 60 % of the card's width skips it (no review written); a tap flips; the Summary tab's dark `[data-summary-buttons="quiz"]` quizzes every section and reads "Show all", again shows them); composites beside the mockups, light and dark: `review-compose-quiz` (desktop-07), `review-compose-cards` (desktop-08), `review-compose-iphone` (iphone-10). Ratings are typed as key events (`chord`, with the key's code), not clicks, where the step says so; after a click the screen drops the focus so Space never presses the clicked button again.

`scripts/docx.mjs` (step 4.8b, 13 steps, about five minutes): the Word export and import. First the formula-picture spike: each formula's picture in the exported .docx is compared with a 2× screenshot of the live formula's own box (KaTeX's `.katex-base` pieces, each as tall as its strut, with 1 px around: the box the export crops to; never the `.katex` element, which inline is only the font's line and cuts a fraction off) — the live formula is screenshotted at device scale 2 (the picture's own 2×, not a 1× shot enlarged); dark pixels the same size within 8 %, and ≥ 0.7 of all dark pixels in both have ink in the other within 1 px (each aligned by its ink, never scaled: a strict pixel overlap on a ~95 × 40 px formula mostly measures anti-aliasing), the live screenshot not cut at its edges, the picture the size of that box within a pixel and drawn at twice its placed size, the formula filling at least 80 % of its picture, and the inline formula lowered in Word (`w:position`) by the live formula's depth below its baseline within 2 half points; the pictures are saved as `spike-*.png` and shown side by side (`docx-spike-formulas`); a failed picture's reason is in the message (`window.studiplyDocx.reasons`). Then: Export Word… opens the export dialog with Word chosen; the downloaded "<title>.docx" unzipped and read (Title / Heading styles, Word lists, the checklist, the table's cell colour, the page break, A4 and its margins, the footer's page field, the callout label, four pictures, the graph at 2×); All tabs (a section per tab with its name as a Heading 1, the sheet as values); a .docx made by the check with the docx library imported through Upload into a folder and dropped on a sidebar course (a document named after the file, content as in the file, the picture a photo with its media row and Storage object, the note listing the header, the comment and the colours); an old .doc refused; a round trip of the exported file; a transparent logo (transparent black around a red square) on white everywhere, read back from Storage: imported in a Word file, put straight into a document (Insert → Image) and uploaded to the library; 390 (the dialog and the note fit); the iPhone bundle's picture drawing, flattening and import (needs `npm run editor:build`; the standalone bundle page has no app stylesheet, so its text is 16 px and the picture is drawn at that size). Screenshots are taken of the window as it is: `captureBeyondViewport` makes the window as tall as the page, the app lays itself out again, and the element moves. After adding a `.web.ts` beside an existing file, restart the web dev server: Metro keeps resolving the old file. The docx, JSZip and mammoth libraries are loaded from the repo's node_modules (`createRequire`). Downloads go to `<out>/downloads`. Screenshots `docx-dialog-word-*`, `docx-import-note-*` (1280 and 390, light and dark), `docx-imported-1280`.
