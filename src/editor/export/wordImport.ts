import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { transformPastedHTML } from '../paste/rules';
import type { DocJSON } from '../types';

/**
 * A Word file's page as a Studiply document (step 4.8b), from the HTML that
 * mammoth reads out of the .docx (services/docx-import.service.ts). Needs a
 * DOM: runs in the laptop's page and in the iPhone's export WebView.
 *
 * mammoth's HTML is first put in the shape a paste from Word has (its
 * highlights as background colours, page breaks, check boxes as ☐ / ☑),
 * then goes through the paste rules (paste/rules.ts, as pasting from Word
 * does) and the editor's schema reads it. Pictures keep their placeholder
 * (`IMPORT_PICTURE` + their number); the service puts the uploaded photos in.
 */

export const IMPORT_PICTURE = 'studiply-import:';

/** Word's highlight names (mammoth's class names, see the style map) as Word writes them on the clipboard. */
const HIGHLIGHTS: Record<string, string> = { darkcyan: 'teal', darkmagenta: 'violet' };

/** mammoth's HTML as a paste from Word would be. */
export function wordPasteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;
  for (const mark of Array.from(body.querySelectorAll('mark'))) {
    const name = (mark.className.match(/hl-([a-z]+)/i)?.[1] ?? 'yellow').toLowerCase();
    const span = doc.createElement('span');
    // As Word copies a highlight: the paste rules snap it to the nearest Studiply highlight.
    span.setAttribute('style', `mso-highlight: ${HIGHLIGHTS[name] ?? name}`);
    span.append(...Array.from(mark.childNodes));
    mark.replaceWith(span);
  }
  for (const hr of Array.from(body.querySelectorAll('hr.studiply-page-break'))) {
    const br = doc.createElement('div');
    br.setAttribute('data-page-break', '');
    // Word's break is in a line of its own, which the HTML parser leaves as empty lines around it.
    for (const side of [hr.previousElementSibling, hr.nextElementSibling]) {
      if (side?.tagName === 'P' && !side.textContent?.trim() && !side.querySelector('img')) side.remove();
    }
    hr.replaceWith(br);
  }
  for (const box of Array.from(body.querySelectorAll('input[type="checkbox"]'))) box.replaceWith(doc.createTextNode((box as HTMLInputElement).checked ? '☑ ' : '☐ '));
  // Footnotes: mammoth's links to them and back are links inside the page; the text stays.
  for (const a of Array.from(body.querySelectorAll('a[href^="#"]'))) {
    if (/^\s*↑\s*$/.test(a.textContent ?? '')) a.remove();
    else a.replaceWith(...Array.from(a.childNodes));
  }
  return body.innerHTML;
}

/** The document of a Word page's HTML (mammoth's), through the paste rules and the schema. */
export function wordHtmlToDoc(html: string): DocJSON {
  const host = document.createElement('div');
  const editor = new Editor({ element: host, extensions: studiplyExtensions(), content: transformPastedHTML(wordPasteHtml(html)), editable: false });
  try {
    return editor.getJSON() as DocJSON;
  } finally {
    editor.destroy();
  }
}
