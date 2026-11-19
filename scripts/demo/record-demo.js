/*
 * Records the demo shown in the README and on the site.
 *
 * Run everything with: bash scripts/demo/make-demo.sh
 */
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/tmp/cybersoap-demo/frames';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = {};
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) {
      pending[d.id](d);
      delete pending[d.id];
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending[i] = r;
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const js = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) console.error('JS error', expression.slice(0, 80), r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const click = (selector) => js(`(() => { const el = ${selector}; if (el) { el.click(); return true } return false })()`);
  const key = async (key, code, keyCode, modifiers = 0, text) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  };
  const type = async (text, delay = 45) => {
    for (const ch of text) {
      await send('Input.insertText', { text: ch });
      await sleep(delay);
    }
  };

  // ---- frame capture loop
  let recording = true;
  let n = 0;
  const frames = [];
  const loop = (async () => {
    while (recording) {
      const t = Date.now();
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
      const file = path.join(OUT, `f${String(n++).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      frames.push({ file, t });
      const wait = 70 - (Date.now() - t);
      if (wait > 0) await sleep(wait);
    }
  })();

  // ---- scenario
  await sleep(1400); // welcome screen
  await click(`[...document.querySelectorAll('.action-card')][0]`); // Import WSDL
  await sleep(500);
  await type('http://localhost:8099/weather?wsdl', 35);
  await sleep(300);
  await click(`[...document.querySelectorAll('.modal-foot .btn')].find(b => b.textContent.includes('Analy'))`);
  await sleep(1800);
  await click(`document.querySelector('.modal-foot .btn.primary')`);
  await sleep(1500);

  // open the GetWeather request
  await click(`[...document.querySelectorAll('.tree-row.request')].find(r => r.textContent.includes('GetWeather'))`);
  await sleep(1000);

  // fill placeholders with F2
  await js(`document.querySelector('.request-pane .cm-content').focus()`);
  await key('F2', 'F2', 113);
  await sleep(400);
  await type('Paris', 90);
  await sleep(300);
  await key('F2', 'F2', 113);
  await sleep(400);
  await type('FR', 110);
  await sleep(300);
  await key('F2', 'F2', 113);
  await sleep(400);
  await type('C', 120);
  await sleep(800);
  await key('Escape', 'Escape', 27);
  await sleep(200);

  // autocompletion on a new line
  await key('End', 'End', 35);
  await key('Enter', 'Enter', 13, 0, '\r');
  await sleep(250);
  await type('<', 0);
  await sleep(1600);
  await key('ArrowDown', 'ArrowDown', 40);
  await sleep(350);
  await key('ArrowDown', 'ArrowDown', 40);
  await sleep(350);
  await key('Escape', 'Escape', 27);
  await sleep(200);
  await key('Backspace', 'Backspace', 8);
  await key('Backspace', 'Backspace', 8);
  await sleep(300);

  // send
  await click(`document.querySelector('.send-btn')`);
  await sleep(1600);
  await click(`[...document.querySelectorAll('.response-pane .subtab')].find(b => b.textContent.includes('Assertions'))`);
  await sleep(1500);
  await click(`[...document.querySelectorAll('.response-pane .subtab')][0]`);
  await sleep(600);

  // runner
  await js(`(async () => { const s = window.cybersoap.store.getState(); s.openRunner(s.collections[0].path) })()`);
  await sleep(700);
  await click(`document.querySelector('.runner-view .btn.primary')`);
  await sleep(2000);

  // themes
  await js(`window.cybersoap.store.getState().setModal({ type: 'settings', props: { section: 'appearance' } })`);
  await sleep(1100);
  for (const theme of ['cyberdog', 'synthwave', 'alucard', 'frost', 'dracula']) {
    await js(`window.cybersoap.store.getState().updateSettings({ theme: '${theme}' })`);
    await sleep(900);
  }
  await js(`window.cybersoap.store.getState().setModal(null)`);
  await sleep(1200);

  recording = false;
  await loop;
  // durations file for ffmpeg concat demuxer
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1 ? (frames[i + 1].t - frames[i].t) / 1000 : 0.5;
    lines.push(`file '${frames[i].file}'`, `duration ${dur.toFixed(3)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n'));
  console.log(`${frames.length} frames, ${((frames.at(-1).t - frames[0].t) / 1000).toFixed(1)} s`);

  // ---- still screenshots for the README / site
  const SHOTS = process.argv[3];
  if (SHOTS) {
    const shot = async (name) => {
      await sleep(500);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
    };
    const theme = (t) => js(`window.cybersoap.store.getState().updateSettings({ theme: '${t}' })`);
    const openReq = (name) =>
      js(`(async () => { const s = window.cybersoap.store.getState(); const r = s.collections[0].children.find(c => c.name === '${name}'); await s.openRequest(r.path); })()`);

    await openReq('GetWeather');
    await shot('screen-request.png');
    await theme('alucard');
    await shot('screen-light.png');
    await theme('dracula');

    await openReq('GetForecast');
    await js(`(async () => { const s = window.cybersoap.store.getState(); const p = Object.keys(s.docs).find(k => k.includes('GetForecast')); const d = s.docs[p].data; s.updateDoc(p, { body: d.body.replace(/<(\\w+):City>\\?</, '<$1:City>{{city}}<').replace(/<(\\w+):Days>\\?</, '<$1:Days>3<') }); })()`);
    await js(`window.cybersoap.store.getState().saveEnvironments({ globals: [{ key: 'city', value: 'Lyon', enabled: true }], environments: [{ name: 'dev', variables: [{ key: 'baseUrl', value: 'http://localhost:8099', enabled: true }] }, { name: 'recette', variables: [{ key: 'baseUrl', value: 'http://10.0.0.12:8080', enabled: true }] }, { name: 'prod', variables: [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }] }] }).then(() => window.cybersoap.store.getState().setActiveEnvironment('dev'))`);
    await sleep(300);
    await click(`document.querySelector('.send-btn')`);
    await sleep(1200);
    await shot('screen-forecast.png');

    await openReq('GetWeather');
    await js(`(() => { const lines = [...document.querySelectorAll('.request-pane .cm-line')]; const l = lines.find(x => x.textContent.includes('Unit>')); const r = document.createRange(); r.selectNodeContents(l); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); document.querySelector('.request-pane .cm-content').focus(); })()`);
    await key('End', 'End', 35);
    await key('Enter', 'Enter', 13, 0, '\r');
    await send('Input.insertText', { text: '<' });
    await sleep(800);
    await shot('screen-autocomplete.png');
    await key('Escape', 'Escape', 27);
    await key('Backspace', 'Backspace', 8);
    await key('Backspace', 'Backspace', 8);

    await theme('cyberdog');
    await js(`(async () => { const s = window.cybersoap.store.getState(); s.openRunner(s.collections[0].path) })()`);
    await sleep(500);
    await click(`document.querySelector('.runner-view .btn.primary')`);
    await sleep(1200);
    await shot('screen-runner.png');
    await theme('dracula');

    await js(`window.cybersoap.store.getState().setModal({ type: 'environments' })`);
    await shot('screen-environments.png');
    await js(`window.cybersoap.store.getState().setModal(null)`);
    console.log('screenshots saved');
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
