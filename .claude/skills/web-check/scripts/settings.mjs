// settings.mjs — Settings in sections (step 3.6, docs/design desktop-05 and
// iphone-07). Laptop: /settings opens Account beside the section menu; every
// section opens from the menu (highlighted) at its own route and holds every
// setting moved from the old General, Manage Account and Security screens
// (found by name); Your data → Recently Deleted opens in the right column
// with "‹ Your data". iPhone (390 px): the list with a value on the right of
// each row, a page with "‹ Settings" and back, the profile card opening
// Account, Sign out. Screenshots: settings-*.png. Exit 1 on any FAIL.
// Step 10.1: Account has the sign-in methods and Delete account…; AI & privacy the "Use AI on my
// lectures" card (its row in the iPhone list says Allowed / Off); Recording the recording reminder.
import { launch, SHOTS } from './cdp.mjs';
import { makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-settings-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const pathname = () => b.evaluate('location.pathname');
const ACCENT_LIGHT = 'rgb(234, 232, 247)'; // colors.accentLight (light)
const MENU = '[data-testid=settings-menu]';

/** Every setting that was on the old screens, by the section it is in now. */
const SECTIONS = [
  ['Account', '/settings/account', ['Edit profile', 'Sign in with Apple', 'Not linked', 'stored in your Studiply account in the cloud', 'Sign out', 'Delete account…']],
  ['Summaries', '/settings/summaries', ['Default summary level', 'Minimal', 'Detailed', 'Auto-generate title from content', 'Auto-generate tags', 'Extract formulas', 'Extract definitions', 'Flag unclear sections']],
  ['Recording', '/settings/recording', ['Default recording mode', 'Lecture', 'Discussion', 'Start in Lecture Mode', 'Default transcription language', 'Check that you may record this class']],
  ['AI & privacy', '/settings/ai-privacy', ['Use AI on my lectures', 'ElevenLabs', 'Anthropic (Claude)', 'AI USAGE TODAY', 'Transcription', 'Notes & assistant (Claude)', 'About these limits']],
  // Step 10.1b-3: the default first, named for when it deletes.
  ['Storage & sync', '/settings/storage', ['Source files', 'Default file retention', 'Delete 3 days after transcription', 'Delete immediately', 'Delete manually', 'Keep permanently', 'Delete data on this device']],
  ['Notifications', '/settings/notifications', ['Reminders come with Review']],
  ['Appearance', '/settings/appearance', ['Light or dark, on this device', 'System', 'Light', 'Dark', 'Keyboard shortcuts']],
  ['Your data', '/settings/your-data', ['Recently Deleted']],
  ['Development', '/settings/development', ['Server:', 'Simulate offline', 'Drag debug overlay', 'Drag: plain ScrollView']],
];

/** Clicks a menu item by its text. */
const menuClick = (label) =>
  b.evaluate(`(() => {
    const el = [...document.querySelectorAll('${MENU} [role=link]')].find((e) => e.innerText.trim() === ${JSON.stringify(label)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
const highlighted = () =>
  b.evaluate(`[...document.querySelectorAll('${MENU} [role=link]')]
    .filter((e) => getComputedStyle(e).backgroundColor === ${JSON.stringify(ACCENT_LIGHT)})
    .map((e) => e.innerText.trim())`);
const pageText = () =>
  b.evaluate(`(() => {
    const menu = document.querySelector('${MENU}')?.innerText ?? '';
    return document.body.innerText.replace(menu, '');
  })()`);

const user = await makeUser();
await seed(user.client);
const b = await launch({ width: 1280, height: 900 });
try {
  await b.signIn(BASE, user.email, user.password);

  await step('laptop: /settings opens Account beside the section menu', async () => {
    await b.nav(`${BASE}/settings`);
    await b.waitText('Edit profile', { timeout: 20000 });
    await b.sleep(2500); // splash after the reload
    expect((await pathname()) === '/settings/account', `at ${await pathname()}`);
    const menu = await b.evaluate(`[...document.querySelectorAll('${MENU} [role=link]')].map((e) => e.innerText.trim())`);
    expect(JSON.stringify(menu) === JSON.stringify(SECTIONS.map(([l]) => l)), `menu: ${menu}`);
    expect(JSON.stringify(await highlighted()) === '["Account"]', `highlighted: ${await highlighted()}`);
    expect(await b.hasText(user.email, false), 'no email on the profile card');
    await b.shot('settings-1280-account');
  });

  await step('laptop: every section opens from the menu with everything moved into it', async () => {
    const missing = [];
    for (const [label, path, texts] of SECTIONS) {
      expect(await menuClick(label), `no menu item ${label}`);
      await b.waitText(texts[0], { timeout: 8000 });
      expect((await pathname()) === path, `${label} at ${await pathname()}`);
      expect(JSON.stringify(await highlighted()) === JSON.stringify([label]), `${label}: highlighted ${await highlighted()}`);
      // Some sections load first (usage, saved settings): wait until everything is there.
      let absent = texts;
      for (let i = 0; i < 40 && absent.length; i++) {
        const text = await pageText();
        absent = texts.filter((t) => !text.includes(t));
        if (absent.length) await b.sleep(200);
      }
      missing.push(...absent.map((t) => `${label}: ${t}`));
      await b.shot(`settings-1280-${path.split('/').pop()}`);
    }
    expect(missing.length === 0, `missing: ${missing.join('; ')}`);
  });

  await step('laptop: Your data → Recently Deleted opens in the right column, with ‹ Your data', async () => {
    await menuClick('Your data');
    await b.waitText('Items are kept for 30 days', { timeout: 8000 });
    await b.click('Recently Deleted', { exact: true, exclude: MENU });
    await b.waitText('Items are deleted automatically after 30 days.', { timeout: 8000 });
    expect((await pathname()) === '/settings/trash', `at ${await pathname()}`);
    expect(JSON.stringify(await highlighted()) === '["Your data"]', `highlighted: ${await highlighted()}`);
    await b.shot('settings-1280-trash');
    await b.clickSelector('[aria-label="Back to Your data"]');
    await b.waitText('Items are kept for 30 days', { timeout: 8000 });
    expect((await pathname()) === '/settings/your-data', `back at ${await pathname()}`);
  });

  await step('iPhone (390 px): the list with a value on the right of each row (AI & privacy: Off, step 10.1), Delete account… under Sign out', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/settings`);
    await b.waitText('Account, sign-in and sync', { timeout: 20000 });
    await b.sleep(2500);
    const rowsNow = () => b.evaluate(`[...document.querySelectorAll('[role=button][aria-label]')].map((e) => e.getAttribute('aria-label'))`);
    let rows = await rowsNow();
    for (let i = 0; i < 40 && !rows.includes('AI & privacy, Off'); i++) {
      await b.sleep(250);
      rows = await rowsNow();
    }
    for (const want of ['Summaries, Standard', 'Recording, English', 'Storage & sync, No files', 'Appearance, System', 'Development, LOCAL', 'Notifications', 'Your data', 'AI & privacy, Off']) {
      expect(rows.includes(want), `no row "${want}" in ${rows}`);
    }
    expect(await b.hasText('Sign out', true), 'no Sign out');
    expect(await b.hasText('Delete account…', true), 'no Delete account…');
    await b.shot('settings-390-list');
  });

  await step('iPhone: a row opens its page, ‹ Settings goes back; the profile card opens Account', async () => {
    await b.clickSelector('[aria-label="Summaries, Standard"]');
    await b.waitText('Default summary level', { timeout: 8000 });
    expect((await pathname()) === '/settings/summaries', `at ${await pathname()}`);
    expect(await b.hasText('Settings', true), 'no ‹ Settings');
    await b.shot('settings-390-summaries');
    await b.clickSelector('[aria-label="Back to Settings"]');
    await b.waitText('Account, sign-in and sync', { timeout: 8000 });
    expect((await pathname()) === '/settings', `back at ${await pathname()}`);
    await b.click('Account, sign-in and sync');
    await b.waitText('Edit profile', { timeout: 8000 });
    expect((await pathname()) === '/settings/account', `profile card went to ${await pathname()}`);
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
