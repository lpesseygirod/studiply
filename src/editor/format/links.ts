/**
 * Links (step 4.5): what the student types as an address, made safe and
 * complete. "uned.es" becomes https://uned.es, an email address becomes a
 * mailto: link; only http, https, mailto and tel are allowed, so a pasted
 * "javascript:" can never become a link.
 */

const ALLOWED = /^(https?:|mailto:|tel:)/i;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const DOMAIN = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#].*)?$/i;

/** The address to link to, or null when it isn't one we allow. */
export function cleanUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  if (ALLOWED.test(text)) {
    try {
      const url = new URL(text);
      return ALLOWED.test(url.protocol) ? text : null;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[\w-]+(\.[\w-]+)+:\d+/.test(text)) return null; // another scheme (javascript:, data:, file:…)
  if (EMAIL.test(text)) return `mailto:${text}`;
  if (text.startsWith('//')) return `https:${text}`;
  return DOMAIN.test(text) ? `https://${text}` : null;
}
