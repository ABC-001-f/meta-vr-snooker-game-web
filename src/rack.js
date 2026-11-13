import { R, SPOTS, COLOURS, BAULK_X } from './config.js';

// Fill a Physics world with a standard snooker rack. reds: 15, 10 or 6.
export function rackBalls(physics, reds = 15) {
  physics.balls.length = 0;
  physics.byId.clear();
  physics.addBall('cue', 'cue', BAULK_X - 0.12, 0.11);
  for (const c of COLOURS) physics.addBall(c, c, SPOTS[c][0], SPOTS[c][1]);
  const rows = reds >= 15 ? 5 : reds >= 10 ? 4 : 3;
  const gap = 2 * R + 0.0006;
  const apexX = SPOTS.pink[0] + 2 * R + 0.003;
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i <= row; i++) {
      n++;
      physics.addBall('red' + n, 'red', apexX + row * gap * 0.8660254, (i - row / 2) * gap);
    }
  }
  return n;
}

// Put a colour back: own spot, else the highest-value free spot, else as near
// its own spot as possible toward the top cushion.
export function respotColour(physics, colour) {
  const tryAt = (x, z) => {
    if (physics.isFree(x, z, colour)) { physics.place(colour, x, z); return true; }
    return false;
  };
  if (tryAt(...SPOTS[colour])) return;
  for (let i = COLOURS.length - 1; i >= 0; i--) if (tryAt(...SPOTS[COLOURS[i]])) return;
  const [sx, sz] = SPOTS[colour];
  for (let d = 0.002; d < 3.6; d += 0.002) {
    if (sx + d < 1.7845 - R && tryAt(sx + d, sz)) return;
  }
  for (let d = 0.002; d < 3.6; d += 0.002) {
    if (sx - d > -1.7845 + R && tryAt(sx - d, sz)) return;
  }
  physics.place(colour, sx, sz);
}
