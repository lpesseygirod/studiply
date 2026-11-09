// account.mjs — step 10.1, Apple's rules inside the app, in Chrome against local Supabase (migration
// 20261029152300_store_rules applied; `supabase functions serve` running for delete-account, which is
// free: no AI service is called). NO AI call: every request to an AI function (transcribe-chunk,
// summarize, assistant-chat, quiz) is answered in the page and counted; delete-account goes to the
// local function for real.
//
// Steps:
//   1. Signed out: the sign-in screen with Continue with Apple above "or with email" (desktop-06) at
//      1280 and 390 (the iPhone's own welcome, iphone-11, is native only), light and dark.
//   2. Signed in (a new account, no consent): the first Record → "Check that you may record this
//      class" (the reminder, once per account: saved in profiles.preferences) → Got it → the consent
//      screen "Before you record" (desktop-09: ElevenLabs and Anthropic named, not used for training,
//      Allow greyed until "I agree…" is ticked) → Not now: no consent row, nothing sent; the next
//      Record shows no reminder, the consent screen again.
//   3. Settings → AI & privacy (iphone-08's card): "Use AI on my lectures" off; the switch on → the
//      consent screen "Before Studiply uses AI" → ticked, Allow → three rows (the current policy
//      version), "Allowed on <date>". The switch off (one tap): every row withdrawn (the server's
//      time), AI off on this device at once (localStorage), "Off · nothing is sent"; then Record asks
//      again and nothing reached an AI function before the answer.
//   4. Settings → Account (desktop-05): the sign-in methods (Email, Sign in with Apple: Not linked),
//      Delete account… in the red card.
//   5. 390 (iphone-07, iphone-08, iphone-12): the Settings list (AI & privacy "Off", Delete account…
//      under Sign out), the AI & privacy page, the consent screen full screen; light and dark.
//   6. Delete account (the account has courses, a lecture, a document, marks, consent rows and files
//      in audio-chunks, slides and photos): Delete account greyed until DELETE is typed; Delete →
//      signed out, "Your account was deleted"; nothing of hers left: the auth user, every table's rows
//      (each checked by her id) and every Storage object under her id. Called again with her old
//      token: still { deleted: true } (idempotent).
//   7. Composites beside the mockups, light and dark: desktop-06, iphone-11, desktop-09, iphone-12,
//      iphone-08, iphone-07, desktop-05.
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 15 minutes.
//
// Run with a dev server on 8123 (the web-check skill), `supabase start` and `supabase functions serve`:
//   node .claude/skills/web-check/scripts/account.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser, supabaseEnv } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const repo = join(fileURLToPath(scripts), '../../../../');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8'))?.[1];
const MIN = 60_000;

const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-account-${results.length}`).catch(() => {});
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

/** AI functions answered in the page (nothing reaches them) and counted; delete-account goes through. */
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

const user = await makeUser({ reminder: true });
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
setTimeout(() => {
  console.error('account.mjs: still running after 15 minutes; stopping');
  void finish(1);
}, 15 * MIN).unref();

await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const attr = (css, name) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
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
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!found) throw new Error(`no element: ${css}`);
  await b.sleep(250);
  await b.clickSelector(css);
};
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
/**
 * A page opened fresh. The splash (STUDIPLY · AUTOMATED STUDY over everything, ~2 s) is mounted with
 * the app, so it is waited for only once the app has drawn: right after nav nothing is there yet and
 * the check would pass at once (the first run's sign-in shot caught the splash).
 */
const go = async (path) => {
  await b.nav(`${BASE}${path}`);
  await waitFor(() => b.evaluate(`document.body.innerText.trim().length > 0`), 'the app drawn', 30000);
  await b.sleep(300);
  await splashGone();
  await b.sleep(500);
};
const CONSENT = '[data-consent="screen"]';
const consentRows = async () => (await admin.from('ai_consent').select('scope, policy_version, withdrawn_at').eq('user_id', user.id)).data ?? [];
/** Starts a recording from the record screen (the reminder and the consent screen come before it). */
const pressRecord = async () => {
  await go('/record');
  await b.waitText('New Recording', { timeout: 20000 });
  await b.fill('input[placeholder^="e.g."]', `Consent check ${Date.now() % 1000}`);
  await b.click('Start Recording');
};
const REMINDER = 'Check that you may record this class';

try {
  await step('signed out: Continue with Apple above "or with email" (desktop-06), 1280 and 390', async () => {
    await b.resize(1280, 900);
    await go('/');
    await b.waitText('Continue with Apple', { timeout: 30000 });
    // The sign-in screen is drawn under the splash: wait until the splash is gone before the shot.
    await splashGone();
    await b.sleep(600);
    expect(await b.hasText('or with email', true), 'no "or with email"');
    expect(await has('input[placeholder="Email"], input[type="password"]'), 'no email form under it');
    await shots('auth-signin-1280');
    await b.resize(390, 844);
    await b.sleep(800);
    expect(await b.hasText('Continue with Apple', true), 'no Apple button at 390');
    await shots('auth-signin-390');
    await b.resize(1280, 900);
  });

  await b.signIn(BASE, user.email, user.password);

  await step('first Record: the reminder (once per account), then "Before you record" (desktop-09): Allow greyed until ticked; Not now sends nothing; the next Record: no reminder', async () => {
    await pressRecord();
    await b.waitText(REMINDER, { timeout: 15000 });
    expect(await b.hasText('Many universities and lecturers ask you to get permission', false), 'the reminder’s text');
    await shot('reminder-1280');
    await b.click('Got it', { exact: true });
    await waitFor(() => has(CONSENT), 'the consent screen', 15000);
    expect((await attr(CONSENT, 'data-layout')) === 'card', `layout ${await attr(CONSENT, 'data-layout')}`);
    expect(await b.hasText('Before you record', true), 'title');
    for (const words of ['ElevenLabs', 'Anthropic (Claude)', 'Not used to train AI models']) expect(await b.hasText(words, false), `missing: ${words}`);
    expect((await attr('[data-consent="allow"]', 'aria-disabled')) === 'true', 'Allow not greyed before the tick');
    await shots('consent-1280');
    await tap('[data-consent="not-now"]');
    await waitFor(async () => !(await has(CONSENT)), 'the consent screen closed');
    expect((await consentRows()).length === 0, `rows after Not now: ${JSON.stringify(await consentRows())}`);
    expect((await aiCalls()).length === 0, `AI calls: ${JSON.stringify(await aiCalls())}`);
    const { data: prof } = await admin.from('profiles').select('preferences').eq('id', user.id).single();
    expect(prof.preferences?.recordingReminderSeen === true, `preferences: ${JSON.stringify(prof.preferences)}`);
    // Again (a reload stops the browser's recording): no reminder, the consent screen again.
    await pressRecord();
    await waitFor(() => has(CONSENT), 'the consent screen the second time', 15000);
    expect(!(await b.hasText(REMINDER, true)), 'the reminder shown twice');
    await tap('[data-consent="not-now"]');
  });

  await step('AI & privacy (iphone-08): off; on → "Before Studiply uses AI" → ticked, Allow → three rows, "Allowed on <date>"', async () => {
    await go('/settings/ai-privacy');
    await waitFor(async () => (await attr('[data-ai-consent]', 'data-ai-consent')) === 'off', 'the card off', 15000);
    expect(await b.hasText('Off · nothing is sent to AI services', true), 'the off line');
    await tap('[data-ai-consent] [role="switch"]');
    await waitFor(() => has(CONSENT), 'the consent screen', 10000);
    expect(await b.hasText('Before Studiply uses AI', true), 'its title from Settings');
    await tap('[data-consent="agree"]');
    await waitFor(async () => (await attr('[data-consent="allow"]', 'aria-disabled')) !== 'true', 'Allow enabled by the tick');
    await tap('[data-consent="allow"]');
    await waitFor(async () => (await attr('[data-ai-consent]', 'data-ai-consent')) === 'on', 'the card on', 10000);
    const rows = await consentRows();
    expect(rows.map((r) => r.scope).sort().join() === 'assistant_summary,images,transcription' && rows.every((r) => r.policy_version === POLICY_VERSION && !r.withdrawn_at), `rows: ${JSON.stringify(rows)}`);
    const since = await b.evaluate(`[...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && /^Allowed on \\d{1,2} \\w{3} \\d{4}$/.test(e.textContent))?.textContent ?? ''`);
    expect(since, 'no "Allowed on <date>"');
    report.push(`RESULT | the card: ${since}`);
    await shots('ai-privacy-1280');
  });

  await step('the switch off (one tap): every row withdrawn, AI off here at once; Record asks again, nothing reached an AI function', async () => {
    await tap('[data-ai-consent] [role="switch"]');
    await waitFor(async () => (await attr('[data-ai-consent]', 'data-ai-consent')) === 'off', 'the card off', 10000);
    await waitFor(async () => (await consentRows()).every((r) => r.withdrawn_at), async () => `rows: ${JSON.stringify(await consentRows())}`);
    expect((await b.evaluate(`localStorage.getItem('studiply.ai.paused.${user.id}')`)) === '1', 'AI not off on this device');
    const before = (await aiCalls()).length;
    await pressRecord();
    await waitFor(() => has(CONSENT), 'asked again', 15000);
    expect((await aiCalls()).length === before, `AI calls before the answer: ${JSON.stringify(await aiCalls())}`);
    await tap('[data-consent="not-now"]');
    report.push(`RESULT | AI calls answered in the page: ${(await aiCalls()).join(', ') || 'none'}`);
  });

  await step('Account (desktop-05): Email, Sign in with Apple Not linked; Delete account… in the red card', async () => {
    await go('/settings/account');
    await waitFor(() => has('[data-apple-linked]'), 'the sign-in methods', 15000);
    expect((await attr('[data-apple-linked]', 'data-apple-linked')) === 'no', 'Apple shown linked');
    expect(await b.hasText('signed in with email', false), 'how she signed in');
    expect(await has('[data-account="delete"]'), 'no Delete account…');
    await shots('account-1280');
  });

  await step('390 (iphone-07, iphone-08, iphone-12): the Settings list (AI & privacy Off, Delete account… under Sign out), the page, the consent screen full screen', async () => {
    await b.resize(390, 844);
    await go('/settings');
    await b.waitText('Delete account…', { timeout: 15000 });
    expect(await b.hasText('Off', true), 'AI & privacy not "Off" in the list');
    const order = await b.evaluate(`(() => { const y = (t) => [...document.querySelectorAll('div')].find((e) => e.childElementCount === 0 && e.textContent === t)?.getBoundingClientRect().top ?? -1; return { out: y('Sign out'), del: y('Delete account…') }; })()`);
    expect(order.del > order.out, `Delete account… not under Sign out: ${JSON.stringify(order)}`);
    await shots('settings-390');
    await go('/settings/ai-privacy');
    await waitFor(() => has('[data-ai-consent="off"]'), 'the card', 15000);
    await shots('ai-privacy-390');
    await tap('[data-ai-consent] [role="switch"]');
    await waitFor(() => has(CONSENT), 'the consent screen at 390', 10000);
    expect((await attr(CONSENT, 'data-layout')) === 'full', `layout ${await attr(CONSENT, 'data-layout')}`);
    expect(!(await has('[data-consent="agree"]')) && (await attr('[data-consent="allow"]', 'aria-disabled')) !== 'true', 'iphone-12 has no checkbox: Allow is the act');
    await shots('consent-390');
    await tap('[data-consent="not-now"]');
    await b.resize(1280, 900);
  });

  await step('Delete account: greyed until DELETE; deleted → signed out; nothing of hers left (auth user, every table, every bucket); called again: still deleted', async () => {
    // Her things: a document, a mark, AI consent (given again), files in the three buckets.
    for (const scope of ['transcription', 'assistant_summary', 'images']) await user.client.from('ai_consent').insert({ scope, policy_version: POLICY_VERSION });
    await user.client.from('marks').insert({ lecture_id: data.lecture.id, type: 'exam', level: 8, t_ms: 1000 });
    const doc = await user.client.from('files').insert({ kind: 'document', title: 'Notes', course_id: data.course.id }).select('id').single();
    await user.client.from('documents').insert({ file_id: doc.data.id, tab: 'notes' });
    const uploads = [
      ['audio-chunks', `${user.id}/${data.lecture.id}/0000.webm`, 'audio/webm'],
      ['slides', `${user.id}/${data.lecture.id}/slides.pdf`, 'application/pdf'],
      ['photos', `${user.id}/${data.lecture.id}/board.jpg`, 'image/jpeg'],
    ];
    for (const [bucket, path, type] of uploads) {
      const { error } = await user.client.storage.from(bucket).upload(path, new Blob([new Uint8Array([1, 2, 3, 4])], { type }), { contentType: type });
      if (error) throw new Error(`upload to ${bucket}: ${error.message}`);
    }
    const token = (await user.client.auth.getSession()).data.session?.access_token;

    await go('/settings/account');
    await tap('[data-account="delete"]');
    await waitFor(() => has('[data-account="delete-sheet"]'), 'the delete sheet');
    expect((await attr('[data-account="confirm-delete"]', 'aria-disabled')) === 'true', 'Delete not greyed before typing');
    await b.fill('[data-account="confirm-field"]', 'delete');
    await waitFor(async () => (await attr('[data-account="confirm-delete"]', 'aria-disabled')) !== 'true', 'Delete enabled by the word');
    await shots('delete-1280');
    await tap('[data-account="confirm-delete"]');
    await b.waitText('Your account was deleted', { timeout: 30000 });
    await b.click('OK', { exact: true });
    await waitFor(async () => (await b.evaluate('location.pathname')).includes('onboarding'), 'signed out', 15000);

    const { data: gone } = await admin.auth.admin.getUserById(user.id);
    expect(!gone?.user, 'the auth user is still there');
    const left = {};
    for (const table of ['profiles', 'courses', 'course_settings', 'folders', 'files', 'lectures', 'documents', 'marks', 'ai_consent', 'ai_usage', 'audio_chunks', 'media', 'summaries', 'flashcards', 'quizzes']) {
      const column = table === 'profiles' ? 'id' : 'user_id';
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(column, user.id);
      if (count) left[table] = count;
    }
    expect(Object.keys(left).length === 0, `rows left: ${JSON.stringify(left)}`);
    for (const bucket of ['audio-chunks', 'slides', 'photos']) {
      const { data: top } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      expect(!(top ?? []).length, `files left in ${bucket}: ${JSON.stringify(top)}`);
    }
    // Idempotent: her old token, once more.
    const again = await fetch(`${supabaseEnv.url}/functions/v1/delete-account`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm: 'DELETE' }) });
    const body = await again.json().catch(() => ({}));
    expect(again.status === 200 && body.deleted === true, `called again: ${again.status} ${JSON.stringify(body)}`);
    report.push('RESULT | deleted: no auth user, no rows, no files; a second call answers deleted');
  });

  await step('composites beside the mockups (light and dark)', async () => {
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
    const trio = (mockName, label, shotName) => [
      [`${mockName} (mockup)`, mock(mockName)],
      [`${label} · light`, shotOf(shotName)],
      [`${label} · dark`, shotOf(`${shotName}-dark`)],
    ];
    await compose('account-compose-signin-1280', trio('desktop-06-sign-in', 'Sign in', 'auth-signin-1280'), 560);
    await compose('account-compose-signin-390', trio('iphone-11-welcome', 'Sign in (web at 390; the welcome is native)', 'auth-signin-390'), 390);
    await compose('account-compose-consent-1280', trio('desktop-09-ai-consent', 'Before you record', 'consent-1280'), 560);
    await compose('account-compose-consent-390', trio('iphone-12-ai-consent', 'Consent at 390', 'consent-390'), 390);
    await compose('account-compose-ai-privacy-390', trio('iphone-08-ai-privacy', 'AI & privacy', 'ai-privacy-390'), 390);
    await compose('account-compose-settings-390', trio('iphone-07-settings', 'Settings', 'settings-390'), 390);
    await compose('account-compose-account-1280', [...trio('desktop-05-settings', 'Account', 'account-1280'), ['AI & privacy · light', shotOf('ai-privacy-1280')], ['Delete account', shotOf('delete-1280')]], 560);
    await b.resize(1280, 900);
    const wanted = ['auth-signin-1280', 'auth-signin-390', 'consent-1280', 'consent-390', 'ai-privacy-1280', 'ai-privacy-390', 'settings-390', 'account-1280', 'delete-1280'].flatMap((n) => [n, `${n}-dark`]);
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
