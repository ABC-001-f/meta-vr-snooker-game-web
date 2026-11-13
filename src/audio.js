// All sound is synthesised: ball clicks, cushions, pocket drops, the cue, a
// small crowd, and a room tone for each club. Spatialised with HRTF panners.
export class Audio3D {
  constructor() { this.ctx = null; this.buffers = {}; this.amb = null; this.ambKind = null; this.ambT = 0; this.muted = false; this.roomOn = true; }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; }
  setRoomTone(on) { this.roomOn = on; if (this.amb && this.ctx) this.amb.gain.gain.linearRampToValueAtTime(on ? 1 : 0, this.ctx.currentTime + 0.4); }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.makeBuffers();
    if (this.ambKind) this.setAmbience(this.ambKind);
  }

  buf(seconds, fn) {
    const sr = this.ctx.sampleRate, n = Math.floor(seconds * sr);
    const b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i / sr, i);
    return b;
  }

  makeBuffers() {
    const rnd = () => Math.random() * 2 - 1, TAU = Math.PI * 2;
    this.buffers.ball = this.buf(0.09, (t) => (Math.sin(TAU * 2900 * t) * 0.6 + Math.sin(TAU * 4700 * t) * 0.35 + Math.sin(TAU * 7100 * t) * 0.2 + rnd() * 0.5 * Math.exp(-t * 900)) * Math.exp(-t * 110));
    this.buffers.cushion = this.buf(0.2, (t) => (Math.sin(TAU * (130 - 200 * t) * t) * 0.9 + rnd() * 0.25 * Math.exp(-t * 200)) * Math.exp(-t * 28));
    this.buffers.cue = this.buf(0.08, (t) => (Math.sin(TAU * 950 * t) * 0.7 + Math.sin(TAU * 1900 * t) * 0.2 + rnd() * 0.6 * Math.exp(-t * 500)) * Math.exp(-t * 85));
    this.buffers.pocket = this.buf(0.7, (t) => {
      let v = 0;
      for (const [t0, f, a] of [[0, 160, 1], [0.09, 240, 0.7], [0.17, 200, 0.5], [0.27, 280, 0.35], [0.4, 180, 0.25]]) {
        if (t >= t0) v += (Math.sin(TAU * f * (t - t0)) + rnd() * 0.5) * a * Math.exp(-(t - t0) * 38);
      }
      return v * 0.6;
    });
    this.buffers.click = this.buf(0.05, (t) => Math.sin(TAU * 1300 * t) * Math.exp(-t * 90) * 0.5);
    this.buffers.chime = this.buf(0.9, (t) => (Math.sin(TAU * 880 * t) + (t > 0.12 ? Math.sin(TAU * 1318 * (t - 0.12)) * Math.exp(-(t - 0.12) * 5) : 0)) * Math.exp(-t * 4) * 0.3);
    this.buffers.foul = this.buf(0.5, (t) => (Math.sin(TAU * 220 * t) + Math.sin(TAU * 207 * t)) * Math.exp(-t * 7) * 0.3);
    const grains = [];
    for (let i = 0; i < 420; i++) grains.push([Math.random() * 2.6, 0.3 + Math.random() * 0.7]);
    this.buffers.applause = this.buf(3.2, (t) => {
      let v = 0;
      for (const [t0, a] of grains) { const d = t - t0; if (d >= 0 && d < 0.02) v += rnd() * a * Math.exp(-d * 260); }
      return v * 0.22 * Math.min(1, t * 6) * Math.min(1, (3.2 - t) * 1.2);
    });
    this.buffers.noise = this.buf(2, () => rnd());
  }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  play(name, pos, gain = 1, rate = 1) {
    if (!this.ctx || !this.buffers[name] || gain < 0.004) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1.5, gain);
    src.connect(g);
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0.9;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    src.start();
  }

  setAmbience(kind) {
    this.ambKind = kind;
    if (!this.ctx) return;
    if (this.amb) { const old = this.amb; old.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* not a source */ } }), 800); }
    const ctx = this.ctx, out = ctx.createGain();
    out.gain.value = 0; out.gain.linearRampToValueAtTime(this.roomOn ? 1 : 0, ctx.currentTime + 1.5);
    out.connect(this.master);
    const nodes = [];
    const noise = (type, freq, q, gain) => {
      const s = ctx.createBufferSource(); s.buffer = this.buffers.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(out); s.start(); nodes.push(s); return g;
    };
    const tone = (type, freq, gain, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(out); o.start(); nodes.push(o); return g;
    };
    const lfo = (target, rate, depth) => { const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); nodes.push(o); };
    if (kind === 'luxury') { noise('lowpass', 220, 0.5, 0.05); }
    else if (kind === 'underground') { noise('lowpass', 160, 0.7, 0.07); tone('sine', 55, 0.03); tone('sine', 110.4, 0.012); }
    else if (kind === 'hall') { const g = noise('bandpass', 420, 0.6, 0.08); lfo(g.gain, 0.13, 0.03); noise('lowpass', 120, 0.5, 0.06); }
    else if (kind === 'cyber') {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.connect(out);
      for (const [fr, dt] of [[55, 0], [82.4, 7], [110, -6], [164.8, 4]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = dt; const g = ctx.createGain(); g.gain.value = 0.022; o.connect(g); g.connect(f); o.start(); nodes.push(o); }
      lfo(f.frequency, 0.07, 180);
      noise('highpass', 5000, 0.5, 0.004);
    }
    this.amb = { gain: out, nodes };
  }

  // Occasional sounds of the room: fire crackle, other tables, a cough in the crowd.
  update(dt, spot) {
    if (!this.ctx || !this.ambKind || !this.roomOn) return;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    if (this.ambKind === 'luxury') { this.ambT = 0.05 + Math.random() * 0.35; this.play('click', spot, 0.05 + Math.random() * 0.12, 0.25 + Math.random() * 0.5); }
    else if (this.ambKind === 'underground') { this.ambT = 2 + Math.random() * 5; const p = { x: (Math.random() - 0.5) * 10, y: 0.9, z: spot.z + (Math.random() - 0.5) }; this.play('ball', p, 0.35, 0.95 + Math.random() * 0.1); if (Math.random() < 0.35) setTimeout(() => this.play('pocket', p, 0.3), 700); }
    else if (this.ambKind === 'hall') { this.ambT = 5 + Math.random() * 9; this.play('cushion', { x: (Math.random() - 0.5) * 14, y: 2.5, z: Math.random() < 0.5 ? 7 : -7 }, 0.25, 1.6 + Math.random()); }
    else this.ambT = 5;
  }
}
