// Records gameplay footage frame by frame through the Chrome DevTools Protocol.
//
// The game is opened with ?desktop&record, which hands its clock to us: every
// frame we call cueverse.rec.step(1/30), take a screenshot, and save it as a
// JPEG. A "director" below decides when to break off, replay, switch rooms and
// so on, and logs every event with its time so the edit can caption it.
//
//   node video/record.mjs                     full 100 s take -> video/frames/
//   node video/record.mjs --seconds=3 --out=video/frames-smoke   quick timing test
//
// Needs the built game served at --url (default http://127.0.0.1:4173, i.e.
// `NO_SSL=1 npx vite preview`). Frames are joined with ffmpeg by video/encode.mjs.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const FPS = 30;
const W = +(args.w || 1920), H = +(args.h || 1080);
const SECONDS = +(args.seconds || 100);
const URL_ = args.url || 'http://127.0.0.1:4173/?desktop&record&club=luxury';
const OUT = resolve(args.out || join(here, 'frames'));
const CHROME = args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = +(args.port || 9333);
const PROFILE = join(tmpdir(), 'cueverse-record-profile');

// ------------------------------------------------------------ chrome + CDP
function launchChrome() {
  const flags = ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling',
    `--window-size=${W},${H}`, 'about:blank'];
  const child = spawn(CHROME, flags, { stdio: 'ignore' });
  child.on('exit', (code) => { if (!done) { console.error('chrome exited early', code); process.exit(1); } });
  return child;
}
let done = false;

async function pageTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome debug port never answered');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return { send, open, close: () => ws.close() };
}

// ------------------------------------------------------------ director
// Everything the game lets us poke lives on window.cueverse / cueverse.rec.
const CLUB_SCHEDULE = [[40, 'underground'], [58, 'hall'], [76, 'cyber']];
const HELP_AT = 88, HELP_FOR = 3.2;
const OVERVIEW_AT = 28, OVERVIEW_FOR = 5;

function makeDirector(ev, log) {
  const S = { started: false, broke: false, replays: 0, replayStart: null, lastShotEnd: -99, aimT: 0, showcase: null,
    clubs: new Set(), helpOpenedAt: null, helpDone: false, prevState: null, firstAI: false, playerShots: 0, lastClubT: -99 };
  const js = (code) => ev(code);
  return async function direct(t, st, dt) {
    if (st && st.state !== S.prevState) {
      if (S.prevState === 'rolling') S.lastShotEnd = t;
      if (st.state === 'ai' && !S.firstAI) { S.firstAI = true; log(t, 'ai'); }
      if (st.state === 'over') log(t, 'over');
      S.prevState = st.state;
    }
    if (!st) return;
    const calm = st.fade === 0 && !st.help && !S.showcase;

    if (!S.started && t >= 3) {
      await js(`cueverse.game.options.level='pro'; cueverse.game.options.reds=10; cueverse.game.actions.startFrame()`);
      S.started = true; log(t, 'startFrame'); log(t, 'club:luxury'); return;
    }
    if (!S.started) return;

    // room changes
    for (const [at, id] of CLUB_SCHEDULE) {
      if (t >= at && !S.clubs.has(id) && st.state !== 'replay' && st.fade === 0) {
        await js(`cueverse.game.actions.setClub('${id}')`);
        S.clubs.add(id); S.lastClubT = t; log(t, 'club:' + id); return;
      }
    }
    // help panel
    if (!S.helpDone && t >= HELP_AT && st.state !== 'replay' && st.fade === 0 && S.helpOpenedAt === null) {
      await js(`cueverse.game.actions.toggleHelp()`); S.helpOpenedAt = t; log(t, 'help'); return;
    }
    if (S.helpOpenedAt !== null && !S.helpDone && t - S.helpOpenedAt >= HELP_FOR) {
      await js(`cueverse.game.actions.toggleHelp()`); S.helpDone = true; log(t, 'help:end'); return;
    }
    // look around the table once
    if (!S.overviewDone && t >= OVERVIEW_AT && st.state === 'aiming' && st.fade === 0 && !S.showcase) {
      await js(`cueverse.rec.setView('overview')`); S.showcase = { until: t + OVERVIEW_FOR }; log(t, 'overview'); return;
    }
    if (S.showcase) {
      if (t >= S.showcase.until) { await js(`cueverse.rec.setView('stance')`); S.showcase = null; S.overviewDone = true; log(t, 'overview:end'); }
      else await js(`cueverse.game.actions.orbit(${(0.9 / OVERVIEW_FOR) * dt})`);
      return;
    }
    // break off
    if (!S.broke) {
      if (st.state === 'aiming' && st.fade === 0 && t >= 6.5) { await js(`cueverse.rec.breakOff(3.4, 0.25)`); S.broke = true; log(t, 'break'); }
      return;
    }
    // replays: once from the pocket, once from above
    if (st.state === 'replay') {
      if (S.replayStart !== null && t - S.replayStart >= 6) { await js(`cueverse.rec.endReplay()`); S.replayStart = null; log(t, 'replay:end'); }
      return;
    }
    if (st.state === 'aiming' && st.hasReplay && S.replays < 2 && t > 14 && t - S.lastShotEnd > 0.9 && t - S.lastShotEnd < 1.0 + dt && calm && t - S.lastClubT > 3) {
      const kind = S.replays === 0 ? 'cinematic' : 'overhead';
      await js(`cueverse.game.actions.replay('${kind}')`); S.replays++; S.replayStart = t; log(t, 'replay:' + kind); return;
    }
    // the player's shots: wait a moment at the table, then play like a pro
    if (st.state === 'aiming' && calm && t - S.lastClubT > 2.5) S.aimT += dt; else S.aimT = 0;
    if (S.aimT > 1.6) {
      const how = await js(`cueverse.rec.shootPlanned('pro')`);
      S.aimT = 0; S.playerShots++; log(t, 'shot:' + how);
    }
  };
}

// ------------------------------------------------------------ main
async function main() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  rmSync(PROFILE, { recursive: true, force: true });
  const chrome = launchChrome();
  const target = await pageTarget();
  const c = cdp(target.webSocketDebuggerUrl);
  await c.open;
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await c.send('Page.navigate', { url: URL_ });
  const ev = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const t0 = Date.now();
  for (let i = 0; i < 600; i++) {
    if (await ev('!!(window.cueverse && window.cueverse.rec)').catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`game ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const events = [];
  const log = (t, name) => { events.push({ t: +t.toFixed(3), name }); console.log(`  ${t.toFixed(2).padStart(6)}s  ${name}`); };
  const direct = makeDirector(ev, log);
  const total = Math.round(SECONDS * FPS);
  const dt = 1 / FPS;
  let st = null;
  const tStart = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i * dt;
    await direct(t, st, dt);
    st = JSON.parse(await ev(`cueverse.rec.step(${dt}); JSON.stringify(cueverse.rec.state())`));
    const shot = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(join(OUT, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    if (i % 30 === 0) {
      const el = (Date.now() - tStart) / 1000;
      console.log(`frame ${i}/${total}  t=${t.toFixed(1)}s  ${st.state}${st.view ? '/' + st.view : ''}  ${(el / (i + 1)).toFixed(2)} s/frame  eta ${((total - i) * el / (i + 1) / 60).toFixed(1)} min`);
    }
  }
  writeFileSync(join(OUT, 'events.json'), JSON.stringify({ fps: FPS, width: W, height: H, seconds: SECONDS, frames: total, events }, null, 2));
  console.log(`done: ${total} frames in ${((Date.now() - tStart) / 60000).toFixed(1)} min -> ${OUT}`);
  done = true;
  try { await c.send('Browser.close'); } catch (e) { /* fall through */ }
  c.close();
  chrome.kill();
}

main().catch((e) => { console.error(e); done = true; process.exit(1); });
