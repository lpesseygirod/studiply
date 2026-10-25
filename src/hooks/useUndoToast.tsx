import { useCallback, useRef, useState } from 'react';

import UndoToast from '../components/UndoToast';

/**
 * The "… · Undo" toast for screens that don't have one yet. Returns the
 * function to show it and the element to render once at the screen's root.
 */
export function useUndoToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const undoRef = useRef<(() => void) | null>(null);

  const showUndo = useCallback((text: string, onUndo: () => void) => {
    undoRef.current = onUndo;
    setMessage(text);
    setVisible(true);
  }, []);

  const toast = (
    <UndoToast
      visible={visible}
      message={message}
      onUndo={() => {
        setVisible(false);
        undoRef.current?.();
        undoRef.current = null;
      }}
      onDismiss={() => setVisible(false)}
    />
  );

  return { showUndo, toast };
}
