import { R, L, W, CW, CORNER_CUT, MID_GAP, POCKETS } from './config.js';

// Ball physics on the table plane with full 3D spin.
// A ball slides until the contact point stops slipping, then rolls. Top, back
// and side spin (and swerve from an elevated cue) all fall out of that model.
const G = 9.81;
const MU_SLIDE = 0.2;
const MU_ROLL = 0.013;
const E_BALL = 0.95;
const E_CUSHION = 0.78;
const MU_CUSHION = 0.2;
const SPIN_DECAY = 14;      // rad/s^2, side spin scrubbing off on the cloth
const STOP_SPEED = 0.005;

export class Ball {
  constructor(id, type, x, z) {
    this.id = id;
    this.type = type;
    this.x = x; this.z = z;
    this.vx = 0; this.vz = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.q = [0, 0, 0, 1];
    this.potted = false;
    this.pocket = -1;
    this.potT = 0;
  }
}

function buildSegments() {
  const segs = [];
  const add = (x1, z1, x2, z2) => segs.push({ x1, z1, x2, z2 });
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const xa = sx * MID_GAP, xb = sx * (L - CORNER_CUT), z = sz * W;
      add(xa, z, xb, z);                                           // long cushion nose
      add(xa, z, sx * (MID_GAP - 0.012), sz * (W + CW));           // middle pocket jaw
      add(xb, z, sx * (L - CORNER_CUT + CW), sz * (W + CW));       // corner pocket jaw
    }
  }
  for (const sx of [-1, 1]) {
    const x = sx * L, zb = W - CORNER_CUT;
    add(x, -zb, x, zb);                                            // short cushion nose
    add(x, -zb, sx * (L + CW), -zb - CW);
    add(x, zb, sx * (L + CW), zb + CW);
  }
  return segs;
}

export class Physics {
  constructor() {
    this.balls = [];
    this.byId = new Map();
    this.segs = buildSegments();
    this.events = [];
    this.firstHit = null;
    this.pottedThisShot = [];
  }

  addBall(id, type, x, z) {
    const b = new Ball(id, type, x, z);
    this.balls.push(b);
    this.byId.set(id, b);
    return b;
  }

  get(id) { return this.byId.get(id); }
  get cue() { return this.byId.get('cue'); }

  clone() {
    const p = new Physics();
    for (const b of this.balls) {
      const c = p.addBall(b.id, b.type, b.x, b.z);
      c.potted = b.potted;
    }
    return p;
  }

  resetShot() {
    this.firstHit = null;
    this.pottedThisShot = [];
    this.events.length = 0;
  }

  // Is a ball-sized spot at (x,z) free of other balls?
  isFree(x, z, ignoreId) {
    for (const b of this.balls) {
      if (b.potted || b.id === ignoreId) continue;
      const dx = b.x - x, dz = b.z - z;
      if (dx * dx + dz * dz < 4 * R * R * 1.02) return false;
    }
    return true;
  }

  place(id, x, z) {
    const b = this.byId.get(id);
    b.x = x; b.z = z;
    b.vx = b.vz = b.wx = b.wy = b.wz = 0;
    b.potted = false; b.pocket = -1; b.potT = 0;
  }

  // dir: unit 3D vector along the cue (tip direction). V: cue-ball speed for a
  // centre hit. a/b: tip offset right/up from centre, as a fraction of R.
  strike(dir, V, a = 0, b = 0) {
    const cb = this.cue;
    this.resetShot();
    const m = Math.hypot(a, b);
    if (m > 0.55) { a *= 0.55 / m; b *= 0.55 / m; }
    const dy = Math.min(0, Math.max(-0.6, dir.y));
    const hl0 = Math.hypot(dir.x, dir.z) || 1e-6;
    const hx = dir.x / hl0, hz = dir.z / hl0;
    const hl = Math.sqrt(1 - dy * dy);
    const dx = hx * hl, dz = hz * hl;
    // cue frame: right = d x Y, up = right x d
    const rx = -hz, rz = hx;
    const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
    const k = 2.5 * V / R;
    cb.wx = k * (a * ux - b * rx);
    cb.wy = k * (a * uy);
    cb.wz = k * (a * uz - b * rz);
    const eff = 1 - 0.25 * (a * a + b * b);
    cb.vx = V * eff * dx;
    cb.vz = V * eff * dz;
    this.events.push({ type: 'strike', speed: V, x: cb.x, z: cb.z });
  }

  isMoving() {
    for (const b of this.balls) {
      if (b.potted) continue;
      if (b.vx !== 0 || b.vz !== 0) return true;
      if (Math.hypot(R * b.wz, R * b.wx) > 0.01) return true;
    }
    return false;
  }

  step(dt) {
    let maxV = 0;
    for (const b of this.balls) {
      if (b.potted) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (v > maxV) maxV = v;
    }
    const n = Math.max(1, Math.min(32, Math.ceil((maxV * dt) / (R * 0.4))));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
    for (const b of this.balls) {
      if (b.potted) continue;
      const wl = Math.hypot(b.wx, b.wy, b.wz);
      if (wl < 1e-4) continue;
      const ang = wl * dt, s = Math.sin(ang / 2) / wl, c = Math.cos(ang / 2);
      const ax = b.wx * s, ay = b.wy * s, az = b.wz * s;
      const [qx, qy, qz, qw] = b.q;
      const nx = c * qx + ax * qw + ay * qz - az * qy;
      const ny = c * qy - ax * qz + ay * qw + az * qx;
      const nz = c * qz + ax * qy - ay * qx + az * qw;
      const nw = c * qw - ax * qx - ay * qy - az * qz;
      const il = 1 / Math.hypot(nx, ny, nz, nw);
      b.q[0] = nx * il; b.q[1] = ny * il; b.q[2] = nz * il; b.q[3] = nw * il;
    }
  }

  substep(h) {
    const balls = this.balls;
    for (const b of balls) {
      if (b.potted) continue;
      // slip velocity of the contact point on the cloth
      const ux = b.vx + R * b.wz, uz = b.vz - R * b.wx;
      const u = Math.hypot(ux, uz);
      if (u > 1e-3) {
        const k = MU_SLIDE * G * h;
        const kk = k * Math.min(1, u / (3.5 * k));
        const ex = ux / u, ez = uz / u;
        b.vx -= kk * ex; b.vz -= kk * ez;
        b.wx += (2.5 * kk * ez) / R;
        b.wz -= (2.5 * kk * ex) / R;
      } else {
        const v = Math.hypot(b.vx, b.vz);
        if (v > 0) {
          const dec = MU_ROLL * G * h;
          if (v <= dec || v < STOP_SPEED) {
            b.vx = b.vz = 0; b.wx = b.wz = 0;
          } else {
            const s = (v - dec) / v;
            b.vx *= s; b.vz *= s;
            b.wx = b.vz / R; b.wz = -b.vx / R;
          }
        }
      }
      if (b.wy !== 0) {
        const d = SPIN_DECAY * h;
        b.wy = Math.abs(b.wy) <= d ? 0 : b.wy - Math.sign(b.wy) * d;
      }
      b.x += b.vx * h; b.z += b.vz * h;
    }

    // ball to ball
    const D2 = 4 * R * R;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.potted) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.potted) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= D2) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d, nz = dz / d;
        const push = (2 * R - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel > 0) {
          const imp = ((1 + E_BALL) / 2) * rel;
          a.vx -= imp * nx; a.vz -= imp * nz;
          b.vx += imp * nx; b.vz += imp * nz;
          if (this.firstHit === null && (a.id === 'cue' || b.id === 'cue')) {
            this.firstHit = a.id === 'cue' ? b.id : a.id;
          }
          this.events.push({ type: 'ball', a: a.id, b: b.id, speed: rel, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        }
      }
    }

    // cushions, jaws and pockets
    for (const b of balls) {
      if (b.potted) continue;
      let potted = false;
      for (let p = 0; p < POCKETS.length; p++) {
        const pk = POCKETS[p];
        const dx = b.x - pk.x, dz = b.z - pk.z;
        if (dx * dx + dz * dz < pk.r * pk.r) { this.pot(b, p); potted = true; break; }
      }
      if (potted) continue;
      if (Math.abs(b.x) > L + 0.035 || Math.abs(b.z) > W + 0.035) {
        let best = 0, bd = Infinity;
        for (let p = 0; p < POCKETS.length; p++) {
          const d = Math.hypot(b.x - POCKETS[p].x, b.z - POCKETS[p].z);
          if (d < bd) { bd = d; best = p; }
        }
        this.pot(b, best);
        continue;
      }
      if (Math.abs(b.x) < L - 2 * R && Math.abs(b.z) < W - 2 * R) continue;
      for (const s of this.segs) {
        const ex = s.x2 - s.x1, ez = s.z2 - s.z1;
        let t = ((b.x - s.x1) * ex + (b.z - s.z1) * ez) / (ex * ex + ez * ez);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = s.x1 + ex * t, cz = s.z1 + ez * t;
        const dx = b.x - cx, dz = b.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d, nz = dz / d;
        b.x = cx + nx * R; b.z = cz + nz * R;
        const vn = b.vx * nx + b.vz * nz;
        if (vn >= 0) continue;
        const tx = nz, tz = -nx;
        const vt = b.vx * tx + b.vz * tz;
        const ut = vt - R * b.wy;                     // slip along the cushion (side spin bites here)
        const lim = MU_CUSHION * (1 + E_CUSHION) * -vn;
        let dvt = -ut / 3.5;
        dvt = dvt > lim ? lim : dvt < -lim ? -lim : dvt;
        const vn2 = -E_CUSHION * vn, vt2 = vt + dvt;
        b.vx = nx * vn2 + tx * vt2;
        b.vz = nz * vn2 + tz * vt2;
        b.wy -= (2.5 * dvt) / R;
        this.events.push({ type: 'cushion', id: b.id, speed: -vn, x: b.x, z: b.z });
      }
    }
  }

  pot(b, pocket) {
    this.events.push({ type: 'pot', id: b.id, pocket, speed: Math.hypot(b.vx, b.vz), x: b.x, z: b.z });
    b.potted = true; b.pocket = pocket; b.potT = 0;
    b.vx = b.vz = b.wx = b.wy = b.wz = 0;
    this.pottedThisShot.push(b.id);
  }
}

// First thing a cue ball travelling from (cx,cz) along unit (hx,hz) meets.
export function castCueBall(balls, cx, cz, hx, hz) {
  let best = Infinity, hit = null;
  for (const b of balls) {
    if (b.potted || b.id === 'cue') continue;
    const ox = b.x - cx, oz = b.z - cz;
    const proj = ox * hx + oz * hz;
    if (proj <= 0) continue;
    const perp2 = ox * ox + oz * oz - proj * proj;
    if (perp2 >= 4 * R * R) continue;
    const t = proj - Math.sqrt(4 * R * R - perp2);
    if (t > 0 && t < best) { best = t; hit = b; }
  }
  let tc = Infinity;
  if (hx > 1e-6) tc = Math.min(tc, (L - R - cx) / hx);
  if (hx < -1e-6) tc = Math.min(tc, (-L + R - cx) / hx);
  if (hz > 1e-6) tc = Math.min(tc, (W - R - cz) / hz);
  if (hz < -1e-6) tc = Math.min(tc, (-W + R - cz) / hz);
  if (hit && best < tc) return { t: best, ball: hit };
  return { t: Math.max(0, tc), ball: null };
}
