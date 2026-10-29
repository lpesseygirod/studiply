// blocks.mjs — step 4.6, Studiply's blocks, on the laptop and the iPhone bundle:
//   - Insert ▾ → Callout: each of the seven kinds, typed in; their labels and colours;
//   - a click on a callout's label: its level (You were confused here);
//   - Insert ▾ → Mark: "Confused 7/10"; a click on the chip changes it; Remove;
//   - Insert ▾ → Timestamp: "4:12" typed;
//   - the iPhone bundle (at phone width): all seven kinds arrive with their
//     labels and fills, and keep their kind, level and text after typing in each;
//   - a click on a label: Change to; Remove callout (the text stays);
//   - the selection bar: Mark ▸ and Time ▸ put their chip after the selected
//     words, Callout ▸ puts the paragraph in a box with its text; on a phone
//     the bar sits below the words with the three in a second row;
//   - a lecture with a recording (two 5-second chunks of a tone in local
//     Storage): a click on its 0:07 chip plays from 0:07 (in the second
//     chunk); +10 s; a blank document says it has no recording.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
// WEB_CHECK_ONLY=<part of a step's name> runs only the matching steps.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OUT } from './cdp.mjs';
import { makeUser, dropUser, seed } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const ONLY = process.env.WEB_CHECK_ONLY;
const results = [];
let b;
const step = async (name, fn) => {
  if (ONLY && !name.includes(ONLY)) return;
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-blocks-${results.length}`).catch(() => {});
  }
  console.error(`step ${results.length}: ${results.at(-1).join(' | ')}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

const KINDS = [
  ['definition', 'Definition'],
  ['example', 'Example'],
  ['exam', 'Exam signal'],
  ['warning', 'Common mistake'],
  ['fromNotes', 'From your notes'],
  ['confused', 'You were confused here'],
  ['addedContext', 'Added context'],
];
/** Each kind's fill (DocColors.callout). */
const FILLS = {
  definition: 'rgb(234, 232, 247)',
  example: 'rgb(238, 244, 255)',
  exam: 'rgb(255, 251, 235)',
  warning: 'rgb(253, 236, 236)',
  fromNotes: 'rgb(232, 245, 238)',
  confused: 'rgb(245, 224, 216)',
  addedContext: 'rgb(243, 241, 236)',
};

/** A tone, `seconds` long, as a 16-bit mono WAV (8 kHz). */
function wav(seconds, hz) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

const json = () => b.evaluate(`${EDITOR}.getJSON()`);
const click = (label) => b.clickSelector(`[aria-label="${label}"]`);
const insertMenu = async (item) => {
  // Behind ⌄ when the column is narrow.
  if (!(await b.evaluate(`!!document.querySelector('[aria-label="Insert"]')`))) await click('More tools');
  await click('Insert');
  await b.sleep(250);
  await click(item);
  await b.sleep(300);
};
const waitEditor = async () => {
  for (let i = 0; i < 80 && !(await b.evaluate(`!!${EDITOR}?.view?.dom`)); i++) await b.sleep(250);
  await b.sleep(1500);
};
const callouts = async () => ((await json()).content ?? []).filter((n) => n.type === 'callout');
const text = (n) => JSON.stringify(n).match(/"text":"([^"]*)"/g)?.map((t) => t.slice(8, -1)).join(' ') ?? '';
/** Clicks the label of the `i`th callout. */
const label = async (i) => {
  const at = await b.evaluate(`(() => { const r = document.querySelectorAll('.studiply-callout-label')[${i}].getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await b.clickAt(at.x, at.y);
  await b.sleep(400);
};

const user = await makeUser();
const data = await seed(user.client);
const lectureId = data.lecture.id;
await user.client.from('lectures').update({ status: 'completed', duration_ms: 10_000 }).eq('id', lectureId);
for (const [seq, hz] of [[0, 440], [1, 660]]) {
  const path = `${user.id}/${lectureId}/${String(seq).padStart(4, '0')}.wav`;
  const { error } = await user.client.storage.from('audio-chunks').upload(path, wav(5, hz), { contentType: 'audio/wav' });
  if (error) throw new Error(`upload: ${error.message}`);
  await user.client.from('audio_chunks').insert({ lecture_id: lectureId, seq, start_ms: seq * 5000, duration_ms: 5000, storage_path: path, status: 'uploaded' });
}
await user.client.from('documents').insert({
  file_id: lectureId,
  tab: 'notes',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'La sinapsis ' }, { type: 'timestampChip', attrs: { ms: 7000 } }] }] },
});
const { data: blank } = await user.client.from('files').insert({ kind: 'document', title: 'Bloques' }).select().single();
await user.client.from('documents').insert({ file_id: blank.id, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph' }] } });
b = await launch();
const openDoc = async (id, tab = '') => {
  await b.nav(`${BASE}/doc/${id}${tab}`);
  await waitEditor();
};

try {
  await b.signIn(BASE, user.email, user.password);
  await openDoc(blank.id);

  await step('Insert ▾ → Callout: each of the seven, typed in, with its label and colour', async () => {
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    for (const [kind, name] of KINDS) {
      await insertMenu('Insert callout');
      await click(`Callout: ${name}`);
      await b.sleep(250);
      await b.type(`Texto ${kind}`);
      // Enter twice: a new line in the box, then out of it (as in a list).
      await b.press('Enter');
      await b.press('Enter');
    }
    const list = await callouts();
    expect(JSON.stringify(list.map((c) => c.attrs.kind)) === JSON.stringify(KINDS.map((k) => k[0])), `kinds: ${list.map((c) => c.attrs.kind)}`);
    for (const [i, [kind]] of KINDS.entries()) expect(text(list[i]) === `Texto ${kind}`, `${kind}: ${text(list[i])}`);
    const look = await b.evaluate(`[...document.querySelectorAll('.studiply-callout')].map((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderLeftWidth, el.querySelector('.studiply-callout-label').textContent])`);
    // 4 px (zoomed by Fit, rounded to whole screen pixels).
    expect(look[0][0] === 'rgb(234, 232, 247)' && Math.abs(parseFloat(look[0][1]) - 4) <= 1 && look[0][2] === 'Definition', JSON.stringify(look[0]));
    expect(look[6][2] === 'Added context · not from the lecture', look[6][2]);
    await b.shot('blocks-callouts');
  });

  await step('a click on a label: the level (You were confused here)', async () => {
    await label(5);
    await click('Level 7');
    await b.sleep(300);
    expect((await callouts())[5].attrs.level === 7, JSON.stringify((await callouts())[5].attrs));
    expect(await b.evaluate(`document.querySelectorAll('.studiply-callout-label')[5].textContent === 'You were confused here · 7/10'`), 'the label has no level');
  });

  await step('Insert ▾ → Mark: "Confused 7/10"; a click on it changes kind and level; Remove', async () => {
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    await insertMenu('Insert mark');
    await click('Mark: Confused');
    await click('Level 7');
    await click('Insert mark');
    await b.sleep(300);
    expect(await b.hasText('Confused 7/10', true), 'no "Confused 7/10"');
    await b.clickSelector('.studiply-mark-chip');
    await b.sleep(400);
    await click('Mark: Exam');
    await click('Level 9');
    await click('Done mark');
    await b.sleep(300);
    expect(await b.hasText('Exam 9/10', true), 'not changed to "Exam 9/10"');
    await b.shot('blocks-mark');
    await b.clickSelector('.studiply-mark-chip');
    await b.sleep(400);
    await click('Remove mark');
    await b.sleep(300);
    expect(!(await b.evaluate(`!!document.querySelector('.studiply-mark-chip')`)), 'not removed');
    // One to keep for the iPhone step.
    await insertMenu('Insert mark');
    await click('Mark: Important');
    await click('Level 8');
    await click('Insert mark');
  });

  await step('Insert ▾ → Timestamp: "4:12" typed', async () => {
    await insertMenu('Insert timestamp');
    await b.fill('input[placeholder="4:12"]', '4:12');
    await b.press('Enter');
    await b.sleep(400);
    expect(JSON.stringify(await json()).includes('"ms":252000'), 'no 4:12 chip');
  });

  await step('the iPhone: all seven kinds arrive, look the same, and survive typing in each', async () => {
    const doc = await json();
    const css = await b.evaluate('window.studiplyEditorCss()');
    await b.resize(390, 844);
    await b.nav(IPHONE);
    await waitEditor();
    await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })()`);
    await b.evaluate(`${EDITOR}.commands.setContent(${JSON.stringify(doc)})`);
    await b.sleep(400);
    const look = await b.evaluate(`[...document.querySelectorAll('.studiply-callout')].map((el) => [el.dataset.callout, getComputedStyle(el).backgroundColor, el.querySelector('.studiply-callout-label').textContent])`);
    expect(JSON.stringify(look.map((l) => l[0])) === JSON.stringify(KINDS.map((k) => k[0])), `kinds drawn: ${look.map((l) => l[0])}`);
    for (const [i, [kind, name]] of KINDS.entries()) {
      expect(look[i][1] === FILLS[kind], `${kind}: fill ${look[i][1]}`);
      expect(look[i][2].startsWith(name), `${kind}: label ${look[i][2]}`);
    }
    expect(look[5][2] === 'You were confused here · 7/10', look[5][2]);
    const r = await b.evaluate(`({ chips: [...document.querySelectorAll('.studiply-mark-chip')].map((c) => c.textContent), times: [...document.querySelectorAll('.ts-chip')].map((c) => c.textContent) })`);
    expect(r.chips.includes('Important 8/10') && r.times.includes('4:12'), JSON.stringify(r));
    // Typed on the iPhone at the end of each box: the kinds, level and text come back.
    for (let i = 0; i < KINDS.length; i++) {
      await b.evaluate(`(() => { const e = ${EDITOR}; let n = -1, at = 0; e.state.doc.forEach((node, pos) => { if (node.type.name === 'callout' && ++n === ${i}) at = pos + node.nodeSize - 2; }); e.commands.focus(at); })()`);
      await b.type(' iPhone');
    }
    const back = ((await json()).content ?? []).filter((n) => n.type === 'callout');
    expect(JSON.stringify(back.map((c) => c.attrs.kind)) === JSON.stringify(KINDS.map((k) => k[0])), `kinds after typing: ${back.map((c) => c.attrs.kind)}`);
    for (const [i, [kind]] of KINDS.entries()) expect(text(back[i]) === `Texto ${kind} iPhone`, `${kind}: ${text(back[i])}`);
    expect(back[5].attrs.level === 7, JSON.stringify(back[5].attrs));
    await b.evaluate('window.scrollTo(0, 0)');
    await b.shot('blocks-iphone');
    await b.resize(1280, 900);
    await openDoc(blank.id);
  });

  await step('a click on a label: Change to; Remove callout keeps the text', async () => {
    await label(0);
    await click('Callout: Example');
    await b.sleep(300);
    expect((await callouts())[0].attrs.kind === 'example', 'not changed to Example');
    await label(6);
    await b.click('Remove callout (keep the text)', { exact: true });
    await b.sleep(300);
    expect((await callouts()).length === 6, 'not removed');
    expect(JSON.stringify(await json()).includes('Texto addedContext'), 'its text went too');
  });

  await step('the selection bar: Callout ▸ keeps the text inside; Mark ▸ and Time ▸ go after the words; two rows below the words on a phone', async () => {
    await b.evaluate(`(() => { const e = ${EDITOR}; e.chain().focus('end').insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'Esto entra en el examen' }] }).run(); })()`);
    await b.sleep(300);
    const lastPara = `(() => { const ps = [...document.querySelectorAll('.ProseMirror > p')].filter((p) => p.textContent.includes('Esto entra')); return ps[ps.length - 1]; })()`;
    // Words in the paragraph's text piece `n` (a chip splits the text, and its own label is text too).
    const words = async (from, to, n = 0) => {
      const w = await b.evaluate(`(() => { const p = ${lastPara}; const t = [...p.childNodes].filter((c) => c.nodeType === 3)[${n}]; const r = document.createRange(); r.setStart(t, ${from}); r.setEnd(t, ${to}); const box = r.getBoundingClientRect(); return { x1: box.left + 1, x2: box.right - 1, y: box.top + box.height / 2 }; })()`);
      await b.mouseDrag({ x: w.x1, y: w.y }, { x: w.x2, y: w.y });
      await b.sleep(400);
    };
    const shown = (label) => b.evaluate(`(() => { const e = document.querySelector('.studiply-selection-bar [aria-label="${label}"]'); return !!e && getComputedStyle(e.parentElement).display === 'flex' && getComputedStyle(e).display !== 'none'; })()`);
    const lastJson = async () => (await json()).content.filter((n) => JSON.stringify(n).includes('Esto entra')).at(-1);
    // Mark ▸: the chip after "Esto entra".
    await words(0, 10);
    expect(await shown('Mark after the selection'), 'no Mark ▸ on the bar');
    expect(await shown('Bold selection') && await shown('Comment on the selection') && await shown('Link selection'), 'Comment, B or Link went');
    await click('Mark after the selection');
    await b.sleep(400);
    await click('Mark: Exam');
    await click('Level 9');
    await click('Insert mark');
    await b.sleep(300);
    let para = await lastJson();
    expect(JSON.stringify(para.content.map((n) => n.text ?? n.type)) === JSON.stringify(['Esto entra', 'markChip', ' en el examen']), JSON.stringify(para.content));
    // Time ▸: the chip after "examen".
    await words(1, 13, 1);
    await click('Time after the selection');
    await b.fill('input[placeholder="4:12"]', '18:30');
    await b.press('Enter');
    await b.sleep(400);
    para = await lastJson();
    expect(para.content.at(-1).type === 'timestampChip' && para.content.at(-1).attrs.ms === 1_110_000, JSON.stringify(para.content));
    expect(JSON.stringify(para).includes(' en el examen'), 'the words went');
    // Callout ▸: the paragraph into an Exam signal, its text inside.
    await words(0, 4);
    await click('Callout from the selection');
    await b.sleep(400);
    await click('Callout: Exam signal');
    await b.sleep(300);
    const box = await lastJson();
    expect(box.type === 'callout' && box.attrs.kind === 'exam', JSON.stringify(box).slice(0, 200));
    expect(JSON.stringify(box).includes('Esto entra') && JSON.stringify(box).includes('markChip') && JSON.stringify(box).includes('timestampChip'), 'the text did not stay inside');
    await b.shot('blocks-selection-laptop');

    // The iPhone bundle at a phone's width: below the words, the three in a second row.
    const css = await b.evaluate('window.studiplyEditorCss()');
    await b.resize(390, 844);
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] });
    try {
      await b.nav(IPHONE);
      await waitEditor();
      await b.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); })()`);
      await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'La sinapsis es la unión funcional entre dos neuronas.' }] }] }); e.commands.focus(); e.commands.setTextSelection({ from: 1, to: 12 }); })()`);
      await b.sleep(400);
      const r = await b.evaluate(`(() => { const bar = document.querySelector('.studiply-selection-bar'); const q = (l) => bar.querySelector('[aria-label="' + l + '"]').getBoundingClientRect(); const s = window.getSelection().getRangeAt(0).getBoundingClientRect(); const box = bar.getBoundingClientRect(); return { below: box.top >= s.bottom, fits: box.right <= innerWidth && box.left >= 0, rows: q('Callout from the selection').top > q('Link selection').bottom - 1, sameRow: Math.abs(q('Mark after the selection').top - q('Callout from the selection').top) < 2, sideways: [...document.querySelectorAll('body *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX)).map((e) => e.className || e.tagName) }; })()`);
      // The bar never makes the page scroll sideways (its row divider once did, by 2 px).
      expect(r.below && r.fits && r.rows && r.sameRow && !r.sideways.length, JSON.stringify(r));
      await b.shot('blocks-selection-iphone');
    } finally {
      await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await b.send('Emulation.setEmulatedMedia', { features: [] });
      await b.resize(1280, 900);
      await openDoc(blank.id);
    }
  });

  await step('a lecture: its 0:07 chip plays from 0:07 (the second chunk); +10 s; a blank document has no recording', async () => {
    await openDoc(lectureId, '?tab=notes');
    await b.clickSelector('.ts-chip');
    let time = '';
    for (let i = 0; i < 40; i++) {
      time = await b.evaluate(`document.querySelector('[aria-label^="At "]')?.getAttribute('aria-label') ?? ''`);
      if (/^At 0:0[7-9] of 0:10$/.test(time) && (await b.evaluate(`!!document.querySelector('[aria-label="Pause"]')`))) break;
      await b.sleep(250);
    }
    expect(/^At 0:0[7-9] of 0:10$/.test(time), `player: ${time}`);
    expect(await b.evaluate(`!!document.querySelector('[aria-label="Pause"]')`), 'not playing');
    await b.shot('blocks-player');
    await click('Forward 10 seconds');
    await b.sleep(800);
    time = await b.evaluate(`document.querySelector('[aria-label^="At "]')?.getAttribute('aria-label') ?? ''`);
    expect(/^At 0:(09|10) of 0:10$/.test(time), `after +10 s: ${time}`);
    await click('Close the player');
    await openDoc(blank.id);
    await b.evaluate(`${EDITOR}.chain().focus('end').insertTimestampChip(3000).run()`);
    await b.sleep(300);
    await b.clickSelector('.ts-chip');
    await b.waitText('This document has no recording.', { exact: true });
    await b.shot('blocks-no-recording');
  });
} finally {
  const errors = b.errors();
  await b.close();
  await dropUser(user.id);
  for (const r of results) console.log(r.join(' | '));
  console.log('console errors:', JSON.stringify(errors));
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
