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

`scripts/layout.mjs` (about a minute): the laptop shell per kind of screen (Library: top bar with search and Record lecture + sidebar; a note: + the assistant panel; Settings: no panels), collapsing remembered after a reload, resizing 1280 → 1023 → 1280 on the same screen, and at 390 px the five tabs with Record raised in the exact middle. Screenshots `layout-*.png`; compare them with `docs/design/`.
```bash
node .claude/skills/web-check/scripts/layout.mjs
```

## Check the shell's real data

`scripts/shell-data.mjs` (about two minutes): favorites (`starred_at`), an exam pack, a note and a due review are inserted with the service role, then it checks the sidebar counts and Review today badge, Recent / Favorites / Exam packs, a note's top bar (Course › title, "Saved · time") and its course expanding in the sidebar, the crumb and folder links, Record lecture preselecting the course, Add to / Remove from Favorites with Undo (checked in the database), also from the sidebar's right-click menus and on a lecture's photos (Project Files, the note, post-session; "Photo 2 · Lecture 1" in Favorites opens the lecture), that favorites don't change `updated_at` or the Recent/course order, and the iPhone chips and long-press menu at 390 px.
```bash
node .claude/skills/web-check/scripts/shell-data.mjs
```

## Check the look and feel (step 2.3)

`scripts/look.mjs` (about three minutes): light and dark (it switches `prefers-color-scheme` with `Emulation.setEmulatedMedia`) — the card and gradient colors, Settings → General → Appearance overriding the system and surviving a reload, every icon-only button named and at least 44×44 at 390 px, and the keyboard shortcuts (⌥R, ⌥⇧N, ⌥N, /, ?, Esc; nothing while typing in a field). Screenshots `look-*.png` in both appearances at 390 and 1280.
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

`scripts/new-menu.mjs`: the sidebar New menu anchored under its button, greyed-out items with their hints outside a course, the New course dialog next to the button (name + colour → created and opened, Esc cancels), New folder and Record lecture inside a course, no "Project" text left on the record setup, the Library menu and Search, and at 390 px the Library + menu and dialog. Click menu items with `clickItem(text)`: buttons with the same text under the menu's overlay come first in the DOM.
```bash
node .claude/skills/web-check/scripts/new-menu.mjs
```

## Check the item and empty-space menus (step 3.2 feedback)

`scripts/item-menus.mjs`: the sidebar's right-click menu for a course, folder and lecture equals the grid's; Rename…, Add to Favorites and Delete (+ Undo) from the sidebar; the empty-space menu in a course (right-click; long-press at 390 px), its New folder, Sort by… and Record lecture here; a right-click on a tile still shows the tile's menu.
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

## Run the AI flow (recording → transcript → notes → clarify)

`scripts/ai-flow.mjs` records about 12 s of a spoken lecture (macOS `say`, played as the page's microphone), stops, generates notes through both consent dialogs, highlights a sentence and asks Clarify, confirms, opens the note, and checks the database (transcript, confirmed note with its clarification, lecture `ready`, consent rows, `ai_usage`).

- **Real** (default): needs `supabase functions serve` with the keys in `supabase/functions/.env`. Calls Whisper and Claude: **about $0.05 per run** — run it when the AI path changed, not as a routine check.
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

Driver API: `launch({ micWav, width, height })`, `resize(width, height)`, `nav(url)`, `waitText(text, {exact, timeout, exclude})`, `hasText(text, exact)`, `click(text, {button: 'right', holdMs, exact, nth, exclude})`, `clickAt(x, y)`, `clickSelector(css)`, `fill(css, text)`, `type(text)`, `press('Enter' | 'Escape' | 'Tab')`, `chord({ code, key, alt, shift, meta, ctrl, text })`, `doubleClick(text, {exact, nth, exclude})`, `mouseDrag(from, to, { steps, midway })`, `htmlDrag(from, to, { files, midway })`, `onEvent(method, fn)` (keys with modifiers, e.g. ⌥R is `{ code: 'KeyR', key: '®', alt: true }`), `shot(name)`, `evaluate(js)`, `errors()`, `dialogs` (native browser dialogs seen), `signIn(base, email, password)`.

Check results in the database with `admin` (service role, local only), not just on screen.

## Gotchas (all hit while building this)
- **The default window (1280×900) is the laptop layout**: the sidebar repeats course names, so clicks on them pass `exclude: '[data-testid=sidebar]'`. The shell parts have test ids `top-bar`, `sidebar`, `assistant-panel`, `document-header`, `section-list`, `sidebar-current` (the highlighted tree item). The open course's tree repeats folder and lecture names in the sidebar too. Below 1024 px the tab bar shows instead.
- **Fresh profile every launch**: a kept profile restores the previous run's session (for a user that no longer exists) and skips sign-in.
- **Text is matched as rendered**: labels styled with `textTransform: 'uppercase'` read as `UNDO`, not `Undo`.
- **Off-screen elements**: the driver scrolls the target into view before clicking (wide windows make the square course cards very tall).
- **Start Recording is disabled until a title is typed** (`input[placeholder^="e.g."]`). The microphone is Chrome's fake device (a beep once a second, which Whisper hears as "you"); the recording uploads as `.webm`.
- **Real speech**: `launch({ micWav })` replaces getUserMedia with a Web Audio stream of the file. Chrome's own `--use-file-for-fake-audio-capture` stays silent in headless mode, whatever the WAV format.
- **Summary sentences are `<span>`s on the web** (nested Text); other text is in `<div>`s.
- **A full reload shows the splash screen for ~2 s**; wait before a screenshot.
- **On the web, Alert with buttons, Alert.prompt and ActionSheetIOS do nothing.** The app uses `src/components/dialogs` (a lint rule enforces it); a missing menu usually means something bypasses it.
- **TouchableOpacity drops an `onContextMenu` prop on the web**: right-click menus are wired through `menuTriggerProps`' ref.
- iPhone behaviour (native action sheets, Alert.prompt, the real microphone) can't be checked here; list it for Lea to retest.
