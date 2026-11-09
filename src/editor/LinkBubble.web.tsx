import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Editor } from '@tiptap/react';

import type { ThemeColors } from '../constants/colors';
import { appLinkText, openAppLink, parseAppLink } from '../lib/appLinks';
import { Typography } from '../constants/typography';
import { useThemedStyles } from '../theme/ThemeProvider';
import { LINK_EVENT } from './bridges/format';
import { runFormat } from './format';

/**
 * The laptop's link bubble (step 4.5): with the cursor on a link, a small
 * bar under it shows the address with Open (a new tab) · Edit · Remove.
 * Drawn over the page (`page`: the page's DOM element), following scrolling.
 */
export function LinkBubble({ editor, page }: { editor: Editor; page: HTMLElement | null }) {
  const styles = useThemedStyles(makeStyles);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!page) return;
    page.addEventListener('scroll', redraw, true);
    return () => page.removeEventListener('scroll', redraw, true);
  }, [page]);

  // Pressing the bubble must not take the focus from the text (the bubble
  // would hide before the click lands).
  const keepFocus = useCallback((node: unknown) => {
    const el = node as HTMLElement | null;
    el?.addEventListener('mousedown', (e) => e.preventDefault());
  }, []);

  // Step 10.1b-5: Escape hides the bubble until the cursor moves (as Google Docs).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editor.isActive('link')) setDismissedAt(editor.state.selection.from);
    };
    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
  }, [editor]);

  const href = editor.getAttributes('link').href as string | undefined;
  if (!href || !editor.isFocused || !page || dismissedAt === editor.state.selection.from) return null;
  const at = editor.view.coordsAtPos(editor.state.selection.from);
  const box = page.getBoundingClientRect();
  // Step 7.7: a link into the app (My notes, the study assistant) opens there, not in a new tab.
  const appLink = parseAppLink(href);

  return (
    <View ref={keepFocus} style={[styles.bubble, { left: Math.max(8, at.left - box.left - 20), top: at.bottom - box.top + 6 }]} accessibilityLabel="Link">
      <Text style={styles.href} numberOfLines={1}>
        {appLink ? appLinkText(appLink) : href.replace(/^mailto:/, '')}
      </Text>
      <Pressable
        onPress={() => openAppLink(href) || window.open(href, '_blank', 'noopener,noreferrer')}
        style={styles.action}
        accessibilityRole="link"
        accessibilityLabel="Open link"
      >
        <Text style={styles.actionText}>Open</Text>
      </Pressable>
      <Pressable onPress={() => editor.view.dom.dispatchEvent(new CustomEvent(LINK_EVENT, { bubbles: true }))} style={styles.action} accessibilityRole="button" accessibilityLabel="Edit link">
        <Text style={styles.actionText}>Edit</Text>
      </Pressable>
      <Pressable onPress={() => runFormat(editor, { type: 'link', href: null })} style={styles.action} accessibilityRole="button" accessibilityLabel="Remove link">
        <Text style={styles.actionText}>Remove</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bubble: {
      position: 'absolute',
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: 420,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      shadowColor: c.black,
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    href: { flexShrink: 1, fontSize: Typography.size.sm, color: c.accentDark, marginRight: 6 },
    action: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6 },
    actionText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
  });
