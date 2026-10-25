# Studiply — product design (desktop + iPhone)

Designed Oct 2026. This file describes the screens and interactions; `SUMMARY-SPEC.md` describes what goes into a summary and exactly how it is calculated (the 10 sliders, derived variables, mark bands, quality checks, JSON schemas). Both use the app palette in `src/constants/colors.ts`. If they ever disagree, ask Lea.

## Layout (desktop, ≥ 1024 px wide)
The mockups in `docs/design/` show how each screen **looks** (desktop-01 recording, desktop-04 library, desktop-05 settings, iphone-01…); this file says how it **works**.

A top bar over up to three columns, on the full gradient (`Colors.gradient`, top to bottom), with content on white cards:
1. **Top bar** (white, 56 px): logo (gradient tile) + "Studiply", then depends on the screen (below), avatar at the right.
2. **Left sidebar (library, 264 px):** New button, Recent, Starred, Exam packs, Review today (count badge), **Courses · drop files here** with a color square and count per course; the open course expands to show its files. Trash at the bottom. Every course and Trash is a drop target. On documents the search field sits here (under New).
3. **Center:** library screens use the full width; documents and settings sit in a centered column. A document has tabs `My notes · Summary · Transcript`, Export PDF, a Google-Docs-style formatting toolbar, and the page (white card, max width 820 px).
4. **Right panel (study assistant, 330 px):** Claude-style chat, **beside documents only**.

What the shell shows depends on the kind of screen:

| Screen | Top bar | Sidebar | Assistant |
|---|---|---|---|
| Library (My library, a course, Search, Review) | wide salmon search field, red **● Record lecture** button | yes | no |
| Document (a note, recording) | breadcrumb `Course › Document`, document title, "Saved · time", assistant toggle, Share | yes | yes |
| Settings | "‹ Back to library" and the page title | no | no |

The sidebar (☰ in the top bar) and the assistant (✦ in the top bar, × in the panel) collapse; each device remembers what is open. Below 1024 px the web shows the iPhone layout (tab bar, documents full screen); resizing switches live and keeps the open screen. A recording strip (Phase 5) sits between the top bar and the columns while recording.

On iPhone the same pieces stack: library is its own screen, the document is full screen, the assistant opens as a sheet. Full details in the **iPhone** section below. Every feature exists on both; the feature table in `BUILD-PLAN.md` ("Every feature, on iPhone and laptop") says how each one works on each device and which are v1 vs later.

## iPhone
The iPhone app is the main recording device (App Store). Same data, same features, adapted to one hand and a small screen.

**Navigation:** a white bottom tab bar **Library · Search · ● Record · Review · Settings** (docs/design iphone-01). Record is a big raised red circle (`Colors.recording`) with a white ring, exactly in the middle; the active tab is accent purple. Review holds quizzes, flashcards and Review today (a placeholder until the study phase). There is no Home screen: the app opens on Library. Documents and the recording flow (after its setup screen) open full screen without the tab bar, with a back button.

**Library:** on the gradient: big "Library" title, a dark round **+** (New) and the avatar; a salmon search field; chips Recent · Starred · Exam packs · Review today; **Courses** as a white card list (color square, name, count, chevron); **Recent** as small white cards (title, "Today · Summary ready"); hint "Long-press any item to rename, move or star it". Later: list or grid toggle; course folders with color dots; sections Recent, Starred, Exam packs, Review today (badge), Trash. Long-press a file → menu (Open, Rename, Move to…, Move out, Star, Summarize / Exam pack, Trash) and lift-to-drag onto a folder. Long-press empty space or the "…" button → New folder, New document, New recording, Upload slides/PDF, Paste, Sort. Undo toast after every move.

**Recording screen (portrait):**
- Top: course › lecture title, red dot + timer, live waveform.
- Middle: My notes editor (each new line gets a timestamp chip). The keyboard toolbar sits above the keyboard.
- Bottom bar, large thumb targets (≥ 56 px): ★ Important · ? Confused · Exam · Camera · Stop & summarize. Tapping a mark opens a small sheet: question, 1–10 slider with labeled ends, optional note, Save mark (light haptic on save).
- Assistant button opens the chat as a **half-height sheet** so notes stay visible; "Recording continues" badge; drag up for full height.
- Recording keeps running with the screen locked, in the background, during calls to the assistant, and without internet (chunks upload later).
- Later: Lock Screen / Dynamic Island Live Activity with timer and mark buttons; Action Button / Siri Shortcut to start recording.

**Document screen:** segmented control My notes · Summary · Transcript; "Aa" button opens a sheet with text styles (Title, Heading 1, Heading 2, Subheading, Normal, Quote) and size; keyboard toolbar (scrolls sideways): bold, italic, underline, strikethrough, color, highlight, lists, checklist, link; "+" menu for image, table, formula, comment, photo. Selecting text shows the iOS edit menu plus Ask Claude actions. Tapping a timestamp opens a mini audio player at the bottom. Share button → PDF via the iOS share sheet.

**Stop & summarize:** full-screen sheet: resources (notes locked on), the 10 sliders stacked in one column, presets as horizontal chips, Save as course default, then Generate. Progress shown while generating; the result opens in the Summary tab.

**Study:** Quiz me (tap to reveal), flashcards (swipe), push notifications for spaced review.

**System:** Dynamic Type, dark mode, VoiceOver labels on every control, permission prompts with clear reasons (microphone, camera, photos, notifications).

## Formatting toolbar
Undo, redo · text style (Title, Heading 1, Heading 2, Subheading, Normal text, Quote) · font · size − / + · Bold, Italic, Underline, Strikethrough (toggle state shown) · text color · highlight · bulleted, numbered, checklist · align · link · image · table · formula (∑, KaTeX) · comment · clear formatting.

## Recording flow
### 1. While recording
- A red strip under the top bar: "Recording · mm:ss", live waveform, mark buttons **★ Important**, **? Confused**, **Exam**, **Photo board**, and **Stop & summarize**.
- Tapping a mark button opens an inline panel (does not stop recording): the moment's time, a question, a **1–10 slider**, optional note, Cancel / Save mark.
  - Important: "How important is this?" (1 worth noting → 10 key idea).
  - Confused: "How lost are you?" (1 a bit unsure → 10 completely lost).
  - Exam: "How likely on the exam?" (1 maybe → 10 certain).
  - What each level does in the summary (low 1–3 / mid 4–7 / high 8–10, adjusted by the Follow my marks slider) is defined in SUMMARY-SPEC.md, "What each mark does". The panel shows a one-line hint of the effect.
- Saved marks appear in My notes as chips, e.g. `Confused 7/10`; tapping the chip edits the level.
- **My notes** is a normal rich-text document; every line typed is stamped with the recording time (shown as a small purple chip; tapping it replays the audio).
- The assistant panel shows a "Recording continues" badge.

### 2. Stop & summarize (modal)
- Header: "Summarize this lecture" + counts (minutes recorded, note lines, marks, assistant questions).
- **Extra resources** (checkbox grid): professor's slides, board photos, **My notes and marks — always included, cannot be unchecked**, questions to the assistant. Buttons: + Slides or PDF, + Photos, + From my library, + Link.
- **Tune your summary · 10 sliders (1–10)**, each with labeled ends:
  1. Your starting point — start from zero → I already know it
  2. Length — one page → everything
  3. Explanation depth — just the facts → every why and how
  4. Examples — none → one per idea
  5. Visuals & graphs — text only → visual-heavy
  6. Exam focus — understand it → only what's on the exam
  7. Self-test questions — none → full practice set
  8. Language — plain words → technical terms
  9. Extra resources — lecture only → lean on slides & readings
  10. Follow my marks — ignore them → follow them closely
- Presets: First time learning, Quick review, Exam tomorrow, Reset. **Save as course default**.
- Note: "The summary is written into this document (Summary tab). Your notes stay untouched in My notes."
- Buttons: Keep recording · **Stop & generate summary**.
- The 10 values are sent to the API as numbers; the summarize Edge Function turns them into derived variables (target words, takeaways, examples, self-test size…) exactly as in SUMMARY-SPEC.md, "How Claude builds the summary".

### 3. Summary in the same document
- Green banner: "Summary added to this document · Built from your notes (all N lines, M marks) + audio · slides · photos · your questions" + **Extend with next lecture**.
- At the top of the Summary tab: "All your notes are in this summary · N of N lines and M of M marks used".
- The student's notes appear as green **From your notes** blocks, keeping their formatting; Confused marks become "You were confused here · 7/10 · mm:ss" explanation blocks; Important/Exam levels show as chips on the matching section.
- "Your questions during class" block at the end, linking to the saved assistant answers.

## Study assistant (Claude-style chat)
- Header: icon, "Study assistant", "Knows this lecture up to mm:ss", "Recording continues" badge while recording.
- Messages: the student's in a rounded light bubble (right), the assistant's as plain full-width text with Copy, Retry, **Add to notes**, **Flashcards** under each answer.
- Quick prompts above the composer: Explain the last 10 min · What did she just say? · Define the last term · Am I missing something?
- Composer: rounded box, multi-line, Enter sends / Shift+Enter new line, + attach, "Context: this lecture" chip, send arrow (disabled grey until text).
- Answers use the live transcript (time-windowed: "last 10 min" = now−10 min → now), cite timestamps, stream in, and are saved as Q&A into the lecture.

## Library (Finder / Drive)
- Breadcrumb `My library › Course`; Sort (Kind, Name, Date edited); grid of tiles (folder, document, recording, PDF icons) with name + meta.
- **Drag & drop:** drag any item onto a folder tile (dashed purple highlight) to move it in; onto "My library" in the breadcrumb to move it up; onto a course in the sidebar; onto Trash. Folders cannot be dropped into themselves or their children.
- **Click or right-click empty space** → menu: New folder (⇧⌘N), New document (⌘N), New recording (⌘R), Upload slides or PDF, Paste, Sort by name, Sort by date edited.
- **Right-click an item** → Open, Rename, Move out to My library, Star, Summarize recording / Make exam pack, Move to Trash.
- New folder appears as "Untitled folder" in inline rename mode (Enter saves, Esc cancels).
- Double-click opens a folder. After every move: toast "Moved 'X' to Y" with **Undo** (reuse `UndoToast.tsx`).
- iPhone: long-press an item to drag; long-press empty space or tap "…" for the same menus; reuse `MoveToModal.tsx` as the accessible alternative to dragging.

## Accessibility basics
Real buttons/inputs with labels, 44 px touch targets, text contrast ≥ 4.5:1, never color alone (marks have labels), Dynamic Type on iOS, keyboard shortcuts on web.
