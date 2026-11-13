import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BED_Y } from './config.js';
import * as T from './textures.js';

export const CLUBS = [
  { id: 'luxury', name: 'Private Luxury Club', tag: 'Walnut, brass and a log fire', colors: ['#3a1d0e', '#c9a24a'] },
  { id: 'underground', name: 'Underground Snooker Lounge', tag: 'Brick, neon and late nights', colors: ['#1a0a1e', '#ff2bd6'] },
  { id: 'hall', name: 'Professional Tournament Hall', tag: 'Lights, cameras, a full house', colors: ['#0a1230', '#e8e8ff'] },
  { id: 'cyber', name: 'Futuristic Cyber Arena', tag: 'A floating table above the city', colors: ['#04121e', '#19e6ff'] },
];

const _m = new THREE.Matrix4(), _e = new THREE.Euler();

function worldUV(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
    else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  }
}

// Collects static geometry per material and merges it, so a whole club costs a
// handful of draw calls on the headset.
class Builder {
  constructor(group) { this.group = group; this.bins = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) geo.applyMatrix4(_m.makeRotationFromEuler(_e.set(rx, ry, rz)));
    geo.translate(x, y, z);
    if (mat.userData.tile) worldUV(geo, mat.userData.tile);
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(geo);
    return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry, 0); }
  cyl(mat, rt, rb, h, x, y, z, seg = 14, rx = 0, rz = 0, open = false) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), x, y, z, rx, 0, rz); }
  plane(mat, w, h, x, y, z, rx = 0, ry = 0) { return this.add(mat, new THREE.PlaneGeometry(w, h), x, y, z, rx, ry, 0); }
  sphere(mat, r, x, y, z) { return this.add(mat, new THREE.SphereGeometry(r, 12, 8), x, y, z); }
  torus(mat, r, tube, x, y, z, rx = Math.PI / 2) { return this.add(mat, new THREE.TorusGeometry(r, tube, 8, 40), x, y, z, rx, 0, 0); }
  finish() {
    for (const [mat, geos] of this.bins) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.receiveShadow = !!mat.userData.receive;
      this.group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.bins.clear();
  }
}

const lam = (o = {}, tile = 0) => { const m = new THREE.MeshLambertMaterial(o); m.userData.tile = tile; return m; };
const std = (o = {}, tile = 0) => { const m = new THREE.MeshStandardMaterial(o); m.userData.tile = tile; return m; };
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity });
const texMat = (map, o = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...o });
const addMat = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

function tableSpot(group, color, intensity, y = 2.6) {
  const s = new THREE.SpotLight(color, intensity, 9, 0.95, 0.55, 1.6);
  s.position.set(0, y, 0);
  s.target.position.set(0, BED_Y, 0);
  s.castShadow = true;
  s.shadow.mapSize.set(1024, 1024);
  s.shadow.camera.near = 0.6; s.shadow.camera.far = 4.5;
  s.shadow.bias = -0.0006; s.shadow.normalBias = 0.006; s.shadow.radius = 3;
  group.add(s, s.target);
  return s;
}

function framedPicture(group, tex, w, h, x, y, z, ry, frameMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.05), frameMat));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  pic.position.z = 0.027; g.add(pic);
  g.position.set(x, y, z); g.rotation.y = ry;
  group.add(g);
}

function trophy(mat) {
  const pts = [[0.07, 0], [0.075, 0.015], [0.02, 0.03], [0.015, 0.12], [0.03, 0.14], [0.075, 0.2], [0.095, 0.3], [0.1, 0.34]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat);
}

// ---------------------------------------------------------------- luxury
function buildLuxury(group, club) {
  const hx = 6.6, hz = 5, H = 3.5;
  const b = new Builder(group);
  const floor = std({ map: T.plankTexture('#5a3218', '#1a0b04', 3), roughness: 0.42, metalness: 0.0 }, 2.2);
  floor.userData.receive = true;
  const wall = lam({ map: T.panelWallTexture('#3b1e0f', '#120703', '#12261f', '#c9a24a') }, H);
  const ceil = lam({ color: 0x140c07 });
  const darkWood = lam({ map: T.woodTexture('#33190c', '#0d0502', 4) }, 1.4);
  const gold = std({ color: 0xd4af37, roughness: 0.25, metalness: 1 });
  const leather = lam({ map: T.leatherTexture('#4a1b12') }, 0.6);
  const marble = std({ map: T.marbleTexture(), roughness: 0.2, metalness: 0.1 }, 1.6);
  const velvet = lam({ color: 0x4a0d18 });
  const black = lam({ color: 0x0a0807 });

  b.box(floor, 2 * hx, 0.1, 2 * hz, 0, -0.05, 0);
  b.box(ceil, 2 * hx, 0.1, 2 * hz, 0, H + 0.05, 0);
  b.box(wall, 0.1, H, 2 * hz, hx + 0.05, H / 2, 0).box(wall, 0.1, H, 2 * hz, -hx - 0.05, H / 2, 0);
  b.box(wall, 2 * hx, H, 0.1, 0, H / 2, hz + 0.05).box(wall, 2 * hx, H, 0.1, 0, H / 2, -hz - 0.05);
  // coffered ceiling, crown and skirting
  for (let x = -hx + 1.1; x < hx; x += 2.2) b.box(darkWood, 0.22, 0.2, 2 * hz, x, H - 0.1, 0);
  for (let z = -hz + 1.25; z < hz; z += 2.5) b.box(darkWood, 2 * hx, 0.2, 0.22, 0, H - 0.1, z);
  for (const s of [-1, 1]) {
    b.box(gold, 2 * hx, 0.05, 0.05, 0, H - 0.24, s * (hz - 0.025)).box(gold, 0.05, 0.05, 2 * hz, s * (hx - 0.025), H - 0.24, 0);
    b.box(darkWood, 2 * hx, 0.16, 0.04, 0, 0.08, s * (hz - 0.02)).box(darkWood, 0.04, 0.16, 2 * hz, s * (hx - 0.02), 0.08, 0);
  }
  const cove = glowMat(0xffc884);
  for (const s of [-1, 1]) b.box(cove, 2 * hx - 0.4, 0.02, 0.06, 0, H - 0.3, s * (hz - 0.09)).box(cove, 0.06, 0.02, 2 * hz - 0.4, s * (hx - 0.09), H - 0.3, 0);

  // rug under the table
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 4.4), new THREE.MeshLambertMaterial({ map: T.rugTexture() }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.006; rug.receiveShadow = true; group.add(rug);

  // brass three-shade table light
  const shade = std({ color: 0x0d4a2a, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide });
  b.box(gold, 2.9, 0.035, 0.035, 0, 2.12, 0);
  for (const x of [-1.15, 0, 1.15]) {
    b.cyl(shade, 0.09, 0.36, 0.24, x, 1.9, 0, 28, 0, 0, true);
    b.cyl(gold, 0.012, 0.012, 0.2, x, 2.03, 0, 8);
    b.add(glowMat(0xfff0cc), new THREE.CircleGeometry(0.3, 24), x, 1.83, 0, Math.PI / 2);
    b.sphere(glowMat(0xfff6dd), 0.05, x, 1.88, 0);
  }
  for (const x of [-1.2, 1.2]) b.cyl(gold, 0.01, 0.01, H - 2.12, x, (H + 2.12) / 2, 0, 8);

  // fireplace wall (+x): the view from the baulk end
  const fx = hx - 0.28;
  b.box(marble, 0.5, 1.5, 2.6, fx, 0.75, 0).box(marble, 0.62, 0.1, 2.9, fx - 0.04, 1.55, 0);
  b.box(black, 0.2, 0.9, 1.3, fx - 0.22, 0.45, 0);
  b.box(darkWood, 0.4, 2.7, 1.9, hx - 0.2, 1.35, 3.3).box(darkWood, 0.4, 2.7, 1.9, hx - 0.2, 1.35, -3.3);
  const books = texMat(T.bookshelfTexture(), { toneMapped: true });
  for (const z of [3.3, -3.3]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.5), new THREE.MeshLambertMaterial({ map: books.map }));
    p.position.set(hx - 0.41, 1.36, z); p.rotation.y = -Math.PI / 2; group.add(p);
  }
  framedPicture(group, T.artTexture(1), 1.5, 1.1, hx - 0.03, 2.45, 0, -Math.PI / 2, gold);
  const fireTex = T.canvasTex(128, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h, 4, w / 2, h * 0.7, h * 0.75);
    gr.addColorStop(0, '#fff3c0'); gr.addColorStop(0.3, '#ff9a2a'); gr.addColorStop(0.7, 'rgba(200,40,10,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), addMat(fireTex, 0xffffff, 0.9));
    f.position.set(fx - 0.34, 0.33, -0.42 + i * 0.28); f.rotation.y = -Math.PI / 2 + (i % 2 ? 0.4 : -0.4);
    group.add(f); flames.push(f);
  }
  const fire = new THREE.PointLight(0xff7a2a, 9, 9, 1.8);
  fire.position.set(fx - 0.7, 0.55, 0); group.add(fire);

  // lounge by the fire
  const sofa = (x, z, ry) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let p = at(0, 0); b.box(leather, 2.1, 0.42, 0.9, p[0], 0.31, p[1], ry);
    p = at(0, -0.36); b.box(leather, 2.1, 0.55, 0.2, p[0], 0.74, p[1], ry);
    for (const sx of [-1, 1]) { p = at(sx * 1.0, 0); b.box(leather, 0.2, 0.62, 0.9, p[0], 0.45, p[1], ry); }
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.38, 0.38]) { p = at(sx, sz); b.cyl(gold, 0.025, 0.02, 0.1, p[0], 0.05, p[1], 8); }
  };
  sofa(4.6, 2.5, Math.PI); sofa(4.6, -2.5, 0);
  b.box(darkWood, 1.2, 0.06, 0.7, 4.6, 0.42, 0).box(gold, 1.1, 0.36, 0.04, 4.6, 0.2, 0.3).box(gold, 1.1, 0.36, 0.04, 4.6, 0.2, -0.3);
  const amber = std({ color: 0xb5651d, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
  b.cyl(amber, 0.05, 0.07, 0.2, 4.4, 0.55, 0.05, 12).cyl(gold, 0.02, 0.02, 0.06, 4.4, 0.68, 0.05, 8);
  b.cyl(amber, 0.035, 0.03, 0.08, 4.75, 0.49, -0.1, 10).cyl(amber, 0.035, 0.03, 0.08, 4.9, 0.49, 0.12, 10);

  // bar on the -x wall
  b.box(darkWood, 0.7, 1.08, 4.4, -hx + 1.5, 0.54, 0).box(marble, 0.86, 0.06, 4.6, -hx + 1.5, 1.11, 0).box(gold, 0.02, 0.05, 4.4, -hx + 1.86, 0.3, 0);
  const shelf = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.1), texMat(T.bottleShelfTexture()));
  shelf.position.set(-hx + 0.02, 1.9, 0); shelf.rotation.y = Math.PI / 2; group.add(shelf);
  for (const z of [-1.5, -0.5, 0.5, 1.5]) {
    b.cyl(leather, 0.2, 0.2, 0.08, -hx + 2.4, 0.78, z, 16).cyl(gold, 0.025, 0.025, 0.74, -hx + 2.4, 0.37, z, 8).cyl(gold, 0.19, 0.21, 0.02, -hx + 2.4, 0.01, z, 16);
  }

  // night skyline windows (+z) and curtains
  const sky = texMat(T.skylineTexture(41));
  for (const x of [-3.6, 0, 3.6]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.5), sky);
    w.position.set(x, 1.85, hz - 0.01); w.rotation.y = Math.PI; group.add(w);
    b.box(darkWood, 1.9, 0.1, 0.12, x, 3.13, hz - 0.05).box(darkWood, 1.9, 0.1, 0.16, x, 0.57, hz - 0.07);
    b.box(darkWood, 0.06, 2.5, 0.06, x, 1.85, hz - 0.04).box(darkWood, 1.7, 0.05, 0.06, x, 1.85, hz - 0.04);
    for (const s of [-1, 1]) b.box(velvet, 0.42, 2.9, 0.14, x + s * 1.12, 1.8, hz - 0.09);
    b.box(gold, 2.9, 0.04, 0.04, x, 3.28, hz - 0.12);
  }

  // gallery wall (-z): art, cue rack, owner's plaque, trophies
  framedPicture(group, T.artTexture(2), 1.1, 1.4, -3.9, 2.05, -hz + 0.03, 0, gold);
  framedPicture(group, T.artTexture(3), 1.1, 1.4, 3.9, 2.05, -hz + 0.03, 0, gold);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshStandardMaterial({ map: T.plaqueTexture(club.toUpperCase(), 'PRIVATE MEMBERS  ·  PROPRIETOR: YOU'), roughness: 0.3, metalness: 0.85 }));
  plaque.position.set(0, 2.45, -hz + 0.02); group.add(plaque);
  b.box(darkWood, 1.5, 1.5, 0.08, -1.9, 1.35, -hz + 0.04);
  const cueWood = lam({ color: 0xc9a66b });
  for (let i = 0; i < 6; i++) b.cyl(cueWood, 0.006, 0.014, 1.4, -2.5 + i * 0.24, 1.36, -hz + 0.11, 6).cyl(black, 0.0145, 0.015, 0.4, -2.5 + i * 0.24, 0.86, -hz + 0.11, 6);
  b.box(darkWood, 1.6, 0.9, 0.4, 1.9, 0.45, -hz + 0.22).box(marble, 1.7, 0.05, 0.46, 1.9, 0.92, -hz + 0.24);
  for (const [x, s] of [[1.45, 0.8], [1.9, 1.1], [2.35, 0.8]]) {
    const t = trophy(gold); t.scale.setScalar(s); t.position.set(x, 0.945, -hz + 0.24); group.add(t);
  }
  const picLight = new THREE.PointLight(0xffd9a0, 5, 7, 2);
  picLight.position.set(0, 2.9, -hz + 1.0); group.add(picLight);

  // chandeliers
  const bulbs = glowMat(0xffe7b8);
  for (const x of [-4.2, 4.2]) {
    b.cyl(gold, 0.012, 0.012, 0.5, x, H - 0.25, 0, 8).torus(gold, 0.42, 0.018, x, H - 0.55, 0).torus(gold, 0.26, 0.015, x, H - 0.75, 0);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.sphere(bulbs, 0.028, x + Math.cos(a) * 0.42, H - 0.5, Math.sin(a) * 0.42); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.sphere(bulbs, 0.024, x + Math.cos(a) * 0.26, H - 0.71, Math.sin(a) * 0.26); }
  }
  const ch = new THREE.PointLight(0xffd6a0, 45, 14, 1.6);
  ch.position.set(-4.2, H - 0.9, 0); group.add(ch);
  b.finish();

  tableSpot(group, 0xffe6c2, 24);
  group.add(new THREE.HemisphereLight(0xffe0b8, 0x3a2010, 1.3));
  const ch2 = new THREE.PointLight(0xffd6a0, 45, 14, 1.6);
  ch2.position.set(4.2, H - 0.9, 0); group.add(ch2);

  return {
    env: { base: 0x1a0e06, top: 0xfff0d0, a1: 0xff8a3a, a2: 0x5a7aa8, power: 7 }, envIntensity: 0.55, exposure: 1.05,
    fog: null, background: 0x050302, ambience: 'luxury', soundSpot: new THREE.Vector3(fx - 0.5, 0.5, 0),
    update(t) {
      const k = 0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 23);
      fire.intensity = 9 * k;
      flames.forEach((f, i) => { f.scale.y = 0.85 + 0.25 * Math.sin(t * (9 + i * 2.1) + i); f.material.opacity = 0.7 + 0.25 * Math.sin(t * (13 + i)); });
    },
  };
}

// ----------------------------------------------------------- underground
function distantTable(group, b, x, z, mats) {
  b.box(mats.wood, 3.9, 0.3, 2.1, x, 0.72, z);
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.8, 0.8]) b.cyl(mats.wood, 0.08, 0.06, 0.58, x + sx, 0.29, z + sz, 8);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), mats.cloth);
  cloth.rotation.x = -Math.PI / 2; cloth.position.set(x, 0.875, z); group.add(cloth);
  const cols = [0xa80c14, 0xa80c14, 0xa80c14, 0xf0c20c, 0x1240ad, 0xee86a6, 0x111111, 0xf3eedb];
  const r = T.rng(Math.floor(x * 7 + z * 13) + 99);
  cols.forEach((c) => b.sphere(mats.ball(c), 0.028, x + (r() - 0.5) * 3, 0.9, z + (r() - 0.5) * 1.4));
  b.cyl(mats.metal, 0.1, 0.38, 0.22, x, 2.0, z, 16, 0, 0, true).cyl(mats.metal, 0.006, 0.006, 0.9, x, 2.55, z, 6);
  b.add(mats.lampGlow, new THREE.CircleGeometry(0.3, 16), x, 1.93, z, Math.PI / 2);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.9, 1.1, 20, 1, true), mats.shaft);
  cone.position.set(x, 1.42, z); group.add(cone);
}

function buildUnderground(group, club) {
  const hx = 9.5, hz = 6.2, H = 3.1;
  const b = new Builder(group);
  const floor = std({ map: T.concreteTexture('#2c2d30'), roughness: 0.7 }, 3);
  floor.userData.receive = true;
  const brick = lam({ map: T.brickTexture() }, 2.2);
  const ceil = lam({ color: 0x0b0b0d });
  const steel = std({ color: 0x24262b, roughness: 0.45, metalness: 0.9 });
  const rust = lam({ color: 0x4a2a1a });
  const wood = lam({ map: T.woodTexture('#2b1a10', '#0d0704', 6) }, 1.5);
  const redLeather = lam({ map: T.leatherTexture('#5a0f14', 19) }, 0.6);
  const black = lam({ color: 0x08080a });

  b.box(floor, 2 * hx, 0.1, 2 * hz, 0, -0.05, 0).box(ceil, 2 * hx, 0.1, 2 * hz, 0, H + 0.05, 0);
  b.box(brick, 0.2, H, 2 * hz, hx + 0.1, H / 2, 0).box(brick, 0.2, H, 2 * hz, -hx - 0.1, H / 2, 0);
  b.box(brick, 2 * hx, H, 0.2, 0, H / 2, hz + 0.1).box(brick, 2 * hx, H, 0.2, 0, H / 2, -hz - 0.1);
  for (const x of [-6.2, -2.1, 2.1, 6.2]) b.box(steel, 0.2, 0.26, 2 * hz, x, H - 0.13, 0);          // beams
  for (const x of [-6.2, 6.2]) for (const z of [-2.6, 2.6]) b.box(brick, 0.5, H, 0.5, x, H / 2, z); // columns
  for (const [z, r, m] of [[-4.6, 0.09, rust], [-4.3, 0.05, steel], [3.9, 0.12, steel], [4.4, 0.05, rust], [0.9, 0.04, steel]]) b.cyl(m, r, r, 2 * hx, 0, H - 0.42, z, 10, 0, Math.PI / 2);
  b.box(steel, 2 * hx, 0.3, 0.5, 0, H - 0.5, -1.9);                                                // air duct

  // pendants over your table
  const dome = std({ color: 0x101113, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide });
  const lampGlow = glowMat(0xfff2d0);
  for (const x of [-1.15, 0, 1.15]) {
    b.cyl(dome, 0.07, 0.34, 0.22, x, 1.92, 0, 24, 0, 0, true).cyl(steel, 0.005, 0.005, H - 2.02, x, (H + 2.02) / 2, 0, 6);
    b.add(lampGlow, new THREE.CircleGeometry(0.28, 20), x, 1.85, 0, Math.PI / 2).sphere(lampGlow, 0.05, x, 1.9, 0);
  }

  // other tables out in the room
  const poolTex = T.canvasTex(256, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.6);
    gr.addColorStop(0, '#1f9a57'); gr.addColorStop(1, '#042012');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const ballMats = new Map();
  const mats = {
    wood, metal: dome, lampGlow, cloth: texMat(poolTex),
    shaft: new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    ball: (c) => { if (!ballMats.has(c)) ballMats.set(c, glowMat(new THREE.Color(c).multiplyScalar(0.8))); return ballMats.get(c); },
  };
  distantTable(group, b, -5.2, -3.7, mats); distantTable(group, b, 0, -4.1, mats); distantTable(group, b, 5.2, -3.7, mats); distantTable(group, b, 5.6, 3.8, mats);

  // neon
  const neon = (text, color, w, h, x, y, z, ry, opts) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), addMat(T.neonTexture(text, color, opts)));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
  };
  const sign = neon(club, '#ff2bd6', 4.2, 1.05, hx - 0.03, 2.0, 0, -Math.PI / 2);
  neon('OPEN LATE', '#19e6ff', 2.4, 0.6, -2.5, 2.3, -hz + 0.03, 0, { font: '700 150px Arial, sans-serif', frame: true });
  neon('BREAKS · BOURBON · BLUES', '#ffb02e', 3.6, 0.5, 2.4, 2.35, hz - 0.03, Math.PI, { font: '700 130px Arial, sans-serif' });
  const flick = neon('147', '#ff3a3a', 1.2, 0.7, -hx + 0.03, 2.2, 3.4, Math.PI / 2, { w: 512, h: 256, font: '700 170px Arial, sans-serif', frame: true });

  // bar, booths, barrels, exit
  b.box(wood, 0.7, 1.08, 4.6, -hx + 1.6, 0.54, -0.6).box(steel, 0.84, 0.05, 4.8, -hx + 1.6, 1.1, -0.6);
  b.box(glowMat(0xff2bd6), 0.02, 0.03, 4.5, -hx + 1.97, 0.12, -0.6);
  const shelf = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.9), texMat(T.bottleShelfTexture(63, '#19e6ff')));
  shelf.position.set(-hx + 0.02, 1.85, -0.6); shelf.rotation.y = Math.PI / 2; group.add(shelf);
  for (const z of [-2.2, -1.1, 0, 1.0]) b.cyl(redLeather, 0.19, 0.19, 0.08, -hx + 2.5, 0.78, z, 14).cyl(steel, 0.025, 0.025, 0.74, -hx + 2.5, 0.37, z, 8);
  for (const x of [-4.4, -1.6, 1.2]) {
    b.box(redLeather, 2.2, 0.45, 0.6, x, 0.3, hz - 0.4).box(redLeather, 2.2, 0.75, 0.16, x, 0.85, hz - 0.1);
    b.cyl(wood, 0.4, 0.4, 0.04, x, 0.74, hz - 1.25, 16).cyl(steel, 0.04, 0.04, 0.72, x, 0.36, hz - 1.25, 8);
  }
  for (const [x, z] of [[hx - 0.7, -hz + 0.7], [hx - 1.5, -hz + 0.6], [hx - 0.8, -hz + 1.5]]) {
    b.cyl(wood, 0.3, 0.3, 0.85, x, 0.425, z, 14);
    for (const y of [0.15, 0.7]) b.cyl(steel, 0.305, 0.305, 0.04, x, y, z, 14);
  }
  b.box(steel, 1.0, 2.1, 0.08, 7.4, 1.05, hz - 0.05);
  neon('EXIT', '#35ff7a', 0.6, 0.24, 7.4, 2.38, hz - 0.03, Math.PI, { w: 512, h: 200, font: '700 140px Arial, sans-serif' });
  // jukebox
  b.box(black, 0.8, 1.3, 0.5, 3.4, 0.65, hz - 0.3).box(glowMat(0xffb02e), 0.6, 0.5, 0.02, 3.4, 1.0, hz - 0.56).box(glowMat(0x19e6ff), 0.7, 0.04, 0.02, 3.4, 0.5, hz - 0.56).box(glowMat(0xff2bd6), 0.7, 0.04, 0.02, 3.4, 0.4, hz - 0.56);
  b.finish();

  tableSpot(group, 0xfff0d6, 25);
  const p1 = new THREE.PointLight(0xff2bd6, 40, 14, 1.6); p1.position.set(hx - 1.2, 2.0, 0); group.add(p1);
  const p2 = new THREE.PointLight(0x19e6ff, 30, 13, 1.6); p2.position.set(-hx + 2.4, 1.9, -0.6); group.add(p2);
  group.add(new THREE.HemisphereLight(0xa89fd0, 0x1a1010, 0.9));

  return {
    env: { base: 0x0b0810, top: 0xfff0d6, a1: 0xff2bd6, a2: 0x19e6ff, power: 7 }, envIntensity: 0.5, exposure: 1.05,
    fog: new THREE.FogExp2(0x08060c, 0.035), background: 0x040305, ambience: 'underground', soundSpot: new THREE.Vector3(0, 0.9, -4.1),
    update(t) {
      const on = Math.sin(t * 31) > -0.92 || Math.sin(t * 1.7) > 0;
      flick.material.opacity = on ? 1 : 0.15;
      sign.material.opacity = 0.9 + 0.1 * Math.sin(t * 2.3);
      p1.intensity = 40 * (0.9 + 0.1 * Math.sin(t * 2.3));
    },
  };
}

// ------------------------------------------------------------------ hall
function buildHall(group, club) {
  const hx = 14, hz = 11, H = 8.5;
  const b = new Builder(group);
  const carpet = lam({ map: T.carpetTexture('#0e1738', '#c9a24a') }, 1.6);
  carpet.userData.receive = true;
  const arena = lam({ map: T.carpetTexture('#3a0c14', '#e0c060', 12) }, 1.6);
  arena.userData.receive = true;
  const dark = lam({ color: 0x06070c });
  const tier = lam({ color: 0x0c0e16 });
  const steel = std({ color: 0x2a2c33, roughness: 0.4, metalness: 0.9 });
  const black = lam({ color: 0x050506 });
  const leather = lam({ map: T.leatherTexture('#14161c', 23) }, 0.6);
  const white = glowMat(0xffffff);

  b.box(carpet, 2 * hx, 0.1, 2 * hz, 0, -0.06, 0).box(arena, 9.6, 0.1, 6.6, 0, -0.045, 0);
  b.box(dark, 2 * hx, 0.1, 2 * hz, 0, H, 0);
  b.box(dark, 0.2, H, 2 * hz, hx, H / 2, 0).box(dark, 0.2, H, 2 * hz, -hx, H / 2, 0).box(dark, 2 * hx, H, 0.2, 0, H / 2, hz).box(dark, 2 * hx, H, 0.2, 0, H / 2, -hz);

  // LED perimeter boards
  const ledTex = T.canvasTex(2048, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#0b1a5a'); gr.addColorStop(0.5, '#1a36a8'); gr.addColorStop(1, '#0b1a5a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = '700 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const s = `${club.toUpperCase()}  ★  MASTERS`;
    for (let i = 0; i < 3; i++) g.fillText(s, w * (i + 0.5) / 3, h / 2, w / 3 - 40);
  }, { repeat: true });
  const led = texMat(ledTex);
  for (const s of [-1, 1]) {
    const m1 = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.6), led); m1.position.set(0, 0.3, s * 3.3); m1.rotation.y = s > 0 ? Math.PI : 0; group.add(m1);
    b.box(black, 9.6, 0.6, 0.08, 0, 0.3, s * 3.35);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.6), led); m2.position.set(s * 4.8, 0.3, 0); m2.rotation.y = -s * Math.PI / 2; group.add(m2);
    b.box(black, 0.08, 0.6, 6.6, s * 4.85, 0.3, 0);
  }

  // seating tiers with a full house
  const crowdTex = T.crowdTexture();
  const crowd = new THREE.MeshBasicMaterial({ map: crowdTex, color: 0x8a8a96 });
  crowd.userData.tile = 0;
  const crowdGeos = [];
  const row = (w, x, y, z, ry) => {
    const g = new THREE.PlaneGeometry(w, 0.9);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4.5), uv.getY(i) * 0.26 + Math.floor(Math.random() * 3) * 0.24);
    g.applyMatrix4(_m.makeRotationY(ry)); g.translate(x, y, z); crowdGeos.push(g);
  };
  for (let k = 0; k < 7; k++) {
    const d = 5.0 + k * 0.85, y = 0.45 + k * 0.5;
    for (const s of [-1, 1]) {
      b.box(tier, 20, y, 0.85, 0, y / 2, s * d);
      row(20, 0, y + 0.42, s * (d - 0.2), s > 0 ? Math.PI : 0);
    }
    const dx = 6.6 + k * 0.85;
    b.box(tier, 0.85, y, 9.2, -dx, y / 2, 0);
    row(9.2, -dx + 0.2, y + 0.42, 0, Math.PI / 2);
  }
  group.add(new THREE.Mesh(mergeGeometries(crowdGeos), crowd));

  // lighting rig
  b.box(steel, 3.7, 0.16, 1.9, 0, 3.05, 0);
  b.add(white, new THREE.PlaneGeometry(3.5, 1.7), 0, 2.965, 0, Math.PI / 2);
  for (const [x, z] of [[-1.7, -0.85], [1.7, -0.85], [-1.7, 0.85], [1.7, 0.85]]) b.cyl(steel, 0.008, 0.008, H - 3.1, x, (H + 3.1) / 2, z, 6);
  for (const s of [-1, 1]) b.box(steel, 11, 0.14, 0.14, 0, 6, s * 4).box(steel, 0.14, 0.14, 8, s * 5.5, 6, 0);
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.014, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (let i = 0; i < 10; i++) {
    const s = i < 5 ? -1 : 1, x = -4.4 + (i % 5) * 2.2;
    b.cyl(black, 0.13, 0.16, 0.3, x, 5.8, s * 4, 10).sphere(white, 0.1, x, 5.66, s * 4);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1.5, 5.6, 14, 1, true), shaftMat);
    cone.position.set(x * 0.6, 2.95, s * 2.2); cone.rotation.x = s * 0.33; cone.rotation.z = x * 0.07; group.add(cone);
  }

  // big screen (far end), banners
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024; screenCanvas.height = 512;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), texMat(screenTex));
  screen.position.set(hx - 0.3, 5.2, 0); screen.rotation.y = -Math.PI / 2; group.add(screen);
  b.box(black, 0.2, 3.5, 6.7, hx - 0.2, 5.2, 0);
  const banner = T.canvasTex(256, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0b1a5a'); gr.addColorStop(1, '#050a24');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0c060'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#e0c060'; g.font = '700 110px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(club.toUpperCase(), 0, 0, h - 80); g.restore();
  });
  for (const z of [-6, 6]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5), texMat(banner, { color: 0xbbbbbb }));
    m.position.set(hx - 0.25, 4.6, z); m.rotation.y = -Math.PI / 2; group.add(m);
  }

  // players' chairs, referee's table, TV cameras
  for (const x of [-1.4, 1.4]) {
    b.box(leather, 0.6, 0.12, 0.6, x, 0.46, -2.6).box(leather, 0.6, 0.7, 0.1, x, 0.8, -2.86).box(black, 0.5, 0.4, 0.5, x, 0.2, -2.6);
    b.cyl(black, 0.22, 0.22, 0.03, x + 0.6, 0.6, -2.6, 14).cyl(steel, 0.02, 0.02, 0.6, x + 0.6, 0.3, -2.6, 6).cyl(glowMat(0x9fd8ff, 0.7), 0.03, 0.03, 0.2, x + 0.6, 0.72, -2.6, 8);
  }
  for (const [x, z, ry] of [[3.9, 2.6, -2.2], [-3.9, -2.6, 0.9]]) {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; b.cyl(steel, 0.012, 0.012, 1.5, x + Math.cos(a) * 0.22, 0.72, z + Math.sin(a) * 0.22, 6, Math.sin(a) * 0.3, -Math.cos(a) * 0.3); }
    b.box(black, 0.5, 0.3, 0.26, x, 1.56, z, ry).cyl(steel, 0.07, 0.09, 0.3, x + Math.sin(ry) * 0.36, 1.56, z + Math.cos(ry) * 0.36, 12, Math.PI / 2 * Math.cos(ry), -Math.PI / 2 * Math.sin(ry));
    b.sphere(glowMat(0xff2020), 0.012, x, 1.74, z);
  }
  b.finish();

  tableSpot(group, 0xffffff, 34, 3.0);
  const f1 = new THREE.PointLight(0x5a78ff, 120, 26, 1.5); f1.position.set(-5, 5.5, 4); group.add(f1);
  const f2 = new THREE.PointLight(0x5a78ff, 120, 26, 1.5); f2.position.set(5, 5.5, -4); group.add(f2);
  group.add(new THREE.HemisphereLight(0x9fb0ff, 0x14141e, 1.0));

  return {
    env: { base: 0x070912, top: 0xffffff, a1: 0x4060ff, a2: 0x4060ff, power: 9 }, envIntensity: 0.6, exposure: 1.0,
    fog: new THREE.Fog(0x04050a, 14, 40), background: 0x020308, ambience: 'hall', soundSpot: new THREE.Vector3(0, 2, 6),
    screen: { canvas: screenCanvas, texture: screenTex },
    update() {},
  };
}

// ----------------------------------------------------------------- cyber
function buildCyber(group, club) {
  const b = new Builder(group);
  const C = 0x19e6ff, M = 0xff2bd6;
  const deck = std({ color: 0x0a0d16, roughness: 0.3, metalness: 0.85 });
  deck.userData.receive = true;
  const cyan = glowMat(C), mag = glowMat(M), white = glowMat(0xeafcff);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), new THREE.MeshBasicMaterial({ map: T.spaceTexture(), side: THREE.BackSide, toneMapped: false, fog: false }));
  group.add(sky);

  // floating platform
  b.cyl(deck, 5.4, 5.0, 0.4, 0, -0.2, 0, 6);
  b.torus(cyan, 5.38, 0.025, 0, 0.0, 0).torus(mag, 5.2, 0.012, 0, -0.38, 0);
  for (const r of [2.9, 4.3]) b.add(cyan, new THREE.RingGeometry(r, r + 0.02, 6), 0, 0.004, 0, -Math.PI / 2);
  const gridTop = new THREE.Mesh(new THREE.CircleGeometry(5.1, 6), new THREE.MeshBasicMaterial({ map: T.gridTexture('#19e6ff'), transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
  gridTop.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 14; });
  gridTop.rotation.x = -Math.PI / 2; gridTop.position.y = 0.003; group.add(gridTop);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 5.15, z = Math.sin(a) * 5.15;
    b.cyl(deck, 0.12, 0.16, 1.0, x, 0.5, z, 6).cyl(i % 2 ? mag : cyan, 0.02, 0.02, 60, x, 30, z, 6);
  }

  // city far below and around
  const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: T.gridTexture('#19e6ff', '#02040a'), toneMapped: false }));
  far.material.map.repeat.set(150, 150); far.rotation.x = -Math.PI / 2; far.position.y = -30; group.add(far);
  const towers = [0, 1, 2].map((i) => texMat(T.towerTexture(90 + i, i === 1 ? '#ff2bd6' : '#19e6ff', i === 2 ? '#ffd24a' : '#ff2bd6')));
  const r = T.rng(5);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = 20 + r() * 44, h = 16 + r() * 62, w = 3 + r() * 6;
    b.box(towers[i % 3], w, h, w, Math.cos(a) * d, -30 + h / 2, Math.sin(a) * d, r() * 3);
  }

  // halo light over the table
  for (const s of [-1, 1]) b.box(white, 3.3, 0.03, 0.05, 0, 2.0, s * 0.8).box(white, 0.05, 0.03, 1.65, s * 1.65, 2.0, 0);
  for (const s of [-1, 1]) b.box(cyan, 3.5, 0.012, 0.012, 0, 2.03, s * 0.9).box(cyan, 0.012, 0.012, 1.8, s * 1.75, 2.03, 0);
  b.finish();

  // holographic rings, drones, panels
  const rings = [];
  [[3.4, C], [4.0, M], [4.8, 0xffffff]].forEach(([rad, col], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 6, 120), glowMat(col, 0.85));
    m.position.y = 3.6 + i * 0.25; group.add(m); rings.push(m);
  });
  const panels = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), addMat(T.holoTexture(100 + i, i % 2 ? '#ff2bd6' : '#19e6ff'), 0xffffff, 0.8));
    m.position.set(Math.cos(a) * 4.6, 1.9, Math.sin(a) * 4.6); m.lookAt(0, 1.6, 0); m.userData.y = 1.9; m.userData.ph = i;
    group.add(m); panels.push(m);
  }
  const title = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), addMat(T.neonTexture(club.toUpperCase(), '#19e6ff', { font: '700 150px Arial, sans-serif' })));
  title.position.set(6.2, 4.3, 0); title.rotation.y = -Math.PI / 2; group.add(title);
  const drones = [];
  const glow = T.glowTexture('#9ff4ff');
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), std({ color: 0x1a2030, roughness: 0.3, metalness: 0.9 }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.5); d.add(s); group.add(d); drones.push(d);
  }

  tableSpot(group, 0xe6f8ff, 27, 2.7);
  const p1 = new THREE.PointLight(C, 50, 16, 1.6); p1.position.set(-3.5, 2.6, 3); group.add(p1);
  const p2 = new THREE.PointLight(M, 50, 16, 1.6); p2.position.set(3.5, 2.6, -3); group.add(p2);
  group.add(new THREE.HemisphereLight(0x6a8cff, 0x1a0828, 0.9));

  return {
    env: { base: 0x04060e, top: 0xe6f8ff, a1: C, a2: M, power: 7 }, envIntensity: 0.6, exposure: 1.05,
    fog: null, background: 0x010206, ambience: 'cyber', soundSpot: new THREE.Vector3(0, 3.5, 0),
    update(t) {
      rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.3) * 0.25, 0, t * 0.2);
      rings[1].rotation.set(Math.PI / 2 + Math.cos(t * 0.23) * 0.3, t * 0.1, -t * 0.15);
      rings[2].rotation.set(Math.PI / 2 + Math.sin(t * 0.17 + 1) * 0.2, 0, t * 0.08);
      panels.forEach((p) => { p.position.y = p.userData.y + Math.sin(t * 0.7 + p.userData.ph) * 0.08; p.material.opacity = 0.65 + 0.2 * Math.sin(t * 3 + p.userData.ph * 2); });
      drones.forEach((d, i) => {
        const a = t * (0.25 + i * 0.05) + i * 1.6, rad = 6.5 + i * 1.2;
        d.position.set(Math.cos(a) * rad, 3 + Math.sin(t * 0.6 + i) * 0.8 + i * 0.4, Math.sin(a) * rad);
        d.rotation.y = t * 2;
      });
      sky.rotation.y = t * 0.004;
    },
  };
}

const BUILDERS = { luxury: buildLuxury, underground: buildUnderground, hall: buildHall, cyber: buildCyber };

export function buildClub(id, clubName) {
  const group = new THREE.Group();
  const info = (BUILDERS[id] || buildLuxury)(group, clubName);
  info.group = group;
  info.id = id;
  return info;
}

// Small reflection probe so the balls, brass and polished wood pick up the lamps.
export function makeEnvMap(renderer, cfg) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12), new THREE.MeshBasicMaterial({ color: cfg.base, side: THREE.BackSide }));
  room.position.y = 1; s.add(room);
  const panel = (color, k, w, h, x, y, z, rx, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  for (const x of [-1.15, 0, 1.15]) panel(cfg.top, cfg.power, 0.7, 0.7, x, 2.2, 0, Math.PI / 2, 0);
  panel(cfg.a1, 1.6, 3, 2, 5.5, 1, 0, 0, -Math.PI / 2);
  panel(cfg.a2, 1.6, 3, 2, -5.5, 1, 0, 0, Math.PI / 2);
  panel(cfg.top, 0.5, 4, 1.5, 0, 1.2, 5.5, 0, Math.PI);
  panel(cfg.top, 0.5, 4, 1.5, 0, 1.2, -5.5, 0, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k]) m[k].dispose();
      m.dispose();
    }
  });
  group.removeFromParent();
}
