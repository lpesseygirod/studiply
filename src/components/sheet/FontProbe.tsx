import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Typography } from '../../constants/typography';
import { calibrate, isCalibrated, NUMBER_GLYPHS } from './measure';

/** Each character is drawn this many times; its width is the drawn width over it. */
const REPEAT = 10;

/**
 * iPhone: measures the characters a number can have, in the cells' real
 * system font at their size, regular and bold, by drawing them out of
 * sight once (step 4.7e: numbers are rounded to what fits, measured as
 * drawn). When every width is known, `onMeasured` redraws the grid.
 */
export function FontProbe({ fontSize, onMeasured }: { fontSize: number; onMeasured: () => void }) {
  const done = useRef(isCalibrated(fontSize, false) && isCalibrated(fontSize, true));
  if (done.current) return null;
  const measured = (bold: boolean, ch: string) => (width: number) => {
    calibrate(fontSize, bold, ch, width / REPEAT);
    if (!done.current && isCalibrated(fontSize, false) && isCalibrated(fontSize, true)) {
      done.current = true;
      onMeasured();
    }
  };
  return (
    <View pointerEvents="none" style={styles.probe} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[false, true].map((bold) =>
        [...NUMBER_GLYPHS].map((ch) => (
          <Text
            key={`${bold}${ch}`}
            numberOfLines={1}
            style={[styles.glyph, { fontSize, fontWeight: bold ? Typography.weight.bold : Typography.weight.regular }]}
            onLayout={(e) => measured(bold, ch)(e.nativeEvent.layout.width)}
          >
            {ch.repeat(REPEAT)}
          </Text>
        )),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Out of sight and wide enough that nothing wraps; each line as wide as its text.
  probe: { position: 'absolute', left: -10000, top: 0, width: 4000, opacity: 0 },
  glyph: { alignSelf: 'flex-start' },
});
