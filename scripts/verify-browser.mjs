import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import process from 'node:process';
const {
  console,
  URL,
  URLSearchParams,
  fetch,
  WebSocket,
  setTimeout,
  clearTimeout,
} = globalThis;
import assert from 'node:assert/strict';

// This checks the real extension/browser pipeline against a deterministic local
// LanguageTool-shaped fixture, not the linguistic accuracy of LanguageTool.
const browserPath =
  process.env.CORRECTLY_BROWSER_PATH ??
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const extensionPath = resolve(process.env.CORRECTLY_EXTENSION_PATH ?? 'dist');
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
let extensionBase;
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
const chooseSentenceChange = async (fragment = null) => {
  const point = await until(`(() => {
    const panel=(${dialogs})[0];
    const label=[...panel?.querySelectorAll('fieldset label')??[]].find(node=>${JSON.stringify(fragment)} === null || node.textContent.trim().startsWith(${JSON.stringify(fragment + ' →')}));
    const box=label?.querySelector('input');
    if(!box)return null;
    box.scrollIntoView({block:'nearest'});
    const r=box.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await click(point.x, point.y);
};
const applySentence = async () => {
  const point = await until(`(() => {
    const button=(${dialogs}).flatMap(p=>[...p.querySelectorAll('button')]).find(b=>b.textContent==='Corriger cette phrase' && !b.disabled);
    if(!button)return null;
    button.scrollIntoView({block:'nearest'});
    const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await click(point.x, point.y);
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
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
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
      extensionBase = 'chrome-extension://' + new URL(worker.url).hostname;
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
  if (process.argv.includes('--v4')) {
    const fixtureUrl = 'http://127.0.0.1:' + site.address().port + '/';
    await call('Page.navigate', {
      url: extensionBase + '/src/options/options.html',
    });
    await until(
      'document.querySelector("#shortcut-controls")?.disabled === false',
    );
    await evaluate(
      'document.querySelector("#shortcut-trigger").value="bjr";document.querySelector("#shortcut-replacement").value="Bonjour";document.querySelector("#shortcut-form").requestSubmit()',
    );
    await until(
      'document.querySelector("#shortcut-list").textContent.includes("Bonjour")',
    );
    await call('Page.reload');
    await until(
      'document.querySelector("#shortcut-list")?.textContent.includes("Bonjour")',
    );
    console.log('PASS V4 options creation and persistence across page reload');
    await evaluate(
      'document.querySelector("#shortcut-trigger").value="BJR";document.querySelector("#shortcut-replacement").value="Duplicate";document.querySelector("#shortcut-trigger").dispatchEvent(new Event("input",{bubbles:true}))',
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#shortcut-trigger").checkValidity()',
      ),
      false,
    );
    await evaluate(
      'document.querySelector("#shortcut-cancel").click();document.querySelector("#shortcut-list button").click();document.querySelector("#shortcut-replacement").value="Bonsoir";document.querySelector("#shortcut-form").requestSubmit()',
    );
    await until(
      'document.querySelector("#shortcut-list").textContent.includes("Bonsoir")',
    );
    await evaluate(
      'document.querySelector("#shortcut-status").textContent="";document.querySelector("#shortcut-list input").click()',
    );
    await until(
      'document.querySelector("#shortcut-status").textContent.includes("enregistrés") && !document.querySelector("#shortcut-list input").checked',
    );
    await evaluate(
      'window.confirm=()=>true;document.querySelectorAll("#shortcut-list button")[1].click()',
    );
    await until('document.querySelector("#shortcut-list").children.length===0');
    await evaluate(
      'document.querySelector("#shortcut-trigger").value="bjr";document.querySelector("#shortcut-replacement").value="Bonjour";document.querySelector("#shortcut-form").requestSubmit()',
    );
    await until(
      'document.querySelector("#shortcut-list").textContent.includes("Bonjour")',
    );
    console.log(
      'PASS V4 immediate duplicate validation, edit, entry disable and confirmed delete',
    );
    await evaluate(
      `document.querySelector("#shortcut-trigger").value="cpg";document.querySelector("#shortcut-replacement").value="Ce n'est pas grave";document.querySelector("#shortcut-form").requestSubmit()`,
    );
    await until(
      'document.querySelector("#shortcut-list").textContent.includes("Ce n\'est pas grave")',
    );
    await call('Page.navigate', { url: fixtureUrl });
    await until(
      'document.querySelector("#native") && document.querySelector("[data-correctly-ui]")',
    );
    await evaluate(
      'const field=document.querySelector("#native");field.value="";field.focus();globalThis.v4Events=0;field.addEventListener("input",event=>{if(event.inputType==="insertReplacementText")globalThis.v4Events++})',
    );
    await call('Input.insertText', { text: 'bjr' });
    await call('Input.insertText', { text: ' ' });
    await until('document.querySelector("#native").value === "Bonjour "');
    assert.equal(await evaluate('globalThis.v4Events'), 1);
    await evaluate(
      '[...document.querySelectorAll("[data-correctly-ui]")].flatMap(host=>[...host.shadowRoot.querySelectorAll("button")]).find(button=>button.textContent.includes("Annuler la modification")).click()',
    );
    assert.equal(
      await evaluate('document.querySelector("#native").value'),
      'bjr ',
    );
    console.log(
      'PASS V4 real typing expands once, preserves separator and explicit Undo',
    );
    await evaluate(
      'document.querySelector("#native").value="";document.querySelector("#native").focus()',
    );
    await call('Input.insertText', { text: 'abjr' });
    await call('Input.insertText', { text: ' ' });
    assert.equal(
      await evaluate('document.querySelector("#native").value'),
      'abjr ',
    );
    await evaluate(
      'document.querySelector("#native").value="";document.querySelector("#native").focus()',
    );
    await call('Input.insertText', { text: 'bjr' });
    await call('Input.insertText', { text: ',' });
    assert.equal(
      await evaluate('document.querySelector("#native").value'),
      'Bonjour,',
    );
    console.log('PASS V4 exact tokens and punctuation');
    // Feedback matrix: browser-native typing, real selection/focus, all three
    // supported field shapes. Do not treat a token without a separator as a bug.
    await evaluate(`(() => {
      const input=document.createElement('input'); input.id='feedback-text'; input.type='text';
      const simple=document.createElement('div'); simple.id='feedback-simple'; simple.contentEditable='true';
      document.body.prepend(input,simple);
    })()`);
    for (const selector of ['#native', '#feedback-text', '#feedback-simple']) {
      for (const separator of [' ', ',', '.']) {
        await evaluate(
          `(() => {const f=document.querySelector(${JSON.stringify(selector)}); if('value' in f)f.value='';else f.textContent=''; f.focus();})()`,
        );
        await call('Input.insertText', { text: 'cpg' });
        const read = `(() => {const f=document.querySelector(${JSON.stringify(selector)});return 'value' in f?f.value:f.textContent})()`;
        assert.equal(await evaluate(read), 'cpg');
        await call('Input.insertText', { text: separator });
        try {
          await until(
            `(${read}).replace(/\u00a0/g, ' ') === ${JSON.stringify("Ce n'est pas grave" + separator)}`,
          );
        } catch (error) {
          console.log(
            'Feedback field diagnostic:',
            await evaluate(
              `document.querySelector(${JSON.stringify(selector)}).outerHTML`,
            ),
          );
          throw error;
        }
      }
      console.log(
        'PASS feedback cpg expansion: ' + selector + ', space/comma/period',
      );
    }
    for (const selector of ['#native', '#feedback-text', '#feedback-simple']) {
      await correct(
        `(() => {const f=document.querySelector(${JSON.stringify(selector)});if('value' in f)f.value='Before. Je sui ici.';else f.textContent='Before. Je sui ici.';f.focus();if('value' in f)f.setSelectionRange(f.value.length,f.value.length);else document.getSelection().setBaseAndExtent(f.firstChild,f.textContent.length,f.firstChild,f.textContent.length);f.dispatchEvent(new InputEvent('input',{bubbles:true}));})()`,
        `(() => {const f=document.querySelector(${JSON.stringify(selector)});return 'value' in f?f.value:f.textContent})()`,
        'Before. Je suis ici.',
      );
      console.log(
        'PASS feedback individual click in second sentence: ' + selector,
      );
    }
    for (const selector of ['#native', '#feedback-text', '#feedback-simple']) {
      await evaluate(
        `(() => {const f=document.querySelector(${JSON.stringify(selector)});if('value' in f)f.value='Je sui ici';else f.textContent='Je sui ici';f.focus();if('value' in f)f.setSelectionRange(1,1);else document.getSelection().setBaseAndExtent(f.firstChild,1,f.firstChild,1);f.dispatchEvent(new InputEvent('input',{bubbles:true}));})()`,
      );
      await until(lines + '.length > 0');
      const reviewPoint = await until(
        '(()=>{const r=(' +
          lines +
          ')[0]?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y-2}:null})()',
      );
      await click(reviewPoint.x, reviewPoint.y);
      await until(
        dialogs + '.some(p=>p.querySelector("[data-sentence-choice]"))',
      );
      assert.equal(
        await evaluate(
          dialogs +
            '.some(p=>p.querySelector("[data-sentence-choice]:checked"))',
        ),
        false,
      );
      await chooseSentenceChange();
      await until(
        dialogs +
          '.some(p=>p.textContent.includes("Avant : Je sui ici") && p.textContent.includes("Après : Je suis ici"))',
      );
      await applySentence();
      assert.equal(
        await evaluate(
          `(() => {const f=document.querySelector(${JSON.stringify(selector)});return 'value' in f?f.value:f.textContent})()`,
        ),
        'Je suis ici',
      );
      console.log(
        'PASS feedback whole sentence preview with caret near beginning and no final punctuation: ' +
          selector,
      );
    }

    await evaluate(
      'document.querySelector("#native").value="";document.querySelector("#native").focus()',
    );
    await call('Input.insertText', { text: 'Je sui ici.' });
    await until(lines + '.length > 0');
    const point = await until(
      '(()=>{const r=(' +
        lines +
        ')[0]?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y-2}:null})()',
    );
    await click(point.x, point.y);
    await until(
      dialogs +
        '.some(panel=>[...panel.querySelectorAll("button")].some(button=>button.textContent==="Corriger cette phrase"))',
    );
    await chooseSentenceChange();
    await applySentence();
    assert.equal(
      await evaluate('document.querySelector("#native").value'),
      'Je suis ici.',
    );
    console.log(
      'PASS V4 sentence preview and grouped correction with real LanguageTool',
    );
    if (realEngine) {
      await evaluate(
        `(() => {const f=document.querySelector('#native');f.value='Je sui ici. Tu es la.';f.focus();f.setSelectionRange(11,11);f.scrollTop=0;f.dispatchEvent(new InputEvent('input',{bubbles:true}));})()`,
      );
      await until(lines + '.length > 0');
      await evaluate(
        `(() => {const f=document.querySelector('#native');f.setSelectionRange(f.value.length,f.value.length);})()`,
      );
      await delay(700);
      const transitionPoint = await until(
        '(()=>{const r=(' +
          lines +
          ').at(-1)?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y-2}:null})()',
      );
      await click(transitionPoint.x, transitionPoint.y);
      await until(
        dialogs + '.some(p=>p.textContent.includes("Avant : Tu es la."))',
      );
      await chooseSentenceChange();
      await applySentence();
      assert.equal(
        await evaluate('document.querySelector("#native").value'),
        'Je sui ici. Tu es là.',
      );
      console.log(
        'PASS updated feedback leaving an offset-zero sentence window triggers second-sentence analysis',
      );
      const feedbackText =
        "Bonjour, je m'appelles Moqim, je vis en Français depuis 5 an. J'aimera bien de demandé de me donné les cordonnés de ta tata.";
      const firstCorrected =
        "Bonjour, je m'appelle Moqim, je vis en français depuis 5 ans. J'aimera bien de demandé de me donné les cordonnés de ta tata.";
      await evaluate(`(() => {
        const f=document.querySelector('#native');f.value=${JSON.stringify(feedbackText)};f.focus();f.setSelectionRange(1,1);f.scrollTop=0;f.scrollIntoView();f.dispatchEvent(new InputEvent('input',{bubbles:true}));
      })()`);
      await until(lines + '.length > 0');
      const namePoint = await until(
        '(()=>{const r=(' +
          lines +
          ')[0]?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y-2}:null})()',
      );
      await click(namePoint.x, namePoint.y);
      await until(
        dialogs +
          '.some(p=>[...p.querySelectorAll("fieldset label")].some(n=>n.textContent.includes("Moqim")))',
      );
      assert.equal(
        await evaluate(
          dialogs +
            '.some(p=>p.querySelector("[data-sentence-choice]:checked"))',
        ),
        false,
      );
      assert.equal(
        await evaluate(
          dialogs +
            '.some(p=>[...p.querySelectorAll("fieldset label")].some(n=>n.textContent.includes("aimera")))',
        ),
        false,
      );
      await chooseSentenceChange('appelles');
      await chooseSentenceChange('Français');
      await chooseSentenceChange('an');
      await until(
        dialogs +
          '.some(p=>p.textContent.includes("Après : Bonjour, je m\'appelle Moqim, je vis en français depuis 5 ans."))',
      );
      await applySentence();
      assert.equal(
        await evaluate('document.querySelector("#native").value'),
        firstCorrected,
      );
      console.log(
        'PASS updated feedback first sentence: three chosen edits, Moqim and second sentence preserved',
      );
      await evaluate(
        `(() => {const f=document.querySelector('#native');f.focus();f.setSelectionRange(f.value.length,f.value.length);f.scrollTop=f.scrollHeight;})()`,
      );
      await delay(500);
      const secondPoint = await until(
        '(()=>{const r=(' +
          lines +
          ').at(-1)?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y-2}:null})()',
      );
      await click(secondPoint.x, secondPoint.y);
      await until(
        dialogs +
          '.some(p=>[...p.querySelectorAll("fieldset label")].some(n=>n.textContent.includes("aimera")))',
      );
      assert.equal(
        await evaluate(
          dialogs +
            '.some(p=>[...p.querySelectorAll("fieldset label")].some(n=>n.textContent.includes("Moqim")))',
        ),
        false,
      );
      await chooseSentenceChange('aimera');
      await applySentence();
      assert.equal(
        await evaluate('document.querySelector("#native").value'),
        firstCorrected.replace("J'aimera", "J'aimerai"),
      );
      console.log(
        'PASS updated feedback second sentence reviewed separately; first sentence unchanged',
      );
      await evaluate(
        'document.querySelector("#native").value="";document.querySelector("#native").focus()',
      );
      await call('Input.insertText', { text: 'Hello  world' });
      assert.equal(
        await evaluate('document.querySelector("#native").value'),
        'Hello  world',
      );
      await call('Input.insertText', { text: '.' });
      await until('document.querySelector("#native").value === "Hello world."');
      console.log(
        'PASS V4 real LanguageTool spacing auto-transaction only after sentence completion',
      );
    }
  }
  assert.deepEqual(errors, []);
  if (process.argv.includes('--benchmark')) {
    const measurements = await evaluate(`(() => {
      const field = document.createElement('textarea'); document.body.prepend(field); field.focus();
      const results = [];
      for (const size of [100, 5000, 50000]) {
        const prefix = 'a'.repeat(size) + '\\n'; const samples = [];
        for (let index = 0; index < 120; index++) {
          field.value = prefix + 'Measured typing ' + index; field.setSelectionRange(field.value.length, field.value.length);
          const start = performance.now();
          field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
          samples.push(performance.now() - start);
        }
        samples.sort((a,b)=>a-b); results.push({ prefix_utf16: size, iterations: samples.length, median_ms: samples[60], p95_ms: samples[114], maximum_ms: samples[119] });
      }
      field.remove(); return results;
    })()`);
    const report = {
      recorded_at: new Date().toISOString(),
      browser: (await call('Browser.getVersion')).product,
      browser_path: browserPath,
      extension: extensionPath,
      method:
        '120 synchronous input events per length, timers debounced; excludes network latency; no stored field contents',
      measurements,
      heap: await call('Runtime.getHeapUsage'),
    };
    await writeFile(
      process.env.CORRECTLY_BENCHMARK_REPORT ??
        'docs/validation/v4/benchmark-current.json',
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      'PASS bounded typing benchmark: ' + JSON.stringify(measurements),
    );
  }
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
