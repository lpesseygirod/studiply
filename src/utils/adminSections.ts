/**
 * adminSections.ts
 * The sections of Lea's dashboard (/admin). Part A: Codes; part B adds Overview, Costs, Credits,
 * Gains & losses, Top users, Fixed costs and Providers.
 */

export type AdminSectionKey = 'codes';

export interface AdminSection {
  key: AdminSectionKey;
  label: string;
  href: '/admin/codes';
}

export const ADMIN_SECTIONS: AdminSection[] = [{ key: 'codes', label: 'Codes', href: '/admin/codes' }];

/** The section a path belongs to (the menu highlights it); /admin is the first. */
export function adminSectionForPath(pathname: string): AdminSectionKey | null {
  const m = pathname.match(/^\/admin(?:\/([^/?#]+))?/);
  if (!m) return null;
  if (!m[1]) return ADMIN_SECTIONS[0].key;
  return ADMIN_SECTIONS.find((s) => s.key === m[1])?.key ?? null;
}
