# The 15-minute locked join test (Lea's iPhone)

Measures every join between the iPhone's 30-second chunks while the phone is
locked. The laptop plays a click track; `joins.mjs` finds the clicks in the
uploaded chunks and reports, per join, the overlap, any lost audio and the
timing error. Everything stays on local Supabase; nothing is paid for.

## Files

- `joins.mjs` is already installed with the web-check scripts:
  `.claude/skills/web-check/scripts/joins.mjs`. Nothing to copy.
- `click-track.html` is beside this file (`docs/recording-test/`): open it in Chrome on the laptop.

## Before

1. Docker, `supabase start`, and Metro for the development build (`npm run start:local`).
   The iPhone and the Mac on the same Wi-Fi (or the iPhone's Personal Hotspot).
2. **No paid calls:** stop `supabase functions serve` if it runs (Ctrl+C in its terminal),
   or decline transcription in the consent step. The joins don't need a transcript, and
   real transcription costs money.
3. The new EAS development build on the iPhone (with expo-audio), signed in to your
   **local** account.
4. iPhone: charged above 50 %, Low Power Mode off, Do Not Disturb on (no calls in the middle).
5. Laptop: plugged in, lid open, in a quiet room. Open `click-track.html` in Chrome,
   **system volume at 75 %**, the phone **30 cm from the laptop's speaker**, its microphone
   (bottom edge) towards it. (On 30 Oct, at half volume and 1 m, most beeps weren't heard
   and the joins couldn't be measured.)

## The test

1. On the laptop, press **Start** on the click track. Keep that tab in front.
2. On the iPhone: New recording, title **Join test**, any course, Start
   (decline transcription if you don't want paid calls).
3. Wait 10 seconds, then **lock the phone** (side button). Don't touch it.
4. After **15 minutes** (the click track's clock at 15:10 or more), unlock it. Check:
   the timer kept running (about 15:00), the waveform moves, no "Microphone disconnected".
5. **Stop & summarize** → confirm. Wait until it no longer says "Saving…".
6. Stop the click track.
7. Don't press Pause during the test (a Pause join is left out of the measurement).

## Measure

From the Studiply folder:

    node .claude/skills/web-check/scripts/joins.mjs "Join test"

Expected with two recorders (overlap):

- `RESULT | order | chunks 0–30, none missing` (about 31 chunks for 15 min)
- each `JOIN` line: **about 10 clicks in both (≈ 500 ms overlap), 0 in neither**,
  `start_ms off by` a few ms, `join from the files ≈ −500 ms`
- `RESULT | joins | two recorders at each join (overlap)`
- `VERDICT | PASS`

joins.mjs measures each join from the 500 ms both chunks share (their audio cross-correlated).
On the click track that audio repeats every 50 ms, so the exact overlap often can't be told:
such joins say `audio continuous (ρ …), exact overlap not measurable on a periodic signal`,
and the verdict is then `VERDICT | CONTINUOUS` (exit code 4). That means no audio was lost,
not that the joins are exact.

**A real lecture is the definitive join test** (speech doesn't repeat): run joins.mjs on a
recorded lecture's title (e.g. in step 5.8) and expect `VERDICT | PASS`, each join with an
overlap of about 500 ms and the same audio (ρ ≥ 0.8).

If iOS refused two recorders at once, the Metro log says
`[recorder] iOS refused two recorders at once …` and joins.mjs reports
`one recorder, restarted at each join`: then each JOIN line shows the gap
(`… in neither (≈ N ms LOST)` and the join in ms). Send me the whole output either way.

Also worth sending: `RESULT | loudness`, `RESULT | clicks` (clicks missed inside chunks
would mean a dropout while locked), `RESULT | lengths`, `RESULT | chunk lengths` and
`RESULT | clock`.

From the Metro log, send any line with `[recorder] could not prepare the next part`
(why a rotation was skipped while locked) or `[recorder] part N lasted … cut into M pieces`
(a long part was cut on the phone: expected only if a rotation was skipped; the chunk
count is then higher than 31, which is fine).

## If it says something else

- `No lecture titled "Join test"`: the iPhone uses another Supabase than `supabase status`
  (check that the build is the development one and Metro served it).
- `not uploaded (pending)`: wait for the uploads (the phone online, the app opened), run again.
- `TOO QUIET | …` and `VERDICT | NOT MEASURED`: the phone didn't hear the click track in those
  chunks (fewer than half of their clicks), so nothing about the joins can be said. Check the
  volume (75 %) and the distance (30 cm), keep the room quiet, and record again.
- `RESULT | chunk lengths | LONG: …`: a chunk longer than 31.5 s reached the server. The phone
  should have cut it into pieces: send the output and the Metro log.
- `does not decode`: send me the output; that's a broken chunk file.
