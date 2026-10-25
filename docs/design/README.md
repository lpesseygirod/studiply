# Studiply design mockups (Oct 2026)

Pictures of the design canvas. They show how the app should LOOK; `docs/DESIGN.md` says how it WORKS. If a picture and DESIGN.md disagree, ask Lea.

## Look
- Background of every main screen: the full splash gradient (`gradient` in `src/constants/colors.ts`: #B8B5E4 → #C9A8D4 → #D4A0A0 → #E8B4A0 → #F0C890 → #E8A850), top to bottom.
- Content sits on white cards (radius 14–18 px on laptop, 16–22 px on iPhone). The document page is a white sheet, max 820 px wide.
- Secondary text: #3A3A48 (readable on the gradient). Primary buttons: #1A1A2E. Record: #CC3333. Accent: #7B6FD4 / #EAE8F7 / #4F43B0. Inputs: salmon #F5E0D8 with #E8B4A0 border.
- Marks: Important #FFE4B5 / #7A4A00, Confused #EAE8F7 / #4F43B0, Exam #F5E0D8 / #8A3B22. "From your notes" blocks: #E8F5EE / #1F6B45.
- System font. Touch targets ≥ 44 px (mark buttons on iPhone ≥ 56 px).

## Laptop (web)
- desktop-01-recording: recording strip, mark buttons, mark slider panel, notes with timestamp chips, formatting toolbar, assistant chat.
- desktop-02-stop-and-summarize: extra resources (notes always included), 10 sliders, presets.
- desktop-03-summary-in-document: green banner, Extend with next lecture, Summary tab with "From your notes" and "You were confused here" blocks.
- desktop-04-library: Finder/Drive-style library.
- desktop-05-settings: Settings (Account shown; also Summaries, Recording, AI & privacy, Storage & sync, Notifications, Appearance, Your data).
- desktop-06-sign-in, desktop-09-ai-consent: sign in and AI consent.
- desktop-07-review-quiz, desktop-08-review-flashcards: Review.

## iPhone
- iphone-01-library … iphone-06-summary: library, recording, mark sheet, assistant sheet (recording continues), Stop & summarize, summary.
- iphone-07-settings, iphone-08-ai-privacy, iphone-09-search, iphone-10-review, iphone-11-welcome, iphone-12-ai-consent.
- Tab bar: Library · Search · Record (red center) · Review · Settings.

Mockup data (Psicobiología, Tema 1, counts, usage numbers) is sample content, not real.

## Wording that changed after the mockups
- **Starred → Favorites** (Lea, Oct 2026): the mockups say "Starred" (iPhone chip, laptop sidebar) and "Long-press any item to rename, move or star it". The app says **Favorites**, the menus say **Add to Favorites / Remove from Favorites**, the toast says **Added to Favorites · Undo**, and the hint says "…rename, move or add it to Favorites". The database column stays `starred_at`.
