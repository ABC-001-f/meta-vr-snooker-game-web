import * as THREE from 'three';
import { L, W, CW, BAULK_X, D_R, SPOTS } from './config.js';

// Everything is painted at runtime, so the game ships with no image files.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, alpha, rand, size = 1.5) {
  for (let i = 0; i < n; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    g.fillRect(rand() * w, rand() * h, rand() * size + 0.5, rand() * size + 0.5);
  }
}

// Cloth for the bed, with baulk line, the D and the spots woven in.
export function clothTexture(color, lineColor = 'rgba(255,255,255,0.75)') {
  const Lb = L + CW, Wb = W + CW;
  return canvasTex(2048, 1024, (g, w, h) => {
    const rand = rng(7);
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const pool = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.62);
    pool.addColorStop(0, 'rgba(255,255,255,0.04)');
    pool.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = pool; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 90000, 0.07, rand, 1.2);
    g.globalAlpha = 0.035;
    for (let i = 0; i < 700; i++) {       // nap of the cloth, running up the table
      g.strokeStyle = rand() < 0.5 ? '#000' : '#fff';
      const y = rand() * h, x = rand() * w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rand() * 90, y + (rand() - 0.5) * 2); g.stroke();
    }
    g.globalAlpha = 1;
    const X = (x) => ((x + Lb) / (2 * Lb)) * w, Z = (z) => ((z + Wb) / (2 * Wb)) * h, S = w / (2 * Lb);
    g.strokeStyle = lineColor; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(X(BAULK_X), Z(-W)); g.lineTo(X(BAULK_X), Z(W)); g.stroke();
    g.beginPath(); g.arc(X(BAULK_X), Z(0), D_R * S, Math.PI / 2, (3 * Math.PI) / 2); g.stroke();
    g.fillStyle = lineColor;
    for (const k of Object.keys(SPOTS)) {
      g.beginPath(); g.arc(X(SPOTS[k][0]), Z(SPOTS[k][1]), 2.6, 0, 7); g.fill();
    }
  });
}

export function woodTexture(base, dark, seed = 1, { w = 1024, h = 512, repeat = true } = {}) {
  return canvasTex(w, h, (g) => {
    const rand = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const y = rand() * h, amp = 2 + rand() * 7, f = 0.004 + rand() * 0.01, ph = rand() * 7;
      g.strokeStyle = rand() < 0.7 ? dark : '#ffffff';
      g.globalAlpha = 0.04 + rand() * 0.11;
      g.lineWidth = 0.5 + rand() * 2.2;
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * f + ph) * amp);
      g.stroke();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 9000, 0.06, rand);
  }, { repeat });
}

export function plankTexture(base, dark, seed = 3) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(seed);
    const rows = 8, ph = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 300;
      while (x < w) {
        const len = 260 + rand() * 280;
        const t = rand();
        g.fillStyle = base; g.fillRect(x, r * ph, len, ph);
        g.fillStyle = `rgba(0,0,0,${0.05 + t * 0.22})`; g.fillRect(x, r * ph, len, ph);
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = dark; g.globalAlpha = 0.05 + rand() * 0.12; g.lineWidth = 0.6 + rand() * 1.6;
          const y = r * ph + rand() * ph;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rand() - 0.5) * 6); g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, r * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, r * ph, w, 2);
    }
  }, { repeat: true });
}

export function brickTexture(seed = 5) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = '#17120f'; g.fillRect(0, 0, w, h);
    const bh = 64, bw = 170;
    for (let r = 0; r < h / bh; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
        const k = rand();
        g.fillStyle = `rgb(${86 + k * 50},${36 + k * 22},${28 + k * 14})`;
        g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
        g.fillStyle = `rgba(0,0,0,${rand() * 0.35})`; g.fillRect(x + 4, y + 4, bw - 8, bh - 8);
      }
    }
    speckle(g, w, h, 26000, 0.16, rand, 2.5);
  }, { repeat: true });
}

export function concreteTexture(base = '#3a3b3e', seed = 9) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = rand() * w, y = rand() * h, r = 40 + rand() * 180;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const v = rand() < 0.5 ? 0 : 255;
      gr.addColorStop(0, `rgba(${v},${v},${v},0.07)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    speckle(g, w, h, 40000, 0.1, rand, 2);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, { repeat: true });
}

export function carpetTexture(base, accent, seed = 11) {
  return canvasTex(512, 512, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = accent; g.globalAlpha = 0.5; g.lineWidth = 3;
    for (let i = -1; i < 3; i++) {
      for (let j = -1; j < 3; j++) {
        const cx = i * 256 + 128, cy = j * 256 + 128;
        g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx + 110, cy); g.lineTo(cx, cy + 110); g.lineTo(cx - 110, cy); g.closePath(); g.stroke();
        g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.stroke();
      }
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 30000, 0.12, rand, 1.4);
  }, { repeat: true });
}

export function rugTexture() {
  return canvasTex(1024, 640, (g, w, h) => {
    const rand = rng(21);
    g.fillStyle = '#4a0f16'; g.fillRect(0, 0, w, h);
    const band = (m, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(14, '#c9a24a', 10); band(40, '#1c0a0c', 18); band(66, '#c9a24a', 4);
    g.strokeStyle = '#c9a24a'; g.globalAlpha = 0.55; g.lineWidth = 2;
    for (let x = 110; x < w - 90; x += 60) {
      for (let y = 110; y < h - 90; y += 60) {
        g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y); g.closePath(); g.stroke();
      }
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 40000, 0.13, rand, 1.4);
  });
}

export function marbleTexture(base = '#101114', vein = '#c9a24a', seed = 13) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++) {
      g.strokeStyle = rand() < 0.4 ? vein : '#e9e6df';
      g.globalAlpha = 0.08 + rand() * 0.3; g.lineWidth = 0.6 + rand() * 2.4;
      let x = rand() * w, y = rand() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 9; s++) { x += (rand() - 0.5) * 240; y += (rand() - 0.3) * 200; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 12000, 0.06, rand);
  }, { repeat: true });
}

export function leatherTexture(base, seed = 17) {
  return canvasTex(512, 512, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, 0.14, rand, 2.2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 128 + 64, y = j * 128 + 64;
      const gr = g.createRadialGradient(x, y, 2, x, y, 70);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.15, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
      g.fillStyle = gr; g.fillRect(x - 64, y - 64, 128, 128);
    }
  }, { repeat: true });
}

// Wainscot panelling below, wallpaper above.
export function panelWallTexture(wood, woodDark, paper, accent) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(31);
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.16; g.strokeStyle = accent; g.lineWidth = 2;
    for (let x = 64; x < w; x += 128) for (let y = 40; y < h * 0.62; y += 110) {
      g.beginPath(); g.ellipse(x, y, 20, 36, 0, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(x, y - 52); g.lineTo(x, y + 52); g.stroke();
    }
    g.globalAlpha = 1;
    const y0 = h * 0.64;
    g.fillStyle = wood; g.fillRect(0, y0, w, h - y0);
    for (let i = 0; i < 200; i++) {
      g.strokeStyle = woodDark; g.globalAlpha = 0.06 + rand() * 0.1; g.lineWidth = 1 + rand() * 2;
      const x = rand() * w; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rand() - 0.5) * 12, h); g.stroke();
    }
    g.globalAlpha = 1;
    for (let x = 0; x < w; x += 256) {
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6; g.strokeRect(x + 26, y0 + 40, 204, h - y0 - 90);
      g.strokeStyle = 'rgba(255,220,160,0.14)'; g.lineWidth = 2; g.strokeRect(x + 32, y0 + 46, 192, h - y0 - 102);
    }
    g.fillStyle = accent; g.fillRect(0, y0 - 8, w, 8);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y0, w, 6);
  }, { repeat: true });
}

export function skylineTexture(seed = 41, tint = '#ffd27a') {
  return canvasTex(512, 1024, (g, w, h) => {
    const rand = rng(seed);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05081a'); sky.addColorStop(0.6, '#1a1f45'); sky.addColorStop(1, '#5a3a55');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.8})`; g.fillRect(rand() * w, rand() * h * 0.55, 1.5, 1.5); }
    g.fillStyle = '#f4ead0'; g.beginPath(); g.arc(w * 0.72, h * 0.16, 34, 0, 7); g.fill();
    for (let layer = 0; layer < 3; layer++) {
      let x = -20;
      while (x < w) {
        const bw = 36 + rand() * 70, bh = h * (0.2 + rand() * 0.34) * (1 - layer * 0.18);
        g.fillStyle = ['#0c1026', '#080b1a', '#04050d'][layer];
        g.fillRect(x, h - bh, bw, bh);
        for (let wy = h - bh + 8; wy < h - 6; wy += 13) for (let wx = x + 5; wx < x + bw - 6; wx += 10) {
          if (rand() < 0.3) { g.fillStyle = rand() < 0.8 ? tint : '#9fd8ff'; g.globalAlpha = 0.5 + rand() * 0.5; g.fillRect(wx, wy, 5, 7); g.globalAlpha = 1; }
        }
        x += bw + rand() * 8;
      }
    }
  });
}

export function artTexture(seed) {
  return canvasTex(512, 640, (g, w, h) => {
    const rand = rng(seed);
    const pal = [['#0e2a3a', '#c9a24a', '#e7dcc4', '#7a1f2b'], ['#1c1c24', '#c9a24a', '#2d6a5a', '#e8e2d0'], ['#2a0e16', '#d9b25a', '#12233f', '#efe6d2']][seed % 3];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = pal[1 + Math.floor(rand() * 3)]; g.globalAlpha = 0.55 + rand() * 0.4;
      g.beginPath();
      if (rand() < 0.5) g.arc(rand() * w, rand() * h, 30 + rand() * 130, 0, 7);
      else g.rect(rand() * w, rand() * h, 40 + rand() * 220, 20 + rand() * 180);
      g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, w, h, 12000, 0.08, rand, 2);
  });
}

export function bookshelfTexture(seed = 51) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = '#1a0f0a'; g.fillRect(0, 0, w, h);
    const rows = 5, rh = h / rows;
    const cols = ['#5a1a1f', '#1f3a2d', '#1c2a4a', '#6a4a1c', '#2b2b30', '#7a5a2a', '#3a1530'];
    for (let r = 0; r < rows; r++) {
      let x = 14;
      while (x < w - 30) {
        const bw = 16 + rand() * 30, bh = rh * (0.62 + rand() * 0.26);
        g.fillStyle = cols[Math.floor(rand() * cols.length)];
        g.fillRect(x, (r + 1) * rh - 16 - bh, bw, bh);
        g.fillStyle = 'rgba(201,162,74,0.7)';
        g.fillRect(x + 2, (r + 1) * rh - 16 - bh * 0.8, bw - 4, 3);
        g.fillRect(x + 2, (r + 1) * rh - 16 - bh * 0.25, bw - 4, 3);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + bw - 3, (r + 1) * rh - 16 - bh, 3, bh);
        x += bw + (rand() < 0.08 ? 40 : 1);
      }
      g.fillStyle = '#2c1a10'; g.fillRect(0, (r + 1) * rh - 16, w, 16);
    }
  });
}

export function bottleShelfTexture(seed = 61, glow = '#ffb45a') {
  return canvasTex(1024, 512, (g, w, h) => {
    const rand = rng(seed);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b0806'); bg.addColorStop(1, '#1d130b');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) {
      const y = (r + 1) * (h / 3) - 12;
      g.fillStyle = glow; g.globalAlpha = 0.85; g.fillRect(0, y, w, 5); g.globalAlpha = 1;
      const gl = g.createLinearGradient(0, y - 120, 0, y);
      gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(255,170,80,0.22)');
      g.fillStyle = gl; g.fillRect(0, y - 120, w, 120);
      for (let x = 14; x < w - 20; x += 26 + rand() * 16) {
        const bh = 70 + rand() * 46, bw = 14 + rand() * 8;
        g.fillStyle = ['#7a3b10', '#1f5a34', '#a8791e', '#5a1220', '#c9c2a8', '#243a6a'][Math.floor(rand() * 6)];
        g.fillRect(x, y - bh * 0.7, bw, bh * 0.7);
        g.fillRect(x + bw * 0.32, y - bh, bw * 0.36, bh * 0.32);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, y - bh * 0.66, 2, bh * 0.56);
        g.fillStyle = 'rgba(240,230,200,0.8)'; g.fillRect(x + 1, y - bh * 0.45, bw - 2, bh * 0.2);
      }
    }
  });
}

export function neonTexture(text, color, { w = 1024, h = 256, font = 'italic 700 150px Georgia, serif', frame = false } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 150;
    g.font = font;
    while (g.measureText(text).width > w * 0.88 && size > 30) { size -= 6; g.font = font.replace(/\d+px/, size + 'px'); }
    for (const [blur, alpha] of [[46, 0.9], [22, 0.9], [8, 1]]) {
      g.shadowColor = color; g.shadowBlur = blur; g.globalAlpha = alpha;
      g.fillStyle = color; g.fillText(text, w / 2, h / 2);
      if (frame) { g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(30, 30, w - 60, h - 60); }
    }
    g.shadowBlur = 0; g.globalAlpha = 1;
    g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, w / 2, h / 2);
  });
}

export function plaqueTexture(title, sub) {
  return canvasTex(1024, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#8a6a22'); gr.addColorStop(0.35, '#f1d98a'); gr.addColorStop(0.6, '#b8902e'); gr.addColorStop(1, '#6d5218');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,26,4,0.8)'; g.lineWidth = 6; g.strokeRect(22, 22, w - 44, h - 44);
    g.fillStyle = '#2a1c05'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 110; g.font = `700 ${size}px Georgia, serif`;
    while (g.measureText(title).width > w * 0.84 && size > 30) { size -= 4; g.font = `700 ${size}px Georgia, serif`; }
    g.fillText(title, w / 2, h * 0.42);
    g.font = '600 44px Georgia, serif'; g.fillText(sub, w / 2, h * 0.76);
  });
}

export function crowdTexture(seed = 71) {
  return canvasTex(1024, 256, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      const y = 40 + r * 56;
      for (let x = 8 + (r % 2) * 16; x < w; x += 30 + rand() * 6) {
        const v = 20 + rand() * 30;
        g.fillStyle = `rgb(${v + 14},${v + 8},${v + 4})`;
        g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
        g.fillStyle = ['#161a26', '#1d1418', '#12201c', '#22222a'][Math.floor(rand() * 4)];
        g.beginPath(); g.ellipse(x, y + 26, 13, 18, 0, 0, 7); g.fill();
      }
    }
  }, { repeat: true });
}

export function gridTexture(color = '#19e6ff', bg = 'rgba(0,0,0,0)') {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.shadowColor = color; g.shadowBlur = 10; g.strokeStyle = color; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, { repeat: true });
}

export function towerTexture(seed, a = '#19e6ff', b = '#ff2bd6') {
  return canvasTex(128, 512, (g, w, h) => {
    const rand = rng(seed);
    g.fillStyle = '#04060f'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 10) for (let x = 6; x < w - 4; x += 12) {
      if (rand() < 0.42) { g.fillStyle = rand() < 0.6 ? a : b; g.globalAlpha = 0.35 + rand() * 0.65; g.fillRect(x, y, 7, 5); }
    }
    g.globalAlpha = 1;
    g.fillStyle = b; g.fillRect(0, 0, w, 4);
  });
}

export function spaceTexture() {
  return canvasTex(2048, 1024, (g, w, h) => {
    const rand = rng(81);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#02030a'); bg.addColorStop(0.5, '#0a0624'); bg.addColorStop(0.62, '#3a0d4f'); bg.addColorStop(0.7, '#0a0624'); bg.addColorStop(1, '#010206');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rand() * w, y = h * (0.25 + rand() * 0.45), r = 90 + rand() * 260;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, ['rgba(25,230,255,0.10)', 'rgba(255,43,214,0.10)', 'rgba(120,80,255,0.12)'][i % 3]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.8})`;
      const s = rand() < 0.04 ? 2.4 : 1.1; g.fillRect(rand() * w, rand() * h, s, s);
    }
  });
}

export function holoTexture(seed, color = '#19e6ff') {
  return canvasTex(512, 320, (g, w, h) => {
    const rand = rng(seed);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,40,60,0.35)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = color;
    for (let i = 0; i < 9; i++) { g.globalAlpha = 0.4 + rand() * 0.6; g.fillRect(24, 30 + i * 28, 60 + rand() * 280, 8); }
    g.globalAlpha = 1; g.beginPath();
    for (let x = 0; x < 180; x += 6) g.lineTo(310 + x, 250 - rand() * 120);
    g.stroke();
  });
}

// Cue ball: ivory with small red spots so you can read the spin.
export function cueBallTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f3eedb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3121c';
    const dot = (u, v, r) => { g.beginPath(); g.ellipse(u * w, v * h, r / Math.max(0.2, Math.sin(v * Math.PI)), r, 0, 0, 7); g.fill(); };
    for (const u of [0.125, 0.375, 0.625, 0.875]) dot(u, 0.5, 9);
    dot(0.5, 0.06, 9); dot(0.5, 0.94, 9);
    g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7);
  });
}

export function softDotTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function glowTexture(color = '#ffffff') {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
