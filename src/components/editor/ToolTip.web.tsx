import React, { useEffect, useRef, useState } from 'react';

import { DarkColors } from '../../constants/colors';

const DELAY_MS = 400;

/**
 * A tool's name on hover (laptop; the simplicity pass): "Bold ⌘B"
 * in a small dark label under the tool after a moment. Fixed to the window,
 * so a toolbar's own clipping can't cut it; a press hides it.
 */
export function ToolTip({ label, children }: { label: string; children: React.ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAt(null);
  };
  useEffect(() => cancel, []);

  return (
    <span
      ref={box}
      style={{ display: 'flex', position: 'relative' }}
      onMouseEnter={() => {
        cancel();
        timer.current = setTimeout(() => {
          const r = box.current?.getBoundingClientRect();
          if (r) setAt({ x: r.left + r.width / 2, y: r.bottom + 6 });
        }, DELAY_MS);
      }}
      onMouseLeave={cancel}
      onMouseDown={cancel}
    >
      {children}
      {at && (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: at.x,
            top: at.y,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '4px 8px',
            borderRadius: 6,
            background: DarkColors.card,
            color: DarkColors.text.primary,
            font: '500 12px/16px -apple-system, system-ui, sans-serif',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
