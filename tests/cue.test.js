// Drives the cue controller with a scripted "hand" to check the stroke logic
// without a headset. Run: npm test
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CueController } from '../src/cue.js';
import { BED_Y, R } from '../src/config.js';

const V3 = THREE.Vector3;
const mkInput = (i) => ({ index: i, tracked: false, isHand: true, autoGrab: false, grab: false, busy: false, grip: new V3(), gripRaw: new V3(), bridge: new V3() });
const ball = new V3(0, BED_Y + R, 0);

function simulate({ start, strokeSpeed, bridge = null, feather = false }) {
  const cue = new CueController({ setPose() {} });
  const hand = mkInput(0), off = mkInput(1);
  const inputs = [hand, off];
  const strikes = [];
  const ctx = { ball, canShoot: true, restTip: start.clone(), restDir: new V3(0, 0, -1), power: 1, onStrike: (dir, V, a, b) => strikes.push({ dir, V, a, b }) };
  cue.tip.copy(start); cue.dir.set(0, 0, -1);
  const dt = 1 / 72;
  const toBall = new V3().subVectors(bridge || ball, start).normalize();   // the hand moves along the cue
  const pos = start.clone();
  const step = (vel, secs, noise = 0.0006) => {
    for (let t = 0; t < secs && !strikes.length; t += dt) {
      pos.addScaledVector(toBall, vel * dt);
      hand.tracked = true; hand.grab = true;
      hand.gripRaw.copy(pos).add(new V3((Math.random() - 0.5) * noise, (Math.random() - 0.5) * noise, (Math.random() - 0.5) * noise));
      hand.grip.copy(pos);
      if (bridge) { off.tracked = true; off.bridge.copy(bridge); }
      cue.update(dt, inputs, ctx);
    }
  };
  step(0, 0.8);                                   // settle: tip comes to rest behind the ball
  const restGap = cue.tip.distanceTo(ball) - R;
  if (feather) { step(0.15, 0.3); step(-0.15, 0.3); }   // slow feathering must not fire the shot early... but may touch
  const before = strikes.length;
  step(-0.5, 0.3);                                // backswing
  step(strokeSpeed, 1.0);                         // deliver
  return { strikes, restGap, cue, before };
}

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

test('one hand: the cue addresses the ball and a push strikes it', () => {
  const start = new V3(-0.45, BED_Y + 0.12, 0.1);
  const { strikes, restGap, cue } = simulate({ start, strokeSpeed: 1.5 });
  assert.equal(cue.holder, 0, 'cue was grabbed');
  assert.ok(restGap > 0.06 && restGap < 0.12, `tip rests just behind the ball (gap ${restGap.toFixed(3)})`);
  assert.equal(strikes.length, 1, 'exactly one strike');
  const s = strikes[0];
  const want = new V3().subVectors(ball, start).normalize();
  const got = new V3(s.dir.x, s.dir.y, s.dir.z);
  assert.ok(got.angleTo(want) < 0.03, `shot goes where the cue points (off by ${got.angleTo(want).toFixed(4)} rad)`);
  assert.ok(s.V > 2.4 && s.V < 4.2, `power follows hand speed (V=${s.V.toFixed(2)})`);
  assert.ok(Math.hypot(s.a, s.b) < 0.05, 'one-hand shots are centre ball');
});

test('power scales with how fast you push', () => {
  const start = new V3(-0.45, BED_Y + 0.12, 0);
  const soft = simulate({ start, strokeSpeed: 0.4 }).strikes[0];
  const hard = simulate({ start, strokeSpeed: 2.5 }).strikes[0];
  assert.ok(soft && hard, 'both strokes land');
  assert.ok(soft.V < 1.3, `soft stroke is soft (${soft.V.toFixed(2)})`);
  assert.ok(hard.V > 4.5, `hard stroke is hard (${hard.V.toFixed(2)})`);
});

test('gentle feathering against the ball does not fire a shot', () => {
  const start = new V3(-0.45, BED_Y + 0.12, 0);
  const { strikes, before } = simulate({ start, strokeSpeed: 1.2, feather: true });
  assert.equal(before <= 1, true);
  assert.equal(strikes.length, 1);
});

test('two hands: aiming above centre gives top spin, the line follows both hands', () => {
  const start = new V3(-0.5, BED_Y + R + 0.03, 0);
  const bridge = new V3(-0.2, BED_Y + R + 0.03, 0);      // level cue, 3 cm above centre
  const { strikes, cue } = simulate({ start, strokeSpeed: 1.2, bridge });
  assert.equal(strikes.length, 1);
  assert.equal(cue.aim.twoHand, true);
  const s = strikes[0];
  assert.ok(s.b > 0.15, `top spin applied (b=${s.b.toFixed(2)})`);
  assert.ok(Math.abs(s.a) < 0.08, `no unwanted side (a=${s.a.toFixed(2)})`);
  assert.ok(Math.abs(s.dir.z) < 0.03 && s.dir.x > 0.99, 'shot runs along the line through both hands');
});

test('two hands: line to the right of centre gives right-hand side', () => {
  const start = new V3(-0.5, BED_Y + R, 0.03);
  const bridge = new V3(-0.2, BED_Y + R, 0.03);
  const s = simulate({ start, strokeSpeed: 1.2, bridge }).strikes[0];
  assert.ok(s && s.a > 0.15, `right side applied (a=${s && s.a.toFixed(2)})`);
});

test('a viewpoint jump never fires a shot, a real stroke afterwards does', () => {
  const cue = new CueController({ setPose() {} });
  const hand = mkInput(0), inputs = [hand, mkInput(1)];
  const strikes = [];
  const ctx = { ball, canShoot: true, restTip: new V3(), restDir: new V3(0, 0, -1), power: 1, onStrike: (dir, V, a, b) => strikes.push({ V }) };
  const pos = new V3(-0.45, BED_Y + 0.12, 0);
  const dt = 1 / 72;
  const frame = () => { hand.tracked = true; hand.grab = hand.autoGrab = true; hand.gripRaw.copy(pos); hand.grip.copy(pos); cue.update(dt, inputs, ctx); };   // auto-grab, like the mouse
  for (let t = 0; t < 0.8; t += dt) frame();                 // settle behind the ball
  // the camera moves to a new stance: the same mouse position now lands 30 cm nearer the ball
  pos.x += 0.3; cue.resetStroke(); frame();
  for (let t = 0; t < 0.6; t += dt) frame();
  assert.equal(strikes.length, 0, 'the jump must not be read as a stroke');
  // ...and without the explicit reset, the speed sanity check alone catches a jump too
  pos.x -= 0.3; frame();
  for (let t = 0; t < 0.6; t += dt) frame();
  assert.equal(strikes.length, 0, 'an unannounced jump is ignored as well');
  const toBall = new V3().subVectors(ball, pos).normalize();
  for (let t = 0; t < 0.3; t += dt) { pos.addScaledVector(toBall, -0.5 * dt); frame(); }
  for (let t = 0; t < 1.0 && !strikes.length; t += dt) { pos.addScaledVector(toBall, 1.5 * dt); frame(); }
  assert.equal(strikes.length, 1, 'a real stroke after the jump still fires');
});

console.log(`\n${n} cue tests passed`);
