import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Card } from '../../services/assistant-actions.service';

/**
 * Proposed flashcards (from an assistant answer, or Make flashcard
 * on a selection): each card's front and back, then Save cards · Discard.
 * Not editable here (card editing comes with Review).
 */
export function CardsList({ cards, saving, onSave, onDiscard }: { cards: Card[]; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.wrap} {...{ dataSet: { assistant: 'cards' } }}>
      {cards.map((card, i) => (
        <View key={i} style={styles.card} {...{ dataSet: { assistant: 'card' } }}>
          <Text style={styles.front}>{card.front}</Text>
          <Text style={styles.back}>{card.back}</Text>
        </View>
      ))}
      <View style={styles.buttons}>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [styles.save, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Save cards"
          {...{ dataSet: { assistant: 'save-cards' } }}
        >
          {saving ? <ActivityIndicator size="small" color={c.button.primaryText} /> : <Text style={styles.saveText}>Save cards</Text>}
        </Pressable>
        <Pressable
          onPress={onDiscard}
          disabled={saving}
          style={({ pressed }) => [styles.discard, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Discard"
          {...{ dataSet: { assistant: 'discard-cards' } }}
        >
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    card: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.card },
    front: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    back: { fontSize: Typography.size.sm, lineHeight: 19, color: c.text.secondary },
    buttons: { flexDirection: 'row', gap: 8, marginTop: 2 },
    save: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: c.button.primary, alignItems: 'center', justifyContent: 'center' },
    saveText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    discard: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    discardText: { fontSize: Typography.size.sm, color: c.text.primary },
    pressed: { opacity: 0.7 },
  });
