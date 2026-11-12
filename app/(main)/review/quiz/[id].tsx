import { useLocalSearchParams } from 'expo-router';

import { QuizScreen } from '../../../../src/components/quiz/QuizScreen';

/**
 * Taking a quiz: /review/quiz/<id> goes on with the attempt in progress or starts one;
 * ?attempt=<id> shows that attempt's results; ?new=<n> starts a new attempt (Take again).
 */
export default function QuizRoute() {
  const { id, attempt, new: fresh } = useLocalSearchParams<{ id: string; attempt?: string; new?: string }>();
  return <QuizScreen key={`${id}:${attempt ?? ''}:${fresh ?? ''}`} quizId={id} attemptId={attempt ?? null} fresh={!!fresh} />;
}
