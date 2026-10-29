#!/usr/bin/env node
/**
 * compare-transcribe.mjs — one recording through whisper-1 and Scribe v2,
 * side by side, before switching transcribe-chunk to ElevenLabs.
 *
 *   npm run compare:transcribe -- <audio file> [--language es]
 *
 * Uses the Edge Function's own code (supabase/functions/_shared: the same
 * requests, retries and sentence grouping), so what it prints is what
 * students would get. No Supabase needed and nothing is written to the
 * database. Keys are read from the git-ignored supabase/functions/.env and
 * never printed; a missing key skips that provider.
 *
 * Sends the file to OpenAI and ElevenLabs (about $0.36 per hour of audio
 * for both together); use your own recordings only. ElevenLabs' copy of
 * the transcript is deleted afterwards, as the function does. The
 * transcripts are written to a new folder in the system temp directory
 * (printed at the end), never into the repo.
 *
 * Without a hand-made transcript there is no true error rate: "words that
 * differ" only shows how much the two disagree. Read compare.txt, where
 * both are lined up by time, and listen to the places where they differ.
 */

import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { deleteScribeTranscript, transcribeScribe } from '../supabase/functions/_shared/elevenlabs.ts';
import { transcribe } from '../supabase/functions/_shared/openai.ts';
import {
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODELS,
  costUsd,
  fromScribe,
  fromWhisper,
  languageCode,
} from '../supabase/functions/_shared/transcript.ts';

const FUNCTIONS_ENV = 'supabase/functions/.env';
const TYPES = { '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.webm': 'audio/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

/** A value from the git-ignored functions .env, without printing it. */
function envValue(name) {
  if (!existsSync(FUNCTIONS_ENV)) return null;
  // Same forms the Supabase CLI accepts: optional `export`, spaces around =, quotes.
  for (const line of readFileSync(FUNCTIONS_ENV, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`));
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

const args = process.argv.slice(2);
const languageAt = args.indexOf('--language');
const language = languageAt >= 0 ? languageCode(args[languageAt + 1]) : null;
const file = args.find((a, i) => !a.startsWith('--') && (languageAt < 0 || i !== languageAt + 1));

if (!file || (languageAt >= 0 && !language)) {
  console.error('Usage: npm run compare:transcribe -- <audio file> [--language es]');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`No file at ${file}.`);
  process.exit(1);
}
if (!TYPES[extname(file).toLowerCase()]) {
  console.error(`Use one of ${Object.keys(TYPES).join(', ')} (the formats the app records).`);
  process.exit(1);
}
if (statSync(file).size > MAX_AUDIO_BYTES) {
  console.error('The file is over 25 MB, more than whisper-1 accepts. Use one 20-minute chunk.');
  process.exit(1);
}

const audio = new Blob([readFileSync(file)], { type: TYPES[extname(file).toLowerCase()] });
const fileName = basename(file);

const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Words for comparing: lower case, no punctuation, accents kept (they matter in Spanish). */
const wordsOf = (segments) =>
  segments
    .map((s) => s.text)
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Word-level edit distance between the two transcripts, as a share of the first one's words. */
function differ(a, b) {
  let previous = new Uint32Array(b.length + 1).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = new Uint32Array(b.length + 1);
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return a.length ? previous[b.length] / a.length : 0;
}

const runs = [
  {
    provider: 'openai',
    label: 'whisper-1',
    key: envValue(TRANSCRIBE_MODELS.openai.keyEnv),
    run: async (key) => {
      const result = await transcribe(key, audio, fileName, language);
      return result.ok ? { ok: true, transcription: fromWhisper(result.answer, 0) } : result;
    },
  },
  {
    provider: 'elevenlabs',
    label: 'Scribe v2',
    key: envValue(TRANSCRIBE_MODELS.elevenlabs.keyEnv),
    run: async (key) => {
      const result = await transcribeScribe(key, audio, fileName, language);
      if (!result.ok) return result;
      const id = result.answer.transcription_id;
      const deleted = id ? await deleteScribeTranscript(key, id) : false;
      return { ok: true, transcription: fromScribe(result.answer, 0), deleted };
    },
  },
];

const missing = runs.filter((r) => !r.key);
for (const r of missing) console.log(`Skipping ${r.label}: no ${TRANSCRIBE_MODELS[r.provider].keyEnv} in ${FUNCTIONS_ENV}.`);
const ready = runs.filter((r) => r.key);
if (!ready.length) process.exit(1);

console.log(
  `Sending ${fileName} to ${ready.map((r) => `${TRANSCRIBE_MODELS[r.provider].name} (${r.label})`).join(' and ')}` +
    `${language ? `, language ${language}` : ', language detected'}…\n`,
);

const results = await Promise.all(
  ready.map(async (r) => {
    const started = Date.now();
    const result = await r.run(r.key);
    return { ...r, ...result, seconds: (Date.now() - started) / 1000 };
  }),
);

const dir = mkdtempSync(join(tmpdir(), 'studiply-compare-'));
for (const r of results) {
  if (!r.ok) {
    console.log(`${r.label}: failed (${r.status} ${r.code})`);
    continue;
  }
  const { audioSeconds, language: detected, segments } = r.transcription;
  const scored = segments.filter((s) => s.confidence !== null);
  const meanLength = segments.length
    ? segments.reduce((sum, s) => sum + s.end_ms - s.start_ms, 0) / segments.length / 1000
    : 0;
  console.log(`${r.label}`);
  console.log(`  took        ${r.seconds.toFixed(1)} s for ${(audioSeconds / 60).toFixed(1)} min (${(audioSeconds / Math.max(r.seconds, 0.1)).toFixed(0)}× real time)`);
  console.log(`  cost        $${costUsd(audioSeconds, r.provider).toFixed(4)}`);
  console.log(`  language    ${detected ?? 'not detected'}`);
  console.log(`  segments    ${segments.length}, ${meanLength.toFixed(1)} s on average`);
  console.log(`  words       ${wordsOf(segments).length}`);
  if (scored.length) {
    const mean = scored.reduce((sum, s) => sum + s.confidence, 0) / scored.length;
    console.log(`  confidence  ${(mean * 100).toFixed(0)} % on average (each model rates itself; not comparable between them)`);
  }
  if (r.provider === 'elevenlabs') console.log(`  ElevenLabs’ copy ${r.deleted ? 'deleted' : 'NOT deleted (check its history)'}`);
  console.log('');
  writeFileSync(join(dir, `${r.provider}.txt`), segments.map((s) => `[${mmss(s.start_ms)}] ${s.text}`).join('\n') + '\n');
}

const [whisper, scribe] = results.map((r) => (r.ok ? r.transcription.segments : null));
if (whisper && scribe) {
  const share = differ(wordsOf(whisper), wordsOf(scribe));
  console.log(`Words that differ between them: ${(share * 100).toFixed(1)} % (not an error rate; see compare.txt)\n`);

  // Both lined up by minute, so the same passage sits side by side
  const lastMs = Math.max(...[...whisper, ...scribe].map((s) => s.end_ms), 0);
  const lines = [];
  for (let from = 0; from <= lastMs; from += 60_000) {
    const inMinute = (segments) => segments.filter((s) => s.start_ms >= from && s.start_ms < from + 60_000);
    lines.push(`=== ${mmss(from)} – ${mmss(from + 60_000)} ===`, '', 'whisper-1:');
    for (const s of inMinute(whisper)) lines.push(`  [${mmss(s.start_ms)}] ${s.text}`);
    lines.push('', 'Scribe v2:');
    for (const s of inMinute(scribe)) lines.push(`  [${mmss(s.start_ms)}] ${s.text}`);
    lines.push('', '');
  }
  writeFileSync(join(dir, 'compare.txt'), lines.join('\n'));
}

console.log(`Transcripts in ${dir}`);
console.log('  compare.txt: both, minute by minute; openai.txt / elevenlabs.txt: each on its own.');
console.log('  They hold your lecture’s words: delete the folder when you are done.');
