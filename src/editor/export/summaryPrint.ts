import type { JSONContent } from '@tiptap/core';

import { LightColors } from '../../constants/colors';
import { generatedPath } from '../../lib/summaryDoc';
import { chipLabel, chipMs, TIMESTAMP_CHIP } from '../schema/timestampChip';
import type { DocJSON } from '../types';
import type { PrintTab } from './printPages';

/**
 * A summary's PDF (step 8.3, SUMMARY-SPEC "PDF export"): the tab that holds a summary, made ready for
 * paper. Pure (no DOM), so both devices give the same pages; printPages.ts lays it out as any tab.
 *
 * - Page 1 opens with the title and the meta line, as the screen's header shows them (no cover page).
 * - Times print as plain "[12:34]" (a link back to the audio doesn't work on paper); the app's own
 *   links ("See them in My notes", "Full answer") as their words.
 * - The self-test's answers (7.7's hidden answer callouts) go to a last page under "Answers", each
 *   with its question's number; with the self-test left out, its questions and answers both go.
 * - The transcript appendix (an option): the lecture's Transcript tab as it is now, from a new page.
 */

export const WORDS = { answers: 'Answers', transcript: 'Transcript' };

export interface SummaryPrintOptions {
  /** The document's title and the header's meta line ("Math · Lecture · 31 Oct 2026"). */
  title: string;
  meta: string;
  /** The self-test, its answers on the last page (default); false: neither. */
  selfTest: boolean;
  /** The Transcript tab's content, for the appendix; null or absent: none. */
  transcript?: DocJSON | null;
}

type N = JSONContent;

const text = (t: string, marks?: N['marks']): N => ({ type: 'text', text: t, ...(marks?.length && { marks }) });
const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

/** Times as "[12:34]" text; the app's links (studiply:…) as their words. Everything else as it is. */
export function plainTimes(node: N): N {
  if (node.type === TIMESTAMP_CHIP) return text(`[${chipLabel(chipMs(node.attrs?.ms))}]`);
  const marks = node.marks?.filter((m) => !(m.type === 'link' && String(m.attrs?.href ?? '').startsWith('studiply:')));
  const out: N = { ...node, ...(node.marks && { marks: marks?.length ? marks : undefined }) };
  if (!out.marks) delete out.marks;
  if (node.content) out.content = node.content.map(plainTimes);
  return out;
}

const isAnswer = (b: N) => b.type === 'callout' && b.attrs?.kind === 'answer';
const SELF_TEST_PART = /^q\d+(-answer)?$/;

/**
 * The self-test's blocks (top level): from its heading ("Self-test", its id `…-selftest`) through its
 * questions and answers and what she added among them, up to the next part of the summary.
 */
function selfTestRun(blocks: N[]): Set<number> {
  const run = new Set<number>();
  const start = blocks.findIndex((b) => b.type === 'heading' && generatedPath(b.attrs?.blockId) === 'selftest');
  if (start < 0) return run;
  run.add(start);
  for (let i = start + 1; i < blocks.length; i++) {
    const b = blocks[i];
    const path = generatedPath(b.attrs?.blockId);
    const hers = path === null && !(b.type === 'heading' && Number(b.attrs?.level) <= 2);
    if (!(hers || (path !== null && SELF_TEST_PART.test(path)) || isAnswer(b))) break;
    run.add(i);
  }
  return run;
}

/** The Answers page: a page break, the heading, then each answer after its question's number. */
function answersPage(answers: { n: number; callout: N }[]): N[] {
  if (!answers.length) return [];
  const out: N[] = [{ type: 'pageBreak' }, { type: 'heading', attrs: { level: 2 }, content: [text(WORDS.answers)] }];
  for (const { n, callout } of answers) {
    const [first, ...rest] = callout.content ?? [];
    const lead = text(`${n}. `, [{ type: 'bold' }]);
    if (first && first.type === 'paragraph') out.push({ ...first, content: [lead, ...(first.content ?? [])] }, ...rest);
    else out.push({ type: 'paragraph', content: [lead] }, ...(first ? [first] : []), ...rest);
  }
  return out;
}

/** The summary tab as printed (title block, plain times, answers last), and the transcript appendix as a tab of its own. */
export function summaryPrintTabs(content: DocJSON, o: SummaryPrintOptions): PrintTab[] {
  const blocks = (content.content ?? []) as N[];
  const drop = o.selfTest ? new Set<number>() : selfTestRun(blocks);
  const answers: { n: number; callout: N }[] = [];
  const kept: N[] = [];
  let lastNumber = 0;
  blocks.forEach((b, i) => {
    if (drop.has(i)) return;
    if (isAnswer(b)) {
      // Its question is the paragraph before it, "3. …" (7.7); else the next number.
      const asked = /^\s*(\d+)\.\s/.exec(textOf(kept.at(-1) ?? {}));
      lastNumber = asked ? Number(asked[1]) : lastNumber + 1;
      if (o.selfTest) answers.push({ n: lastNumber, callout: b });
      return;
    }
    kept.push(b);
  });
  const titleBlock: N[] = [
    { type: 'title', content: o.title.trim() ? [text(o.title.trim())] : undefined },
    ...(o.meta.trim() ? [{ type: 'paragraph', content: [text(o.meta.trim(), [{ type: 'textStyle', attrs: { color: LightColors.text.secondary } }])] }] : []),
  ];
  const summary = { ...content, content: [...titleBlock, ...kept, ...answersPage(answers)].map(plainTimes) } as DocJSON;
  const tabs: PrintTab[] = [{ title: o.title, content: summary }];
  const transcript = (o.transcript?.content ?? []) as N[];
  if (transcript.some((b) => textOf(b).trim())) {
    tabs.push({
      title: WORDS.transcript,
      content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [text(WORDS.transcript)] }, ...transcript.map(plainTimes)] } as DocJSON,
    });
  }
  return tabs;
}
