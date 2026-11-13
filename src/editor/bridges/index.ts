import { TenTapStartKit } from '@10play/tentap-editor/src/bridges/StarterKit.ts';
import { buildBridgeConfigs } from '@10play/tentap-editor/src/shared/bootConfig.ts';
import { resolveBridgeExtensions } from '@10play/tentap-editor/src/web/extensions.ts';
import { ImageBridge } from '@10play/tentap-editor/src/bridges/image.ts';

import { BlockMetaBridge } from './blockMeta';
import { StudyBlocksBridge } from './blocks';
import { CommentBridge } from './comments';
import { ExportBridge } from './export';
import { FormatBridge } from './format';
import { MathBridge } from './math';
import { PasteReportBridge } from './pasteReport';
import { PhotoBridge } from './photo';
import { SpacingBridge } from './spacing';
import { TableBridge } from './table';
import { TimestampChipBridge } from './timestampChip';
import { LiveStampsBridge } from './liveStamps';

/**
 * The one list that makes Studiply's document schema.
 *
 * - iPhone: the app hands it to TenTap (`useEditorBridge`), and the WebView
 *   bundle (editor-web/) runs the same list.
 * - Laptop: `studiplyExtensions()` turns it into Tiptap extensions with
 *   TenTap's own resolver, exactly as the WebView does, so both editors
 *   read and write the same JSON.
 *
 * TenTap's sources (not its prebuilt web bundle, which carries a second copy
 * of ProseMirror) are used, so tables and the chip share one ProseMirror.
 * Studiply's photos take the place of TenTap's image.
 */
export const studiplyBridges = [...TenTapStartKit.filter((b) => b !== ImageBridge), PhotoBridge, TimestampChipBridge, LiveStampsBridge, TableBridge, MathBridge, StudyBlocksBridge, CommentBridge, SpacingBridge, PasteReportBridge, FormatBridge, BlockMetaBridge, ExportBridge];

/** The Tiptap extensions of `bridges`, configured as TenTap's WebView configures them. */
export function extensionsOf(bridges: typeof studiplyBridges) {
  return resolveBridgeExtensions(bridges, { bridgeConfigs: buildBridgeConfigs(bridges) });
}

/** The laptop editor's extensions: the same schema as the iPhone's. */
export function studiplyExtensions() {
  return extensionsOf(studiplyBridges);
}

export { StudyBlocksBridge, PhotoBridge, MathBridge, CommentBridge, TimestampChipBridge, LiveStampsBridge, TableBridge, SpacingBridge, PasteReportBridge, FormatBridge, BlockMetaBridge, ExportBridge };
