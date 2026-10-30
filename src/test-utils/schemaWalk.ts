import type { JsonSchema } from '../../supabase/functions/_shared/summary-schema';

/** Every node of a JSON Schema, with its path ("$.sections[].blocks[]"). */
export function walk(schema: JsonSchema, path = '$', out: [string, JsonSchema][] = []): [string, JsonSchema][] {
  out.push([path, schema]);
  for (const [k, v] of Object.entries((schema.properties ?? {}) as Record<string, JsonSchema>)) walk(v, `${path}.${k}`, out);
  if (schema.items) walk(schema.items as JsonSchema, `${path}[]`, out);
  for (const [i, v] of ((schema.anyOf ?? []) as JsonSchema[]).entries()) walk(v, `${path}|${i}`, out);
  return out;
}

/** What structured outputs refuse in a schema (the claude-api reference): what's wrong, by path; [] when none. */
export function unsupported(schema: JsonSchema): string[] {
  const out: string[] = [];
  for (const [path, node] of walk(schema)) {
    if (node.type === 'object') {
      if (node.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
      const req = [...((node.required as string[]) ?? [])].sort().join();
      if (req !== Object.keys((node.properties as object) ?? {}).sort().join()) out.push(`${path}: every field must be required`);
    }
    for (const k of ['anyOf', 'oneOf', 'allOf', '$ref', '$defs', 'minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']) {
      if (k in node) out.push(`${path}: ${k}`);
    }
    if (Array.isArray(node.type)) out.push(`${path}: a type list (nullable)`);
  }
  return out;
}
