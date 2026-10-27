// editor-spike.mjs — the editor spike (step 4.2): one schema on both
// devices. The laptop editor (Tiptap in the app page) and the iPhone's
// editor (editor-web/build/editorHtml.js, the exact page TenTap's WebView
// loads, opened with ?standalone) must read and write the same JSON:
//   - write, format and insert a chip on the laptop, Save: the documents row
//     holds the heading, the bold text and the chip;
//   - the iPhone editor loads that JSON and gives it back unchanged, chip
//     shown as its time; it adds a chip at 4:12 ("saved on the iPhone");
//   - the laptop Loads it: identical, 4:12 shown, tapping the chip reports it;
//   - the same Google Docs- and Word-shaped clipboard HTML pasted into both
//     gives the same JSON; Google Docs keeps headings, bold, lists and the
//     table (BUILD-PLAN's check). These samples are approximations of what
//     those apps put on the clipboard; Lea's real paste is the real check;
//   - 20 pages: load time in both editors, typing time on the laptop;
//   - Delete spike document removes the row.
// Prints the paste reports and timings for PROGRESS. Screenshots: spike-*.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OUT, SHOTS } from './cdp.mjs';
import { admin, makeUser, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const SPIKE = `${BASE}/dev/editor-spike`;
const TITLE = 'Editor spike (development)';
const results = [];
const notes = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-spike-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// Same as src/editor/spikeSample.ts canonicalJson: compare by content, not key order.
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [c]) => (a < c ? -1 : 1)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
};
const find = (node, pred) => (pred(node) ? node : (node.content ?? []).map((c) => find(c, pred)).find(Boolean));

// The iPhone editor as a page of its own (the committed bundle, not a rebuild).
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

const EDITOR = 'window.studiplyEditor';
const waitEditor = async () => {
  for (let i = 0; i < 80; i++) {
    if (await b.evaluate(`!!${EDITOR}?.view?.dom`)) return;
    await b.sleep(250);
  }
  throw new Error('the editor did not start');
};
const json = () => b.evaluate(`${EDITOR}.getJSON()`);
const setContent = (doc) => b.evaluate(`(() => { const t = performance.now(); ${EDITOR}.commands.setContent(${JSON.stringify(doc)}); ${EDITOR}.getJSON(); return performance.now() - t; })()`);
const paste = (html) => b.evaluate(`(() => {
  const e = ${EDITOR};
  e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
  e.commands.focus('start');
  const dt = new DataTransfer();
  dt.setData('text/html', ${JSON.stringify(html)});
  dt.setData('text/plain', 'pasted');
  e.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return { doc: e.getJSON(), report: e.storage.pasteReport.last };
})()`);
const statusText = () => b.evaluate('document.body.innerText');

// ---- Clipboard samples (approximations of what each app puts on the clipboard) ----
const S = 'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-style:normal;font-variant:normal;text-decoration:none;vertical-align:baseline;white-space:pre-wrap;';
const GOOGLE_DOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-5b1e2c3d-7fff-1a2b-3c4d-5e6f7a8b9c0d">`
  + `<h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;"><span style="${S}font-size:20pt;font-weight:400;">Tema 3: Filogenia</span></h1>`
  + `<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="${S}font-weight:700;">Homología</span><span style="${S}font-weight:400;">: semejanza por </span><span style="${S}font-weight:400;font-style:italic;">ancestro común</span><span style="${S}font-weight:400;"> y </span><span style="${S}font-weight:400;text-decoration:underline;-webkit-text-decoration-skip:none;">subrayado</span><span style="${S}font-weight:400;"> </span><span style="${S}font-weight:400;color:#cc0000;">rojo</span><span style="${S}font-weight:400;"> </span><span style="${S}font-weight:400;background-color:#ffff00;">resaltado</span></p>`
  + `<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="${S}font-size:16pt;font-weight:400;">Conceptos</span></h2>`
  + `<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;${S}" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="${S}font-weight:400;">sinapsis</span></p></li><li dir="ltr" style="list-style-type:disc;${S}" aria-level="1"><p dir="ltr" role="presentation" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="${S}font-weight:700;">neurona</span></p></li></ul>`
  + `<ol style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:decimal;" aria-level="1"><p dir="ltr" role="presentation"><span style="${S}font-weight:400;">primero</span></p></li></ol>`
  + `<br><div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;"><colgroup><col width="300"><col width="300"></colgroup><tbody>`
  + `<tr style="height:0pt"><td style="border-left:solid #000000 1pt;border-right:solid #000000 1pt;border-bottom:solid #000000 1pt;border-top:solid #000000 1pt;vertical-align:top;padding:5pt;"><p dir="ltr"><span style="${S}font-weight:700;">Término</span></p></td><td style="border:solid #000000 1pt;vertical-align:top;padding:5pt;"><p dir="ltr"><span style="${S}font-weight:700;">Definición</span></p></td></tr>`
  + `<tr style="height:0pt"><td style="border:solid #000000 1pt;"><p dir="ltr"><span style="${S}font-weight:400;">Homología</span></p></td><td style="border:solid #000000 1pt;"><p dir="ltr"><span style="${S}font-weight:400;">Ancestro común</span></p></td></tr>`
  + `</tbody></table></div></b>`;

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=Generator content="Microsoft Word 15"><style>p.MsoNormal{margin:0cm;font-size:12.0pt;font-family:"Calibri",sans-serif;}</style></head><body lang=ES style='tab-interval:35.4pt'><!--StartFragment-->`
  + `<h1>Tema 3: Filogenia</h1>`
  + `<p class=MsoNormal><b>Homología</b>: semejanza por <i>ancestro común</i> y <u>subrayado</u> <span style='color:#C00000'>rojo</span> <span style='background:yellow;mso-highlight:yellow'>resaltado</span></p>`
  + `<h2>Conceptos</h2>`
  + `<p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>sinapsis</p>`
  + `<p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]><b>neurona</b></p>`
  + `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'><tr><td width=300 valign=top style='border:solid windowtext 1.0pt'><p class=MsoNormal><b>Término</b></p></td><td width=300 valign=top style='border:solid windowtext 1.0pt'><p class=MsoNormal><b>Definición</b></p></td></tr>`
  + `<tr><td width=300 valign=top style='border:solid windowtext 1.0pt'><p class=MsoNormal>Homología</p></td><td width=300 valign=top style='border:solid windowtext 1.0pt'><p class=MsoNormal>Ancestro común</p></td></tr></table>`
  + `<!--EndFragment--></body></html>`;

const user = await makeUser();
b = await launch();
const pasted = {};
let pages = null;
const spikeRow = async () => {
  const { data: files } = await admin.from('files').select('id').eq('user_id', user.id).eq('title', TITLE);
  if (!files?.length) return null;
  const { data: doc } = await admin.from('documents').select('content').eq('file_id', files[0].id).eq('tab', 'notes').maybeSingle();
  return { fileId: files[0].id, content: doc?.content };
};
const openSpike = async () => {
  await b.nav(SPIKE);
  await b.waitText('Write something, insert a chip, then Save.', { timeout: 60000 });
  await waitEditor();
  await b.sleep(2500); // the splash screen covers a full reload for ~2 s
};

try {
  await b.signIn(BASE, user.email, user.password);

  await step('laptop: write, format, insert a chip and Save', async () => {
    await openSpike();
    await b.clickSelector('.studiply-editor .ProseMirror');
    await b.type('Tema 3');
    await b.click('H1');
    await b.press('Enter');
    await b.type('Hola ');
    await b.click('Insert chip');
    await b.type(' ');
    await b.chord({ code: 'KeyB', key: 'b', meta: true });
    await b.type('parentesco filogenético');
    await b.chord({ code: 'KeyB', key: 'b', meta: true });
    await b.click('Save');
    await b.waitText('Saved ', { timeout: 10000 });
    const row = await spikeRow();
    expect(row?.content, 'no documents row');
    const doc = row.content;
    expect(doc.content?.[0]?.type === 'heading' && doc.content[0].attrs?.level === 1, `first block: ${JSON.stringify(doc.content?.[0])}`);
    expect(find(doc, (n) => n.type === 'timestampChip' && Number.isInteger(n.attrs?.ms)), 'no chip with ms');
    expect(find(doc, (n) => n.text === 'parentesco filogenético' && n.marks?.some((m) => m.type === 'bold')), 'no bold text');
    await b.shot('spike-laptop-saved');
  });

  await step('iPhone editor: opens the laptop JSON unchanged, and saves a chip at 4:12', async () => {
    const saved = (await spikeRow()).content;
    await b.nav(IPHONE);
    await waitEditor();
    await setContent(saved);
    expect(canonical(await json()) === canonical(saved), 'the iPhone editor changed the JSON');
    const chip = find(saved, (n) => n.type === 'timestampChip');
    const shown = await b.evaluate(`document.querySelector('.ts-chip')?.textContent`);
    const m = Math.floor(chip.attrs.ms / 1000);
    const label = m >= 3600 ? null : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    expect(!label || shown === label, `chip shows ${shown}, expected ${label}`);
    await b.evaluate(`${EDITOR}.chain().focus('end').insertTimestampChip(252000).insertContent(' desde el iPhone').run()`);
    const fromIphone = await json();
    const { error } = await admin.from('documents').update({ content: fromIphone }).eq('file_id', (await spikeRow()).fileId).eq('tab', 'notes');
    expect(!error, error?.message);
    await b.shot('spike-iphone-editor');
  });

  await step('laptop: Load gives the iPhone JSON back identical, 4:12 shown, chip tap reported', async () => {
    await openSpike();
    await b.click('Load');
    await b.waitText('identical to the saved JSON ✓', { timeout: 10000 });
    expect(await b.evaluate(`[...document.querySelectorAll('.studiply-editor .ts-chip')].some((c) => c.textContent === '4:12')`), 'no 4:12 chip');
    const at = await b.evaluate(`(() => {
      const r = [...document.querySelectorAll('.studiply-editor .ts-chip')].find((c) => c.textContent === '4:12').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await b.clickAt(at.x, at.y);
    await b.waitText('Chip 4:12 tapped: would play from 4:12.', { timeout: 5000 });
  });

  for (const [name, html] of [['Google Docs', GOOGLE_DOCS], ['Word', WORD]]) {
    await step(`paste ${name}: same JSON in both editors`, async () => {
      await openSpike();
      const laptop = await paste(html);
      await b.sleep(400);
      const line = (await statusText()).split('\n').find((l) => l.startsWith('Paste —'));
      expect(line, 'no paste report on the screen');
      await b.shot(`spike-paste-${name === 'Word' ? 'word' : 'gdocs'}`);
      await b.nav(IPHONE);
      await waitEditor();
      const iphone = await paste(html);
      expect(canonical(iphone.doc) === canonical(laptop.doc), 'the two editors made different documents');
      pasted[name] = { laptop, iphone, line };
      notes.push(`paste ${name} (laptop): ${line}`);
      notes.push(`paste ${name} (iPhone editor): kept ${JSON.stringify(iphone.report.kept)}`);
    });
  }

  await step('paste Google Docs keeps headings, bold, lists and the table', async () => {
    const { report } = pasted['Google Docs'].laptop;
    expect(report.source === 'Google Docs', `source ${report.source}`);
    expect(report.kept.headings === 2, `headings ${report.kept.headings}`);
    expect(report.kept.bold >= report.had.bold, `bold ${report.kept.bold}/${report.had.bold}`);
    expect(report.kept.listItems === 3, `list items ${report.kept.listItems}`);
    expect(report.kept.tables === 1 && report.kept.cells === 4, `table ${report.kept.tables}/${report.kept.cells}`);
  });

  await step('20 pages: load in both editors, typing on the laptop', async () => {
    await openSpike();
    await b.click('Load 20 pages');
    await b.waitText('20 pages:', { timeout: 30000 });
    const line = (await statusText()).split('\n').find((l) => l.startsWith('20 pages:'));
    notes.push(`laptop: ${line}`);
    pages = await json();
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    // Real key presses (b.type inserts text without a keydown, which the timing needs).
    for (const ch of 'escribiendo') await b.chord({ code: `Key${ch.toUpperCase()}`, key: ch, text: ch });
    await b.sleep(500);
    const typing = (await statusText()).split('\n').find((l) => l.startsWith('Typing:'));
    expect(typing, 'no typing line');
    notes.push(`laptop: ${typing}`);
    await b.shot('spike-20-pages-1280');
    await b.nav(IPHONE);
    await waitEditor();
    const t = await setContent(pages);
    notes.push(`iPhone editor in desktop Chrome: 20 pages in ${Math.round(t)} ms (a phone is slower; Lea times it on the iPhone)`);
  });

  await step('iPhone width (390 px): the spike screen', async () => {
    await b.resize(390, 844);
    await openSpike();
    await b.click('Load');
    await b.waitText('identical to the saved JSON ✓', { timeout: 10000 });
    await b.shot('spike-390');
    await b.resize(1280, 900);
  });

  await step('Delete spike document removes it', async () => {
    await openSpike();
    await b.click('Delete spike document');
    await b.waitText('Delete the spike document?');
    await b.click('Delete');
    await b.waitText('Spike document deleted.', { timeout: 10000 });
    expect(!(await spikeRow()), 'the file row is still there');
  });
} finally {
  for (const r of results) console.log(r.join(' | '));
  for (const n of notes) console.log('NOTE |', n);
  console.log('screenshots:', SHOTS);
  console.log('console errors:', JSON.stringify(b.errors().slice(0, 10), null, 1));
  await b.close();
  await dropUser(user.id);
  if (results.some((r) => r[0] === 'FAIL')) process.exitCode = 1;
}
