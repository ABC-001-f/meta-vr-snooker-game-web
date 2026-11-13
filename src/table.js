import * as THREE from 'three';
import { R, L, W, BED_Y, BALL_Y, CW, RAIL_TOP, RAIL_W, CORNER_CUT, MID_GAP, POCKETS, BALL_COLOR } from './config.js';
import { clothTexture, woodTexture, cueBallTexture, softDotTexture, plaqueTexture } from './textures.js';

// Outline of (rectangle + circles) or (rectangle - circles), sampled around the
// centre. Used to cut the pockets out of the cloth and out of the wooden rail.
function polarOutline(hl, hw, circles, mode) {
  let angs = [];
  for (let i = 0; i < 256; i++) angs.push((i / 256) * Math.PI * 2);
  for (const c of circles) {
    const d = Math.hypot(c.x, c.z), a0 = Math.atan2(c.z, c.x);
    const half = Math.asin(Math.min(1, c.r / d)) * 1.2;
    for (let i = 0; i <= 56; i++) angs.push(a0 - half + (i / 56) * 2 * half);
  }
  angs = angs.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  const pts = [];
  let prev = -1;
  for (const a of angs) {
    if (a - prev < 1e-5) continue;
    prev = a;
    const cs = Math.cos(a), sn = Math.sin(a);
    let t = Math.min(hl / Math.max(1e-9, Math.abs(cs)), hw / Math.max(1e-9, Math.abs(sn)));
    for (const c of circles) {
      const dc = cs * c.x + sn * c.z;
      const disc = dc * dc - (c.x * c.x + c.z * c.z - c.r * c.r);
      if (disc <= 0) continue;
      const sq = Math.sqrt(disc), te = dc - sq, tx = dc + sq;
      if (te < t && tx > 0) t = mode === 'union' ? Math.max(t, tx) : Math.min(t, te);
    }
    pts.push(new THREE.Vector2(cs * t, sn * t));
  }
  return pts;
}

function roundedRect(hl, hw, r) {
  const s = new THREE.Shape();
  s.moveTo(-hl + r, -hw);
  s.lineTo(hl - r, -hw); s.absarc(hl - r, -hw + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hl, hw - r); s.absarc(hl - r, hw - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hl + r, hw); s.absarc(-hl + r, hw - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hl, -hw + r); s.absarc(-hl + r, -hw + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// One rubber cushion. p1,p2: ends of the nose line. n: unit normal pointing
// into the table. a1,a2: how far the back edge runs on past each end (pocket jaw angle).
function cushionGeometry(p1, p2, n, a1, a2) {
  const t = new THREE.Vector2().subVectors(p2, p1).normalize();
  const prof = [[0.016, 0], [0, 0.026], [0, 0.036], [CW, RAIL_TOP - BED_Y - 0.001], [CW, 0]];  // [depth behind nose, height]
  const ring = (p, a, sign) => prof.map(([d, h]) => {
    const along = sign * a * (d / CW);
    return new THREE.Vector3(p.x + t.x * along - n.x * d, BED_Y + h, p.y + t.y * along - n.y * d);
  });
  const A = ring(p1, a1, -1), B = ring(p2, a2, 1);
  const pos = [];
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < prof.length - 1; i++) { tri(A[i], B[i], B[i + 1]); tri(A[i], B[i + 1], A[i + 1]); }
  for (const E of [A, B]) for (let i = 1; i < prof.length - 1; i++) tri(E[0], E[i], E[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export const TABLE_THEMES = {
  luxury: { cloth: '#083f22', cushion: 0x0b5a30, wood: ['#4a2412', '#1c0b04'], metal: 0xd4af37, pocket: 0x1a0d08, glow: null },
  underground: { cloth: '#094626', cushion: 0x0f6337, wood: ['#2b1a10', '#0d0704'], metal: 0xb08d57, pocket: 0x0c0c0c, glow: null },
  hall: { cloth: '#0a4d2a', cushion: 0x0d6c3b, wood: ['#141414', '#000000'], metal: 0xe0c060, pocket: 0x101010, glow: null },
  cyber: { cloth: '#0a3f5c', cushion: 0x0a4766, wood: ['#0a0c14', '#000000'], metal: 0x9fe9ff, pocket: 0x05070c, glow: 0x19e6ff },
};

export function buildTable(themeName, clubName = 'CUEVERSE') {
  const th = TABLE_THEMES[themeName] || TABLE_THEMES.luxury;
  const group = new THREE.Group();
  const Lb = L + CW, Wb = W + CW;

  // cloth bed with the pockets cut out
  const bedShape = new THREE.Shape(polarOutline(Lb, Wb, POCKETS, 'subtract'));
  const bedGeo = new THREE.ExtrudeGeometry(bedShape, { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  const bp = bedGeo.attributes.position, buv = bedGeo.attributes.uv;
  for (let i = 0; i < bp.count; i++) buv.setXY(i, (bp.getX(i) + Lb) / (2 * Lb), (bp.getY(i) + Wb) / (2 * Wb));
  bedGeo.rotateX(-Math.PI / 2);
  const clothMat = new THREE.MeshStandardMaterial({ map: clothTexture(th.cloth), roughness: 0.96, metalness: 0 });
  const slateMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 });
  const bed = new THREE.Mesh(bedGeo, [clothMat, slateMat]);
  bed.position.y = BED_Y - 0.05;
  bed.receiveShadow = true;
  bed.castShadow = true;
  group.add(bed);

  // cushions
  const cushMat = new THREE.MeshStandardMaterial({ color: th.cushion, roughness: 0.93, side: THREE.DoubleSide });
  const V = (x, z) => new THREE.Vector2(x, z);
  const cushions = [];
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    cushions.push(cushionGeometry(V(sx * MID_GAP, sz * W), V(sx * (L - CORNER_CUT), sz * W), V(0, -sz), 0.012, CW));
  }
  for (const sx of [-1, 1]) {
    cushions.push(cushionGeometry(V(sx * L, -(W - CORNER_CUT)), V(sx * L, W - CORNER_CUT), V(-sx, 0), CW, CW));
  }
  for (const g of cushions) {
    const m = new THREE.Mesh(g, cushMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // wooden rail and body: one thick frame with the pocket holes through it
  const Li = Lb, Wi = Wb, Lo = Li + RAIL_W, Wo = Wi + RAIL_W;
  const frameShape = roundedRect(Lo, Wo, 0.09);
  const holes = POCKETS.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.008 }));
  frameShape.holes.push(new THREE.Path(polarOutline(Li, Wi, holes, 'union')));
  const depth = 0.28, bev = 0.006;
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 10,
  });
  frameGeo.rotateX(-Math.PI / 2);
  const woodTex = woodTexture(th.wood[0], th.wood[1], 2);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.32, metalness: 0.05 });
  const woodSide = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.4, metalness: 0.05, color: 0xbbbbbb });
  const frame = new THREE.Mesh(frameGeo, [woodMat, woodSide]);
  frame.position.y = RAIL_TOP - depth - bev;
  frame.castShadow = true; frame.receiveShadow = true;
  group.add(frame);

  // pockets: dark drop, metal rim on the rail
  const metalMat = new THREE.MeshStandardMaterial({ color: th.metal, roughness: 0.22, metalness: 1 });
  const dropMat = new THREE.MeshBasicMaterial({ color: th.pocket });
  for (const p of POCKETS) {
    const drop = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.05, 20), dropMat);
    drop.rotation.x = -Math.PI / 2;
    drop.position.set(p.x, BED_Y - 0.13, p.z);
    group.add(drop);
    const ox = p.corner ? Math.sign(p.x) : 0, oz = Math.sign(p.z);
    const span = p.corner ? 4.3 : 3.14;
    const rim = new THREE.Mesh(new THREE.RingGeometry(p.r + 0.006, p.r + 0.03, 28, 1, Math.atan2(-oz, ox) - span / 2, span), metalMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(p.x, RAIL_TOP + 0.0012, p.z);
    group.add(rim);
  }

  // trim line round the body, legs, maker's plate
  const trimY = RAIL_TOP - 0.1;
  for (const [w, d, x, z] of [[2 * Lo - 0.16, 0.006, 0, Wo + 0.001], [2 * Lo - 0.16, 0.006, 0, -Wo - 0.001], [0.006, 2 * Wo - 0.16, Lo + 0.001, 0], [0.006, 2 * Wo - 0.16, -Lo - 0.001, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), metalMat);
    m.position.set(x, trimY, z); group.add(m);
  }
  const legH = RAIL_TOP - depth - bev;
  const prof = [[0.07, 0], [0.085, 0.02], [0.055, 0.07], [0.05, 0.16], [0.072, 0.3], [0.068, 0.4], [0.08, legH - 0.06], [0.1, legH]].map(([r, y]) => new THREE.Vector2(r, y));
  const legGeo = new THREE.LatheGeometry(prof, 20);
  const legMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.35, metalness: 0.05 });
  for (const x of [-(Lo - 0.24), -0.62, 0.62, Lo - 0.24]) for (const z of [-(Wo - 0.2), Wo - 0.2]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, 0, z); leg.castShadow = true; group.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.014, 20), metalMat);
    foot.position.set(x, 0.062, z); group.add(foot);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({ map: plaqueTexture(clubName.toUpperCase(), 'OWNER’S TABLE  ·  No. 1'), roughness: 0.3, metalness: 0.9 }));
  plate.position.set(-Lo - 0.002, RAIL_TOP - 0.17, 0);
  plate.rotation.y = -Math.PI / 2;
  group.add(plate);

  if (th.glow) {
    const glowMat = new THREE.MeshBasicMaterial({ color: th.glow, toneMapped: false });
    for (const [w, d, x, z] of [[2 * Lo - 0.2, 0.012, 0, Wo + 0.004], [2 * Lo - 0.2, 0.012, 0, -Wo - 0.004], [0.012, 2 * Wo - 0.2, Lo + 0.004, 0], [0.012, 2 * Wo - 0.2, -Lo - 0.004, 0]]) {
      for (const y of [RAIL_TOP - 0.03, RAIL_TOP - 0.25]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), glowMat);
        m.position.set(x, y, z); group.add(m);
      }
    }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(2 * Lo + 1.2, 2 * Wo + 1.2), new THREE.MeshBasicMaterial({ color: th.glow, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
    under.rotation.x = -Math.PI / 2; under.position.y = 0.012; group.add(under);
  }
  return group;
}

// The 22 balls, their rolling rotation and a soft contact shadow under each.
export class BallSet {
  constructor(physics, parent) {
    this.physics = physics;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.meshes = new Map();
    const geo = new THREE.SphereGeometry(R, 40, 28);
    const cueTex = cueBallTexture();
    for (const b of physics.balls) {
      const mat = new THREE.MeshStandardMaterial({
        color: b.type === 'cue' ? 0xffffff : BALL_COLOR[b.type],
        map: b.type === 'cue' ? cueTex : null,
        roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      this.group.add(m);
      this.meshes.set(b.id, m);
    }
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: softDotTexture(), transparent: true, depthWrite: false, opacity: 0.7 }), physics.balls.length);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.group.add(this.shadows);
    this._m = new THREE.Matrix4();
    this.sync(0);
  }

  sync(dt) {
    const balls = this.physics.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i], m = this.meshes.get(b.id);
      let y = BALL_Y, vis = true, x = b.x, z = b.z;
      if (b.potted) {
        b.potT += dt;
        const p = POCKETS[b.pocket] || POCKETS[0];
        const k = Math.min(1, b.potT / 0.12);
        x = b.x + (p.x - b.x) * k; z = b.z + (p.z - b.z) * k;
        y = BALL_Y - Math.min(0.16, b.potT * b.potT * 4.9 + b.potT * 0.3);
        vis = b.potT < 0.3;
      }
      m.visible = vis;
      m.position.set(x, y, z);
      m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      const s = b.potted ? 0 : R * 2.5;
      this._m.makeScale(s, 1, s).setPosition(x, BED_Y + 0.0012, z);
      this.shadows.setMatrixAt(i, this._m);
    }
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  // snapshot / restore for replays: x,y,z,qx,qy,qz,qw,visible per ball
  capture() {
    const balls = this.physics.balls, f = new Float32Array(balls.length * 8);
    balls.forEach((b, i) => {
      const m = this.meshes.get(b.id), o = i * 8;
      f[o] = m.position.x; f[o + 1] = m.position.y; f[o + 2] = m.position.z;
      f[o + 3] = m.quaternion.x; f[o + 4] = m.quaternion.y; f[o + 5] = m.quaternion.z; f[o + 6] = m.quaternion.w;
      f[o + 7] = m.visible ? 1 : 0;
    });
    return f;
  }

  show(f) {
    const balls = this.physics.balls;
    balls.forEach((b, i) => {
      const m = this.meshes.get(b.id), o = i * 8;
      m.position.set(f[o], f[o + 1], f[o + 2]);
      m.quaternion.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
      m.visible = f[o + 7] > 0.5;
      const s = m.visible && f[o + 1] > BALL_Y - 0.01 ? R * 2.5 : 0;
      this._m.makeScale(s, 1, s).setPosition(f[o], BED_Y + 0.0012, f[o + 2]);
      this.shadows.setMatrixAt(i, this._m);
    });
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
