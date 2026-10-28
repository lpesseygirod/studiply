import React from 'react';
import { createRoot } from 'react-dom/client';
import { BOOT_CONFIG_GLOBAL, buildBootConfig } from '@10play/tentap-editor/src/shared/bootConfig.ts';
import { boot } from '@10play/tentap-editor/src/web/runtime.ts';
import 'katex/dist/katex.min.css';

import { studiplyBridges } from '../src/editor/bridges';
import Editor from './Editor';

/**
 * The editor that runs inside the iPhone's WebView (step 4.2). TenTap's
 * native side inlines the boot config before this bundle; the runtime waits
 * for (and reports) a config that arrives late or never.
 *
 * Opened as a plain page with `?standalone` (the Chrome check), it configures
 * itself the way the app does: the same bridges, through TenTap's own
 * buildBootConfig. Inside the WebView the page has no such query.
 */
const win = window as unknown as Record<string, unknown>;
if (new URLSearchParams(window.location.search).has('standalone') && !win[BOOT_CONFIG_GLOBAL]) {
  win[BOOT_CONFIG_GLOBAL] = buildBootConfig({ editorId: 'standalone', bridges: studiplyBridges, platform: 'ios' });
}

const runtime = boot();
runtime.whenConfigured(() => {
  try {
    createRoot(document.getElementById('root')!).render(<Editor />);
  } catch (error) {
    runtime.reportBootError(error);
    throw error;
  }
});
