import { StyleSheet, View } from 'react-native';

/**
 * The live waveform (desktop-01 / iphone-02): the recent loudness
 * as rounded bars, newest on the right. Decorative (the timer says it records).
 */
export function Waveform({ levels, color, height = 24, bar = 3, gap = 3 }: { levels: number[]; color: string; height?: number; bar?: number; gap?: number }) {
  return (
    <View style={[styles.row, { height, gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...{ dataSet: { recording: 'waveform' } }}>
      {levels.map((level, i) => (
        <View
          key={i}
          style={{ width: bar, borderRadius: bar / 2, backgroundColor: color, height: Math.max(bar, Math.round(height * (0.18 + 0.82 * Math.min(1, level)))) }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
