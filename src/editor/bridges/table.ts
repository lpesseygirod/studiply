import BridgeExtension from '@10play/tentap-editor/src/bridges/base.ts';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';

/**
 * Tables, so a table pasted from Google Docs or Word stays a table (step 4.2).
 * Inserting and editing tables from the toolbar comes in 4.5.
 */
export const TableBridge = new BridgeExtension({
  tiptapExtension: Table.configure({ resizable: false }),
  tiptapExtensionDeps: [TableRow, TableHeader, TableCell],
});
