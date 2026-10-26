import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { ThemeColors } from '../constants/colors';
import { highlightParts } from '../utils/searchText';

/**
 * Text with the searched word marked (Search results, a note opened from
 * Search), without caring about case or accents. Goes inside a <Text>.
 */
export default function FoundText({ text, find }: { text: string | null | undefined; find?: string }) {
  const styles = useThemedStyles(makeStyles);
  if (!find || !text) return <>{text}</>;
  return (
    <>
      {highlightParts(text, find).map((part, i) =>
        part.hit ? (
          <Text key={i} style={styles.found}>
            {part.text}
          </Text>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    found: {
      backgroundColor: c.found,
      color: c.text.primary,
    },
  });
