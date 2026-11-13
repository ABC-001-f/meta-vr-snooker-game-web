// Sanity checks for the physics and the snooker rules. Run: npm test
import assert from 'node:assert/strict';
import { Physics } from '../src/physics.js';
import { Rules, isSnookered } from '../src/rules.js';
import { rackBalls, respotColour } from '../src/rack.js';
import { planShot } from '../src/ai.js';
import { R, L, W, SPOTS, POCKETS } from '../src/config.js';

function run(p, maxT = 40) {
  let t = 0;
  while (p.isMoving() && t < maxT) { p.step(1 / 120); t += 1 / 120; }
  return t;
}
const live = (p) => p.balls.filter((b) => !b.potted);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

test('rack has 22 balls and nothing overlaps', () => {
  const p = new Physics();
  assert.equal(rackBalls(p, 15), 15);
  assert.equal(p.balls.length, 22);
  for (const a of p.balls) for (const b of p.balls) {
    if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2 * R - 1e-9, `${a.id} overlaps ${b.id}`);
  }
});

test('break shot settles, balls stay on the table', () => {
  const p = new Physics();
  rackBalls(p, 15);
  p.strike({ x: 0.999, y: 0, z: -0.03 }, 6, 0, 0);
  const t = run(p);
  assert.ok(t < 40, 'balls came to rest');
  assert.ok(p.firstHit, 'cue ball hit something');
  for (const b of live(p)) {
    assert.ok(Math.abs(b.x) <= L + 0.05 && Math.abs(b.z) <= W + 0.05, `${b.id} left the table`);
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.z));
  }
});

test('straight pot into a corner pocket', () => {
  const p = new Physics();
  rackBalls(p, 6);
  for (const b of p.balls) if (b.id !== 'cue' && b.id !== 'black') b.potted = true;
  const pk = POCKETS[3];
  const d = Math.hypot(pk.x, pk.z);
  p.place('black', pk.x - (pk.x / d) * 0.5, pk.z - (pk.z / d) * 0.5);
  p.place('cue', pk.x - (pk.x / d) * 1.2, pk.z - (pk.z / d) * 1.2);
  p.strike({ x: pk.x / d, y: 0, z: pk.z / d }, 2.5, 0, 0);
  run(p);
  assert.deepEqual(p.pottedThisShot.filter((i) => i === 'black'), ['black']);
});

test('top spin follows, back spin draws, stun stops', () => {
  const shot = (b) => {
    const p = new Physics();
    rackBalls(p, 6);
    for (const x of p.balls) if (x.id !== 'cue' && x.id !== 'blue') x.potted = true;
    p.place('cue', -0.5, 0.3); p.place('blue', 0, 0.3);
    p.strike({ x: 1, y: 0, z: 0 }, 2.2, 0, b);
    run(p);
    return p.cue.x;
  };
  const follow = shot(0.45), draw = shot(-0.5);
  assert.ok(follow > 0.05, `follow should run on past the contact point, got ${follow}`);
  assert.ok(draw < -0.1, `draw should come back, got ${draw}`);
});

test('side spin changes the angle off a cushion', () => {
  const shot = (a) => {
    const p = new Physics();
    rackBalls(p, 6);
    for (const x of p.balls) if (x.id !== 'cue') x.potted = true;
    p.place('cue', 0.6, 0);
    p.strike({ x: 0, y: 0, z: 1 }, 2, a, 0);
    run(p);
    return p.cue.x;
  };
  const plain = shot(0), left = shot(-0.5), right = shot(0.5);
  assert.ok(Math.abs(plain - 0.6) < 0.02, 'plain ball comes straight back');
  assert.ok(Math.abs(left - right) > 0.1, `side should throw the ball off line (${left} vs ${right})`);
  assert.ok(Math.sign(left - 0.6) !== Math.sign(right - 0.6), 'left and right side go opposite ways');
});

test('rules: red then colour, colour is re-spotted', () => {
  const r = new Rules({ mode: 'duo', reds: 15 });
  let res = r.evaluate({ firstHit: 'red3', potted: ['red3'] });
  assert.equal(res.foul, false); assert.equal(r.scores[0], 1); assert.equal(r.on, 'colour'); assert.equal(r.turn, 0);
  res = r.evaluate({ firstHit: 'black', potted: ['black'] });
  assert.equal(r.scores[0], 8); assert.deepEqual(res.respots, ['black']); assert.equal(r.on, 'red'); assert.equal(r.break, 8);
  res = r.evaluate({ firstHit: 'red1', potted: [] });
  assert.equal(res.switched, true); assert.equal(r.turn, 1); assert.equal(r.break, 0);
});

test('rules: fouls', () => {
  let r = new Rules({ mode: 'duo', reds: 15 });
  let res = r.evaluate({ firstHit: null, potted: [] });
  assert.equal(res.penalty, 4); assert.equal(r.scores[1], 4); assert.equal(r.turn, 1);
  r = new Rules({ mode: 'duo', reds: 15 });
  res = r.evaluate({ firstHit: 'black', potted: [] });
  assert.equal(res.penalty, 7);
  r = new Rules({ mode: 'duo', reds: 15 });
  res = r.evaluate({ firstHit: 'red1', potted: ['red1', 'cue'] });
  assert.equal(res.penalty, 4); assert.equal(r.ballInHand, true); assert.equal(r.redsLeft, 14); assert.equal(r.scores[0], 0);
  r = new Rules({ mode: 'duo', reds: 15 });
  res = r.evaluate({ firstHit: 'red1', potted: ['red1', 'pink'] });
  assert.equal(res.penalty, 6); assert.deepEqual(res.respots, ['pink']);
});

test('rules: colours in order, 147, frame ends', () => {
  const r = new Rules({ mode: 'duo', reds: 15 });
  for (let i = 1; i <= 15; i++) {
    r.evaluate({ firstHit: 'red' + i, potted: ['red' + i] });
    r.evaluate({ firstHit: 'black', potted: ['black'] });
  }
  assert.equal(r.on, 'yellow');
  let last;
  for (const c of ['yellow', 'green', 'brown', 'blue', 'pink', 'black']) last = r.evaluate({ firstHit: c, potted: [c] });
  assert.equal(r.scores[0], 147); assert.equal(r.break, 147);
  assert.equal(last.frameOver, true); assert.equal(r.winner, 0);
});

test('rules: tied frame re-spots the black', () => {
  const r = new Rules({ mode: 'duo', reds: 15 });
  r.redsLeft = 0; r.on = 'black'; r.colourIdx = 5; r.scores = [20, 27];
  const res = r.evaluate({ firstHit: 'black', potted: ['black'] });
  assert.equal(res.respotBlack, true); assert.equal(r.over, false); assert.equal(r.ballInHand, true); assert.equal(r.on, 'black');
  const end = r.evaluate({ firstHit: null, potted: [] });
  assert.equal(end.frameOver, true); assert.equal(r.over, true);
});

test('rules: free ball', () => {
  const r = new Rules({ mode: 'duo', reds: 15 });
  r.freeBall = true;
  const res = r.evaluate({ firstHit: 'blue', potted: ['blue'] });
  assert.equal(res.foul, false); assert.equal(res.points, 1); assert.deepEqual(res.respots, ['blue']); assert.equal(r.on, 'colour');
});

test('snooker detection and re-spotting', () => {
  const p = new Physics();
  rackBalls(p, 6);
  for (const b of p.balls) if (!['cue', 'red1', 'black'].includes(b.id)) b.potted = true;
  p.place('cue', -1, 0); p.place('red1', 0, 0); p.place('black', -0.5, 0);
  assert.equal(isSnookered(p.balls, 'red'), true);
  p.place('black', -0.5, 0.4);
  assert.equal(isSnookered(p.balls, 'red'), false);
  p.place('red1', SPOTS.black[0], SPOTS.black[1]);
  p.get('black').potted = true;
  respotColour(p, 'black');
  const bl = p.get('black');
  assert.equal(bl.potted, false);
  assert.ok(Math.hypot(bl.x - SPOTS.pink[0], bl.z - SPOTS.pink[1]) < 1e-9, 'black goes to the pink spot when its own is covered');
});

test('AI finds and makes an easy pot most of the time', () => {
  let made = 0;
  for (let i = 0; i < 20; i++) {
    const p = new Physics();
    rackBalls(p, 6);
    for (const b of p.balls) if (!['cue', 'red1'].includes(b.id)) b.potted = true;
    p.place('red1', 1.3, 0.55); p.place('cue', 0.6, 0.2);
    const r = new Rules({ mode: 'ai', reds: 1 });
    const s = planShot(p, r, 'pro');
    p.strike(s.dir, s.speed, s.a, s.b);
    run(p);
    if (p.pottedThisShot.includes('red1')) made++;
  }
  assert.ok(made >= 14, `pro AI should pot an easy red, made ${made}/20`);
});

console.log(`\n${passed} tests passed`);
