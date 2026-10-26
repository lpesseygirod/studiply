# Studiply — product design (desktop + iPhone)

Designed Oct 2026. This file describes the screens and interactions; `SUMMARY-SPEC.md` describes what goes into a summary and exactly how it is calculated (the 10 sliders, derived variables, mark bands, quality checks, JSON schemas). Both use the app palette in `src/constants/colors.ts`. If they ever disagree, ask Lea.

## Layout (desktop, ≥ 1024 px wide)
The mockups in `docs/design/` show how each screen **looks** (desktop-01 recording, desktop-04 library, desktop-05 settings, iphone-01…); this file says how it **works**.

A top bar over up to three columns, on the full gradient (`Colors.gradient`, top to bottom), with content on white cards:
1. **Top bar** (white, 56 px): logo (gradient tile) + "Studiply", then depends on the screen (below), avatar at the right.
2. **Left sidebar (library, 264 px):** New button, Recent, Favorites, Exam packs, Review today (count badge), **Courses · drop files here** with a color square and count per course; the open course expands to show its files. Trash at the bottom. Every course and Trash is a drop target. On documents the search field sits here (under New).
3. **Center:** library screens use the full width; documents and settings sit in a centered column. A document has tabs `My notes · Summary · Transcript`, Export PDF, a Google-Docs-style formatting toolbar, and the page (white card, max width 820 px).
4. **Right panel (study assistant, 330 px):** Claude-style chat, **beside documents only**.

**Sidebar data (step 2.2):** Recent, Favorites and Exam packs open Library at that section (`/library?section=recent|favorites|exam-packs`); Review today opens Review and its badge counts reviews due by the end of today (hidden when 0, and offline). A course's count is its items of every kind (lectures, PDFs, images, …), not in Trash. The open course (the one the current screen or document is in) expands to its folders and files: a chevron opens a folder; the folder the student is in opens on the way down; the open item is highlighted. Right-click a course or an item in the sidebar for its menu (Open, Add to / Remove from Favorites). Clicking an item opens it where it lives: a lecture its notes (or post-session before it has notes), a folder its course at that folder (`/project/<id>?folder=<folder>`), and a PDF or image its course at its folder until files get a viewer.

What the shell shows depends on the kind of screen:

| Screen | Top bar | Sidebar | Assistant |
|---|---|---|---|
| Library (My library, a course, Search, Review) | wide salmon search field, red **● Record** button (VoiceOver: "Record lecture") | yes | no |
| Document (a note, recording) | breadcrumb `Course › folder › …` (each crumb opens the course at that level), document title, "Saved · 10:31" / "Saving…" / "Not saved", assistant toggle, Share | yes | yes |
| Settings | "‹ Back to library" and the page title | no | no |

The sidebar (☰ in the top bar) and the assistant (✦ in the top bar, × in the panel) collapse; each device remembers what is open. Below 1024 px the web shows the iPhone layout (tab bar, documents full screen); resizing switches live and keeps the open screen. A recording strip (Phase 5) sits between the top bar and the columns while recording.

On iPhone the same pieces stack: library is its own screen, the document is full screen, the assistant opens as a sheet. Full details in the **iPhone** section below. Every feature exists on both; the feature table in `BUILD-PLAN.md` ("Every feature, on iPhone and laptop") says how each one works on each device and which are v1 vs later.

## iPhone
The iPhone app is the main recording device (App Store). Same data, same features, adapted to one hand and a small screen.

**Navigation:** a white bottom tab bar **Library · Search · ● Record · Review · Settings** (docs/design iphone-01). Record is a big raised red circle (`Colors.recording`) with a white ring, exactly in the middle; the active tab is accent purple. Review holds quizzes, flashcards and Review today (a placeholder until the study phase). There is no Home screen: the app opens on Library. Documents and the recording flow (after its setup screen) open full screen without the tab bar, with a back button.

**Library:** on the gradient: big "Library" title, a dark round **+** (New) and the avatar; a salmon search field; chips Recent · Favorites · Exam packs (each shows that section's list in place of the overview; tap again to go back) · Review today (opens Review, shows the due count); **Courses** as a white card list (color square, name, count, chevron); **Recent** as small white cards of every kind (title, "Today · Summary ready", "Monday · PDF"); hint "Long-press any item to rename, move or add it to Favorites". Later: list or grid toggle; course folders with color dots; sections Recent, Favorites, Exam packs, Review today (badge), Trash. Long-press a file → menu (Open, Rename, Move to…, Move out, Add to Favorites, Summarize / Exam pack, Trash) and lift-to-drag onto a folder. Long-press empty space or the "…" button → New folder, New document, New recording, Upload slides/PDF, Paste, Sort. Undo toast after every move.

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
- **Built in step 3.2 (inside a course):**
  - **Header:** "My library › Course › Folder · N items" (every part clickable; "My library" goes to Library); **Sort** Kind / Name / Date edited (folders always first, natural name order); on the iPhone a **grid/list** toggle. Sort and view are remembered per device.
  - **No toolbar** (Lea, after step 3.4): a course has no button row. New folder, Upload document, Take photo and Record are in **"+ New"** (laptop sidebar) and the **empty-space menu** (right-click on the laptop, **"…"** or long-press on the iPhone); Record is also the top bar's red button (laptop) and the tab bar's (iPhone). An empty folder says "Use + New or right-click here…" (laptop) or "Tap ••• …" (iPhone).
  - **Upload (built in step 3.4):** photos and PDFs become **files in the open course or folder** (not in a lecture). Laptop: one file picker for PDFs and images, several at a time; iPhone: Photos, PDF (Files) or Take photo. Photos are stored as JPEG; PDFs up to 50 MB; anything else is refused ("Only PDFs and photos for now"). PDFs and picked photos keep their name; a camera photo is "Photo 26 Oct 10.42.jpg". While it runs the breadcrumb line says "· Uploading 2 of 5…", then the toast "Added 3 files to Tema A" with Undo (to the Trash). On the iPhone without a connection the tiles show at once with "Waiting to upload" and are sent later. Laptop: files dragged in from the Finder onto a folder tile, a breadcrumb part, a sidebar course or folder or the empty grid are uploaded there; ⌘V adds a copied image or PDF (a screenshot) here.
  - **Tiles:** a folder shows "7 items" (or "Empty"); a lecture shows a red mic with its state until processed, then a notes icon and its length ("1 h 32 min"); PDFs, images and documents show "Edited today / yesterday / 3 days ago / 23 Oct"; images show their thumbnail.
  - **Opening:** iPhone: tap opens, long-press = the menu. Laptop: a click selects, a double-click or Enter opens, Esc clears the selection, right-click = the menu.
  - **New folder** appears as "Untitled folder" with its name selected; Enter or clicking/tapping elsewhere saves, Esc cancels (nothing created). **Rename** on a folder edits the name in place the same way. Names: spaces trimmed, not empty, at most 200 characters (the same rule as lecture titles).
  - **"+ New"** (sidebar button on the laptop, the round **+** on the iPhone Library): a small menu anchored under the button (like Google Drive's New), an action sheet on the iPhone: **New course** · **New folder** · **Upload document** (PDFs and photos) · **Record** · **New document**. New folder and Upload work in the open course/folder; elsewhere they are greyed out with "Open a course or folder first". New document is greyed out with "Coming soon" until Phase 4. Record opens the recording setup with the open course chosen. Short labels: "Record" everywhere on screen (menus, top bar, shortcuts sheet); VoiceOver reads "Record lecture" on the laptop's menus and buttons (iPhone action sheets can't carry a separate label).
  - **New course:** a small dialog (340 px) next to the button that opened it on the laptop, centred on the iPhone: name field, the six course colours, Cancel / Create (Enter creates, Esc cancels). Creating opens the new course.
  - **Item menus:** the same menu for an item wherever it is right-clicked or long-pressed (the grid, the laptop sidebar, Library's Recent and sections): **Open · Rename… · Move to… · Move out · Cut · Copy · Add to / Remove from Favorites · Summarize / Make exam pack · Export PDF · Delete** (step 3.4). **Move out** (only inside a folder) moves it up one level, with Undo. **Copy** works for PDFs and photos; on lectures and folders it is greyed out "Coming soon". **Summarize** (lectures) and **Make exam pack** (folders, courses) are greyed out "Coming in a later update" until Phase 7. Export PDF is for lectures; a course has no Move to…, Move out, Cut or Copy; documents, exam packs and a lecture's own photos keep Open and Favorites until their phases. In the grid a folder's **Rename** edits the name on the tile; elsewhere Rename… opens a dialog. Delete asks first ("Delete Course / Folder / Lecture / File") and offers Undo.
  - **Empty space** in a course (right-click on the laptop; long-press or the **"…"** button in the header on the iPhone), like Finder: **New folder · New document** (greyed out "Coming soon" until Phase 4) **· Record · Upload document · Take photo** (iPhone) **· Paste · Sort by…** (Kind / Name / Date edited, the current one ticked).
  - **Cut / Copy / Paste (step 3.4, one item at a time until multi-select):** Paste reads "Paste 'Notas.pdf'". After **Cut** it moves the item here (the same rules and Undo as dragging; the clipboard empties); after **Copy** it makes a real copy of a PDF or photo here ("Notas copy.pdf", its own file; Undo deletes it; the clipboard stays, to paste again). With nothing cut or copied, Paste is greyed out "Nothing to paste". The clipboard is the app's own (not the system's), so on the iPhone it pastes items only.
  - **The title's menu:** the title at the top of a course or folder (the last breadcrumb part) has a small **⌄**; tapping it (iPhone), clicking or right-clicking it (laptop) opens the menu of the course or folder you're in, the same as on its tile without Open: **Rename… · Move to…** (folders) **· Add to / Remove from Favorites · Delete**. Rename… opens a dialog and the title follows; after Move to… another course the screen follows the folder there; after Delete the screen goes up one level (a course: back to the Library), with Undo still showing.
  - **Wording:** the UI says **Course** everywhere (never "Project"); the code keeps `project` names for now.
  - **Photos & PDFs from lectures:** a collapsible list under the grid (photos and PDFs added to real lectures). Uploads made before step 3.4 (in a hidden "Project Files" lecture) became files in their course with migration `20261026090300`.
- Breadcrumb `My library › Course`; Sort (Kind, Name, Date edited); grid of tiles (folder, document, recording, PDF icons) with name + meta.
- **Drag & drop (built in step 3.3):** drag a folder, lecture, PDF or image (a tile, a list row, an item in the sidebar's course tree) onto a folder tile (dashed purple highlight) to move it in; onto a breadcrumb part above the current level to move it up there; onto a course or folder in the sidebar; onto Trash (no question, Undo; the Delete menu item still asks). "My library" in the breadcrumb is not a target (items outside every course aren't shown anywhere yet). Folders cannot be dropped into themselves or their children: such a target shows no highlight ("not allowed" pointer on the laptop; on the iPhone the drag preview says why), and nothing moves. After every drop: "Moved 'X' to Y" with **Undo**; **⌘Z / Ctrl+Z** on the laptop undoes the last move, delete or favourite (one level, also after the toast has gone; not while typing in a field).
  - **Laptop:** the browser's own drag (native drag image, the page scrolls while dragging). Files dragged in from the Mac's Finder are uploaded where they are dropped (step 3.4).
  - **iPhone:** hold an item to lift it (light haptic), move it onto a folder or the breadcrumb, let go (haptic). Tap still opens; hold and release still shows the menu. The list scrolls when the finger nears the top or bottom. The iPhone has no Trash target (Delete is in the menu). VoiceOver opens an item and shows its menu (Move to… is the accessible alternative to dragging).
  - **A lecture's photos and PDFs** ("Photos & PDFs from lectures"): one **Move to…** that lists folders and lectures: a lecture moves it there; confirming on a course or folder moves it out of its lecture as a library file (a move, not a copy). Dragging one onto a folder, course or breadcrumb does the same; it can't go to Trash (deleting a lecture photo is permanent, so it stays in its menu). **Save a copy to library…** keeps the copy option.
- **Click or right-click empty space** → menu: New folder (⌥⇧N), New document (⌥N), New recording (⌥R), Upload slides or PDF, Paste, Sort by name, Sort by date edited.
- **Right-click an item** → Open, Rename, Move out to My library, Add to Favorites, Summarize recording / Make exam pack, Move to Trash.
- **Favorites** (built in step 2.2; the database column is `starred_at`): "Add to Favorites" / "Remove from Favorites" in the menus of everything: courses, folders, lectures, documents, library files (PDF, image) and the photos/PDFs inside a lecture (the course's Project Files, post-session, the note's Source Files), on the iPhone (long-press), the laptop (right-click) and in the laptop sidebar. In the Favorites list a lecture's photo or PDF shows with its lecture ("Photo 2 · Clase 1") and opens that lecture. **Adding or removing a favorite never reorders anything**: it doesn't change an item's "last edited" time, so Recent and the course list stay as they were. Photos are numbered within their lecture, oldest first, on every screen. Online only (offline: the "you're offline" message, nothing changes). The toast says "Added to Favorites" / "Removed from Favorites" with **Undo**, which puts the previous value back. The Favorites section lists everything in it, newest first; empty: "No favorites yet".
- **Recent** (step 3.5): files of every kind, **last opened or edited** first, like Finder and Drive. Opening a lecture (its notes or post-session) or a library file puts it at the top; opening never changes its "Date edited", so the grid's Date-edited sort and the course list keep their order (the same rule as Favorites). Offline the iPhone's Recent follows what was opened on it.
- **Recently Deleted** (Trash; Settings → Recently Deleted, the laptop sidebar's Trash; step 3.5): each row has its kind's icon, its name, "{Kind} · from {Course › Folder}" and "Deleted 3 days ago · 27 days left". What was deleted together with its folder or course is listed once, under that folder or course (restoring it brings everything back). **Restore** puts it back where it was (its parents too) with the toast "Restored 'X' to Math › Tema 1" and **Undo** (deletes it again); the library and sidebar show it at once. **Delete forever** (trash icon) and **Empty** ask first. Items are removed for good **30 days** after deletion by a nightly job on the server (03:15 UTC), with their recordings, photos and PDFs; signing in also clears anything overdue, as a backup. A photo moved out of a lecture is never taken along with that lecture.
- **Search** (step 3.5, docs/design iphone-09; iPhone Search tab, laptop search page from the top-bar field or "/"): a salmon field, chips **All · Notes · Transcripts · Titles**, the count line "5 results in 2 courses", then one white card of results: the course colour square, the title, a badge saying what was found (**Transcript 18:22**, **Summary**, **Key concept**, **Definition**, **Formula**, **Term**, or the kind for titles: Course, Folder, Lecture, PDF, Image…) and the text around the match with the word marked (`colors.found`, a light amber; a dimmed amber in dark mode). It looks in titles (courses, folders, lectures, PDFs, photos, documents, exam packs), notes (title, summary, key concepts, definitions, formulas), terms (a key concept's or definition's term, until the glossary in Phase 7) and transcripts (up to 3 lines per lecture, earliest first). Case and accents don't matter ("filogenetico" finds "filogenético", "collegi" finds "col·legi"); 2 letters or more. Nothing in the Trash is found. **Opening a result:** a course or folder opens there; a PDF or photo opens its course at its folder (as its tile does from Library); a lecture opens its notes with the word marked in the summary, concepts, formulas, definitions and transcript, scrolled to the first match; a transcript hit opens the transcript line by line with times, scrolled to its own line. **Offline on the iPhone** it searches what is on the iPhone (every title and note, and the transcripts it has downloaded) and says "Searching only what's on this iPhone"; the laptop needs a connection ("Search needs a connection.").
- New folder appears as "Untitled folder" in inline rename mode (Enter saves, Esc cancels).
- Double-click opens a folder. After every move: toast "Moved 'X' to Y" with **Undo** (reuse `UndoToast.tsx`).
- iPhone: long-press an item to drag; long-press empty space or tap "…" for the same menus; reuse `MoveToModal.tsx` as the accessible alternative to dragging.

## Accessibility basics
Real buttons/inputs with labels, 44 px touch targets, text contrast ≥ 4.5:1, never color alone (marks have labels), Dynamic Type on iOS, keyboard shortcuts on web.

As built in step 2.3:
- **Colors** come only from `src/constants/colors.ts` (a test fails on any other color literal). Every text/background pair is checked for 4.5:1 in both appearances, icons and the Record button for 3:1 (`src/constants/__tests__/contrast.test.ts`).
- **Dark mode** (Settings → General → Appearance: System / Light / Dark, remembered per device): the same gradient dimmed by about a fifth (`#8F8BC4 → #9F86B0 → #AA7F7F → #BB8D7E → #C3A06F → #BC8740`) with dark text on it (`#14141F`), dark-grey cards `#262533` with light text `#F2F1F6`, rows `#302F3E`, borders `#454457`, search fields a dimmed salmon `#C99A8C` with dark text. The recording screen stays dark in both; the printed PDF stays light.
- **Icon-only buttons** (`IconButton`) are at least 44×44 pt and always have a label for VoiceOver; inside small chips they keep their size and reach 44 with an invisible touch margin.
- **Larger Text** scales all text; only tab labels (1.3×), the Library chips (1.6×) and the recording timer (1.2×) are capped, where a fixed shape must hold.
- **Keyboard (web):** ⌥N new document (coming with the editor), ⌥⇧N new folder in the open course, ⌥R record lecture (with the current course), "/" search, "?" the shortcuts sheet (also Settings → General), ⌘Z / Ctrl+Z undo the last move, delete or favourite, ⌘X / ⌘C / ⌘V cut, copy, paste the selected item (⌘V also adds a copied image or PDF; with no tile selected or text selected they stay the browser's), ⇧F10 or the Menu key the selected item's menu (or the empty space's), Esc closes. **In a menu:** the first available item has the focus; ↑ / ↓ / Tab move (skipping greyed-out items, wrapping), Home / End, Enter or Space chooses, and the focus goes back where it was when it closes. Option combinations are matched by key position, "/" and "?" by the character typed; nothing fires while typing in a field, with a dialog open, or with ⌘/Ctrl (browser shortcuts stay the browser's).
