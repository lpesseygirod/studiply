// Step 6.2: the study assistant's answer as the app draws it (utils/answerText):
// paragraphs, numbered lists, **bold**, and the cited times as tappable times.
import { answerBlocks, answerPlainText, answerSpans } from '../answerText';

describe('answerSpans', () => {
  it('bold runs and times, the times without their brackets', () => {
    expect(answerSpans('La profesora explicó **las 5 preguntas**. En el [31:05] dijo')).toEqual([
      { kind: 'text', text: 'La profesora explicó ', bold: false },
      { kind: 'text', text: 'las 5 preguntas', bold: true },
      { kind: 'text', text: '. En el ', bold: false },
      { kind: 'time', ms: 1_865_000, label: '31:05', bold: false },
      { kind: 'text', text: ' dijo', bold: false },
    ]);
  });

  it('an hour and more, and a time inside bold', () => {
    expect(answerSpans('**at [1:02:03]**')).toEqual([
      { kind: 'text', text: 'at ', bold: true },
      { kind: 'time', ms: 3_723_000, label: '1:02:03', bold: true },
    ]);
  });

  it('a bold not closed yet (still streaming) is bold to the end; brackets that aren’t a time stay text', () => {
    expect(answerSpans('ver **las 5 pre')).toEqual([
      { kind: 'text', text: 'ver ', bold: false },
      { kind: 'text', text: 'las 5 pre', bold: true },
    ]);
    expect(answerSpans('[5] and [12:3]')).toEqual([{ kind: 'text', text: '[5] and [12:3]', bold: false }]);
  });
});

describe('answerBlocks', () => {
  it('paragraphs and a numbered list, as desktop-01’s answer', () => {
    const text = [
      'En estos 10 minutos la profesora explicó **las 5 preguntas**:',
      '',
      '1. **Estructuras:** qué partes',
      '2. **Procesos:** qué la pone en marcha',
      '',
      'En el [31:05] dijo que hay que saberlas.',
    ].join('\n');
    const blocks = answerBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    const list = blocks[1];
    expect(list.kind === 'list' && list.ordered && list.items.map((i) => i.number)).toEqual([1, 2]);
    expect(list.kind === 'list' && list.items[0].spans[0]).toEqual({ kind: 'text', text: 'Estructuras:', bold: true });
    expect(blocks[2].kind === 'paragraph' && blocks[2].spans.some((s) => s.kind === 'time' && s.label === '31:05')).toBe(true);
  });

  it('bullets; lines of one paragraph stay together; a heading reads as a bold line', () => {
    const blocks = answerBlocks('## Resumen\nuno\ndos\n- a\n* b');
    expect(blocks).toEqual([
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'Resumen', bold: true }, { kind: 'text', text: '\nuno\ndos', bold: false }] },
      {
        kind: 'list',
        ordered: false,
        items: [
          { number: null, spans: [{ kind: 'text', text: 'a', bold: false }] },
          { number: null, spans: [{ kind: 'text', text: 'b', bold: false }] },
        ],
      },
    ]);
  });

  it('nothing yet: no blocks', () => {
    expect(answerBlocks('')).toEqual([]);
  });
});

describe('answerPlainText (Copy)', () => {
  it('drops the bold marks, keeps the times', () => {
    expect(answerPlainText('**Hola** [1:05] ')).toBe('Hola [1:05]');
  });
});
