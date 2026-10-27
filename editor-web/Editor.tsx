import React from 'react';
import { EditorContent } from '@tiptap/react';
import { useTenTap } from '@10play/tentap-editor/src/web/useTenTap.tsx';
import { boot } from '@10play/tentap-editor/src/web/runtime.ts';

import { studiplyBridges } from '../src/editor/bridges';

declare global {
  interface Window {
    /** The editor, for the Chrome check (editor-spike.mjs), which runs this bundle without the app. */
    studiplyEditor?: ReturnType<typeof useTenTap>;
  }
}

/** TenTap's editor with Studiply's bridges: the same schema as the laptop's. */
export default function Editor() {
  const editor = useTenTap({ bridges: studiplyBridges });
  const { dynamicHeight } = boot().requireConfig();
  window.studiplyEditor = editor;

  return <EditorContent editor={editor} className={dynamicHeight ? 'tentap-root dynamic-height' : 'tentap-root'} />;
}
