import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { Callout } from '../schema/callout';
import { FormulaCard } from '../schema/formulaCard';
import { Graph } from '../schema/graph';
import { MarkChip } from '../schema/markChip';
import { SectionCue } from '../schema/sectionCue';
import { Suggestion } from '../schema/suggestion';

/**
 * Studiply's blocks (step 4.6) in the shared schema: callouts, mark chips,
 * formula cards (4.7c), graphs (4.7d) and a summary section's cue question (7.7); the timestamp chip has its own bridge since 4.2.
 * Commands and the requests for their menus go through the FormatBridge
 * (`format`), like every other tool.
 */
export const StudyBlocksBridge = new BridgeExtension({
  tiptapExtension: Callout,
  // Suggestion (step 6.3): Ask Claude's pending range, Accept and Reject, Add to notes.
  tiptapExtensionDeps: [MarkChip, FormulaCard, Graph, Suggestion, SectionCue],
});
