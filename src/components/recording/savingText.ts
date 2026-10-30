import type { FlowState } from '../../services/recording-flow';

const parts = (n: number) => (n === 1 ? '1 part' : `${n} parts`);

/** What the strip and the iPhone screen say after Stop, until the recording is handed off. */
export function savingText(saving: NonNullable<FlowState['saving']>): string {
  if (saving.left > 0) {
    return saving.offline
      ? `Saved here · ${parts(saving.left)} will be sent when you're back online`
      : `Saving the recording · sending ${parts(saving.left)}…`;
  }
  return saving.finishing ? 'Saving the recording · finishing the transcript…' : 'Saving the recording…';
}
