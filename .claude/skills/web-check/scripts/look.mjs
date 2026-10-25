// look.mjs — step 2.3 look and feel: light and dark (the dimmed gradient,
// dark-grey cards), the Appearance setting overriding the system and
// surviving a reload, 44 pt named icon buttons at 390 px, and the web
// keyboard shortcuts (⌥R, ⌥⇧N, ⌥N, /, ?, Esc; nothing while typing).
// Screenshots: look-*.png (both appearances, 390 and 1280). Exit 1 on FAIL.
import { launch, SHOTS } from './cdp.mjs';
import { admin, makeUser, seed, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-look-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = { exclude: '[data-testid=sidebar]' };

// From src/constants/colors.ts
const LIGHT = { card: 'rgb(255, 255, 255)', gradientTop: 'rgb(184, 181, 228)' };
const DARK = { card: 'rgb(38, 37, 51)', gradientTop: 'rgb(143, 139, 196)' };

const open = async (path, text) => {
  await b.nav(`${BASE}${path}`);
  await b.waitText(text, { timeout: 20000 });
  await b.sleep(2500); // splash after the reload
};
const scheme = (value) =>
  b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
/** The background of the nearest painted box around a text (a card or row). */
const cardBehind = (text) =>
  b.evaluate(`(() => {
    const el = [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.innerText?.trim() === ${JSON.stringify(text)} && !e.closest('[data-testid=sidebar]'));
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return null;
  })()`);
const gradientShown = () =>
  b.evaluate(`[...document.querySelectorAll('body *')].map((e) => getComputedStyle(e).backgroundImage).filter((g) => g.includes('gradient')).join(' ')`);
const path = () => b.evaluate('location.pathname + location.search');

const user = await makeUser();
const data = await seed(user.client);
await admin.from('lectures').update({ status: 'ready' }).eq('id', data.lecture.id);
await admin.from('summaries').insert({
  user_id: user.id, file_id: data.lecture.id, mode: 'new', sliders: {},
  result: { format: 'legacy-note-v1', title: 'Lecture 1', summary: 'A short note.', isConfirmed: true },
});
await admin.from('media').insert({ user_id: user.id, lecture_id: data.lecture.id, kind: 'photo', storage_path: `${user.id}/${data.lecture.id}/p1.jpg` });

const b = await launch({ width: 1280, height: 900 });

try {
  await step('sign in', async () => {
    await b.signIn(BASE, user.email, user.password);
  });

  await step('Light: the gradient and white cards', async () => {
    await scheme('light');
    await open('/library', 'COURSES');
    expect((await cardBehind('Science')) === LIGHT.card, `card ${await cardBehind('Science')}`);
    expect((await gradientShown()).includes(LIGHT.gradientTop), 'light gradient not shown');
  });

  await step('Dark (system): the dimmed gradient and dark-grey cards', async () => {
    await scheme('dark');
    await b.sleep(800);
    expect((await cardBehind('Science')) === DARK.card, `card ${await cardBehind('Science')}`);
    expect((await gradientShown()).includes(DARK.gradientTop), 'dark gradient not shown');
  });

  await step('Appearance → Light overrides a dark system, and survives a reload; System follows it again', async () => {
    await open('/settings/general', 'APPEARANCE');
    await b.click('Light', { exact: true, ...MAIN });
    await b.sleep(800);
    await open('/library', 'COURSES');
    expect((await cardBehind('Science')) === LIGHT.card, 'Light not applied after reload');
    await open('/settings/general', 'APPEARANCE');
    await b.click('System', { exact: true, ...MAIN });
    await b.sleep(800);
    await open('/library', 'COURSES');
    expect((await cardBehind('Science')) === DARK.card, 'System did not follow the dark system again');
  });

  for (const [w, h] of [[390, 844], [1280, 900]]) {
    await step(`Screenshots at ${w} px, light and dark`, async () => {
      await b.resize(w, h);
      for (const s of ['light', 'dark']) {
        await scheme(s);
        for (const [name, p, text] of [
          ['library', '/library', 'COURSES'],
          ['course', `/project/${data.course.id}`, 'Funcions'],
          ['note', `/note/${data.lecture.id}`, 'Summary'],
          ['search', '/search', 'Cancel'],
          ['settings', '/settings', 'General'],
          ['review', '/review', 'Quizzes and flashcards'],
          ['post-session', `/record/post-session?sessionId=${data.lecture.id}&title=Lecture%201`, 'Post-Session'],
        ]) {
          await open(p, text);
          await b.shot(`look-${name}-${w}-${s}`);
        }
        await open('/library', 'COURSES');
        await b.click('Science', { button: 'right', ...MAIN });
        await b.waitText('Add to Favorites', { exact: true });
        await b.shot(`look-menu-${w}-${s}`);
        await b.press('Escape');
      }
    });
  }

  await step('iPhone (390 px): every icon-only button is named and at least 44×44', async () => {
    await b.resize(390, 844);
    await scheme('light');
    const bad = [];
    for (const [p, text] of [
      ['/library', 'COURSES'], [`/project/${data.course.id}`, 'Funcions'], [`/note/${data.lecture.id}`, 'Summary'],
      ['/settings', 'General'], ['/settings/account', 'PROFILE'], ['/settings/general', 'APPEARANCE'],
      ['/settings/security', 'SESSION'], ['/settings/trash', 'Recently Deleted'], ['/search', 'Cancel'], ['/review', 'Review'],
      [`/record/post-session?sessionId=${data.lecture.id}&title=Lecture%201`, 'Post-Session'],
    ]) {
      await open(p, text);
      const found = await b.evaluate(`[...document.querySelectorAll('[role=button],button,a')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || (el.innerText || '').trim()) return false;
        return !el.getAttribute('aria-label') || r.width < 44 || r.height < 44;
      }).map((el) => (el.getAttribute('aria-label') || 'no label') + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height))`);
      bad.push(...found.map((f) => `${p.split('?')[0]}: ${f}`));
    }
    expect(bad.length === 0, bad.join('; '));
  });

  await step('⌥R on a course opens recording setup with it chosen (Option types ®: matched by key)', async () => {
    await b.resize(1280, 900);
    await open(`/project/${data.course.id}`, 'Funcions');
    await b.chord({ code: 'KeyR', key: '®', alt: true });
    await b.sleep(800);
    expect((await path()).startsWith(`/record?projectId=${data.course.id}`), await path());
  });

  await step('⌥⇧N on a course opens New Folder; elsewhere it says to open a course', async () => {
    await open(`/project/${data.course.id}`, 'Funcions');
    await b.chord({ code: 'KeyN', key: 'ˆ', alt: true, shift: true });
    expect(await b.evaluate(`!!document.querySelector('input[placeholder="Folder name"]')`), 'no New Folder dialog');
    await open('/library', 'COURSES');
    await b.chord({ code: 'KeyN', key: 'ˆ', alt: true, shift: true });
    expect(await b.hasText('Open a course to make a folder in it.', true), 'no hint');
    await b.press('Escape');
  });

  await step('⌥N says new documents come with the editor', async () => {
    await b.chord({ code: 'KeyN', key: '˜', alt: true });
    expect(await b.hasText('New documents come with the editor. Coming soon.', true), 'no note');
    await b.press('Escape');
  });

  await step('"/" opens Search with the field focused; typing "/" or ⌥R in the field just types', async () => {
    await b.chord({ code: 'Slash', key: '/', text: '/' });
    await b.sleep(800);
    expect((await path()) === '/search', await path());
    expect((await b.evaluate('document.activeElement?.tagName')) === 'INPUT', 'field not focused');
    await b.chord({ code: 'Slash', key: '/', text: '/' });
    await b.chord({ code: 'KeyR', key: '®', alt: true, text: '®' });
    expect((await path()) === '/search', `left Search: ${await path()}`);
    expect((await b.evaluate('document.activeElement?.value')) === '/®', 'the field did not get the typing');
  });

  await step('"?" opens the shortcuts sheet; Esc closes it', async () => {
    await b.evaluate('document.activeElement.blur()');
    await b.chord({ code: 'Slash', key: '?', shift: true, text: '?' });
    expect(await b.evaluate(`!!document.querySelector('[data-testid=shortcuts-sheet]')`), 'no sheet');
    await b.shot('look-shortcuts');
    await b.press('Escape');
    await b.sleep(400);
    expect(!(await b.evaluate(`!!document.querySelector('[data-testid=shortcuts-sheet]')`)), 'sheet still open');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
