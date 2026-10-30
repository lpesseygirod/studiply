# Device checks for the iPhone recorder (step 5.1–5.4, iPhone half)

The iPhone records with expo-audio, which has native code: Expo Go and a development
build made before expo-audio was added can't run it (they keep the old `record/active`
screen). Build first:

    eas build --profile development-simulator --platform ios
    eas build --profile development --platform ios

Keep Metro's log for both lists.

## First, on Lea's iPhone: the camera during a recording (step 5.6, the riskiest)

The recording must never stop because a photo is taken (CLAUDE.md). iOS's camera screen
runs its own capture session while Studiply records; this is the one thing the web can't check.
Needs `npm run editor:build` and the EAS development build.

1. Start a recording; write a line in My notes; wait 40 s (one chunk joins).
2. Tap **Photo**:
   - the first time, iOS asks for the camera with "Studiply needs camera access to take photos of whiteboards and slides.";
   - take a photo of a board (or anything) and **Use Photo**.
3. **The recording goes on:** the timer kept running the whole time the camera was open, with no "Microphone disconnected" and no pause.
   - Metro's log has no `[recorder]` warning.
   - After Stop, `audio_chunks` in Supabase Studio has no gap around the photo's time.
   - Best: do this inside the 15-minute join test (`INSTRUCTIONS.md`); `joins.mjs` then shows no clicks missed around it.
4. **The photo:** a thumbnail on a line of its own right after the line being written, starting with the time of the tap. In Supabase Studio, `media` has a row with `lecture_id` and `t_ms`.
5. **Twice more:**
   - with the keyboard down (the photo goes on a new last line);
   - in Airplane mode (the thumbnail shows at once; the row and the file arrive once online).
6. **Camera refused** (Settings › Studiply › Camera off): Photo shows "Camera Access Needed … Open Settings", and the recording goes on.

If step 3 fails (the recording pauses or a gap shows), stop testing photos and tell Lea's advisor: the fallback is `expo-camera`, which is a new dependency and needs her OK.

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
9. **Marks (step 5.5,** after `npm run editor:build`**):**
   - each of Important, Confused and Exam opens its small sheet, also over the keyboard while writing;
   - Save mark gives a light haptic;
   - VoiceOver adjusts the slider one step at a time ("5 of 10");
   - a mark while writing goes at the end of the line; with the keyboard down, on a new last line with its time;
   - a tap on the chip changes its level; Remove mark, then Undo;
   - with Airplane mode on, a mark's chip shows at once; its row in `marks` (Supabase Studio) arrives once the phone is online and the edit is sent.
10. **The recording screen is the normal document (Lea, 30 Oct):**
    - the recording header (with ⋯) above the lecture's usual tabs, keyboard toolbar and Print layout / pageless setting; the title shown once;
    - typing with the keyboard open, then closed;
    - Summary opened while recording, then back to My notes; the recording goes on.
