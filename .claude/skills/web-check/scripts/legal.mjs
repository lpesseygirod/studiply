// legal.mjs — step 10.1b-1, the legal pages, in Chrome against local Supabase. No AI call (every
// request to an AI function is answered in the page and counted), no Edge Function needed.
//
// Steps:
//   1. Signed out, each page by its address (/privacy, /terms, /refunds, /cookies, /legal) at 1280:
//      the page stays (no sign-in redirect), its title from docs/legal, the bracketed details visible
//      (they are filled before launch), light and dark.
//   2. Signed out, links between the pages: /privacy → "Terms of Service" → /terms; ‹ Back → /privacy;
//      ‹ Back with nothing before → sign-in.
//   3. /legal: the legal notice links the other texts; "Open-source licences": libheif-js 1.23.5
//      (LGPL-3.0) with the libheif-js and libheif sources, "Show the licence" → the LGPL text, "Show
//      all N packages" → the list; the texts version (LEGAL_VERSION).
//   4. 390 signed out: /privacy (tables as cards), /legal, light and dark.
//   5. Sign-up (desktop-06; 390): "Terms of Service · Privacy Policy" under the form; Privacy Policy
//      opens in a sheet over it, its Terms link opens inside the sheet, ‹ goes back, Escape closes;
//      the typed name is still there. Sign in shows the links too.
//   6. Signed in, 1280 (desktop-05): "Terms · Privacy · Legal" under the settings menu → /privacy, on
//      its own (no shell), ‹ Back → /settings/account; /terms by its address, ‹ Back → Settings.
//   7. Signed in, 390 (iphone-07): the same links at the foot of the Settings list → /legal (the
//      licences), ‹ Back → /settings.
//   8. The consent screen (desktop-09 / iphone-12): "Privacy policy" opens the policy over it;
//      Escape (1280) or ‹ (390) comes back to the same choice, nothing answered; Not now: no rows.
//   9. Composites, light and dark, signed out and signed in (beside the mockups where one applies).
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 12 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/legal.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const MIN = 60_000;

const PAGES = [
  ['privacy', 'privacy-policy.md'],
  ['terms', 'terms-of-service.md'],
  ['refunds', 'refund-policy.md'],
  ['cookies', 'cookie-policy.md'],
  ['legal', 'legal-notice.md'],
];
const TITLE = Object.fromEntries(PAGES.map(([slug, file]) => [slug, /^# (.+)$/m.exec(readFileSync(join(repo, 'docs/legal', file), 'utf8'))[1].trim()]));
const LEGAL_VERSION = /LEGAL_VERSION = "([^"]+)"/.exec(readFileSync(join(repo, 'src/legal/texts.generated.ts'), 'utf8'))?.[1];

const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-legal-${results.length}`).catch(() => {});
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

/** AI functions answered in the page (nothing reaches them) and counted. */
const PAGE_SETUP = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__aiCalls = [];
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && /\\/functions\\/v1\\/(transcribe-chunk|summarize|assistant-chat|quiz)\\b/.test(url)) {
      window.__aiCalls.push(url.replace(/^.*\\/functions\\/v1\\//, ''));
      return new Response(JSON.stringify({ code: 'server_error', error: 'Answered by the check.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const user = await makeUser();
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
setTimeout(() => {
  console.error('legal.mjs: still running after 12 minutes; stopping');
  void finish(1);
}, 12 * MIN).unref();

await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const path = () => b.evaluate('location.pathname');
const aiCalls = async () => (await b.evaluate('window.__aiCalls').catch(() => [])) ?? [];
const taken = new Set();
const shot = async (name) => {
  await b.sleep(600);
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

/**
 * The legal page on top (a stack keeps the pages below it mounted; the sheet sits over the screen):
 * the [data-legal-page] that the point in the middle of its own visible part lands in.
 */
const TOP_PAGE = `(() => {
  const pages = [...document.querySelectorAll('[data-legal-page]')];
  for (const e of pages.reverse()) {
    const r = e.getBoundingClientRect();
    const x = Math.min(Math.max(r.x + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.y + 80, 1), innerHeight - 1);
    if (!r.width || !r.height) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && e.contains(hit)) return e;
  }
  return null;
})()`;
const topPage = () => b.evaluate(`${TOP_PAGE}?.getAttribute('data-legal-page') ?? null`);
const topText = () => b.evaluate(`${TOP_PAGE}?.innerText ?? ''`);
/** Clicks the first element matching `css` that is really on top where it is drawn. */
const tapTop = async (css) => {
  const p = await b.evaluate(`(() => {
    for (const e of document.querySelectorAll(${JSON.stringify(css)})) {
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === e || e.contains(hit))) return { x, y };
    }
    return null;
  })()`);
  if (!p) throw new Error(`nothing on top matches ${css}`);
  await b.sleep(250);
  await b.clickAt(p.x, p.y);
  await b.sleep(400);
};
const visible = (css) =>
  b.evaluate(`[...document.querySelectorAll(${JSON.stringify(css)})].some((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !!hit && (hit === e || e.contains(hit)); })`);
/** Scrolls the page on top so the leaf with this exact text is at the top of the window. */
const scrollToText = (t) =>
  b.evaluate(`(() => { const top = ${TOP_PAGE}; const el = top && [...top.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(t)}); if (!el) return false; el.scrollIntoView({ block: 'start' }); return true; })()`);
const splashGone = () =>
  waitFor(
    () =>
      b.evaluate(`(() => {
        const el = [...document.querySelectorAll('div, span')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY');
        if (!el) return true;
        let o = 1;
        for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o <= 0.05;
      })()`),
    'the splash screen gone',
    20000,
  );
/** A page opened fresh: waits for the app to draw, then for the splash to go. */
const go = async (where) => {
  await b.nav(`${BASE}${where}`);
  await waitFor(() => b.evaluate(`document.body.innerText.trim().length > 0`), 'the app drawn', 30000);
  await b.sleep(300);
  await splashGone();
  await b.sleep(500);
};
/** An address opened signed out stays a legal page: no redirect to sign-in. */
const openPage = async (slug) => {
  await go(`/${slug}`);
  await waitFor(async () => (await topPage()) === slug, async () => `the ${slug} page on top (top: ${await topPage()}, at ${await path()})`, 20000);
  await b.sleep(1500);
  expect((await path()) === `/${slug}`, `/${slug} became ${await path()}`);
  expect((await topText()).includes(TITLE[slug]), `no title "${TITLE[slug]}"`);
};
const CONSENT = '[data-consent="screen"]';
const consentRows = async () => (await admin.from('ai_consent').select('scope').eq('user_id', user.id)).data ?? [];

try {
  await step('signed out, each page by its address at 1280: no redirect, its title, the bracketed details visible', async () => {
    await b.resize(1280, 900);
    for (const [slug] of PAGES) {
      await openPage(slug);
      if (slug === 'privacy') {
        expect((await topText()).includes('[YOUR FULL LEGAL NAME]'), 'the brackets are not visible');
        await shots('legal-privacy-1280');
      }
    }
    report.push(`RESULT | titles: ${PAGES.map(([s]) => TITLE[s]).join(' · ')}`);
  });

  await step('signed out, links between the pages: /privacy → Terms of Service → /terms; ‹ Back → /privacy; ‹ Back with nothing before → sign-in', async () => {
    await openPage('privacy');
    await tapTop('[data-legal-href="/terms"]');
    await waitFor(async () => (await path()) === '/terms' && (await topPage()) === 'terms', async () => `at ${await path()}, top ${await topPage()}`);
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await path()) === '/privacy' && (await topPage()) === 'privacy', async () => `back at ${await path()}, top ${await topPage()}`);
    await openPage('cookies');
    expect((await topText()).includes("Apple's sign-in script loads from Apple's servers"), 'the cookie policy lacks the Apple line (D5)');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await path()).includes('onboarding'), async () => `‹ Back from an address went to ${await path()}`, 15000);
  });

  await step('/legal: the other texts linked; open-source licences (libheif-js LGPL-3.0, its sources, the text, all packages); the texts version', async () => {
    await openPage('legal');
    for (const s of ['/terms', '/privacy', '/refunds', '/cookies']) expect(await has(`[data-legal-page="legal"] [data-legal-href="${s}"]`), `the notice doesn't link ${s}`);
    expect(await visible('[data-legal="licences"]'), 'no Open-source licences section');
    const notice = await b.evaluate(`document.querySelector('[data-licence-notice="libheif-js"]')?.innerText ?? ''`);
    for (const words of ['libheif-js 1.23.5 · LGPL-3.0', 'https://github.com/catdad-experiments/libheif-js', 'https://github.com/strukturag/libheif', 'libheif (LGPL-3.0)']) expect(notice.includes(words), `the libheif-js notice lacks "${words}": ${notice.slice(0, 300)}`);
    await tapTop('[data-licence-notice="libheif-js"] [data-legal="show-licence"]');
    await waitFor(async () => (await b.evaluate(`document.querySelector('[data-licence-notice="libheif-js"]')?.innerText ?? ''`)).includes('GNU LESSER GENERAL PUBLIC LICENSE'), 'the LGPL text shown');
    const label = await b.evaluate(`document.querySelector('[data-legal="show-packages"]')?.innerText ?? ''`);
    const count = Number(/Show all (\d+) packages/.exec(label)?.[1] ?? 0);
    expect(count > 100, `packages: "${label}"`);
    await tapTop('[data-legal="show-packages"]');
    await waitFor(async () => (await topText()).includes('expo-router') && (await topText()).includes('Hide the packages'), 'the package list shown');
    expect((await topText()).includes(`Texts version ${LEGAL_VERSION}`), `no "Texts version ${LEGAL_VERSION}"`);
    report.push(`RESULT | /legal: ${count} packages, notices: ${await b.evaluate(`[...document.querySelectorAll('[data-licence-notice]')].map((e) => e.getAttribute('data-licence-notice')).join(', ')`)}; version ${LEGAL_VERSION}`);
    await scrollToText('Open-source licences');
    await shots('legal-licences-1280');
  });

  await step('390 signed out: /privacy (its tables as cards) and /legal, light and dark', async () => {
    await b.resize(390, 844);
    await openPage('privacy');
    await shots('legal-privacy-390');
    expect(await scrollToText('5. Who we share data with'), 'no section 5');
    expect((await topText()).includes('What it does:'), 'the providers table is not drawn as cards at 390');
    await shots('legal-privacy-table-390');
    await openPage('legal');
    await shots('legal-legal-390');
    await b.resize(1280, 900);
  });

  await step('sign-up (desktop-06; 390): Terms of Service · Privacy Policy under the form, opened in a sheet (Terms inside it, ‹ back, Escape closes), the name kept; Sign in has them too', async () => {
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    await b.fill('input[placeholder="Your name"]', 'Legal Check');
    expect(await visible('[data-legal-link="terms"]') && (await visible('[data-legal-link="privacy"]')), 'no links under the sign-up form');
    expect((await b.evaluate(`document.querySelector('[data-legal-link="privacy"]')?.innerText`)) === 'Privacy Policy', 'the link is not "Privacy Policy"');
    await shots('signup-1280');
    await tapTop('[data-legal-link="privacy"]');
    await waitFor(async () => (await topPage()) === 'privacy', 'the policy in a sheet');
    expect((await path()).includes('onboarding'), `the sheet navigated: ${await path()}`);
    await shots('signup-sheet-1280');
    await tapTop('[data-legal-page="privacy"] [data-legal-link="terms"]');
    await waitFor(async () => (await topPage()) === 'terms', 'Terms inside the sheet');
    expect((await b.evaluate(`${TOP_PAGE}?.querySelector('[data-legal="back"]')?.innerText ?? ''`)).includes('Privacy Policy'), 'the sheet’s ‹ doesn’t say Privacy Policy');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await topPage()) === 'privacy', '‹ back to the policy in the sheet');
    await b.press('Escape');
    await waitFor(async () => (await topPage()) === null, 'Escape closed the sheet');
    expect((await b.evaluate(`document.querySelector('input[placeholder="Your name"]')?.value`)) === 'Legal Check', 'the typed name was lost');
    await b.click('Already have an account? Sign in');
    await b.waitText('Welcome back', { timeout: 5000 }).catch(() => {});
    expect(await visible('[data-legal-link="terms"]'), 'no links under Sign in');
    await b.resize(390, 844);
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    expect(await visible('[data-legal-link="privacy"]'), 'no links at 390');
    await shots('signup-390');
    await b.resize(1280, 900);
  });

  await b.signIn(BASE, user.email, user.password);

  await step('signed in, 1280 (desktop-05): Terms · Privacy · Legal under the settings menu → /privacy on its own; ‹ Back → /settings/account; by its address, ‹ Back → Settings', async () => {
    await go('/settings/account');
    await waitFor(() => visible('[data-legal-link="privacy"]'), 'the links under the menu', 15000);
    for (const s of ['terms', 'privacy', 'legal']) expect(await visible(`[data-legal-link="${s}"]`), `no ${s} link`);
    await shots('settings-1280');
    await tapTop('[data-legal-link="privacy"]');
    await waitFor(async () => (await path()) === '/privacy' && (await topPage()) === 'privacy', async () => `at ${await path()}`);
    expect(!(await visible('[data-testid="settings-menu"]')), 'the settings shell is still drawn around the page');
    await shots('legal-privacy-signedin-1280');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await path()) === '/settings/account', async () => `‹ Back went to ${await path()}`);
    // By its address, signed in (nothing behind it): ‹ Back → Settings.
    await openPage('terms');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await path()).startsWith('/settings'), async () => `‹ Back from an address (signed in) went to ${await path()}`);
  });

  await step('signed in, 390 (iphone-07): the links at the foot of the Settings list → /legal (licences); ‹ Back → /settings', async () => {
    await b.resize(390, 844);
    await go('/settings');
    await b.waitText('Delete account…', { timeout: 15000 });
    expect(await visible('[data-legal-link="legal"]'), 'no links at the foot of the list');
    const order = await b.evaluate(`(() => { const del = [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && e.textContent === 'Delete account…'); const link = document.querySelector('[data-legal-link="terms"]'); return { del: del?.getBoundingClientRect().top ?? -1, link: link?.getBoundingClientRect().top ?? -1 }; })()`);
    expect(order.link > order.del, `the links are not under Delete account…: ${JSON.stringify(order)}`);
    await shots('settings-390');
    await tapTop('[data-legal-link="legal"]');
    await waitFor(async () => (await path()) === '/legal' && (await topPage()) === 'legal', async () => `at ${await path()}`);
    await tapTop('[data-legal="show-packages"]');
    await scrollToText('Open-source licences');
    await shots('legal-licences-390');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await path()) === '/settings', async () => `‹ Back went to ${await path()}`);
    await b.resize(1280, 900);
  });

  await step('the consent screen (desktop-09 / iphone-12): Privacy policy opens the policy over it; Escape / ‹ comes back to the same choice; Not now: no rows', async () => {
    const ask = async () => {
      await go('/settings/ai-privacy');
      await waitFor(() => has('[data-ai-consent="off"]'), 'the AI & privacy card off', 15000);
      await tapTop('[data-ai-consent] [role="switch"]');
      await waitFor(() => has(CONSENT), 'the consent screen', 10000);
    };
    await ask();
    expect(await visible('[data-consent="privacy"]'), 'no Privacy policy link on the consent card');
    await shots('consent-1280');
    await tapTop('[data-consent="privacy"]');
    await waitFor(async () => (await topPage()) === 'privacy', 'the policy over the consent screen');
    await shots('consent-privacy-1280');
    await b.press('Escape');
    await waitFor(async () => (await topPage()) === null, 'Escape closed the policy');
    expect(await has(CONSENT), 'Escape on the policy also closed the consent screen');
    expect((await attr('[data-consent="allow"]', 'aria-disabled')) === 'true', 'the choice changed');
    await b.press('Escape');
    await waitFor(async () => !(await has(CONSENT)), 'Escape is Not now on the consent screen');

    await b.resize(390, 844);
    await ask();
    expect((await attr(CONSENT, 'data-layout')) === 'full', 'not full screen at 390');
    expect(await visible('[data-consent="privacy"]'), 'no Privacy policy link under the rows at 390');
    await shots('consent-390');
    await tapTop('[data-consent="privacy"]');
    await waitFor(async () => (await topPage()) === 'privacy', 'the policy over the consent screen at 390');
    expect((await b.evaluate(`${TOP_PAGE}?.querySelector('[data-legal="back"]')?.innerText ?? ''`)).includes('Before Studiply uses AI'), '‹ doesn’t name the consent screen');
    await shots('consent-privacy-390');
    await tapTop('[data-legal="back"]');
    await waitFor(async () => (await topPage()) === null && (await has(CONSENT)), '‹ came back to the consent screen');
    await tapTop('[data-consent="not-now"]');
    await waitFor(async () => !(await has(CONSENT)), 'Not now');
    expect((await consentRows()).length === 0, `consent rows: ${JSON.stringify(await consentRows())}`);
    expect((await aiCalls()).length === 0, `AI calls: ${JSON.stringify(await aiCalls())}`);
    await b.resize(1280, 900);
  });

  await step('composites, light and dark, signed out and signed in (beside the mockups where one applies)', async () => {
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
    const pair = (label, shotName) => [
      [`${label} · light`, shotOf(shotName)],
      [`${label} · dark`, shotOf(`${shotName}-dark`)],
    ];
    await compose('legal-compose-signedout-1280', [...pair('/privacy, signed out', 'legal-privacy-1280'), ...pair('/legal: open-source licences', 'legal-licences-1280')], 560);
    await compose('legal-compose-signedout-390', [...pair('/privacy', 'legal-privacy-390'), ...pair('/privacy §5 (cards)', 'legal-privacy-table-390'), ...pair('/legal', 'legal-legal-390')], 390);
    await compose('legal-compose-signup-1280', [['desktop-06-sign-in (mockup)', mock('desktop-06-sign-in')], ...pair('Sign-up: the links', 'signup-1280'), ['The policy in a sheet · light', shotOf('signup-sheet-1280')], ['dark', shotOf('signup-sheet-1280-dark')]], 560);
    await compose('legal-compose-signup-390', [['iphone-11-welcome (mockup)', mock('iphone-11-welcome')], ...pair('Sign-up at 390', 'signup-390')], 390);
    await compose('legal-compose-signedin-1280', [['desktop-05-settings (mockup)', mock('desktop-05-settings')], ...pair('Settings: links under the menu', 'settings-1280'), ...pair('/privacy, signed in', 'legal-privacy-signedin-1280')], 560);
    await compose('legal-compose-signedin-390', [['iphone-07-settings (mockup)', mock('iphone-07-settings')], ...pair('Settings: the footer', 'settings-390'), ...pair('/legal: licences', 'legal-licences-390')], 390);
    await compose('legal-compose-consent-1280', [['desktop-09-ai-consent (mockup)', mock('desktop-09-ai-consent')], ...pair('Privacy policy beside the tick', 'consent-1280'), ...pair('The policy over it', 'consent-privacy-1280')], 560);
    await compose('legal-compose-consent-390', [['iphone-12-ai-consent (mockup)', mock('iphone-12-ai-consent')], ...pair('Privacy policy under the rows', 'consent-390'), ...pair('The policy over it', 'consent-privacy-390')], 390);
    await b.resize(1280, 900);
    const wanted = [
      'legal-privacy-1280', 'legal-licences-1280', 'legal-privacy-390', 'legal-privacy-table-390', 'legal-legal-390', 'signup-1280', 'signup-sheet-1280', 'signup-390',
      'settings-1280', 'legal-privacy-signedin-1280', 'settings-390', 'legal-licences-390', 'consent-1280', 'consent-privacy-1280', 'consent-390', 'consent-privacy-390',
    ].flatMap((n) => [n, `${n}-dark`]);
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
