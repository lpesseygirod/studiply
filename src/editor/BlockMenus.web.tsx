import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Editor } from '@tiptap/react';

import type { Anchor } from '../components/dialogs/dialogs';
import { CalloutKinds } from '../components/editor/CalloutKinds';
import { MarkForm } from '../components/editor/MarkForm';
import { PopoverDivider, PopoverHeading, PopoverRow, ToolbarPopover } from '../components/editor/ToolbarPopover';
import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { a11yState } from '../utils/a11y';
import { useThemedStyles } from '../theme/ThemeProvider';
import { MarkPanel } from '../components/recording/MarkPanel';
import { formatState, linkedMarkOf, runFormat, type FormatCommand } from './format';
import { CALLOUT_EVENT } from './schema/callout';
import { MARK_CHIP_EVENT } from './schema/markChip';
import type { StudiplyEditorProps } from './types';

/**
 * The laptop's menus for Studiply's blocks: a click on a
 * callout's label opens its menu (change to another kind, its level for
 * "You were confused here", Remove callout: the text stays); a click on a
 * mark chip opens its kind and level, and Remove. A mark made while
 * recording opens its mark panel: level, note, Done, Remove mark
 * (the screen offers Undo).
 */
export function BlockMenus({ editor, onMarkRemoved }: { editor: Editor; onMarkRemoved?: StudiplyEditorProps['onMarkRemoved'] }) {
  const styles = useThemedStyles(makeStyles);
  const [menu, setMenu] = useState<{ kind: 'callout' | 'mark'; anchor: Anchor } | null>(null);
  const s = formatState(editor);
  const linked = linkedMarkOf(s.markChip);

  useEffect(() => {
    const dom = editor.view.dom;
    const at = (kind: 'callout' | 'mark') => (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      setMenu({ kind, anchor: { x, y } });
    };
    const onCallout = at('callout');
    const onMark = at('mark');
    dom.addEventListener(CALLOUT_EVENT, onCallout);
    dom.addEventListener(MARK_CHIP_EVENT, onMark);
    return () => {
      dom.removeEventListener(CALLOUT_EVENT, onCallout);
      dom.removeEventListener(MARK_CHIP_EVENT, onMark);
    };
  }, [editor]);

  const close = () => setMenu(null);
  const run = (cmd: FormatCommand) => {
    close();
    runFormat(editor, cmd);
  };

  return (
    <>
      <ToolbarPopover anchor={menu?.kind === 'callout' && s.callout ? menu.anchor : null} onClose={close} width={260} label="Callout">
        {s.callout && (
          <>
            <PopoverHeading text="Change to" />
            <CalloutKinds current={s.callout.kind} onPick={(kind) => run({ type: 'callout', action: 'set', kind })} />
            {s.callout.kind === 'confused' && (
              <>
                <PopoverHeading text="Level" />
                <View style={styles.levels}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => run({ type: 'callout', action: 'level', level: n })}
                      style={[styles.level, s.callout?.level === n && styles.levelOn]}
                      accessibilityRole="radio"
                      {...a11yState({ checked: s.callout?.level === n })}
                      accessibilityLabel={`Level ${n}`}
                    >
                      <Text style={[styles.levelText, s.callout?.level === n && styles.levelTextOn]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <PopoverDivider />
            <PopoverRow label="Remove callout (keep the text)" danger onPress={() => run({ type: 'callout', action: 'remove' })} />
          </>
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={menu?.kind === 'mark' && s.markChip ? menu.anchor : null} onClose={close} width={linked ? 380 : 300} label="Mark">
        {linked ? (
          // A mark made while recording: its panel, to change the level or note, or remove it.
          <View style={styles.form}>
            <MarkPanel
              editing
              kind={linked.kind}
              ms={linked.ms}
              level={linked.level}
              note={linked.note}
              onSave={(level, note) => run({ type: 'markChip', action: 'update', level, note })}
              onCancel={close}
              onRemove={() => {
                run({ type: 'markChip', action: 'delete' });
                onMarkRemoved?.(linked, s.markChip!.at);
              }}
            />
          </View>
        ) : (
          s.markChip && (
            <View style={styles.form}>
              <MarkForm
                kind={s.markChip.kind}
                level={s.markChip.level}
                action="Done"
                onSubmit={(kind, level) => run({ type: 'markChip', action: 'update', kind, level })}
                onRemove={() => run({ type: 'markChip', action: 'delete' })}
              />
            </View>
          )
        )}
      </ToolbarPopover>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    form: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 14, paddingBottom: 6 },
    level: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    levelOn: { backgroundColor: c.accentDark, borderColor: c.accentDark },
    levelText: { fontSize: Typography.size.sm, color: c.text.primary },
    levelTextOn: { color: c.accentOn, fontWeight: Typography.weight.semibold },
  });
