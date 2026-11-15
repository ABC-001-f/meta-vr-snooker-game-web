import * as THREE from 'three';
import { R, L, W, BED_Y, BALL_Y, BAULK_X, D_R, POCKETS } from './config.js';
import { Physics } from './physics.js';
import { Rules } from './rules.js';
import { rackBalls, respotColour } from './rack.js';
import { planShot, aiPlaceCueBall } from './ai.js';
import { buildTable, BallSet } from './table.js';
import { buildClub, makeEnvMap, disposeGroup, CLUBS } from './environments.js';
import { XRInputs } from './hands.js';
import { CueVisual, CueController, AimGuide } from './cue.js';
import { UI } from './ui.js';
import { makePanels, drawBigScreen } from './screens.js';
import { Audio3D } from './audio.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const fwdOf = (yaw) => new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
const yawOf = (x, z) => Math.atan2(-x, -z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

// ------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
if (renderer.xr.setFoveation) renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 400);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const hud = new THREE.Group();
scene.add(hud);
const tableRoot = new THREE.Group();
scene.add(tableRoot);

const fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
fadeMesh.renderOrder = 999; fadeMesh.visible = false;
camera.add(fadeMesh);
const fade = { v: 0, dir: 0, fn: null };
function fadeThrough(fn) { if (fade.dir !== 0 || fade.v > 0) { fn(); return; } fade.dir = 1; fade.fn = fn; }

// ---------------------------------------------------------------- game
const game = {
  state: 'lobby',                 // lobby | aiming | rolling | ai | replay | over
  clubName: store.get('cueverse.club', "The Owner's Club"),
  options: { club: store.get('cueverse.room', 'luxury'), mode: 'ai', reds: 6, level: 'club' },
  settings: { eyeH: 0.42, dist: 0.62, guide: 'beginner', power: 1, shadows: true, posture: 'sit', sound: true, roomTone: true },
  rules: null, status: '', statusColor: null, toastText: '', toastSub: '', toastColor: null,
  settingsOpen: false, helpOpen: false, paused: false, viewKind: 'lobby', hasReplay: false, xr: false, banner: '', actions: {},
};
const qsClub = new URLSearchParams(location.search).get('club');
if (qsClub && CLUBS.some((c) => c.id === qsClub)) game.options.club = qsClub;
if (!CLUBS.some((c) => c.id === game.options.club)) game.options.club = 'luxury';

const physics = new Physics();
rackBalls(physics, game.options.reds);
let ballSet = new BallSet(physics, tableRoot);
let tableMesh = null, club = null;
const audio = new Audio3D();
const ui = new UI();
ui.onClick = () => audio.play('click', null, 0.5);
const panels = makePanels(game);
for (const p of Object.values(panels)) { ui.add(p); hud.add(p.mesh); }
hud.rotation.order = 'YXZ';
const place = (p, x, y, z, ry, rx = 0, s = 1) => { p.mesh.position.set(x, y, z); p.mesh.rotation.order = 'YXZ'; p.mesh.rotation.set(rx, ry, 0); p.mesh.scale.setScalar(s); };

// In a headset the panels float around you and you turn to find them. On a
// flat screen the camera never turns, so they are pinned inside the window.
function placePanels() {
  if (renderer.xr.isPresenting) {
    place(panels.lobby, 0, 0.2, -1.4, 0, 0, 0.7);
    place(panels.score, -0.72, 0.2, -1.3, 0.45);
    place(panels.toast, 0, 0.52, -1.7, 0);
    place(panels.dock, -0.5, -0.17, -0.4, 0.7, -0.6);
    place(panels.settings, -0.8, 0.0, -0.72, 0.85);
    place(panels.help, 0, 0.1, -1.3, 0, 0, 0.8);
    return;
  }
  const d = 1.0, m = 0.05;
  const hh = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hw = hh * camera.aspect;
  const k = THREE.MathUtils.clamp(hw / 1.3, 0.55, 1);            // shrink everything on narrow windows
  const ks = Math.min(k, (2 * hh - 0.3 * k - 3 * m) / 1.15);     // the tall menu must fit under the score
  place(panels.lobby, 0, 0, -d, 0, 0, Math.min(0.85, (2 * hw - 0.2) / 2.0, (2 * hh - 0.2) / 1.2));
  place(panels.help, 0, 0, -d, 0, 0, Math.min(0.9, (2 * hw - 0.2) / 1.6, (2 * hh - 0.2) / 0.9));
  place(panels.score, -hw + m + 0.42 * k, hh - m - 0.15 * k, -d, 0, 0, k);
  place(panels.toast, 0, hh - m - 0.3 * k - m - 0.1 * k, -d, 0, 0, k);
  place(panels.settings, -hw + m + 0.39 * ks, hh - m - 0.3 * k - m - 0.575 * ks, -d, 0, 0, ks);
  place(panels.dock, 0, -hh + m + 0.072 * k, -d, 0, 0, 1.3 * k);
}
placePanels();

const cueVisual = new CueVisual(scene);
const cue = new CueController(cueVisual);
const aiCue = new CueVisual(scene, 0xb0c4ff);
aiCue.group.visible = false;
const guide = new AimGuide(scene);
const xrInputs = new XRInputs(renderer, rig);

// pinch-ray pointers
const lasers = [0, 1].map(() => {
  const g = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
  const line = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.7, toneMapped: false }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a6, toneMapped: false, depthTest: false }));
  dot.renderOrder = 20; line.visible = dot.visible = false;
  scene.add(line, dot);
  return { line, dot };
});

// ------------------------------------------------------------ the view
// The headset always drives the camera. A "view" only decides where the
// player's seat is placed in the club.
const seat = { pos: new V3(), yaw: 0 };
const view = { kind: 'lobby', yaw: -Math.PI / 2, eye: new V3(), saved: null };
let calibrateIn = 0;

function viewPose() {
  const s = game.settings, cb = physics.cue, f = fwdOf(view.yaw);
  switch (view.kind) {
    case 'stance': return [new V3(cb.x - f.x * s.dist, BED_Y + s.eyeH, cb.z - f.z * s.dist), view.yaw, -0.5];
    case 'overview': return [new V3(-f.x * 2.7, BED_Y + 1.0, -f.z * 2.7), view.yaw, -0.42];
    case 'closeup': return [new V3(cb.x - f.x * 0.36, BED_Y + 0.17, cb.z - f.z * 0.36), view.yaw, -0.3];
    case 'overhead': return [new V3(0, BED_Y + 2.2, 1.3), 0, -1.0];
    case 'cinematic': return [view.eye.clone(), view.yaw, -0.18];
    default: return [new V3(-L - 1.3, BED_Y + 0.55, 0), -Math.PI / 2, -0.2];
  }
}

function applyView() {
  const [eye, yaw, pitch] = viewPose();
  if (!renderer.xr.isPresenting) { seat.pos.set(0, 0, 0); seat.yaw = 0; camera.position.set(0, 0, 0); camera.rotation.set(pitch, 0, 0); }
  const ry = yaw - seat.yaw;
  cue.resetStroke();
  rig.rotation.set(0, ry, 0);
  rig.position.copy(eye).sub(seat.pos.clone().applyAxisAngle(UP, ry));
  rig.updateMatrixWorld(true);
  hud.position.copy(eye);
  hud.rotation.set(renderer.xr.isPresenting ? 0 : pitch, yaw, 0);
  hud.updateMatrixWorld(true);
  game.viewKind = view.kind;
}

function setView(kind, withFade = true) {
  const go = () => { view.kind = kind; applyView(); layoutHud(); };
  if (withFade) fadeThrough(go); else go();
}

function calibrate() {
  seat.pos.copy(camera.position);
  const f = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  seat.yaw = yawOf(f.x, f.z);
  applyView();
}

function ballsOn() {
  const r = game.rules, on = r ? (r.freeBall ? 'any' : r.on) : 'red';
  return physics.balls.filter((b) => !b.potted && b.id !== 'cue' && (on === 'any' || (on === 'red' ? b.type === 'red' : on === 'colour' ? b.type !== 'red' : b.type === on)));
}

// Stand the player behind the cue ball, facing the nearest ball on.
function autoStance() {
  const cb = physics.cue;
  let best = null, bd = Infinity;
  for (const b of ballsOn()) { const d = Math.hypot(b.x - cb.x, b.z - cb.z); if (d < bd) { bd = d; best = b; } }
  view.yaw = best && bd > 1e-3 ? yawOf(best.x - cb.x, best.z - cb.z) : -Math.PI / 2;
}

function layoutHud() {
  placePanels();
  const playing = game.state !== 'lobby';
  panels.lobby.visible = !playing && !game.helpOpen;
  panels.help.visible = game.helpOpen;
  panels.score.visible = playing;
  panels.dock.visible = playing && game.state !== 'replay';
  panels.settings.visible = playing && game.settingsOpen && game.state !== 'replay' && !game.helpOpen;
  panels.toast.visible = !!game.toastText;
}
function clearToast() { game.toastText = ''; toastT = 0; panels.toast.visible = false; }

// ------------------------------------------------------------ messages
let toastT = 0;
function toast(text, sub = '', color = null, secs = 2.6) {
  game.toastText = text; game.toastSub = sub; game.toastColor = color; toastT = secs;
  panels.toast.visible = true; panels.toast.redraw();
}
function refresh() {
  for (const p of Object.values(panels)) if (p.visible) p.redraw();
  if (club) drawBigScreen(club.screen, game);
}

// ---------------------------------------------------------------- club
function loadClub(id) {
  if (club) disposeGroup(club.group);
  if (tableMesh) disposeGroup(tableMesh);
  if (scene.environment) scene.environment.dispose();
  club = buildClub(id, game.clubName);
  scene.add(club.group);
  tableMesh = buildTable(id, game.clubName);
  tableRoot.add(tableMesh);
  scene.environment = makeEnvMap(renderer, club.env);
  scene.environmentIntensity = club.envIntensity;
  scene.background = new THREE.Color(club.background);
  scene.fog = club.fog;
  renderer.toneMappingExposure = club.exposure;
  applyShadows();
  audio.setAmbience(club.ambience);
  drawBigScreen(club.screen, game);
}
function applyShadows() {
  const on = game.settings.shadows;
  club.group.traverse((o) => { if (o.isSpotLight) o.castShadow = on; });
  renderer.shadowMap.needsUpdate = true;
}

// --------------------------------------------------------------- frame
let settleT = 0, recording = [], lastShot = null, lastPotPocket = -1;
let aiT = 0, aiPlan = null, overT = 0;
const replay = { frames: null, t: 0, speed: 1, back: null };

function startFrame() {
  const o = game.options;
  tableRoot.remove(ballSet.group);
  rackBalls(physics, o.reds);
  ballSet = new BallSet(physics, tableRoot);
  game.rules = new Rules({ mode: o.mode, reds: o.reds });
  physics.resetShot();
  game.banner = ''; game.hasReplay = false; lastShot = null; game.settingsOpen = false; game.helpOpen = false; game.paused = false;
  aiPlan = null; aiCue.group.visible = false;
  game.state = 'aiming';
  game.status = `${game.rules.names[0]} to break. Place the cue ball in the D if you like.`;
  game.statusColor = null;
  fadeThrough(() => { autoStance(); view.kind = 'stance'; applyView(); layoutHud(); refresh(); });
  toast('FRAME ONE', 'Reach out, take your cue and break off', null, 3.2);
}

function toLobby() {
  game.state = 'lobby'; game.settingsOpen = false; game.paused = false;
  aiCue.group.visible = false; aiPlan = null;
  fadeThrough(() => { view.kind = 'lobby'; applyView(); layoutHud(); refresh(); });
}

function beginRolling() {
  game.state = 'rolling';
  settleT = 0; lastPotPocket = -1;
  recording = [ballSet.capture()];
  game.rules.ballInHand = false;
  layoutHud();
}

function resolveShot() {
  const r = game.rules;
  const shooter = r.names[r.turn];
  const res = r.evaluate({ firstHit: physics.firstHit, potted: physics.pottedThisShot.slice() });
  for (const c of res.respots) respotColour(physics, c);
  if (res.cuePotted || r.ballInHand) { const [x, z] = aiPlaceCueBall(physics); physics.place('cue', x, z); }
  r.checkFreeBall(physics.balls);
  ballSet.sync(0);
  lastShot = recording; game.hasReplay = lastShot.length > 10;
  const cb = physics.cue, at = new V3(cb.x, BALL_Y, cb.z);
  game.statusColor = null;

  if (res.foul) {
    const who = r.players === 2 ? `${res.penalty} to ${r.names[1 - res.player]}` : `${res.penalty} away`;
    const next = r.players === 2 && !r.over ? `  ·  ${r.turn === 0 && r.mode === 'ai' ? 'Your visit' : r.names[r.turn] + ' to play'}` : '';
    toast('FOUL', `${res.reason}  ·  ${who}${next}`, '#ff6b5a', 3.6);
    audio.play('foul', null, 0.7);
    game.status = `Foul by ${shooter}: ${res.reason.toLowerCase()}`; game.statusColor = '#ff8a7a';
  } else if (res.points > 0) {
    audio.play('chime', null, 0.5);
    if (club.id === 'hall') audio.play('applause', club.soundSpot, r.break >= 20 ? 1 : 0.5);
    game.status = `${shooter} scores ${res.points}. Break ${r.break}.`;
    if (r.break >= 20 && r.break - res.points < 20) toast(`BREAK OF ${r.break}`, 'Keep it going');
  } else game.status = r.players === 2 ? `${r.names[r.turn]} to play` : 'No pot. Carry on.';
  if (res.respotBlack) toast('RE-SPOTTED BLACK', 'Scores level. Next score or foul wins.', null, 3.5);
  else if (r.freeBall) { toast('FREE BALL', 'You are snookered: any ball counts as the ball on', null, 3.2); }

  if (r.over) return finishFrame();
  const moved = res.switched && r.players === 2;
  if (r.mode === 'ai' && r.turn === 1) {
    game.state = 'ai'; aiT = 0; aiPlan = null; layoutHud(); refresh();
    if (moved && !res.foul) toast('HOUSE PRO AT THE TABLE', 'Sit back while it plays its visit', '#b0c4ff', 3);
    return;
  }
  game.state = 'aiming';
  if (r.ballInHand) game.status += '  Cue ball in hand: pinch it to place it in the D.';
  fadeThrough(() => { autoStance(); view.kind = 'stance'; applyView(); layoutHud(); refresh(); });
  if (moved && !res.foul) toast(r.mode === 'ai' ? 'YOUR VISIT' : r.names[r.turn].toUpperCase(), r.mode === 'ai' ? 'The House Pro missed. Take your cue.' : 'Your visit to the table');
}

function finishFrame() {
  const r = game.rules;
  game.state = 'over'; overT = 4.2;
  const line = r.players === 2 ? `${r.names[0]} ${r.scores[0]}  :  ${r.scores[1]} ${r.names[1]}` : `Total ${r.scores[0]}  ·  best break ${r.highBreak[0]}`;
  toast(r.players === 2 ? `${r.names[r.winner].toUpperCase()} WINS THE FRAME` : 'FRAME COMPLETE', line, null, 4.2);
  audio.play('applause', club.soundSpot, 1);
  game.banner = `Last frame: ${line}. Fancy another, boss?`;
  layoutHud(); refresh();
}

function updateAI(dt) {
  const r = game.rules, cb = physics.cue;
  aiT += dt;
  if (!aiPlan && aiT > 1.8) {
    if (r.ballInHand) { const [x, z] = aiPlaceCueBall(physics); physics.place('cue', x, z); }
    aiPlan = planShot(physics, r, game.options.level);
    game.status = `${r.names[1]} is on the shot`; refresh();
  }
  if (!aiPlan) return;
  const t = aiT - 1.8, d = new V3(aiPlan.dir.x, aiPlan.dir.y, aiPlan.dir.z).normalize();
  // two feathers, a pause, then the stroke
  let gap;
  if (t < 1.6) gap = 0.06 + 0.05 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 0.8));
  else if (t < 2.1) gap = 0.06 + 0.2 * Math.sin(((t - 1.6) / 0.5) * Math.PI / 2);
  else gap = 0.26 * Math.max(0, 1 - (t - 2.1) / 0.07);
  aiCue.group.visible = true;
  aiCue.setPose(new V3(cb.x, BALL_Y, cb.z).addScaledVector(d, -(R + gap)), d);
  if (t >= 2.17) {
    physics.strike(aiPlan.dir, aiPlan.speed, aiPlan.a, aiPlan.b);
    aiPlan = null;
    beginRolling();
  }
}

function startReplay(kind) {
  if (game.state !== 'aiming' || !lastShot) return;
  replay.frames = lastShot; replay.t = 0; replay.speed = kind === 'cinematic' ? 0.4 : 1;
  replay.back = { kind: view.kind, yaw: view.yaw };
  game.state = 'replay'; game.settingsOpen = false;
  fadeThrough(() => {
    if (kind === 'overhead') view.kind = 'overhead';
    else if (kind === 'cinematic') {
      const p = lastPotPocket >= 0 ? POCKETS[lastPotPocket] : { x: L + 0.2, z: W * 0.6 };
      const l = Math.hypot(p.x, p.z) || 1;
      view.eye.set(p.x + (p.x / l) * 0.3, BED_Y + 0.3, p.z + (p.z / l) * 0.3);
      view.yaw = yawOf(-p.x, -p.z); view.kind = 'cinematic';
    }
    applyView(); layoutHud();
  });
  toast('REPLAY', kind === 'cinematic' ? 'Slow motion' : kind === 'overhead' ? 'From above' : 'From where you stood', null, 2);
}

function endReplay() {
  game.state = 'aiming';
  fadeThrough(() => { view.kind = replay.back.kind; view.yaw = replay.back.yaw; ballSet.sync(0); applyView(); layoutHud(); refresh(); });
}

// ------------------------------------------------------------- actions
Object.assign(game.actions, {
  refresh,
  startFrame,
  toLobby,
  setClub(id) {
    if (id === game.options.club) return;
    game.options.club = id; store.set('cueverse.room', id);
    fadeThrough(() => { loadClub(id); refresh(); });
  },
  toggleSettings() { game.settingsOpen = !game.settingsOpen; layoutHud(); refresh(); },
  orbit(d) { if (view.kind === 'stance' || view.kind === 'overview' || view.kind === 'closeup') { view.yaw = wrap(view.yaw + d); applyView(); } },
  posture(p) { const s = game.settings; s.posture = p; s.eyeH = p === 'sit' ? 0.42 : 0.6; if (renderer.xr.isPresenting) calibrate(); else applyView(); refresh(); },
  recenter() { if (renderer.xr.isPresenting) calibrate(); else applyView(); },
  adjust(key, d) { const s = game.settings; s[key] = key === 'eyeH' ? THREE.MathUtils.clamp(s.eyeH + d, 0.18, 0.95) : THREE.MathUtils.clamp(s.dist + d, 0.3, 1.1); applyView(); },
  set(key, v) { game.settings[key] = v; if (key === 'shadows') applyShadows(); refresh(); },
  view(kind) { if (game.state !== 'aiming') return; setView(kind); setTimeout(refresh, 400); },
  replay: startReplay,
  togglePause() {
    if (game.state === 'lobby' || game.state === 'over') return;
    game.paused = !game.paused;
    if (game.paused) toast('PAUSED', renderer.xr.isPresenting ? 'Resume from the table menu' : 'Press P or Resume to carry on', null, 1e9);
    else clearToast();
    layoutHud(); refresh();
  },
  toggleHelp() { game.helpOpen = !game.helpOpen; layoutHud(); refresh(); },
  concede() {
    const r = game.rules;
    if (!r || r.over || game.state === 'lobby' || game.state === 'over') return;
    game.paused = false; aiPlan = null; aiCue.group.visible = false;
    r.over = true; r.on = null;
    r.winner = r.players === 2 ? (r.mode === 'ai' ? 1 : 1 - r.turn) : 0;
    finishFrame();
    const line = r.players === 2 ? `${r.names[0]} ${r.scores[0]}  :  ${r.scores[1]} ${r.names[1]}` : `Total ${r.scores[0]}`;
    toast(r.players === 2 ? 'FRAME CONCEDED' : 'FRAME ENDED', line, '#ff8a7a', 4.2);
  },
  setSound(on) { game.settings.sound = on; audio.setMuted(!on); refresh(); },
  setRoomTone(on) { game.settings.roomTone = on; audio.setRoomTone(on); refresh(); },
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  },
  exitClub() {
    clearToast(); game.helpOpen = false;
    toLobby();
    if (renderer.xr.isPresenting) renderer.xr.getSession().end();
    else overlay.classList.remove('hidden');
  },
});

// --------------------------------------------------------- desktop input
const mouse = { x: 0, y: 0, clicked: false, down: false, inside: false };
let deskDrag = false;                 // dragging the cue ball into place with the mouse
const desk = {
  index: 0, tracked: true, isHand: false, autoGrab: false, grab: false, pinch: false, busy: false, palmUp: false,
  grip: new V3(0, 1, 0), gripRaw: new V3(0, 1, 0), bridge: new V3(), pinchPoint: new V3(), pinchLocal: new V3(), palm: new V3(),
  hasRay: true, rayOrigin: new V3(), rayDir: new V3(0, 0, -1), selectStarted: false, selectEnded: false, selecting: false,
};
const deskRay = new THREE.Raycaster();
renderer.domElement.addEventListener('pointermove', (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; mouse.inside = true; });
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0) { mouse.clicked = true; mouse.down = true; } });
window.addEventListener('pointerup', (e) => { if (e.button === 0) mouse.down = false; });
window.addEventListener('keydown', (e) => {
  if (renderer.xr.isPresenting || e.target === nameInput) return;
  const k = e.key.toLowerCase();
  if (k === 'a') game.actions.orbit(0.12);
  else if (k === 'd') game.actions.orbit(-0.12);
  else if (k === 'm' && game.state !== 'lobby') game.actions.toggleSettings();
  else if (k === 'p') game.actions.togglePause();
  else if (k === 'h') game.actions.toggleHelp();
  else if (k === 'f') game.actions.fullscreen();
  else if (k === 'escape') {
    if (game.helpOpen) game.actions.toggleHelp();
    else if (game.settingsOpen) game.actions.toggleSettings();
    else game.actions.togglePause();
  }
});
function updateDesktop(dt) {
  deskRay.setFromCamera(mouse, camera);
  desk.rayOrigin.copy(deskRay.ray.origin); desk.rayDir.copy(deskRay.ray.direction);
  desk.selectStarted = mouse.clicked; mouse.clicked = false;
  const o = deskRay.ray.origin, d = deskRay.ray.direction, py = BED_Y + 0.13;
  if (d.y < -0.02) {
    const p = o.clone().addScaledVector(d, (py - o.y) / d.y);
    const cb = physics.cue, off = new V3(p.x - cb.x, 0, p.z - cb.z);
    if (off.length() > 1.1) off.setLength(1.1);
    desk.gripRaw.set(cb.x + off.x, py, cb.z + off.z);
  }
  desk.grip.lerp(desk.gripRaw, 1 - Math.exp(-dt * 14));
  // ball in hand: press on the white and drag it round the D
  const r = game.rules, cb = physics.cue;
  let bed = null;
  if (d.y < -0.02) bed = o.clone().addScaledVector(d, (BALL_Y - o.y) / d.y);
  if (deskDrag) {
    if (!mouse.down || game.state !== 'aiming') { deskDrag = false; fadeThrough(() => { autoStance(); applyView(); }); }
    else if (bed) { const [x, z] = clampToD(bed.x, bed.z); if (physics.isFree(x, z, 'cue')) { cb.x = x; cb.z = z; } }
  } else if (desk.selectStarted && !desk.busy && !game.paused && game.state === 'aiming' && r && r.ballInHand && bed && Math.hypot(bed.x - cb.x, bed.z - cb.z) < 0.13) {
    deskDrag = true;
  }
  desk.autoGrab = desk.grab = game.state === 'aiming' && view.kind === 'stance' && mouse.inside && !deskDrag && !game.paused;
  return [desk];
}

// -------------------------------------------------------------- gestures
let gesture = null;
const palmT = [0, 0], palmArmed = [true, true];
function cueBallWorld() { const cb = physics.cue; return new V3(cb.x, BALL_Y, cb.z); }

function clampToD(x, z) {
  x = Math.min(x, BAULK_X);
  const dx = x - BAULK_X, d = Math.hypot(dx, z);
  if (d > D_R - 0.001) { const k = (D_R - 0.001) / d; x = BAULK_X + dx * k; z *= k; }
  return [x, z];
}

function handleXRInputs(inputs, dt) {
  const r = game.rules;
  inputs.forEach((inp, i) => {
    const key = 'xr' + i, laser = lasers[i];
    laser.line.visible = laser.dot.visible = false;
    inp.busy = !!gesture && gesture.idx === i;
    const holding = cue.holder === i;
    if (!inp.tracked || !inp.hasRay || holding || inp.busy) { ui.clear(key); }
    else {
      const hit = ui.point(key, inp.rayOrigin, inp.rayDir);
      if (hit) {
        laser.line.visible = laser.dot.visible = true;
        laser.line.position.copy(inp.rayOrigin); laser.line.lookAt(hit.point); laser.line.scale.set(1, 1, hit.dist);
        laser.dot.position.copy(hit.point);
      }
    }
    if (inp.selectStarted && inp.tracked && !holding) {
      if (!ui.click(key)) {
        const playing = game.state === 'aiming' || game.state === 'rolling' || game.state === 'ai';
        if (game.state === 'aiming' && r && r.ballInHand && inp.pinchPoint.distanceTo(cueBallWorld()) < 0.13) gesture = { type: 'ball', idx: i };
        else if (playing && (view.kind === 'stance' || view.kind === 'overview') && (cue.holder === null || inp.pinchPoint.y > BED_Y + 0.16)) {
          // grab the air and drag: walk round the table
          const pivot = view.kind === 'stance' ? cueBallWorld() : new V3(0, BALL_Y, 0);
          const pl = rig.worldToLocal(pivot.clone());
          gesture = { type: 'orbit', idx: i, pl, a0: yawOf(inp.pinchLocal.x - pl.x, inp.pinchLocal.z - pl.z), yaw0: view.yaw };
        }
      }
    }
    if (gesture && gesture.idx === i) {
      if (!inp.tracked || inp.selectEnded || !inp.selecting) {
        if (gesture.type === 'ball') fadeThrough(() => { autoStance(); applyView(); });
        gesture = null;
      } else if (gesture.type === 'orbit') {
        const a = yawOf(inp.pinchLocal.x - gesture.pl.x, inp.pinchLocal.z - gesture.pl.z);
        view.yaw = wrap(gesture.yaw0 - wrap(a - gesture.a0));
        applyView();
      } else if (gesture.type === 'ball') {
        const [x, z] = clampToD(inp.pinchPoint.x, inp.pinchPoint.z);
        if (physics.isFree(x, z, 'cue')) { physics.cue.x = x; physics.cue.z = z; }
      }
    }
    // open palm facing up for a moment: table menu
    if (inp.tracked && inp.palmUp && !holding && game.state !== 'lobby') {
      palmT[i] += dt;
      if (palmT[i] > 0.7 && palmArmed[i]) { palmArmed[i] = false; game.actions.toggleSettings(); audio.play('click', null, 0.5); }
    } else { palmT[i] = 0; if (!inp.palmUp) palmArmed[i] = true; }
  });
}

function handleDesktop(inputs) {
  const hit = ui.point('mouse', desk.rayOrigin, desk.rayDir);
  renderer.domElement.style.cursor = hit && hit.btn ? 'pointer' : 'default';
  if (desk.selectStarted) ui.click('mouse');
  desk.busy = !!hit;
  return inputs;
}

// ------------------------------------------------------------ main loop
const clock = new THREE.Clock();
const restTip = new V3(), restDir = new V3();
const cueCtx = {
  ball: new V3(), canShoot: false, restTip, restDir, power: 1,
  onStrike(dir, V, a, b) {
    if (game.state !== 'aiming') return;
    physics.strike(dir, V, a, b);
    beginRolling();
  },
  onGrab() { audio.play('click', null, 0.3, 0.6); },
};
const _f = new V3(), _u = new V3(), _p = new V3();

function tick(dt, time) {
  const presenting = renderer.xr.isPresenting;

  if (presenting && calibrateIn > 0 && --calibrateIn === 0) calibrate();
  let inputs;
  if (presenting) { inputs = xrInputs.update(dt); handleXRInputs(inputs, dt); }
  else { inputs = handleDesktop(updateDesktop(dt)); for (const l of lasers) l.line.visible = l.dot.visible = false; }

  // game state (frozen while paused)
  if (game.paused) { /* nothing moves */ }
  else if (game.state === 'rolling') {
    physics.step(dt);
    for (const e of physics.events) {
      _p.set(e.x, BALL_Y, e.z);
      if (e.type === 'ball') audio.play('ball', _p, Math.min(1.2, e.speed * 0.5), 0.96 + Math.random() * 0.08);
      else if (e.type === 'cushion') audio.play('cushion', _p, Math.min(1, e.speed * 0.4));
      else if (e.type === 'strike') audio.play('cue', _p, Math.min(1.2, 0.25 + e.speed * 0.2));
      else if (e.type === 'pot') { audio.play('pocket', _p, 0.9); if (e.id !== 'cue' && lastPotPocket < 0) lastPotPocket = e.pocket; }
    }
    physics.events.length = 0;
    ballSet.sync(dt);
    if (recording.length < 2400) recording.push(ballSet.capture());
    if (!physics.isMoving()) { settleT += dt; if (settleT > 0.45) resolveShot(); } else settleT = 0;
  } else if (game.state === 'ai') { updateAI(dt); ballSet.sync(dt); }
  else if (game.state === 'replay') {
    replay.t += dt * replay.speed * 72;
    const i = Math.floor(replay.t);
    if (i >= replay.frames.length + 40) endReplay();
    else ballSet.show(replay.frames[Math.min(i, replay.frames.length - 1)]);
  } else if (game.state === 'over') { ballSet.sync(dt); overT -= dt; if (overT <= 0) toLobby(); }
  else ballSet.sync(dt);
  if (game.state !== 'ai') aiCue.group.visible = false;

  // the player's cue
  const cb = physics.cue;
  cueCtx.ball.set(cb.x, BALL_Y, cb.z);
  cueCtx.canShoot = game.state === 'aiming' && view.kind === 'stance' && !cb.potted && !game.paused && !deskDrag && !(gesture && gesture.type === 'ball');
  cueCtx.power = game.settings.power;
  restTip.set(0.36, -0.2, -0.78).applyMatrix4(hud.matrixWorld);
  restDir.set(-0.12, 0.1, -1).normalize().transformDirection(hud.matrixWorld);
  cue.update(dt, inputs, cueCtx);
  guide.update(cueCtx.canShoot ? cue.aim : null, physics, game.settings.guide);
  cueVisual.group.visible = game.state !== 'replay';

  // timers, fades, ambience
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) { game.toastText = ''; panels.toast.visible = false; } }
  if (fade.dir !== 0) {
    fade.v += fade.dir * dt / 0.14;
    if (fade.dir > 0 && fade.v >= 1) { fade.v = 1; fade.dir = -1; const fn = fade.fn; fade.fn = null; if (fn) fn(); }
    else if (fade.dir < 0 && fade.v <= 0) { fade.v = 0; fade.dir = 0; }
  }
  fadeMesh.visible = fade.v > 0.001; fadeMesh.material.opacity = fade.v;
  if (club) { club.update(time, dt); audio.update(dt, club.soundSpot); }
  camera.getWorldPosition(_p); camera.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  audio.setListener(_p, _f, _u);

  renderer.render(scene, camera);
  if (presenting) xrInputs.endFrame();
}

// --------------------------------------------------------------- start
loadClub(game.options.club);
applyView(); layoutHud(); refresh();
function frame() { tick(Math.min(0.05, clock.getDelta()), clock.elapsedTime); }
renderer.setAnimationLoop(frame);

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  layoutHud();
});

const overlay = document.getElementById('overlay'), nameInput = document.getElementById('clubName');
const vrBtn = document.getElementById('enterVR'), deskBtn = document.getElementById('enterDesktop'), note = document.getElementById('note');
nameInput.value = game.clubName;
function commitName() {
  const n = nameInput.value.trim().slice(0, 28) || "The Owner's Club";
  if (n !== game.clubName) { game.clubName = n; store.set('cueverse.club', n); loadClub(game.options.club); refresh(); }
}
deskBtn.addEventListener('click', () => { commitName(); audio.start(); overlay.classList.add('hidden'); });
vrBtn.addEventListener('click', async () => {
  commitName(); audio.start();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (err) { note.textContent = 'Could not start VR: ' + err.message; }
});
renderer.xr.addEventListener('sessionstart', () => { game.xr = true; overlay.classList.add('hidden'); calibrateIn = 20; applyView(); layoutHud(); refresh(); });
renderer.xr.addEventListener('sessionend', () => { game.xr = false; overlay.classList.remove('hidden'); applyView(); layoutHud(); refresh(); });

// ?desktop opens the preview straight away; ?desktop=play also breaks off; &menu opens the table menu; &club=<id> picks the room; &still skips the fade and toast for screenshots; &record hands the clock to video/record.mjs.
const qs = new URLSearchParams(location.search);
if (qs.has('desktop')) {
  deskBtn.click();
  if (qs.get('desktop') === 'play') { startFrame(); if (qs.has('menu')) game.actions.toggleSettings(); }
  if (qs.has('help')) game.actions.toggleHelp();
  // &still finishes any fade and clears the toast at once, for screenshots.
  if (qs.has('still')) { const fn = fade.fn; fade.fn = null; fade.v = 0; fade.dir = 0; fadeMesh.visible = false; if (fn) fn(); clearToast(); }
}
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    vrBtn.disabled = !ok;
    note.textContent = ok ? 'Hand tracking recommended. Put your controllers down and play with your hands.' : 'No VR headset found on this device. Open this page in the Meta Quest Browser, or try the desktop preview.';
  }).catch(() => { vrBtn.disabled = true; });
} else { vrBtn.disabled = true; note.textContent = 'WebXR is not available here (it needs https). Open this page in the Meta Quest Browser, or try the desktop preview.'; }

// handy for testing from the console
window.cueverse = { game, physics, cue, cueCtx, view, applyView, startFrame, renderer, scene, camera };

// &record: no animation loop. A recorder (video/record.mjs) drives fixed time
// steps through cueverse.rec and screenshots each one, so a slow machine can
// still produce smooth footage.
if (qs.has('record')) {
  renderer.setAnimationLoop(null);
  let recT = 0;
  const nearestOn = () => {
    const r = game.rules, cb = physics.cue;
    const on = r.freeBall ? 'any' : r.on;
    let best = null, bd = 1e9;
    for (const b of physics.balls) {
      if (b.potted || b.id === 'cue') continue;
      if (on !== 'any' && !(on === 'red' ? b.type === 'red' : on === 'colour' ? b.type !== 'red' : b.type === on)) continue;
      const d = Math.hypot(b.x - cb.x, b.z - cb.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  window.cueverse.rec = {
    step(dt = 1 / 30) { recT += dt; tick(dt, recT); return game.state; },
    state() {
      const r = game.rules;
      return { t: recT, state: game.state, view: view.kind, hasReplay: game.hasReplay, fade: fade.v, toast: game.toastText,
        club: game.options.club, turn: r ? r.turn : -1, scores: r ? r.scores.slice() : [], on: r ? r.on : null,
        help: game.helpOpen, menu: game.settingsOpen, moving: physics.isMoving() };
    },
    // The player shoots like the House Pro would; falls back to a plain hit on the nearest ball on.
    shootPlanned(level = 'pro', V = 1.4) {
      if (game.state !== 'aiming') return false;
      const p = planShot(physics, game.rules, level);
      if (p) { cueCtx.onStrike(p.dir, p.speed, p.a, p.b); return 'plan'; }
      const b = nearestOn(); if (!b) return false;
      const cb = physics.cue, dx = b.x - cb.x, dz = b.z - cb.z, l = Math.hypot(dx, dz) || 1;
      cueCtx.onStrike({ x: dx / l, y: 0, z: dz / l }, V, 0, 0); return 'nearest';
    },
    breakOff(V = 3.4, side = 0.25) {
      if (game.state !== 'aiming') return false;
      const cb = physics.cue, apex = physics.byId.get('red1');
      const dx = apex.x - cb.x, dz = apex.z - cb.z, l = Math.hypot(dx, dz) || 1;
      cueCtx.onStrike({ x: dx / l, y: 0, z: dz / l }, V, 0, side); return true;
    },
    endReplay,
    setView: (k) => setView(k),
  };
}
