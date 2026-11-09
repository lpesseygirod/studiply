// a11y.mjs — step 10.1b-5, accessibility in Chrome against local Supabase. No AI call (every AI function
// is answered in the page and counted), no Edge Function.
//
// Steps (each prints what it found, so a failure says exactly which control, colours or key):
//   1. Signed out, 1280 and 390: sign-up and /privacy — every control has a name (role button, link,
//      checkbox, radio, switch, tab, menuitem, img: aria-label, labelledby, alt, title or its text).
//   2. Signed in, 1280: library, a course, a document, Record, Review, Settings (Account, Storage &
//      sync, Appearance, Your data), the AI consent screen — names, and checked / selected state
//      exposed (aria-checked on every radio, checkbox and switch).
//   3. 390: library, Settings list, Your data, the document — names.
//   4. Contrast sampling, light and dark (1280: library, Settings → Account, the document, /privacy):
//      every visible text against its nearest solid background, ≥ 4.5:1 (3:1 large text, and 3:1 for
//      icons drawn as font glyphs: graphics, WCAG 1.4.11). Text on the gradient (no solid background
//      behind it) is left to the token tests.
//   5. Keyboard, 1280: Tab through the library and the document: the focus moves forward through
//      visible controls (no trap, nothing hidden), each with a visible focus ring (outline or the
//      ring's halo); in the document, Tab reaches the toolbar and then the page.
//   6. Escape closes every overlay opened here: the library's New menu, a course's right-click menu,
//      the keyboard shortcuts (?), each editor toolbar popover, the Delete account and Export my
//      data sheets, Edit profile, the AI consent screen (Escape = Not now), the legal sheet on
//      sign-up.
//   7. Composites (focus rings and sheets), light and dark.
//
// The run always ends (its Chrome closed, the process exits), also after failures, or after 15 minutes.
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/a11y.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
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
    await b.shot(`fail-a11y-${results.length}`).catch(() => {});
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
const data = await seed(user.client);
await user.client.from('documents').insert({
  file_id: data.lecture.id,
  tab: 'notes',
  content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Funciones' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Una función relaciona cada x con un único y.' }] }] },
});

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
  console.error('a11y.mjs: still running after 15 minutes; stopping');
  void finish(1);
}, 15 * MIN).unref();

await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const aiCalls = async () => (await b.evaluate('window.__aiCalls').catch(() => [])) ?? [];
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
  await b.sleep(1200);
};
/** Clicks the first element matching `css` that is really on top where it is drawn. */
const tapTop = async (css, button = 'left') => {
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
  await b.sleep(200);
  if (button === 'right') {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', buttons: 2, clickCount: 1 });
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', buttons: 0, clickCount: 1 });
  } else await b.clickAt(p.x, p.y);
  await b.sleep(500);
};

// ── In the page ──────────────────────────────────────────────────────────

/** Visible controls without a name, and radios / checkboxes / switches without aria-checked. */
const UNNAMED = `(() => {
  const ROLES = '[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=img],button,a[href],img';
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (e.closest('[aria-hidden="true"]')) return false;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    // Covered by a modal on top (a screen below a sheet): what is on top is checked instead.
    const x = Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1);
    if (r.bottom < 0 || r.top > innerHeight) return true;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === e || e.contains(hit) || hit.contains(e));
  };
  const nameOf = (e) => {
    const label = e.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = e.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ').trim();
      if (t) return t;
    }
    const alt = e.getAttribute('alt') || e.getAttribute('title');
    if (alt && alt.trim()) return alt.trim();
    return (e.innerText ?? '').trim();
  };
  const describe = (e) => (e.getAttribute('role') || e.tagName.toLowerCase()) + ' ' + e.outerHTML.slice(0, 160).replace(/\\s+/g, ' ');
  const unnamed = [];
  const noState = [];
  for (const e of document.querySelectorAll(ROLES)) {
    if (!visible(e)) continue;
    if (!nameOf(e)) unnamed.push(describe(e));
    const role = e.getAttribute('role');
    if ((role === 'radio' || role === 'checkbox' || role === 'switch') && e.tagName !== 'INPUT' && !e.hasAttribute('aria-checked')) noState.push(describe(e));
  }
  return { unnamed, noState };
})()`;

/** Visible text against its nearest solid background (below the app's root), with the WCAG thresholds. */
const CONTRAST = `(() => {
  const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const root = document.getElementById('root') || document.body;
  const background = (el) => {
    for (let n = el; n && n !== root && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parse(s.backgroundColor);
      if (c && c[3] >= 0.99) return c;
      if (c && c[3] > 0.01) return null; // see-through: unknown
    }
    return null;
  };
  const failing = [];
  let checked = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || seen.has(el) || !t.textContent.trim()) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    if (el.closest('[aria-hidden="true"],[aria-disabled="true"],[contenteditable="true"] [data-placeholder]')) continue;
    let opacity = 1;
    let hidden = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= Number(s.opacity);
      if (s.display === 'none' || s.visibility === 'hidden') hidden = true;
    }
    if (hidden || opacity < 0.95) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg || fg[3] < 0.99) continue;
    const bg = background(el);
    if (!bg) continue;
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 600;
    // An icon drawn as a font glyph (the icon fonts' private-use characters) is a graphic: WCAG 1.4.11
    // asks 3:1 of it, as of large text; real text 4.5:1.
    const text = t.textContent.trim();
    const icon = /^[\\uE000-\\uF8FF\\u{F0000}-\\u{10FFFD}]+$/u.test(text) || /ionicons|material|feather|fontawesome|antdesign|entypo|octicons/i.test(s.fontFamily);
    const min = icon || size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    const q = ratio(fg, bg);
    checked++;
    const shown = icon ? \`icon \${s.fontFamily.split(',')[0]} U+\${text.codePointAt(0).toString(16).toUpperCase()}\` : \`"\${text.slice(0, 40)}"\`;
    if (q < min) failing.push(\`\${shown} rgb(\${fg.slice(0, 3).join(',')}) on rgb(\${bg.slice(0, 3).join(',')}): \${q.toFixed(2)} < \${min}\`);
  }
  return { checked, failing: [...new Set(failing)] };
})()`;

/** What has the focus now, and whether its ring shows. */
const FOCUSED = `(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || /0px 0px 0px [1-9]/.test(s.boxShadow);
  const editable = e.isContentEditable || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
  const label = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('role') || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  return { label, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), ring, editable, toolbar: !!e.closest('[role=toolbar]') };
})()`;

const dialogs = () => b.evaluate(`[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length`);

async function names(where) {
  const { unnamed, noState } = await b.evaluate(UNNAMED);
  expect(unnamed.length === 0, `${where}: ${unnamed.length} control(s) without a name:\n    ${unnamed.slice(0, 12).join('\n    ')}`);
  expect(noState.length === 0, `${where}: ${noState.length} radio/checkbox/switch without aria-checked:\n    ${noState.slice(0, 12).join('\n    ')}`);
}

async function tabThrough(where, count) {
  await b.evaluate(`document.activeElement?.blur(); window.scrollTo(0, 0)`);
  const seq = [];
  for (let i = 0; i < count; i++) {
    await b.press('Tab');
    const f = await b.evaluate(FOCUSED);
    if (f) seq.push(f);
  }
  report.push(`RESULT | ${where} Tab order: ${seq.map((f) => f.label || '?').join(' → ')}`);
  return seq;
}

/** Opens an overlay with `open`, then Escape must close it (no dialog left, or `closed` true). */
async function escapeCloses(name, open, closed = async () => (await dialogs()) === 0) {
  await open();
  await waitFor(async () => (await dialogs()) > 0, `${name}: nothing opened`, 8000);
  await b.press('Escape');
  await waitFor(closed, `${name}: Escape did not close it`, 5000);
  report.push(`RESULT | Escape closes: ${name}`);
}

try {
  await step('signed out (1280, 390): sign-up and /privacy — every control named', async () => {
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      await b.resize(w, h);
      await go('/');
      await b.waitText('Create account', { timeout: 30000 });
      await names(`sign-up ${w}`);
      await go('/privacy');
      await waitFor(() => has('[data-legal-page="privacy"]'), '/privacy', 15000);
      await names(`/privacy ${w}`);
    }
    await b.resize(1280, 900);
  });

  await step('Escape on sign-up: the legal sheet closes, the form stays', async () => {
    await go('/');
    await b.waitText('Create account', { timeout: 30000 });
    await escapeCloses('the legal sheet (sign-up)', () => tapTop('[data-legal-link="privacy"]'));
    expect(await b.hasText('Create account', false), 'the form went with the sheet');
  });

  await b.signIn(BASE, user.email, user.password);

  await step('signed in, 1280: library, a course, the document, Record, Review, Settings — every control named, every choice exposes its state', async () => {
    await b.resize(1280, 900);
    const screens = [
      ['library', '/library'],
      ['a course', `/project/${data.course.id}`],
      ['the document', `/doc/${data.lecture.id}`],
      ['Record', '/record'],
      ['Review', '/review'],
      ['Settings → Account', '/settings/account'],
      ['Settings → Storage & sync', '/settings/storage'],
      ['Settings → Appearance', '/settings/appearance'],
      ['Settings → Summaries', '/settings/summaries'],
      ['Settings → Recording', '/settings/recording'],
      ['Settings → Your data', '/settings/your-data'],
    ];
    const problems = [];
    for (const [name, path] of screens) {
      await go(path);
      try {
        await names(`${name} (1280)`);
      } catch (err) {
        problems.push(err.message);
      }
    }
    expect(problems.length === 0, problems.join('\n  '));
  });

  await step('the AI consent screen (1280): named controls, the checkbox exposes its state; Escape is Not now', async () => {
    await go('/settings/ai-privacy');
    await waitFor(() => has('[data-ai-consent] [role="switch"]'), 'the AI switch', 15000);
    await tapTop('[data-ai-consent] [role="switch"]');
    await waitFor(() => has('[data-consent="screen"]'), 'the consent screen', 10000);
    await names('the consent screen');
    expect((await b.evaluate(`document.querySelector('[data-consent="agree"]')?.getAttribute('aria-checked')`)) === 'false', 'the consent checkbox has no aria-checked');
    await b.press('Escape');
    await waitFor(async () => !(await has('[data-consent="screen"]')), 'Escape closed the consent screen', 5000);
    report.push('RESULT | Escape closes: the AI consent screen (Not now)');
  });

  await step('390: library, Settings list, Your data, the document — every control named', async () => {
    await b.resize(390, 844);
    const problems = [];
    for (const [name, path] of [['library', '/library'], ['Settings list', '/settings'], ['Your data', '/settings/your-data'], ['the document', `/doc/${data.lecture.id}`]]) {
      await go(path);
      try {
        await names(`${name} (390)`);
      } catch (err) {
        problems.push(err.message);
      }
    }
    await b.resize(1280, 900);
    expect(problems.length === 0, problems.join('\n  '));
  });

  await step('contrast sampling, light and dark (1280: library, Account, the document, /privacy)', async () => {
    const failing = [];
    let checked = 0;
    for (const theme of [false, true]) {
      await dark(theme);
      for (const path of ['/library', '/settings/account', `/doc/${data.lecture.id}`, '/privacy']) {
        await go(path);
        const r = await b.evaluate(CONTRAST);
        checked += r.checked;
        failing.push(...r.failing.map((f) => `${theme ? 'dark' : 'light'} ${path}: ${f}`));
      }
    }
    await dark(false);
    report.push(`RESULT | contrast: ${checked} texts checked on a solid background, ${failing.length} below the line`);
    expect(checked > 50, `only ${checked} texts sampled`);
    expect(failing.length === 0, `${failing.length} text(s) below contrast:\n    ${failing.slice(0, 20).join('\n    ')}`);
  });

  await step('keyboard (1280): Tab through the library — forward through visible controls, each with a visible ring', async () => {
    await go('/library');
    const seq = await tabThrough('library', 25);
    expect(seq.length >= 15, `Tab reached only ${seq.length} elements`);
    const distinct = new Set(seq.map((f) => `${f.label}@${f.x},${f.y}`));
    expect(distinct.size >= 12, `Tab is stuck: ${[...distinct].join(', ')}`);
    const hidden = seq.filter((f) => f.w === 0 || f.h === 0);
    expect(hidden.length === 0, `focus went to hidden elements: ${hidden.map((f) => f.label).join(', ')}`);
    const noRing = seq.filter((f) => !f.editable && !f.ring);
    expect(noRing.length === 0, `no visible ring on: ${noRing.map((f) => f.label).join(', ')}`);
    await shot('a11y-focus-library-1280');
    await dark(true);
    await shot('a11y-focus-library-1280-dark');
    await dark(false);
  });

  await step('keyboard (1280): Tab through the document — the toolbar, then the page; a ring on every control', async () => {
    await go(`/doc/${data.lecture.id}`);
    const seq = await tabThrough('the document', 70);
    expect(seq.some((f) => f.toolbar), 'Tab never reached the editor toolbar');
    const firstToolbar = seq.findIndex((f) => f.toolbar);
    const page = seq.findIndex((f) => f.editable);
    expect(page > -1, 'Tab never reached the page (the text)');
    report.push(`RESULT | document: toolbar at Tab ${firstToolbar + 1}, the page at Tab ${page + 1}`);
    const noRing = seq.filter((f) => !f.editable && !f.ring);
    expect(noRing.length === 0, `no visible ring on: ${[...new Set(noRing.map((f) => f.label))].join(', ')}`);
    // A toolbar button with the focus, for the composite.
    await b.evaluate(`document.activeElement?.blur()`);
    for (let i = 0; i < seq.length && i <= firstToolbar; i++) await b.press('Tab');
    await shot('a11y-focus-editor-1280');
    await dark(true);
    await shot('a11y-focus-editor-1280-dark');
    await dark(false);
  });

  await step('Escape closes every overlay opened here (library, course menu, shortcuts, editor popovers, Settings sheets)', async () => {
    const failed = [];
    const attempt = async (name, fn) => {
      try {
        await fn();
      } catch (err) {
        failed.push(`${name}: ${err.message}`);
        await b.press('Escape').catch(() => {});
      }
    };
    await go('/library');
    await attempt('the New menu', () => escapeCloses('the New menu', () => tapTop('[aria-label="New"]')));
    await attempt('a course’s right-click menu', () => escapeCloses('a course’s menu', async () => {
      await b.click('Math', { button: 'right' });
    }));
    await attempt('the keyboard shortcuts', () => escapeCloses('the keyboard shortcuts', async () => {
      await b.evaluate(`document.activeElement?.blur()`);
      await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '?', code: 'Slash', text: '?', modifiers: 8, windowsVirtualKeyCode: 191 });
      await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '?', code: 'Slash', modifiers: 8, windowsVirtualKeyCode: 191 });
    }));

    // The editor's toolbar: every button that opens a popover.
    await go(`/doc/${data.lecture.id}`);
    const buttons = await b.evaluate(`[...document.querySelectorAll('[role=toolbar] [role=button]')].map((e) => e.getAttribute('aria-label') || '').filter((l) => l && !/photo|image|picture|undo|redo|record|more tools|fewer tools|bold|italic|underline|strike/i.test(l))`);
    let popovers = 0;
    for (const label of [...new Set(buttons)]) {
      await attempt(`toolbar “${label}”`, async () => {
        const before = await dialogs();
        await tapTop(`[role=toolbar] [aria-label=${JSON.stringify(label)}]`);
        if ((await dialogs()) <= before) {
          await b.press('Escape');
          return; // not a popover (a toggle, or it inserts something)
        }
        popovers++;
        await b.press('Escape');
        await waitFor(async () => (await dialogs()) <= before, 'Escape did not close it', 5000);
      });
    }
    report.push(`RESULT | Escape closes: ${popovers} editor toolbar popovers`);

    await go('/settings/account');
    await attempt('Export my data', () => escapeCloses('the Export my data sheet', () => tapTop('[data-export-data="open"]')));
    await attempt('Delete account', () => escapeCloses('the Delete account sheet', () => tapTop('[data-account="delete"]')));
    await attempt('Edit profile', () => escapeCloses('Edit profile', () => b.click('Edit profile', { exact: true })));
    expect(failed.length === 0, `\n    ${failed.join('\n    ')}`);
    expect((await aiCalls()).length === 0, `AI calls: ${JSON.stringify(await aiCalls())}`);
  });

  await step('composites: the focus ring in the library and the editor, light and dark', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    await b.nav('about:blank');
    const cells = [
      ['Library · Tab · light', shotOf('a11y-focus-library-1280')],
      ['dark', shotOf('a11y-focus-library-1280-dark')],
      ['Editor toolbar · Tab · light', shotOf('a11y-focus-editor-1280')],
      ['dark', shotOf('a11y-focus-editor-1280-dark')],
    ];
    const w = 560;
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
    await b.shot('a11y-compose-focus');
    await b.resize(1280, 900);
    const missing = cells.filter(([, src]) => !src).map(([l]) => l);
    expect(missing.length === 0, `not taken: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  for (const r of results) console.log(r.join(' | '));
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  await finish(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
}
