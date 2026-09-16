import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { Typography } from '../constants/typography';
import { Colors } from '../constants/colors';

// -------------------------------------------------------------------
// Sentence splitter (also used by consumers to map indices → text)
// -------------------------------------------------------------------
export function splitIntoSentences(text: string): string[] {
  // Mark sentence-ending punctuation followed by whitespace, then split.
  // The marker character (\x1F) won't appear in normal prose.
  const marked = text.replace(/([.!?])\s+/g, '$1\x1F');
  return marked.split('\x1F').filter(s => s.trim().length > 0);
}

// -------------------------------------------------------------------
// Props
// -------------------------------------------------------------------
interface Props {
  text: string;
  highlightedIndices: number[];
  onToggleHighlight: (index: number) => void;
  /** When false the component is read-only — taps are ignored. */
  editable: boolean;
  style?: TextStyle;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------
export default function HighlightableText({
  text,
  highlightedIndices,
  onToggleHighlight,
  editable,
  style,
}: Props) {
  const sentences = splitIntoSentences(text);

  return (
    <Text style={[styles.container, style]}>
      {sentences.map((sentence, i) => {
        const isHighlighted = highlightedIndices.includes(i);
        return (
          <Text
            key={i}
            onPress={editable ? () => onToggleHighlight(i) : undefined}
            // suppressHighlighting removes the default iOS blue press tint so
            // our custom background is the only visual feedback.
            suppressHighlighting
            style={[styles.sentence, isHighlighted && styles.highlighted]}
          >
            {sentence}
            {i < sentences.length - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },
  sentence: {
    // unhighlighted — inherits container style
  },
  highlighted: {
    backgroundColor: '#FFF9C4',
    color: Colors.text.primary,
    fontWeight: Typography.weight.semibold,
  },
});
