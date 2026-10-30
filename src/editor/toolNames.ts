/**
 * Every editor tool's name and (on the laptop) its shortcut, in one place
 * (the simplicity pass before 4.6, Lea): the laptop's tooltips ("Bold ⌘B"),
 * the iPhone's long-press labels and second-row captions, the bars inside
 * the document and the menus all read from here, so a tool is called the
 * same everywhere. Plain words, no technical terms.
 */

export interface ToolName {
  name: string;
  /** Laptop only. */
  keys?: string;
  /** A shorter caption under an icon (the iPhone's second row). */
  short?: string;
}

export const TOOLS = {
  undo: { name: 'Undo', keys: '⌘Z' },
  redo: { name: 'Redo', keys: '⌘⇧Z' },
  style: { name: 'Text style' },
  font: { name: 'Font' },
  smaller: { name: 'Smaller text', keys: '⌘⇧,' },
  bigger: { name: 'Bigger text', keys: '⌘⇧.' },
  size: { name: 'Text size' },
  bold: { name: 'Bold', keys: '⌘B' },
  italic: { name: 'Italic', keys: '⌘I' },
  underline: { name: 'Underline', keys: '⌘U' },
  strike: { name: 'Strikethrough', keys: '⌘⇧X', short: 'Strike' },
  color: { name: 'Text colour' },
  highlight: { name: 'Highlight' },
  colours: { name: 'Text colour and highlight', short: 'Colour' },
  clear: { name: 'Clear formatting', keys: '⌘\\' },
  bullet: { name: 'Bulleted list', keys: '⌘⇧8', short: 'Bullets' },
  ordered: { name: 'Numbered list', keys: '⌘⇧7', short: 'Numbers' },
  task: { name: 'Checklist', keys: '⌘⇧9' },
  align: { name: 'Align' },
  alignLeft: { name: 'Left', keys: '⌘⇧L' },
  alignCenter: { name: 'Centre', keys: '⌘⇧E' },
  alignRight: { name: 'Right', keys: '⌘⇧R' },
  alignJustify: { name: 'Justify', keys: '⌘⇧J' },
  spacing: { name: 'Line spacing' },
  outdent: { name: 'Less indent', keys: '⌘[', short: 'Indent −' },
  indent: { name: 'More indent', keys: '⌘]', short: 'Indent +' },
  insert: { name: 'Insert' },
  link: { name: 'Link', keys: '⌘K' },
  image: { name: 'Image', short: 'Photo' },
  camera: { name: 'Take photo', short: 'Camera' },
  table: { name: 'Table' },
  formula: { name: 'Formula' },
  formulaLibrary: { name: 'Formula from the library', short: 'Library' },
  graph: { name: 'Graph' },
  comment: { name: 'Comment', keys: '⌘⌥M' },
  pageBreak: { name: 'Page break', keys: '⌘↵' },
  callout: { name: 'Callout' },
  mark: { name: 'Mark' },
  timestamp: { name: 'Timestamp', short: 'Time' },
  /** Step 6.3: the study assistant's actions on the selected text. */
  askClaude: { name: 'Ask Claude' },
  view: { name: 'View' },
  zoomIn: { name: 'Zoom in', keys: '⌘+' },
  zoomOut: { name: 'Zoom out', keys: '⌘−' },
  zoomReset: { name: '100 %', keys: '⌘0' },
  more: { name: 'More tools' },
  fewer: { name: 'Fewer tools' },
  textStyle: { name: 'Text style and size', short: 'Text' },
  done: { name: 'Hide keyboard' },
} satisfies Record<string, ToolName>;

export type ToolKey = keyof typeof TOOLS;

/** "Bold ⌘B" on the laptop; "Bold" on the iPhone. */
export function toolTip(key: ToolKey, withKeys = true): string {
  const t: ToolName = TOOLS[key];
  return withKeys && t.keys ? `${t.name} ${t.keys}` : t.name;
}

/** The caption under an icon (the iPhone's second row). */
export const toolCaption = (key: ToolKey): string => (TOOLS[key] as ToolName).short ?? TOOLS[key].name;
