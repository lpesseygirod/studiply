/**
 * systemClipboard.ts
 * The device's clipboard for a spreadsheet's Copy and Paste in the cell's
 * sheet (step 4.7e, checkpoint 3: the iPhone, and touch in a browser), so
 * a copy pastes into other apps and their text pastes in. The laptop's
 * ⌘C / ⌘V use the browser's copy and paste events instead (SheetTab).
 * Reading can be refused (a browser asks first): then null, and the sheet
 * pastes its own last copy.
 */

import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/** The browser may ask before giving its clipboard; this long, then without. */
const READ_WAIT_MS = 600;

export async function writeSystemClipboard(text: string): Promise<void> {
  try {
    if (Platform.OS === 'web') await navigator.clipboard?.writeText(text);
    else await Clipboard.setStringAsync(text);
  } catch {
    // Not allowed here: the sheet keeps its own copy.
  }
}

export async function readSystemClipboard(): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') return (await Clipboard.getStringAsync()) || null;
    if (!navigator.clipboard?.readText) return null;
    const text = await Promise.race([navigator.clipboard.readText(), new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_WAIT_MS))]);
    return text || null;
  } catch {
    return null;
  }
}
