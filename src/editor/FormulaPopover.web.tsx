import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Editor } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './katexFonts.web';

import type { Anchor } from '../components/dialogs/dialogs';
import { FormulaForm } from '../components/editor/FormulaForm';
import { ToolbarPopover } from '../components/editor/ToolbarPopover';
import { runFormat } from './format';
import { FORMULA_EVENT, selectedFormula } from './schema/formula';

/**
 * The laptop's formula editor (step 4.5): the toolbar's ∑ (a new formula, or
 * the selected one) and a click on a formula open it, at the formula. The
 * LaTeX changes the formula in the text as it is typed, with a KaTeX
 * preview here too; Done, a click outside or Escape close it.
 */
export function FormulaPopover({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState({ latex: '', display: false });
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    const dom = editor.view.dom;
    const onOpen = (e: Event) => {
      const f = selectedFormula(editor.state);
      setDraft(f ? { latex: f.latex, display: f.display } : { latex: '', display: false });
      setExisting(!!f);
      setAnchor((e as CustomEvent<Anchor>).detail);
    };
    dom.addEventListener(FORMULA_EVENT, onOpen);
    return () => dom.removeEventListener(FORMULA_EVENT, onOpen);
  }, [editor]);

  const change = (latex: string, display: boolean) => {
    setDraft({ latex, display });
    // Nothing goes in until there is something to show.
    if (latex.trim() || selectedFormula(editor.state)) runFormat(editor, { type: 'formula', action: 'set', latex, display });
  };
  const done = () => {
    setAnchor(null);
    if (selectedFormula(editor.state)) runFormat(editor, { type: 'formula', action: 'done' });
  };
  const remove = () => {
    setAnchor(null);
    runFormat(editor, { type: 'formula', action: 'remove' });
  };

  const html = katex.renderToString(draft.latex.trim() || '\\square', { displayMode: draft.display, throwOnError: false });
  return (
    <ToolbarPopover anchor={anchor} onClose={done} width={360} label="Formula">
      {anchor && (
        <FormulaForm
          latex={draft.latex}
          display={draft.display}
          onChange={change}
          onDone={done}
          onRemove={existing ? remove : undefined}
          preview={
            <View style={styles.preview} accessibilityLabel="Preview">
              <div className="studiply-formula-preview" dangerouslySetInnerHTML={{ __html: html }} />
            </View>
          }
        />
      )}
    </ToolbarPopover>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 44, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
});
