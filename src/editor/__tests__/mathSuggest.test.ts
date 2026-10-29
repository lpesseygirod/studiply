/**
 * @jest-environment jsdom
 */
// Formulas as you type (after test B): $…$ turns into a formula (money
// doesn't); maths typed as text is offered as a formula, never changed on
// its own.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { mathCandidate, mathLatex } from '../schema/mathSuggest';

describe('what looks like maths', () => {
  it.each([
    ['x^2', 'x^{2}'],
    ['x^2+y^2', 'x^{2}+y^{2}'],
    ['e^(2x)', 'e^{2x}'],
    ['x_1', 'x_{1}'],
    ['a/b', '\\frac{a}{b}'],
    ['1/2', '\\frac{1}{2}'],
    ['(a+b)/c', '\\frac{a+b}{c}'],
    ['sqrt(x)', '\\sqrt{x}'],
    ['sqrt(b^2-4ac)', '\\sqrt{b^{2}-4ac}'],
    ['alpha^2', '\\alpha^{2}'],
    ['2*pi*r^2', '2 \\cdot \\pi \\cdot r^{2}'],
  ])('%s → %s', (word, latex) => {
    expect(mathLatex(word)).toBe(latex);
  });

  it.each(['29/10', '29/10/2026', 'and/or', 'km/h', 'mi_nombre', 'https://uned.es/a^b', 'hola', '10', 'student@example.com', 'Psicología/Biología', '12/45'])(
    '%s is not maths',
    (word) => {
      expect(mathLatex(word)).toBeNull();
    },
  );

  it('the word just before the cursor, also once a space is typed after it; sentence punctuation stays out', () => {
    expect(mathCandidate('El área es x^2')).toEqual({ start: 11, end: 14, latex: 'x^{2}' });
    expect(mathCandidate('El área es x^2 ')).toEqual({ start: 11, end: 14, latex: 'x^{2}' });
    expect(mathCandidate('y luego x^2.')).toEqual({ start: 8, end: 11, latex: 'x^{2}' });
    expect(mathCandidate('x^2 y más')).toBeNull();
    expect(mathCandidate('$x^2')).toBeNull();
  });
});

describe('in the editor', () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());
  const open = () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    editor.commands.focus('end');
  };
  // Typing as the keyboard does: each character through the input rules.
  const type = (text: string) => {
    for (const ch of text) {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)));
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
    }
  };
  const content = () => editor.getJSON().content?.[0]?.content ?? [];

  it('$x^2$ becomes a formula at once', () => {
    open();
    type('Área: $x^2$');
    expect(content()).toEqual([{ type: 'text', text: 'Área: ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }]);
  });

  it('money stays text: "$5 and $10"', () => {
    open();
    type('Cuesta $5 and $10 en total');
    expect(content()).toEqual([{ type: 'text', text: 'Cuesta $5 and $10 en total' }]);
  });

  it('x^2 is only offered (format state); Make formula changes it, keeping the space after it', () => {
    open();
    type('El área es x^2 ');
    expect(content()).toEqual([{ type: 'text', text: 'El área es x^2 ' }]);
    expect(formatState(editor).mathSuggestion).toEqual({ latex: 'x^{2}' });
    runFormat(editor, { type: 'formula', action: 'acceptSuggestion' });
    expect(content()).toEqual([{ type: 'text', text: 'El área es ' }, { type: 'inlineMath', attrs: { latex: 'x^{2}' } }, { type: 'text', text: ' ' }]);
    expect(formatState(editor).mathSuggestion).toBeNull();
  });

  it('typing on past it, or Escape, and the suggestion goes', () => {
    open();
    type('x^2');
    expect(formatState(editor).mathSuggestion).not.toBeNull();
    type(' y');
    expect(formatState(editor).mathSuggestion).toBeNull();
    type(' a/b');
    expect(formatState(editor).mathSuggestion).toEqual({ latex: '\\frac{a}{b}' });
    runFormat(editor, { type: 'formula', action: 'dismissSuggestion' });
    expect(formatState(editor).mathSuggestion).toBeNull();
    // Not offered again for the same word.
    type(' ');
    expect(formatState(editor).mathSuggestion).toBeNull();
  });

  it('Tab takes it (laptop)', () => {
    open();
    type('sqrt(x)');
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(content()).toEqual([{ type: 'inlineMath', attrs: { latex: '\\sqrt{x}' } }]);
  });
});
