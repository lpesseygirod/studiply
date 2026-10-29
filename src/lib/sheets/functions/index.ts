/**
 * index.ts
 * Every function a formula can call, by its upper-case name.
 */

import { LOGIC_FUNCTIONS } from './logic';
import { MATH_FUNCTIONS } from './math';
import type { FunctionDef } from './types';

export type { FunctionDef } from './types';

export const FUNCTIONS: Readonly<Record<string, FunctionDef>> = {
  ...MATH_FUNCTIONS,
  ...LOGIC_FUNCTIONS,
};
