/**
 * KaTeX's fonts on the laptop (formulas). Its stylesheet names
 * them by relative links that the web bundler doesn't serve, so the same
 * font faces are declared again here from the font files themselves (the
 * TTF copies, which the bundler serves as assets; the browser fetches only
 * those a formula uses). Declared later, they take the place of the
 * stylesheet's. The iPhone's WebView bundle inlines its own (woff2).
 */

type Face = [family: string, weight: 'normal' | 'bold', style: 'normal' | 'italic', url: string];

const FACES: Face[] = [
  ['KaTeX_AMS', 'normal', 'normal', require('katex/dist/fonts/KaTeX_AMS-Regular.ttf')],
  ['KaTeX_Caligraphic', 'bold', 'normal', require('katex/dist/fonts/KaTeX_Caligraphic-Bold.ttf')],
  ['KaTeX_Caligraphic', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Caligraphic-Regular.ttf')],
  ['KaTeX_Fraktur', 'bold', 'normal', require('katex/dist/fonts/KaTeX_Fraktur-Bold.ttf')],
  ['KaTeX_Fraktur', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Fraktur-Regular.ttf')],
  ['KaTeX_Main', 'bold', 'normal', require('katex/dist/fonts/KaTeX_Main-Bold.ttf')],
  ['KaTeX_Main', 'bold', 'italic', require('katex/dist/fonts/KaTeX_Main-BoldItalic.ttf')],
  ['KaTeX_Main', 'normal', 'italic', require('katex/dist/fonts/KaTeX_Main-Italic.ttf')],
  ['KaTeX_Main', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Main-Regular.ttf')],
  ['KaTeX_Math', 'bold', 'italic', require('katex/dist/fonts/KaTeX_Math-BoldItalic.ttf')],
  ['KaTeX_Math', 'normal', 'italic', require('katex/dist/fonts/KaTeX_Math-Italic.ttf')],
  ['KaTeX_SansSerif', 'bold', 'normal', require('katex/dist/fonts/KaTeX_SansSerif-Bold.ttf')],
  ['KaTeX_SansSerif', 'normal', 'italic', require('katex/dist/fonts/KaTeX_SansSerif-Italic.ttf')],
  ['KaTeX_SansSerif', 'normal', 'normal', require('katex/dist/fonts/KaTeX_SansSerif-Regular.ttf')],
  ['KaTeX_Script', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Script-Regular.ttf')],
  ['KaTeX_Size1', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Size1-Regular.ttf')],
  ['KaTeX_Size2', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Size2-Regular.ttf')],
  ['KaTeX_Size3', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Size3-Regular.ttf')],
  ['KaTeX_Size4', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Size4-Regular.ttf')],
  ['KaTeX_Typewriter', 'normal', 'normal', require('katex/dist/fonts/KaTeX_Typewriter-Regular.ttf')],
];

const ID = 'studiply-katex-fonts';

if (typeof document !== 'undefined' && !document.getElementById(ID)) {
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = FACES.map(
    ([family, weight, style, url]) =>
      `@font-face { font-family: ${family}; font-weight: ${weight}; font-style: ${style}; font-display: block; src: url("${url}") format("truetype"); }`,
  ).join('\n');
  document.head.appendChild(style);
}
