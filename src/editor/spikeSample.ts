import type { JSONContent } from '@tiptap/core';

import type { DocJSON } from './types';

/**
 * Twenty pages of lecture notes for the spike's performance test (step 4.2):
 * about 10,000 words in Spanish, with headings, bold, lists and 50 timestamp
 * chips. Always the same document, so timings compare between devices.
 */

const SENTENCES = [
  'La psicobiología estudia la conducta como un proceso biológico, resultado de la evolución y del desarrollo del individuo.',
  'El parentesco filogenético entre especies se infiere a partir de caracteres homólogos compartidos por un antepasado común.',
  'Las neuronas se comunican mediante sinapsis químicas, en las que un neurotransmisor liberado cruza la hendidura sináptica.',
  'El potencial de acción se propaga a lo largo del axón gracias a la apertura secuencial de canales de sodio dependientes de voltaje.',
  'La selección natural actúa sobre la variación heredable, y la conducta también puede ser objeto de esa selección.',
  'En el examen suelen preguntar la diferencia entre causas próximas y causas últimas de una conducta.',
  'El sistema nervioso autónomo regula funciones viscerales a través de sus divisiones simpática y parasimpática.',
  'La plasticidad sináptica, como la potenciación a largo plazo, se considera una base celular del aprendizaje y la memoria.',
  'Los genes no determinan la conducta de forma directa: interactúan con el ambiente durante todo el desarrollo.',
  'La corteza prefrontal participa en la planificación, la inhibición de respuestas y la toma de decisiones.',
];

const TERMS = ['homología', 'analogía', 'sinapsis', 'neurotransmisor', 'potencial de acción', 'plasticidad', 'filogenia', 'ontogenia'];

const text = (value: string, bold = false): JSONContent => (bold ? { type: 'text', text: value, marks: [{ type: 'bold' }] } : { type: 'text', text: value });
const chip = (ms: number): JSONContent => ({ type: 'timestampChip', attrs: { ms } });

export const SPIKE_PAGES = 20;
export const SPIKE_CHIPS = 50;

export function twentyPages(): DocJSON {
  const content: JSONContent[] = [];
  let sentence = 0;
  let chips = 0;
  const next = () => SENTENCES[sentence++ % SENTENCES.length];
  for (let page = 1; page <= SPIKE_PAGES; page++) {
    content.push({ type: 'heading', attrs: { level: 1 }, content: [text(`Tema ${page}: ${TERMS[page % TERMS.length]}`)] });
    for (let paragraph = 0; paragraph < 6; paragraph++) {
      const runs: JSONContent[] = [];
      // 50 chips over 120 paragraphs: the first 50 that fall on this rhythm.
      if (chips < SPIKE_CHIPS && (page * 6 + paragraph) % 2 === 0) {
        runs.push(chip((page - 1) * 270_000 + paragraph * 45_000), text(' '));
        chips += 1;
      }
      runs.push(text(`${TERMS[(page + paragraph) % TERMS.length]}: `, true));
      runs.push(text([next(), next(), next(), next()].join(' ')));
      content.push({ type: 'paragraph', content: runs });
    }
    content.push({ type: 'heading', attrs: { level: 2 }, content: [text('Puntos clave')] });
    content.push({
      type: 'bulletList',
      content: [next(), next(), next()].map((s) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(s)] }] })),
    });
  }
  return { type: 'doc', content };
}

/** Words in a document's text (for the timings line). */
export function wordCount(doc: JSONContent): number {
  let words = 0;
  const walk = (node: JSONContent) => {
    if (node.text) words += node.text.split(/\s+/).filter(Boolean).length;
    node.content?.forEach(walk);
  };
  walk(doc);
  return words;
}

export function chipCount(doc: JSONContent): number {
  return (doc.type === 'timestampChip' ? 1 : 0) + (doc.content ?? []).reduce((n, child) => n + chipCount(child), 0);
}

/** JSON with object keys sorted, so two documents compare by content, not key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameDocument(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
