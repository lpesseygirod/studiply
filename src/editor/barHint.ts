import { DarkColors } from '../constants/colors';

/**
 * A name on every button of the bars drawn inside the document (table,
 * photo, selected text), both editors (the simplicity pass):
 * - with a mouse (laptop): after a moment's hover, a small dark label under
 *   the button, "Bold ⌘B" (the shortcut only where there is a keyboard);
 * - on a touch screen (the iPhone): a long press shows the name over the
 *   button for a moment, without pressing it.
 * Fixed to the window, so the bar's own clipping can't cut it.
 */

const HOVER_MS = 400;
const PRESS_MS = 450;
const SHOWN_MS = 1500;

let tip: HTMLSpanElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function hide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  tip?.remove();
  tip = null;
}

function show(button: HTMLElement, text: string, where: 'below' | 'above') {
  hide();
  const r = button.getBoundingClientRect();
  tip = document.createElement('span');
  tip.className = 'studiply-bar-hint';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  Object.assign(tip.style, {
    position: 'fixed',
    left: `${r.left + r.width / 2}px`,
    top: where === 'below' ? `${r.bottom + 6}px` : `${r.top - 6}px`,
    transform: where === 'below' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
    zIndex: '1000',
    padding: '4px 8px',
    borderRadius: '6px',
    background: DarkColors.card,
    color: DarkColors.text.primary,
    font: '500 12px/16px -apple-system, system-ui, sans-serif',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });
  document.body.appendChild(tip);
}

/**
 * Names `button` ("Bold"), with its laptop shortcut ("⌘B") shown only with a
 * mouse. `spoken`: what VoiceOver reads, when it must differ from the name.
 */
export function nameButton(button: HTMLElement, name: string, keys?: string, spoken = name): void {
  button.setAttribute('aria-label', spoken);
  const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
  const text = fine && keys ? `${name} ${keys}` : name;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  button.addEventListener('mouseenter', () => {
    cancel();
    timer = setTimeout(() => show(button, text, 'below'), HOVER_MS);
  });
  button.addEventListener('mouseleave', () => {
    cancel();
    hide();
  });
  button.addEventListener('mousedown', () => {
    cancel();
    hide();
  });
  button.addEventListener(
    'touchstart',
    () => {
      longPressed = false;
      cancel();
      timer = setTimeout(() => {
        longPressed = true;
        show(button, name, 'above');
        hideTimer = setTimeout(hide, SHOWN_MS);
      }, PRESS_MS);
    },
    { passive: true },
  );
  button.addEventListener('touchmove', cancel, { passive: true });
  button.addEventListener('touchend', cancel, { passive: true });
  // A long press only names the button: it doesn't press it.
  button.addEventListener(
    'click',
    (e) => {
      if (!longPressed) return;
      longPressed = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
}
