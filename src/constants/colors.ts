// Studiply color palette
// Gradient: lavender → dusty rose → warm amber (sunrise/sunset feel)

export const Colors = {
  // Gradient stops — used on onboarding and throughout the app
  gradient: {
    top: '#B8B5E4',       // soft lavender / periwinkle
    topMid: '#C9A8D4',    // muted orchid
    mid: '#D4A0A0',       // dusty rose
    bottomMid: '#E8B4A0', // salmon
    bottom: '#F0C890',    // warm peach
    bottomEnd: '#E8A850', // amber
  },

  // A lighter, subtle version of the gradient used on inner screens
  gradientSubtle: {
    top: '#F0EDF9',
    bottom: '#FDF4E7',
  },

  // Base UI
  black: '#0A0A0A',
  white: '#FFFFFF',
  offWhite: '#F9F7F4',

  // Text
  text: {
    primary: '#0A0A0A',
    secondary: '#5A5A6A',
    placeholder: '#9B9BAA',
    inverse: '#FFFFFF',
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
    disabledText: '#8A88A0',
  },

  // Accent / brand
  accent: '#7B6FD4',   // muted purple — used sparingly for highlights
  accentLight: '#EAE8F7',

  // Warm accent — search bars, chips, project cards, interactive elements
  salmon: '#E8B4A0',
  salmonLight: '#F5E0D8',

  // Status
  error: '#D94F4F',
  errorLight: '#FDEAEA',
  success: '#4CAF82',
} as const;
