import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { answerBlocks, type AnswerSpan } from '../../utils/answerText';

/**
 * A study-assistant answer as desktop-01 / iphone-04 draw it:
 * plain full-width text, **bold**, numbered lists, and the times it cites
 * underlined in the accent colour; a tap plays the lecture from there. A
 * time past what the lecture has (`lengthMs`) stays plain text.
 */
export function AssistantAnswer({
  text,
  size,
  lengthMs,
  onTime,
}: {
  text: string;
  size: 'panel' | 'sheet';
  lengthMs: number | null;
  onTime: (ms: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const body = [styles.text, size === 'sheet' && styles.textSheet];

  const spans = (list: AnswerSpan[]) =>
    list.map((s, i) =>
      s.kind === 'text' ? (
        <Text key={i} style={s.bold && styles.bold}>
          {s.text}
        </Text>
      ) : lengthMs === null || s.ms <= lengthMs ? (
        <Text
          key={i}
          style={[styles.time, s.bold && styles.bold]}
          onPress={() => onTime(s.ms)}
          accessibilityRole="link"
          accessibilityLabel={`Play the lecture from ${s.label}`}
          {...{ dataSet: { answerTime: String(s.ms) } }}
        >
          {s.label}
        </Text>
      ) : (
        <Text key={i} style={s.bold && styles.bold}>
          {s.label}
        </Text>
      ),
    );

  return (
    <View style={styles.answer} {...{ dataSet: { assistant: 'answer' } }}>
      {answerBlocks(text).map((block, i) =>
        block.kind === 'paragraph' ? (
          <Text key={i} style={body}>
            {spans(block.spans)}
          </Text>
        ) : (
          <View key={i} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.item}>
                <Text style={[body, styles.marker]}>{block.ordered ? `${item.number ?? j + 1}.` : '•'}</Text>
                <Text style={[body, styles.itemText]}>{spans(item.spans)}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    answer: { gap: 8 },
    text: { fontSize: 14, lineHeight: 22, color: c.text.primary },
    textSheet: { fontSize: Typography.size.base + 1, lineHeight: 25 },
    bold: { fontWeight: Typography.weight.bold },
    time: { color: c.accentDark, textDecorationLine: 'underline' },
    list: { gap: 4 },
    item: { flexDirection: 'row' },
    marker: { width: 20 },
    itemText: { flex: 1 },
  });
