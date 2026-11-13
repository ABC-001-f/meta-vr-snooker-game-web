import * as THREE from 'three';
import { R, BED_Y, CUE_LENGTH } from './config.js';
import { castCueBall } from './physics.js';
import { woodTexture } from './textures.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FWD = new V3(0, 0, -1);

// The cue model: tip at the origin, butt running back along +Z.
export class CueVisual {
  constructor(parent, tint = 0xffffff) {
    this.group = new THREE.Group();
    const seg = (rTip, rButt, z0, z1, mat) => {
      const g = new THREE.CylinderGeometry(rButt, rTip, z1 - z0, 16);
      g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; this.group.add(m);
    };
    const ash = new THREE.MeshStandardMaterial({ map: woodTexture('#d9b77c', '#8a6a3a', 8, { w: 256, h: 256 }), roughness: 0.35, color: tint });
    const ebony = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x120c0a).multiply(new THREE.Color(tint)), roughness: 0.25 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 1 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.9 });
    seg(0.0046, 0.0048, 0, 0.006, leather);
    seg(0.0049, 0.0051, 0.006, 0.02, brass);
    seg(0.0051, 0.0112, 0.02, 1.02, ash);
    seg(0.0113, 0.0115, 1.02, 1.035, brass);
    seg(0.0115, 0.0146, 1.035, CUE_LENGTH - 0.012, ebony);
    seg(0.0147, 0.0147, CUE_LENGTH - 0.012, CUE_LENGTH, brass);
    this._q = new THREE.Quaternion();
    parent.add(this.group);
  }
  setPose(tip, dir) {
    this.group.position.copy(tip);
    this.group.quaternion.copy(this._q.setFromUnitVectors(FWD, dir));
  }
}

function distToSegment(p, a, b) {
  const ab = new V3().subVectors(b, a);
  const t = clamp(new V3().subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return ab.multiplyScalar(t).add(a).distanceTo(p);
}

// Turns tracked hand movement into a snooker stroke.
//  - One hand: the cue runs from your grip hand to the cue ball, like pointing a stick.
//  - Two hands: the cue runs from your grip hand over your bridge hand, and how far
//    off-centre that line sits picks top, back or side spin.
//  - When your hand rests, the tip settles a few centimetres behind the ball. Pull
//    back, push through, and the speed of your hand at contact is the power.
export class CueController {
  constructor(visual) {
    this.v = visual;
    this.holder = null;
    this.tip = new V3(0.4, 1, -0.4);
    this.dir = new V3(0, 0, -1);
    this.butt = new V3();
    this.axis = new V3(0, 0, -1);
    this.target = new V3();
    this.gripDist = 0.5;
    this.locked = false; this.lockO = new V3();
    this.hist = [];
    this.vBuf = [];
    this.sPrev = null;
    this.settleT = 0; this.slowT = 0; this.openT = 0; this.lostT = 0; this.coolT = 0;
    this.armed = false; this.struck = false; this.needInit = true; this.wasCanShoot = false;
    this.lastBridge = new V3(); this.bridgeAge = 99;
    this.aim = { valid: false, hx: 1, hz: 0, a: 0, b: 0, twoHand: false, held: false };
    this._o = new V3(); this._oe = new V3(); this._t = new V3(); this._raw = new V3();
  }

  release() { this.holder = null; this.locked = false; this.sPrev = null; this.vBuf.length = 0; }

  // Call whenever the player's viewpoint jumps (new stance, replay, recentre).
  // The hand's world position jumps with it, which must not read as a stroke.
  resetStroke() {
    this.needInit = true; this.armed = false; this.locked = false;
    this.sPrev = null; this.vBuf.length = 0; this.hist.length = 0; this.settleT = 0;
    this.coolT = 0.4;
  }

  update(dt, inputs, ctx) {
    const aim = this.aim;
    if (this.coolT > 0) this.coolT -= dt;
    aim.valid = false; aim.held = false;
    let h = this.holder !== null ? inputs[this.holder] : null;
    if (h) {
      if (!h.tracked) { this.lostT += dt; if (this.lostT > 2.5) { this.release(); h = null; } }
      else {
        this.lostT = 0;
        if (!h.grab && !h.autoGrab) { this.openT += dt; if (this.openT > 0.45) { this.release(); h = null; } }
        else this.openT = 0;
      }
    }
    if (!h) {
      this.butt.copy(this.tip).addScaledVector(this.dir, -CUE_LENGTH);
      for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i];
        if (!inp.tracked || inp.busy) continue;
        if (inp.autoGrab || (inp.grab && distToSegment(inp.gripRaw, this.tip, this.butt) < 0.16)) {
          this.holder = i; h = inp; this.needInit = true; this.armed = false; this.openT = 0; this.lostT = 0; this.sPrev = null; this.vBuf.length = 0;
          if (ctx.onGrab) ctx.onGrab();
          break;
        }
      }
    }
    if (!h) {
      const k = 1 - Math.exp(-dt * 6);
      this.tip.lerp(ctx.restTip, k);
      this.dir.lerp(ctx.restDir, k).normalize();
      this.v.setPose(this.tip, this.dir);
      return;
    }
    aim.held = true;
    if (!h.tracked) return;               // hand briefly out of view: leave the cue where it was

    if (ctx.canShoot && ctx.ball) this.target.copy(ctx.ball);
    if (ctx.canShoot && !this.wasCanShoot) { this.struck = false; this.armed = false; this.needInit = true; this.locked = false; }
    this.wasCanShoot = ctx.canShoot;
    const C = this.target, G = h.grip;

    // is the other hand making a bridge?
    let B = null;
    const off = inputs.find((o) => o !== h);
    if (off && off.tracked && !off.busy) {
      const d = off.bridge.distanceTo(G);
      const fwd = this._t.subVectors(off.bridge, G).dot(this._raw.subVectors(C, G));
      if (d > 0.14 && d < 0.8 && fwd > 0 && off.bridge.y < BED_Y + 0.3 && off.bridge.distanceTo(C) < 0.8) B = off.bridge;
    }
    if (B) { this.lastBridge.copy(B); this.bridgeAge = 0; }
    else { this.bridgeAge += dt; if (off && !off.tracked && this.bridgeAge < 1.5) B = this.lastBridge; }
    aim.twoHand = !!B;

    this._raw.subVectors(B || C, G);
    if (this._raw.lengthSq() < 1e-6) this._raw.copy(this.axis);
    this._raw.normalize();
    if (this._raw.y > 0.2) { this._raw.y = 0.2; this._raw.normalize(); }
    if (!this.locked) this.axis.lerp(this._raw, 1 - Math.exp(-dt / 0.05)).normalize();
    const axis = this.axis;

    // how far the cue line passes from the centre of the ball
    const toG = this._t.subVectors(G, C);
    const o = this._o.copy(toG).addScaledVector(axis, -toG.dot(axis));
    if (this.locked) o.copy(this.lockO);
    else {
      const om = o.length();
      const w = B ? 1 - THREE.MathUtils.smoothstep(om, 0.09, 0.13) : 1;
      const eff = om < 0.008 ? 0 : Math.min(0.55 * R, ((om - 0.008) / 0.052) * 0.55 * R);
      this._oe.copy(o).multiplyScalar(om > 1e-6 ? eff / om : 0);
      o.lerp(this._oe, w);
      this.hist.push({ axis: axis.clone(), o: o.clone() });
      if (this.hist.length > 8) this.hist.shift();
    }
    const om = o.length();
    const hittable = om < R * 0.9;
    const cd = Math.sqrt(Math.max(1e-8, R * R - Math.min(om, R * 0.9) ** 2));

    // stroke speed along the cue
    const s = this._t.subVectors(h.gripRaw, C).dot(axis);
    if (this.sPrev !== null && dt > 0) {
      const v = (s - this.sPrev) / dt;
      if (Math.abs(v) > 8) { this.resetStroke(); }               // no hand moves that fast: the view jumped
      else { this.vBuf.push(v); if (this.vBuf.length > 4) this.vBuf.shift(); }
    }
    this.sPrev = s;
    const n = Math.min(3, this.vBuf.length);
    let vAvg = 0, vPeak = 0;
    for (let i = this.vBuf.length - n; i < this.vBuf.length; i++) vAvg += this.vBuf[i] / n;
    for (const v of this.vBuf) vPeak = Math.max(vPeak, v);

    if (ctx.canShoot && !this.struck) {
      this.settleT = Math.abs(vAvg) < 0.1 ? this.settleT + dt : 0;
      const want = clamp(-cd - 0.09 - s, 0.18, 1.3);
      if (this.needInit) { this.gripDist = want; this.needInit = false; }
      else if (!this.locked && this.settleT > 0.3) this.gripDist += clamp(want - this.gripDist, -0.8 * dt, 0.8 * dt);
      let gap = -cd - (s + this.gripDist);
      if (gap >= 0.03) this.armed = true;
      if (gap <= 0 && hittable) {
        if (this.armed && this.coolT <= 0 && vPeak > 0.12 && vAvg > 0.03) {
          const hl = Math.hypot(axis.x, axis.z) || 1e-6;
          const rx = -axis.z / hl, rz = axis.x / hl;
          const ux = -rz * axis.y, uy = rz * axis.x - rx * axis.z, uz = rx * axis.y;
          const a = (o.x * rx + o.z * rz) / R, b = (o.x * ux + o.y * uy + o.z * uz) / R;
          const V = clamp(2.2 * vPeak * (ctx.power || 1), 0.2, 7.5);
          this.struck = true; this.locked = false;
          ctx.onStrike({ x: axis.x, y: axis.y, z: axis.z }, V, a, b);
        } else { this.gripDist += gap; gap = 0; }      // resting the tip against the ball
      }
      if (!this.struck) {
        if (!this.locked && vAvg > 0.3 && this.hist.length) {
          // forward stroke begun: hold the line you had a moment ago, like a planted bridge
          const past = this.hist[Math.max(0, this.hist.length - 4)];
          this.axis.copy(past.axis); this.lockO.copy(past.o); o.copy(past.o);
          this.locked = true; this.slowT = 0;
          this.sPrev = this._t.subVectors(h.gripRaw, C).dot(this.axis);
        } else if (this.locked) {
          this.slowT = vAvg < 0.08 ? this.slowT + dt : 0;
          if (this.slowT > 0.25) this.locked = false;
        }
        const hl = Math.hypot(axis.x, axis.z) || 1e-6;
        const rx = -axis.z / hl, rz = axis.x / hl;
        const ux = -rz * axis.y, uy = rz * axis.x - rx * axis.z, uz = rx * axis.y;
        aim.valid = hittable;
        aim.hx = axis.x / hl; aim.hz = axis.z / hl;
        aim.a = (o.x * rx + o.z * rz) / R; aim.b = (o.x * ux + o.y * uy + o.z * uz) / R;
      }
    } else this.locked = false;

    this.tip.copy(C).add(o).addScaledVector(axis, this._t.subVectors(h.gripRaw, C).dot(axis) + this.gripDist);
    this.dir.copy(axis);
    this.v.setPose(this.tip, this.dir);
  }
}

// Optional aiming help drawn flat on the cloth: the cue ball's line, the ghost
// ball at contact and (beginner mode) where the object ball will head.
export class AimGuide {
  constructor(parent) {
    this.group = new THREE.Group();
    const mat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    const strip = () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat()); m.renderOrder = 2; this.group.add(m); return m; };
    this.line = strip(); this.obj = strip(); this.tan = strip();
    const rg = new THREE.RingGeometry(R * 0.86, R, 32); rg.rotateX(-Math.PI / 2);
    this.ghost = new THREE.Mesh(rg, mat()); this.ghost.renderOrder = 2; this.group.add(this.ghost);
    this.obj.material.color.set(0xffd27a);
    this.group.visible = false;
    parent.add(this.group);
  }
  place(m, x1, z1, x2, z2, w, op) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
    m.visible = len > 0.005;
    m.position.set((x1 + x2) / 2, BED_Y + 0.0025, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(-dz, dx);
    m.scale.set(len, 1, w);
    m.material.opacity = op;
  }
  update(aim, physics, mode) {
    const cb = physics.cue;
    if (!aim || !aim.valid || mode === 'off' || !cb || cb.potted) { this.group.visible = false; return; }
    this.group.visible = true;
    const beginner = mode === 'beginner';
    const hit = castCueBall(physics.balls, cb.x, cb.z, aim.hx, aim.hz);
    const t = beginner ? hit.t : Math.min(hit.t, 0.4);
    const ex = cb.x + aim.hx * t, ez = cb.z + aim.hz * t;
    this.place(this.line, cb.x + aim.hx * R, cb.z + aim.hz * R, ex, ez, 0.004, beginner ? 0.5 : 0.3);
    const gx = cb.x + aim.hx * hit.t, gz = cb.z + aim.hz * hit.t;
    this.ghost.visible = !!hit.ball && (beginner || hit.t < 0.6);
    this.ghost.position.set(gx, BED_Y + 0.0025, gz);
    this.obj.visible = this.tan.visible = false;
    if (hit.ball && beginner) {
      const nx = (hit.ball.x - gx) / (2 * R), nz = (hit.ball.z - gz) / (2 * R);
      this.place(this.obj, hit.ball.x, hit.ball.z, hit.ball.x + nx * 0.4, hit.ball.z + nz * 0.4, 0.004, 0.55);
      const dot = aim.hx * nx + aim.hz * nz;
      let tx = aim.hx - nx * dot, tz = aim.hz - nz * dot;
      const tl = Math.hypot(tx, tz);
      if (tl > 0.05) { tx /= tl; tz /= tl; this.place(this.tan, gx, gz, gx + tx * 0.22 * tl, gz + tz * 0.22 * tl, 0.003, 0.3); }
    }
  }
}
