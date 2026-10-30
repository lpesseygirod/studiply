// Every text/background pair the screens use, in both palettes (step 2.3).
import { contrast } from '../../theme/contrast';
import { DarkColors, DocColors, LightColors, type ThemeColors } from '../colors';

const TEXT = 4.5;
const ICON = 3;

function pairs(c: ThemeColors): [string, string, string, number][] {
  const stops = Object.entries(c.gradient);
  return [
    ...stops.flatMap(([name, bg]) => [
      [`text.onGradient on gradient.${name}`, c.text.onGradient, bg, TEXT] as [string, string, string, number],
      [`text.onGradientStrong on gradient.${name}`, c.text.onGradientStrong, bg, TEXT] as [string, string, string, number],
    ]),
    ...(['card', 'cardMuted', 'offWhite', 'salmonLight', 'accentLight'] as const).flatMap((bg) => [
      [`text.primary on ${bg}`, c.text.primary, c[bg], TEXT] as [string, string, string, number],
      [`text.secondary on ${bg}`, c.text.secondary, c[bg], TEXT] as [string, string, string, number],
    ]),
    ['text.primary on salmon (pills)', c.text.primary, c.salmon, TEXT],
    ['search text on the search field', c.search.text, c.search.bg, TEXT],
    ['search placeholder on the search field', c.search.placeholder, c.search.bg, TEXT],
    ['text.primary on the note title card', c.text.primary, c.titleCard, TEXT],
    ['text.secondary on the note title card', c.text.secondary, c.titleCard, TEXT],
    ['accentDark on card', c.accentDark, c.card, TEXT],
    ['accentDark on accentLight', c.accentDark, c.accentLight, TEXT],
    ['accentOn on accentDark', c.accentOn, c.accentDark, TEXT],
    ['error on card', c.error, c.card, TEXT],
    ['error on errorLight', c.error, c.errorLight, TEXT],
    ['button.primaryText on button.primary', c.button.primaryText, c.button.primary, TEXT],
    ['text.inverse on button.primary', c.text.inverse, c.button.primary, TEXT],
    ['onRecording on recording', c.onRecording, c.recording, TEXT],
    ['white on black (dark fills)', c.white, c.black, TEXT],
    ['inputText on inputBackground', c.inputText, c.inputBackground, TEXT],
    ...Object.entries(c.status).map(
      ([name, s]) => [`status.${name}.text on its bg`, s.text, s.bg, TEXT] as [string, string, string, number],
    ),
    ...Object.entries(c.marks).map(
      ([name, s]) => [`marks.${name}.text on its bg`, s.text, s.bg, TEXT] as [string, string, string, number],
    ),
    ['fromNotes.text on its bg', c.fromNotes.text, c.fromNotes.bg, TEXT],
    ['text.primary on highlight', c.text.primary, c.highlight, TEXT],
    ['text.primary on found (search matches)', c.text.primary, c.found, TEXT],
    ['text.secondary on found (search snippets)', c.text.secondary, c.found, TEXT],
    ['accent (active tab icon) on card', c.accent, c.card, ICON],
    ['recording (Record button) on its ring', c.recording, c.recordRing, ICON],
    ['favorite star on card', c.favorite, c.card, ICON],
    ...Object.entries(c.meter).map(([n, v]) => [`meter.${n} on card`, v, c.card, ICON] as [string, string, string, number]),
    ['recording screen text on its background', c.recordingScreen.text, c.recordingScreen.bg, TEXT],
    ['recording warning text on its banner', c.recordingScreen.warningText, c.recordingScreen.warningBg, TEXT],
    ['recording strip text on the strip (step 5.3)', c.recordingStrip.text, c.recordingStrip.bg, TEXT],
    ['recording dot on the strip', c.recordingStrip.dot, c.recordingStrip.bg, ICON],
    ...stops.map(([name, bg]) => [`button.onGradient on gradient.${name}`, c.button.onGradient, bg, ICON] as [string, string, string, number]),
    ['button.onGradientText on button.onGradient', c.button.onGradientText, c.button.onGradient, TEXT],
  ];
}

describe.each([
  ['light', LightColors],
  ['dark', DarkColors],
])('%s palette', (_name, palette) => {
  it.each(pairs(palette))('%s ≥ required ratio', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('the document page (always white, step 4.4)', () => {
  it.each(DocColors.text.map((t) => [t.label, t.value]))('%s text on the page ≥ 4.5', (_label, value) => {
    expect(contrast(value, LightColors.card)).toBeGreaterThanOrEqual(TEXT);
  });
  it.each(DocColors.highlight.map((h) => [h.label, h.value]))('text on the %s highlight ≥ 4.5', (_label, value) => {
    expect(contrast(LightColors.text.primary, value)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe('contrast()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});

describe("Studiply's blocks in the document (step 4.6)", () => {
  it.each(Object.entries(DocColors.callout).map(([k, v]) => [k, v]))('the %s callout: its label and the text on its fill ≥ 4.5', (_kind, c) => {
    expect(contrast(c.label, c.bg)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(LightColors.text.primary, c.bg)).toBeGreaterThanOrEqual(TEXT);
  });
  it.each(Object.entries(DocColors.markChip).map(([k, v]) => [k, v]))('the %s mark chip ≥ 4.5', (_kind, c) => {
    expect(contrast(c.text, c.bg)).toBeGreaterThanOrEqual(TEXT);
  });
  it('the formula card (4.7c): its title, legend and text ≥ 4.5', () => {
    const f = DocColors.formulaCard;
    expect(contrast(f.title, f.bg)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(f.legend, f.bg)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(LightColors.text.primary, f.bg)).toBeGreaterThanOrEqual(TEXT);
  });
  it('the timestamp chip ≥ 4.5', () => {
    expect(contrast(DocColors.timestamp.text, DocColors.timestamp.bg)).toBeGreaterThanOrEqual(TEXT);
  });
});
