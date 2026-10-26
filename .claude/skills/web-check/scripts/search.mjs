// search.mjs — Search (step 3.5): a word said in a lecture is found without
// its accent ("filogenetico" → the transcript line at 18:22, highlighted),
// with the note's summary and its key-concept term, a PDF by its title, the
// count line and the course colour; nothing from the trash; the chips
// narrow the list; opening the transcript hit shows the lecture with the
// word marked and scrolled into view; opening counts for Recent without
// changing "Date edited"; the same page at 390 px. Rows are inserted with
// the service role (no recording needed). Screenshots: search-*.png.
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
    await b.shot(`fail-search-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const MAIN = '[data-testid=sidebar]';

const user = await makeUser();
const seeded = await seed(user.client);

const ins = async (table, rows) => {
  const { data, error } = await admin.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
};
const [bio] = await ins('courses', { user_id: user.id, name: 'Biología', color: '#2E7D32' });
const [tema] = await ins('folders', { user_id: user.id, course_id: bio.id, name: 'Tema 3' });
const [lecture, pdf, trashed] = await ins('files', [
  { user_id: user.id, kind: 'lecture', title: 'Clase 4', course_id: bio.id, folder_id: tema.id },
  { user_id: user.id, kind: 'pdf', title: 'Resumen filogenético.pdf', course_id: bio.id },
  { user_id: user.id, kind: 'lecture', title: 'Clase borrada', course_id: bio.id, deleted_at: new Date().toISOString() },
]);
await ins('lectures', [
  { user_id: user.id, id: lecture.id, status: 'ready', duration_ms: 3_000_000 },
  { user_id: user.id, id: trashed.id, status: 'ready', duration_ms: 60_000 },
]);
const filler = Array.from({ length: 60 }, (_, i) => ({
  user_id: user.id, lecture_id: lecture.id, start_ms: i * 15_000, end_ms: i * 15_000 + 14_000,
  text: `Frase de relleno número ${i} sobre las células y sus partes.`,
}));
await ins('transcript_segments', [
  ...filler,
  { user_id: user.id, lecture_id: lecture.id, start_ms: 1_102_000, end_ms: 1_106_000, text: '…lo que llamamos parentesco filogenético, que nos une a otras especies.' },
  { user_id: user.id, lecture_id: trashed.id, start_ms: 1000, end_ms: 3000, text: 'Un árbol filogenético en la papelera.' },
]);
await ins('summaries', {
  user_id: user.id, file_id: lecture.id, mode: 'new', sliders: {},
  result: {
    format: 'legacy-note-v1', isConfirmed: true, title: 'Clase 4', summaryLevel: 'standard',
    summary: 'Parentesco filogenético = el parentesco evolutivo entre especies.',
    keyConcepts: [{ term: 'Árbol filogenético', explanation: 'Diagrama del parentesco.' }],
    definitions: [], formulas: [], tags: [], unclearParts: [],
  },
});
// Lecture 1 edited after Clase 4, so Recent shows it first until Clase 4 is opened.
await admin.from('files').update({ title: 'Lecture 1' }).eq('id', seeded.lecture.id);
const editedBefore = (await admin.from('files').select('updated_at').eq('id', lecture.id).single()).data.updated_at;

const FOUND_BG = 'rgb(255, 228, 181)'; // colors.found (light)
const markedTexts = () =>
  b.evaluate(`[...document.querySelectorAll('span, div')]
    .filter((el) => getComputedStyle(el).backgroundColor === ${JSON.stringify(FOUND_BG)} && el.childElementCount === 0)
    .map((el) => el.innerText)`);
const badges = () =>
  b.evaluate(`[...document.querySelectorAll('[role=button][aria-label]')]
    .map((el) => el.getAttribute('aria-label'))
    .filter((l) => /, (Course|Folder|PDF|Lecture|Summary|Term|Key concept|Definition|Formula|Transcript)/.test(l))`);

const b = await launch({ width: 1280, height: 900 });
try {
  await b.signIn(BASE, user.email, user.password);

  await step('a word said in a lecture is found without its accent', async () => {
    await b.nav(`${BASE}/search`);
    await b.waitText('Search titles, notes and transcripts', { timeout: 20000 });
    await b.sleep(2500); // splash after the reload
    await b.fill('input[aria-label="Search"]', 'filogenetico');
    await b.waitText('Transcript 18:22', { timeout: 10000 });
    const labels = await badges();
    expect(labels.includes('Clase 4, Transcript 18:22'), `transcript hit: ${labels}`);
    expect(labels.includes('Clase 4, Summary'), `note hit: ${labels}`);
    expect(labels.includes('Clase 4, Term'), `term hit: ${labels}`);
    expect(labels.includes('Resumen filogenético.pdf, PDF'), `title hit: ${labels}`);
    expect(!labels.some((l) => l.startsWith('Clase borrada')), `nothing from the trash: ${labels}`);
    expect(await b.hasText('4 results in 1 course', true), 'count line');
    const marked = await markedTexts();
    expect(marked.filter((t) => t === 'filogenético').length >= 3, `the word is marked: ${marked}`);
    await b.shot('search-results');
  });

  await step('chips narrow the list', async () => {
    await b.click('Transcripts', { exact: true, exclude: MAIN });
    await b.sleep(300);
    expect(JSON.stringify(await badges()) === JSON.stringify(['Clase 4, Transcript 18:22']), `Transcripts: ${await badges()}`);
    expect(await b.hasText('1 result in 1 course', true), 'count follows the chip');
    await b.click('Titles', { exact: true, exclude: MAIN });
    await b.sleep(300);
    expect(JSON.stringify(await badges()) === JSON.stringify(['Resumen filogenético.pdf, PDF']), `Titles: ${await badges()}`);
    await b.click('Notes', { exact: true, exclude: MAIN });
    await b.sleep(300);
    expect((await badges()).length === 2, `Notes: ${await badges()}`);
    await b.shot('search-notes-chip');
    await b.click('All', { exact: true, exclude: MAIN });
    await b.sleep(300);
    expect((await badges()).length === 4, `All: ${await badges()}`);
  });

  await step('opening the transcript hit marks the word and scrolls to its line', async () => {
    await b.click('Transcript 18:22', { exact: true });
    await b.waitText('Full Transcript', { timeout: 15000 });
    await b.sleep(1500);
    const path = await b.evaluate('location.pathname + location.search');
    expect(path.startsWith(`/note/${lecture.id}`) && path.includes('at=1102000') && path.includes('find=filogenetico'), `url: ${path}`);
    expect(await b.hasText('18:22', true), 'the transcript shows its times');
    const visible = await b.evaluate(`(() => {
      const el = [...document.querySelectorAll('span, div')].find((e) => e.childElementCount === 0
        && e.innerText === 'filogenético' && getComputedStyle(e).backgroundColor === ${JSON.stringify(FOUND_BG)}
        && e.parentElement?.innerText?.includes('parentesco filogenético, que'));
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight ? 'visible' : 'off screen at ' + Math.round(r.top);
    })()`);
    expect(visible === 'visible', `the transcript line's word: ${visible}`);
    await b.shot('search-opened-transcript');
  });

  await step('opening counts for Recent, and "Date edited" stays', async () => {
    const { data } = await admin.from('files').select('updated_at, last_opened_at').eq('id', lecture.id).single();
    expect(data.last_opened_at, 'last_opened_at set');
    expect(data.updated_at === editedBefore, `updated_at moved: ${editedBefore} → ${data.updated_at}`);
    await b.nav(`${BASE}/library`);
    await b.waitText('COURSES', { timeout: 20000 });
    await b.sleep(2500);
    // Recent: Clase 4 (opened just now) before Lecture 1 (edited after Clase 4, before the opening).
    const order = await b.evaluate(`(() => {
      const side = document.querySelector('[data-testid=sidebar]')?.innerText ?? '';
      const t = document.body.innerText.replace(side, '');
      return [t.indexOf('Clase 4'), t.indexOf('Lecture 1')];
    })()`);
    expect(order[0] >= 0 && order[0] < order[1], `Recent order: ${order}`);
  });

  await step('iPhone (390 px): the same page', async () => {
    await b.resize(390, 844);
    await b.nav(`${BASE}/search`);
    await b.waitText('Search titles, notes and transcripts', { timeout: 20000 });
    await b.sleep(2500);
    await b.fill('input[aria-label="Search"]', 'Filogenético');
    await b.waitText('Transcript 18:22', { timeout: 10000 });
    expect(await b.hasText('4 results in 1 course', true), 'count line');
    await b.shot('search-390');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
