# Studiply — Lecture Summary Spec

Oct 23, 2026 · @Lea

## Principles

A Studiply summary should let a student understand a 90-minute lecture in 5 minutes, then revise it for an exam without re-listening. Every design choice below serves one of five rules.

1. **Answer first.** The 3–5 key takeaways sit at the top; detail comes after. A student skimming the night before an exam reads only that block.
2. **Scannable before readable.** Clear heading levels, short paragraphs (≤ 3 sentences) and bolded key terms let the eye jump to what it needs.
3. **Built for recall, not just reading.** Self-test questions at the end turn the summary into a revision tool. Active recall beats rereading.
4. **Trace back to the source.** Every section carries the lecture timestamp it came from, so a student can replay the exact moment.
5. **One system, two outputs.** The in-app view (iPhone and laptop) and the exported PDF share the same structure and styles; only size and color depth change.
6. **The student's notes are the backbone.** Everything the student wrote and marked during class is always in the summary, in their own words and formatting, and Claude builds around it.
7. **The student steers.** Ten sliders, the 1–10 level on every mark and the questions asked to the assistant tell Claude what this student needs; the summary follows them, not a fixed template.

## What research says

A summary on its own is a weak study tool; it becomes a strong one when it is built around self-testing and visuals that match the content. That finding shapes every template below.

| Finding | Evidence | What Studiply does with it |
| --- | --- | --- |
| Self-testing and spaced review work best; summarizing, highlighting and rereading work poorly on their own | [Dunlosky et al. 2013](https://scholars.duke.edu/publication/954654) rated 10 techniques: practice testing and distributed practice got high utility; summarization, highlighting and rereading got low utility | Every summary ends in a self-test; the app schedules review reminders (day 1, 3, 7, 21). Bold is limited to key terms, never whole sentences |
| Explaining *why* helps | Same review: elaborative interrogation and self-explanation got moderate utility | Self-test mixes recall questions (“What is…”) with why/how questions (“Why does… lead to…”) |
| Visual maps improve retention | [Nesbit & Adesope 2006](https://www.sfu.ca/~jcnesbit/research/nesbitadesope2006.htm): 55 studies, 5,818 students; concept maps associated with better knowledge retention. A [2024 meta-analysis](https://link.springer.com/article/10.1007/s10648-024-09877-y) found a moderate effect in science (g = 0.776) | Timelines, concept maps, process diagrams and comparison tables are first-class blocks, not decoration |
| The visual must fit the logic of the content | Each [graphic organizer encodes one kind of relationship](https://flipeducation.ai/teaching-wiki/graphic-organizers) (sequence, cause–effect, comparison, hierarchy); picking one for looks is the most common misuse | Claude picks the block by relationship: dates → timeline, causes → chain, alternatives → comparison table |
| Turning notes into cue questions builds recall | The [Cornell method](https://casrai.org/study-skills/cornell-notes) splits notes into a cue column, notes and a summary; covering the notes and answering from cues is retrieval practice. Little research tests Cornell itself | In the app, each section has a “Quiz me” toggle that hides the content and shows the cue question |
| Different subjects need different formats | [Study-skills guides](https://www.notelyn.com/pl/blog/study-notes-template) recommend outlines for hierarchical subjects, charts for comparisons, Cornell for lecture-heavy courses | Subject templates (next sections) |

## Section structure

Every summary follows the same 12 sections in the same order, so students always know where to look. Sections marked optional only appear when the lecture has that content; never render an empty section. Sections 5–9 are where the subject modules go (see Summary types by subject).

| # | Section | What it contains | Required |
| --- | --- | --- | --- |
| 1 | Header | Course name, lecture title, lecture number, date, professor, duration, what it was built from (notes, audio, slides, photos, questions) | Yes |
| 2 | Notes check | One line: “All your notes are in this summary · N of N lines and M of M marks used” | Yes |
| 3 | Key takeaways | 3–5 one-sentence bullets; every Important mark at the high band lands here | Yes |
| 4 | Outline | Main sections with timestamps; for lectures over 45 min or when Length ≥ 7 | Optional |
| 5 | Main content | One block per topic, in lecture order: heading, short paragraphs, key terms in bold, timestamp `[12:34]`, the student's notes woven in as **From your notes** blocks, Confused moments as **You were confused here** explanations, mark chips (Important 8/10) on the matching heading | Yes |
| 6 | Key terms | Glossary table: term · one-line definition | Optional |
| 7 | Formulas | Numbered display formulas, each with what every variable means | Optional |
| 8 | Worked examples | Problems solved step by step, as the professor did them | Optional |
| 9 | Exam signals | What the professor flagged plus every Exam mark at the high band, with its level | Optional |
| 10 | Your questions during class | Each question asked to the assistant, its short answer and timestamp | When questions exist |
| 11 | Self-test | Number and type set by the Self-test slider; answers hidden in the app, on the last page in the PDF | Yes, unless slider = 1 |
| 12 | Logistics & gaps | Deadlines or readings mentioned; parts the transcript couldn't catch clearly | Optional |

**Callouts** sit inside Main content wherever relevant, not in their own section: Definition, Example, Exam signal, Warning (common mistake), **From your notes** (green, the student's own text and formatting), **You were confused here** (salmon, with the mark level and time) and Added context (anything not from the lecture). Each has a small label, so meaning never depends on color alone.

**Length rule:** the Length slider sets the target, as a share of the transcript's word count (see “How Claude builds the summary”). At the default (5) a 90-minute lecture (\~12,000 words spoken) becomes about 1,400 words, 3–4 PDF pages. The student's notes never count against the limit.

## Summary types by subject

Every summary keeps the same core (Header, Key takeaways, Main content, Self-test), and the subject decides which **modules** fill the middle. A history lecture gets a timeline; a calculus lecture gets formula cards and worked examples. Claude can mix modules when a lecture crosses types.

### Module library

| Module | What it looks like | Relationship it shows |
| --- | --- | --- |
| Timeline | Vertical line with dated events; each event has a title, 1 line, and its importance | Sequence in time |
| Cause → effect chain | Boxes linked by arrows: causes → event → consequences | Causation |
| Key figures | Table: person · role · what they did · why it matters | Who |
| Formula card | Boxed formula, variable legend underneath, “when to use it” line | Rule to apply |
| Worked example | Problem, numbered steps with the reason for each step, boxed answer | Procedure |
| Graph / model | Labeled axes, curves, and what shifts them (e.g. IS–LM, supply–demand) | How variables move together |
| Comparison table | Items as columns, criteria as rows | Alternatives side by side |
| Concept map | Central idea with linked sub-concepts and labeled links | Hierarchy, connections |
| Process steps | Numbered stages with inputs and outputs | Order of operations |
| Framework grid | Filled template: SWOT, 4P, Porter's 5 forces, with the class example in each cell | Applying a model |
| Theory / study card | Author, year, claim, method, finding, critique | Evidence for an idea |
| Case card | Facts, question, decision or ruling, reasoning, lesson | Applying rules to a situation |
| Argument map | Claim, supporting premises, objections, replies | Debate |
| Code block | Syntax-highlighted code with line comments and expected output | Implementation |
| Common mistakes | Warning callouts: wrong way, right way | Pitfalls |
| Vocabulary table | Term, translation or meaning, example sentence | Language |

### Templates by subject

| Subject type | Examples | Signature modules (in order) | Self-test style |
| --- | --- | --- | --- |
| History & politics | History, international relations, political science | Timeline → Cause → effect chain → Key figures → Comparison table (periods, ideologies) | Dates, “why did X happen”, “what changed after Y” |
| Mathematics | Calculus, linear algebra, statistics | Definitions & theorems → Formula cards → Worked examples → Common mistakes | Practice problems with full solutions |
| Finance & economics | Corporate Finance, Macroeconomics, accounting | Formula cards → Graph / model → Worked example with real numbers → Cause → effect chain (“if rates rise…”) | Calculation problems + intuition questions |
| Natural sciences | Biology, chemistry, physics | Process steps → Concept map → Formula cards → Experiment (aim, method, result) | Label the process, explain the mechanism |
| Law | Contract law, constitutional law | Rule & elements → Case cards → Exceptions → Comparison table (doctrines) | Apply the rule to a short scenario |
| Business & marketing | Marketing, strategy, management | Framework grid → Company examples → Comparison table → Key terms | Apply the framework to a new company |
| Psychology & social sciences | Psychology, criminology, sociology | Theory / study cards → Comparison table (theories) → Key terms → Critique points | Match study to theory, evaluate a theory |
| Programming & tech | C programming, cloud computing | Code blocks → Process steps (commands) → Common mistakes → Key terms | Predict the output, find the bug |
| Languages & literature | Spanish, French, literature | Vocabulary table → Grammar rules with examples → Themes & characters → Key quotes | Translate, fill the gap, analyze a passage |
| Philosophy & discussion | Ethics, seminars, case-method debates | Argument map → Key figures (who argued what) → Comparison table | Reconstruct an argument, give an objection |

### How the type is chosen

1. When a student creates a course, they pick its subject type once (Studiply suggests one from the course name).
2. For each lecture, Claude confirms or overrides it from the transcript and can add modules from other types; a finance lecture on the 2008 crisis gets a Timeline too.
3. The student can switch the template after generation; Claude regenerates only the middle modules from the stored transcript, keeping the header, takeaways and self-test.

## Graphs and visuals

Graphs are needed, but only where the content has a shape that text hides: a curve, a trend, a sequence, a structure. A visual that only repeats the text makes the summary worse, not better. The rule: at most one visual per section, and only when it shows a relationship that a sentence can't.

### Design rules from multimedia research

These come from [Mayer's principles of multimedia learning](https://resolve-he.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E), the main research base for words-plus-pictures learning.

| Principle | What it says | Rule for Studiply |
| --- | --- | --- |
| Multimedia | Words plus pictures beat words alone | Add a visual when a section has a shape (curve, sequence, structure) |
| Coherence | Extra, irrelevant material hurts learning | No decorative images, stock photos or 3D charts |
| Signaling | Cues that show what matters help | The graph title states the takeaway: “Investment falls as rates rise”, not “Graph 1” |
| Spatial contiguity | Words and pictures belong next to each other | Label curves directly on the graph (no legends); place the visual right after the paragraph that explains it, never in an appendix |

### Which visual for which content

| Content shape | Best visual | Example | When text is better |
| --- | --- | --- | --- |
| A function or equation | Function plot drawn from the formula | Calculus: f(x) = x² − 4, with roots and vertex marked | Only the formula itself matters, not its shape |
| An economic or theoretical model | Schematic graph with shift arrows, no real numbers | Supply–demand shift, IS–LM, cost curves | Never; models are taught as graphs |
| Numbers over time | Line chart | GDP growth 2007–2012 quoted in Macro | Fewer than 5 values → one sentence |
| A few numbers compared | Table or sentence | Interest rates of 3 banks | Always, under 5 values |
| Many numbers compared | Bar chart, sorted | Market share of 8 brands | — |
| Parts of a whole | Stacked bar (pie only with ≤ 3 slices) | Budget split | 2 parts → a sentence (“70% / 30%”) |
| A distribution | Histogram or normal curve with shaded area | Statistics: P(Z < 1.96) | — |
| Events in time | Timeline | History, company history | 2 events → a sentence |
| Causes and effects | Cause → effect chain | Causes of the 2008 crisis | One cause, one effect → a sentence |
| A process or algorithm | Flow diagram | Cell division, a C loop, an Azure deployment | A straight list of 3 steps → numbered list |
| A hierarchy or connections | Tree or concept map | Taxonomy, org structure, theory families | — |
| A physical structure or place | Real image or map | Anatomy, molecule, circuit, historical map | — |

### Where the visual comes from

This is the hard part: Whisper hears the lecture but never sees the whiteboard or slides. Studiply uses four sources, in order of reliability.

1. **Drawn from a formula.** Claude outputs the expression; the app plots it with a math library. Exact every time.
2. **Drawn from a template.** For standard models (supply–demand, IS–LM, normal curve), Claude only picks the template and which curve shifts; the app draws it. Claude never free-draws a graph.
3. **Drawn from spoken numbers.** When the professor reads out figures, Claude returns a chart spec with the values and their timestamp. Values not in the transcript are never invented; they go to `unclear` instead.
4. **Captured by the student.** A camera button during recording snaps the board or slide, stamped with the time; it appears next to the matching section. Students can also import the professor's slide PDF. Claude can read these images to improve the summary, which needs the same consent as the audio.

Never use AI image generation for academic diagrams: it invents labels and gets details wrong.

### Graph style

- Same color palette as the rest of the summary; maximum 3 series per graph.
- Axes always labeled, with units. Takeaway as title, timestamp in the caption.
- In the PDF: vector graphics (SVG), and lines also differ by style (solid, dashed, dotted) so they survive black-and-white printing.
- Every visual gets an auto-generated text description for screen readers.

### Other elements worth adding

| Element | Why it helps | When to include |
| --- | --- | --- |
| Tap-to-replay audio | Students hear the exact explanation again | Every timestamp in the app |
| Board and slide photos | Captures what audio misses | Whenever the student took one |
| Flashcards | Turns key terms and self-test into spaced review | Every summary; export to the app's review deck |
| Mnemonic box | Helps memorize lists and sequences | Only when the professor gave one, or for lists of 4+ items to memorize |
| Real-world example | Links abstract ideas to something concrete | Conceptual subjects, one per main idea at most |

## Other variables to consider

Beyond subject type, the best summary depends on who is studying, why, and how good the recording is. Most of these become a few course settings the student fills in once; the rest Studiply handles automatically.

### The student

| Variable | Why it matters | How Studiply handles it |
| --- | --- | --- |
| Prior knowledge | The [expertise reversal effect](https://my.chartered.college/impact_article/expertise-reversal-effect-and-its-instructional-implications/): full step-by-step guidance helps beginners but becomes redundant, even harmful, for advanced learners | **Slider 1 · Your starting point** (1 start from zero → 10 I already know it), default saved per course. Low values add prerequisite definitions and every step; high values keep only what's new |
| Vocabulary level | Beginners need plain words; advanced students and exams need the exact technical terms | **Slider 8 · Language** (plain words → technical terms). Technical terms are always defined the first time they appear when the value is below 8 |
| Language of the summary | Lectures, readings and the student's native language often differ (common at IE) | Course setting **Summary language**: lecture language by default; optional translation; key terms always kept in the original with a translation in the glossary |
| Accessibility | Dyslexia, low vision, screen-reader users | Dynamic Type on iPhone, high-contrast mode, optional wider letter and line spacing, text descriptions for every visual |

### The study goal

| Variable | Why it matters | How Studiply handles it |
| --- | --- | --- |
| Purpose right now | First understanding, a quick refresh and the night before the exam need different summaries | **Sliders 2–4** (Length, Explanation depth, Examples) and the presets *First time learning*, *Quick review*, *Exam tomorrow* that set all 10 sliders at once |
| Exam format | Knowing the test type changes how students study: [students expecting a test focus better on the important information](https://profiles.wustl.edu/en/publications/the-effects-of-test-expectancy-on-processing-and-memory-of-prose/), and [recognition tests push detail memorization while essays push connections](https://pmc.ncbi.nlm.nih.gov/articles/PMC5449225) | Course setting **Exam format** (multiple choice, essay, problem-solving, open book, oral) sets the self-test question types; **Slider 6 · Exam focus** sets how much of the summary is exam material; **Slider 7 · Self-test** sets how many questions |
| Time until the exam | Spaced review only works if it is scheduled | Course setting **Exam date**; review reminders are planned backwards from it; the week before, an **Exam pack** merges all exam signals and self-tests from the course |
| What the student felt in class | Confusion and importance are only known to the student, in the moment | **Marks with a 1–10 level** (Important, Confused, Exam) and **Slider 10 · Follow my marks**, which sets how strongly the marks reshape the summary |

### The lecture input

| Variable | Why it matters | How Studiply handles it |
| --- | --- | --- |
| Audio and transcript quality | Whisper mishears technical terms and names, and every error flows into the summary | Course glossary and professor's name are passed to Whisper as a prompt; low-confidence passages go to `unclear`; a quality badge warns when the recording was poor |
| Several speakers | Student questions often trigger the clearest explanations | Kept as a Q&A block (“Student question” + professor's answer) |
| Digressions and admin talk | Jokes, stories and logistics dilute the content | Dropped from the content; deadlines and readings move to Logistics |
| Lecture length | A 30-minute and a 3-hour session can't be summarized the same way | Length scales with the transcript (10–15%); long transcripts are split by topic, summarized in parts, then merged |
| Slides or readings available | Audio misses what is on screen | Optional import; Claude aligns slides to the matching sections |

### The course context

| Variable | Why it matters | How Studiply handles it |
| --- | --- | --- |
| Previous lectures | Professors build on earlier sessions (“as we saw last week…”) | Claude receives the course's earlier takeaways and glossary; each summary gets a “Builds on” line linking back |
| Professor's notation | Professors use their own symbols and terms, e.g. Blanchard's Y, C, I in Macro; mixing notations confuses students | Use the professor's notation exactly; never “correct” it to another textbook's |
| Syllabus | Shows where a lecture fits in the course | Optional upload; lectures map to syllabus topics and feed a course overview |

### Trust and accuracy

| Variable | Why it matters | How Studiply handles it |
| --- | --- | --- |
| Faithfulness | [LLM summaries of spoken transcripts still produce hallucinations, omissions and irrelevant content](https://arxiv.org/pdf/2509.15901); a common failure is turning hedged speech into confident claims | Every claim tied to a timestamp; numbers and formulas copied exactly, then checked against the transcript in a second pass; anything Claude adds is labeled “Added context — not from the lecture” |
| Opinion vs fact | Professors share views that aren't settled facts | Labeled “Professor's view” |
| Student edits | A student's corrections must not be lost | Edits survive regeneration; an “I don't get this” flag collects items into a questions list for office hours |
| Privacy | Recordings include the professor's and classmates' voices | Audio stays on device; only what's needed goes to the AI, with consent (see How to generate it) |

### Course settings this adds

Each course has settings asked once when it is created and editable anytime: **Subject type**, **Exam format**, **Exam date**, **Summary language**, and the **default value of all 10 sliders** (saved with *Save as course default* in the summary panel). Every summary request sends these with the lecture.

## The summary request

When the student taps **Stop & summarize**, a panel opens (a centered panel on the laptop, a full-screen sheet on iPhone) with the extra resources, the 10 sliders and a Generate button. Course defaults pre-fill everything, so most of the time the student just taps **Stop & generate summary**. *Keep recording* closes the panel without stopping.

### The 10 sliders (1–10)

Each slider shows its value and what 1 and 10 mean. The student can be as precise as they want; Claude receives the exact number.

| # | Slider | 1 means | 10 means | Default |
| --- | --- | --- | --- | --- |
| 1 | Your starting point | Start from zero | I already know it | 2 |
| 2 | Length | One page | Everything | 5 |
| 3 | Explanation depth | Just the facts | Every why and how | 6 |
| 4 | Examples | None | One per idea | 5 |
| 5 | Visuals & graphs | Text only | Visual-heavy | 4 |
| 6 | Exam focus | Understand it | Only what's on the exam | 5 |
| 7 | Self-test questions | None | Full practice set | 5 |
| 8 | Language | Plain words | Technical terms | 4 |
| 9 | Extra resources | Lecture only | Lean on slides & readings | 6 |
| 10 | Follow my marks | Ignore them | Follow them closely | 7 |

**Presets** set all 10 at once (values in slider order):

| Preset | Values |
| --- | --- |
| First time learning | 1 · 6 · 9 · 8 · 6 · 3 · 4 · 2 · 7 · 6 |
| Quick review | 6 · 2 · 3 · 2 · 3 · 6 · 6 · 6 · 3 · 7 |
| Exam tomorrow | 5 · 4 · 5 · 4 · 4 · 10 · 10 · 7 · 6 · 9 |
| Reset | the defaults above |

**Save as course default** stores the current values in the course settings. Studiply always stores the full generated content, so a later change of Length can re-render a shorter view without a new AI call when the content already exists.

### Media tray: complete the summary

The student can attach anything that fills gaps the audio leaves.

| Media | How it's added | How it's used |
| --- | --- | --- |
| Professor's slides (PDF, PowerPoint) | Import from Files, Drive or email | Text is extracted on device; slides are matched to transcript sections by topic and time; key slides are shown next to the matching section |
| Board and slide photos | Camera button during recording, or from Photos later | Timestamped; Claude reads them (formulas, diagrams) and places them in the matching section |
| Handwritten or typed notes | Typed live in My notes during class, or photo / paste | Always included; woven into the matching sections as “From your notes” blocks with the student's formatting kept |
| Readings and handouts | PDF import | Used only to clarify terms the lecture mentions; never replaces lecture content |
| Links (videos, articles) | Paste URL | Saved under Logistics as further resources; not summarized unless the student asks |

Rules: the student's notes and marks are always included and cannot be unchecked; the lecture stays the main source; when slides and audio disagree (e.g. a different number), the summary shows both and flags it. Attached media goes to the AI only with the same consent as the audio. Set a cap per summary (for example 40 slide pages and 20 photos) to control cost.

### Extend with the next lecture

Topics often run over several sessions. From any summary, the student taps **Extend with next lecture** (or picks any later lecture) to build one combined summary.

1. Studiply sends the existing summary's JSON plus the new lecture's transcript and media.
2. Claude adds the new material as new sections, tagged with their lecture number, and updates the shared parts: takeaways rewritten for the whole unit, glossary merged without duplicates, timelines merged in date order, self-test refreshed to cover both.
3. Contradictions or corrections the professor made (“last week I said X, actually…”) are shown as an update callout.
4. The original single-lecture summaries stay untouched; the combined one is saved as a **Unit summary** (e.g. “Corporate Finance — Lectures 3–5: Time value of money”).

Two more options from the same menu: **Merge lectures** (pick several and combine at once) and **Exam pack** (a whole course or unit compressed to exam signals, formulas, key terms and self-test).

### The request sent to the API

Everything the student gave is sent together: the 10 slider values, course settings, the timestamped transcript, the student's notes (with their formatting), the marks with their levels, the assistant conversation, and the media. The Edge Function turns the numbers into instructions (next section).

```json
{
  "mode": "new | extend | merge | examPack",
  "sliders": {
    "startingPoint": 2, "length": 5, "depth": 6, "examples": 5, "visuals": 4,
    "examFocus": 5, "selfTest": 5, "language": 4, "extraResources": 6, "followMarks": 7
  },
  "course": {
    "name": "Psicobiología", "subjectType": "science", "examFormat": "multipleChoice",
    "examDate": "2027-01-20", "summaryLanguage": "es", "lectureNumber": 1
  },
  "transcript": {
    "durationSec": 5520, "wordCount": 12000, "quality": "good",
    "segments": [{ "start": "00:00", "end": "00:30", "text": "" }]
  },
  "notes": [
    { "id": "n1", "t": "04:12", "text": "Def: estudia la conducta como proceso biológico", "format": "prosemirror-json" }
  ],
  "marks": [
    { "id": "m1", "type": "confused", "level": 7, "t": "18:30", "note": "filogenético??" },
    { "id": "m2", "type": "important", "level": 8, "t": "31:05", "note": "" },
    { "id": "m3", "type": "exam", "level": 9, "t": "06:40", "note": "Fig. 1.1" }
  ],
  "assistant": [
    { "t": "34:20", "question": "Explícame los últimos 10 minutos", "answer": "", "window": ["24:12", "34:12"] }
  ],
  "media": [
    { "type": "slides", "included": true, "pages": [{ "page": 1, "text": "" }] },
    { "type": "photo", "included": true, "t": "12:40", "imageId": "" },
    { "type": "reading", "included": false, "text": "" }
  ],
  "existingSummary": null,
  "courseContext": { "previousTakeaways": [""], "glossary": [{ "term": "", "definition": "" }] }
}
```

In `extend` and `merge` mode, `existingSummary` carries the previous summary's JSON.

## How Claude builds the summary

The summarize Edge Function never just forwards the sliders to Claude. It first **calculates a set of derived variables** from the sliders, the marks and the lecture, then gives Claude exact numbers and rules. This makes the result predictable: the same settings always produce the same kind of summary.

### The pipeline

1. **Align.** Every note line, mark, photo and assistant question is matched to the transcript segment at its timestamp (±30 s). The transcript is split into topics.
2. **Classify.** Claude confirms the subject type from the course setting and the transcript, and picks the modules (Summary types by subject).
3. **Calculate.** The function computes the derived variables below.
4. **Generate.** Claude writes the JSON (How to generate it). Lectures over 60 minutes are generated topic by topic, then merged.
5. **Check.** Schema, notes coverage, marks coverage, length and faithfulness (Quality checks below). Anything that fails is regenerated for just that part.
6. **Write.** The JSON becomes editor blocks in the Summary tab, a version is saved, and the notes check line shows “N of N lines”.

### Derived variables from the sliders

Examples are for a 90-minute lecture of 12,000 transcript words with the default sliders.

| Variable | Calculated from | Rule | Example |
| --- | --- | --- | --- |
| Target length (words) | Slider 2 · Length × transcript words | Share of the transcript by value: 1 → 3%, 2 → 5%, 3 → 7%, 4 → 9%, 5 → 12%, 6 → 14%, 7 → 17%, 8 → 20%, 9 → 24%, 10 → 30%. The student's notes don't count against it | 12% × 12,000 ≈ 1,440 words |
| Number of takeaways | Slider 2 · Length | 1–3 → 3 · 4–7 → 4 · 8–10 → 5 | 4 |
| Explanation mode | Slider 3 · Depth | 1–3 → the statement only · 4–7 → statement + one-line “why” · 8–10 → why + how + link to earlier lectures | Statement + why |
| Prerequisites | Slider 1 · Starting point | 1–3 → define every prerequisite term, show every step · 4–7 → define only terms new in this course · 8–10 → skip basics, tag what's new in this lecture | Every term defined |
| Examples | Slider 4 · Examples | 1 → none · 2–4 → one per 3 sections · 5–7 → one per section · 8–10 → one per key idea | One per section |
| Visual budget | Slider 5 · Visuals | 1 → none · 2–4 → only where the content is a curve or model · 5–7 → also timelines, comparisons, processes · 8–10 → one per section that has a shape. Always within the Graphs and visuals rules | Curves and models only |
| Exam weighting | Slider 6 · Exam focus | 1–3 → professor's explicit flags only · 4–7 → Exam signals section and highlighted exam points · 8–10 → background cut, sections ordered by exam likelihood, exam tips added | Exam signals section |
| Self-test size | Slider 7 · Self-test | 1 → none; otherwise 2 + (value − 2) × 1.6, rounded: 2 → 2, 5 → 7, 10 → 15. Question types from the course's exam format; 30% are “why/how” questions | 7 questions |
| Vocabulary | Slider 8 · Language | 1–3 → plain words and analogies, technical term in brackets · 4–7 → technical terms, defined on first use · 8–10 → the professor's exact terminology and notation | Defined on first use |
| Resource use | Slider 9 · Extra resources | 1–3 → slides only to fix spellings and formulas · 4–7 → slides fill gaps the audio missed · 8–10 → slide and reading content that wasn't spoken is added, labeled “From slides” | Slides fill gaps |
| Mark strength | Slider 10 · Follow my marks | Effective level = mark level × (slider ÷ 7), rounded, kept between 1 and 10. At 7 marks count as set; at 10 they're boosted; at 1 they only show as chips | 7/10 stays 7 |

### What each mark does

The effective level (above) falls into a band: low 1–3, mid 4–7, high 8–10.

| Mark | Low | Mid | High |
| --- | --- | --- | --- |
| ★ Important | Chip on its section | Chip + the point bolded in its section | Goes into Key takeaways and the self-test |
| ? Confused | One-sentence clarification | **You were confused here** block with a simpler explanation | Step-by-step explanation + an example + a practice question, even if the Examples slider is low |
| Exam | Chip on its section | Listed in Exam signals with its level | Exam signals + at least one self-test question + a flashcard |

### Signals the student didn't set by hand

| Signal | How it's detected | Treated as |
| --- | --- | --- |
| Questions to the assistant | Each question's time window (e.g. “last 10 min” = 24:12 → 34:12) | A Confused mark at level 6 over that window, unless the student already marked it; the Q&A goes into “Your questions during class” |
| Professor's exam phrases | “Esto entra en el examen”, “this will be on the exam”, “important” | An Exam signal from the professor, shown separately from the student's marks |
| Repetition | A concept explained 3 or more times | Important at level 6 |
| Poor audio | Low transcription confidence | Listed in Logistics & gaps; never guessed |

### When rules conflict

1. **The student's notes win.** They're never cut, shortened or reworded, whatever the Length slider says.
2. **Marks at the high band can exceed the length budget** by up to 20%; everything else must fit it.
3. **Exam focus high + Depth high:** full depth only on exam-relevant sections; the rest stays short.
4. **Slides and audio disagree** (a different number or date): show both and flag it.
5. **Starting point high but a Confused mark is high:** that moment still gets the full explanation.

### Quality checks before the summary is shown

| Check | Pass condition | If it fails |
| --- | --- | --- |
| Schema | JSON matches the zod schema | Retry once, then show an error with a retry button |
| Notes coverage | 100% of note lines mapped to a block | Regenerate for the missing lines only |
| Marks coverage | Every mark appears (at least as a chip) | Regenerate for the missing marks |
| Length | Within ±15% of the target (notes excluded) | Ask Claude to shorten or expand the longest or shortest sections |
| Faithfulness | Every number, date and formula appears in the transcript, slides or notes | Correct it or label it “Added context — not from the lecture” |
| Language | Matches the course's summary language | Regenerate the affected blocks |

## The summary as a living document

The summary is not a finished file; it's an editable document, like a Google Doc, that the student keeps changing, annotating and asking Claude about. It starts during the lecture as live notes and grows into the summary.

### The flow

1. **Record + live notes.** Tapping Record opens a notes document on the same screen. Everything the student types is stamped with the recording time automatically. Quick buttons add marks at the current moment (Important, Confused, Exam, Photo); each mark opens a 1–10 slider for how important, how lost or how likely on the exam.
2. **Generate.** When recording stops, the student opens the summary request panel. Claude receives the transcript, the media and the live notes with their timestamps and marks. Marks steer the summary: Confused moments get a fuller explanation, Important and Exam moments go into Key takeaways and Exam signals.
3. **Living document.** The summary opens in the same editor as the notes. The student's own notes are woven into the matching sections, labeled “From your notes”, never overwritten.
4. **Notes are always included.** The student's notes and marks cannot be switched off in the summary request; every note line and every mark must appear in the summary (merged into a section, a callout, Exam signals or the self-test). After generating, Studiply checks coverage: every note line's timestamp must map to a block, and the document shows “All your notes are in this summary · 14 of 14 lines”. If any line is missing, Claude is asked again for just those lines.

### What the student can do in the document

| Action | How it works |
| --- | --- |
| Edit anything | Tap any text to change it; headings, lists, tables, formulas and callouts are all editable blocks |
| Highlight and annotate | Select text → highlight in 4 colors, or add a margin note (like a Google Docs comment) |
| Ask Claude on a selection | Select text → Explain simpler · Give an example · Go deeper · Make a flashcard · Rewrite this section. The answer comes as a suggested change to accept or reject |
| Replay the moment | Tap any timestamp to hear that part of the lecture |
| Add media | Drop a photo, slide or drawing anywhere in the document |
| Quiz me | Toggle hides each section's content and shows its cue question |
| Version history | Every AI generation and every editing session is saved as a version the student can restore |
| Export | PDF (see PDF export), plus Markdown and Word later |

### Who wrote what

Every block remembers where it came from: **AI**, **Student** or **Media**. This keeps three promises:

- Regenerating or extending a summary only rewrites AI blocks the student hasn't touched; anything the student wrote or edited stays.
- A subtle marker (a thin left line in the student's color) shows which parts are the student's own, toggleable on and off.
- Claude's suggested changes never apply silently; the student accepts or rejects them.

### How to build it

- **Editor:** [TenTap](https://github.com/10play/10tap-editor), an open-source rich-text editor for React Native built on Tiptap and ProseMirror, designed after Google Docs and Notion. Custom blocks (callouts, timeline, formula, timestamp chip, quiz toggle) are written as Tiptap extensions.
- **Expo note:** TenTap's basic mode runs in Expo Go, but custom extensions need an Expo Dev Client build. You need that anyway for TestFlight and the App Store.
- **Storage:** the document is saved as ProseMirror JSON in SQLite, next to the recording. The AI's summary JSON is converted into document blocks once, when generated; from then on the document is the source of truth.
- **Versions:** a snapshot of the document JSON on each generation and at the end of each editing session.
- **Later, not v1:** real-time co-editing with classmates, like Google Docs, needs a sync server (for example Yjs). That breaks the current offline, no-backend design, so keep it for a later version; v1 can share a read-only PDF or link.

## Typography

Use the system font, as the app already does: SF Pro on iPhone and Mac, the system sans-serif on other computers. Sizes come from the app's scale in `src/constants/typography.ts`. Code uses a monospace (SF Mono / Menlo). The PDF can optionally switch the body to a serif for long reading.

| Element | Font | App size (typography.ts) | PDF size | Weight | Line height |
| --- | --- | --- | --- | --- | --- |
| Lecture title (H1) | System | 28 pt (`2xl`) | 22 pt | Bold 700 | 1.2 (`tight`) |
| Section heading (H2) | System | 20 pt (`lg`) | 15 pt | Semibold 600 | 1.2 |
| Sub-heading (H3) | System | 17 pt (`md`) | 12 pt | Semibold 600 | 1.4 (`normal`) |
| Body text | System (PDF: optional serif) | 15 pt (`base`), scales with Dynamic Type | 10.5 pt | Regular 400 | 1.6 (`relaxed`) |
| Key terms | Same as body | Same | Same | Semibold 600 | — |
| Metadata, timestamps, captions | System | 13 pt (`sm`) | 8.5 pt | Medium 500 | 1.4 |
| Callout label | System, uppercase, letter spacing `wide` (1.5) | 11 pt (`xs`) | 8 pt | Bold 700 | — |
| Code | SF Mono / Menlo | 13 pt | 9 pt | Regular 400 | 1.45 |

The student can change fonts and sizes inside the document with the editor toolbar (Title, Heading 1, Heading 2, Subheading, Normal, Quote; font; size). These rules are the defaults Studiply uses when it writes the summary.

Rules:

- Support Dynamic Type on iPhone and browser zoom on the laptop; never lock text sizes.
- Keep lines to 60–75 characters. On the laptop and in the PDF, the page is capped at 820 px / the A4 text width rather than stretching.
- Bold only key terms, never whole sentences. Italics for book titles and variables; the student may use italics, underline and strikethrough freely in their own notes, and Studiply keeps them.
- Render formulas with KaTeX, never as plain text like `x^2`.

## Spacing and layout

All spacing comes from an 8-point grid, so everything lines up without manual tweaking. Space above a heading is always larger than space below it, which visually ties each heading to its own content.

| Token | Value | Used for |
| --- | --- | --- |
| xs | 4 pt | Icon to label, chip padding |
| sm | 8 pt | Between list items, inside table cells |
| md | 16 pt | Between paragraphs, below H2 and H3, callout padding |
| lg | 24 pt | Above H3, between callouts and text |
| xl | 32 pt | Above H2 (between sections) |
| 2xl | 48 pt | Below the header block |

Layout rules:

- **App:** 16 pt side margins on iPhone; max text width 680 pt on iPad. A sticky mini-header shows the current section while scrolling.
- **PDF:** A4 (Spain and EU default; offer US Letter as a setting), 20 mm margins, single column.
- **Callouts:** 4 pt colored left border, light tinted background, 8 pt corner radius, md padding.
- **Tables:** no vertical lines; thin horizontal rules only; header row in semibold.
- **Header block:** course color strip on top, lecture title, then one line of metadata (date · professor · duration).

## Color system

Use Studiply's own palette from `src/constants/colors.ts`: the lavender → dusty rose → amber gradient for brand moments, a muted purple accent, salmon for chips, and near-black navy for primary buttons. Color guides the eye; it never decorates. All text meets WCAG AA contrast (4.5:1).

| Role | Color | Used for |
| --- | --- | --- |
| Text primary | `#0A0A0A` (Colors.text.primary) | Body, headings |
| Text secondary | `#5A5A6A` | Metadata, timestamps, labels |
| Page background | Gradient `#F0EDF9` → `#FDF4E7` (gradientSubtle) | Behind the document |
| Document surface | `#FFFFFF` | The page itself |
| Muted surface | `#F2F0F5` (surfaceMuted), `#F9F7F4` (offWhite) | Key takeaways box, cards, chat bubbles |
| Brand gradient | `#B8B5E4` → `#C9A8D4` → `#D4A0A0` → `#E8B4A0` → `#F0C890` → `#E8A850` | Logo tile, the small bar above each lecture title |
| Accent | `#7B6FD4` (accent), text on light fills `#4F43B0` | Links, timestamps, active tab, sliders, Definition callouts on `#EAE8F7` |
| Primary button | `#1A1A2E` (button.primary) | Generate, Save, Send, New |
| Salmon | `#E8B4A0` border on `#F5E0D8` | Search fields, chips, quick prompts, **You were confused here** callouts (label `#8A3B22`) |
| From your notes | `#E8F5EE` fill, label `#1F6B45` | The student's own notes inside the summary, the notes check line |
| Exam signal | `#FFFBEB` / `#FFE4B5` fill, label `#7A4A00` | Exam callouts, Important and Exam chips, highlights |
| Recording | `#CC3333` button, `#FDEAEA` strip | Record button and recording strip (white on `#D94F4F` fails contrast) |

Rules:

- **Course colors:** each course gets one color from the palette (purple, amber, rose, green, orchid…); it appears only as the dot in the library and the course chip, never in body text.
- **PDF is always the light version**, with fills kept light so it prints cheaply and stays readable in black and white.
- Callouts and marks always carry a text label (DEFINITION, FROM YOUR NOTES, Confused 7/10), so they work for color-blind users and on grayscale printouts.
- Dark mode: same roles, with dark surfaces and the accent lightened until text passes 4.5:1.

## PDF export

Generate the PDF from one HTML template using `expo-print` (`printToFileAsync`), then hand it to `expo-sharing` so students can save it to Files, AirDrop it or upload it to their LMS. This works fully offline, which fits Studiply's on-device design.

**Page layout**

- Page 1 opens directly with the header and Key takeaways. No separate cover page.
- Running header on every page after the first: course name (left), lecture title (right), 8.5 pt secondary color.
- Footer: “Studiply” (left), “Page 2 of 4” (right).
- Self-test answers go on the last page, under a heading “Answers”, so students can test themselves without seeing them.
- Timestamps print as plain text `[12:34]`, since links back to audio don't work on paper.

**Technical rules for the template**

- Set page size with CSS `@page { size: A4; margin: 20mm; }`.
- Add `break-inside: avoid` to callouts, formulas, tables and code blocks so none splits across pages.
- Add `break-after: avoid` to headings so a heading never sits alone at the bottom of a page.
- Embed fonts as base64 in the HTML; the print engine has no internet access when offline.
- Pre-render KaTeX formulas to HTML before printing, and inline the KaTeX CSS and fonts.
- File name: `Course – Lecture title – YYYY-MM-DD.pdf`, for example `Corporate Finance – Time Value of Money – 2026-10-20.pdf`.

**Export options** (a short sheet before exporting): include self-test yes/no, include full transcript as an appendix yes/no, paper size A4 or Letter.

## How to generate it

Have Claude return the summary as structured JSON, not as free markdown. The app then renders that JSON with one set of components for the screen and one HTML template for the PDF, so formatting is always consistent and never depends on how the model felt like writing that day.

1. During recording, Whisper transcribes 30-second chunks through the transcribe-chunk Edge Function, building a timestamped transcript.
2. On Stop & generate, the summarize Edge Function receives the request (The summary request), calculates the derived variables and runs the pipeline in “How Claude builds the summary”.
3. Claude returns JSON in the schema below; the function validates it with zod, runs the quality checks and stores it in Supabase (and the phone's SQLite cache).
4. The app converts the JSON into editor blocks in the Summary tab (origin `ai`, the student's notes as `student`), on iPhone and laptop alike; the PDF template reads the same blocks.

```json
{
  "subjectType": "history | math | finance | science | law | business | social | programming | language | philosophy",
  "modulesUsed": ["timeline", "causeEffect", "keyFigures"],
  "appliedSettings": { "targetWords": 1440, "takeaways": 4, "selfTestCount": 7, "markStrength": 1.0 },
  "header": { "course": "", "title": "", "number": 0, "date": "YYYY-MM-DD", "professor": "", "durationMin": 0, "builtFrom": ["notes", "audio", "slides", "photos", "assistant"] },
  "coverage": { "noteLines": 14, "noteLinesUsed": 14, "marks": 6, "marksUsed": 6 },
  "takeaways": [{ "text": "", "fromMarkId": "m2" }],
  "sections": [
    {
      "heading": "",
      "timestamp": "mm:ss",
      "cueQuestion": "",
      "markChips": [{ "markId": "m2", "type": "important", "level": 8 }],
      "blocks": [
        { "type": "paragraph", "text": "", "keyTerms": [""] },
        { "type": "callout", "kind": "definition | example | exam | warning | addedContext", "text": "" },
        { "type": "fromNotes", "noteIds": ["n1"], "t": "04:12", "note": "kept exactly, with the student's formatting" },
        { "type": "confusedHere", "markId": "m1", "level": 7, "t": "18:30", "explanation": "", "steps": [""], "example": "", "practiceQuestion": "" },
        { "type": "formula", "latex": "", "variables": [{ "symbol": "", "meaning": "" }], "whenToUse": "" },
        { "type": "workedExample", "problem": "", "steps": [{ "do": "", "why": "" }], "answer": "" },
        { "type": "timeline", "events": [{ "date": "", "title": "", "detail": "", "importance": "" }] },
        { "type": "causeEffect", "causes": [""], "event": "", "effects": [""] },
        { "type": "keyFigures", "people": [{ "name": "", "role": "", "did": "", "why": "" }] },
        { "type": "comparison", "items": [""], "criteria": [{ "name": "", "values": [""] }] },
        { "type": "conceptMap", "center": "", "links": [{ "from": "", "to": "", "label": "" }] },
        { "type": "process", "steps": [{ "name": "", "input": "", "output": "" }] },
        { "type": "framework", "name": "SWOT", "cells": [{ "label": "", "content": "" }] },
        { "type": "theoryCard", "author": "", "year": 0, "claim": "", "method": "", "finding": "", "critique": "" },
        { "type": "caseCard", "facts": "", "question": "", "decision": "", "reasoning": "", "lesson": "" },
        { "type": "argument", "claim": "", "premises": [""], "objections": [{ "objection": "", "reply": "" }] },
        { "type": "code", "language": "c", "code": "", "output": "" },
        { "type": "vocabulary", "entries": [{ "term": "", "meaning": "", "example": "" }] },
        { "type": "functionPlot", "expression": "x^2 - 4", "xRange": [-5, 5], "mark": ["roots", "vertex"], "title": "" },
        { "type": "modelGraph", "template": "supplyDemand | islm | normalCurve | costCurves", "shifts": [{ "curve": "", "direction": "left | right" }], "title": "" },
        { "type": "dataChart", "chart": "line | bar | stackedBar | histogram", "title": "", "xLabel": "", "yLabel": "", "series": [{ "name": "", "points": [{ "x": "", "y": 0 }] }], "timestamp": "mm:ss" },
        { "type": "capturedImage", "imageId": "", "timestamp": "mm:ss", "caption": "" }
      ]
    }
  ],
  "glossary": [{ "term": "", "definition": "" }],
  "examSignals": [{ "text": "", "timestamp": "mm:ss", "source": "professor | studentMark", "level": 9 }],
  "questionsDuringClass": [{ "t": "34:20", "question": "", "shortAnswer": "" }],
  "selfTest": [{ "question": "", "kind": "recall | why | apply | calculate", "answer": "", "fromMarkId": null }],
  "flashcards": [{ "front": "", "back": "" }],
  "logistics": [""],
  "unclear": [{ "timestamp": "mm:ss", "note": "" }]
}
```

Each module `type` maps to exactly one React Native component and one HTML partial for the PDF. Add a new subject later by adding a module, not by changing the schema.

Prompt rules to include: write in the course's summary language; follow the derived variables exactly (they are given as numbers); keep every student note word for word in a `fromNotes` block; every mark ID must appear somewhere (`markChips`, `takeaways`, `confusedHere`, `examSignals` or `selfTest`); keep paragraphs to 3 sentences; never invent content that isn't in the transcript, slides or notes, and label any added explanation `addedContext`; list anything inaudible under `unclear` instead of guessing; fill `coverage` honestly, because the app checks it.

Before publishing to the App Store, the AI step needs two things: Apple requires a clear disclosure and explicit user permission before audio or transcripts are sent to Whisper or Claude, and the API keys must sit behind a small server, not inside the app.
