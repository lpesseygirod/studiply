import type { CheckReport } from '../../../supabase/functions/_shared/summary-checks';
import type { LectureSummary } from '../../services/summarize.service';

/** What a failed summary's code means, in plain words (the rest: "Something went wrong"). */
export const SUMMARY_ERRORS: Record<string, string> = {
  refused: 'Claude can’t summarize this lecture.',
  too_long: 'The summary got too long and was cut off. Try a lower Length.',
  long_lecture: 'Lectures over 3 hours can’t be summarized yet.',
  part_failed: 'A part of this long lecture couldn’t be written. Nothing was changed.',
  no_base_summary: 'The lecture you extend has no summary yet. Summarize it first.',
  no_summaries: 'None of these lectures has a summary yet. Summarize them first.',
  no_transcript: 'This lecture has no transcript yet.',
  claude_rejected: 'Claude didn’t accept the request. Nothing was changed.',
  consent_withdrawn: 'Stopped: AI was turned off in Settings → AI & privacy. Nothing more was sent.',
  // The server put the row back to pending (nothing was spent or sent).
  no_credits: 'Not started: no lecture credits left. Your recording and notes are safe.',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The quality checks' line: all passed, or which didn't. Empty for a summary made before the checks. */
export function checksLine(c: CheckReport | undefined): string {
  if (!c) return '';
  const words = (n: number) => n.toLocaleString('en-US');
  const failed = [
    !c.schema.pass && 'the format',
    c.notes.missing.length > 0 && `${plural(c.notes.missing.length, 'note line')} left out`,
    c.marks.missing.length > 0 && `${plural(c.marks.missing.length, 'mark')} left out`,
    c.marks.effects.length > 0 && `${plural(c.marks.effects.length, 'mark')} without what it asks for`,
    !c.length.pass && `${words(c.length.words)} words (aim ${words(c.length.min)}–${words(c.length.max)})`,
    !c.faithfulness.pass && `${plural(c.faithfulness.unverified.length, 'detail')} not found in the lecture`,
    !c.language.pass && 'parts in another language',
  ].filter((f): f is string => typeof f === 'string');
  if (failed.length) return `Checks: ${failed.join(' · ')}.`;
  const moved = c.faithfulness.labelled ? ` ${plural(c.faithfulness.labelled, 'detail')} not said in class ${c.faithfulness.labelled === 1 ? 'is' : 'are'} under “Added context”.` : '';
  // Chart values not said in class were taken out of their charts.
  const out = c.charts?.removed.length ?? 0;
  const charts = out ? ` ${plural(out, 'chart value')} not said in class ${out === 1 ? 'is' : 'are'} under “Unclear in the recording”.` : '';
  return `All checks passed.${moved}${charts}`;
}

/**
 * The green banner's line (desktop-03): "Built from your notes (all 14 lines, 6 marks) + 34 min
 * of audio · slides · board photos · your questions to the assistant".
 */
export function bannerText(r: Pick<NonNullable<LectureSummary['result']>, 'coverage' | 'header'>): string {
  const c = r.coverage;
  const lines = c.noteLinesUsed === c.noteLines ? `all ${plural(c.noteLines, 'line')}` : `${c.noteLinesUsed} of ${plural(c.noteLines, 'line')}`;
  const built = r.header.builtFrom ?? [];
  const extra = [
    r.header.durationMin ? `${r.header.durationMin} min of audio` : 'audio',
    built.includes('slides') ? 'slides' : '',
    built.includes('photos') ? 'board photos' : '',
    built.includes('assistant') ? 'your questions to the assistant' : '',
  ].filter(Boolean);
  return `Built from your notes (${lines}, ${plural(c.marks, 'mark')}) + ${extra.join(' · ')}`;
}

/** Extend with next lecture and Quiz me: shown as in the mockups, not built yet. */
export const COMING_LATER = 'Coming in a later update';

/** The Summary tab card's words for a summary, by status ("ready" shows for a moment, while it is written into the document). */
/** What the card knows of her credits: her balance (null: unknown), and the laptop's buy line. */
export interface CardCredits {
  units?: number | null;
  buy?: string;
}

/** Not started for want of credits: why (the laptop says where to buy), or that she has some again (it never starts by itself, Lea 12 Nov). */
export const CREDITS_AGAIN = 'You have credits again: summarize it now.';

export function summaryCardText(s: LectureSummary, credits: CardCredits = {}): { label: string; text: string; action?: 'start' | 'retry' | 'settings' } {
  const preview = s.settings?.preview ? `${s.settings.preview}. ` : '';
  switch (s.status) {
    case 'pending':
      if (s.error === 'no_credits') {
        if (credits.units != null && credits.units > 0) return { label: 'Summary settings saved', text: `${preview}${CREDITS_AGAIN}`, action: 'start' };
        return { label: 'Summary settings saved', text: `${preview}${SUMMARY_ERRORS.no_credits}${credits.buy ? ` ${credits.buy}.` : ''}`, action: 'start' };
      }
      return { label: 'Summary settings saved', text: `${preview}Not started yet: it needs your permission or the internet, or today's limit was reached.`, action: 'start' };
    case 'generating':
    case 'checking':
      return { label: 'Writing your summary', text: `${preview}This takes about 1–2 minutes. You can keep working.` };
    case 'done': {
      const r = s.result;
      if (!r) return { label: 'Summary ready', text: '' };
      // An Extend / Merge / Exam pack: its document is being written (no counts of its own).
      if (r.format !== 'studiply-summary-v1') return { label: 'Ready', text: 'Writing it into this document…' };
      const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
      const c = r.coverage;
      const takeaways = Array.isArray(r.takeaways) ? (r.takeaways as { text: string }[]).map((t) => `• ${t.text}`).join('\n') : '';
      return {
        label: 'Summary ready',
        text: [
          `${plural(count(r.sections), 'section')} · ${plural(count(r.selfTest), 'question')} · ${plural(count(r.flashcards), 'flashcard')} · ${c.noteLinesUsed} of ${c.noteLines} note lines and ${c.marksUsed} of ${c.marks} marks used`,
          checksLine(r.checks as CheckReport | undefined),
          takeaways,
          'Writing it into this document…',
        ]
          .filter(Boolean)
          .join('\n\n'),
      };
    }
    case 'failed':
      // Over 3 hours nothing on the card helps (no button); the rest can be tried again.
      return {
        label: 'The summary wasn’t written',
        text: SUMMARY_ERRORS[s.error ?? ''] ?? 'Something went wrong. Nothing was changed.',
        ...(s.error !== 'long_lecture' && { action: 'retry' as const }),
      };
  }
}
