import type { CheckReport } from '../../../supabase/functions/_shared/summary-checks';
import type { LectureSummary } from '../../services/summarize.service';

/** What a failed summary's code means, in plain words (the rest: "Something went wrong"). */
export const SUMMARY_ERRORS: Record<string, string> = {
  refused: 'Claude can’t summarize this lecture.',
  too_long: 'The summary got too long and was cut off. Try a lower Length.',
  long_lecture: 'Lectures over 60 minutes are summarized in a later update.',
  no_transcript: 'This lecture has no transcript yet.',
  claude_rejected: 'Claude didn’t accept the request. Nothing was changed.',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The quality checks' line (step 7.5): all passed, or which didn't. Empty for a summary made before 7.5. */
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
  return `All checks passed.${moved}`;
}

/** The Summary tab card's words for a summary, by status (step 7.4; 7.7 writes the summary into the tab itself). */
export function summaryCardText(s: LectureSummary): { label: string; text: string; action?: 'start' | 'retry' | 'settings' } {
  const preview = s.settings?.preview ? `${s.settings.preview}. ` : '';
  switch (s.status) {
    case 'pending':
      return { label: 'Summary settings saved', text: `${preview}Not started yet: it needs your permission or the internet, or today's limit was reached.`, action: 'start' };
    case 'generating':
    case 'checking':
      return { label: 'Writing your summary', text: `${preview}This takes about 1–2 minutes. You can keep working.` };
    case 'done': {
      const r = s.result;
      if (!r) return { label: 'Summary ready', text: '' };
      const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
      const c = r.coverage;
      const takeaways = Array.isArray(r.takeaways) ? (r.takeaways as { text: string }[]).map((t) => `• ${t.text}`).join('\n') : '';
      return {
        label: 'Summary ready',
        text: [
          `${plural(count(r.sections), 'section')} · ${plural(count(r.selfTest), 'question')} · ${plural(count(r.flashcards), 'flashcard')} · ${c.noteLinesUsed} of ${c.noteLines} note lines and ${c.marksUsed} of ${c.marks} marks used`,
          checksLine(r.checks as CheckReport | undefined),
          takeaways,
          "It's written into this tab in the next update.",
        ]
          .filter(Boolean)
          .join('\n\n'),
      };
    }
    case 'failed':
      return {
        label: 'The summary wasn’t written',
        text: SUMMARY_ERRORS[s.error ?? ''] ?? 'Something went wrong. Nothing was changed.',
        action: s.error === 'long_lecture' ? 'settings' : 'retry',
      };
  }
}
