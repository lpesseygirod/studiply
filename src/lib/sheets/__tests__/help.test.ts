import { FUNCTION_HELP, FUNCTIONS, helpParts, suggestFunctions } from '..';

describe('the function help table', () => {
  it('has an entry for every function, and none for a function that does not exist', () => {
    expect(Object.keys(FUNCTION_HELP).sort()).toEqual(Object.keys(FUNCTIONS).sort());
  });

  it("agrees with each function's argument counts", () => {
    for (const [name, help] of Object.entries(FUNCTION_HELP)) {
      const def = FUNCTIONS[name];
      expect([name, help.required]).toEqual([name, def.min]);
      if (help.repeats) expect([name, def.max > help.args.length]).toEqual([name, true]);
      else expect([name, help.args.length]).toEqual([name, def.max]);
      expect(help.summary.length).toBeGreaterThan(0);
    }
  });

  it('has BUILD-PLAN 4.7e groups', () => {
    const byGroup = (g: string) => Object.values(FUNCTION_HELP).filter((h) => h.group === g).map((h) => h.name).sort();
    expect(byGroup('Basic')).toEqual(['AVERAGE', 'COUNT', 'MAX', 'MIN', 'ROUND', 'SUM']);
    expect(byGroup('Logic')).toEqual(['AND', 'IF', 'OR']);
    expect(byGroup('Lookup')).toEqual(['VLOOKUP', 'XLOOKUP']);
    expect(byGroup('Finance')).toEqual(['FV', 'IRR', 'NPER', 'NPV', 'PMT', 'PV', 'RATE']);
  });
});

describe('suggestFunctions', () => {
  it('lists the functions starting with the letters, in any case, by group then name', () => {
    expect(suggestFunctions('pm').map((h) => h.name)).toEqual(['PMT']);
    expect(suggestFunctions('n').map((h) => h.name)).toEqual(['NPER', 'NPV']);
    expect(suggestFunctions('A').map((h) => h.name)).toEqual(['AVERAGE', 'AND']);
    expect(suggestFunctions('').length).toBe(18);
    expect(suggestFunctions('zz')).toEqual([]);
  });
});

describe('helpParts', () => {
  const line = (name: string, arg: number) =>
    helpParts(name, arg)!
      .map((p) => (p.current ? `**${p.text}**` : p.text))
      .join('');

  it('marks the argument the cursor is in, optional ones in brackets', () => {
    expect(line('PMT', 0)).toBe('PMT(**rate**, nper, pv, [fv], [type])');
    expect(line('pmt', 1)).toBe('PMT(rate, **nper**, pv, [fv], [type])');
    expect(line('PMT', 4)).toBe('PMT(rate, nper, pv, [fv], **[type]**)');
    expect(line('IF', 2)).toBe('IF(logical_test, value_if_true, **[value_if_false]**)');
  });

  it('marks nothing past the last argument of a fixed function', () => {
    expect(line('ROUND', 2)).toBe('ROUND(number, num_digits)');
  });

  it("marks a repeating function's last name for its later arguments", () => {
    expect(line('SUM', 0)).toBe('SUM(**number1**, [number2], …)');
    expect(line('SUM', 6)).toBe('SUM(number1, **[number2]**, …)');
    expect(line('NPV', 3)).toBe('NPV(rate, value1, **[value2]**, …)');
  });

  it('has none for an unknown name', () => {
    expect(helpParts('FOO', 0)).toBeNull();
  });
});
