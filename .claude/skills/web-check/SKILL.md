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

Driver API: `nav(url)`, `waitText(text, {exact, timeout})`, `hasText(text, exact)`, `click(text, {button: 'right', holdMs, exact, nth})`, `clickAt(x, y)`, `clickSelector(css)`, `fill(css, text)`, `type(text)`, `press('Enter' | 'Escape' | 'Tab')`, `shot(name)`, `evaluate(js)`, `errors()`, `dialogs` (native browser dialogs seen), `signIn(base, email, password)`.

Check results in the database with `admin` (service role, local only), not just on screen.

## Gotchas (all hit while building this)
- **Fresh profile every launch**: a kept profile restores the previous run's session (for a user that no longer exists) and skips sign-in.
- **Text is matched as rendered**: labels styled with `textTransform: 'uppercase'` read as `UNDO`, not `Undo`.
- **Off-screen elements**: the driver scrolls the target into view before clicking (wide windows make the square course cards very tall).
- **Start Recording is disabled until a title is typed** (`input[placeholder^="e.g."]`). The microphone is Chrome's fake device; the recording uploads as `.webm`.
- **On the web, Alert with buttons, Alert.prompt and ActionSheetIOS do nothing.** The app uses `src/components/dialogs` (a lint rule enforces it); a missing menu usually means something bypasses it.
- **TouchableOpacity drops an `onContextMenu` prop on the web**: right-click menus are wired through `menuTriggerProps`' ref.
- iPhone behaviour (native action sheets, Alert.prompt, the real microphone) can't be checked here; list it for Lea to retest.
