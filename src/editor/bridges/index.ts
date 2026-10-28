import { TenTapStartKit } from '@10play/tentap-editor/src/bridges/StarterKit.ts';
import { buildBridgeConfigs } from '@10play/tentap-editor/src/shared/bootConfig.ts';
import { resolveBridgeExtensions } from '@10play/tentap-editor/src/web/extensions.ts';

import { BlockMetaBridge } from './blockMeta';
import { FormatBridge } from './format';
import { PasteReportBridge } from './pasteReport';
import { TableBridge } from './table';
import { TimestampChipBridge } from './timestampChip';

/**
 * The one list that makes Studiply's document schema (step 4.2).
 *
 * - iPhone: the app hands it to TenTap (`useEditorBridge`), and the WebView
 *   bundle (editor-web/) runs the same list.
 * - Laptop: `studiplyExtensions()` turns it into Tiptap extensions with
 *   TenTap's own resolver, exactly as the WebView does, so both editors
 *   read and write the same JSON.
 *
 * TenTap's sources (not its prebuilt web bundle, which carries a second copy
 * of ProseMirror) are used, so tables and the chip share one ProseMirror.
 */
export const studiplyBridges = [...TenTapStartKit, TimestampChipBridge, TableBridge, PasteReportBridge, FormatBridge, BlockMetaBridge];

/** The Tiptap extensions of `bridges`, configured as TenTap's WebView configures them. */
export function extensionsOf(bridges: typeof studiplyBridges) {
  return resolveBridgeExtensions(bridges, { bridgeConfigs: buildBridgeConfigs(bridges) });
}

/** The laptop editor's extensions: the same schema as the iPhone's. */
export function studiplyExtensions() {
  return extensionsOf(studiplyBridges);
}

export { TimestampChipBridge, TableBridge, PasteReportBridge, FormatBridge, BlockMetaBridge };
