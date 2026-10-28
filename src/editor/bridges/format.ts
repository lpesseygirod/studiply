import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily, FontSize } from '@tiptap/extension-text-style';

import { PageBreak, ParagraphFormat, Title, TITLE } from '../schema/blocks';

/**
 * Step 4.4's formatting in the shared schema: Title, page breaks, line
 * spacing and indent (schema/blocks), font family and size (in the
 * text-style mark TenTap's colour bridge already brings) and alignment.
 */
export const FormatBridge = new BridgeExtension({
  tiptapExtension: ParagraphFormat,
  tiptapExtensionDeps: [
    Title,
    PageBreak,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['paragraph', 'heading', TITLE], alignments: ['left', 'center', 'right', 'justify'] }),
  ],
});
