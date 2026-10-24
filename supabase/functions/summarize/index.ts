/**
 * summarize — writes a lecture's summary with Claude (skeleton).
 *
 * POST { lectureId } with the user's access token. The checks in
 * _shared/anthropic.ts run first (401, 400, 404, 403 consent_required,
 * 429 daily_limit). Answers JSON { text, model, usage, costUsd }.
 *
 * Step 1.6 skeleton: sends a fixed test prompt. Phase 7 builds the real
 * pipeline (resources, sliders, quality checks). Claude's answer is
 * streamed between here and Anthropic even now, because real summaries
 * are long and a single long request can time out.
 *
 * The cost is logged once in ai_usage. Never logs the prompt, the summary or keys.
 */

import { answerText, claudeFailure, claudeParams, logClaudeCost, readyForClaude } from '../_shared/anthropic.ts';
import { CLAUDE_MODELS, SUMMARIZE_TEST_PROMPT, validateSummarizeBody } from '../_shared/claude.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';

const MODEL = CLAUDE_MODELS.summary;

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'summarize', event, ...details }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  let lectureId: string | undefined;
  try {
    const ready = await readyForClaude(req, validateSummarizeBody, log);
    if (!ready.ok) return ready.response;
    const { claude, userId } = ready;
    lectureId = ready.value.lectureId;

    const started = Date.now();
    const stream = claude.beta.messages.stream(
      claudeParams(MODEL, 'You are Studiply’s summary engine.', [{ role: 'user', content: SUMMARIZE_TEST_PROMPT }]),
    );
    let final;
    try {
      final = await stream.finalMessage();
    } catch (err) {
      log('claude_failed', { lectureId, ...claudeFailure(err), ms: Date.now() - started });
      const partial = stream.currentMessage;
      if (partial) await logClaudeCost('summary', userId, lectureId, MODEL, partial).catch(() => {});
      return fail(502, 'summary_failed', 'The summary could not be written. Please try again.');
    }

    const cost = await logClaudeCost('summary', userId, lectureId, MODEL, final);
    const usage = { input: cost.tokensInput, output: cost.tokensOutput };

    // With fallbacks on, a refusal here means every model in the chain declined
    if (final.stop_reason === 'refusal') {
      log('refused', { lectureId, model: final.model });
      return fail(422, 'refused', 'Claude can’t summarize this lecture.');
    }

    log('summarized', { lectureId, model: final.model, ...usage, costUsd: cost.costUsd, ms: Date.now() - started });
    return json({ text: answerText(final), model: final.model, stopReason: final.stop_reason, usage, costUsd: cost.costUsd });
  } catch (err) {
    // Database errors are plain objects with a message, not Error instances
    log('error', { lectureId, message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});
