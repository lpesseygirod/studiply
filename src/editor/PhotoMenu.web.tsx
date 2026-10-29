import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

import type { Anchor } from '../components/dialogs/dialogs';
import { PopoverDivider, PopoverHeading, PopoverRow, ToolbarPopover } from '../components/editor/ToolbarPopover';
import { formatState, runFormat, type FormatCommand } from './format';
import { isPhoto, PHOTO_CLASS, PHOTO_WIDTHS, type PhotoAlign, type PhotoWrap } from './schema/photo';
import { PHOTO_BAR_EVENT } from './photoBar';

const LAYOUTS: { wrap: PhotoWrap; label: string }[] = [
  { wrap: 'inline', label: 'In line with text' },
  { wrap: 'left', label: 'Wrap left' },
  { wrap: 'right', label: 'Wrap right' },
  { wrap: 'break', label: 'Break text' },
];
const ALIGNS: { align: PhotoAlign; label: string }[] = [
  { align: 'left', label: 'Align left' },
  { align: 'center', label: 'Centre' },
  { align: 'right', label: 'Align right' },
];
const SIZES: { width: number; label: string }[] = [
  { width: PHOTO_WIDTHS.small, label: 'Small' },
  { width: PHOTO_WIDTHS.medium, label: 'Medium' },
  { width: PHOTO_WIDTHS.large, label: 'Large' },
  { width: PHOTO_WIDTHS.full, label: 'Full width' },
];

/**
 * The laptop's right-click on a photo (after test B): the photo bar's
 * choices as a menu at the pointer: layout, alignment (Break text), size,
 * delete. The photo is selected first, so the bar shows too.
 */
export function PhotoMenu({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const photo = formatState(editor).photo;

  useEffect(() => {
    const dom = editor.view.dom;
    const onContextMenu = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(`.${PHOTO_CLASS}`);
      if (!el || !editor.isEditable) return;
      let at = -1;
      editor.state.doc.descendants((node, pos) => {
        if (at < 0 && isPhoto(node) && editor.view.nodeDOM(pos) === el) at = pos;
        return at < 0;
      });
      if (at < 0) return;
      e.preventDefault();
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)));
      setAnchor({ x: e.clientX, y: e.clientY });
    };
    // The photo bar's Layout… on a narrow window: the same menu, under the bar.
    const onBar = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      setAnchor({ x, y });
    };
    dom.addEventListener('contextmenu', onContextMenu);
    dom.addEventListener(PHOTO_BAR_EVENT, onBar);
    return () => {
      dom.removeEventListener('contextmenu', onContextMenu);
      dom.removeEventListener(PHOTO_BAR_EVENT, onBar);
    };
  }, [editor]);

  const close = () => setAnchor(null);
  const run = (cmd: FormatCommand) => {
    close();
    runFormat(editor, cmd);
  };
  return (
    <ToolbarPopover anchor={photo ? anchor : null} onClose={close} width={220} label="Photo">
      {photo && (
        <>
          <PopoverHeading text="Layout" />
          {LAYOUTS.map((l) => (
            <PopoverRow key={l.wrap} label={l.label} checked={photo.wrap === l.wrap} onPress={() => run({ type: 'photoLayout', wrap: l.wrap })} />
          ))}
          <PopoverHeading text="Align (Break text)" />
          {ALIGNS.map((a) => (
            <PopoverRow
              key={a.align}
              label={a.label}
              checked={photo.wrap === 'break' && photo.align === a.align}
              disabled={photo.wrap !== 'break'}
              onPress={() => run({ type: 'photoLayout', align: a.align })}
            />
          ))}
          <PopoverHeading text="Size" />
          {SIZES.map((sz) => (
            <PopoverRow key={sz.width} label={sz.label} checked={photo.width === sz.width} onPress={() => run({ type: 'photoWidth', width: sz.width })} />
          ))}
          <PopoverDivider />
          <PopoverRow label="Delete photo" danger onPress={() => run({ type: 'photoDelete' })} />
        </>
      )}
    </ToolbarPopover>
  );
}
