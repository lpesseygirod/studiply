import { useEffect } from 'react';

import { useTheme } from '../theme/ThemeProvider';

const STYLE_ID = 'studiply-focus-ring';

/**
 * The laptop's visible focus ring: one global style for every control reached with
 * the keyboard (:focus-visible, so a mouse click shows none). React Native Web removes the browser's
 * outline, hence !important. Two tones (the accent ring outside a halo in the card's colour), so it
 * shows on cards and on the gradient in both appearances. Not on the editor's page (its caret is the
 * focus) or on a text field, which shows its own caret. Mounted once in app/_layout.tsx.
 */
export function FocusRing() {
  const { colors: c } = useTheme();
  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      :focus-visible:not([contenteditable="true"]):not(input):not(textarea) {
        outline: 2px solid ${c.accentDark} !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 2px ${c.card} !important;
      }
    `;
  }, [c.accentDark, c.card]);
  return null;
}
