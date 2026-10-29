/**
 * types.ts
 * How a spreadsheet function is described to the evaluator.
 */

import type { Node } from '../parser';
import type { Value } from '../values';

export interface FunctionDef {
  /** Fewest and most arguments; outside them the formula gives #VALUE!. */
  min: number;
  max: number;
  /** Gets every argument computed. A cell or range argument arrives as a Grid, a left-out one as null. */
  fn?: (args: Value[]) => Value;
  /** Computes only the arguments it needs (IF), with `evaluate`. */
  lazy?: (args: Node[], evaluate: (node: Node) => Value) => Value;
}
