// reminders.mjs — step 9.2-3, review reminders, on the web (the laptop and the web at 390). The
// reminders themselves are the iPhone's (local notifications through expo-notifications): Chrome can't
// check those, Lea does on an EAS development build (docs/reports/latest.md). Here:
//   1. 1280 (desktop-05's frame): Settings → Notifications in the menu; the page's one card "Review
//      reminders come on your iPhone" with what they do and where to turn them on; no switch, no
//      time, nothing to change on the web.
//   2. 390 (iphone-07's frame): the Settings list's Notifications row (no value on the web: none to
//      show), its page with the same card.
//   3. Review with something due (a flashcard): no "Get a daily reminder?" offer on the web.
//   4. The web bundle doesn't load expo-notifications (the web build's notifier does nothing).
//   5. Names: every control on the Notifications page named (none unnamed), no switch on the web.
//   6. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//   7. Composites: desktop-05 beside 1280 light / dark; iphone-07 beside 390 (the list, the page) light / dark.
//
// The run always ends (its Chrome closed, the test user dropped, the process exits).
// Run with a dev server on 8123 (the web-check skill), `supabase start`:
//   node .claude/skills/web-check/scripts/reminders.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-reminders-${results.length}`).catch(() => {});
    await b.press('Escape').catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function waitFor(fn, what, timeout = 10000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn().catch(() => null);
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out: ${typeof what === 'function' ? await what() : what}`);
    await b.sleep(200);
  }
}

const MIN = 60_000;
const user = await makeUser();
const data = await seed(user.client);
b = await launch();

let finished = false;
const finish = async (code) => {
  if (finished) return;
  finished = true;
  await b.close().catch(() => {});
  await dropUser(user.id).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
const watchdog = setTimeout(() => {
  console.error('reminders.mjs: still running after 8 minutes; stopping');
  void finish(1);
}, 8 * MIN);
watchdog.unref();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.innerText ?? ''`);
const splashShown = () =>
  b.evaluate(`(() => {
    const el = [...document.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY');
    if (!el) return false;
    let opacity = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    return opacity > 0.05;
  })()`);
const waitSplash = () => waitFor(async () => !(await splashShown()), 'the splash screen gone', 20000);
const taken = new Set();
const shot = async (name) => {
  await b.sleep(500);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(700);
};
const shots = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};
const CARD = '[data-reminders="laptop"]';
const pageNames = () =>
  b.evaluate(`(() => {
    const controls = [...document.querySelectorAll('[role=button], [role=radio], [role=switch], button, [role=link]')].filter((e) => !e.closest('[data-testid=sidebar]') && e.getBoundingClientRect().width > 0);
    return { unnamed: controls.filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim())).map((e) => e.outerHTML.slice(0, 100)), switches: document.querySelectorAll('[role=switch]').length };
  })()`);

try {
  // Something due today (Review would offer the reminders on an iPhone).
  {
    const c = await user.client.from('flashcards').insert({ source: 'assistant', front: 'Sinapsis', back: 'La unión entre dos neuronas.', kind: 'term', file_id: data.lecture.id, course_id: data.course.id });
    if (c.error) throw new Error(`the card: ${c.error.message}`);
  }
  await b.signIn(BASE, user.email, user.password);
  await b.resize(1280, 900);

  await step('1280 (desktop-05): Settings → Notifications says reminders come on the iPhone; nothing to change here', async () => {
    await b.nav(`${BASE}/settings/account`);
    await waitSplash();
    await waitFor(() => b.hasText('Notifications', true), 'the Settings menu', 20000);
    await b.click('Notifications', { exact: true });
    await waitFor(() => has(CARD), 'the Notifications card', 15000);
    expect((await b.evaluate('location.pathname')) === '/settings/notifications', 'not on /settings/notifications');
    const t = await text(CARD);
    for (const want of ['Review reminders come on your iPhone', '1, 3, 7 and 21 days after each lecture', 'one notification a day', 'Settings → Notifications', 'Review today in the sidebar']) expect(t.includes(want), `no "${want}" in ${JSON.stringify(t)}`);
    expect(!(await has('[role="switch"]')) && !(await has('[data-reminders="time"]')), 'a switch or a time on the web');
    expect(!(await b.hasText('Reminders come with Review', true)), 'the old placeholder');
    await shots('reminders-settings-1280');
  });

  await step('390 (iphone-07): the Settings list’s Notifications row (no value on the web), its page the same card', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/settings`);
    await waitSplash();
    await waitFor(() => b.hasText('Notifications', true), 'the Settings list', 20000);
    const row = await b.evaluate(`(() => {
      // The row: its letter square ("N"), its name, its value (none on the web).
      const el = [...document.querySelectorAll('[role=button]')].find((e) => e.innerText.split('\\n').map((l) => l.trim()).includes('Notifications'));
      return el ? el.innerText.trim() : null;
    })()`);
    expect(row !== null && !/\d\d:\d\d|Off/.test(row), `the row: ${JSON.stringify(row)}`);
    await shots('reminders-list-390');
    await b.click('Notifications', { exact: true });
    await waitFor(() => has(CARD), 'the Notifications card at 390', 15000);
    const wide = await b.evaluate('document.documentElement.scrollWidth');
    expect(wide <= 390, `the page is ${wide} px wide`);
    await shots('reminders-settings-390');
    await b.resize(1280, 900);
  });

  await step('Review with something due: no reminder offer on the web', async () => {
    await b.nav(`${BASE}/review`);
    await waitSplash();
    await waitFor(() => b.evaluate(`!!document.querySelector('[data-review-card], [data-review="done"]')`), 'the review card', 20000);
    await b.sleep(1500);
    expect(!(await has('[data-reminders="offer"]')) && !(await b.hasText('Get a daily reminder?', true)), 'the offer shows on the web');
  });

  await step('the web bundle doesn’t load expo-notifications', async () => {
    const found = await b.evaluate(`(async () => {
      const srcs = [...document.scripts].map((s) => s.src).filter(Boolean);
      for (const src of srcs) {
        const body = await (await fetch(src)).text();
        if (body.includes('node_modules/expo-notifications/')) return src;
      }
      return null;
    })()`);
    expect(found === null, `expo-notifications in ${found}`);
  });

  await step('names: every control on the Notifications page named; no switch on the web', async () => {
    await b.nav(`${BASE}/settings/notifications`);
    await waitSplash();
    await waitFor(() => has(CARD), 'the card', 15000);
    const n = await pageNames();
    expect(n.unnamed.length === 0, `unnamed: ${JSON.stringify(n.unnamed)}`);
    expect(n.switches === 0, `${n.switches} switches on the web`);
    report.push('RESULT | the web: one card, no switch, no offer, expo-notifications not bundled');
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the composites: desktop-05 beside 1280 light and dark; iphone-07 beside 390 light and dark', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const mock = (name) => png(join(repo, 'docs/design', `${name}.png`));
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 15px -apple-system,sans-serif;margin:0 0 6px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:grid;grid-template-columns:repeat(${cells.length}, ${w}px);gap:24px;align-items:start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => {
        document.open(); document.write(${JSON.stringify(html)}); document.close();
        const loaded = (i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; }));
        await Promise.race([Promise.all([...document.images].map(loaded)), new Promise((r) => setTimeout(r, 5000))]);
      })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose('reminders-compose-1280', [['desktop-05 (mockup)', mock('desktop-05-settings')], ['Notifications · light', shotOf('reminders-settings-1280')], ['dark', shotOf('reminders-settings-1280-dark')]], 640);
    await compose('reminders-compose-390', [['iphone-07 (mockup)', mock('iphone-07-settings')], ['The list · light', shotOf('reminders-list-390')], ['dark', shotOf('reminders-list-390-dark')], ['Notifications · light', shotOf('reminders-settings-390')], ['dark', shotOf('reminders-settings-390-dark')]], 390);
    await b.resize(1280, 900);
    const wanted = ['reminders-settings-1280', 'reminders-settings-1280-dark', 'reminders-list-390', 'reminders-list-390-dark', 'reminders-settings-390', 'reminders-settings-390-dark'];
    const missing = wanted.filter((n) => !taken.has(n));
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  for (const r of results) console.log(r.join(' | '));
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  await finish(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
}
