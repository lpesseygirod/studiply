// Studiply color palettes (docs/design README; dark mode from step 2.3).
// Gradient: lavender → dusty rose → warm amber (sunrise/sunset feel); in
// dark mode deep indigo → dark plum → dark warm brown.
//
// Screens read the palette of the current appearance with
// useTheme() / useThemedStyles() (src/theme). `Colors` is the light palette,
// for code that can't follow the appearance (the PDF, stored defaults).
// Every text/background pair is checked for 4.5:1 contrast in
// src/constants/__tests__/contrast.test.ts.

const light = {
  // Gradient stops — behind every main screen, top to bottom
  gradient: {
    top: '#B8B5E4',       // soft lavender / periwinkle
    topMid: '#C9A8D4',    // muted orchid
    mid: '#D4A0A0',       // dusty rose
    bottomMid: '#E8B4A0', // salmon
    bottom: '#F0C890',    // warm peach
    bottomEnd: '#E8A850', // amber
  },

  // A lighter, subtle version of the gradient
  gradientSubtle: {
    top: '#F0EDF9',
    bottom: '#FDF4E7',
  },

  // Base UI. In dark mode black and white swap roles: `white` is the card
  // (and text on dark fills), `black` the strongest ink.
  black: '#0A0A0A',
  white: '#FFFFFF',
  offWhite: '#F9F7F4',

  // Cards, borders, the dimmed backdrop behind dialogs
  card: '#FFFFFF',
  cardMuted: '#F2F0F5',
  border: '#E6E3EE',
  overlay: 'rgba(10, 10, 20, 0.35)',

  // Text
  text: {
    primary: '#0A0A0A',
    secondary: '#5A5A6A',
    placeholder: '#9B9BAA',
    inverse: '#FFFFFF',
    /** Secondary text placed straight on the gradient (readable on every stop). */
    onGradient: '#3A3A48',
  },

  // Input / surfaces
  inputBackground: '#0A0A0A',
  inputText: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F0F5',

  // Button
  button: {
    primary: '#1A1A2E',
    primaryText: '#FFFFFF',
    disabled: '#C0BDD0',
    disabledText: '#8A88A0', // disabled controls are exempt from the contrast rule
  },

  // Accent / brand
  accent: '#7B6FD4',     // muted purple — icons, highlights (not small text)
  accentLight: '#EAE8F7',
  accentDark: '#4F43B0', // accent as text, and filled accent chips
  accentOn: '#FFFFFF',   // text on an accentDark fill

  // Warm accent — search fields, chips, inputs
  salmon: '#E8B4A0',
  salmonLight: '#F5E0D8',

  // Recording: the red Record button and recording strip (white text on it)
  recording: '#CC3333',
  onRecording: '#FFFFFF',

  // Status
  error: '#C23B3B',
  errorLight: '#FDEAEA',
  success: '#4CAF82',

  /** Banners and boxes: background, text, border. */
  status: {
    success: { bg: '#E8F5EE', text: '#1F6B45', border: '#C8E8D8' },
    warning: { bg: '#FFF3E0', text: '#7A4A00', border: '#FDE68A' },
    error: { bg: '#FDEAEA', text: '#A12B2B', border: '#F5C2C2' },
    info: { bg: '#EAE8F7', text: '#4F43B0', border: '#C5CAE9' },
  },

  // Marks and "From your notes" blocks (docs/design README)
  marks: {
    important: { bg: '#FFE4B5', text: '#7A4A00' },
    confused: { bg: '#EAE8F7', text: '#4F43B0' },
    exam: { bg: '#F5E0D8', text: '#8A3B22' },
  },
  fromNotes: { bg: '#E8F5EE', text: '#1F6B45' },

  /** A highlighted sentence (clarify). */
  highlight: '#FFF3B0',

  /** The Favorites star. */
  favorite: '#B26A00',
  /** Shadows stay black in both appearances. */
  shadow: '#000000',
  /** Behind a full-screen photo. */
  photoBackdrop: 'rgba(0, 0, 0, 0.92)',

  /** Colors a student can give a course (stored with the course). */
  courseColors: ['#F5E0D8', '#D8D5F0', '#C8E8D8', '#C5DCF0', '#F5E8C0', '#E0DFE8'],
};

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Widen<U>[] : { [K in keyof T]: Widen<T[K]> };

/** The shape both palettes share. */
export type ThemeColors = Widen<typeof light>;

export const LightColors: ThemeColors = light;

export const DarkColors: ThemeColors = {
  gradient: {
    top: '#1C1A33',       // deep indigo
    topMid: '#2A1E3A',
    mid: '#35202F',       // dark plum
    bottomMid: '#3A2626',
    bottom: '#3A2B20',    // dark warm brown
    bottomEnd: '#2E2218',
  },
  gradientSubtle: {
    top: '#1E1C30',
    bottom: '#2A2018',
  },

  black: '#F2F1F6',
  white: '#1F1E26',
  offWhite: '#25242C',

  card: '#1F1E26',
  cardMuted: '#2A2933',
  border: '#3A3946',
  overlay: 'rgba(0, 0, 0, 0.55)',

  text: {
    primary: '#F2F1F6',
    secondary: '#BDBBCB',
    placeholder: '#8F8DA3',
    inverse: '#1A1A2E',
    onGradient: '#E8E4F2',
  },

  inputBackground: '#2A2933',
  inputText: '#F2F1F6',
  surface: '#1F1E26',
  surfaceMuted: '#2A2933',

  button: {
    primary: '#EAE8F7',
    primaryText: '#1A1A2E',
    disabled: '#3A3946',
    disabledText: '#A9A7BA',
  },

  accent: '#9D93F0',
  accentLight: '#2F2A4A',
  accentDark: '#B9B0F5',
  accentOn: '#1A1A2E',

  salmon: '#7A564A',
  salmonLight: '#4A3530',

  recording: '#CC3333',
  onRecording: '#FFFFFF',

  error: '#F08A8A',
  errorLight: '#3A1F22',
  success: '#6CD3A3',

  status: {
    success: { bg: '#1B3328', text: '#9BE3BF', border: '#2E5A45' },
    warning: { bg: '#3A2D14', text: '#F5D08A', border: '#6B5222' },
    error: { bg: '#3A1F22', text: '#F5A8A8', border: '#6B3238' },
    info: { bg: '#2F2A4A', text: '#C9C2FA', border: '#4A4370' },
  },

  marks: {
    important: { bg: '#4A3815', text: '#FFD98A' },
    confused: { bg: '#2F2A4A', text: '#C9C2FA' },
    exam: { bg: '#4A3530', text: '#F5B8A3' },
  },
  fromNotes: { bg: '#1B3328', text: '#9BE3BF' },

  highlight: '#5A4E1E',

  favorite: '#F5C060',
  shadow: '#000000',
  photoBackdrop: 'rgba(0, 0, 0, 0.92)',

  courseColors: light.courseColors,
};

export const Colors = LightColors;
