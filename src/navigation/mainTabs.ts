/**
 * mainTabs.ts
 * The iPhone tab bar (docs/design iphone-01): Library · Search · Record ·
 * Review · Settings, with Record as the raised red button in the middle.
 * On the laptop the same routes are reached from the top bar and sidebar.
 */

import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface MainTab {
  /** The route file under app/(main). */
  name: string;
  href: '/library' | '/search' | '/record' | '/review' | '/settings';
  label: string;
  icon: { active: IconName; inactive: IconName };
}

export const MAIN_TABS: readonly MainTab[] = [
  { name: 'library/index', href: '/library', label: 'Library', icon: { active: 'library', inactive: 'library-outline' } },
  { name: 'search/index', href: '/search', label: 'Search', icon: { active: 'search', inactive: 'search-outline' } },
  { name: 'record', href: '/record', label: 'Record lecture', icon: { active: 'mic', inactive: 'mic-outline' } },
  { name: 'review/index', href: '/review', label: 'Review', icon: { active: 'sparkles', inactive: 'sparkles-outline' } },
  { name: 'settings', href: '/settings', label: 'Settings', icon: { active: 'settings', inactive: 'settings-outline' } },
];

/**
 * Routes in the tab navigator that have no tab of their own. Every screen under app/(main) is a tab or is
 * here (mainTabs.test.ts reads the folder): a folder with its own _layout is one screen by its name
 * (`admin`, Lea's dashboard: never a tab, also not on the iPhone).
 */
export const HIDDEN_ROUTES = ['index', 'project/[id]', 'doc/[id]', 'review/quiz/[id]', 'course-settings/[id]', 'admin'] as const;

/** Screens shown full screen on the iPhone (no tab bar): documents (a recording's included) and a quiz being taken. */
export function isFullScreenRoute(pathname: string): boolean {
  return pathname.startsWith('/doc/') || pathname.startsWith('/review/quiz/');
}
