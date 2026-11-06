import type { QuizPresetKey, QuizSliderKey, QuestionType } from '../../../supabase/functions/_shared/quiz-plan';

/**
 * The New quiz panel's words (step 9.1b; BUILD-PLAN "Create a quiz"): the 10 sliders with their
 * labelled ends (the laptop's "1 · gentle", the iPhone's short ones under the track, as the summary
 * sliders), the presets' order, the question types' chip labels.
 */
export const QUIZ_SLIDER_LABELS: Record<QuizSliderKey, { name: string; low: string; high: string; shortLow: string; shortHigh: string }> = {
  difficulty: { name: 'Difficulty', low: 'gentle', high: 'tricky', shortLow: 'gentle', shortHigh: 'tricky' },
  count: { name: 'Number of questions', low: '5 questions', high: '50 questions', shortLow: '5', shortHigh: '50' },
  definitions: { name: 'Definitions', low: 'none', high: 'many', shortLow: 'none', shortHigh: 'many' },
  calculations: { name: 'Calculations / exercises', low: 'none', high: 'many', shortLow: 'none', shortHigh: 'many' },
  theoryPractice: { name: 'Theory vs. practice', low: 'theory', high: 'practice', shortLow: 'theory', shortHigh: 'practice' },
  examFocus: { name: 'Exam focus', low: 'everything', high: 'only what’s flagged', shortLow: 'everything', shortHigh: 'flagged only' },
  weakSpots: { name: 'My weak spots', low: 'ignore them', high: 'mostly them', shortLow: 'ignore', shortHigh: 'mostly them' },
  traps: { name: 'Trap answers', low: 'clearly wrong', high: 'very close', shortLow: 'clearly wrong', shortHigh: 'very close' },
  memoryUnderstanding: { name: 'Memory vs. understanding', low: 'remember it', high: 'understand it', shortLow: 'remember', shortHigh: 'understand' },
  detail: { name: 'Detail', low: 'big ideas', high: 'small details too', shortLow: 'big ideas', shortHigh: 'details too' },
};

export const QUIZ_PRESET_ORDER: QuizPresetKey[] = ['quickCheck', 'examTomorrow', 'deepUnderstanding', 'reset'];

/** The type chips (BUILD-PLAN's wording). */
export const TYPE_CHIPS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / false',
  short_answer: 'Short answer',
  fill_blank: 'Fill in the blank',
  long_answer: 'Long answer',
  match_pairs: 'Match pairs',
  order_steps: 'Put steps in order',
  numeric: 'Calculation (numeric answer)',
};

/** A file's kind, under its name. */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Photo';
    case 'unit_summary':
      return 'Unit summary';
    case 'exam_pack':
      return 'Exam pack';
    default:
      return 'Document';
  }
}
