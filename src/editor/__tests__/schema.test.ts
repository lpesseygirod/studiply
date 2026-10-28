import { getSchema } from '@tiptap/core';
import { Node as PMNode, type Schema } from '@tiptap/pm/model';
import { buildBootConfig } from '@10play/tentap-editor/src/shared/bootConfig.ts';
import { resolveBridgeExtensions, selectActiveBridges } from '@10play/tentap-editor/src/web/extensions.ts';

import { studiplyBridges, studiplyExtensions } from '../bridges';
import { chipLabel, chipMs, TIMESTAMP_CHIP } from '../schema/timestampChip';

/** Node and mark names with their content, groups and attributes: what JSON depends on. */
function schemaShape(schema: Schema) {
  const attrs = (spec: { attrs?: Record<string, { default?: unknown }> }) =>
    Object.fromEntries(Object.entries(spec.attrs ?? {}).map(([k, v]) => [k, v.default]));
  return {
    nodes: Object.fromEntries(
      Object.values(schema.nodes).map((n) => [n.name, { content: n.spec.content ?? '', group: n.spec.group ?? '', inline: !!n.spec.inline, atom: !!n.spec.atom, attrs: attrs(n.spec) }]),
    ),
    marks: Object.fromEntries(Object.values(schema.marks).map((m) => [m.name, attrs(m.spec)])),
  };
}

const laptopSchema = getSchema(studiplyExtensions());

// What the iPhone's WebView builds: native sends its bridges in the boot
// config, and the bundle keeps the ones native named (TenTap's own code).
function iphoneSchema() {
  const config = buildBootConfig({ editorId: 'test', bridges: studiplyBridges, platform: 'ios' });
  return getSchema(resolveBridgeExtensions(selectActiveBridges(studiplyBridges, config), config));
}

const sample = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Tema 3: Filogenia' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'timestampChip', attrs: { ms: 252000 } },
        { type: 'text', text: ' ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'parentesco filogenético' },
      ],
    },
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'homología' }] }] }],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Término' }] }] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Definición' }] }] },
          ],
        },
      ],
    },
  ],
};

describe('the timestamp chip', () => {
  it('reads as the recording time', () => {
    expect(chipLabel(252000)).toBe('4:12');
    expect(chipLabel(3852000)).toBe('1:04:12');
    expect(chipLabel(0)).toBe('0:00');
  });

  it('keeps only whole, non-negative milliseconds', () => {
    expect(chipMs('252000')).toBe(252000);
    expect(chipMs(1.6)).toBe(2);
    expect(chipMs(-5)).toBe(0);
    expect(chipMs('abc')).toBe(0);
    expect(chipMs(undefined)).toBe(0);
  });

  it('is an inline atom with one attribute', () => {
    const chip = laptopSchema.nodes[TIMESTAMP_CHIP];
    expect(chip.isInline).toBe(true);
    expect(chip.isAtom).toBe(true);
    expect(Object.keys(chip.spec.attrs ?? {})).toEqual(['ms']);
  });
});

describe('the document schema', () => {
  it('has the formatting, tables and the chip', () => {
    expect(Object.keys(laptopSchema.nodes)).toEqual(
      expect.arrayContaining([
        'doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem',
        'blockquote', 'image', 'hardBreak', 'timestampChip', 'table', 'tableRow', 'tableHeader', 'tableCell',
      ]),
    );
    expect(Object.keys(laptopSchema.marks)).toEqual(
      expect.arrayContaining(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle', 'highlight']),
    );
  });

  it('is the same on the iPhone and the laptop', () => {
    expect(schemaShape(iphoneSchema())).toEqual(schemaShape(laptopSchema));
  });

  it('keeps a document unchanged through JSON on both', () => {
    for (const schema of [laptopSchema, iphoneSchema()]) {
      const doc = PMNode.fromJSON(schema, sample);
      doc.check();
      // The first pass adds the default attributes (block ids, origin); after that, nothing changes.
      const once = doc.toJSON();
      expect(PMNode.fromJSON(schema, once).toJSON()).toEqual(once);
      expect(JSON.stringify(once)).toContain('"ms":252000');
      expect(doc.textContent).toContain('parentesco filogenético');
    }
  });

  it('gives every top-level block an id, an origin and an edit time', () => {
    for (const name of ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'image', 'table']) {
      expect(Object.keys(laptopSchema.nodes[name].spec.attrs ?? {})).toEqual(expect.arrayContaining(['blockId', 'origin', 'editedAt']));
    }
    expect(laptopSchema.nodes.paragraph.spec.attrs?.origin.default).toBe('student');
  });

  it('refuses a node it does not know', () => {
    const unknown = { type: 'doc', content: [{ type: 'callout', content: [] }] };
    expect(() => PMNode.fromJSON(laptopSchema, unknown)).toThrow(/callout/);
  });
});
