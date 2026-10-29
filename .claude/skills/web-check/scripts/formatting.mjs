// formatting.mjs — the formatting tools (step 4.4), on the laptop:
//   - every toolbar control, read back from the document JSON;
//   - typing shortcuts ("- ", "1. ", "# ", $$…$$, **bold**…) typed key by
//     key, and Backspace right after one;
//   - Google Docs' shortcuts, among them ⌘⇧R, ⌘⇧J and ⌘⇧V, which do the
//     editor's action and not Chrome's: the page isn't reloaded (a marker on
//     the page survives) and the key or paste event was blocked from the
//     browser. (The keys this check sends may not reach Chrome's own menu
//     shortcuts at all, so Lea's real keyboard is the final word.)
//   - Google Docs- and Word-shaped clipboard HTML (src/editor/paste/__tests__
//     /clipboard.json) pasted into the laptop editor and the iPhone's editor
//     bundle: the same document, nothing lost;
//   - the Psicobiología page rebuilt with the toolbar; screenshots
//     (fmt-*.png) at 1280 and 390, light and dark.
// Prints PASS/FAIL per step. Exit code 1 on any FAIL.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, OUT, SHOTS } from './cdp.mjs';
import { makeUser, dropUser } from './testuser.mjs';

const BASE = process.env.WEB_CHECK_URL ?? 'http://localhost:8123';
const results = [];
const notes = [];
let b;
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (err) {
    results.push(['FAIL', name, err.message]);
    await b.shot(`fail-fmt-${results.length}`).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const EDITOR = 'window.studiplyEditor';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const clipboard = JSON.parse(readFileSync(join(repo, 'src/editor/paste/__tests__/clipboard.json'), 'utf8'));

// The iPhone's editor as a page of its own (the committed bundle).
const src = readFileSync(join(repo, 'editor-web/build/editorHtml.js'), 'utf8');
const iphoneFile = join(OUT, 'iphone-editor.html');
writeFileSync(iphoneFile, JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';'))));
const IPHONE = `file://${iphoneFile}?standalone`;

const json = () => b.evaluate(`${EDITOR}.getJSON()`);
const first = async () => (await json()).content[0];
const click = (label) => b.clickSelector(`[aria-label="${label}"]`);
const waitEditor = async () => {
  for (let i = 0; i < 80; i++) {
    if (await b.evaluate(`!!${EDITOR}?.view?.dom`)) return;
    await b.sleep(250);
  }
  throw new Error('the editor did not start');
};
/** Puts one paragraph with `text` in the editor and selects it all. */
const fresh = async (text = 'La Psicobiología une Psicología y Biología.') => {
  await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ${JSON.stringify(text)} }] }] }); e.commands.focus(); e.commands.selectAll(); })()`);
  await b.sleep(200);
};
/** An empty document, the cursor in it. */
const empty = async () => {
  await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }); e.commands.focus('end'); })()`);
  await b.sleep(150);
};
/** Typed key by key, as the keyboard sends it (each character a key press with its text). */
const keys = async (text) => {
  for (const ch of text) {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }
  await b.sleep(200);
};
const marksOf = (node) => (node.content ?? []).flatMap((t) => t.marks ?? []);
/** The document without what differs between two editors (ids, edit times). */
const shape = (doc) => JSON.parse(JSON.stringify(doc, (k, v) => (k === 'blockId' || k === 'editedAt' ? undefined : v)));
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
const lost = (report) => Object.keys(report.had).filter((k) => report.kept[k] < report.had[k]);

const user = await makeUser();
const { data: file } = await user.client.from('files').insert({ kind: 'document', title: 'Formato' }).select().single();
await user.client.from('documents').insert({ file_id: file.id, tab: 'notes', content: { type: 'doc', content: [{ type: 'paragraph' }] } });
b = await launch();
const pasted = {};

try {
  await b.signIn(BASE, user.email, user.password);
  await b.nav(`${BASE}/doc/${file.id}`);
  await waitEditor();
  await b.sleep(2500);
  await b.clickSelector('.studiply-editor .ProseMirror');
  // The second row (align, spacing, indent, strikethrough, checklist…; step 4.5).
  await click('More tools');

  await step('toolbar: text style, font, size', async () => {
    await fresh();
    await click('Text style');
    await b.click('Heading 1');
    expect((await first()).type === 'heading' && (await first()).attrs.level === 1, JSON.stringify(await first()));
    await click('Text style');
    await b.click('Title');
    expect((await first()).type === 'title', (await first()).type);
    await click('Text style');
    await b.click('Normal text');
    await b.evaluate(`${EDITOR}.commands.selectAll()`);
    await click('Font');
    await b.click('Rounded');
    expect(marksOf(await first()).some((m) => m.type === 'textStyle' && /ui-rounded/.test(m.attrs.fontFamily)), 'no Rounded');
    await click('Bigger');
    expect(marksOf(await first()).some((m) => m.attrs?.fontSize === '16px'), 'no 16px');
  });

  await step('toolbar: B I U S, colour, highlight', async () => {
    await fresh();
    for (const label of ['Bold', 'Italic', 'Underline', 'Strikethrough']) await click(label);
    const types = marksOf(await first()).map((m) => m.type);
    for (const t of ['bold', 'italic', 'underline', 'strike']) expect(types.includes(t), `no ${t}`);
    await click('Text colour');
    await click('Text colour Red');
    await click('Highlight');
    await click('Highlight Yellow lighter 60 %');
    const marks = marksOf(await first());
    expect(marks.some((m) => m.type === 'textStyle' && m.attrs.color === '#DC2626'), 'no red');
    expect(marks.some((m) => m.type === 'highlight' && m.attrs.color === '#F7E19C'), `no light yellow highlight: ${JSON.stringify(marks)}`);
    await b.shot('fmt-marks-1280');
    await click('Clear formatting');
    expect(marksOf(await first()).length === 0, JSON.stringify(marksOf(await first())));
  });

  await step('toolbar: lists, align, line spacing, indent, page break', async () => {
    await fresh();
    await click('Numbered list');
    expect((await first()).type === 'orderedList', (await first()).type);
    await click('Numbered list');
    for (const [label, value] of [['Align centre (⌘⇧E)', 'center'], ['Align right (⌘⇧R)', 'right'], ['Align justify (⌘⇧J)', 'justify'], ['Align centre (⌘⇧E)', 'center']]) {
      await click(label);
      expect((await first()).attrs.textAlign === value, `${label}: ${JSON.stringify((await first()).attrs)}`);
    }
    await click('Line spacing');
    await b.click('Double');
    expect((await first()).attrs.lineSpacing === 2, JSON.stringify((await first()).attrs));
    await click('Increase indent');
    await click('Increase indent');
    expect((await first()).attrs.indent === 2, JSON.stringify((await first()).attrs));
    await click('Decrease indent');
    expect((await first()).attrs.indent === 1, 'indent not 1');
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    await click('Page break');
    expect((await json()).content.some((n) => n.type === 'pageBreak'), 'no page break');
  });

  await step('shortcuts: ⌘B, ⌘⇧X, ⌘⌥1, ⌘⇧8, ⌘], ⌘⇧., ⌘\\', async () => {
    await fresh();
    await b.chord({ code: 'KeyB', key: 'b', meta: true, keyCode: 66 });
    await b.chord({ code: 'KeyX', key: 'x', meta: true, shift: true, keyCode: 88 });
    let types = marksOf(await first()).map((m) => m.type);
    expect(types.includes('bold') && types.includes('strike'), types.join());
    await b.chord({ code: 'Period', key: '>', meta: true, shift: true, keyCode: 190 });
    expect(marksOf(await first()).some((m) => m.attrs?.fontSize === '16px'), 'size not bigger');
    await b.chord({ code: 'Backslash', key: '\\', meta: true, keyCode: 220 });
    expect(marksOf(await first()).length === 0, 'formatting not cleared');
    await b.chord({ code: 'Digit1', key: '¡', meta: true, alt: true, keyCode: 49 });
    expect((await first()).type === 'heading', `⌘⌥1 gave ${(await first()).type}`);
    await b.chord({ code: 'Digit0', key: 'º', meta: true, alt: true, keyCode: 48 });
    await b.chord({ code: 'BracketRight', key: ']', meta: true, keyCode: 221 });
    expect((await first()).attrs.indent === 1, `⌘] gave ${JSON.stringify((await first()).attrs)}`);
    await b.chord({ code: 'Digit8', key: '*', meta: true, shift: true, keyCode: 56 });
    expect((await first()).type === 'bulletList', `⌘⇧8 gave ${(await first()).type}`);
  });

  await step('typing shortcuts with real keys: "- ", "1. ", "[] ", "# ", "> ", $$…$$, **bold**; Backspace takes one back', async () => {
    for (const [typed, want] of [['- ', 'bulletList'], ['1. ', 'orderedList'], ['[] ', 'taskList'], ['# ', 'heading'], ['> ', 'blockquote']]) {
      await empty();
      await keys(`${typed}Tema`);
      const node = await first();
      expect(node.type === want, `"${typed}" gave ${node.type}`);
      expect(JSON.stringify(node).includes('"text":"Tema"'), `"${typed}": the text after it is ${JSON.stringify(node)}`);
    }
    await empty();
    await keys('$$x^2$$');
    let doc = await json();
    expect(doc.content[0].type === 'blockMath' && doc.content[0].attrs.latex === 'x^2', `$$x^2$$ gave ${JSON.stringify(doc.content[0])}`);
    await keys('y');
    doc = await json();
    expect(doc.content[1]?.type === 'paragraph' && doc.content[1].content?.[0]?.text === 'y', `after the display formula: ${JSON.stringify(doc.content[1])}`);
    await empty();
    await keys('Es **muy** clave');
    const runs = (await first()).content;
    expect(runs.some((r) => r.text === 'muy' && r.marks?.[0]?.type === 'bold') && runs.every((r) => !r.text.includes('*')), `**muy** gave ${JSON.stringify(runs)}`);
    await empty();
    await keys('- ');
    expect((await first()).type === 'bulletList', 'no list before Backspace');
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await b.sleep(200);
    const back = await first();
    expect(back.type === 'paragraph' && back.content?.[0]?.text === '- ', `Backspace right after gave ${JSON.stringify(back)}`);
  });

  await step('⌘⇧L, ⌘⇧E (centre), ⌘⇧R, ⌘⇧J align the text', async () => {
    await fresh();
    for (const [code, key, kc, value] of [['KeyE', 'e', 69, 'center'], ['KeyR', 'r', 82, 'right'], ['KeyJ', 'j', 74, 'justify'], ['KeyE', 'e', 69, 'center'], ['KeyL', 'l', 76, undefined]]) {
      await b.chord({ code, key, meta: true, shift: true, keyCode: kc });
      expect((await first()).attrs.textAlign === value || (value === undefined && [null, 'left'].includes((await first()).attrs.textAlign)), `⌘⇧${key.toUpperCase()} gave ${JSON.stringify((await first()).attrs)}`);
    }
  });

  await step('⌘⇧R, ⌘⇧J and ⌘⇧V do the editor\'s action, not Chrome\'s', async () => {
    await fresh();
    await b.evaluate(`window.__stayed = 'yes'; window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push([e.key, e.code, e.defaultPrevented]));
      window.__pastes = []; window.addEventListener('paste', (e) => window.__pastes.push(e.defaultPrevented));`);
    await b.chord({ code: 'KeyR', key: 'r', meta: true, shift: true, keyCode: 82 });
    expect((await first()).attrs.textAlign === 'right', `⌘⇧R gave ${JSON.stringify((await first()).attrs)}`);
    await b.chord({ code: 'KeyJ', key: 'j', meta: true, shift: true, keyCode: 74 });
    expect((await first()).attrs.textAlign === 'justify', `⌘⇧J gave ${JSON.stringify((await first()).attrs)}`);
    expect((await b.evaluate('window.__stayed')) === 'yes', 'the page was reloaded');
    const keys = await b.evaluate('window.__keys');
    expect(keys.filter((k) => k[1] === 'KeyR' || k[1] === 'KeyJ').every((k) => k[2] === true), `not blocked from Chrome: ${JSON.stringify(keys)}`);
    // ⌘⇧V: the browser's paste, made plain by the editor and blocked from the browser.
    await b.evaluate(`${EDITOR}.commands.focus('end')`);
    // As the browser does: the paste comes while the keys are down.
    const V = { key: 'v', code: 'KeyV', modifiers: 4 | 8, windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 };
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', ...V });
    await b.evaluate(`(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<p><b>negrita</b> y <span style="color:#cc0000">rojo</span></p>');
      dt.setData('text/plain', 'negrita y rojo');
      ${EDITOR}.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    })()`);
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', ...V });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', modifiers: 4, windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
    const doc = JSON.stringify(await json());
    expect(doc.includes('negrita y rojo'), 'plain text not pasted');
    expect(!/"bold"|cc0000|CC0000/.test(doc.split('negrita y rojo')[1] ?? '') && !doc.includes('"type":"bold"'), 'pasted with formatting');
    expect((await b.evaluate('window.__pastes')).at(-1) === true, 'the paste was not taken from the browser');
    notes.push(`⌘⇧R / ⌘⇧J keydown blocked: ${JSON.stringify(keys.filter((k) => k[1] === 'KeyR' || k[1] === 'KeyJ'))}`);
  });

  for (const [name, html] of [['Google Docs', clipboard.googleDocs], ['Word', clipboard.word], ['Word (Title, nested lists, page break)', clipboard.wordNested]]) {
    await step(`paste ${name}: nothing lost, the same document on both editors`, async () => {
      const laptop = await paste(html);
      expect(lost(laptop.report).length === 0, `lost: ${lost(laptop.report).join(', ')}`);
      pasted[name] = laptop;
      notes.push(`paste ${name}: ${JSON.stringify(laptop.report.kept)}`);
    });
  }

  await step('Psicobiología page rebuilt with the toolbar (screenshot)', async () => {
    await b.evaluate(`(() => { const e = ${EDITOR}; e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }); e.commands.focus('start'); })()`);
    await click('Text style');
    await b.click('Title');
    await b.type('Tema 1 · La Psicobiología');
    await b.press('Enter');
    await click('Text style');
    await b.click('Heading 1');
    await b.type('Apuntes en clase');
    await b.press('Enter');
    await b.type('La Psicobiología une ');
    await click('Bold');
    await b.type('Psicología');
    await click('Bold');
    await b.type(' y ');
    await click('Underline');
    await b.type('lo más importante');
    await click('Underline');
    await b.type(': ');
    await click('Highlight');
    await click('Highlight Yellow lighter 60 %');
    await b.type('Repasar la Fig. 1.1.');
    await b.press('Enter');
    await click('Bulleted list');
    await b.type('Estructuras');
    await b.press('Enter');
    await b.type('Procesos');
    const doc = await json();
    expect(doc.content.map((n) => n.type).join() === 'title,heading,paragraph,bulletList', doc.content.map((n) => n.type).join());
    await b.sleep(800);
    await b.shot('fmt-psicobiologia-1280');
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await b.sleep(800);
    await b.shot('fmt-psicobiologia-1280-dark');
    await b.send('Emulation.setEmulatedMedia', { features: [] });
    // Crossing the laptop width (a window being resized) keeps the editor: the text stays, nothing reloads.
    await b.resize(390, 844);
    await b.sleep(1500);
    expect((await b.evaluate(`document.querySelector('.studiply-editor .ProseMirror')?.innerText ?? ''`)).includes('Estructuras'), 'the page went empty after resizing');
    await b.shot('fmt-psicobiologia-390');
    await b.resize(1280, 900);
  });

  await step('the iPhone editor makes the same documents from the same pastes', async () => {
    await b.nav(IPHONE);
    await waitEditor();
    expect(Object.keys(pasted).length === 3, `only ${Object.keys(pasted).length} of 3 laptop pastes to compare with`);
    for (const [name, laptop] of Object.entries(pasted)) {
      const html = name === 'Google Docs' ? clipboard.googleDocs : name === 'Word' ? clipboard.word : clipboard.wordNested;
      const iphone = await paste(html);
      expect(lost(iphone.report).length === 0, `${name} on the iPhone lost: ${lost(iphone.report).join(', ')}`);
      expect(JSON.stringify(shape(iphone.doc)) === JSON.stringify(shape(laptop.doc)), `${name}: the two editors made different documents`);
    }
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
