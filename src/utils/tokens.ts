/**
 * Rough token estimator: ~4 characters per token (GPT/Claude average).
 * Used for cost estimation only — not for hard limits.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
