import { FormulaSyntaxError, parseFormula, tokenize, type Node } from '../parser';

/** The tree written back with every operation in brackets, to check what binds first. */
function show(node: Node): string {
  switch (node.type) {
    case 'number':
      return String(node.value);
    case 'string':
      return JSON.stringify(node.value);
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'error':
      return node.code;
    case 'ref':
      return `${node.ref.colAbs ? '$' : ''}${node.ref.col}${node.ref.rowAbs ? '$' : ''}r${node.ref.row}`;
    case 'range':
      return `${show({ type: 'ref', ref: node.start })}:${show({ type: 'ref', ref: node.end })}`;
    case 'name':
      return `name(${node.name})`;
    case 'empty':
      return '_';
    case 'paren':
      return show(node.inner);
    case 'unary':
      return `(${node.op}${show(node.operand)})`;
    case 'percent':
      return `(${show(node.operand)}%)`;
    case 'binary':
      return `(${show(node.left)} ${node.op} ${show(node.right)})`;
    case 'call':
      return `${node.name}[${node.args.map(show).join('; ')}]`;
  }
}

const parse = (text: string) => show(parseFormula(text));

describe('tokenize', () => {
  it('splits a formula and keeps positions', () => {
    const tokens = tokenize('SUM(A1:$B$2) >= 10');
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ['func', 'SUM'],
      ['lparen', '('],
      ['ref', 'A1'],
      ['colon', ':'],
      ['ref', '$B$2'],
      ['rparen', ')'],
      ['op', '>='],
      ['number', '10'],
    ]);
    expect(tokens[4]).toMatchObject({ start: 7, end: 11 });
  });

  it('reads a name followed by "(" as a function, even when it looks like a cell', () => {
    expect(tokenize('LOG10(1)')[0].kind).toBe('func');
    expect(tokenize('LOG10')[0].kind).toBe('ref');
  });

  it('reads names that are not cells', () => {
    expect(tokenize('Price')[0].kind).toBe('name');
    expect(tokenize('XFE1')[0].kind).toBe('name');
  });

  it('reads text with doubled quotes', () => {
    expect(tokenize('"say ""hi"""')[0].text).toBe('"say ""hi"""');
  });

  it('reads error values', () => {
    expect(tokenize('#N/A')[0]).toMatchObject({ kind: 'error', text: '#N/A' });
    expect(tokenize('#div/0!')[0].kind).toBe('error');
  });
});

describe('parseFormula', () => {
  it('reads values', () => {
    expect(parse('1.5')).toBe('1.5');
    expect(parse('.5e2')).toBe('50');
    expect(parse('"a ""b"""')).toBe('"a \\"b\\""');
    expect(parse('true')).toBe('TRUE');
    expect(parse('#REF!')).toBe('#REF!');
  });

  it('reads references and ranges in any case', () => {
    expect(parse('b2')).toBe('1r1');
    expect(parse('$A$1:b5')).toBe('$0$r0:1r4');
  });

  it('applies * before +', () => expect(parse('1+2*3')).toBe('(1 + (2 * 3))'));
  it('applies ^ before *', () => expect(parse('2*3^2')).toBe('(2 * (3 ^ 2))'));
  it('applies ^ left to right', () => expect(parse('2^3^2')).toBe('((2 ^ 3) ^ 2)'));
  it('applies negation before ^, as Excel does', () => expect(parse('-2^2')).toBe('((-2) ^ 2)'));
  it('reads a negative exponent', () => expect(parse('2^-1')).toBe('(2 ^ (-1))'));
  it('applies % before ^', () => expect(parse('2^50%')).toBe('(2 ^ (50%))'));
  it('applies & after +', () => expect(parse('1+2&"x"')).toBe('((1 + 2) & "x")'));
  it('applies comparisons last', () => expect(parse('A1&"x"<>"yx"')).toBe('((0r0 & "x") <> "yx")'));
  it('follows brackets', () => expect(parse('(1+2)*3')).toBe('((1 + 2) * 3)'));
  it('ignores spaces', () => expect(parse(' 1 +  A1 ')).toBe('(1 + 0r0)'));

  it('reads function calls with upper-cased names', () => {
    expect(parse('sum(A1:A3, 2)')).toBe('SUM[0r0:0r2; 2]');
    expect(parse('PI()')).toBe('PI[]');
    expect(parse('IF(A1>0,MAX(1,2),"no")')).toBe('IF[(0r0 > 0); MAX[1; 2]; "no"]');
  });

  it('reads left-out arguments as empty', () => {
    expect(parse('PV(1,2,3,,0)')).toBe('PV[1; 2; 3; _; 0]');
    expect(parse('F(,)')).toBe('F[_; _]');
    expect(parse('F(1,)')).toBe('F[1; _]');
  });

  it.each([
    ['', 'empty'],
    ['1+', 'ends too early'],
    ['(1+2', 'Missing ")"'],
    ['SUM(1,2', 'Missing ")"'],
    ['1 2', 'Unexpected "2"'],
    ['A1:', 'needs a cell'],
    ['A1:5', 'needs a cell'],
    ['"abc', 'closing quote'],
    ['1;2', 'Unexpected ";"'],
    ['Sheet2!A1', 'Unexpected "!"'],
    ['#WHAT', 'Unknown error value'],
  ])('rejects "%s"', (text, message) => {
    expect(() => parseFormula(text)).toThrow(FormulaSyntaxError);
    expect(() => parseFormula(text)).toThrow(message);
  });
});
