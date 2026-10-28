import { LightColors } from '../constants/colors';
import { CHIP_CLASS } from './schema/timestampChip';

/** The document page's colours: always the light palette (see `editorCss`). */
export const PAGE_COLORS = LightColors;

/**
 * The document's look for both editors: injected into the iPhone's WebView,
 * and a <style> on the laptop scoped under `scope`. The page is always white
 * with dark text, like Google Docs, in light and dark mode alike (pasted
 * text keeps colours chosen for white paper); only the app around it follows
 * the appearance. Step 4.4 replaces this with the designed styles.
 */
export function editorCss(scope = ''): string {
  const c = PAGE_COLORS;
  const pm = `${scope} .ProseMirror`.trim();
  const page = scope ? '' : `html, body { background: ${c.card}; color: ${c.text.primary}; color-scheme: light; }\n`;
  return `${page}
${pm} { color: ${c.text.primary}; background: ${c.card}; color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; line-height: 1.5; padding: 16px 20px 160px; caret-color: ${c.accentDark}; word-wrap: break-word; }
${pm} h1 { font-size: 1.75em; line-height: 1.25; margin: 0.8em 0 0.4em; }
${pm} h2 { font-size: 1.4em; line-height: 1.3; margin: 0.8em 0 0.4em; }
${pm} h3 { font-size: 1.15em; margin: 0.8em 0 0.3em; }
${pm} p { margin: 0 0 0.6em; }
${pm} ul, ${pm} ol { padding-left: 1.4em; margin: 0 0 0.6em; }
${pm} li p { margin: 0; }
${pm} a { color: ${c.accentDark}; }
${pm} blockquote { border-left: 3px solid ${c.border}; margin: 0 0 0.6em; padding-left: 12px; color: ${c.text.secondary}; }
${pm} code { background: ${c.cardMuted}; border-radius: 4px; padding: 0 4px; }
${pm} mark { background: ${c.highlight}; color: inherit; }
${pm} table { border-collapse: collapse; width: 100%; margin: 0.6em 0; table-layout: fixed; }
${pm} td, ${pm} th { border: 1px solid ${c.border}; padding: 6px 8px; vertical-align: top; }
${pm} th { background: ${c.cardMuted}; font-weight: 600; text-align: left; }
${pm} td p, ${pm} th p { margin: 0; }
${pm} .${CHIP_CLASS} { display: inline-block; padding: 0 8px; margin: 0 2px; border-radius: 10px; background: ${c.status.info.bg}; color: ${c.status.info.text}; font-size: 0.8em; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.6; vertical-align: 1px; cursor: pointer; user-select: none; -webkit-user-select: none; }
${pm} .${CHIP_CLASS}.ProseMirror-selectednode { outline: 2px solid ${c.accent}; }
${pm} p.is-editor-empty:first-child::before { color: ${c.text.placeholder}; }
`;
}
