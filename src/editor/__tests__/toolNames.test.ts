// The tools' names (the simplicity pass): one list for the
// laptop's tooltips, the iPhone's labels and captions, and the menus.
import { TOOLS, toolCaption, toolTip, type ToolKey } from '../toolNames';

describe('tool names', () => {
  it('a tooltip is the name and, on the laptop, the shortcut', () => {
    expect(toolTip('bold')).toBe('Bold ⌘B');
    expect(toolTip('comment')).toBe('Comment ⌘⌥M');
    expect(toolTip('bold', false)).toBe('Bold');
    expect(toolTip('formula')).toBe('Formula');
  });

  it('the iPhone captions are short words', () => {
    expect(toolCaption('outdent')).toBe('Indent −');
    expect(toolCaption('image')).toBe('Photo');
    expect(toolCaption('task')).toBe('Checklist');
    for (const key of Object.keys(TOOLS) as ToolKey[]) expect(toolCaption(key).length).toBeLessThanOrEqual(20);
  });

  it('plain words: no technical terms in any name', () => {
    for (const t of Object.values(TOOLS)) expect(t.name).not.toMatch(/LaTeX|inline|node|toggle|outdent/i);
  });
});
