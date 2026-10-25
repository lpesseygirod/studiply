import type { ReactElement } from 'react';

import MainIndex from '../../../app/(main)/index';
import { HIDDEN_ROUTES, MAIN_TABS, isFullScreenRoute } from '../mainTabs';

jest.mock('expo-router', () => ({ Redirect: 'Redirect' }));

describe('the iPhone tab bar', () => {
  it('reads Library · Search · Record · Review · Settings, Record in the middle', () => {
    expect(MAIN_TABS.map(t => t.href)).toEqual(['/library', '/search', '/record', '/review', '/settings']);
    expect(MAIN_TABS[Math.floor(MAIN_TABS.length / 2)].href).toBe('/record');
  });

  it('has no Home tab; / is hidden and opens Library', () => {
    expect(MAIN_TABS.some(t => t.name === 'index')).toBe(false);
    expect(HIDDEN_ROUTES).toContain('index');
    const element = MainIndex() as ReactElement<{ href: string }>;
    expect(element.props.href).toBe('/library');
  });

  it('hides the bar on documents and the recording flow, not on its setup', () => {
    expect(isFullScreenRoute('/note/abc')).toBe(true);
    expect(isFullScreenRoute('/record/active')).toBe(true);
    expect(isFullScreenRoute('/record/post-session')).toBe(true);
    expect(isFullScreenRoute('/record/review')).toBe(true);
    expect(isFullScreenRoute('/record')).toBe(false);
    expect(isFullScreenRoute('/library')).toBe(false);
    expect(isFullScreenRoute('/project/abc')).toBe(false);
  });
});
