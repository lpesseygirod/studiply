// cdp.mjs — a small headless-Chrome driver over the DevTools protocol.
// Uses Node's built-in WebSocket (Node 22+) and the installed Google Chrome;
// no Playwright or other dependency. Screenshots and the throwaway Chrome
// profile go to WEB_CHECK_OUT (default: <os tmp>/studiply-web-check).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const OUT = process.env.WEB_CHECK_OUT ?? join(tmpdir(), 'studiply-web-check');
export const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `micWav`: an audio file (e.g. speech from macOS `say`) that the page's
 * microphone plays, looped, instead of Chrome's fake beep. Done by
 * replacing getUserMedia with a Web Audio stream of the file, because
 * Chrome's --use-file-for-fake-audio-capture stays silent in headless mode.
 */
export async function launch({ port = 9333, width = 1280, height = 900, micWav } = {}) {
  const profile = join(OUT, `chrome-profile-${port}`);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); // fresh: no session from an earlier run
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const logs = [];
  const dialogs = [];
  const eventListeners = new Map(); // method -> [fn]
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push({ type: msg.params.type, text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push({ type: 'exception', text: msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text });
    } else if (msg.method && eventListeners.has(msg.method)) {
      for (const fn of eventListeners.get(msg.method)) fn(msg.params);
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      dialogs.push(msg.params.message);
      send('Page.handleJavaScriptDialog', { accept: true });
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Browser.grantPermissions', { permissions: ['audioCapture'] }).catch(() => {});
  if (micWav) {
    const b64 = readFileSync(micWav).toString('base64');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!constraints || !constraints.audio) return original(constraints);
          const ctx = new AudioContext();
          const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
          const buffer = await ctx.decodeAudioData(bytes.buffer);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          const out = ctx.createMediaStreamDestination();
          source.connect(out);
          source.start();
          return out.stream;
        };
      })();`,
    });
  }

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  };

  // Center of the smallest visible element whose own text matches.
  // `exclude`: a CSS selector whose contents are skipped (e.g. the laptop sidebar).
  const locate = (text, { exact = true, nth = 0, exclude = null } = {}) =>
    evaluate(`(() => {
      const want = ${JSON.stringify(text)};
      const exclude = ${JSON.stringify(exclude)};
      const all = [...document.querySelectorAll('body *')].filter((el) => {
        if (exclude && el.closest(exclude)) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
        const t = (el.innerText ?? '').trim();
        return ${exact} ? t === want : t.includes(want);
      });
      const leaves = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
      const el = leaves[${nth}];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);

  const api = {
    send, evaluate, logs, dialogs, sleep,
    async nav(url) { await send('Page.navigate', { url }); await sleep(500); },
    async waitText(text, { timeout = 15000, exact = false, exclude = null } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (await locate(text, { exact, exclude })) return true; await sleep(200); }
      throw new Error(`timed out waiting for text: ${text}`);
    },
    async hasText(text, exact = false) { return !!(await locate(text, { exact })); },
    async click(text, { button = 'left', exact = true, nth = 0, holdMs = 0, exclude = null } = {}) {
      let p = await locate(text, { exact, nth, exclude });
      if (!p && exact) p = await locate(text, { exact: false, nth, exclude });
      if (!p) throw new Error(`no element with text: ${text}`);
      await api.clickAt(p.x, p.y, { button, holdMs });
    },
    async clickAt(x, y, { button = 'left', holdMs = 0 } = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, buttons: button === 'right' ? 2 : 1 });
      if (holdMs) await sleep(holdMs);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
      await sleep(350);
    },
    /** Calls fn(params) for every CDP event `method` (e.g. 'Input.dragIntercepted'). */
    onEvent(method, fn) {
      eventListeners.set(method, [...(eventListeners.get(method) ?? []), fn]);
    },
    /**
     * A real mouse drag (left button held) from one point to another, in
     * steps. `midway(i)` runs after each step, e.g. to screenshot or check
     * the highlight while still dragging.
     */
    async mouseDrag(from, to, { steps = 12, midway } = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
        await sleep(40);
        if (midway) await midway(i);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(400);
    },
    /**
     * Moves the mouse (no button held) from one point to another in steps,
     * as a hand does: hover effects along the way see every position.
     * `midway(i, { x, y })` runs after each step.
     */
    async mouseMove(from, to, { steps = 15, pauseMs = 30, midway } = {}) {
      for (let i = 0; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await sleep(pauseMs);
        if (midway) await midway(i, { x, y });
      }
    },
    /** Presses and releases where the mouse already is (no move first). */
    async pressHere({ x, y }, { button = 'left' } = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, buttons: button === 'right' ? 2 : 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
      await sleep(350);
    },
    /**
     * The browser's own drag and drop (HTML5), through Chrome's drag
     * interception. With `files` (paths on disk) it drops files as if they
     * came from Finder; otherwise it drags the element at `from`.
     */
    async htmlDrag(from, to, { files, midway } = {}) {
      let data;
      if (files) {
        data = { items: [], files, dragOperationsMask: 1 };
      } else {
        await send('Input.setInterceptDrags', { enabled: true });
        const intercepted = new Promise((resolve) => api.onEvent('Input.dragIntercepted', (p) => resolve(p.data)));
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 4; i++) {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + i * 6, y: from.y + i * 6, button: 'left', buttons: 1 });
        }
        data = await Promise.race([intercepted, sleep(3000).then(() => null)]);
        if (!data) throw new Error('the browser did not start a drag');
      }
      await send('Input.dispatchDragEvent', { type: 'dragEnter', x: to.x, y: to.y, data });
      await send('Input.dispatchDragEvent', { type: 'dragOver', x: to.x, y: to.y, data });
      await sleep(200);
      if (midway) await midway();
      await send('Input.dispatchDragEvent', { type: 'drop', x: to.x, y: to.y, data });
      if (!files) {
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
        await send('Input.setInterceptDrags', { enabled: false });
      }
      await sleep(400);
    },
    /**
     * The browser's file picker (an <input type=file> the page clicks):
     * `trigger` opens it (e.g. clicks Upload), then these files are chosen
     * as if picked in Finder.
     */
    async chooseFiles(paths, trigger) {
      await send('Page.setInterceptFileChooserDialog', { enabled: true });
      const opened = new Promise((resolve) => api.onEvent('Page.fileChooserOpened', (p) => resolve(p)));
      await trigger();
      const chooser = await Promise.race([opened, sleep(5000).then(() => null)]);
      await send('Page.setInterceptFileChooserDialog', { enabled: false });
      if (!chooser) throw new Error('no file picker opened');
      await send('DOM.setFileInputFiles', { files: paths, backendNodeId: chooser.backendNodeId });
      await sleep(400);
    },
    /** A real double-click by visible text (the browser fires dblclick). */
    async doubleClick(text, { exact = true, nth = 0, exclude = null } = {}) {
      const p = await locate(text, { exact, nth, exclude });
      if (!p) throw new Error(`no element with text: ${text}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      for (const clickCount of [1, 2]) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount });
      }
      await sleep(500);
    },
    async clickSelector(selector) {
      const p = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!p) throw new Error(`no element: ${selector}`);
      await api.clickAt(p.x, p.y);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(150); },
    async fill(selector, text) {
      await api.clickSelector(selector);
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.(); })()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await api.type(text);
    },
    async press(key) {
      const codes = { Enter: 13, Escape: 27, Tab: 9 };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key], text: key === 'Enter' ? '\r' : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key] });
      await sleep(300);
    },
    /**
     * A key with modifiers, as the keyboard sends it: e.g. ⌥R is
     * { code: 'KeyR', key: '®', alt: true } on a Mac. `text` types a character.
     */
    /** `keyCode`: the key's code (65 for A, 49 for 1…), which editors read when ⌥ or ⇧ change `key` (⌥1 is "¡"). */
    async chord({ code, key, alt = false, shift = false, meta = false, ctrl = false, text, keyCode }) {
      const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
      const codes = keyCode ? { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode } : {};
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, ...codes });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, ...codes });
      // Release Shift as a keyboard does: editors remember a held Shift (ProseMirror pastes plain text while it is down).
      if (shift) await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', modifiers: modifiers & ~8, windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
      await sleep(400);
    },
    async shot(name) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = join(SHOTS, `${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    errors() { return logs.filter((l) => l.type === 'error' || l.type === 'exception'); },
    /** Changes the window size (the app follows live, as when dragging the window edge). */
    async resize(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(600);
    },
    /** Signs in through the onboarding screen and waits for Library. */
    async signIn(base, email, password) {
      await api.nav(base);
      await api.waitText('Sign in', { timeout: 60000 });
      await api.click('Already have an account? Sign in').catch(() => {});
      await api.fill('input[placeholder="Email"]', email);
      await api.fill('input[type="password"]', password);
      await api.click('Sign in');
      await api.waitText('COURSES', { timeout: 20000 });
      await sleep(800);
    },
    async close() {
      try { ws.close(); } catch {}
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await Promise.race([exited, sleep(3000)]);
    },
  };
  return api;
}
