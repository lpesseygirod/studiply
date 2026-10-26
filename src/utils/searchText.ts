/**
 * searchText.ts
 * How Search matches and shows text (step 3.5), pure so it is tested.
 *
 * normalize() is the app's copy of the database's search.norm(): lower case,
 * no accents, no Catalan middle dot, so "filogenetico" finds "filogenético"
 * and "collegi" finds "col·legi" both online and in the iPhone's offline
 * search. Highlights are found on the normalized text and mapped back to the
 * original characters.
 */

/** Letters unaccent() turns into something other than the base letter. */
const SPECIAL: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  ł: 'l',
  Ł: 'l',
  đ: 'd',
  Đ: 'd',
  ı: 'i',
  '·': '',
};

/** One character, normalized (may be empty or two letters). */
function normChar(ch: string): string {
  const special = SPECIAL[ch];
  if (special !== undefined) return special;
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function normalize(text: string): string {
  let out = '';
  for (const ch of text) out += normChar(ch);
  return out;
}

/** The normalized text, and for each of its characters where it came from in the original. */
function normalizeWithMap(text: string): { norm: string; start: number[]; end: number[] } {
  let norm = '';
  const start: number[] = [];
  const end: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normChar(ch);
    // A dropped character (a combining accent, a middle dot) belongs to the
    // letter before it, so highlighting that letter takes it along.
    if (n === '' && end.length > 0) end[end.length - 1] = i + ch.length;
    for (const c of n) {
      norm += c;
      start.push(i);
      end.push(i + ch.length);
    }
    i += ch.length;
  }
  return { norm, start, end };
}

/** What Search looks for: the trimmed, normalized query; null under 2 letters. */
export function searchQuery(query: string): string | null {
  const q = normalize(query.trim());
  return q.length >= 2 ? q : null;
}

export function matches(text: string | null | undefined, query: string): boolean {
  const q = searchQuery(query);
  return !!q && !!text && normalize(text).includes(q);
}

export interface Range {
  start: number;
  end: number;
}

/** Every match of the query in the original text, in order; touching matches become one. */
export function highlightRanges(text: string, query: string): Range[] {
  const q = searchQuery(query);
  if (!q || !text) return [];
  const { norm, start, end } = normalizeWithMap(text);
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const at = norm.indexOf(q, from);
    if (at < 0) break;
    const range = { start: start[at], end: end[at + q.length - 1] };
    const last = ranges[ranges.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else ranges.push(range);
    from = at + q.length;
  }
  return ranges;
}

/** The text split into plain and highlighted parts, for rendering. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const r of highlightRanges(text, query)) {
    if (r.start > at) parts.push({ text: text.slice(at, r.start), hit: false });
    parts.push({ text: text.slice(r.start, r.end), hit: true });
    at = r.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

const SNIPPET_LENGTH = 120;

/**
 * About 120 characters of the text around its first match, cut between
 * words, with "…" where it was cut. Short texts come back whole (on one line).
 */
export function snippetAround(text: string, query: string, length = SNIPPET_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= length) return flat;
  const first = highlightRanges(flat, query)[0];
  const center = first ? Math.floor((first.start + first.end) / 2) : 0;
  let start = Math.max(0, Math.min(center - Math.floor(length / 2), flat.length - length));
  let end = Math.min(flat.length, start + length);
  // Move the cuts to the nearest space inside the window, never past the match.
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space >= 0 && space < (first?.start ?? end)) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > (first?.end ?? start)) end = space;
  }
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

/** "5 results in 2 courses" (items outside every course aren't a course). */
export function resultCountLine(hits: { courseId: string | null }[]): string {
  const n = hits.length;
  const results = `${n} ${n === 1 ? 'result' : 'results'}`;
  const courses = new Set(hits.map((h) => h.courseId).filter(Boolean)).size;
  if (courses === 0) return results;
  return `${results} in ${courses} ${courses === 1 ? 'course' : 'courses'}`;
}

/** "18:22" or "1:02:05" for a transcript hit. */
export function formatHitTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
