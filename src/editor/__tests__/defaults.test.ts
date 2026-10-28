/**
 * @jest-environment jsdom
 */
// The defaults `sameBlock` leaves out (step 4.5) match the real schema.
import { getSchema } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { ATTR_DEFAULTS } from '../schema/defaults';

it('lists every attribute default of the schema that is not null', () => {
  const schema = getSchema(studiplyExtensions());
  const actual: Record<string, Record<string, unknown>> = {};
  for (const type of [...Object.values(schema.nodes), ...Object.values(schema.marks)]) {
    for (const [attr, spec] of Object.entries(type.spec.attrs ?? {})) {
      const value = (spec as { default?: unknown }).default;
      if (value !== undefined && value !== null) (actual[type.name] ??= {})[attr] = value;
    }
  }
  expect(ATTR_DEFAULTS).toEqual(actual);
});
