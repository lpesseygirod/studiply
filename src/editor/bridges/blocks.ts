import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { Callout } from '../schema/callout';
import { FormulaCard } from '../schema/formulaCard';
import { Graph } from '../schema/graph';
import { MarkChip } from '../schema/markChip';
import { SectionCue } from '../schema/sectionCue';
import { StudyModule } from '../schema/studyModule';
import { Suggestion } from '../schema/suggestion';

/**
 * Studiply's blocks in the shared schema: callouts, mark chips,
 * formula cards, graphs, a summary section's cue question and the summary's text
 * modules; the timestamp chip has its own bridge.
 * Commands and the requests for their menus go through the FormatBridge
 * (`format`), like every other tool.
 */
export const StudyBlocksBridge = new BridgeExtension({
  tiptapExtension: Callout,
  // Suggestion: Ask Claude's pending range, Accept and Reject, Add to notes.
  tiptapExtensionDeps: [MarkChip, FormulaCard, Graph, Suggestion, SectionCue, StudyModule],
});
