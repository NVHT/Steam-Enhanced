// Brand art: records the theme's animated images from their pages in dev/brand-art/ and writes
//   assets/header-loop.gif  Millennium's theme list (skin.json header_image) and the README's top
//   assets/splash.gif       skin.json splash_image and the README's Startup card
//
// The pages read the theme's own files (fonts, tokens, the mark from --se-brand-icon and
// --se-brand-logo, the splash's entrance CSS and wireframe), so rerun this after dev/brand.py or
// a change to the splash:
//   node dev/brand-art.js            both
//   node dev/brand-art.js header     one
//
// Each page is drawn by headless Microsoft Edge one frame at a time: every animation paused and
// set to the frame's time, and window.__frame(t) called first when the page has it. Frames go to
// gifski (on PATH, or GIFSKI=<path to gifski.exe>), the encoder the shipped GIFs were made with.
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const THEME = path.dirname(__dirname);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GIFSKI = process.env.GIFSKI || 'gifski';
const OUT = { width: 1280, height: 720, fps: 25, quality: 95 };
// page: its file in dev/brand-art/; secs: one loop; w, h: the page's size (drawn down to OUT)
const ART = {
  header: { page: 'header.html', gif: 'header-loop.gif', secs: 8, w: 1280, h: 720 },
  splash: { page: 'splash.html', gif: 'splash.gif', secs: 8, w: 1920, h: 1080 },
};
// A frame changing more than this share of the picture from the last is a bad capture (Edge now
// and then hands one back drawn shifted); the loops' own motion stays well under it
const MAX_CHANGE = 0.25;
// Comparisons read every SAMPLE-th pixel, so 200 frames fit in memory
const SAMPLE = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const names = process.argv.slice(2);
  for (const n of names) if (!ART[n]) throw new Error(`no art "${n}"; one of: ${Object.keys(ART).join(', ')}`);
  if (!fs.existsSync(EDGE)) throw new Error(`no Edge at ${EDGE}`);
  if (spawnSync(GIFSKI, ['--version']).status !== 0) throw new Error('no gifski: put it on PATH or set GIFSKI to gifski.exe');
  for (const n of names.length ? names : Object.keys(ART)) await record(n, ART[n]);
}

async function record(name, art) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'se-brand-art-'));
  const frames = path.join(tmp, 'frames');
  fs.mkdirSync(frames);
  const port = 9333 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`, `--window-size=${art.w + 30},${art.h + 129}`, 'about:blank'],
  { stdio: 'ignore' });
  let cdp;
  try {
    cdp = await connect(port);
    const shots = await capture(cdp, art);
    // A frame that jumps away from both neighbours while they match each other is a bad capture
    // the retries missed: it takes the one before
    for (let i = 1; i < shots.length - 1; i++) {
      const before = share(shots[i - 1].px, shots[i].px), after = share(shots[i].px, shots[i + 1].px);
      if (before > 0.03 && after > 0.03 && share(shots[i - 1].px, shots[i + 1].px) < before / 4) {
        console.log(`${name}: frame ${i} glitched, using frame ${i - 1}`);
        shots[i] = shots[i - 1];
      }
    }
    console.log(`${name}: loop seam ${share(shots[shots.length - 1].px, shots[0].px).toFixed(3)} (0 is seamless)`);
    shots.forEach((s, i) => fs.writeFileSync(path.join(frames, `f${String(i).padStart(4, '0')}.png`), s.png));
    await cdp.browser('Browser.close').catch(() => {});
    const gif = path.join(THEME, 'assets', art.gif);
    const files = fs.readdirSync(frames).sort().map((f) => path.join(frames, f));
    const run = spawnSync(GIFSKI, ['--fps', String(OUT.fps), '--width', String(OUT.width), '--quality', String(OUT.quality), '--quiet', '-o', gif, ...files], { stdio: 'inherit' });
    if (run.status !== 0) throw new Error('gifski failed');
    console.log(`${name}: wrote assets/${art.gif}, ${(fs.statSync(gif).size / 1e6).toFixed(2)} MB, ${files.length} frames`);
  } finally {
    cdp?.close();
    edge.kill();
    await sleep(500);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function capture(cdp, art) {
  const { send, evaluate, events } = cdp;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: art.w, height: art.h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'brand-art', art.page)).href });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await evaluate('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 300)))');
  // Every animation paused and set to the frame's time, counted from when it first showed up
  await evaluate(`window.__seen = new Map(); window.__step = (t) => {
    scrollTo(0, 0);
    if (window.__frame) window.__frame(t);
    // A pixel that changes every frame, so Edge draws one even when nothing else moved (else the
    // screenshot waits)
    let tick = document.getElementById('__tick');
    if (!tick) { tick = document.createElement('i'); tick.id = '__tick'; tick.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;background:#000;pointer-events:none;z-index:2147483647'; document.documentElement.append(tick); }
    tick.style.opacity = tick.style.opacity === '0.001' ? '0.002' : '0.001';
    document.body.getBoundingClientRect();
    for (const a of document.getAnimations()) {
      if (!__seen.has(a)) __seen.set(a, t);
      a.pause();
      a.currentTime = (t - __seen.get(a)) * 1000;
    }
    return true;
  }; true`);
  const clip = { x: 0, y: 0, width: art.w, height: art.h, scale: OUT.width / art.w };
  const shoot = async (t) => {
    for (let a = 0; a < 8; a++) {
      await evaluate(`__step(${t})`);
      try {
        const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip });
        const png = Buffer.from(r.result.data, 'base64');
        return { png, px: sample(png) };
      } catch (e) { await sleep(100); }
    }
    throw new Error(`no screenshot at ${t}s`);
  };
  const n = Math.round(art.secs * OUT.fps);
  const shots = [];
  for (let f = 0; f < n; f++) {
    const t = f / OUT.fps;
    let shot = await shoot(t);
    const prev = shots[f - 1];
    for (let a = 0; prev && a < 5 && share(prev.px, shot.px) > MAX_CHANGE; a++) {
      await sleep(250);
      const again = await shoot(t);
      if (share(prev.px, again.px) < share(prev.px, shot.px)) shot = again;
    }
    shots.push(shot);
    if (f % 50 === 0) console.log(`${art.page}: frame ${f} / ${n}`);
  }
  return shots;
}

// Chrome DevTools Protocol over Node's own WebSocket: the page's session, plus the browser's
// for closing it
async function connect(port) {
  let page, version;
  for (let i = 0; i < 80 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {}
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('Edge did not start');
  const open = async (url) => {
    const ws = new WebSocket(url);
    await new Promise((r, no) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', no, { once: true }); });
    return ws;
  };
  const ws = await open(page.webSocketDebuggerUrl);
  let id = 0;
  const waits = new Map();
  const events = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waits.has(msg.id)) { waits.get(msg.id)(msg); waits.delete(msg.id); } else if (msg.method) events.push(msg.method);
  });
  const send = (method, params = {}) => new Promise((r, no) => {
    const i = ++id;
    const timer = setTimeout(() => { waits.delete(i); no(new Error('timeout ' + method)); }, method === 'Page.captureScreenshot' ? 3000 : 20000);
    waits.set(i, (m) => { clearTimeout(timer); r(m); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const browser = async (method) => {
    const b = await open(version.webSocketDebuggerUrl);
    b.send(JSON.stringify({ id: 1, method }));
    await sleep(300);
    b.close();
  };
  return { send, evaluate, events, browser, close: () => ws.close() };
}

// Share of the sampled pixels that differ between two frames
function share(a, b) {
  let c = 0;
  for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) c++;
  return c / (a.length / 3);
}

// A PNG screenshot (8-bit RGB or RGBA, not interlaced) as every SAMPLE-th pixel's RGB
function sample(buf) {
  let p = 8, w, h, ct;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  const out = Buffer.alloc(Math.ceil((w * h) / SAMPLE) * 3);
  for (let i = 0, o = 0; i < w * h; i += SAMPLE, o += 3) { out[o] = px[i * bpp]; out[o + 1] = px[i * bpp + 1]; out[o + 2] = px[i * bpp + 2]; }
  return out;
}

main().catch((e) => { console.error('brand-art:', e.message); process.exit(1); });
