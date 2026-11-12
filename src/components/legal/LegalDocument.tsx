/**
 * LegalDocument.tsx
 * Draws one legal text from its blocks (src/legal/texts.generated.ts, made from
 * docs/legal/*.md): the title, headings, paragraphs, lists and tables, with bold and links.
 * Links to another legal page call `onOpenPage`; web addresses and emails open outside the app.
 * Tables: a grid on the laptop; on the iPhone each row is a small card ("Provider: Supabase…").
 */

import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { legalSlugOf } from '../../legal/pages';
import type { LegalBlock, LegalSlug, LegalSpan } from '../../legal/types';

interface Props {
  blocks: readonly LegalBlock[];
  onOpenPage: (slug: LegalSlug) => void;
}

export function LegalDocument({ blocks, onOpenPage }: Props) {
  const styles = useThemedStyles(makeStyles);
  const wide = useLayoutMode() === 'wide';

  const spans = (list: readonly LegalSpan[]) =>
    list.map((s, i) => {
      if (!s.href) {
        return (
          <Text key={i} style={s.bold && styles.bold}>
            {s.text}
          </Text>
        );
      }
      const href = s.href;
      const page = legalSlugOf(href);
      return (
        <Text
          key={i}
          style={[styles.link, s.bold && styles.bold]}
          accessibilityRole="link"
          onPress={() => (page ? onOpenPage(page) : void Linking.openURL(href).catch(() => {}))}
          {...{ dataSet: { legalHref: href } }}
        >
          {s.text}
        </Text>
      );
    });

  return (
    <View style={styles.doc}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'title':
            return (
              <Text key={i} style={styles.title} accessibilityRole="header">
                {b.text}
              </Text>
            );
          case 'heading':
            return (
              <Text key={i} style={styles.heading} accessibilityRole="header">
                {spans(b.spans)}
              </Text>
            );
          case 'subheading':
            return (
              <Text key={i} style={styles.subheading}>
                {spans(b.spans)}
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={styles.paragraph}>
                {spans(b.spans)}
              </Text>
            );
          case 'list':
            return (
              <View key={i} style={styles.list}>
                {b.items.map((item, n) => (
                  <View key={n} style={styles.item}>
                    <Text style={styles.bullet} accessibilityElementsHidden importantForAccessibility="no">
                      {b.ordered ? `${n + 1}.` : '•'}
                    </Text>
                    <Text style={styles.itemText}>{spans(item)}</Text>
                  </View>
                ))}
              </View>
            );
          case 'table':
            return wide ? (
              <View key={i} style={styles.table}>
                <View style={[styles.tr, styles.thead]}>
                  {b.head.map((cell, n) => (
                    <Text key={n} style={[styles.td, styles.th]}>
                      {spans(cell)}
                    </Text>
                  ))}
                </View>
                {b.rows.map((row, r) => (
                  <View key={r} style={[styles.tr, r < b.rows.length - 1 && styles.trLine]}>
                    {row.map((cell, n) => (
                      <Text key={n} style={styles.td}>
                        {spans(cell)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View key={i} style={styles.cards}>
                {b.rows.map((row, r) => (
                  <View key={r} style={styles.rowCard}>
                    {row.map((cell, n) => (
                      <Text key={n} style={n === 0 ? styles.rowCardTitle : styles.rowCardLine}>
                        {n > 0 && <Text style={styles.rowCardLabel}>{b.head[n]?.map((s) => s.text).join('')}: </Text>}
                        {spans(cell)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    doc: { gap: 12 },
    title: {
      fontSize: Typography.size['2xl'],
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
      marginBottom: 2,
    },
    heading: {
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.bold,
      color: c.text.primary,
      marginTop: 14,
    },
    subheading: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
      marginTop: 4,
    },
    paragraph: {
      fontSize: Typography.size.base,
      lineHeight: 23,
      color: c.text.primary,
    },
    bold: { fontWeight: Typography.weight.bold },
    link: { color: c.accentDark, textDecorationLine: 'underline' },
    list: { gap: 6 },
    item: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
    bullet: {
      minWidth: 16,
      fontSize: Typography.size.base,
      lineHeight: 23,
      color: c.text.secondary,
    },
    itemText: {
      flex: 1,
      fontSize: Typography.size.base,
      lineHeight: 23,
      color: c.text.primary,
    },
    table: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: 'hidden',
    },
    tr: { flexDirection: 'row' },
    trLine: { borderBottomWidth: 1, borderBottomColor: c.border },
    thead: { backgroundColor: c.cardMuted, borderBottomWidth: 1, borderBottomColor: c.border },
    td: {
      flex: 1,
      padding: 10,
      fontSize: Typography.size.sm,
      lineHeight: 19,
      color: c.text.primary,
    },
    th: { fontWeight: Typography.weight.semibold },
    cards: { gap: 8 },
    rowCard: {
      gap: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.cardMuted,
    },
    rowCardTitle: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    rowCardLine: {
      fontSize: Typography.size.sm,
      lineHeight: 19,
      color: c.text.primary,
    },
    rowCardLabel: { color: c.text.secondary, fontWeight: Typography.weight.semibold },
  });
