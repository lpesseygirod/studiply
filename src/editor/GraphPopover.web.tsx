import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Selection } from '@tiptap/pm/state';

import type { Anchor } from '../components/dialogs/dialogs';
import { GraphForm } from '../components/editor/GraphForm';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { runFormat } from './format';
import type { GraphData } from './graph/data';
import { GRAPH_EVENT, selectedGraph, type GraphBox } from './schema/graph';

const WIDTH = 440;
/** About the form's height. */
const HEIGHT = 470;

/**
 * Under the graph when there is room; otherwise beside the page at the
 * window's right edge (over the margin or the side panel), never on the
 * graph it redraws.
 */
function placeForm(box: GraphBox): Anchor {
  if (box.bottom + 6 + HEIGHT <= window.innerHeight) return { x: box.left, y: box.bottom + 6 };
  return { x: Math.max(box.right + 12, window.innerWidth - WIDTH - 8), y: Math.max(8, Math.min(box.top, window.innerHeight - HEIGHT - 8)) };
}

/**
 * The laptop's graph form (step 4.7d): a click on a graph, or Insert ▾ →
 * Graph, opens it right under the graph (beside the page when the window has
 * no room below it). Each change redraws the graph in
 * the page at once; Done, a click outside or Escape close it and put the
 * cursor after the graph.
 */
export function GraphPopover({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState<GraphData | null>(null);

  useEffect(() => {
    const dom = editor.view.dom;
    const onOpen = (e: Event) => {
      const g = selectedGraph(editor.state);
      if (!g) return;
      setDraft(g.data);
      setAnchor(placeForm((e as CustomEvent<GraphBox>).detail));
    };
    dom.addEventListener(GRAPH_EVENT, onOpen);
    return () => dom.removeEventListener(GRAPH_EVENT, onOpen);
  }, [editor]);

  const change = (next: GraphData) => {
    setDraft(next);
    runFormat(editor, { type: 'graph', action: 'set', graph: next });
  };
  const done = () => {
    setAnchor(null);
    const g = selectedGraph(editor.state);
    if (!g) return;
    const after = g.pos + editor.state.doc.nodeAt(g.pos)!.nodeSize;
    editor.chain().focus().setTextSelection(Selection.near(editor.state.doc.resolve(after), 1).from).run();
  };
  const remove = () => {
    setAnchor(null);
    runFormat(editor, { type: 'graph', action: 'delete' });
  };

  return (
    <ToolbarPopover anchor={anchor} onClose={done} width={WIDTH} label="Graph">
      {anchor && draft && <GraphForm value={draft} onChange={change} onDone={done} onDelete={remove} />}
    </ToolbarPopover>
  );
}
