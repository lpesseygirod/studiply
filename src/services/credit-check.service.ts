/**
 * credit-check.service.ts
 * Lightweight pre-flight checks for OpenAI and Anthropic API keys/credits.
 * Called before the user starts a recording so they get an early warning
 * rather than losing a recording to a failed transcription.
 *
 * Both checks return { ok: true } when no keys are configured — that means
 * mock mode is active and no credits are needed.
 */

import { logAiUsage } from './ai.service';
import { getSpendingByProvider } from './ai-usage.service';
import { getUserSettings, upsertUserSettings } from './settings.service';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

export interface CreditCheckResult {
  ok: boolean;
  error?: string;
}

export interface AICreditStatus {
  openai: CreditCheckResult;
  anthropic: CreditCheckResult;
  /** Always true — worst case the app falls back to mock mode. */
  canProceed: boolean;
}

// -------------------------------------------------------------------
// OpenAI — hits /v1/models which is free and auth-checked
// -------------------------------------------------------------------
export async function checkOpenAICredits(): Promise<CreditCheckResult> {
  try {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('your_') || OPENAI_API_KEY.includes('here')) {
      return { ok: true }; // No key = mock mode, no credits needed
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });

    if (response.status === 401) return { ok: false, error: 'openai_invalid_key' };
    if (response.status === 402) return { ok: false, error: 'openai_rate_limit' };
    if (response.status === 429) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const code = (body as any)?.error?.code ?? '';
      return { ok: false, error: code === 'insufficient_quota' ? 'openai_rate_limit' : 'openai_rate_limit' };
    }
    if (!response.ok) return { ok: false, error: 'openai_error' };

    return { ok: true };
  } catch {
    return { ok: true }; // Network failure — assume fine, don't crash
  }
}

// -------------------------------------------------------------------
// Anthropic — sends a minimal 1-token message to verify key + credits
// -------------------------------------------------------------------
export async function checkAnthropicCredits(userId?: string): Promise<CreditCheckResult> {
  try {
    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('your_') || ANTHROPIC_API_KEY.includes('here')) {
      return { ok: true }; // No key = mock mode, no credits needed
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    // Log the cost of this ping regardless of outcome (we sent the request)
    if (userId) {
      logAiUsage({
        userId,
        sessionId: '',
        operation: 'summarization',
        tokensInput: 1,
        tokensOutput: 0,
        estimatedCostUsd: 0.001,
        modelUsed: 'claude-haiku-4-5-20251001',
      }).catch(() => {});
    }

    if (!response.ok) {
      if (response.status === 401) return { ok: false, error: 'anthropic_invalid_key' };
      if (response.status === 429) return { ok: false, error: 'anthropic_rate_limit' };

      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const msg: string = (body as any)?.error?.message ?? '';
      if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('billing')) {
        return { ok: false, error: 'anthropic_no_credits' };
      }
      return { ok: false, error: 'anthropic_error' };
    }

    return { ok: true };
  } catch {
    return { ok: true }; // Network failure — assume fine, don't crash
  }
}

// -------------------------------------------------------------------
// Combined check
// -------------------------------------------------------------------
export async function checkAICredits(userId?: string): Promise<AICreditStatus> {
  try {
    const [openai, anthropic] = await Promise.all([
      checkOpenAICredits(),
      checkAnthropicCredits(userId),
    ]);
    return { openai, anthropic, canProceed: true };
  } catch {
    return {
      openai: { ok: true },
      anthropic: { ok: true },
      canProceed: true,
    };
  }
}

// -------------------------------------------------------------------
// Helper — used in the review screen to identify billing failures
// -------------------------------------------------------------------
export function isCreditError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('insufficient') ||
    lower.includes('credit') ||
    lower.includes('billing') ||
    lower.includes('quota') ||
    lower.includes('402') ||
    lower.includes('429')
  );
}

// -------------------------------------------------------------------
// getEstimatedBalances
// Combines user-set budget amounts (from user_settings) with actual
// spending (from ai_usage) to produce a running estimated balance.
// No API calls — purely local data.
// -------------------------------------------------------------------

export interface ProviderBalance {
  deposited: number;
  used: number;
  remaining: number;
  status: 'good' | 'low' | 'empty';
}

export interface EstimatedBalances {
  openai: ProviderBalance;
  anthropic: ProviderBalance;
}

function balanceStatus(remaining: number): 'good' | 'low' | 'empty' {
  if (remaining >= 2) return 'good';
  if (remaining >= 0.5) return 'low';
  return 'empty';
}

export async function getEstimatedBalances(userId: string): Promise<EstimatedBalances> {
  const [settings, spending] = await Promise.all([
    getUserSettings(userId),
    getSpendingByProvider(userId),
  ]);

  // Falls back to the $10 starter default when no settings row exists yet.
  const openaiDeposited = settings?.openai_budget ?? 10;
  const anthropicDeposited = settings?.anthropic_budget ?? 10;

  const openaiUsed = spending.openai.totalCost;
  const anthropicUsed = spending.anthropic.totalCost;

  const openaiRemaining = Math.max(0, openaiDeposited - openaiUsed);
  const anthropicRemaining = Math.max(0, anthropicDeposited - anthropicUsed);

  return {
    openai: {
      deposited: openaiDeposited,
      used: openaiUsed,
      remaining: openaiRemaining,
      status: balanceStatus(openaiRemaining),
    },
    anthropic: {
      deposited: anthropicDeposited,
      used: anthropicUsed,
      remaining: anthropicRemaining,
      status: balanceStatus(anthropicRemaining),
    },
  };
}

// -------------------------------------------------------------------
// updateBudget
// Saves user-entered deposit amount to user_settings.
// Creates the row if it doesn't exist yet (upsert).
// -------------------------------------------------------------------
export async function updateBudget(
  userId: string,
  provider: 'openai' | 'anthropic',
  amount: number,
): Promise<void> {
  await upsertUserSettings(
    userId,
    provider === 'openai' ? { openai_budget: amount } : { anthropic_budget: amount },
  );
}
