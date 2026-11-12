import fs from 'node:fs';
import path from 'node:path';
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

  it('hides the bar on documents (a recording opens in its document), not on Record’s setup', () => {
    expect(isFullScreenRoute('/doc/abc')).toBe(true);
    // Step 9.1b-3: a quiz being taken; the Review tab itself keeps the bar.
    expect(isFullScreenRoute('/review/quiz/abc')).toBe(true);
    expect(isFullScreenRoute('/review')).toBe(false);
    expect(HIDDEN_ROUTES).toContain('review/quiz/[id]');
    expect(isFullScreenRoute('/record')).toBe(false);
    expect(isFullScreenRoute('/library')).toBe(false);
    expect(isFullScreenRoute('/project/abc')).toBe(false);
    // Step 9.2-2: a course's settings keep the tab bar, as the course does.
    expect(HIDDEN_ROUTES).toContain('course-settings/[id]');
    expect(isFullScreenRoute('/course-settings/abc')).toBe(false);
  });

  it('every screen under app/(main) is a tab or hidden (a new route never adds a tab: Lea’s /admin did once)', () => {
    const root = path.join(__dirname, '../../../app/(main)');
    /** The tab navigator's screens: a folder with its own _layout is one (its name); otherwise each file. */
    const screens = (dir: string, prefix: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      if (prefix && entries.some((e) => e.isFile() && /^_layout\.tsx?$/.test(e.name))) return [prefix.slice(0, -1)];
      return entries.flatMap((e) => {
        if (e.isDirectory()) return screens(path.join(dir, e.name), `${prefix}${e.name}/`);
        if (!/\.tsx?$/.test(e.name) || e.name.startsWith('_')) return [];
        return [`${prefix}${e.name.replace(/\.tsx?$/, '')}`];
      });
    };
    const known = new Set<string>([...MAIN_TABS.map((t) => t.name), ...HIDDEN_ROUTES]);
    expect(screens(root, '').filter((s) => !known.has(s))).toEqual([]);
    expect(HIDDEN_ROUTES).toContain('admin');
    expect(MAIN_TABS.map((t) => t.label)).toEqual(['Library', 'Search', 'Record lecture', 'Review', 'Settings']);
  });
});
