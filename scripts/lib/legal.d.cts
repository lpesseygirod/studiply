// Types for legal.cjs, for the Jest tests (src/legal/__tests__).
import type { LegalBlock, LegalSlug } from '../../src/legal/types';

export interface Finding {
  file: string;
  line: number;
  text: string;
}

export const LEGAL_PAGES: readonly { slug: LegalSlug; file: string; title: string }[];
export const INTERNAL_DOCS: readonly string[];
export const TEXTS_OUT: string;
export const LICENCES_OUT: string;
export function parseMarkdown(markdown: string, selfSlug: LegalSlug): LegalBlock[];
export function lastUpdated(markdown: string): string;
export function legalVersion(root: string): string;
export function renderTexts(root: string): string;
export function renderLicences(root: string): string;
export function placeholders(root: string): (Finding & { category: string })[];
export function drafts(root: string): Finding[];
export function userFacingMentions(root: string, words?: string[]): Finding[];
