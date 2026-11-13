import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';

import { Comment, Comments } from '../schema/comments';

/**
 * Comments in the shared schema: the mark and its commands. The
 * iPhone acts on them through the FormatBridge (`format`), and reads them
 * from the format state (the comment at the cursor, and all of them).
 */
export const CommentBridge = new BridgeExtension({
  tiptapExtension: Comment,
  tiptapExtensionDeps: [Comments],
});
