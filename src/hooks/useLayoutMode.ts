import { Platform, useWindowDimensions } from 'react-native';

import { Layout } from '../constants/layout';

/**
 * 'wide': the laptop shell (top bar, library sidebar, assistant panel).
 * 'compact': the iPhone layout (tab bar, documents full screen). The
 * iPhone is always compact; a browser window narrower than 1024 px too.
 */
export type LayoutMode = 'wide' | 'compact';

export function layoutFor(width: number, platform: string): LayoutMode {
  return platform === 'web' && width >= Layout.wideMinWidth ? 'wide' : 'compact';
}

/** Follows window resizes live. */
export function useLayoutMode(): LayoutMode {
  const { width } = useWindowDimensions();
  return layoutFor(width, Platform.OS);
}

/** What the laptop shell shows around a screen (docs/design desktop-01/04/05). */
export type ScreenKind = 'library' | 'document' | 'settings';

export function screenKindFor(pathname: string): ScreenKind {
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/note/') || pathname.startsWith('/doc/') || pathname.startsWith('/record')) return 'document';
  return 'library';
}
