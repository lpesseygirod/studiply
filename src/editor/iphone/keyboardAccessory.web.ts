/**
 * The web has no keyboard accessory: only the development preview
 * (app/dev/editor-preview.tsx) draws the iPhone's keyboard toolbar in a browser.
 */
export function useKeyboardAccessory(_enabled: boolean): { onLayout: () => void } {
  return { onLayout: () => {} };
}
