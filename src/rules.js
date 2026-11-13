import { VALUE, COLOURS, R } from './config.js';

const typeOf = (id) => (id.startsWith('red') ? 'red' : id);

function blocked(x1, z1, x2, z2, blockers) {
  const ex = x2 - x1, ez = z2 - z1;
  const len2 = ex * ex + ez * ez || 1e-9;
  for (const b of blockers) {
    let t = ((b.x - x1) * ex + (b.z - z1) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = b.x - (x1 + ex * t), dz = b.z - (z1 + ez * t);
    if (dx * dx + dz * dz < 4 * R * R) return true;
  }
  return false;
}

// Snookered = no ball on can be hit on both of its extreme edges in a straight line.
export function isSnookered(balls, on) {
  const cue = balls.find((b) => b.id === 'cue');
  const live = balls.filter((b) => !b.potted && b.id !== 'cue');
  const isOn = (b) => (on === 'red' ? b.type === 'red' : on === 'colour' ? b.type !== 'red' : b.type === on);
  const ons = live.filter(isOn), blockers = live.filter((b) => !isOn(b));
  if (!ons.length || !cue) return false;
  for (const t of ons) {
    const dx = t.x - cue.x, dz = t.z - cue.z, d = Math.hypot(dx, dz) || 1e-6;
    const px = -dz / d, pz = dx / d;
    let ok = true;
    for (const s of [-1, 1]) {
      const gx = t.x + px * s * 2 * R * 0.98, gz = t.z + pz * s * 2 * R * 0.98;
      if (blocked(cue.x, cue.z, gx, gz, blockers)) { ok = false; break; }
    }
    if (ok) return false;
  }
  return true;
}

export class Rules {
  // mode: 'solo' | 'ai' | 'duo'
  constructor({ mode = 'solo', reds = 15, names } = {}) {
    this.mode = mode;
    this.names = names || (mode === 'solo' ? ['You'] : mode === 'ai' ? ['You', 'House Pro'] : ['Player 1', 'Player 2']);
    this.scores = [0, 0];
    this.highBreak = [0, 0];
    this.turn = 0;
    this.break = 0;
    this.redsLeft = reds;
    this.on = 'red';            // 'red' | 'colour' (any colour after a red) | a colour name
    this.colourIdx = 0;
    this.freeBall = false;
    this.ballInHand = true;
    this.over = false;
    this.winner = -1;
    this.respotBlack = false;
  }

  get players() { return this.mode === 'solo' ? 1 : 2; }

  onLabel() {
    if (this.over) return 'Frame over';
    if (this.freeBall) return 'Free ball';
    if (this.on === 'red') return 'Red';
    if (this.on === 'colour') return 'Any colour';
    return this.on[0].toUpperCase() + this.on.slice(1);
  }

  pointsRemaining() {
    if (this.over) return 0;
    if (this.on === 'red') return this.redsLeft * 8 + 27;
    if (this.on === 'colour') return 7 + this.redsLeft * 8 + 27;
    let s = 0;
    for (let i = this.colourIdx; i < 6; i++) s += VALUE[COLOURS[i]];
    return s;
  }

  // shot: { firstHit: ball id or null, potted: [ball ids] }
  evaluate(shot) {
    const cuePotted = shot.potted.includes('cue');
    const types = shot.potted.filter((id) => id !== 'cue').map(typeOf);
    const first = shot.firstHit ? typeOf(shot.firstHit) : null;
    const on = this.on, free = this.freeBall;
    const base = on === 'red' || on === 'colour' ? 4 : Math.max(4, VALUE[on]);
    const onlyBlack = on === 'black';
    let pen = 0, reason = '';
    const foul = (p, why) => { if (p > pen) pen = p; if (!reason) reason = why; };
    let nominated = null;

    if (!first) foul(base, 'No ball hit');
    else if (free) nominated = first;
    else if (on === 'red') { if (first !== 'red') foul(Math.max(base, VALUE[first]), `Hit the ${first} first`); }
    else if (on === 'colour') { if (first === 'red') foul(base, 'Hit a red, a colour was on'); else nominated = first; }
    else if (first !== on) foul(Math.max(base, VALUE[first]), `Hit the ${first} first`);
    if (cuePotted) foul(base, 'Cue ball potted');

    const redsPotted = types.filter((t) => t === 'red').length;
    const cols = types.filter((t) => t !== 'red');
    let legal;
    if (on === 'red') legal = free && nominated && nominated !== 'red' ? [nominated] : [];
    else if (on === 'colour') legal = nominated ? [nominated] : [];
    else legal = free && nominated ? [on, nominated] : [on];
    for (const c of cols) if (!legal.includes(c)) foul(Math.max(base, VALUE[c]), `Potted the ${c}`);
    if (on === 'colour' && redsPotted > 0) foul(Math.max(4, VALUE[nominated] || 4), 'Potted a red, a colour was on');
    this.redsLeft -= redsPotted;                 // reds never come back

    const res = {
      foul: pen > 0, penalty: pen, reason, points: 0, respots: [], switched: false,
      frameOver: false, respotBlack: false, player: this.turn, cuePotted,
    };
    let cont = false;
    if (pen > 0) {
      res.respots = [...new Set(cols)];
      if (this.players === 2) this.scores[1 - this.turn] += pen;
      this.on = this.redsLeft > 0 ? 'red' : COLOURS[this.colourIdx];
    } else {
      let pts = 0;
      if (on === 'red') {
        pts = redsPotted + (cols.length ? 1 : 0);
        res.respots = [...cols];
        if (pts > 0) { cont = true; this.on = 'colour'; }
      } else if (on === 'colour') {
        if (cols.length) { pts = VALUE[nominated]; res.respots = [nominated]; cont = true; }
        this.on = this.redsLeft > 0 ? 'red' : COLOURS[this.colourIdx];
      } else {
        const potOn = cols.includes(on);
        const potFree = free && nominated !== on && cols.includes(nominated);
        if (potFree) res.respots = [nominated];
        if (potOn) { pts = VALUE[on]; this.colourIdx++; cont = true; }
        else if (potFree) { pts = VALUE[on]; cont = true; }
        this.on = this.colourIdx < 6 ? COLOURS[this.colourIdx] : null;
      }
      res.points = pts;
      this.scores[this.turn] += pts;
      if (cont) {
        this.break += pts;
        if (this.break > this.highBreak[this.turn]) this.highBreak[this.turn] = this.break;
      }
    }
    this.freeBall = false;
    this.lastFoul = pen > 0;
    if (cuePotted) this.ballInHand = true;

    const blackDecided = onlyBlack && (pen > 0 || cols.includes('black'));
    if (this.on === null || blackDecided) {
      if (this.players === 2 && this.scores[0] === this.scores[1]) {
        // tied: re-spot the black, cue ball in hand, next score or foul wins
        this.on = 'black'; this.colourIdx = 5; this.respotBlack = true; this.ballInHand = true;
        res.respots = ['black']; res.respotBlack = true;
        cont = false;
      } else {
        this.over = true; res.frameOver = true;
        this.winner = this.players === 2 ? (this.scores[0] > this.scores[1] ? 0 : 1) : 0;
        this.on = null;
      }
    }
    if (!cont && !this.over) {
      this.break = 0;
      res.switched = true;
      if (this.players === 2) this.turn = 1 - this.turn;
    }
    return res;
  }

  // Call once the colours are back on their spots.
  checkFreeBall(balls) {
    this.freeBall = !!this.lastFoul && !this.over && !this.ballInHand && isSnookered(balls, this.on);
    return this.freeBall;
  }
}
