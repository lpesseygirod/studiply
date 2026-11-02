import { layoutFor, screenKindFor } from '../useLayoutMode';

describe('layoutFor', () => {
  it('keeps the iPhone compact at any width', () => {
    expect(layoutFor(390, 'ios')).toBe('compact');
    expect(layoutFor(1366, 'ios')).toBe('compact');
  });

  it('switches the web to the laptop shell from 1024 px', () => {
    expect(layoutFor(1023, 'web')).toBe('compact');
    expect(layoutFor(1024, 'web')).toBe('wide');
    expect(layoutFor(1440, 'web')).toBe('wide');
  });
});

describe('screenKindFor', () => {
  it('shows library screens with the sidebar only', () => {
    for (const path of ['/library', '/project/abc', '/search', '/']) {
      expect(screenKindFor(path)).toBe('library');
    }
  });

  it('Review (step 9.1, desktop-07/08): a screen of its own, no sidebar; the recording review is a document', () => {
    expect(screenKindFor('/review')).toBe('review');
    expect(screenKindFor('/record/review')).toBe('document');
  });

  it('shows documents and recording with the assistant', () => {
    expect(screenKindFor('/note/abc')).toBe('document');
    expect(screenKindFor('/doc/abc')).toBe('document');
    expect(screenKindFor('/record')).toBe('document');
    expect(screenKindFor('/record/session')).toBe('document');
  });

  it('shows settings without panels', () => {
    expect(screenKindFor('/settings')).toBe('settings');
    expect(screenKindFor('/settings/account')).toBe('settings');
  });
});
