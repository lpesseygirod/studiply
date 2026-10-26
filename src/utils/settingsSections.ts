/**
 * settingsSections.ts
 * The Settings sections (step 3.6, docs/design desktop-05 and iphone-07),
 * the same on both devices: the laptop's menu, the iPhone's list and one
 * route each. Pure, so the order, the routes and the short values on the
 * right of each iPhone row are tested.
 */

export type SettingsSectionKey =
  | 'account'
  | 'summaries'
  | 'recording'
  | 'ai-privacy'
  | 'storage'
  | 'notifications'
  | 'appearance'
  | 'your-data'
  | 'development';

/** The colour pair of a row's letter square (tokens in colors.ts). */
export type SectionTone = 'accent' | 'recording' | 'success' | 'warning' | 'exam' | 'neutral';

export interface SettingsSection {
  key: SettingsSectionKey;
  label: string;
  /** The iPhone row's letter (docs/design iphone-07). */
  letter: string;
  tone: SectionTone;
  /** Development builds only. */
  devOnly?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'account', label: 'Account', letter: 'A', tone: 'accent' },
  { key: 'summaries', label: 'Summaries', letter: 'S', tone: 'accent' },
  { key: 'recording', label: 'Recording', letter: 'R', tone: 'recording' },
  { key: 'ai-privacy', label: 'AI & privacy', letter: 'A', tone: 'success' },
  { key: 'storage', label: 'Storage & sync', letter: 'D', tone: 'warning' },
  { key: 'notifications', label: 'Notifications', letter: 'N', tone: 'exam' },
  { key: 'appearance', label: 'Appearance', letter: 'T', tone: 'neutral' },
  { key: 'your-data', label: 'Your data', letter: 'Y', tone: 'neutral' },
  { key: 'development', label: 'Development', letter: 'X', tone: 'neutral', devOnly: true },
];

export function visibleSections(isDev: boolean): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => isDev || !s.devOnly);
}

export function sectionHref(key: SettingsSectionKey): `/settings/${SettingsSectionKey}` {
  return `/settings/${key}`;
}

/** Pages that live inside a section (opened from its page). */
const SUBPAGES: Record<string, SettingsSectionKey> = {
  trash: 'your-data',
  'earlier-version': 'your-data',
};

/** The section a settings path belongs to (the laptop menu highlights it); /settings is Account. */
export function sectionForPath(pathname: string): SettingsSectionKey | null {
  const m = pathname.match(/^\/settings(?:\/([^/?#]+))?/);
  if (!m) return null;
  const part = m[1];
  if (!part) return 'account';
  if (SUBPAGES[part]) return SUBPAGES[part];
  return SETTINGS_SECTIONS.find((s) => s.key === part)?.key ?? null;
}

// ── The short values on the right of the iPhone rows ─────────────────────

export const SUMMARY_LEVEL_LABELS: Record<string, string> = {
  minimal: 'Minimal',
  standard: 'Standard',
  extra: 'Detailed',
};

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  auto: 'Auto-detect',
};

export const APPEARANCE_LABELS: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function summaryLevelValue(level: string | null | undefined): string {
  return SUMMARY_LEVEL_LABELS[level ?? 'standard'] ?? '';
}

export function languageValue(code: string | null | undefined): string {
  return LANGUAGE_LABELS[code ?? 'en'] ?? '';
}

export function appearanceValue(appearance: string): string {
  return APPEARANCE_LABELS[appearance] ?? '';
}

export interface AiUseLike {
  simulated?: boolean;
  transcriptionSeconds: number;
  transcriptionLimitSeconds: number;
  claudeUsd: number;
  claudeLimitUsd: number;
  transcriptionReached: boolean;
  claudeReached: boolean;
}

/** Today's AI use as the larger share of the two daily limits: "12% used today". */
export function aiUseValue(usage: AiUseLike | null): string {
  if (!usage) return '';
  if (usage.simulated) return 'Simulated';
  if (usage.transcriptionReached || usage.claudeReached) return 'Limit reached';
  const share = Math.max(
    usage.transcriptionLimitSeconds > 0 ? usage.transcriptionSeconds / usage.transcriptionLimitSeconds : 0,
    usage.claudeLimitUsd > 0 ? usage.claudeUsd / usage.claudeLimitUsd : 0,
  );
  return `${Math.min(100, Math.round(share * 100))}% used today`;
}

/** The source files kept: "14 files", "1 file", "No files". */
export function storageValue(stats: { audioCount: number; photoCount: number; pdfCount: number } | null): string {
  if (!stats) return '';
  const n = stats.audioCount + stats.photoCount + stats.pdfCount;
  return n === 0 ? 'No files' : `${n} ${n === 1 ? 'file' : 'files'}`;
}
