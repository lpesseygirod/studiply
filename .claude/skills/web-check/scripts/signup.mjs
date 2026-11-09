// signup.mjs — step 10.1b-2, accepting the Terms and the Privacy Policy and the minimum age (16), in
// Chrome against local Supabase (migration 20261029152500_terms_acceptance applied). No AI call, no
// Edge Function. One real sign-up through the form: local Supabase sends one confirmation email
// (Mailpit), and allows 2 an hour (supabase/config.toml [auth.rate_limit] email_sent) — a third run
// within the hour fails at that step with the rate-limit message.
//
// Steps:
//   1. Sign-up at 1280 (desktop-06's form): two unticked boxes ("I agree to the Terms of Service and
//      the Privacy Policy", both linked; "I am 16 or older"); with name, email and password filled
//      Create account is greyed, and Enter does nothing (no account made); a link opens the text in a
//      sheet and doesn't tick the box; only the first ticked → still greyed, "Studiply is for people
//      aged 16 or older."; both → enabled. Light and dark.
//   2. Create account → "Check your email"; the account exists with her acceptance: this version, 16+,
//      at sign-up, the server's time. Confirmed, she signs in: the library, no gate. When local
//      Supabase refuses the email (its rate limit), SKIP with the reason, not FAIL.
//   3. 390: the same boxes under the form, light and dark.
//   4. The gate, an account without an acceptance (as a first Sign in with Apple, or an account from
//      before this step) at 1280: after sign-in "Before you continue" over the library; Continue
//      greyed until both boxes; Escape doesn't close it; Continue → her acceptance (at the gate, the
//      server's time); a reload: no gate.
//   5. "I don't agree (sign out)": signed out, nothing saved; signing in again asks again.
//   6. The gate at 390 (full screen): the Privacy Policy opens over it, Escape closes only that; then
//      accepted.
//   7. Composites beside desktop-06 and iphone-11 (the welcome itself is the iPhone's only), light and
//      dark.
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 12 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/signup.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, dropUser, LEGAL_VERSION } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const MIN = 60_000;

const results = [];
const report = [];
const made = [];
let b;
/** A step that can't run here (local Supabase's email rate limit): reported as SKIP, not FAIL. */
class Skip extends Error {}
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    if (err instanceof Skip) {
      results.push(['SKIP', name, err.message]);
      console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
      return;
    }
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-signup-${results.length}`).catch(() => {});
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

b = await launch();
let finished = false;
const finish = async (code) => {
  if (finished) return;
  finished = true;
  await b.close().catch(() => {});
  for (const id of made) await dropUser(id).catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
setTimeout(() => {
  console.error('signup.mjs: still running after 12 minutes; stopping');
  void finish(1);
}, 12 * MIN).unref();

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const path = () => b.evaluate('location.pathname');
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
/** The legal page on top, if any (a sheet over the screen). */
const topPage = () =>
  b.evaluate(`(() => { for (const e of [...document.querySelectorAll('[data-legal-page]')].reverse()) { const r = e.getBoundingClientRect(); if (!r.width) continue; const hit = document.elementFromPoint(r.x + r.width / 2, Math.min(r.y + 80, innerHeight - 1)); if (hit && e.contains(hit)) return e.getAttribute('data-legal-page'); } return null; })()`);
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
const go = async (where) => {
  await b.nav(`${BASE}${where}`);
  await waitFor(() => b.evaluate(`document.body.innerText.trim().length > 0`), 'the app drawn', 30000);
  await b.sleep(300);
  await splashGone();
  await b.sleep(500);
};
const checked = (tag) => attr(`[data-terms="${tag}"]`, 'data-checked').then((v) => v === 'true');
const continueOff = async () => (await attr('[data-auth="continue"]', 'aria-disabled')) === 'true';
const gateOn = () => visible('[data-gate="screen"] [data-gate="continue"]');
const gateOff = async () => (await attr('[data-gate="continue"]', 'aria-disabled')) === 'true';
const acceptances = async (id) => (await admin.from('terms_acceptances').select('terms_version, age_confirmed, source, accepted_at').eq('user_id', id)).data ?? [];
const userByEmail = async (email) => {
  for (let page = 1; page < 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email === email);
    if (found || !data?.users?.length) return found ?? null;
  }
  return null;
};
const fresh = (at) => Math.abs(Date.parse(at) - Date.now()) < 3 * MIN;
const fillForm = async (email) => {
  await b.fill('input[placeholder="Your name"]', 'Sign Up Check');
  await b.fill('input[placeholder="Email"]', email);
  await b.fill('input[type="password"]', 'password123');
};
const signInUi = async (email, password) => {
  await go('/');
  await b.waitText('Create account', { timeout: 30000 });
  await b.click('Already have an account? Sign in').catch(() => {});
  await b.fill('input[placeholder="Email"]', email);
  await b.fill('input[type="password"]', password);
  await b.click('Sign in');
};

const signupEmail = `signup-${Date.now()}@test.dev`;

try {
  await step('sign-up at 1280 (desktop-06): two unticked boxes; Create account greyed (Enter too) until both; a link opens the text without ticking; only the first → the 16+ line', async () => {
    await b.resize(1280, 900);
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    expect(!(await checked('agree')) && !(await checked('age')), 'a box starts ticked');
    expect(await b.hasText('I am 16 or older', true), 'no "I am 16 or older"');
    await fillForm(signupEmail);
    expect(await continueOff(), 'Create account not greyed with the boxes unticked');
    await b.press('Enter');
    await b.sleep(2000);
    expect(!(await userByEmail(signupEmail)), 'Enter made an account without the boxes');
    // Still the sign-up form, as filled ("Create your account" is drawn uppercase: matched by the form itself).
    expect((await path()).includes('onboarding') && (await has('[data-terms="agree"]')) && !(await has('input[placeholder="6-digit code"]')), `Enter left the form (at ${await path()})`);
    expect((await b.evaluate(`document.querySelector('input[placeholder="Your name"]')?.value`)) === 'Sign Up Check', 'Enter cleared the form');

    await tapTop('[data-legal-link="terms"]');
    await waitFor(async () => (await topPage()) === 'terms', 'the Terms in a sheet');
    await b.press('Escape');
    await waitFor(async () => (await topPage()) === null, 'Escape closed the sheet');
    expect(!(await checked('agree')), 'opening the link ticked the box');

    await tapTop('[data-terms="agree"]');
    await waitFor(() => checked('agree'), 'the first box ticked');
    expect(await continueOff(), 'Create account enabled without "I am 16 or older"');
    await waitFor(() => visible('[data-terms="under-age"]'), 'the 16+ line');
    expect(await b.hasText('Studiply is for people aged 16 or older.', true), 'the 16+ wording');
    await shots('signup-agree-only-1280');
    await tapTop('[data-terms="age"]');
    await waitFor(async () => !(await continueOff()), 'Create account enabled with both');
    expect(!(await has('[data-terms="under-age"]')), 'the 16+ line stayed');
    await shots('signup-1280');
  });

  await step('Create account → "Check your email"; her acceptance saved (this version, 16+, at sign-up, the server’s time); confirmed, she signs in: no gate', async () => {
    expect(!(await continueOff()), 'Create account is not enabled (step 1 did not tick both boxes)');
    await tapTop('[data-auth="continue"]');
    // The code screen (its title is drawn uppercase: matched by its field), or the app's rate-limit message.
    const RATE_LIMITED = 'Too many emails sent';
    await waitFor(async () => (await has('input[placeholder="6-digit code"]')) || (await b.hasText(RATE_LIMITED, false)), 'the code screen', 20000);
    if (await b.hasText(RATE_LIMITED, false)) {
      // Delete the account if Supabase made it before refusing the email.
      const half = await userByEmail(signupEmail);
      if (half) made.push(half.id);
      throw new Skip('local Supabase sends 2 sign-up emails an hour (supabase/config.toml [auth.rate_limit] email_sent); run again later — pgTAP 21 checks what the sign-up saves');
    }
    const user = await waitFor(() => userByEmail(signupEmail), 'the account', 10000);
    made.push(user.id);
    const rows = await acceptances(user.id);
    expect(rows.length === 1 && rows[0].terms_version === LEGAL_VERSION && rows[0].age_confirmed === true && rows[0].source === 'sign_up' && fresh(rows[0].accepted_at), `acceptance: ${JSON.stringify(rows)}`);
    report.push(`RESULT | sign-up: ${rows[0].terms_version}, ${rows[0].source}, ${rows[0].accepted_at}`);
    await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    await signInUi(signupEmail, 'password123');
    await b.waitText('COURSES', { timeout: 20000 });
    await b.sleep(2500);
    expect(!(await gateOn()), 'the gate asked an account that accepted at sign-up');
    // Signed out for the next steps: the stored session gone, then a fresh load.
    await b.evaluate(`localStorage.clear()`);
  });

  await step('390: the same boxes under the form, light and dark', async () => {
    await b.resize(390, 844);
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    expect(await visible('[data-terms="agree"]') && (await visible('[data-terms="age"]')), 'no boxes at 390');
    await fillForm(`signup-390-${Date.now()}@test.dev`);
    await tapTop('[data-terms="agree"]');
    await tapTop('[data-terms="age"]');
    await waitFor(async () => !(await continueOff()), 'enabled with both at 390');
    await shots('signup-390');
    await b.resize(1280, 900);
  });

  const gated = await makeUser({ terms: false });
  made.push(gated.id);

  await step('the gate at 1280 (an account without an acceptance): over the library; Continue greyed until both; Escape doesn’t close it; Continue → saved at the gate; a reload: no gate', async () => {
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    await signInUi(gated.email, gated.password);
    await waitFor(gateOn, 'the gate after sign-in', 20000);
    expect(await b.hasText('Before you continue', true), 'its title');
    expect((await attr('[data-gate="screen"]', 'data-layout')) === 'card', 'not a card at 1280');
    expect(await gateOff(), 'Continue not greyed');
    await shots('gate-1280');
    await b.press('Escape');
    await b.sleep(800);
    expect(await gateOn(), 'Escape closed the gate');
    await tapTop('[data-gate="screen"] [data-terms="agree"]');
    expect(await gateOff(), 'Continue enabled with only the first box');
    await waitFor(() => visible('[data-gate="screen"] [data-terms="under-age"]'), 'the 16+ line at the gate');
    await tapTop('[data-gate="screen"] [data-terms="age"]');
    await waitFor(async () => !(await gateOff()), 'Continue enabled with both');
    await tapTop('[data-gate="continue"]');
    await waitFor(async () => !(await has('[data-gate="screen"]')), 'the gate closed', 10000);
    const rows = await acceptances(gated.id);
    expect(rows.length === 1 && rows[0].terms_version === LEGAL_VERSION && rows[0].age_confirmed && rows[0].source === 'gate' && fresh(rows[0].accepted_at), `acceptance: ${JSON.stringify(rows)}`);
    report.push(`RESULT | gate: ${rows[0].terms_version}, ${rows[0].source}, ${rows[0].accepted_at}`);
    await go('/library');
    await b.waitText('COURSES', { timeout: 20000 });
    await b.sleep(2500);
    expect(!(await gateOn()), 'asked again after a reload');
  });

  const declined = await makeUser({ terms: false });
  made.push(declined.id);

  await step('"I don’t agree (sign out)": signed out, nothing saved; signing in again asks again', async () => {
    await b.evaluate(`localStorage.clear()`);
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    await signInUi(declined.email, declined.password);
    await waitFor(gateOn, 'the gate', 20000);
    await tapTop('[data-gate="decline"]');
    await waitFor(async () => (await path()).includes('onboarding'), async () => `not signed out: at ${await path()}`, 15000);
    expect(!(await has('[data-gate="screen"]')), 'the gate stayed after signing out');
    expect((await acceptances(declined.id)).length === 0, 'something was saved');
    await signInUi(declined.email, declined.password);
    await waitFor(gateOn, 'asked again', 20000);
  });

  await step('the gate at 390 (full screen): the Privacy Policy opens over it, Escape closes only that; then accepted', async () => {
    await b.resize(390, 844);
    await b.sleep(800);
    await waitFor(gateOn, 'the gate at 390');
    expect((await attr('[data-gate="screen"]', 'data-layout')) === 'full', 'not full screen at 390');
    await shots('gate-390');
    await tapTop('[data-gate="screen"] [data-legal-link="privacy"]');
    await waitFor(async () => (await topPage()) === 'privacy', 'the policy over the gate');
    await b.press('Escape');
    await waitFor(async () => (await topPage()) === null, 'Escape closed the policy');
    expect(await gateOn(), 'Escape on the policy closed the gate too');
    expect(!(await checked('agree')), 'the link ticked the box');
    await tapTop('[data-gate="screen"] [data-terms="agree"]');
    await tapTop('[data-gate="screen"] [data-terms="age"]');
    await tapTop('[data-gate="continue"]');
    await waitFor(async () => !(await has('[data-gate="screen"]')), 'the gate closed at 390', 10000);
    expect((await acceptances(declined.id)).length === 1, 'not saved at 390');
    await b.resize(1280, 900);
  });

  await step('composites beside desktop-06 and iphone-11, light and dark', async () => {
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
    const pair = (label, s) => [
      [`${label} · light`, shotOf(s)],
      [`${label} · dark`, shotOf(`${s}-dark`)],
    ];
    await compose('signup-compose-1280', [['desktop-06-sign-in (mockup)', mock('desktop-06-sign-in')], ...pair('Sign-up: only the first box', 'signup-agree-only-1280'), ...pair('Both ticked', 'signup-1280')], 560);
    await compose('signup-compose-gate-1280', [['desktop-06-sign-in (mockup)', mock('desktop-06-sign-in')], ...pair('The gate', 'gate-1280')], 560);
    await compose('signup-compose-390', [['iphone-11-welcome (mockup)', mock('iphone-11-welcome')], ...pair('Sign-up at 390', 'signup-390'), ...pair('The gate at 390', 'gate-390')], 390);
    await b.resize(1280, 900);
    const wanted = ['signup-agree-only-1280', 'signup-1280', 'signup-390', 'gate-1280', 'gate-390'].flatMap((n) => [n, `${n}-dark`]);
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
