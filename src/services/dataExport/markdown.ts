/**
 * markdown.ts
 * A document tab (the editor's JSON) as Markdown, for "Export my data" (step 10.1b-4). Readable, not
 * exact: data/documents.json in the same ZIP keeps the JSON itself. Headings, paragraphs, lists,
 * task lists, quotes, code, tables, formulas ($…$ as LaTeX), mark and timestamp chips ([Exam 9/10],
 * [06:40]), Studiply's boxes (a quote headed by its label), photos (a link to the photo's file in the
 * export, when it is there). Anything else: its text.
 */

import type { JSONContent } from '@tiptap/core';

import { markChipLabel } from '../../editor/schema/markChip';
import { chipLabel } from '../../editor/schema/timestampChip';

export interface MarkdownOptions {
  /** The photo's path in the export, relative to the Markdown file ("Photos/Board.jpg"), or null. */
  photoPath?: (src: string) => string | null;
}

const escapeText = (s: string) => s.replace(/([\\`*_[\]#|])/g, '\\$1');

function inline(node: JSONContent, opts: MarkdownOptions): string {
  let out = '';
  for (const child of node.content ?? []) {
    switch (child.type) {
      case 'text': {
        let t = escapeText(child.text ?? '');
        const marks = child.marks ?? [];
        const has = (m: string) => marks.some((x) => x.type === m);
        if (has('code')) t = `\`${child.text ?? ''}\``;
        if (has('bold')) t = `**${t}**`;
        if (has('italic')) t = `*${t}*`;
        if (has('strike')) t = `~~${t}~~`;
        const href = marks.find((m) => m.type === 'link')?.attrs?.href;
        if (typeof href === 'string' && href) t = `[${t}](${href})`;
        out += t;
        break;
      }
      case 'hardBreak':
        out += '  \n';
        break;
      case 'inlineMath':
        out += `$${String(child.attrs?.latex ?? '')}$`;
        break;
      case 'markChip':
        out += `[${markChipLabel(child.attrs ?? {})}]`;
        break;
      case 'timestampChip':
        out += `[${chipLabel(Number(child.attrs?.ms) || 0)}]`;
        break;
      case 'inlineImage':
        out += photo(child, opts);
        break;
      default:
        out += inline(child, opts);
    }
  }
  return out;
}

function photo(node: JSONContent, opts: MarkdownOptions): string {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
  const alt = String(node.attrs?.alt ?? node.attrs?.title ?? 'Photo');
  const path = src ? opts.photoPath?.(src) : null;
  return path ? `![${escapeText(alt)}](${encodeURI(path)})` : `[${escapeText(alt)}]`;
}

const plain = (node: JSONContent): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(plain).join(node.type === 'paragraph' ? '' : ' ');

function cell(node: JSONContent, opts: MarkdownOptions): string {
  return (node.content ?? [])
    .map((p) => inline(p, opts))
    .join(' ')
    .replace(/\n/g, ' ');
}

function table(node: JSONContent, opts: MarkdownOptions): string {
  const rows = (node.content ?? []).map((r) => (r.content ?? []).map((c) => cell(c, opts)));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
  return [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
}

const indentLines = (text: string, prefix: string) =>
  text
    .split('\n')
    .map((l, i) => (i === 0 ? l : l ? prefix + l : l))
    .join('\n');

function list(node: JSONContent, opts: MarkdownOptions, ordered: boolean, task: boolean): string {
  return (node.content ?? [])
    .map((item, i) => {
      const marker = task ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : ordered ? `${i + 1}. ` : '- ';
      const body = blocks(item.content ?? [], opts).trim();
      return marker + indentLines(body, ' '.repeat(marker.length));
    })
    .join('\n');
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');
}

function block(node: JSONContent, opts: MarkdownOptions): string {
  switch (node.type) {
    case 'title':
      return `# ${inline(node, opts)}`;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      // The document's own title is #; its headings start at ##.
      return `${'#'.repeat(Math.min(6, level + 1))} ${inline(node, opts)}`;
    }
    case 'paragraph':
      return inline(node, opts);
    case 'bulletList':
      return list(node, opts, false, false);
    case 'orderedList':
      return list(node, opts, true, false);
    case 'taskList':
      return list(node, opts, false, true);
    case 'blockquote':
      return quote(blocks(node.content ?? [], opts));
    case 'codeBlock':
      return `\`\`\`\n${plain(node)}\n\`\`\``;
    case 'horizontalRule':
    case 'pageBreak':
      return '---';
    case 'blockMath':
      return `$$\n${String(node.attrs?.latex ?? '')}\n$$`;
    case 'table':
      return table(node, opts);
    case 'image':
      return photo(node, opts);
    case 'callout':
    case 'studyModule':
    case 'formulaCard': {
      const label = String(node.attrs?.title || node.attrs?.label || node.attrs?.kind || '');
      const body = blocks(node.content ?? [], opts);
      return quote(label ? `**${escapeText(label)}**\n\n${body}` : body);
    }
    case 'graph':
      return '[Graph]';
    case 'sheetCell':
      return '';
    default:
      return node.content ? blocks(node.content, opts) : '';
  }
}

function blocks(nodes: JSONContent[], opts: MarkdownOptions): string {
  return nodes
    .map((n) => block(n, opts))
    .filter((s) => s.trim() !== '')
    .join('\n\n');
}

/** The tab as Markdown, ending in one line break ('' for an empty tab). */
export function docToMarkdown(doc: JSONContent | null | undefined, opts: MarkdownOptions = {}): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  const text = blocks(doc.content, opts).trim();
  return text ? `${text}\n` : '';
}
