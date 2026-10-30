# Device checks for the iPhone recorder (step 5.1–5.4, iPhone half)

The iPhone records with expo-audio, which has native code: Expo Go and a development
build made before expo-audio was added can't run it (they keep the old `record/active`
screen). Build first:

    eas build --profile development-simulator --platform ios
    eas build --profile development --platform ios

Keep Metro's log for both lists.

## iOS Simulator (EAS simulator build)

1. **First recording:** New recording asks for the microphone with "Studiply needs microphone access to record lectures."
   - **Deny** → "Microphone Access Required … Open Settings".
   - **Allow** → it starts.
2. **The new screen:** the 5.3 recording screen (timer chip, Course › folder, waveform moving with your voice, My notes, the bottom bar), **not** the old dark screen.
3. **The joins:** at 0:30 and 1:00, Metro must **not** show "iOS refused two recorders at once". Note it if it does.
   - Supabase Studio → `audio_chunks` gets a row about every 30 s, and each `start_ms` is about 500 ms before the previous row's end.
4. **Stamps:** type three lines in My notes; each new line starts with a time chip.
5. **Pause:** the timer and waveform stop. **Resume:** it carries on from the same time.
6. **Playback while recording:**
   - a chip older than 30 s plays (through the Mac's speakers), and the timer keeps running;
   - a chip from the last few seconds says "This moment is still being recorded …".
7. **Background:** ⇧⌘H (home) for 2 min, then come back. The timer has moved on and rows kept arriving.
8. **Offline:** turn the Mac's Wi-Fi off for 2 min. Recording continues and no rows arrive. Turn it back on and the missing rows arrive in order.
9. **Crash:** while recording, run `xcrun simctl terminate booted com.studiply.app`, then reopen the app.
   - The interrupted recording is offered; press Continue.
   - It carries on after the last finished chunk (at most 30 s lost); then Stop.
10. **Stop & summarize:** "Saving…", then transcribing. Afterwards a chip plays from Storage.
11. **Sign out** while recording asks you to stop first.

## Lea's iPhone (EAS development build, signed in to the local account)

1. **The 15-minute locked join test** with the laptop playing the click track: `INSTRUCTIONS.md` (beside this file). Keep the whole output of `joins.mjs`.
   - **Expected:** about 31 chunks; every JOIN line has about 10 clicks in both chunks and 0 in neither; `VERDICT | PASS`.
   - **Also:** no clicks missed inside a chunk. Preparing the next recorder re-sets the audio session while the current one records; if that caused a dropout, it would show here early in each chunk.
2. **Battery:** note the % before and after those 15 minutes.
3. **A call:** call the phone (or FaceTime audio) while recording.
   - It pauses with "Microphone disconnected · Resume" and never stops silently.
   - After the call, Resume carries on.
4. **Another app's sound:** play a video in another app during a recording. As with the call: it pauses with the message, never a silent stop.
5. **Playback:**
   - without headphones, a chip plays through the earpiece (quiet, expected) and the headphones hint shows once;
   - with headphones, it plays in them;
   - both times the recording carries on. Also with the ringer switch on silent.
6. **Offline:** Airplane mode for 2 min while recording, then off. The chunks upload afterwards, in order.
7. **Kill the app** from the app switcher mid-recording, then reopen: Continue works and at most 30 s is lost (Known issues in PROGRESS).
8. **After the lecture:** play the recording across a join. The time never goes back and nothing is heard twice.
