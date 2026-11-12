import type { Href } from 'expo-router';

import type { LegalSlug } from './types';

/** The legal pages in the order /legal and the footers list them. */
export const LEGAL_SLUGS: readonly LegalSlug[] = ['privacy', 'terms', 'refunds', 'cookies', 'legal'];

/** Short names for the footers ("Terms · Privacy · Legal"). */
export const LEGAL_SHORT: Record<LegalSlug, string> = {
  privacy: 'Privacy',
  terms: 'Terms',
  refunds: 'Refunds',
  cookies: 'Cookies',
  legal: 'Legal',
};

/** Settings' footer, on both devices; /legal lists the rest. */
export const SETTINGS_LEGAL_LINKS: readonly LegalSlug[] = ['terms', 'privacy', 'legal'];

/**
 * `/terms`, or `/terms?from=/settings/account`: the legal pages are their own group, so the screen
 * they were opened from isn't behind them; ‹ Back goes to `from` (LegalRoute).
 */
export function legalHref(slug: LegalSlug, from?: string): Href {
  return (from ? `/${slug}?from=${encodeURIComponent(from)}` : `/${slug}`) as Href;
}

/** `from` as a place to go back to: a path inside the app, not another legal page. */
export function backTarget(from: string | string[] | undefined): Href | null {
  const path = Array.isArray(from) ? from[0] : from;
  if (!path || !/^\/(?!\/)/.test(path) || legalSlugOf(path.split('?')[0]) !== null) return null;
  return path as Href;
}

/** `/terms` → 'terms'; anything else (https:, mailto:) → null. */
export function legalSlugOf(href: string): LegalSlug | null {
  const slug = href.startsWith('/') ? href.slice(1) : '';
  return (LEGAL_SLUGS as readonly string[]).includes(slug) ? (slug as LegalSlug) : null;
}
