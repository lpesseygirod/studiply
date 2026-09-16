/**
 * Generates 1–2 character initials from a name string.
 *
 * Examples:
 *   "María García"  → "MG"
 *   "Carlos"        → "CA"
 *   "jean-luc"      → "JL"
 *   ""              → "?"
 */
export function generateInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  // Split on spaces or hyphens
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);

  if (parts.length === 1) {
    // Single word: take first two letters
    const word = parts[0];
    return word.length >= 2
      ? (word[0] + word[1]).toUpperCase()
      : word[0].toUpperCase();
  }

  // Multiple words: first letter of first and last word
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
