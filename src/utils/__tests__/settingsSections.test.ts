import {
  aiUseValue,
  appearanceValue,
  languageValue,
  sectionForPath,
  sectionHref,
  SETTINGS_SECTIONS,
  storageValue,
  summaryLevelValue,
  visibleSections,
} from '../settingsSections';

describe('the sections (docs/design desktop-05)', () => {
  it('are in the designed order, Development last and only in development builds', () => {
    expect(visibleSections(false).map((s) => s.label)).toEqual([
      // Credits right after Account.
      'Account', 'Credits', 'Summaries', 'Recording', 'AI & privacy', 'Storage & sync', 'Notifications', 'Appearance', 'Your data',
    ]);
    expect(visibleSections(true).map((s) => s.label).at(-1)).toBe('Development');
  });

  it('each has its own route', () => {
    expect(SETTINGS_SECTIONS.map((s) => sectionHref(s.key))).toEqual([
      '/settings/account', '/settings/credits', '/settings/summaries', '/settings/recording', '/settings/ai-privacy', '/settings/storage',
      '/settings/notifications', '/settings/appearance', '/settings/your-data', '/settings/development',
    ]);
  });

  it('knows which section a page belongs to', () => {
    expect(sectionForPath('/settings')).toBe('account');
    expect(sectionForPath('/settings/recording')).toBe('recording');
    expect(sectionForPath('/settings/credits')).toBe('credits');
    expect(sectionForPath('/settings/trash')).toBe('your-data');
    expect(sectionForPath('/settings/earlier-version')).toBe('your-data');
    expect(sectionForPath('/settings/nope')).toBeNull();
    expect(sectionForPath('/library')).toBeNull();
  });
});

describe('the values on the right of the iPhone rows', () => {
  it('summary level, language and appearance', () => {
    expect(summaryLevelValue('extra')).toBe('Detailed');
    expect(summaryLevelValue(undefined)).toBe('Standard');
    expect(languageValue('es')).toBe('Spanish');
    expect(languageValue(null)).toBe('English');
    expect(appearanceValue('system')).toBe('System');
  });

  it("today's AI use: the larger share of the two limits", () => {
    const base = {
      transcriptionSeconds: 0, transcriptionLimitSeconds: 21600, claudeUsd: 0, claudeLimitUsd: 3,
      transcriptionReached: false, claudeReached: false,
    };
    expect(aiUseValue(null)).toBe('');
    expect(aiUseValue({ ...base, transcriptionSeconds: 2160, claudeUsd: 0.6 })).toBe('20% used today');
    expect(aiUseValue({ ...base, claudeReached: true })).toBe('Limit reached');
    expect(aiUseValue({ ...base, simulated: true })).toBe('Simulated');
  });

  it('storage: how many source files', () => {
    expect(storageValue(null)).toBe('');
    expect(storageValue({ audioCount: 0, photoCount: 0, pdfCount: 0 })).toBe('No files');
    expect(storageValue({ audioCount: 1, photoCount: 0, pdfCount: 0 })).toBe('1 file');
    expect(storageValue({ audioCount: 14, photoCount: 2, pdfCount: 1 })).toBe('17 files');
  });
});
