// Real-browser smoke test for V5.3 (V5.1 checklist steps 3–6, 8, 9, 11, 15,
// the V5.2 content script, V5.3 shortcut/smart button, V5.4 rewrite and
// V5.5 translation and V5.6 text shortcuts).
// Loads dist/ unpacked in a throwaway profile, drives the settings page over
// the Chrome DevTools Protocol and records network/console evidence.
//
//   node scripts/verify-browser.mjs [--browser=brave|chrome|<path>] [--offline]
//
// Without --offline, ONE request is sent to Google with a dummy key (expected
// answer: invalid key). It cannot succeed or cost anything. No real key is used.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
const { console, fetch, WebSocket, setTimeout, clearTimeout } = globalThis;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);
const BROWSERS = {
  brave: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
};
const browserName = typeof args.browser === 'string' ? args.browser : 'brave';
const browserPath = BROWSERS[browserName] ?? browserName;
const offline = Boolean(args.offline);
const extensionPath = resolve('dist');
const DUMMY_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_dummy_000000';
const profile = await mkdtemp(join(tmpdir(), 'correctly-v56-'));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

const evidence = {
  browser: browserName,
  browserVersion: null,
  date: new Date().toISOString(),
  offline,
  steps: [],
  networkRequests: [],
  consoleMessages: [],
};
const step = (id, result, detail) => {
  evidence.steps.push({ id, result, detail });
  console.log(`${result.padEnd(7)} ${id} — ${detail}`);
};

class Session {
  constructor(url, label) {
    this.label = label;
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.handlers = [];
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else done(message.result);
      } else if (message.method)
        for (const handler of this.handlers) handler(message);
    });
    this.ready = new Promise((done, fail) => {
      this.socket.addEventListener('open', done, { once: true });
      this.socket.addEventListener('error', fail, { once: true });
    });
  }
  on(handler) {
    this.handlers.push(handler);
  }
  call(method, params = {}) {
    return new Promise((done, fail) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`CDP timeout (${this.label}): ${method}`));
      }, 20000);
      this.pending.set(id, { done, fail, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  async until(expression, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await this.evaluate(expression).catch(() => null);
      if (value) return value;
      await delay(100);
    }
    throw new Error(`Timed out (${this.label}): ${expression}`);
  }
  close() {
    this.socket.close();
  }
}

let browser, port, page, worker;
const json = async (path, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json();

function watch(session, source) {
  session.on((message) => {
    if (message.method === 'Network.requestWillBeSent')
      evidence.networkRequests.push({
        source,
        method: message.params.request.method,
        url: message.params.request.url,
        headerNames: Object.keys(message.params.request.headers ?? {}),
      });
    if (message.method === 'Runtime.consoleAPICalled')
      evidence.consoleMessages.push({
        source,
        type: message.params.type,
        text: message.params.args
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' '),
      });
  });
}

async function attachWorker(extensionId, tries = 100) {
  let target;
  for (let i = 0; i < tries && !target; i++) {
    target = (await json('/json/list')).find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith(`chrome-extension://${extensionId}/`),
    );
    if (!target) await delay(100);
  }
  if (!target) return null;
  worker?.close();
  worker = new Session(target.webSocketDebuggerUrl, 'worker');
  await worker.ready;
  watch(worker, 'service-worker');
  await worker.call('Network.enable');
  await worker.call('Runtime.enable');
  return worker;
}

const text = (id) =>
  `document.getElementById(${JSON.stringify(id)}).textContent.trim()`;
const loaded = `location.protocol === 'chrome-extension:' && typeof chrome !== 'undefined' && !!chrome.runtime?.id && document.getElementById('app')?.getAttribute('aria-busy') === 'false'`;
// Chrome blocks CDP navigation to chrome-extension:// URLs, so the page is
// opened the way the toolbar button does it and later only reloaded.
async function openOptions() {
  // Mark the current document so the wait below only accepts the new one.
  await page.evaluate('window.__beforeReload = true').catch(() => {});
  await page.call('Page.reload', { ignoreCache: true });
  await page.until(`!window.__beforeReload && ${loaded}`);
}
async function clickTest() {
  const before = await page.evaluate(
    `document.getElementById('test-result').textContent`,
  );
  await page.evaluate(`document.getElementById('test').click()`);
  await page.until(
    `!document.getElementById('test').disabled && !document.getElementById('test-result').hidden && document.getElementById('test-result').textContent !== ${JSON.stringify(before)}`,
    30000,
  );
  return page.evaluate(text('test-result'));
}
// An ignored message wakes an idle worker so its network can be recorded.
async function wakeWorker(extensionId) {
  await page.evaluate(
    `chrome.runtime.sendMessage({ type: 'correctly.v5.wake' }).catch(() => null)`,
  );
  assert(await attachWorker(extensionId), 'service worker did not start');
}
const googleRequests = () =>
  evidence.networkRequests.filter((request) =>
    request.url.startsWith('https://generativelanguage.googleapis.com/'),
  );

let exitCode = 0;
try {
  browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--remote-debugging-port=0',
      // Branded Chrome ignores --load-extension since v137; it loads the
      // extension below through CDP Extensions.loadUnpacked over the pipe.
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--user-data-dir=' + profile,
      // Branded Chrome rejects (and then blocks) command-line extensions.
      ...(browserName === 'chrome'
        ? []
        : [
            '--disable-extensions-except=' + extensionPath,
            '--load-extension=' + extensionPath,
          ]),
      'about:blank',
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    },
  );
  const pipeCall = (method, params) =>
    new Promise((done, fail) => {
      let buffer = '';
      const output = browser.stdio[4];
      const timer = setTimeout(() => fail(new Error('pipe timeout')), 10000);
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        for (const raw of buffer.split('\0').slice(0, -1)) {
          const message = JSON.parse(raw);
          if (message.id !== 1) continue;
          clearTimeout(timer);
          output.off('data', onData);
          if (message.error) fail(new Error(message.error.message));
          else done(message.result);
        }
        buffer = buffer.slice(buffer.lastIndexOf('\0') + 1);
      };
      output.on('data', onData);
      browser.stdio[3].write(JSON.stringify({ id: 1, method, params }) + '\0');
    });
  for (let i = 0; i < 100 && !port; i++) {
    port = await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      .then((data) => data.split('\n')[0])
      .catch(() => null);
    if (!port) await delay(100);
  }
  assert(port, 'Browser did not expose a DevTools port');
  evidence.browserVersion = (await json('/json/version')).Browser;

  // Step 3: the extension's service worker is registered.
  let extensionId;
  await delay(1500);
  const alreadyLoaded = (await json('/json/list')).some(
    (item) =>
      item.type === 'service_worker' && item.url.endsWith('/service-worker.js'),
  );
  if (!alreadyLoaded)
    extensionId = (
      await pipeCall('Extensions.loadUnpacked', { path: extensionPath })
    ).id;
  for (let i = 0; i < 100 && !extensionId; i++) {
    const target = (await json('/json/list')).find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith('chrome-extension://') &&
        item.url.endsWith('/service-worker.js'),
    );
    extensionId = target?.url.split('/')[2];
    if (!extensionId) await delay(100);
  }
  assert(extensionId, 'Extension not loaded (was dist/ built?)');
  step('M3', 'PASS', `extension loaded (${extensionId})`);

  const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
  // Brave starts the worker at install; Chrome may keep it idle until an event.
  // A just-listed worker may not have its script context yet; wait briefly.
  const opened =
    (await attachWorker(extensionId, 20)) &&
    (await worker
      .until(`typeof chrome !== 'undefined' && !!chrome.runtime?.id`, 5000)
      .then(() => worker.evaluate('chrome.runtime.openOptionsPage()'))
      .then(() => true)
      .catch(() => false));
  if (!opened) await json('/json/new?' + optionsUrl, 'PUT');
  let pageTarget;
  for (let i = 0; i < 100 && !pageTarget; i++) {
    pageTarget = (await json('/json/list')).find(
      (item) => item.type === 'page' && item.url === optionsUrl,
    );
    if (!pageTarget) await delay(100);
  }
  assert(pageTarget, 'Options page did not open');
  page = new Session(pageTarget.webSocketDebuggerUrl, 'options');
  await page.ready;
  watch(page, 'options-page');
  await page.call('Page.enable');
  await page.call('Network.enable');
  await page.call('Runtime.enable');
  await page.call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.confirm = () => true;',
  });
  await openOptions();
  await wakeWorker(extensionId);
  const manifest = await page.evaluate('chrome.runtime.getManifest()');
  assert.equal(manifest.version, '5.6.0');
  assert.equal(manifest.name, 'Correctly V5.6');
  const command = (
    await page.evaluate(
      `chrome.commands.getAll().then((all) => all.map(({ name, shortcut }) => ({ name, shortcut })))`,
    )
  ).find((item) => item.name === 'correct-selection');
  assert(command, 'correct-selection command must be registered');
  step(
    'K05',
    'PASS',
    `command registered; shortcut reported: ${command.shortcut || 'none (automated profiles may not assign suggested keys; check chrome://extensions/shortcuts manually)'}`,
  );

  // Step 4.
  assert.equal(await page.evaluate(text('status-label')), 'Not configured');
  assert.equal(
    await page.evaluate(`document.getElementById('daily-limit').value`),
    '20',
  );
  assert.equal(await page.evaluate(text('usage-attempted')), '0 of 20');
  step('M4', 'PASS', 'settings open: Not configured, daily cap 20');

  // Step 6: no key → blocked before any network access.
  const noKey = await clickTest();
  assert.match(noKey, /No Gemini API key is saved/);
  assert.equal(googleRequests().length, 0);
  step('M6', 'PASS', 'Test without key refused locally, zero network requests');

  // Step 5: dummy key save → reopen → masked "Configured".
  await page.evaluate(`(() => {
    const input = document.getElementById('api-key');
    input.value = ${JSON.stringify(DUMMY_KEY)};
    document.getElementById('save-key').click();
  })()`);
  await page.until(`${text('status-label')} === 'Configured'`);
  await openOptions();
  assert.equal(await page.evaluate(text('status-label')), 'Configured');
  assert.equal(
    await page.evaluate(`document.getElementById('api-key').type`),
    'password',
  );
  assert.equal(
    await page.evaluate(`document.getElementById('api-key').value`),
    '',
  );
  assert.equal(
    await page.evaluate(
      `document.documentElement.outerHTML.includes(${JSON.stringify(DUMMY_KEY)})`,
    ),
    false,
  );
  step(
    'M5a',
    'PASS',
    'dummy key saved; after reopen shows Configured, key not in DOM',
  );

  if (!offline) {
    const result = await clickTest();
    const requests = googleRequests();
    assert.equal(requests.length, 1, 'exactly one request to Google expected');
    const [request] = requests;
    assert.equal(
      request.source,
      'service-worker',
      'request must come from the worker',
    );
    assert.match(
      request.url,
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite:generateContent$/,
    );
    assert(!request.url.includes(DUMMY_KEY), 'key must not be in the URL');
    assert(
      request.headerNames.some(
        (name) => name.toLowerCase() === 'x-goog-api-key',
      ),
    );
    assert.match(result, /Invalid key|Offline|network/i);
    assert.equal(
      await page.evaluate(text('status-label')),
      'Connection failed',
    );
    assert.equal(await page.evaluate(text('usage-attempted')), '1 of 20');
    step(
      'M5b',
      'PASS',
      `dummy key → one worker request to Google; UI shows: ${result}`,
    );
  } else
    step('M5b', 'SKIPPED', '--offline: dummy-key request to Google not sent');

  // Step 8: cap 1 → blocked; reload → still blocked.
  const used = offline ? 0 : 1;
  await page.evaluate(`(() => {
    document.getElementById('daily-limit').value = '1';
    document.getElementById('save-limit').click();
  })()`);
  await page.until(`${text('usage-attempted')} === '${used} of 1'`);
  if (offline) {
    step('M8', 'SKIPPED', '--offline: cap test needs one dispatched attempt');
  } else {
    const blocked = await clickTest();
    assert.match(blocked, /Daily local limit reached/);
    await openOptions();
    assert.match(await clickTest(), /Daily local limit reached/);
    assert.equal(
      googleRequests().length,
      1,
      'blocked tests must not hit the network',
    );
    step(
      'M8',
      'PASS',
      'cap 1: second test refused locally, also after reload; still 1 request',
    );
  }

  // Step 9: stop the service worker, wake it with a message, state persists.
  await page.call('ServiceWorker.enable');
  await page.call('ServiceWorker.stopAllWorkers');
  await delay(500);
  await openOptions();
  assert.equal(
    await page.evaluate(text('status-label')),
    offline ? 'Configured' : 'Connection failed',
  );
  assert.equal(
    await page.evaluate(`document.getElementById('daily-limit').value`),
    '1',
  );
  await wakeWorker(extensionId);
  const afterRestart = await clickTest();
  if (!offline) {
    assert.match(afterRestart, /Daily local limit reached/);
    assert.equal(googleRequests().length, 1);
  }
  step(
    'M9',
    'PASS',
    `worker stopped and woken by message; persisted settings/count respected (${afterRestart})`,
  );

  // Step 14: narrow width, keyboard order, screenshots (no key is on screen).
  for (const width of [360, 900]) {
    await page.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(300);
    const overflow = await page.evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    );
    assert(overflow <= 0, `horizontal overflow of ${overflow}px at ${width}px`);
    const shot = await page.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await mkdir('docs/v5.6/evidence', { recursive: true });
    await writeFile(
      `docs/v5.6/evidence/options-${browserName}-${width}.png`,
      Buffer.from(shot.data, 'base64'),
    );
  }
  await page.call('Emulation.clearDeviceMetricsOverride');
  const focusOrder = [];
  await page.evaluate('document.activeElement?.blur()');
  for (let i = 0; i < 9; i++) {
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    focusOrder.push(
      await page.evaluate(
        'document.activeElement.id || document.activeElement.tagName',
      ),
    );
  }
  assert(
    focusOrder.includes('api-key') && focusOrder.includes('test'),
    'keyboard reaches key field and Test',
  );
  step(
    'M14',
    'PASS',
    `no horizontal overflow at 360/900px; Tab order: ${focusOrder.join(' → ')}`,
  );

  // Remove key → Not configured.
  await page.evaluate(`document.getElementById('remove-key').click()`);
  await page.until(`${text('status-label')} === 'Not configured'`);
  step('M6b', 'PASS', 'Remove key → Not configured');

  // Step 11: a regular page gets nothing injected.
  await page.call('Page.navigate', {
    url: 'data:text/html,<textarea id=t>Je sui ici</textarea><div contenteditable id=c>helo</div>',
  });
  await page.until(`document.readyState === 'complete'`);
  await page.evaluate(
    `(() => { const t = document.getElementById('t'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); })()`,
  );
  await page.call('Input.insertText', { text: ' teh mistake' });
  await delay(1500);
  const injected = await page.evaluate(
    `[...document.querySelectorAll('*')].filter(n => n.shadowRoot || n.hasAttribute('data-correctly-ui')).length + document.body.children.length`,
  );
  assert.equal(injected, 2, 'page DOM must be untouched');
  assert.equal(
    await page.evaluate(`document.getElementById('t').value`),
    'Je sui ici teh mistake',
  );
  step('M11', 'PASS', 'regular page: no injected UI, text unchanged');

  // V5.2: the built content script on a real textarea. The toolbar click
  // cannot be automated over CDP, so the worker reply is stubbed here.
  const bundle = await readFile(join(extensionPath, 'content.js'), 'utf8');
  const value = `document.getElementById('t').value`;
  await page.evaluate(
    `(() => { const t = document.getElementById('t'); t.value = 'Bonjour. Je suis aller a Lyon. Fin'; t.focus(); t.setSelectionRange(9, 30); })()`,
  );
  await page.evaluate(
    `globalThis.chrome = { runtime: { sendMessage: async (message) => (globalThis.sentMessage = message, { ok: true, hasErrors: true, correctedText: 'Je suis allé à Lyon.', suspicious: false }) } }; ${bundle}; globalThis.correctlyRun('correct', []); void 0`,
  );
  await page.until(`globalThis.correctlyPanel?.busy === false`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessage'), {
    type: 'correctly.v5.correctText',
    text: 'Je suis aller a Lyon.',
  });
  assert.equal(
    await page.evaluate(value),
    'Bonjour. Je suis aller a Lyon. Fin',
    'nothing may change before Apply',
  );
  assert.equal(
    await page.evaluate('globalThis.correctlyPanel.host.shadowRoot'),
    null,
    'panel shadow root must be closed',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(await page.evaluate(value), 'Bonjour. Je suis allé à Lyon. Fin');
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    'Bonjour. Je suis aller a Lyon. Fin',
  );
  step(
    'C01',
    'PASS',
    'content.js: exact selection sent, no change before Apply, Apply/Undo exact range, closed panel',
  );

  // V5.3: the built smart-button script with real layout (worker stubbed).
  const smartBundle = await readFile(join(extensionPath, 'smart.js'), 'utf8');
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    document.activeElement?.blur();
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => message.type === 'correctly.v5.pageConfig'
        ? { smartButton: true, shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }] }
        : (globalThis.sentMessage = message, { ok: true, hasErrors: false }) } };
  })()`);
  await page.evaluate(`${smartBundle}; void 0`);
  const buttons = `document.querySelectorAll('correctly-smart-button').length`;
  assert.equal(await page.evaluate(buttons), 0, 'no button before focus');
  await page.evaluate(`document.getElementById('t').focus()`);
  await page.until(`${buttons} === 1`);
  const inside = await page.evaluate(`(() => {
    const b = globalThis.correctlySmartButton.button.getBoundingClientRect();
    const t = document.getElementById('t').getBoundingClientRect();
    return b.width > 0 && b.left >= t.left && b.right <= t.right && b.top >= t.top && b.bottom <= t.bottom;
  })()`);
  assert(inside, 'button must sit inside the focused field');
  await page.evaluate(`document.getElementById('c').focus()`);
  await page.until(`${buttons} === 0`);
  await page.evaluate(
    `(() => { const t = document.getElementById('t'); t.focus(); t.setSelectionRange(9, 30); globalThis.sentMessage = null; })()`,
  );
  await page.evaluate('globalThis.correctlySmartButton.correct()');
  await page.until(`globalThis.correctlyPanel?.busy === false`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessage'), {
    type: 'correctly.v5.correctText',
    text: 'Je suis aller a Lyon.',
  });
  assert.match(
    await page.evaluate('globalThis.correctlyPanel.root.textContent'),
    /No corrections needed/,
  );
  step(
    'C02',
    'PASS',
    'smart.js: one button on focus inside the field, hidden on blur, exact selection sent once',
  );

  // V5.6: real typing (trusted input events over CDP) expands a shortcut
  // locally, keeps the separator and the caret, and sends nothing.
  await page.evaluate(
    `(() => { globalThis.correctlyPanel?.close(); const t = document.getElementById('t'); t.value = ''; t.focus(); globalThis.sentMessage = null; })()`,
  );
  await page.call('Input.insertText', { text: 'Salut bjr' });
  await page.call('Input.insertText', { text: ',' });
  await page.until(`document.getElementById('t').value === 'Salut Bonjour,'`);
  assert.equal(
    await page.evaluate(`document.getElementById('t').selectionStart`),
    'Salut Bonjour,'.length,
  );
  await page.call('Input.insertText', { text: ' abjr ' });
  await delay(200);
  assert.equal(
    await page.evaluate(`document.getElementById('t').value`),
    'Salut Bonjour, abjr ',
    'a partial word must not expand',
  );
  assert.equal(await page.evaluate('globalThis.sentMessage'), null);
  step(
    'C05',
    'PASS',
    'shortcut: real typed "bjr," → "Bonjour," locally, caret after separator, "abjr" untouched, nothing sent',
  );

  // V5.4: rewrite picker and cards with real layout (worker stubbed, the
  // reply deliberately in a different order than requested).
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const t = document.getElementById('t');
    t.value = "I can't attend the meeting tomorrow.";
    t.focus(); t.setSelectionRange(0, t.value.length);
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => message.type === 'correctly.v5.pageConfig' ? {} : (globalThis.sentMessages.push(message), { ok: true, missing: [], candidates: [
        { styleId: 'concise', text: "Can't attend tomorrow.", suspicious: false },
        { styleId: 'formal', text: 'I am unable to attend the meeting tomorrow.', suspicious: false } ] }) } };
    globalThis.correctlyRun('rewrite', ['formal', 'concise']);
  })()`);
  const rewritePanel = 'globalThis.correctlyPanel.root';
  assert.equal(
    await page.evaluate(
      `${rewritePanel}.querySelectorAll('fieldset input:checked').length`,
    ),
    2,
  );
  assert.equal(
    await page.evaluate('globalThis.sentMessages.length'),
    0,
    'opening the picker must not send',
  );
  await page.evaluate(
    `[...${rewritePanel}.querySelectorAll('button')].find((b) => b.textContent === 'Generate rewrites').click()`,
  );
  await page.until(`${rewritePanel}.querySelectorAll('.card').length === 2`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessages'), [
    {
      type: 'correctly.v5.rewriteText',
      text: "I can't attend the meeting tomorrow.",
      styleIds: ['formal', 'concise'],
    },
  ]);
  assert.deepEqual(
    await page.evaluate(
      `[...${rewritePanel}.querySelectorAll('.card strong')].map((n) => n.textContent)`,
    ),
    ['Formal', 'Concise'],
  );
  await page.evaluate(
    `${rewritePanel}.querySelectorAll('.card input')[1].click()`,
  );
  assert.equal(
    await page.evaluate(value),
    "I can't attend the meeting tomorrow.",
    'choosing a card must not edit',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(await page.evaluate(value), "Can't attend tomorrow.");
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    "I can't attend the meeting tomorrow.",
  );
  step(
    'C03',
    'PASS',
    'rewrite: picker sends nothing, one request for 2 styles, cards in requested order, chosen card applied, undo',
  );

  // V5.5: translation picker with real layout and RTL output (worker stubbed).
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const t = document.getElementById('t');
    t.value = 'Salut, tu peux me dire quand tu seras libre demain ?';
    t.focus(); t.setSelectionRange(0, t.value.length);
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => message.type === 'correctly.v5.pageConfig' ? {} : (globalThis.sentMessages.push(message), { ok: true, missing: [], candidates: [
        { styleId: 'neutral', text: 'مرحبا، فيك تقلي إمتى رح تكون فاضي بكرا؟', suspicious: false } ] }) } };
    globalThis.correctlyRun('translate', ['professional'], { source: 'auto', target: 'ar', arabicVariant: 'syrian' });
  })()`);
  const tPanel = 'globalThis.correctlyPanel.root';
  assert.equal(await page.evaluate('globalThis.sentMessages.length'), 0);
  await page.evaluate(
    `[...${tPanel}.querySelectorAll('button')].find((b) => b.textContent === 'Translate').click()`,
  );
  await page.until(`${tPanel}.querySelectorAll('.card').length === 1`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessages'), [
    {
      type: 'correctly.v5.translateText',
      text: 'Salut, tu peux me dire quand tu seras libre demain ?',
      source: 'auto',
      target: 'ar',
      variant: 'syrian',
      styleIds: [],
    },
  ]);
  assert.equal(
    await page.evaluate(
      `getComputedStyle(${tPanel}.querySelector('.card .text')).direction`,
    ),
    'rtl',
    'Arabic result must render right-to-left',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(
    await page.evaluate(value),
    'مرحبا، فيك تقلي إمتى رح تكون فاضي بكرا؟',
  );
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    'Salut, tu peux me dire quand tu seras libre demain ?',
  );
  step(
    'C04',
    'PASS',
    'translate: picker sends nothing, one request (auto → Arabic Syrian), RTL result, exact Apply/Undo',
  );

  // Step 15: no console output containing the key; only approved hosts.
  const leaked = evidence.consoleMessages.filter((item) =>
    item.text.includes(DUMMY_KEY),
  );
  assert.equal(leaked.length, 0);
  const external = evidence.networkRequests.filter(
    (request) =>
      !request.url.startsWith('chrome-extension://') &&
      !request.url.startsWith('data:') &&
      !request.url.startsWith('https://generativelanguage.googleapis.com/'),
  );
  assert.deepEqual(external, [], 'unexpected hosts contacted');
  step(
    'M15',
    'PASS',
    `${evidence.consoleMessages.length} console messages, none with the key; only Google API contacted`,
  );
} catch (error) {
  exitCode = 1;
  step('ERROR', 'FAIL', error instanceof Error ? error.message : String(error));
  if (page)
    console.log(
      'page state:',
      await page
        .evaluate(
          'location.href + " | " + document.title + " | " + document.body?.innerText?.slice(0, 200)',
        )
        .catch((e) => e.message),
    );
} finally {
  page?.close();
  worker?.close();
  browser?.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await mkdir('docs/v5.6/evidence', { recursive: true });
  const out = `docs/v5.6/evidence/browser-${browserName}.json`;
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
  console.log('Evidence written to ' + out);
  process.exit(exitCode);
}
