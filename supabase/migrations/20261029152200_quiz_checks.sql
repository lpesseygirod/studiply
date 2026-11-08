-- Step 9.1b-2 (the approved plan, §6): the report of the run that wrote a quiz, as summaries keep
-- theirs in result.checks: the questions asked for and written, each dropped question's slot and
-- reason, the verify call's counts, the repair call, what was left out without the images
-- permission, the time per phase, and the cost log (every Claude call with its ai_usage row).
-- Written by the quiz function only; null until a run finishes (and while one runs again).

alter table public.quizzes add column checks jsonb;

comment on column public.quizzes.checks is
  'The quiz function''s report of the run that wrote the quiz (step 9.1b-2): requested, written, dropped (slot, reasons), verify, repair, leftOut, ms, costLog. Null until written.';
