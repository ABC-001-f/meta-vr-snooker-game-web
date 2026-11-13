import * as THREE from 'three';

// Floating menu panels painted on canvases. A painter draws the panel and
// registers its buttons each time it is redrawn; pointers are rays (pinch ray
// from a hand, a controller, or the mouse).
export const GOLD = '#d9b65a';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const SANS = '"Segoe UI", Roboto, Arial, sans-serif';

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class Panel {
  constructor(widthM, heightM, pxW, painter) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = Math.round((pxW * heightM) / widthM);
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthWrite: false, depthTest: false }));
    this.mesh.renderOrder = 10;
    this.mesh.userData.panel = this;
    this.painter = painter;
    this.buttons = [];
    this.hover = null;
    this.redraw();
  }
  get visible() { return this.mesh.visible; }
  set visible(v) { if (this.mesh.visible !== v) { this.mesh.visible = v; if (v) this.redraw(); else this.hover = null; } }

  redraw() {
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    this.buttons.length = 0;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    this.painter(g, W, H, this);
    this.texture.needsUpdate = true;
  }

  frame(g, W, H, r = 36) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(22,16,10,0.94)'); bg.addColorStop(1, 'rgba(6,5,4,0.96)');
    roundRect(g, 4, 4, W - 8, H - 8, r); g.fillStyle = bg; g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke();
    roundRect(g, 14, 14, W - 28, H - 28, r - 8); g.strokeStyle = 'rgba(217,182,90,0.25)'; g.lineWidth = 1.5; g.stroke();
  }

  button(id, x, y, w, h, label, { on = false, primary = false, font = 30, sub = null, onClick, disabled = false } = {}) {
    const g = this.g, hot = this.hover === id && !disabled;
    roundRect(g, x, y, w, h, Math.min(18, h / 3));
    if (primary) {
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, hot ? '#ffe9a6' : '#f0d27a'); gr.addColorStop(1, hot ? '#d9a93a' : '#b58a2a');
      g.fillStyle = gr;
    } else g.fillStyle = on ? 'rgba(217,182,90,0.9)' : hot ? 'rgba(217,182,90,0.28)' : 'rgba(255,255,255,0.06)';
    g.fill();
    g.lineWidth = hot || on ? 3 : 1.5;
    g.strokeStyle = hot || on || primary ? GOLD : 'rgba(217,182,90,0.4)';
    g.stroke();
    g.globalAlpha = disabled ? 0.35 : 1;
    g.fillStyle = primary || on ? '#1a1206' : '#f3ead6';
    g.font = `600 ${font}px ${SANS}`;
    g.fillText(label, x + w / 2, y + h / 2 - (sub ? font * 0.32 : 0), w - 16);
    if (sub) { g.font = `400 ${Math.round(font * 0.56)}px ${SANS}`; g.globalAlpha *= 0.75; g.fillText(sub, x + w / 2, y + h / 2 + font * 0.55, w - 16); }
    g.globalAlpha = 1;
    if (!disabled) this.buttons.push({ id, x, y, w, h, onClick });
  }

  hit(u, v) {
    const px = u * this.canvas.width, py = (1 - v) * this.canvas.height;
    for (const b of this.buttons) if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    return null;
  }
}

export class UI {
  constructor() {
    this.panels = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 8;
    this.pointers = new Map();
  }
  add(panel) { this.panels.push(panel); return panel; }

  // Returns the hit distance if the ray is on a panel, else null.
  point(key, origin, dir) {
    this.ray.set(origin, dir);
    const meshes = this.panels.filter((p) => p.mesh.visible && p.mesh.parent && p.mesh.parent.visible).map((p) => p.mesh);
    const hits = this.ray.intersectObjects(meshes, false);
    const prev = this.pointers.get(key);
    let cur = null;
    if (hits.length) {
      const panel = hits[0].object.userData.panel;
      const btn = panel.hit(hits[0].uv.x, hits[0].uv.y);
      cur = { panel, btn, dist: hits[0].distance, point: hits[0].point };
    }
    this.pointers.set(key, cur);
    const was = prev && prev.btn ? prev.panel : null, now = cur && cur.btn ? cur.panel : null;
    if (was && (was !== now || prev.btn.id !== cur.btn.id)) { if (was.hover === prev.btn.id) { was.hover = null; was.redraw(); } }
    if (now && now.hover !== cur.btn.id) { now.hover = cur.btn.id; now.redraw(); if (this.onHover) this.onHover(); }
    return cur;
  }
  clear(key) {
    const prev = this.pointers.get(key);
    if (prev && prev.btn && prev.panel.hover === prev.btn.id) { prev.panel.hover = null; prev.panel.redraw(); }
    this.pointers.delete(key);
  }
  // True if a button took the click.
  click(key) {
    const cur = this.pointers.get(key);
    if (!cur) return false;
    if (cur.btn && cur.btn.onClick) { cur.btn.onClick(); if (this.onClick) this.onClick(); }
    return true;      // clicks on a panel never fall through to the table
  }
}
