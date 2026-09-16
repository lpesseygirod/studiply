// Studiply typography scale

export const Typography = {
  // Font sizes
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 42,
  },

  // Font weights (React Native uses string values)
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },

  // Letter spacing
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 1.5,
    wider: 2.5,
    widest: 4,
  },

  // Line heights
  leading: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;
