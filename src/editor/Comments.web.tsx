import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Editor } from '@tiptap/react';

import { showAlert, type Anchor } from '../components/dialogs/dialogs';
import { CommentCard, CommentComposer } from '../components/editor/CommentCard';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { newId } from '../lib/mappers';
import { runFormat } from './format';
import { canComment, COMMENT_CLICK_EVENT, COMMENT_EVENT, COMMENT_MARGIN_W, listComments, type CommentInfo } from './schema/comments';

/** Between two cards. */
const GAP = 8;

const act = (editor: Editor) => ({
  edit: (id: string, text: string) => runFormat(editor, { type: 'comment', action: 'edit', id, text }),
  resolve: (id: string, resolved: boolean) => runFormat(editor, { type: 'comment', action: 'resolve', id, resolved }),
  remove: (id: string) => runFormat(editor, { type: 'comment', action: 'delete', id }),
  select: (id: string) => runFormat(editor, { type: 'comment', action: 'select', id }),
});

/**
 * The laptop's comment popovers (step 4.5): the composer (the toolbar's
 * Comment button or ⌘⌥M, on the selected words) and, when the window is
 * too narrow for the margin, a click on commented text opens its card. In a
 * wide window that click makes its card in the margin the active one.
 */
export function CommentPopovers({ editor, wide, onActive }: { editor: Editor; wide: boolean; onActive: (id: string | null) => void }) {
  const [composer, setComposer] = useState<{ anchor: Anchor; quote: string } | null>(null);
  const [card, setCard] = useState<{ anchor: Anchor; id: string } | null>(null);
  const wideRef = useRef(wide);
  wideRef.current = wide;

  useEffect(() => {
    const dom = editor.view.dom;
    const onAdd = () => {
      if (!canComment(editor.state)) {
        showAlert('Select some words first', 'Select the words the comment is about, then add it.');
        return;
      }
      const { from, to } = editor.state.selection;
      const end = editor.view.coordsAtPos(to);
      setCard(null);
      setComposer({ anchor: { x: end.left, y: end.bottom + 6 }, quote: editor.state.doc.textBetween(from, to, ' ') });
    };
    const onClick = (e: Event) => {
      const { ids, x, y } = (e as CustomEvent<{ ids: string[]; x: number; y: number }>).detail;
      if (wideRef.current) onActive(ids[0]);
      else setCard({ anchor: { x, y }, id: ids[0] });
    };
    dom.addEventListener(COMMENT_EVENT, onAdd);
    dom.addEventListener(COMMENT_CLICK_EVENT, onClick);
    return () => {
      dom.removeEventListener(COMMENT_EVENT, onAdd);
      dom.removeEventListener(COMMENT_CLICK_EVENT, onClick);
    };
  }, [editor, onActive]);

  const a = act(editor);
  const shown = card ? listComments(editor.state.doc).find((c) => c.id === card.id) : undefined;
  return (
    <>
      <ToolbarPopover anchor={composer?.anchor ?? null} onClose={() => setComposer(null)} width={300} label="Add comment">
        {composer && (
          <View style={styles.pad}>
            <CommentComposer
              quote={composer.quote}
              onCancel={() => setComposer(null)}
              onSubmit={(text) => {
                const id = newId();
                setComposer(null);
                runFormat(editor, { type: 'comment', action: 'add', id, text });
                if (wideRef.current) onActive(id);
              }}
            />
          </View>
        )}
      </ToolbarPopover>
      <ToolbarPopover anchor={shown ? card!.anchor : null} onClose={() => setCard(null)} width={300} label="Comment">
        {shown && (
          <CommentCard
            comment={shown}
            active
            onEdit={(text) => a.edit(shown.id, text)}
            onResolve={(r) => {
              a.resolve(shown.id, r);
              setCard(null);
            }}
            onDelete={() => {
              a.remove(shown.id);
              setCard(null);
            }}
          />
        )}
      </ToolbarPopover>
    </>
  );
}

/** The nearest scrolling box around the editor (the page). */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if (overflowY === 'auto' || overflowY === 'scroll') return n;
  }
  return null;
}

/**
 * The comments margin (step 4.5, laptop, a wide window): beside the page,
 * each open comment's card level with its words (pushed down when they
 * would overlap), following the page as it scrolls. Resolved ones hide
 * here (the document menu's Comments lists them); a click on resolved
 * text shows its card while it is the active one.
 */
export function CommentMargin({ editor, active, onActive }: { editor: Editor; active: string | null; onActive: (id: string | null) => void }) {
  const ref = useRef<View>(null);
  const [, setTick] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const box = scroller(editor.view.dom);
    const again = () => setTick((n) => n + 1);
    box?.addEventListener('scroll', again, { passive: true });
    window.addEventListener('resize', again);
    // Once laid out (fonts, photos), measure again.
    const t = setTimeout(again, 300);
    return () => {
      box?.removeEventListener('scroll', again);
      window.removeEventListener('resize', again);
      clearTimeout(t);
    };
  }, [editor]);

  const margin = ref.current as unknown as HTMLElement | null;
  const top0 = margin?.getBoundingClientRect().top ?? 0;
  const comments = listComments(editor.state.doc).filter((c) => !c.resolved || c.id === active);
  let below = -Infinity;
  const placed = comments.map((c) => {
    let want = 0;
    try {
      want = editor.view.coordsAtPos(c.from).top - top0;
    } catch {
      // A position the view can't place yet: keep the order.
    }
    const top = Math.max(want, below + GAP);
    below = top + (heights[c.id] ?? 120);
    return { c, top };
  });

  const a = act(editor);
  const card = (c: CommentInfo, top: number) => (
    <View
      key={c.id}
      style={[styles.slot, { top }]}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (heights[c.id] !== h) setHeights((old) => ({ ...old, [c.id]: h }));
      }}
    >
      <CommentCard
        comment={c}
        active={c.id === active}
        onSelect={() => {
          onActive(c.id);
          a.select(c.id);
        }}
        onEdit={(text) => a.edit(c.id, text)}
        onResolve={(r) => {
          a.resolve(c.id, r);
          if (r) onActive(null);
        }}
        onDelete={() => {
          a.remove(c.id);
          onActive(null);
        }}
      />
    </View>
  );
  return (
    <View ref={ref} style={styles.margin} accessibilityLabel="Comments">
      {placed.map(({ c, top }) => card(c, top))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 12 },
  margin: { width: COMMENT_MARGIN_W, alignSelf: 'stretch', overflow: 'hidden' },
  slot: { position: 'absolute', left: 0, right: 0 },
});
