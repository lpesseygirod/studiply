/**
 * The legal pages' shapes. The texts are written in docs/legal/*.md and turned into
 * these blocks by scripts/build-legal.mjs (texts.generated.ts); LegalDocument draws them.
 */

export type LegalSlug = 'privacy' | 'terms' | 'refunds' | 'cookies' | 'legal';

/** A run of text: bold, or a link (`/terms` inside the app, https: or mailto: outside). */
export interface LegalSpan {
  text: string;
  bold?: boolean;
  href?: string;
}

export type LegalBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; spans: LegalSpan[] }
  | { kind: 'subheading'; spans: LegalSpan[] }
  | { kind: 'paragraph'; spans: LegalSpan[] }
  | { kind: 'list'; ordered: boolean; items: LegalSpan[][] }
  | { kind: 'table'; head: LegalSpan[][]; rows: LegalSpan[][][] };

export interface LegalText {
  slug: LegalSlug;
  /** The short name links use ("Privacy Policy"). */
  title: string;
  /** "Last updated", as written ("[DATE]" until Lea fills it). */
  updated: string;
  blocks: LegalBlock[];
}

/** An open-source package the app uses (licences.generated.ts). */
export interface OpenSourcePackage {
  name: string;
  version: string;
  license: string;
  source?: string;
  copyright?: string;
}

/** A licence shown in full on /legal, with where the source is. */
export interface LicenceNotice {
  name: string;
  version: string;
  license: string;
  about: string;
  sources: string[];
  text: string;
}
