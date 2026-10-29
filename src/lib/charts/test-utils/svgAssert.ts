/**
 * svgAssert.ts
 * Small readers for the chart tests: is the SVG well-formed, which elements
 * and attributes does it have, what text does it show.
 */

const ENTITY = /&(amp|lt|gt|quot|#39);/g;
const decode = (s: string) =>
  s.replace(ENTITY, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] ?? '');

/** Throws unless every tag closes in order and text has no raw `<` or `&`. */
export function assertWellFormed(svg: string): void {
  if (!svg.startsWith('<svg ')) throw new Error('does not start with <svg');
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(svg))) {
    const between = svg.slice(last, m.index);
    if (/[<>]/.test(between) || /&(?!(amp|lt|gt|quot|#39);)/.test(between)) {
      throw new Error(`bad text near ${JSON.stringify(svg.slice(Math.max(0, m.index - 40), m.index))}`);
    }
    last = tag.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      if (open !== name) throw new Error(`</${name}> closes <${open}>`);
    } else stack.push(name);
  }
  if (last !== svg.length) throw new Error(`unparsed tail: ${svg.slice(last, last + 60)}`);
  if (stack.length > 0) throw new Error(`unclosed: ${stack.join(', ')}`);
}

export interface Element {
  tag: string;
  attrs: Record<string, string>;
}

/** Every element named `tag`, with its attributes (decoded). */
export function elements(svg: string, tag: string): Element[] {
  const re = new RegExp(`<${tag}((?:\\s+[\\w:-]+="[^"]*")*)\\s*/?>`, 'g');
  return [...svg.matchAll(re)].map((m) => ({
    tag,
    attrs: Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])])),
  }));
}

/** The visible text of every <text>, tspans joined with a space. */
export function texts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) =>
    decode(
      m[1]
        .replace(/<\/tspan><tspan[^>]*>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .trim(),
    ),
  );
}

export function descOf(svg: string): string {
  return decode(/<desc[^>]*>(.*?)<\/desc>/.exec(svg)?.[1] ?? '');
}

export function titleOf(svg: string): string {
  return decode(/<title[^>]*>(.*?)<\/title>/.exec(svg)?.[1] ?? '');
}

/** Numbers in an SVG path's d attribute. */
export function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}
