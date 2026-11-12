/**
 * Links inside a document that open something in the app instead of a web page: the
 * summary's "See them in My notes" (`studiply:tab/notes`) and each question's "Full answer"
 * (`studiply:assistant/<message id>`: the study assistant at that question). Both editors' Open
 * (the laptop's link bubble, the iPhone's keyboard toolbar) hand them here; the document screen on
 * screen listens. Plain module state: no React Native or DOM.
 */

export const APP_LINK_SCHEME = 'studiply:';

export type AppLink = { kind: 'tab'; tab: string } | { kind: 'assistant'; messageId: string };

/** The link's meaning, or null for an ordinary address. */
export function parseAppLink(href: string | null | undefined): AppLink | null {
  if (!href?.startsWith(APP_LINK_SCHEME)) return null;
  const [kind, value] = href.slice(APP_LINK_SCHEME.length).split('/');
  if (!value) return null;
  if (kind === 'tab') return { kind: 'tab', tab: value };
  if (kind === 'assistant') return { kind: 'assistant', messageId: value };
  return null;
}

export const tabLink = (tab: string) => `${APP_LINK_SCHEME}tab/${tab}`;
export const assistantLink = (messageId: string) => `${APP_LINK_SCHEME}assistant/${messageId}`;

/** What the link bubble shows instead of the address. */
export function appLinkText(link: AppLink): string {
  return link.kind === 'assistant' ? 'Opens the study assistant at this question' : link.tab === 'notes' ? 'Opens My notes' : 'Opens a tab of this document';
}

const listeners = new Set<(link: AppLink) => void>();

/** Hands an app link to the screen on show; false when it isn't one (open it as a web address). */
export function openAppLink(href: string): boolean {
  const link = parseAppLink(href);
  if (!link) return false;
  listeners.forEach((fn) => fn(link));
  return true;
}

export function onAppLink(fn: (link: AppLink) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------- the study assistant at one question ----------

let focus: { messageId: string; at: number } | null = null;
const focusListeners = new Set<() => void>();

/** Asks the study assistant (panel or sheet) to show this question; read by its chat. */
export function focusAssistantMessage(messageId: string): void {
  focus = { messageId, at: Date.now() };
  focusListeners.forEach((fn) => fn());
}

export function assistantFocus(): { messageId: string; at: number } | null {
  return focus;
}

export function onAssistantFocus(fn: () => void): () => void {
  focusListeners.add(fn);
  return () => {
    focusListeners.delete(fn);
  };
}
