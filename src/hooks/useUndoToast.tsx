import { useCallback, useEffect, useRef, useState } from 'react';

import UndoToast from '../components/UndoToast';
import { offerUndo, onUndone, settleUndo } from '../lib/undo';

/**
 * The "… · Undo" toast. Returns the function to show it and the element to
 * render once at the screen's root. Every offer is also ⌘Z's (src/lib/undo.ts).
 */
export function useUndoToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const offerRef = useRef<{ id: number; run: () => void } | null>(null);

  const showUndo = useCallback((text: string, onUndo: () => void) => {
    offerRef.current = { id: offerUndo(text, onUndo), run: onUndo };
    setMessage(text);
    setVisible(true);
  }, []);

  // ⌘Z undid this toast's action: hide it.
  useEffect(
    () =>
      onUndone((id) => {
        if (offerRef.current?.id !== id) return;
        offerRef.current = null;
        setVisible(false);
      }),
    [],
  );

  const toast = (
    <UndoToast
      visible={visible}
      message={message}
      onUndo={() => {
        setVisible(false);
        const offer = offerRef.current;
        offerRef.current = null;
        if (!offer) return;
        settleUndo(offer.id);
        offer.run();
      }}
      onDismiss={() => setVisible(false)}
    />
  );

  return { showUndo, toast };
}
