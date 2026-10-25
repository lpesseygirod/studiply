import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import type { ThemeColors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { GradientBackground } from '../../../src/components/GradientBackground';

// Review: quizzes, flashcards and the day's review. A placeholder until the study phase.
export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <GradientBackground>
      <ThemedStatusBar />
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Review</Text>
        <View style={styles.card}>
          <Ionicons name="sparkles-outline" size={28} color={c.accent} />
          <Text style={styles.cardTitle}>Quizzes and flashcards</Text>
          <Text style={styles.cardText}>
            Review today, exam packs and practice from your summaries come in the study phase.
          </Text>
        </View>
      </View>
    </GradientBackground>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: Layout.pageMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 18,
  },
  title: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.extrabold,
    color: c.text.primary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: c.white,
    borderRadius: Layout.cardRadius.iphone,
    padding: 20,
    gap: 8,
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  cardText: {
    fontSize: Typography.size.base,
    color: c.text.secondary,
    lineHeight: 21,
  },
});
