// cdp.mjs — a small headless-Chrome driver over the DevTools protocol.
// Uses Node's built-in WebSocket (Node 22+) and the installed Google Chrome;
// no Playwright or other dependency. Screenshots and the throwaway Chrome
// profile go to WEB_CHECK_OUT (default: <os tmp>/studiply-web-check).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const OUT = process.env.WEB_CHECK_OUT ?? join(tmpdir(), 'studiply-web-check');
export const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333, width = 1280, height = 900 } = {}) {
  const profile = join(OUT, `chrome-profile-${port}`);
  rmSync(profile, { recursive: true, force: true }); // fresh: no session from an earlier run
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank',
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

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  };

  // Center of the smallest visible element whose own text matches.
  const locate = (text, { exact = true, nth = 0 } = {}) =>
    evaluate(`(() => {
      const want = ${JSON.stringify(text)};
      const all = [...document.querySelectorAll('body *')].filter((el) => {
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
    async waitText(text, { timeout = 15000, exact = false } = {}) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (await locate(text, { exact })) return true; await sleep(200); }
      throw new Error(`timed out waiting for text: ${text}`);
    },
    async hasText(text, exact = false) { return !!(await locate(text, { exact })); },
    async click(text, { button = 'left', exact = true, nth = 0, holdMs = 0 } = {}) {
      let p = await locate(text, { exact, nth });
      if (!p && exact) p = await locate(text, { exact: false, nth });
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
    async shot(name) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = join(SHOTS, `${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    errors() { return logs.filter((l) => l.type === 'error' || l.type === 'exception'); },
    /** Signs in through the onboarding screen and waits for Home. */
    async signIn(base, email, password) {
      await api.nav(base);
      await api.waitText('Sign in', { timeout: 60000 });
      await api.click('Already have an account? Sign in').catch(() => {});
      await api.fill('input[placeholder="Email"]', email);
      await api.fill('input[type="password"]', password);
      await api.click('Sign in');
      await api.waitText('WORKPLACE', { timeout: 20000 });
      await sleep(800);
    },
    async close() { try { ws.close(); } catch {} proc.kill(); },
  };
  return api;
}
