import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds the iPhone's editor (the page inside TenTap's WebView) into one
 * HTML file, then wraps it as `build/editorHtml.js` for the app to import
 * (`customSource`). `npm run editor:build` once, `npm run editor:dev` to
 * rebuild on every change (Metro then reloads the app).
 */

const root = fileURLToPath(new URL('.', import.meta.url));

const wrapForTheApp: Plugin = {
  name: 'studiply-editor-html',
  closeBundle() {
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/@10play/tentap-editor/scripts/buildEditor.js', import.meta.url)),
      `${root}build/index.html`,
    ], { stdio: 'inherit' });
  },
};

// KaTeX's styles (formulas) name each font three times (woff2,
// woff, ttf); the page is one file with everything inlined, and the
// iPhone's WebView reads woff2, so the other two are left out.
const katexWoff2Only: Plugin = {
  name: 'studiply-katex-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/katex[\\/].*\.css$/.test(id)) return null;
    return code.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '');
  },
};

export default defineConfig({
  root,
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    target: 'es2019', // iOS 15 Safari and up
  },
  // One copy of React and of Tiptap/ProseMirror, also for TenTap's sources
  // (which have a private @tiptap/react in their own node_modules).
  resolve: {
    dedupe: ['react', 'react-dom', '@tiptap/core', '@tiptap/pm', '@tiptap/react'],
  },
  plugins: [katexWoff2Only, react(), viteSingleFile(), wrapForTheApp],
});
