/**
 * consentTexts.ts
 * What the AI consent screen (desktop-09, iphone-12) and the Settings → AI & privacy card
 * (iphone-08) say goes where. The mockups name OpenAI for audio: transcription has been ElevenLabs
 * since 29 Oct 2026, so these name ElevenLabs. Change them together with
 * CONSENT_POLICY_VERSION (supabase/functions/_shared/policy.ts): everyone is asked again.
 */

export const CONSENT_INTRO = 'Studiply uses AI services to turn lectures into notes. You decide.';

/** The two services, as the screen's numbered rows (bold part, then the rest). */
export const CONSENT_SERVICES: readonly { what: string; to: string; why: string }[] = [
  { what: 'Audio', to: 'ElevenLabs', why: 'to write the transcript.' },
  { what: 'Transcript, notes, marks, slides and photos', to: 'Anthropic (Claude)', why: 'to write summaries, answer your questions and write quizzes.' },
];

export const CONSENT_NO_TRAINING = 'Not used to train AI models. You can withdraw any time in Settings → AI & privacy.';

export const CONSENT_AGREE = 'I agree to send my lecture content to these services.';

/** The Settings card's sentence (iphone-08), the same services in one paragraph. */
export const CONSENT_SUMMARY_PARTS: readonly { text: string; bold?: boolean }[] = [
  { text: 'Audio goes to ' },
  { text: 'ElevenLabs', bold: true },
  { text: ' for the transcript. Transcript, notes, marks, slides and photos go to ' },
  { text: 'Anthropic (Claude)', bold: true },
  { text: ' for summaries, answers and quizzes. Not used for training.' },
];
