import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../../src/constants/colors';
import { Layout } from '../../../src/constants/layout';
import { Typography } from '../../../src/constants/typography';
import { GradientBackground } from '../../../src/components/GradientBackground';

// Review: quizzes, flashcards and the day's review. A placeholder until the study phase.
export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  return (
    <GradientBackground>
      <StatusBar style="dark" />
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Review</Text>
        <View style={styles.card}>
          <Ionicons name="sparkles-outline" size={28} color={Colors.accent} />
          <Text style={styles.cardTitle}>Quizzes and flashcards</Text>
          <Text style={styles.cardText}>
            Review today, exam packs and practice from your summaries come in the study phase.
          </Text>
        </View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
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
    color: Colors.text.primary,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.cardRadius.iphone,
    padding: 20,
    gap: 8,
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  cardText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    lineHeight: 21,
  },
});
