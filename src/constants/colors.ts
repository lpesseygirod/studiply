// Studiply color palettes (docs/design README; dark mode from step 2.3).
// Gradient: lavender → dusty rose → warm amber (sunrise/sunset feel); in
// dark mode the same gradient dimmed by about a fifth (Lea: "just dimmed,
// not a night look"), with dark text on it and dark-grey cards.
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
    /** Titles and icons placed straight on the gradient. */
    onGradientStrong: '#0A0A0A',
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
    /** A round button placed straight on the gradient (Library's +). */
    onGradient: '#1A1A2E',
    onGradientText: '#FFFFFF',
    disabled: '#C0BDD0',
    disabledText: '#8A88A0', // disabled controls are exempt from the contrast rule
  },

  // Accent / brand
  accent: '#7B6FD4',     // muted purple — icons, highlights (not small text)
  accentLight: '#EAE8F7',
  accentDark: '#4F43B0', // accent as text, and filled accent chips
  accentOn: '#FFFFFF',   // text on an accentDark fill

  // Warm accent — chips, inputs
  salmon: '#E8B4A0',
  salmonLight: '#F5E0D8',

  /** Search fields (iPhone Library, laptop top bar and sidebar, Search). */
  search: { bg: '#F5E0D8', border: '#E8B4A0', text: '#0A0A0A', placeholder: '#5A5A6A' },
  /** The note's title card. */
  titleCard: '#F5E0D8',

  // Recording: the red Record button and recording strip (white text on it)
  recording: '#CC3333',
  onRecording: '#FFFFFF',
  /** The ring around the raised Record button. */
  recordRing: '#FFFFFF',

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
  /** The searched word in Search results and in a note opened from Search. */
  found: '#FFE4B5',

  /** The Favorites star. */
  favorite: '#B26A00',
  /** Shadows stay black in both appearances. */
  shadow: '#000000',
  /** Behind a full-screen photo. */
  photoBackdrop: 'rgba(0, 0, 0, 0.92)',

  /** A meter's empty track. */
  track: 'rgba(0, 0, 0, 0.08)',
  /** A see-through white chip on tinted boxes. */
  glass: 'rgba(255, 255, 255, 0.6)',
  /** A soft dark circle on the gradient (onboarding initials). */
  scrim: 'rgba(0, 0, 0, 0.15)',
  /** Placeholder text in the dark input fields (onboarding). */
  inputPlaceholder: 'rgba(255, 255, 255, 0.55)',
  /** Usage meters: plenty left, getting low, almost none. */
  meter: { good: '#2D8A5A', low: '#B87B14', empty: '#C23B3B' },
  /** The recording screen stays dark in both appearances. */
  recordingScreen: {
    bg: '#0A0A0A',
    panel: '#111111',
    text: '#FFFFFF',
    textStrong: 'rgba(255, 255, 255, 0.75)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    textFaint: 'rgba(255, 255, 255, 0.3)',
    border: 'rgba(255, 255, 255, 0.2)',
    borderStrong: 'rgba(255, 255, 255, 0.3)',
    accentBorder: 'rgba(232, 180, 160, 0.4)',
    accentText: 'rgba(232, 180, 160, 0.8)',
    warningBg: '#8A5A00',
    warningText: '#FFFBE6',
  },

  /** Colors a student can give a course (stored with the course). */
  courseColors: ['#F5E0D8', '#D8D5F0', '#C8E8D8', '#C5DCF0', '#F5E8C0', '#E0DFE8'],
};

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Widen<U>[] : { [K in keyof T]: Widen<T[K]> };

/** The shape both palettes share. */
export type ThemeColors = Widen<typeof light>;

export const LightColors: ThemeColors = light;

export const DarkColors: ThemeColors = {
  // The light gradient dimmed (~20–25 % darker)
  gradient: {
    top: '#8F8BC4',
    topMid: '#9F86B0',
    mid: '#AA7F7F',
    bottomMid: '#BB8D7E',
    bottom: '#C3A06F',
    bottomEnd: '#BC8740',
  },
  gradientSubtle: {
    top: '#BAB6CF',
    bottom: '#C9BBA6',
  },

  // `white` is the card, `black` the strongest ink (light on dark fills)
  black: '#F2F1F6',
  white: '#262533',
  offWhite: '#2C2B3A',

  card: '#262533',
  cardMuted: '#302F3E',
  border: '#454457',
  overlay: 'rgba(0, 0, 0, 0.55)',

  text: {
    primary: '#F2F1F6',   // on cards
    secondary: '#BDBBCB', // on cards
    placeholder: '#8F8DA3',
    inverse: '#1A1A2E',
    onGradient: '#14141F',       // dark text straight on the dimmed gradient
    onGradientStrong: '#14141F',
  },

  inputBackground: '#302F3E',
  inputText: '#F2F1F6',
  surface: '#262533',
  surfaceMuted: '#302F3E',

  button: {
    primary: '#EAE8F7',
    primaryText: '#1A1A2E',
    onGradient: '#1A1A2E',
    onGradientText: '#FFFFFF',
    disabled: '#454457',
    disabledText: '#A9A7BA',
  },

  accent: '#9D93F0',
  accentLight: '#2F2A4A',
  accentDark: '#B9B0F5',
  accentOn: '#1A1A2E',

  salmon: '#7A564A',
  salmonLight: '#4A3530',

  // A dimmed salmon with dark text (Lea)
  search: { bg: '#C99A8C', border: '#A87A6C', text: '#14141F', placeholder: '#33303D' },
  titleCard: '#262533',

  recording: '#CC3333',
  onRecording: '#FFFFFF',
  recordRing: '#F2F1F6',

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
  found: '#4A3815',

  favorite: '#F5C060',
  shadow: '#000000',
  photoBackdrop: 'rgba(0, 0, 0, 0.92)',

  track: 'rgba(255, 255, 255, 0.14)',
  glass: 'rgba(255, 255, 255, 0.1)',
  scrim: 'rgba(0, 0, 0, 0.15)',
  inputPlaceholder: 'rgba(255, 255, 255, 0.55)',
  meter: { good: '#6CD3A3', low: '#F5C060', empty: '#F08A8A' },
  recordingScreen: light.recordingScreen,

  courseColors: light.courseColors,
};

/**
 * The document page's own colours (step 4.4): the text colours and
 * highlights of the formatting tools. The page is always white (editorCss),
 * so there is one set for both appearances; every text colour reads on
 * white and black text reads on every highlight (contrast test).
 */
export const DocColors = {
  text: [
    { key: 'grey', label: 'Grey', value: '#5F6368' },
    { key: 'red', label: 'Red', value: '#C5221F' },
    { key: 'orange', label: 'Orange', value: '#B45309' },
    { key: 'green', label: 'Green', value: '#137333' },
    { key: 'blue', label: 'Blue', value: '#1A56B5' },
    { key: 'purple', label: 'Purple', value: '#6D28D9' },
    { key: 'pink', label: 'Pink', value: '#B5176B' },
  ],
  /**
   * The colour picker's base colours (step 4.5, as Word's): each gets lighter
   * and darker shades worked out by shadesOf (src/editor/colors).
   */
  palette: [
    { key: 'grey', label: 'Grey', value: '#6B7280' },
    { key: 'red', label: 'Red', value: '#DC2626' },
    { key: 'orange', label: 'Orange', value: '#EA580C' },
    { key: 'yellow', label: 'Yellow', value: '#EAB308' },
    { key: 'green', label: 'Green', value: '#16A34A' },
    { key: 'teal', label: 'Teal', value: '#0D9488' },
    { key: 'blue', label: 'Blue', value: '#2563EB' },
    { key: 'indigo', label: 'Indigo', value: '#4F46E5' },
    { key: 'purple', label: 'Purple', value: '#9333EA' },
    { key: 'pink', label: 'Pink', value: '#DB2777' },
  ],
  /**
   * Studiply's blocks in the document (step 4.6; SUMMARY-SPEC "Color system"
   * where it gives them): each callout a light fill, a 4 px border and a label
   * colour that passes 4.5:1 on its fill. Example, Warning and Added context
   * aren't in the spec.
   */
  callout: {
    definition: { bg: '#EAE8F7', border: '#7B6FD4', label: '#4F43B0' },
    example: { bg: '#EEF4FF', border: '#7DA2E8', label: '#1E4E9C' },
    exam: { bg: '#FFFBEB', border: '#F0C890', label: '#7A4A00' },
    warning: { bg: '#FDECEC', border: '#E8A0A0', label: '#9B1C1C' },
    fromNotes: { bg: '#E8F5EE', border: '#8FD1AE', label: '#1F6B45' },
    confused: { bg: '#F5E0D8', border: '#E8B4A0', label: '#8A3B22' },
    addedContext: { bg: '#F3F1EC', border: '#CFCBC4', label: '#5A5A6A' },
  },
  /** Mark chips in the document (step 4.6): Important and Exam on the exam-signal amber, Confused on salmon (SUMMARY-SPEC). */
  markChip: {
    important: { bg: '#FFE4B5', text: '#7A4A00' },
    exam: { bg: '#FFE4B5', text: '#7A4A00' },
    confused: { bg: '#F5E0D8', text: '#8A3B22' },
  },
  /** Formula cards (step 4.7c; SUMMARY-SPEC "Formula card"): a quiet box, the title in the accent, the legend softer than the text. */
  formulaCard: { bg: '#F8F7FC', border: '#DCD8EE', title: '#4F43B0', legend: '#4A4A5C' },
  /** Timestamp chips (step 4.6): the accent on its light fill. */
  timestamp: { bg: '#EAE8F7', text: '#4F43B0' },
  /** Text tinted to show it has a comment (step 4.5): not one of the highlights. */
  comment: '#FDECC8',
  commentResolved: '#F3F1EC',
  highlight: [
    { key: 'yellow', label: 'Yellow', value: '#FFF3A3' },
    { key: 'green', label: 'Green', value: '#D3F5DB' },
    { key: 'blue', label: 'Blue', value: '#D6E8FF' },
    { key: 'pink', label: 'Pink', value: '#FFDCEB' },
    { key: 'purple', label: 'Purple', value: '#E9DDFF' },
    { key: 'orange', label: 'Orange', value: '#FFE2C4' },
  ],
} as const;

export const Colors = LightColors;
