// ask-claude.mjs — step 6.3 in Chrome against local Supabase, with no paid
// call: assistant-chat's 'selection' answers are made in the page (JSON, as
// the function answers), and nothing reaches the server's functions.
//
// Steps:
//   1. laptop (1280), a plain document: select a paragraph → "✦ Ask Claude"
//      in the selection bar → Explain simpler → the card under the selection
//      with the suggestion, the range highlighted → Reject: nothing changed
//      → ask again → Accept: the paragraph is the second version, now the
//      student's (data-origin student); one Undo brings the old text back
//      (BUILD-PLAN 6.3's check: reject one simpler version, accept another).
//      With the assistant panel open, the selection bar and the card (Accept
//      and Reject too) are fully inside the editor as seen (bounding boxes),
//      light and dark. At every width the bar shows all its buttons.
//   2. Give an example → Accept: an Example box (ai) after the paragraph.
//   3. Rewrite section, then the text edited before Accept: the card says it
//      changed, "Insert below" puts a "From the study assistant" box (ai)
//      below, the edit stays.
//   4. Make flashcard → the cards (not editable) → Save cards → "1 flashcard
//      saved", a flashcards row (source selection), no review schedule.
//   5. What each request carried: mode selection, the document, the action,
//      the text (a formula as $…$) and its paragraph.
//   6. A lecture after class (Lecture 1): the assistant panel's Add to notes
//      puts a "From the study assistant · m:ss" box (ai) at the end of My
//      notes, "Added ✓"; offline, Ask Claude says it needs the internet and
//      sends nothing.
//   7. 390 px: Go deeper through the same menu → the suggestion in a sheet
//      → Accept: an "Added context" box; the assistant sheet's Add to notes.
//   8. No request reached assistant-chat on the server, nor Anthropic.
//   9. Composites SIDE BY SIDE with the mockups, light and dark:
//      shots/ask-compare-1280-document.png (desktop-03: the boxes; the card),
//      shots/ask-compare-1280-assistant.png (desktop-01: the panel, Added ✓
//      and the box in My notes), shots/ask-compare-390.png (iphone-06: the
//      box in My notes; iphone-04: the assistant sheet; the suggestion sheet).
//
// Run with Lea's dev server on 8123 and `supabase start`:
//   node .claude/skills/web-check/scripts/ask-claude.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const report = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-ask-${results.length}`).catch(() => {});
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
    await b.sleep(150);
  }
}

const repo = join(fileURLToPath(scripts), '../../../../');
const policy = readFileSync(join(repo, 'supabase/functions/_shared/policy.ts'), 'utf8');
const POLICY_VERSION = /CONSENT_POLICY_VERSION\s*=\s*'([^']+)'/.exec(policy)?.[1];
if (!POLICY_VERSION) throw new Error('CONSENT_POLICY_VERSION not found in policy.ts');

/** Before the app: assistant-chat's 'selection' answers made in the page (JSON); failing while offline. */
const PAGE_SETUP = `(() => {
  const realFetch = window.fetch.bind(window);
  window.__checkOffline = false;
  window.__askCalls = [];
  const SIMPLER = ['La conducta es lo que hace un ser vivo, y la **biología** la explica.', 'La conducta humana se explica con la **biología**: genes, cerebro y ambiente.'];
  const ANSWERS = {
    example: 'Por ejemplo, retirar la mano al tocar algo **caliente** es una conducta refleja.',
    deeper: 'Más allá de la clase: la Psicobiología une la **psicología** experimental con la neurociencia del siglo XX.',
    rewrite: 'La Psicobiología estudia la conducta humana como un **proceso biológico**.',
  };
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input && input.url;
    if (url && url.includes('/functions/v1/assistant-chat')) {
      if (window.__checkOffline) throw new TypeError('Failed to fetch');
      let body = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch {}
      window.__askCalls.push(body);
      await new Promise((r) => setTimeout(r, 400));
      let out;
      if (body.action === 'flashcard') out = { cards: [{ front: '¿Qué estudia la Psicobiología?', back: 'La conducta humana como proceso biológico.' }] };
      else if (body.action === 'simpler') out = { suggestion: SIMPLER[window.__askCalls.filter((c) => c.action === 'simpler').length > 1 ? 1 : 0] };
      else out = { suggestion: ANSWERS[body.action] || 'Sugerencia.' };
      return new Response(JSON.stringify({ ...out, model: 'claude-sonnet-5-5', usage: { input: 1, output: 1 }, costUsd: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
})();`;

const P1 = 'La Psicobiología estudia la conducta humana como proceso biológico.';
const P2 = 'Su objeto es la energía del sistema nervioso, como E=mc^2 en física.';
const P3 = 'Responde a cinco preguntas: estructuras, procesos, regulación, finalidad y evolución.';
const para = (text, id) => ({ type: 'paragraph', attrs: { blockId: id }, content: [{ type: 'text', text }] });
const DOC_CONTENT = {
  type: 'doc',
  content: [
    para(P1, 'p1'),
    { type: 'paragraph', attrs: { blockId: 'p2' }, content: [{ type: 'text', text: 'Su objeto es la energía del sistema nervioso, como ' }, { type: 'inlineMath', attrs: { latex: 'E=mc^2' } }, { type: 'text', text: ' en física.' }] },
    para(P3, 'p3'),
    { type: 'paragraph', attrs: { blockId: 'p4' } },
  ],
};

const user = await makeUser();
const data = await seed(user.client);
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SETUP });

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const disabled = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.getAttribute('aria-disabled') === 'true'`);
const calls = () => b.evaluate('window.__askCalls');
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const taken = new Set();
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
  await b.sleep(400);
  await b.shot(name);
  taken.add(name);
};
const dark = async (on) => {
  await b.send('Emulation.setEmulatedMedia', { features: on ? [{ name: 'prefers-color-scheme', value: 'dark' }] : [] });
  await b.sleep(600);
};
/** Light, then dark, then light again. */
const shots = async (name) => {
  await shot(name);
  await dark(true);
  await shot(`${name}-dark`);
  await dark(false);
};
/** The top-level blocks: type, callout kind, origin, text. */
const blocks = () =>
  b.evaluate(`(window.studiplyEditor.getJSON().content || []).map((n) => {
    const t = (x) => (x.text || '') + (x.content || []).map(t).join('');
    return { type: n.type, kind: n.attrs && n.attrs.kind, origin: n.attrs && n.attrs.origin, text: t(n) };
  })`);
/** Selects `needle` in the editor (as a mouse would) and waits for the selection bar's Ask Claude. */
const select = async (needle, length = needle.length) => {
  await b.evaluate(`(() => {
    const ed = window.studiplyEditor;
    let from = -1;
    ed.state.doc.descendants((n, p) => {
      if (from === -1 && n.isText && n.text.includes(${JSON.stringify(needle)})) from = p + n.text.indexOf(${JSON.stringify(needle)});
    });
    ed.chain().focus().setTextSelection({ from, to: from + ${length} }).run();
  })()`);
  await waitFor(
    () => b.evaluate(`(() => { const e = document.querySelector('[aria-label="Ask Claude about the selection"]'); return !!e && e.offsetParent !== null; })()`),
    'the selection bar with Ask Claude',
    5000,
  );
  // At every width: the bar shows all its buttons (it wraps; nothing scrolled away or cut).
  const fit = await b.evaluate(`(() => {
    const bar = document.querySelector('.studiply-selection-bar');
    const r = bar.getBoundingClientRect();
    const ask = document.querySelector('[aria-label="Ask Claude about the selection"]').getBoundingClientRect();
    return { scroll: bar.scrollWidth, client: bar.clientWidth, askInside: ask.left >= r.left - 0.5 && ask.right <= r.right + 0.5 && ask.top >= r.top - 0.5 && ask.bottom <= r.bottom + 0.5 };
  })()`);
  expect(fit.scroll <= fit.client + 1 && fit.askInside, `the selection bar does not fit: ${JSON.stringify(fit)}`);
};
/**
 * `css`'s box against the editor as seen: the pane that scrolls the document, inside the window and
 * left of the assistant panel. Returns what sticks out (empty when it is fully inside).
 */
const outside = (css) =>
  b.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(css)});
    if (!el) return ['not found'];
    const r = el.getBoundingClientRect();
    let pane = document.querySelector('.ProseMirror').parentElement;
    while (pane && pane !== document.body && getComputedStyle(pane).overflowY === 'visible') pane = pane.parentElement;
    const p = pane.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="assistant-panel"]')?.getBoundingClientRect();
    const area = {
      left: Math.max(0, p.left),
      top: Math.max(0, p.top),
      right: Math.min(innerWidth, p.left + pane.clientWidth, panel ? panel.left : Infinity),
      bottom: Math.min(innerHeight, p.top + pane.clientHeight),
    };
    const out = [];
    if (r.left < area.left - 0.5) out.push('left ' + Math.round(r.left) + ' < ' + Math.round(area.left));
    if (r.right > area.right + 0.5) out.push('right ' + Math.round(r.right) + ' > ' + Math.round(area.right));
    if (r.top < area.top - 0.5) out.push('top ' + Math.round(r.top) + ' < ' + Math.round(area.top));
    if (r.bottom > area.bottom + 0.5) out.push('bottom ' + Math.round(r.bottom) + ' > ' + Math.round(area.bottom));
    return out;
  })()`);
/** Selection bar → Ask Claude → `action` in its menu; then the suggestion (or cards) ready. */
const askFor = async (label, status = 'suggestion') => {
  await b.clickSelector('[aria-label="Ask Claude about the selection"]');
  await b.waitText(label, { exact: true, timeout: 4000 });
  await b.click(label, { exact: true });
  await waitFor(() => has(`[data-ask="body"][data-status="${status}"]`), `the ${status}`, 8000);
};

let docId = null;
try {
  for (const scope of ['assistant_summary']) {
    const { error } = await user.client.from('ai_consent').insert({ scope, policy_version: POLICY_VERSION });
    if (error) throw new Error(`the consent: ${error.message}`);
  }
  const f = await user.client.from('files').insert({ kind: 'document', title: 'Ask Claude check', course_id: data.course.id }).select('id').single();
  if (f.error) throw new Error(f.error.message);
  docId = f.data.id;
  const d = await user.client.from('documents').insert({ file_id: docId, tab: 'notes', content: DOC_CONTENT });
  if (d.error) throw new Error(d.error.message);

  await b.signIn(BASE, user.email, user.password);
  await b.nav(`${BASE}/doc/${docId}`);
  await waitFor(() => has('.ProseMirror'), 'the document', 20000);
  await waitFor(async () => (await blocks()).length >= 3, 'its content', 10000);

  await step('1280, Explain simpler: the card under the selection, the range highlighted; Reject changes nothing; asked again, Accept puts the second version in its place (now hers); one Undo brings the old text back', async () => {
    const before = JSON.stringify(await blocks());
    expect(await has('[data-testid="assistant-panel"]'), 'the assistant panel is not open at 1280');
    await select(P1);
    const barOut = await outside('.studiply-selection-bar');
    expect(barOut.length === 0, `the selection bar sticks out of the editor (panel open): ${barOut.join(', ')}`);
    await askFor('Explain simpler');
    expect(await has('[data-ask="card"]'), 'no card (laptop)');
    await b.sleep(300);
    const cardOut = await outside('[data-ask="card"]');
    expect(cardOut.length === 0, `the card sticks out of the editor (panel open): ${cardOut.join(', ')}`);
    const buttonsOut = [...(await outside('[data-ask="accept"]')), ...(await outside('[data-ask="reject"]'))];
    expect(buttonsOut.length === 0, `Accept / Reject not fully seen: ${buttonsOut.join(', ')}`);
    expect((await text('[data-ask="suggestion"]')).includes('La conducta es lo que hace un ser vivo'), 'the first suggestion');
    expect((await text('.studiply-suggestion')).length > 10, 'the range is not highlighted');
    await shots('ask-card-1280');
    await dark(true);
    const darkOut = await outside('[data-ask="card"]');
    await dark(false);
    expect(darkOut.length === 0, `the card sticks out of the editor in dark mode: ${darkOut.join(', ')}`);
    await b.clickSelector('[data-ask="reject"]');
    await waitFor(async () => !(await has('[data-ask="card"]')), 'the card closed', 3000);
    expect(JSON.stringify(await blocks()) === before, 'Reject changed the document');
    expect(!(await has('.studiply-suggestion')), 'still highlighted');

    await select(P1);
    await askFor('Explain simpler');
    expect((await text('[data-ask="suggestion"]')).includes('genes, cerebro y ambiente'), 'the second suggestion');
    await b.clickSelector('[data-ask="accept"]');
    await waitFor(async () => (await blocks())[0].text.includes('genes, cerebro y ambiente'), 'the first paragraph replaced', 3000);
    const [first] = await blocks();
    expect(first.text === 'La conducta humana se explica con la biología: genes, cerebro y ambiente.' && first.origin === 'student', `the paragraph: ${JSON.stringify(first)}`);
    await b.evaluate('window.studiplyEditor.commands.undo()');
    expect((await blocks())[0].text === P1, 'Undo did not bring it back');
    await b.evaluate('window.studiplyEditor.commands.redo()');
    expect((await blocks())[0].text.includes('genes'), 'Redo');
  });

  await step('Give an example → Accept: an Example box (ai) right after the paragraph', async () => {
    await select('cinco preguntas');
    await askFor('Give an example');
    await b.clickSelector('[data-ask="accept"]');
    await waitFor(async () => (await blocks()).some((x) => x.kind === 'example'), 'the Example box', 3000);
    const list = await blocks();
    const i = list.findIndex((x) => x.kind === 'example');
    expect(list[i - 1].text === P3 && list[i].origin === 'ai' && list[i].text.includes('retirar la mano'), `the blocks: ${JSON.stringify(list)}`);
  });

  await step('Rewrite section, the text edited before Accept: the card says it changed, Insert below puts a "From the study assistant" box (ai) below; the edit stays', async () => {
    await select('Su objeto es la energía');
    await askFor('Rewrite section');
    expect((await text('[data-ask="accept"]')) === 'Accept', 'not Accept before the edit');
    await b.evaluate(`(() => {
      const ed = window.studiplyEditor;
      let at = -1;
      ed.state.doc.descendants((n, p) => { if (at === -1 && n.isText && n.text.includes('objeto')) at = p + n.text.indexOf('objeto'); });
      ed.commands.insertContentAt(at, 'gran ');
    })()`);
    await waitFor(() => has('[data-ask="stale"]'), 'the "text changed" note', 3000);
    expect((await text('[data-ask="accept"]')) === 'Insert below', 'not Insert below');
    await b.clickSelector('[data-ask="accept"]');
    await waitFor(async () => (await blocks()).some((x) => x.kind === 'fromAssistant'), 'the box below', 3000);
    const list = await blocks();
    const i = list.findIndex((x) => x.kind === 'fromAssistant');
    expect(list[i - 1].text.startsWith('Su gran objeto es la energía') && list[i].origin === 'ai', `the blocks: ${JSON.stringify(list)}`);
    await shots('ask-boxes-1280');
  });

  await step('Make flashcard → the cards (not editable) → Save cards → "1 flashcard saved"; a flashcards row (source selection), no review schedule', async () => {
    await select(P3);
    await askFor('Make flashcard', 'cards');
    expect((await b.evaluate(`document.querySelectorAll('[data-ask="body"] [data-assistant="card"]').length`)) === 1, 'not one card');
    expect(!(await has('[data-ask="body"] input, [data-ask="body"] textarea')), 'the cards are editable');
    await b.clickSelector('[data-assistant="save-cards"]');
    await b.waitText('1 flashcard saved', { timeout: 6000 });
    const { data: rows } = await admin.from('flashcards').select('id, source, source_ref, file_id, course_id').eq('file_id', docId);
    expect(rows?.length === 1 && rows[0].source === 'selection' && rows[0].source_ref === docId && rows[0].course_id === data.course.id, `rows: ${JSON.stringify(rows)}`);
    const { count } = await admin.from('review_schedule').select('id', { count: 'exact', head: true }).eq('flashcard_id', rows[0].id);
    expect(count === 0, `review_schedule rows: ${count}`);
  });

  await step('what was sent: mode selection, this document, the action, the text (a formula as $…$) and its paragraph', async () => {
    const list = await calls();
    expect(list.every((c) => c.mode === 'selection' && c.fileId === docId), `requests: ${JSON.stringify(list)}`);
    expect(JSON.stringify(list.map((c) => c.action)) === JSON.stringify(['simpler', 'simpler', 'example', 'rewrite', 'flashcard']), `actions: ${list.map((c) => c.action)}`);
    const rewrite = list.find((c) => c.action === 'rewrite');
    expect(rewrite.text === 'Su objeto es la energía' && rewrite.context === 'Su objeto es la energía del sistema nervioso, como $E=mc^2$ en física.', `rewrite: ${JSON.stringify(rewrite)}`);
  });

  await step('a lecture after class: the panel’s Add to notes puts a "From the study assistant · m:ss" box (ai) at the end of My notes, "Added ✓"; offline, Ask Claude needs the internet and sends nothing', async () => {
    const lectureId = data.lecture.id;
    await user.client.from('documents').upsert({ file_id: lectureId, tab: 'notes', content: { type: 'doc', content: [para('0:30 La conducta como proceso biológico', 'n1'), { type: 'paragraph', attrs: { blockId: 'n2' } }] } }, { onConflict: 'file_id,tab' });
    const q = await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'user', content: 'Explain the last 10 min', quick_prompt: 'last_10_min', asked_at_ms: 2052000, window_start_ms: 1452000, window_end_ms: 2052000, status: 'done' }).select('id').single();
    if (q.error) throw new Error(q.error.message);
    const a = await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'assistant', content: 'La profesora explicó **las 5 preguntas** de la Psicobiología. En el [31:05] dijo que hay que saberlas de memoria.', reply_to: q.data.id, window_start_ms: 1452000, window_end_ms: 2052000, status: 'done', model: 'claude-sonnet-5-5' });
    if (a.error) throw new Error(a.error.message);
    await b.nav(`${BASE}/doc/${lectureId}?tab=notes`);
    await waitFor(() => has('.ProseMirror'), 'My notes', 20000);
    await waitFor(() => has('[data-testid="assistant-panel"] [data-assistant="add-to-notes"]'), 'the saved answer in the panel', 15000);
    await b.clickSelector('[data-testid="assistant-panel"] [data-assistant="add-to-notes"]');
    await waitFor(() => has('.studiply-callout[data-callout="fromAssistant"]'), 'the box in My notes', 6000);
    const box = await b.evaluate(`(() => { const e = document.querySelector('.studiply-callout[data-callout="fromAssistant"]'); return { origin: e.getAttribute('data-origin'), label: e.querySelector('.studiply-callout-label').textContent, chips: e.querySelectorAll('.ts-chip').length }; })()`);
    expect(box.origin === 'ai' && /From the study assistant · 34:12/i.test(box.label) && box.chips === 1, `the box: ${JSON.stringify(box)}`);
    const list = await blocks();
    expect(list.at(-2).kind === 'fromAssistant' && list.at(-1).type === 'paragraph' && !list.at(-1).text, `at the end, an empty line after it: ${JSON.stringify(list)}`);
    expect((await text('[data-testid="assistant-panel"] [data-assistant="add-to-notes"]')).includes('Added'), 'no "Added ✓"');
    await shots('ask-notes-1280');

    // Offline: Ask Claude says so, nothing is sent.
    const n = (await calls()).length;
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.evaluate('window.__checkOffline = true');
    await waitFor(() => has('[data-testid="assistant-panel"] [data-assistant="offline"]'), 'the app offline', 30000);
    await select('proceso biológico');
    await b.clickSelector('[aria-label="Ask Claude about the selection"]');
    await b.waitText('Ask Claude needs the internet', { timeout: 4000 });
    await b.click('OK', { exact: true });
    expect((await calls()).length === n, 'a request was sent offline');
    expect(!(await has('.studiply-suggestion')), 'the range still highlighted');
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.evaluate('window.__checkOffline = false');
    await waitFor(async () => !(await has('[data-testid="assistant-panel"] [data-assistant="offline"]')), 'online again', 30000);
  });

  await step('390 px: the assistant sheet (✦ in the header) with the answer; My notes with the box; Go deeper → the suggestion in a sheet → Accept: an "Added context" box (ai)', async () => {
    await b.resize(390, 844);
    await waitFor(() => has('[data-assistant="open"]'), '✦ in the header', 10000);
    await b.clickSelector('[data-assistant="open"] [aria-label="Study assistant"]');
    await waitFor(() => has('[data-assistant="sheet"]'), 'the assistant sheet', 5000);
    // The saved answer, with its buttons (this sheet's conversation is the phone's own: Add to notes again).
    await waitFor(() => has('[data-assistant="sheet"] [data-assistant="add-to-notes"]'), 'the answer in the sheet', 8000);
    await shots('ask-assistant-390');
    await b.clickSelector('[aria-label="Close the study assistant"]');
    await waitFor(async () => !(await has('[data-assistant="sheet"]')), 'the sheet closed', 4000);
    await b.evaluate(`document.querySelector('.studiply-callout[data-callout="fromAssistant"]')?.scrollIntoView({ block: 'center' })`);
    await shots('ask-notes-390');

    await select('La conducta como proceso');
    await askFor('Go deeper');
    expect(await has('[data-sheet="drag"] [data-ask="body"]'), 'not in a sheet (390)');
    expect(!(await has('[data-ask="card"]')), 'the laptop card at 390');
    await shots('ask-sheet-390');
    await b.clickSelector('[data-ask="accept"]');
    await waitFor(async () => (await blocks()).some((x) => x.kind === 'addedContext'), 'the Added context box', 3000);
    expect((await blocks()).find((x) => x.kind === 'addedContext').origin === 'ai', 'not ai');
    await b.resize(1280, 900);
  });

  await step('no request reached assistant-chat on the server, nor Anthropic', async () => {
    const out = requests.filter((u) => /functions\/v1\/assistant-chat|anthropic\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
    report.push(`RESULT | asks answered in the page | ${(await calls())?.length ?? '?'}`);
  });

  await step('the screenshots SIDE BY SIDE with the mockups: ask-compare-1280-document, ask-compare-1280-assistant, ask-compare-390', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const wanted = ['ask-card-1280', 'ask-boxes-1280', 'ask-notes-1280', 'ask-sheet-390', 'ask-notes-390', 'ask-assistant-390'].flatMap((n) => [n, `${n}-dark`]);
    const missing = wanted.filter((n) => !taken.has(n));
    const mock = (name) => png(join(repo, `docs/design/${name}.png`));
    expect(mock('desktop-03-summary-in-document') && mock('desktop-01-recording') && mock('iphone-06-summary') && mock('iphone-04-assistant'), 'the mockups are not in docs/design');
    await b.nav('about:blank');
    /** Labelled images in rows, each `w` px wide. */
    const compose = async (name, rows, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 18px -apple-system,sans-serif;margin:0 0 8px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2;display:flex;flex-direction:column;gap:28px">${rows
        .map((r) => `<div style="display:flex;gap:24px;align-items:flex-start">${r.map(cell).join('')}</div>`)
        .join('')}</body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose(
      'ask-compare-1280-document',
      [
        [['Mockup: desktop-03 (the boxes)', mock('desktop-03-summary-in-document')], ['Example + From the study assistant · light', shotOf('ask-boxes-1280')], ['· dark', shotOf('ask-boxes-1280-dark')]],
        [['', null], ['The suggestion card · light', shotOf('ask-card-1280')], ['· dark', shotOf('ask-card-1280-dark')]],
      ],
      760,
    );
    await compose(
      'ask-compare-1280-assistant',
      [[['Mockup: desktop-01 (the panel)', mock('desktop-01-recording')], ['Added ✓ + the box in My notes · light', shotOf('ask-notes-1280')], ['· dark', shotOf('ask-notes-1280-dark')]]],
      760,
    );
    await compose(
      'ask-compare-390',
      [
        [['Mockup: iphone-06 (boxes)', mock('iphone-06-summary')], ['My notes with the box · light', shotOf('ask-notes-390')], ['· dark', shotOf('ask-notes-390-dark')]],
        [['Mockup: iphone-04 (the sheet)', mock('iphone-04-assistant')], ['The assistant sheet · light', shotOf('ask-assistant-390')], ['· dark', shotOf('ask-assistant-390-dark')]],
        [['', null], ['The suggestion sheet · light', shotOf('ask-sheet-390')], ['· dark', shotOf('ask-sheet-390-dark')]],
      ],
      390,
    );
    await b.resize(1280, 900);
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const r of report) console.log(r);
  console.log('console errors:', JSON.stringify(errors));
  console.log('shots:', SHOTS);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
