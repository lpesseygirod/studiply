// Studiply layout sizes (docs/design mockups; DESIGN.md "Layout")

export const Layout = {
  /** From this window width the web shows the laptop shell (top bar, sidebar, assistant). */
  wideMinWidth: 1024,
  topBarHeight: 56,
  sidebarWidth: 264,
  assistantWidth: 330,
  /** The document page, on the laptop and in the PDF. */
  documentMaxWidth: 820,
  /** Content width for settings and similar pages on the laptop. */
  pageMaxWidth: 820,
  /** Settings on the laptop: the section menu beside the page (docs/design desktop-05). */
  settingsMenuWidth: 280,
  settingsMaxWidth: 1124,
  cardRadius: { laptop: 16, iphone: 18 },
  /** The raised Record button in the iPhone tab bar. */
  recordButtonSize: 64,
} as const;
