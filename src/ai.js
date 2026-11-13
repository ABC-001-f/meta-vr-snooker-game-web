import { R, L, W, POCKETS, VALUE, BAULK_X } from './config.js';

// Aim error in radians (1 sigma). Small numbers: a cut shot magnifies the error ~15x.
const LEVELS = { rookie: 0.009, club: 0.0045, pro: 0.0015 };

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pathBlocked(x1, z1, x2, z2, balls, ignore) {
  const ex = x2 - x1, ez = z2 - z1;
  const len2 = ex * ex + ez * ez || 1e-9;
  for (const b of balls) {
    if (b.potted || ignore.includes(b.id)) continue;
    let t = ((b.x - x1) * ex + (b.z - z1) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = b.x - (x1 + ex * t), dz = b.z - (z1 + ez * t);
    if (dx * dx + dz * dz < 4 * R * R * 0.98) return true;
  }
  return false;
}

const isOnFn = (on) => (b) => (on === 'red' ? b.type === 'red' : on === 'colour' ? b.type !== 'red' : b.type === on);

// Where the AI puts the cue ball when it has ball in hand.
export function aiPlaceCueBall(physics) {
  const spots = [[BAULK_X - 0.12, 0.11], [BAULK_X - 0.12, -0.11], [BAULK_X - 0.2, 0], [BAULK_X - 0.05, 0.2], [BAULK_X - 0.05, -0.2]];
  for (const [x, z] of spots) if (physics.isFree(x, z, 'cue')) return [x, z];
  return spots[0];
}

// Returns { dir: {x,y,z}, speed, a, b }
export function planShot(physics, rules, level = 'club') {
  const balls = physics.balls;
  const cue = physics.cue;
  const on = rules.freeBall ? 'any' : rules.on;
  const isOn = on === 'any' ? (b) => b.id !== 'cue' : isOnFn(on);
  const targets = balls.filter((b) => !b.potted && b.id !== 'cue' && isOn(b));
  let best = null;

  for (const t of targets) {
    for (const p of POCKETS) {
      // aim at a point just inside the pocket mouth
      const pl = Math.hypot(p.x, p.z);
      const px = p.x - (p.x / pl) * 0.035, pz = p.z - (p.z / pl) * 0.035;
      const ox = px - t.x, oz = pz - t.z, d2 = Math.hypot(ox, oz);
      if (d2 < 1e-4) continue;
      const ux = ox / d2, uz = oz / d2;
      const gx = t.x - ux * 2 * R, gz = t.z - uz * 2 * R;
      if (Math.abs(gx) > L - R || Math.abs(gz) > W - R) continue;
      const ax = gx - cue.x, az = gz - cue.z, d1 = Math.hypot(ax, az);
      if (d1 < 1e-4) continue;
      const cos = (ax / d1) * ux + (az / d1) * uz;
      if (cos < 0.3) continue;
      if (pathBlocked(cue.x, cue.z, gx, gz, balls, ['cue', t.id])) continue;
      if (pathBlocked(t.x, t.z, px, pz, balls, ['cue', t.id])) continue;
      // middle pockets are tight from a shallow angle
      let entry = 1;
      if (!p.corner) entry = Math.abs(uz) < 0.45 ? 0 : Math.abs(uz);
      if (entry === 0) continue;
      let score = (Math.pow(cos, 1.6) * entry) / (1 + 0.4 * d1 + 0.7 * d2);
      if (on === 'colour') score *= 1 + VALUE[t.type] * 0.06;
      if (!best || score > best.score) best = { score, ax: ax / d1, az: az / d1, d1, d2, cos };
    }
  }

  const err = LEVELS[level] ?? LEVELS.club;
  if (best) {
    const ang = Math.atan2(best.az, best.ax) + gauss() * err;
    const speed = Math.min(4.6, 0.9 + (0.75 * best.d1 + 1.25 * best.d2) / Math.max(0.35, best.cos));
    return { dir: { x: Math.cos(ang), y: -0.06, z: Math.sin(ang) }, speed, a: 0, b: -0.1 };
  }

  // No pot on: play a legal contact. Try a direct hit, then search by simulation.
  let safety = null;
  for (const t of targets) {
    const dx = t.x - cue.x, dz = t.z - cue.z, d = Math.hypot(dx, dz);
    if (pathBlocked(cue.x, cue.z, t.x, t.z, balls, ['cue', t.id])) continue;
    if (!safety || d < safety.d) safety = { d, x: dx / d, z: dz / d };
  }
  if (safety) {
    const ang = Math.atan2(safety.z, safety.x) + gauss() * err;
    return { dir: { x: Math.cos(ang), y: -0.06, z: Math.sin(ang) }, speed: Math.min(3, 0.8 + safety.d * 0.9), a: 0, b: 0 };
  }
  let escape = null;
  for (let i = 0; i < 72; i++) {
    const ang = (i / 72) * Math.PI * 2;
    const sim = physics.clone();
    sim.strike({ x: Math.cos(ang), y: 0, z: Math.sin(ang) }, 2.6, 0, 0);
    for (let s = 0; s < 480 && sim.firstHit === null && sim.isMoving(); s++) sim.step(1 / 120);
    const hit = sim.firstHit && sim.get(sim.firstHit);
    if (hit && isOn(hit) && !sim.pottedThisShot.includes('cue')) { escape = ang; if (Math.random() < 0.5) break; }
  }
  const ang = escape ?? Math.random() * Math.PI * 2;
  return { dir: { x: Math.cos(ang), y: -0.06, z: Math.sin(ang) }, speed: 2.6, a: 0, b: 0 };
}
