/**
 * @jest-environment node
 */
// Step 7.7: links in a document that open something in the app (My notes, the study assistant at a
// question) instead of a web page.
import { appLinkText, assistantFocus, assistantLink, focusAssistantMessage, onAppLink, onAssistantFocus, openAppLink, parseAppLink, tabLink } from '../appLinks';

describe('app links', () => {
  it('read: a tab, the assistant at a question; anything else is a web address', () => {
    expect(parseAppLink(tabLink('notes'))).toEqual({ kind: 'tab', tab: 'notes' });
    expect(parseAppLink(assistantLink('m1'))).toEqual({ kind: 'assistant', messageId: 'm1' });
    expect(parseAppLink('https://studiply.app')).toBeNull();
    expect(parseAppLink('studiply:nothing/x')).toBeNull();
    expect(parseAppLink('studiply:tab/')).toBeNull();
    expect(appLinkText({ kind: 'assistant', messageId: 'm1' })).toBe('Opens the study assistant at this question');
    expect(appLinkText({ kind: 'tab', tab: 'notes' })).toBe('Opens My notes');
  });

  it('opened: handed to the screen (true); a web address isn’t (false: the caller opens it)', () => {
    const seen: unknown[] = [];
    const stop = onAppLink((link) => seen.push(link));
    expect(openAppLink('studiply:tab/notes')).toBe(true);
    expect(openAppLink('https://example.com')).toBe(false);
    stop();
    openAppLink('studiply:tab/summary');
    expect(seen).toEqual([{ kind: 'tab', tab: 'notes' }]);
  });

  it('the assistant asked to show a question', () => {
    let told = 0;
    const stop = onAssistantFocus(() => told++);
    focusAssistantMessage('m2');
    stop();
    expect(told).toBe(1);
    expect(assistantFocus()?.messageId).toBe('m2');
  });
});
