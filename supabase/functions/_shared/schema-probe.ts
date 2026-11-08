/**
 * schema-probe.ts
 * Step 7.9: every structured-output schema the summary engine sends, for a cheap probe before a paid
 * run (`npm run eval:summaries -- --probe-schemas`). The local summarize function sends each one with a
 * one-line text and max_tokens 16: a schema the API can't compile is rejected at once (HTTP 400, "The
 * compiled grammar is too large…", nothing billed); an accepted one costs a fraction of a cent. Local
 * Supabase only (summarize refuses the probe anywhere else). No Deno or network code: Jest checks it.
 */

import {
  CLASSIFY_SCHEMA,
  EXAM_PACK_SCHEMA,
  LISTS_SCHEMA,
  PART_SCHEMA,
  SECTION_SCHEMA,
  SUMMARY_SCHEMA,
  VERIFY_SCHEMA,
  WRAPUP_SCHEMA,
  extendSchema,
  type JsonSchema,
} from './summary-schema.ts';
import { FORMAT_SCHEMA, QUIZ_SCHEMA } from './quiz-schema.ts';

export const PROBE_MAX_TOKENS = 16;
export const PROBE_SYSTEM = 'This is a schema check. Answer with the smallest valid JSON for the schema.';
export const PROBE_USER = 'Schema check.';

/** Each schema the server passes to Claude (summary-pipeline.ts, summary-checks.ts, summary-long.ts, summary-combine.ts). */
export const PROBE_SCHEMAS: { name: string; schema: JsonSchema }[] = [
  { name: 'classify (7.4)', schema: CLASSIFY_SCHEMA },
  { name: 'summary (7.4 generate)', schema: SUMMARY_SCHEMA },
  { name: 'summary + extend (7.9)', schema: extendSchema(SUMMARY_SCHEMA) },
  { name: 'long-lecture part (7.6)', schema: PART_SCHEMA },
  { name: 'long-lecture part + extend (7.9)', schema: extendSchema(PART_SCHEMA) },
  { name: 'wrap-up / unit lists (7.6, 7.9)', schema: WRAPUP_SCHEMA },
  { name: 'section rewrite (7.5)', schema: SECTION_SCHEMA },
  { name: 'lists rewrite (7.5)', schema: LISTS_SCHEMA },
  { name: 'verify (7.5)', schema: VERIFY_SCHEMA },
  { name: 'exam pack (7.9)', schema: EXAM_PACK_SCHEMA },
  // Step 9.1b-2: the quiz function's (its verify call sends VERIFY_SCHEMA, above).
  { name: 'quiz questions (9.1b-2)', schema: QUIZ_SCHEMA },
  { name: 'past exam format (9.1b-2)', schema: FORMAT_SCHEMA },
];

/**
 * A rough size of a schema's grammar: its nodes (each object, array and value), each object's
 * properties, and each enum value. Only to compare schemas with one another (the API's real measure
 * isn't public): the probe is the real test.
 */
export function schemaWeight(s: JsonSchema): number {
  let n = 1;
  if (Array.isArray(s.enum)) n += s.enum.length;
  if (s.properties && typeof s.properties === 'object') for (const p of Object.values(s.properties as Record<string, JsonSchema>)) n += 1 + schemaWeight(p);
  if (s.items && typeof s.items === 'object') n += schemaWeight(s.items as JsonSchema);
  return n;
}

/** The local stack only (the functions see Supabase as kong inside Docker, or localhost): never production. */
export function isLocalSupabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ['kong', 'localhost', '127.0.0.1', 'host.docker.internal'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}
