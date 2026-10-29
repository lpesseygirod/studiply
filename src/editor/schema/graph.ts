import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView, NodeView } from '@tiptap/pm/view';

import { graphDescription, graphMarkup } from '../graph/charts';
import { cleanGraph, NEW_GRAPH, planGraph, usesDecimalComma, type GraphData } from '../graph/data';
import { placeBlock } from './placeBlock';

/**
 * Graphs the student builds (step 4.7d): a block holding its data (bar,
 * line, pie or scatter; a title, axis labels, up to 3 series), drawn by the
 * charts module (graph/charts.ts). The data is edited in a form outside the
 * page, as formulas are: a popover under the graph on the laptop, a sheet on
 * the iPhone; each change redraws the graph at once.
 *
 * A click (tap) on a graph selects it and asks the device for its form: a
 * DOM event on the laptop, a request in the editor state on the iPhone. A
 * top-level block with its own id and origin (blockMeta), whole on a page.
 */

export const GRAPH = 'graph';
export const GRAPH_CLASS = 'studiply-graph';
/** Laptop: `detail` is the graph's box on screen (`GraphBox`); its form opens under it, or beside the page. */
export const GRAPH_EVENT = 'studiply-graph';
/** Sent on the document when the page's language is set (both editors): graphs redraw their numbers. */
export const LANG_EVENT = 'studiply-lang';

/** A language code that is safe to set (and, on the iPhone, to send into the WebView's script). */
export const cleanLang = (lang: string | null | undefined): string => (lang && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : '');

/** The page's language (the editor's `lang`), for how a graph writes its numbers. */
const langOf = (el: HTMLElement) => el.closest('[lang]')?.getAttribute('lang') ?? '';

export interface GraphBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface GraphRequest {
  id: number;
  pos: number;
}
export const graphKey = new PluginKey<GraphRequest | null>('studiplyGraph');

/** The graph's data from a node. */
export const graphOf = (node: PMNode): GraphData => cleanGraph(node.attrs);

/** The selected graph, if the selection is one. */
export function selectedGraph(state: EditorState): { pos: number; data: GraphData } | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== GRAPH) return null;
  return { pos: selection.from, data: graphOf(selection.node) };
}

/** About the form's height: when the graph is lower than this from the bottom, it moves up first. */
const FORM_ROOM = 480;

/**
 * Selects the graph at `pos` and asks the device for its form (both ways).
 * A graph low on the screen first scrolls near the top, so the form (under
 * it on the laptop, a sheet over the lower half on the iPhone) never hides
 * the graph it redraws.
 */
export function askGraphForm(view: EditorView, pos: number) {
  const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta(graphKey, { id: Date.now(), pos });
  view.dispatch(tr);
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (dom && dom.getBoundingClientRect().bottom + FORM_ROOM > window.innerHeight) dom.scrollIntoView?.({ block: 'start' });
  const r = (dom ?? view.dom).getBoundingClientRect();
  const detail: GraphBox = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  view.dom.dispatchEvent(new CustomEvent(GRAPH_EVENT, { bubbles: true, detail }));
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    graph: {
      /** A new graph (an example to replace) after the cursor's line; it is selected and its form asked for. */
      insertGraph: () => ReturnType;
      /** The selected graph's data; it stays selected. */
      setGraph: (data: GraphData) => ReturnType;
      /** Removes the selected graph. */
      deleteGraph: () => ReturnType;
    };
  }
}

/** What a graph shows: the charts module's drawing (with its own title and description for screen readers). */
class GraphView implements NodeView {
  dom = document.createElement('figure');
  private art = document.createElement('div');
  private width = 0;
  private watch: ResizeObserver | null = null;

  constructor(private node: PMNode) {
    this.dom.className = GRAPH_CLASS;
    this.art.className = `${GRAPH_CLASS}-art`;
    this.dom.appendChild(this.art);
    if (typeof ResizeObserver === 'function') {
      // The page's width decides the drawing's; redraw when it changes (window, zoom, phone turned).
      this.watch = new ResizeObserver(() => {
        if (Math.round(this.dom.clientWidth) !== this.width) this.render(this.node);
      });
      this.watch.observe(this.dom);
    }
    document.addEventListener(LANG_EVENT, this.redraw);
    this.render(node);
  }

  private redraw = () => this.render(this.node);

  private render(node: PMNode) {
    this.node = node;
    this.width = Math.round(this.dom.clientWidth);
    const data = graphOf(node);
    // The module's SVG (it escapes every text it draws; with no numbers it says so).
    this.art.innerHTML = graphMarkup(planGraph(data).spec, this.width || 600, String(node.attrs.blockId ?? ''), usesDecimalComma(data, langOf(this.dom)));
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs !== this.node.attrs) this.render(node);
    else this.node = node;
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.watch?.disconnect();
    document.removeEventListener(LANG_EVENT, this.redraw);
  }
}

export const Graph = Node.create({
  name: GRAPH,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    // One JSON attribute in HTML (data-graph) carries them all.
    const read = (key: keyof GraphData) => (el: HTMLElement) => {
      try {
        return cleanGraph(JSON.parse(el.getAttribute('data-graph') ?? '{}'))[key];
      } catch {
        return cleanGraph({})[key];
      }
    };
    const quiet = () => ({});
    return {
      kind: { default: NEW_GRAPH.kind, parseHTML: read('kind'), renderHTML: quiet },
      title: { default: '', parseHTML: read('title'), renderHTML: quiet },
      xLabel: { default: '', parseHTML: read('xLabel'), renderHTML: quiet },
      yLabel: { default: '', parseHTML: read('yLabel'), renderHTML: quiet },
      series: { default: NEW_GRAPH.series, parseHTML: read('series'), renderHTML: quiet },
      rows: { default: NEW_GRAPH.rows, parseHTML: read('rows'), renderHTML: (attrs) => ({ 'data-graph': JSON.stringify(cleanGraph(attrs)) }) },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-graph]' }];
  },

  // Copy and paste inside Studiply keep the data; the description stands in for the picture elsewhere.
  renderHTML({ node, HTMLAttributes }) {
    const data = graphOf(node);
    return ['figure', mergeAttributes(HTMLAttributes, { class: GRAPH_CLASS }), ['figcaption', graphDescription(planGraph(data).spec, usesDecimalComma(data, null))]];
  },

  addNodeView() {
    return ({ node }) => new GraphView(node);
  },

  addCommands() {
    return {
      insertGraph:
        () =>
        ({ state, tr, dispatch }) => {
          const node = state.schema.nodes[GRAPH].create(NEW_GRAPH);
          if (!dispatch) return true;
          const { at } = placeBlock(state, tr, node);
          tr.setSelection(NodeSelection.create(tr.doc, at)).setMeta(graphKey, { id: Date.now(), pos: at });
          tr.scrollIntoView();
          return true;
        },
      setGraph:
        (data) =>
        ({ state, tr, dispatch }) => {
          const current = selectedGraph(state);
          if (!current) return false;
          if (dispatch) {
            tr.setNodeMarkup(current.pos, undefined, { ...state.doc.nodeAt(current.pos)!.attrs, ...cleanGraph(data) });
            tr.setSelection(NodeSelection.create(tr.doc, current.pos));
          }
          return true;
        },
      deleteGraph:
        () =>
        ({ state, tr, dispatch }) => {
          const current = selectedGraph(state);
          if (!current) return false;
          if (dispatch) tr.delete(current.pos, current.pos + state.doc.nodeAt(current.pos)!.nodeSize);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<GraphRequest | null>({
        key: graphKey,
        state: {
          init: () => null,
          apply: (tr, value) => tr.getMeta(graphKey) ?? value,
        },
        props: {
          handleClickOn: (view, _pos, node, nodePos) => {
            if (node.type.name !== GRAPH || !view.editable) return false;
            askGraphForm(view, nodePos);
            return true;
          },
        },
      }),
    ];
  },
});

/** For the format layer: the latest click on a graph, for the iPhone's sheet. */
export const graphRequestOf = (state: EditorState): GraphRequest | null => graphKey.getState(state) ?? null;
