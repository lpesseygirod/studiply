import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { SORT_LABELS, type LibrarySort } from '../../utils/libraryGrid';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { showActionSheet } from '../dialogs/dialogs';
import { IconButton } from '../IconButton';

/**
 * "My library › Course › Folder · 7 items", Sort, and on the iPhone the
 * grid/list toggle (docs/design desktop-04).
 */
export function LibraryHeader({
  crumbs,
  onLibrary,
  onCrumb,
  count,
  sort,
  onSort,
  view,
  onToggleView,
  showViewToggle,
  onBack,
}: {
  crumbs: string[];
  onLibrary: () => void;
  onCrumb: (index: number) => void;
  count: number;
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  view: 'grid' | 'list';
  onToggleView: () => void;
  showViewToggle: boolean;
  onBack: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const last = crumbs.length - 1;

  const chooseSort = () =>
    showActionSheet(
      'Sort by',
      (Object.keys(SORT_LABELS) as LibrarySort[]).map((s) => ({
        text: s === sort ? `✓ ${SORT_LABELS[s]}` : SORT_LABELS[s],
        onPress: () => onSort(s),
      })),
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.crumbRow}>
        <IconButton icon="chevron-back" label="Back" onPress={onBack} color={c.text.onGradientStrong} />
        <View style={styles.crumbs} accessibilityRole="header">
          <Pressable onPress={onLibrary} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.crumbMuted}>My library</Text>
          </Pressable>
          {crumbs.map((name, i) => (
            <Fragment key={`${i}-${name}`}>
              <Ionicons name="chevron-forward" size={16} color={c.text.onGradient} />
              {i === last ? (
                <Text style={styles.crumbCurrent} numberOfLines={1} testID="crumb-current">
                  {name}
                </Text>
              ) : (
                <Pressable onPress={() => onCrumb(i)} accessibilityRole="link" hitSlop={6}>
                  <Text style={styles.crumbMuted} numberOfLines={1}>
                    {name}
                  </Text>
                </Pressable>
              )}
            </Fragment>
          ))}
          <Text style={styles.count}>
            {count === 1 ? '1 item' : `${count} items`}
          </Text>
        </View>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.sortButton} onPress={chooseSort} accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_LABELS[sort]}`}>
          <Text style={styles.sortLabel}>Sort</Text>
          <Text style={styles.sortValue}>{SORT_LABELS[sort]}</Text>
          <Ionicons name="chevron-down" size={14} color={c.text.secondary} />
        </Pressable>
        {showViewToggle && (
          <IconButton
            icon={view === 'grid' ? 'list-outline' : 'grid-outline'}
            label={view === 'grid' ? 'Show as list' : 'Show as grid'}
            onPress={onToggleView}
            color={c.text.onGradientStrong}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    crumbRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -10 },
    crumbs: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2 },
    crumbMuted: { fontSize: Typography.size.lg, fontWeight: Typography.weight.medium, color: c.text.onGradient },
    crumbCurrent: {
      flexShrink: 1,
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.bold,
      color: c.text.onGradientStrong,
    },
    count: { fontSize: Typography.size.sm, color: c.text.onGradient, marginLeft: 4 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.card,
    },
    sortLabel: { fontSize: Typography.size.sm, color: c.text.secondary },
    sortValue: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
