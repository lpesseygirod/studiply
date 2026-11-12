/**
 * The study assistant's answer as the app draws it: paragraphs,
 * numbered and bulleted lists, **bold** (desktop-01 / iphone-04), and the
 * times it cites, [12:34] or [1:02:03], as tappable times shown without
 * their brackets ("En el 31:05 dijo…"). Read again on every streamed piece:
 * a **bold** not closed yet is bold to the end, as it will be.
 */

export type AnswerSpan =
  | { kind: 'text'; text: string; bold: boolean }
  | { kind: 'time'; ms: number; label: string; bold: boolean };

export type AnswerBlock =
  | { kind: 'paragraph'; spans: AnswerSpan[] }
  | { kind: 'list'; ordered: boolean; items: { number: number | null; spans: AnswerSpan[] }[] };

const TIME = /\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/g;

/** One line's text: bold runs, and times inside them. */
export function answerSpans(line: string): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  const pieces = line.split('**');
  pieces.forEach((piece, i) => {
    const bold = i % 2 === 1;
    let at = 0;
    for (const m of piece.matchAll(TIME)) {
      if (m.index! > at) spans.push({ kind: 'text', text: piece.slice(at, m.index), bold });
      const [label, h, mm, ss] = m;
      spans.push({ kind: 'time', ms: ((Number(h ?? 0) * 60 + Number(mm)) * 60 + Number(ss)) * 1000, label: label.slice(1, -1), bold });
      at = m.index! + label.length;
    }
    if (at < piece.length) spans.push({ kind: 'text', text: piece.slice(at), bold });
  });
  return spans;
}

const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: answerSpans(paragraph.join('\n')) });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const ordered = ORDERED.exec(line);
    const bullet = ordered ? null : BULLET.exec(line);
    if (ordered || bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      const item = { number: ordered ? Number(ordered[1]) : null, spans: answerSpans((ordered ? ordered[2] : bullet![1]).trim()) };
      if (last?.kind === 'list' && last.ordered === !!ordered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered: !!ordered, items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // A heading (the prompt asks for none) reads as a bold line.
    const heading = HEADING.exec(line);
    paragraph.push(heading ? `**${heading[1].replace(/\*\*/g, '')}**` : line.trim());
  }
  flush();
  return blocks;
}

/** The answer as plain text (Copy): times keep their brackets, bold its words. */
export function answerPlainText(text: string): string {
  return text.replace(/\*\*/g, '').trim();
}
