/**
 * names.ts
 * One rule for names a student types (lectures, folders): spaces trimmed
 * and collapsed, not empty, at most 200 characters.
 */

export const MAX_NAME_LENGTH = 200;

/** The name to store, or an error the student can act on. */
export function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Enter a name.');
  if (name.length > MAX_NAME_LENGTH) throw new Error(`Use at most ${MAX_NAME_LENGTH} characters.`);
  return name;
}
