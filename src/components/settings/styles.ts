/**
 * styles.ts
 * The settings rows, cards, pills and radios, shared by every settings
 * section (step 3.6; moved from the old General screen unchanged).
 */

import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

export const makeSettingsStyles = (c: ThemeColors) =>
  StyleSheet.create({
    sectionHeader: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.bold,
      color: c.text.onGradient,
      letterSpacing: Typography.tracking.wider,
      marginBottom: -4,
    },

    card: {
      backgroundColor: c.white,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.surfaceMuted,
      overflow: 'hidden',
    },

    row: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
    },
    rowLabel: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text.primary,
      flex: 1,
    },

    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },

    rowValue: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    rowValueText: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      fontWeight: Typography.weight.medium,
    },

    pillsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    pill: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 6,
      borderRadius: 100,
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillActive: {
      backgroundColor: c.salmon,
    },
    pillText: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.semibold,
      color: c.text.secondary,
      letterSpacing: Typography.tracking.wide,
    },
    pillTextActive: {
      color: c.text.primary,
    },

    divider: {
      height: 1,
      backgroundColor: c.surfaceMuted,
      marginLeft: 16,
    },

    radioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 14,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterActive: {
      borderColor: c.salmon,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.salmon,
    },

    // Bottom sheets (language picker, edit profile)
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
  });
