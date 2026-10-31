// summary-doc.mjs — step 7.7, the summary written into the lecture's document, in Chrome against local
// Supabase. NO paid call: every summary is a finished `summaries` row put in by the check (the 30-min
// synthetic lecture's summary, src/test-utils/summary-synthetic-30.json); nothing calls summarize,
// Anthropic or OpenAI.
//
// Steps:
//   1. laptop (1280): the lecture's Summary tab: the summary is written in (documents row, its blocks
//      `sm…`, `ai` but From your notes `student` and the photo `media`); a version (ai_generation); its
//      2 flashcards saved once (source summary, source_ref = the summary).
//   2. What desktop-03 shows: the green banner (the window's full width under the top bar, one line;
//      "Summary added to this document", Built from your notes
//      (all 6 lines, 6 marks) + 30 min of audio · board photos · your questions to the assistant,
//      + Extend with next lecture: the lecture picker since 7.9); under the title the notes check
//      line, then KEY TAKEAWAYS; section headings "n · …" with ▶ time and chips for HER marks only (none
//      for the implicit signals: repetitions, questions to the assistant); FROM YOUR NOTES
//      · 0:45; YOU WERE CONFUSED HERE · 9/10 · 24:10; DEFINITION / EXAM SIGNAL boxes; Your questions
//      during class; the self-test with every answer hidden.
//   3. An answer: its label shows it, again hides it; the document isn't saved for it.
//   4. "See them in My notes" (the link bubble's Open): the My notes tab. A question's "Full answer":
//      the study assistant panel opens at that question (marked).
//   5. BUILD-PLAN 7.7's check, FAKED: two paragraphs edited on the laptop; a second finished summary
//      (other words, "Update the Summary tab") arrives: both edits still there, the untouched blocks
//      written again; a version before ("Before the summary was written again") and after.
//   6. A third finished summary (no choice: a new tab): a "New summary" tab opens with it; the Summary
//      tab is unchanged.
//   7. The summarize panel on a lecture that has a summary: "where the new one goes", a new tab chosen.
//   8. 390 px (the web's phone layout, iphone-06): no banner; + Extend with next (the lecture picker,
//      7.9) and Quiz me (greyed, "Coming in a later update": 9.1) at the bottom.
//
// A failed step closes any menu, dialog or picker it left open, so it can't fail the next ones.
//   9. No request to summarize, transcribe-chunk, Anthropic or OpenAI.
//  10. The screenshots SIDE BY SIDE with the mockups (light and dark): shots/summary-doc-compare-1280.png
//      (desktop-03), shots/summary-doc-compare-390.png (iphone-06).
//
// Run with a dev server on 8123 (the web-check skill) and `supabase start`:
//   node .claude/skills/web-check/scripts/summary-doc.mjs
// or from elsewhere: WEB_CHECK_SCRIPTS=<the skill's scripts folder> node summary-doc.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = process.env.WEB_CHECK_SCRIPTS ? pathToFileURL(`${process.env.WEB_CHECK_SCRIPTS}/`) : new URL('./', import.meta.url);
const { launch, SHOTS } = await import(new URL('cdp.mjs', scripts).href);
const { admin, makeUser, seed, dropUser } = await import(new URL('testuser.mjs', scripts).href);

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
    await b.shot(`fail-summary-doc-${results.length}`).catch(() => {});
    // A menu, dialog or picker left open would answer every later step.
    await b.press('Escape').catch(() => {});
    await b.press('Escape').catch(() => {});
    await b.sleep(300);
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

const S30 = JSON.parse(readFileSync(join(repo, 'src/test-utils/summary-synthetic-30.json'), 'utf8')).result;
const SLIDERS = { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const user = await makeUser();
const data = await seed(user.client);
const lectureId = data.lecture.id;
b = await launch();
const requests = [];
b.onEvent('Network.requestWillBeSent', (p) => requests.push(p.request.url));
await b.send('Network.enable', {});

const has = (css) => b.evaluate(`!!document.querySelector(${JSON.stringify(css)})`);
const text = (css) => b.evaluate(`document.querySelector(${JSON.stringify(css)})?.textContent ?? ''`);
const texts = (css) => b.evaluate(`[...document.querySelectorAll(${JSON.stringify(css)})].map((e) => e.textContent)`);
const splashShown = () => b.evaluate(`[...document.querySelectorAll('div, span')].some((e) => e.childElementCount === 0 && e.textContent.trim() === 'AUTOMATED STUDY')`);
const taken = new Set();
const shot = async (name) => {
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
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
const summaryTab = async () => (await admin.from('documents').select('id, content, updated_at').eq('file_id', lectureId).eq('tab', 'summary').maybeSingle()).data;
const ids = (content) => (content?.content ?? []).map((x) => String(x.attrs?.blockId ?? ''));
const blockText = (n) => (n.text ?? '') + (n.content ?? []).map(blockText).join('');
const docText = (content) => (content?.content ?? []).map(blockText).join('\n');
/** A finished summary as the server leaves it (no call: the result is the synthetic lecture's). */
const doneRow = async (result, target) => {
  const { data: row, error } = await admin
    .from('summaries')
    .insert({
      user_id: user.id,
      file_id: lectureId,
      mode: 'new',
      source_lecture_ids: [lectureId],
      sliders: SLIDERS,
      status: 'done',
      result,
      applied_settings: { targetWords: 231, takeaways: 4, selfTestCount: 7, markStrength: 1, resources: { slides: false, photos: true, assistant: true, notes: true }, preview: '≈ 231 words · 4 takeaways · 7 questions', ...(target && { target }) },
      note_lines_total: 6,
      note_lines_used: 6,
      marks_total: 6,
      marks_used: 6,
      model: 'claude-opus-5-5',
    })
    .select('id')
    .single();
  if (error) throw new Error(`the summary row: ${error.message}`);
  return row.id;
};
const openSummaryTab = async () => {
  await b.nav(`${BASE}/doc/${lectureId}?tab=summary&at=${Date.now()}`);
  await waitFor(() => has(`[data-callout="notesCheck"]`), 'the summary written into the Summary tab', 25000);
  // A full load shows the splash screen over the page for ~2 s: taps before it's gone land on it.
  await waitFor(async () => !(await splashShown()), 'the splash screen gone', 15000);
};
/** Scrolls an element into view, then taps it (clickSelector taps where it is, even off screen). */
const tap = async (css) => {
  const found = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(css)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  expect(found, `no element: ${css}`);
  await b.sleep(300);
  await b.clickSelector(css);
};
/**
 * Clicks a link in the page on its first line: a link that wraps has a box spanning both lines, whose
 * middle is on other words (b.click aims there).
 */
const clickLink = async (words) => {
  const p = await b.evaluate(`(() => {
    const a = [...document.querySelectorAll('.ProseMirror a')].find((e) => e.textContent === ${JSON.stringify(words)});
    if (!a) return null;
    a.scrollIntoView({ block: 'center' });
    const r = a.getClientRects()[0];
    return { x: r.x + Math.min(r.width / 2, 20), y: r.y + r.height / 2 };
  })()`);
  expect(p, `no link "${words}"`);
  await b.clickAt(p.x, p.y);
};
/** The editor's text (a paragraph's words sit beside bold ones: no single element holds them). */
const pageText = () => b.evaluate(`document.querySelector('.ProseMirror')?.textContent ?? ''`);
/** Puts the cursor at the end of the paragraph holding `fragment` and types `insert` (as she would). */
const typeAtEndOf = async (fragment, insert) => {
  const ok = await b.evaluate(`(() => {
    const p = [...document.querySelectorAll('.ProseMirror p')].find((e) => e.textContent.includes(${JSON.stringify(fragment)}));
    if (!p) return false;
    p.closest('.ProseMirror').focus();
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return true;
  })()`);
  expect(ok, `no paragraph with "${fragment}"`);
  await b.sleep(200);
  await b.type(insert);
};

let firstId = null;
try {
  // Her question to the assistant (the Full answer link) and the board photo (the summary's photo).
  const q = await user.client
    .from('assistant_messages')
    .insert({ lecture_id: lectureId, role: 'user', content: 'Explícame los últimos 10 minutos', quick_prompt: null, asked_at_ms: 28 * 60_000, window_start_ms: 18 * 60_000, window_end_ms: 28 * 60_000, status: 'done' })
    .select('id')
    .single();
  if (q.error) throw new Error(q.error.message);
  await user.client.from('assistant_messages').insert({ lecture_id: lectureId, role: 'assistant', content: 'La profesora explicó la filogenia, la ontogenia y la heredabilidad.', reply_to: q.data.id, window_start_ms: 18 * 60_000, window_end_ms: 28 * 60_000, status: 'done', model: 'claude-sonnet-5-5' });
  const photoPath = `${user.id}/${lectureId}/board.png`;
  await admin.storage.from('photos').upload(photoPath, PNG, { contentType: 'image/png' });
  const { data: photo } = await admin.from('media').insert({ user_id: user.id, lecture_id: lectureId, kind: 'photo', storage_path: photoPath, mime_type: 'image/png', t_ms: 12 * 60_000 + 40_000, caption: 'Pizarra' }).select('id').single();
  const result = JSON.parse(JSON.stringify(S30).replaceAll('"photo-board"', JSON.stringify(photo.id)));

  await b.signIn(BASE, user.email, user.password);
  firstId = await doneRow(result);

  await step('the Summary tab: the summary written in (sm… blocks, origins), a version, its flashcards saved once', async () => {
    await openSummaryTab();
    const doc = await waitFor(async () => {
      const row = await summaryTab();
      return row && ids(row.content).some((id) => id.startsWith('sm')) ? row : null;
    }, 'the documents row', 15000);
    const blocks = doc.content.content;
    const origins = new Set(blocks.map((x) => `${x.type}:${x.attrs?.origin}`));
    expect(origins.has('callout:student') && origins.has('image:media') && origins.has('paragraph:ai'), `origins: ${[...origins]}`);
    expect(blocks[0].attrs?.kind === 'notesCheck' && blocks[1].attrs?.kind === 'takeaways', `first blocks: ${blocks.slice(0, 2).map((x) => x.attrs?.kind)}`);
    const { data: versions } = await admin.from('document_versions').select('reason, name').eq('file_id', lectureId);
    expect(versions.some((v) => v.reason === 'ai_generation'), `versions: ${JSON.stringify(versions)}`);
    const cards = await waitFor(async () => {
      const { data: rows } = await admin.from('flashcards').select('front, source, source_ref, file_id').eq('file_id', lectureId);
      return rows?.length ? rows : null;
    }, 'the flashcards', 10000);
    expect(cards.length === 2 && cards.every((c) => c.source === 'summary' && c.source_ref === firstId), `flashcards: ${JSON.stringify(cards)}`);
    report.push(`RESULT | blocks ${blocks.length}, versions ${versions.length}, flashcards ${cards.length}`);
  });

  await step('desktop-03: the banner, the notes check line under the title, takeaways, sections with time and chips, the boxes, the questions, the self-test hidden', async () => {
    const banner = await text('[data-summary-banner="shown"]');
    expect(banner.includes('Summary added to this document') && banner.includes('Built from your notes (all 6 lines, 6 marks) + 30 min of audio · board photos · your questions to the assistant'), `banner: ${banner}`);
    expect(banner.includes('+ Extend with next lecture'), 'Extend with next lecture');
    // desktop-03: the window's full width, directly under the top bar, one line (only "Built from" may be cut with …).
    const geo = await b.evaluate(`(() => {
      const e = document.querySelector('[data-summary-banner="shown"]').getBoundingClientRect();
      const built = document.querySelector('[data-summary-banner="built"]');
      const line = parseFloat(getComputedStyle(built).lineHeight) || 20;
      return { left: e.left, width: e.width, top: e.top, height: e.height, window: innerWidth, builtLines: Math.round(built.getBoundingClientRect().height / line) };
    })()`);
    expect(geo.left <= 1 && geo.width >= geo.window - 2, `the banner's width: ${JSON.stringify(geo)}`);
    expect(geo.top >= 40 && geo.top <= 80, `the banner under the top bar: ${JSON.stringify(geo)}`);
    expect(geo.builtLines === 1 && geo.height <= 56, `the banner on one line: ${JSON.stringify(geo)}`);
    // Step 7.9: the lecture picker for Extend (Lecture 1 is the course's only lecture: nothing to pick, Continue waits).
    await tap('[data-summary-banner="extend"]');
    await waitFor(() => has('[data-picker="panel"][data-mode="extend"]'), 'the lecture picker', 10000);
    expect((await text('[data-picker="panel"]')).includes('No later lecture in this course yet.'), `the picker: ${await text('[data-picker="panel"]')}`);
    await tap('[data-picker="cancel"]');
    await waitFor(async () => !(await has('[data-picker="panel"]')), 'the picker closed', 5000);
    const labels = await texts('.studiply-callout-label');
    expect(labels[0] === 'All your notes are in this summary', `first label: ${labels[0]}`);
    expect(labels[1] === 'Key takeaways', `second: ${labels[1]}`);
    for (const want of ['From your notes · 0:45', 'You were confused here · 9/10 · 24:10', 'Exam signal', 'Added context · not from the lecture', 'Answer']) expect(labels.includes(want), `no "${want}" in ${JSON.stringify(labels)}`);
    // The app's own words are English (app UI); Claude's text stays in the lecture's language.
    const check = await text('[data-callout="notesCheck"]');
    expect(check.includes('6 of 6 lines and 6 of 6 marks used · shown in green as “From your notes”') && check.includes('See them in My notes'), `the notes check line: ${check}`);
    const headings = await texts('.ProseMirror h2');
    expect(headings[0].startsWith('1 · Qué es la Psicobiología') && headings.includes('Your questions during class') && headings.includes('Self-test'), `headings: ${JSON.stringify(headings)}`);
    const chips = await b.evaluate(`(() => { const h = document.querySelector('.ProseMirror h2'); return { time: h.querySelector('.ts-chip')?.textContent, marks: [...h.querySelectorAll('.studiply-mark-chip')].map((e) => e.textContent) }; })()`);
    // Her marks only: the section's two repetitions (Important 6/10) and the assistant question (Confused 6/10) have no chip.
    expect(chips.time === '0:00' && JSON.stringify(chips.marks) === JSON.stringify(['Important 3/10', 'Exam 2/10']), `chips: ${JSON.stringify(chips)}`);
    const allChips = await texts('.ProseMirror h2 .studiply-mark-chip');
    expect(!allChips.some((t) => /6\/10$/.test(t)), `a chip for an implicit signal: ${JSON.stringify(allChips)}`);
    const hidden = await b.evaluate(`[...document.querySelectorAll('[data-callout="answer"] .studiply-callout-body')].map((e) => getComputedStyle(e).display)`);
    expect(hidden.length === 7 && hidden.every((d) => d === 'none'), `answers: ${JSON.stringify(hidden)}`);
    // Under the title (desktop-03): the page's header, then the check line first in the page.
    const order = await b.evaluate(`(() => { const t = [...document.querySelectorAll('input, textarea, [role="heading"]')].find((e) => (e.value ?? e.textContent) === 'Lecture 1'); const c = document.querySelector('[data-callout="notesCheck"]'); return t && c ? t.getBoundingClientRect().top < c.getBoundingClientRect().top : null; })()`);
    expect(order !== false, 'the notes check line under the title');
    await shots('summary-doc-1280');
  });

  await step('a self-test answer: its label shows it, again hides it; nothing saved for it', async () => {
    const before = (await summaryTab()).updated_at;
    const label = '[data-callout="answer"] .studiply-callout-label';
    await tap(label);
    const shown = await b.evaluate(`getComputedStyle(document.querySelector('[data-callout="answer"] .studiply-callout-body')).display`);
    expect(shown !== 'none', 'shown after a tap');
    await shot('summary-doc-answer-1280');
    await tap(label);
    expect((await b.evaluate(`getComputedStyle(document.querySelector('[data-callout="answer"] .studiply-callout-body')).display`)) === 'none', 'hidden again');
    await b.sleep(3500);
    expect((await summaryTab()).updated_at === before, 'the document was saved for showing an answer');
  });

  await step('the links: "See them in My notes" opens My notes; a question’s Full answer opens the assistant at it', async () => {
    // Unbroken at the end of the line (desktop-03): one box.
    expect((await b.evaluate(`[...document.querySelectorAll('.ProseMirror a')].find((e) => e.textContent === 'See them in My notes')?.getClientRects().length`)) === 1, 'the link wraps');
    await clickLink('See them in My notes');
    await b.waitText('Opens My notes');
    await tap('[aria-label="Open link"]');
    await waitFor(() => b.evaluate(`document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === 'My notes'`), 'My notes opened');
    await openSummaryTab();
    await clickLink('Full answer');
    await b.waitText('Opens the study assistant at this question');
    await tap('[aria-label="Open link"]');
    await waitFor(() => has('[data-assistant="turn"][data-focused="true"]'), 'the question marked in the assistant panel', 10000);
    await shot('summary-doc-full-answer-1280');
  });

  await step('BUILD-PLAN 7.7, faked: two paragraphs edited; a summary written again into the Summary tab keeps both', async () => {
    await openSummaryTab();
    await typeAtEndOf('porque la produce un órgano del cuerpo', ' EDIT-UNO');
    await typeAtEndOf('el desarrollo de un individuo desde la concepción', ' EDIT-DOS');
    await waitFor(async () => {
      const t = docText((await summaryTab())?.content);
      return t.includes('EDIT-UNO') && t.includes('EDIT-DOS');
    }, 'both edits saved', 15000);
    // The second summary: other words in every paragraph; she chose "Update the Summary tab".
    const second = JSON.parse(JSON.stringify(result));
    second.sections.forEach((sec, i) => sec.blocks.forEach((bl) => bl.type === 'paragraph' && (bl.text = `Nuevo texto de la sección ${i + 1}.`)));
    await doneRow(second, 'summary');
    await openSummaryTab();
    const doc = await waitFor(async () => {
      const row = await summaryTab();
      return docText(row?.content).includes('Nuevo texto de la sección 2.') ? row : null;
    }, 'the summary written again', 20000);
    const t = docText(doc.content);
    expect(t.includes('EDIT-UNO') && t.includes('EDIT-DOS'), 'an edit was lost');
    expect(!t.includes('Las cinco preguntas de la Psicobiología permiten'), 'an untouched paragraph of the first summary stayed');
    // On screen: the open editor reads the merged summary at once (the app says the library changed).
    await waitFor(async () => {
      const t2 = await pageText();
      return t2.includes('EDIT-UNO') && t2.includes('EDIT-DOS') && t2.includes('Nuevo texto de la sección 2.');
    }, async () => `on screen: ${(await pageText()).slice(0, 300)}`, 10000);
    const { data: versions } = await admin.from('document_versions').select('reason, name').eq('file_id', lectureId);
    expect(versions.some((v) => v.name === 'Before the summary was written again'), `versions: ${JSON.stringify(versions)}`);
    report.push(`RESULT | written again: ${versions.length} versions`);
  });

  await step('a summary she didn’t add to the Summary tab: a "New summary" tab, the Summary tab unchanged', async () => {
    const before = docText((await summaryTab()).content);
    await doneRow(JSON.parse(JSON.stringify(result)));
    await b.nav(`${BASE}/doc/${lectureId}?tab=summary&at=${Date.now()}`);
    await waitFor(() => b.evaluate(`document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === 'New summary'`), 'the New summary tab open', 25000);
    const { data: rows } = await admin.from('documents').select('tab, title, kind').eq('file_id', lectureId);
    expect(rows.some((r) => r.kind === 'summary' && r.title === 'New summary'), `tabs: ${JSON.stringify(rows)}`);
    expect(docText((await summaryTab()).content) === before, 'the Summary tab changed');
  });

  await step('the summarize panel on a lecture with a summary: where the new one goes (a new tab unless chosen)', async () => {
    await b.nav(`${BASE}/doc/${lectureId}?summarize=1`);
    await waitFor(() => has('[data-summarize="target"]'), 'the choice', 20000);
    expect((await b.evaluate(`document.querySelector('[data-summarize="target-new"]')?.getAttribute('data-checked')`)) === 'true', 'a new tab by default');
    // Below the sliders: scrolled into view first (the panel's own scroll).
    await tap('[data-summarize="target-summary"]');
    await waitFor(() => b.evaluate(`document.querySelector('[data-summarize="target-summary"]')?.getAttribute('data-checked') === 'true'`), 'Update the Summary tab chosen', 3000);
    expect((await b.evaluate(`document.querySelector('[data-summarize="target-new"]')?.getAttribute('data-checked')`)) === 'false', 'a new tab no longer chosen');
    await shot('summary-doc-panel-1280');
    await tap('[data-summarize="keep"]');
  });

  await step('390 px (iphone-06): no banner; + Extend with next and Quiz me (greyed) at the bottom', async () => {
    await b.resize(390, 844);
    // Pageless, as the iPhone starts (iphone-06 is full width): the web keeps its view in `studiply.view`
    // (lib/viewPrefs, what its Pages / Pageless switch saves), Pages by default even at phone width.
    await b.evaluate(`localStorage.setItem('studiply.view', JSON.stringify({ laptop: { pages: false, zoom: 1 } }))`);
    await openSummaryTab();
    // Pageless: no CSS zoom on the editor (Pages fits the sheet to the width by zooming it out).
    const zoom = await waitFor(() => b.evaluate(`getComputedStyle(document.querySelector('.ProseMirror')).zoom`), 'the editor', 5000);
    expect(String(zoom) === '1', `pageless (zoom ${zoom})`);
    expect(!(await has('[data-summary-banner="shown"]')), 'a banner on the phone');
    await waitFor(() => has('[data-summary-buttons="shown"]'), 'the two buttons', 10000);
    expect((await b.hasText('+ Extend with next')) && (await b.hasText('Quiz me', true)), 'the buttons’ words');
    await shots('summary-doc-390');
    await b.click('Quiz me', { exact: true });
    await b.waitText('Coming in a later update');
    await b.press('Escape');
    await b.sleep(300);
    // + Extend with next: the lecture picker as a sheet (7.9).
    await tap('[data-summary-buttons="extend"]');
    await waitFor(() => has('[data-picker="panel"][data-mode="extend"]'), 'the lecture picker', 10000);
    await tap('[data-picker="cancel"]');
    await b.resize(1280, 900);
  });

  await step('no request reached summarize or transcribe-chunk, nor Anthropic or OpenAI', async () => {
    const out = requests.filter((u) => /functions\/v1\/(summarize|transcribe-chunk)|anthropic\.com|api\.openai\.com/.test(u));
    expect(out.length === 0, `requests: ${JSON.stringify(out)}`);
  });

  await step('the screenshots SIDE BY SIDE with the mockups: summary-doc-compare-1280, summary-doc-compare-390', async () => {
    const png = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);
    const shotOf = (name) => (taken.has(name) ? png(join(SHOTS, `${name}.png`)) : null);
    const wanted = ['summary-doc-1280', 'summary-doc-1280-dark', 'summary-doc-390', 'summary-doc-390-dark'];
    const missing = wanted.filter((n) => !taken.has(n));
    const mockDesktop = png(join(repo, 'docs/design/desktop-03-summary-in-document.png'));
    const mockPhone = png(join(repo, 'docs/design/iphone-06-summary.png'));
    expect(mockDesktop && mockPhone, 'the mockups are not in docs/design');
    await b.nav('about:blank');
    const compose = async (name, cells, w) => {
      const cell = ([label, src]) =>
        `<figure style="margin:0;width:${w}px"><figcaption style="font:600 18px -apple-system,sans-serif;margin:0 0 8px">${label}</figcaption>${
          src ? `<img src="${src}" style="width:${w}px;display:block;border:1px solid #ccc">` : '<div style="font:14px sans-serif;color:#999">(no screenshot)</div>'
        }</figure>`;
      const html = `<body style="margin:0;padding:24px;background:#f2f2f2"><div style="display:flex;gap:24px;align-items:flex-start">${cells.map(cell).join('')}</div></body>`;
      await b.evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close(); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); })()`);
      const size = await b.evaluate(`({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) })`);
      await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
      await b.sleep(400);
      await b.shot(name);
    };
    await compose('summary-doc-compare-1280', [['Mockup: desktop-03', mockDesktop], ['App · light', shotOf('summary-doc-1280')], ['App · dark', shotOf('summary-doc-1280-dark')]], 760);
    await compose('summary-doc-compare-390', [['Mockup: iphone-06', mockPhone], ['App · light', shotOf('summary-doc-390')], ['App · dark', shotOf('summary-doc-390-dark')]], 390);
    await b.resize(1280, 900);
    expect(missing.length === 0, `not taken in this run: ${missing.join(', ')}`);
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  for (const line of report) console.log(line);
  console.log(`console errors: ${JSON.stringify(errors)}`);
  console.log(`shots: ${SHOTS}`);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
