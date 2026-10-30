/**
 * help.ts
 * What the editor shows while a formula is typed (step 4.7e): the functions
 * by group for autocomplete, and a help line per function with Excel's
 * argument names, e.g. PMT(rate, nper, pv, [fv], [type]).
 *
 * Every function in FUNCTIONS has an entry, and its arguments agree with
 * the function's min / max (a test checks both).
 */

export type FunctionGroup = 'Basic' | 'Logic' | 'Lookup' | 'Finance';

export const FUNCTION_GROUPS: readonly FunctionGroup[] = ['Basic', 'Logic', 'Lookup', 'Finance'];

export interface FunctionHelp {
  name: string;
  group: FunctionGroup;
  /** Excel's argument names, in order. */
  args: readonly string[];
  /** How many of `args` must be given; the rest are optional (shown in brackets). */
  required: number;
  /** The last argument may repeat (SUM(number1, [number2], …)). */
  repeats?: boolean;
  /** One short line on what it gives. */
  summary: string;
}

const entries: FunctionHelp[] = [
  { name: 'SUM', group: 'Basic', args: ['number1', 'number2'], required: 1, repeats: true, summary: 'Adds the numbers.' },
  { name: 'AVERAGE', group: 'Basic', args: ['number1', 'number2'], required: 1, repeats: true, summary: 'The average (arithmetic mean) of the numbers.' },
  { name: 'MIN', group: 'Basic', args: ['number1', 'number2'], required: 1, repeats: true, summary: 'The smallest number.' },
  { name: 'MAX', group: 'Basic', args: ['number1', 'number2'], required: 1, repeats: true, summary: 'The largest number.' },
  { name: 'COUNT', group: 'Basic', args: ['value1', 'value2'], required: 1, repeats: true, summary: 'How many of the values are numbers.' },
  { name: 'ROUND', group: 'Basic', args: ['number', 'num_digits'], required: 2, summary: 'The number rounded to num_digits decimals.' },
  { name: 'IF', group: 'Logic', args: ['logical_test', 'value_if_true', 'value_if_false'], required: 2, summary: 'One value if the test is TRUE, another if it is FALSE.' },
  { name: 'AND', group: 'Logic', args: ['logical1', 'logical2'], required: 1, repeats: true, summary: 'TRUE if every test is TRUE.' },
  { name: 'OR', group: 'Logic', args: ['logical1', 'logical2'], required: 1, repeats: true, summary: 'TRUE if any test is TRUE.' },
  {
    name: 'VLOOKUP',
    group: 'Lookup',
    args: ['lookup_value', 'table_array', 'col_index_num', 'range_lookup'],
    required: 3,
    summary: 'Finds a value in the first column of a table and gives the value in another column of that row.',
  },
  {
    name: 'XLOOKUP',
    group: 'Lookup',
    args: ['lookup_value', 'lookup_array', 'return_array', 'if_not_found', 'match_mode', 'search_mode'],
    required: 3,
    summary: 'Finds a value in one range and gives the matching value from another.',
  },
  { name: 'PV', group: 'Finance', args: ['rate', 'nper', 'pmt', 'fv', 'type'], required: 3, summary: 'The present value of a series of equal payments.' },
  { name: 'FV', group: 'Finance', args: ['rate', 'nper', 'pmt', 'pv', 'type'], required: 3, summary: 'The future value of an investment with equal payments.' },
  { name: 'PMT', group: 'Finance', args: ['rate', 'nper', 'pv', 'fv', 'type'], required: 3, summary: 'The payment per period of a loan with a constant rate.' },
  { name: 'NPV', group: 'Finance', args: ['rate', 'value1', 'value2'], required: 2, repeats: true, summary: 'The net present value of cash flows at the end of each period.' },
  { name: 'IRR', group: 'Finance', args: ['values', 'guess'], required: 1, summary: 'The internal rate of return of a series of cash flows.' },
  { name: 'RATE', group: 'Finance', args: ['nper', 'pmt', 'pv', 'fv', 'type', 'guess'], required: 3, summary: 'The interest rate per period of a loan or annuity.' },
  { name: 'NPER', group: 'Finance', args: ['rate', 'pmt', 'pv', 'fv', 'type'], required: 3, summary: 'The number of periods to pay off a loan or reach a value.' },
];

/** Help for every function, by its upper-case name. */
export const FUNCTION_HELP: Readonly<Record<string, FunctionHelp>> = Object.fromEntries(entries.map((e) => [e.name, e]));

/** Functions whose name starts with `letters` (any case), by group, then by name. */
export function suggestFunctions(letters: string): FunctionHelp[] {
  const prefix = letters.toUpperCase();
  return entries
    .filter((e) => e.name.startsWith(prefix))
    .sort((a, b) => FUNCTION_GROUPS.indexOf(a.group) - FUNCTION_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
}

export interface HelpPart {
  text: string;
  /** The argument the cursor is in. */
  current?: boolean;
}

/**
 * The help line as parts, the argument at `argIndex` marked current:
 * PMT(, rate (current), , , nper, … ). A repeating function's later
 * arguments mark its last name (SUM's 5th is number2), as Excel does.
 */
export function helpParts(name: string, argIndex: number): HelpPart[] | null {
  const help = FUNCTION_HELP[name.toUpperCase()];
  if (!help) return null;
  const current = help.repeats ? Math.min(argIndex, help.args.length - 1) : argIndex;
  const parts: HelpPart[] = [{ text: `${help.name}(` }];
  help.args.forEach((arg, i) => {
    if (i > 0) parts.push({ text: ', ' });
    parts.push({ text: i < help.required ? arg : `[${arg}]`, ...(i === current ? { current: true } : {}) });
  });
  if (help.repeats) parts.push({ text: ', …' });
  parts.push({ text: ')' });
  return parts;
}
