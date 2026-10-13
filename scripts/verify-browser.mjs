import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import process from 'node:process';
const { console, URLSearchParams, fetch, WebSocket, setTimeout, clearTimeout } =
  globalThis;
import assert from 'node:assert/strict';

// This checks the real extension/browser pipeline against a deterministic local
// LanguageTool-shaped fixture, not the linguistic accuracy of LanguageTool.
const browserPath =
  process.env.CORRECTLY_BROWSER_PATH ??
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const profile = await mkdtemp(join(tmpdir(), 'correctly-v2-audit-'));
const requests = [];
let realEngine = false;
const engine = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const parameters = new URLSearchParams(body),
    text = parameters.get('text') ?? '';
  requests.push(text);
  const matches = [...text.matchAll(/\bsui\b/g)].map((match) => ({
    offset: match.index,
    length: 3,
    message: 'Orthographe',
    replacements: [{ value: 'suis' }],
    rule: {
      id: 'TEST_SPELL',
      issueType: 'misspelling',
      category: { id: 'TYPOS' },
    },
  }));
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ language: { code: 'fr' }, matches }));
});
const html =
  '<!doctype html><html><head><style>body{font:18px Arial;margin:20px}textarea,input,[contenteditable]{font:18px Arial;display:block;width:500px;min-height:32px;margin:10px;padding:8px}#shadow{overflow:hidden;width:400px}iframe{width:550px;height:130px}</style></head><body><textarea id="native">Je sui ici.</textarea><div id="rich" contenteditable="true"><p>Je <b>su</b><i>i</i> ici.</p></div><input id="email" type="email" value="Je sui ici."><input id="secret" type="password" value="private sui"><div id="shadow"></div><iframe src="/frame"></iframe><script>const root=document.querySelector("#shadow").attachShadow({mode:"open"});root.innerHTML="<style>textarea{font:18px Arial;width:500px;height:50px}</style><textarea>Je sui ici.</textarea>";</script></body></html>';
const site = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(
    _request.url === '/frame'
      ? '<textarea style="font:18px Arial;width:450px;height:60px">Je sui ici.</textarea>'
      : html,
  );
});
const listen = (server, port) =>
  new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', done);
  });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let browser, socket, workerSocket;
let sequence = 0;
const pending = new Map(),
  errors = [];
const call = (method, params = {}) =>
  new Promise((done, fail) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      fail(new Error('CDP timeout: ' + method));
    }, 10000);
    pending.set(id, { done, fail, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.text +
        ': ' +
        JSON.stringify(result.exceptionDetails.exception),
    );
  return result.result.value;
};
const until = async (expression) => {
  for (let i = 0; i < 60; i++) {
    const result = await evaluate(expression);
    if (result) return result;
    await delay(100);
  }
  throw new Error('Browser condition timed out: ' + expression);
};
const lines =
  '[...document.querySelectorAll("[data-correctly-ui]")].flatMap(host=>[...host.shadowRoot.querySelectorAll("div")]).filter(node=>node.style.borderBottomStyle === "dotted")';
const dialogs =
  '[...document.querySelectorAll("[data-correctly-ui]")].map(host=>host.shadowRoot.querySelector("[role=dialog]")).filter(Boolean)';
const click = async (x, y) => {
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
};
const correct = async (setup, read, expected) => {
  await evaluate(setup);
  const point = await until(
    '(()=>{const node=(' +
      lines +
      ')[0];if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y-2};})()',
  );
  await click(point.x, point.y);
  const button = await until(
    '(()=>{const dialog=(' +
      dialogs +
      ')[0];if(!dialog)return null;const r=dialog.querySelector("button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',
  );
  await click(button.x, button.y);
  await until('(' + read + ') === ' + JSON.stringify(expected));
  assert.equal(await evaluate(dialogs + '.length'), 0);
};
try {
  try {
    await listen(engine, 8081);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const health = await fetch('http://127.0.0.1:8081/v2/languages');
    assert.ok(
      health.ok && Array.isArray(await health.json()),
      'Port 8081 is occupied by something other than LanguageTool',
    );
    realEngine = true;
  }
  await listen(site, 0);
  console.log(
    realEngine
      ? 'Using existing real LanguageTool server (left running).'
      : 'Using deterministic local engine fixture.',
  );
  browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--disable-extensions-except=' + resolve('dist'),
      '--load-extension=' + resolve('dist'),
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  browser.on('error', (error) => errors.push(error.message));
  let port;
  for (let i = 0; i < 80; i++) {
    try {
      port = (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[0];
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port, 'Browser failed to start: ' + errors.join(';'));
  let page;
  for (let attempt = 0; attempt < 60; attempt++) {
    const pages = await (
      await fetch('http://127.0.0.1:' + port + '/json/list')
    ).json();
    page = pages.find((target) => target.type === 'page');
    if (page) break;
    await delay(100);
  }
  assert.ok(page, 'No browser page');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', fail, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      message.error
        ? entry.fail(new Error(message.error.message))
        : entry.done(message.result);
    } else if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    const targets = await (
      await fetch('http://127.0.0.1:' + port + '/json/list')
    ).json();
    const worker = targets.find(
      (target) =>
        target.type === 'service_worker' &&
        target.url.endsWith('/service-worker.js'),
    );
    if (worker) {
      workerSocket = new WebSocket(worker.webSocketDebuggerUrl);
      await new Promise((done, fail) => {
        workerSocket.addEventListener('open', done, { once: true });
        workerSocket.addEventListener('error', fail, { once: true });
      });
      workerSocket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (
          message.method === 'Network.requestWillBeSent' &&
          message.params.request.postData
        ) {
          const text = new URLSearchParams(message.params.request.postData).get(
            'text',
          );
          if (text) requests.push(text);
        }
      });
      await new Promise((done, fail) => {
        const timer = setTimeout(
          () => fail(new Error('Worker Network.enable timed out')),
          5000,
        );
        const enabled = (event) => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          clearTimeout(timer);
          workerSocket.removeEventListener('message', enabled);
          message.error ? fail(new Error(message.error.message)) : done();
        };
        workerSocket.addEventListener('message', enabled);
        workerSocket.send(
          JSON.stringify({
            id: 1,
            method: 'Network.enable',
            params: { maxPostDataSize: 10000 },
          }),
        );
      });
      break;
    }
    await delay(100);
  }
  assert.ok(workerSocket, 'Extension service worker not found');
  console.log('Browser: ' + (await call('Browser.getVersion')).product);
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.navigate', {
    url: 'http://127.0.0.1:' + site.address().port + '/',
  });
  await until('document.querySelectorAll("[data-correctly-ui]").length === 1');
  console.log('PASS extension loaded without scanning untouched fields');
  await correct(
    'document.querySelector("#native").focus()',
    'document.querySelector("#native").value',
    'Je suis ici.',
  );
  console.log(
    'PASS native underline, real popup click, replacement and cleanup',
  );
  await correct(
    'document.querySelector("#rich").focus()',
    'document.querySelector("#rich").innerText',
    'Je suis ici.',
  );
  console.log('PASS rich cross-leaf browser insertion');
  await correct(
    'document.querySelector("#shadow").shadowRoot.querySelector("textarea").focus()',
    'document.querySelector("#shadow").shadowRoot.querySelector("textarea").value',
    'Je suis ici.',
  );
  console.log('PASS open Shadow DOM correction');
  await correct(
    'document.querySelector("#email").focus()',
    'document.querySelector("#email").value',
    'Je suis ici.',
  );
  console.log('PASS email correction without unsupported selection APIs');
  await evaluate(
    'document.querySelector("#secret").focus(); document.querySelector("#secret").dispatchEvent(new InputEvent("input",{bubbles:true}))',
  );
  await delay(400);
  assert.ok(!requests.some((text) => text.includes('private')));
  assert.equal(await evaluate(lines + '.length'), 0);
  console.log('PASS password privacy and inactive overlay cleanup');
  const frame = await until(
    '(()=>{const doc=document.querySelector("iframe").contentDocument; return doc?.querySelector("[data-correctly-ui]") ? true : false;})()',
  );
  assert.ok(frame);
  await evaluate(
    'document.querySelector("iframe").contentDocument.querySelector("textarea").focus()',
  );
  await until(
    '(()=>{const doc=document.querySelector("iframe").contentDocument;return [...doc.querySelectorAll("[data-correctly-ui]")].some(host=>[...host.shadowRoot.querySelectorAll("div")].some(node=>node.style.borderBottomStyle === "dotted"));})()',
  );
  console.log('PASS content script and underlines in permitted iframe');
  await evaluate(
    'document.querySelector("#native").focus();document.querySelector("#native").dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));document.querySelector("#native").value="Je sui ici IME unique.";document.querySelector("#native").dispatchEvent(new InputEvent("input",{bubbles:true,isComposing:true}));',
  );
  await delay(400);
  assert.ok(!requests.includes('Je sui ici IME unique.'));
  assert.equal(await evaluate(lines + '.length'), 0);
  await evaluate(
    'document.querySelector("#native").dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}))',
  );
  await until(lines + '.length > 0');
  assert.ok(requests.includes('Je sui ici IME unique.'));
  console.log('PASS IME pause and resumed analysis');
  await evaluate('document.querySelector("#native").remove()');
  await until(lines + '.length === 0');
  await correct(
    '(()=>{const field=document.createElement("textarea");field.id="large";field.value="a".repeat(5100)+"\\nJe sui ici.";document.body.prepend(field);field.setSelectionRange(field.value.length,field.value.length);field.focus();})()',
    'document.querySelector("#large").value',
    'a'.repeat(5100) + '\nJe suis ici.',
  );
  assert.ok(requests.every((text) => text.length <= 5000));
  console.log('PASS dynamic large editor with paragraph-local analysis');
  assert.deepEqual(errors, []);
  console.log('PASS removed editor cleanup; no JavaScript exceptions');
  console.log(
    'Browser audit passed (' +
      (realEngine
        ? 'real LanguageTool'
        : 'deterministic local engine fixture') +
      ').',
  );
} finally {
  socket?.close();
  workerSocket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise((done) => browser.once('exit', done)),
      delay(5000),
    ]);
  }
  for (const server of [site, engine]) {
    server.closeAllConnections();
    if (server.listening) await new Promise((done) => server.close(done));
  }
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.fail(new Error('Browser audit closed'));
  }
  // Only the exact isolated profile created above is removed.
  assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
  assert.ok(profile.split(/[\\/]/).at(-1).startsWith('correctly-v2-audit-'));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 300,
  });
}
