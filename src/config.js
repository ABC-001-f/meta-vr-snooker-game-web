// Real snooker dimensions, in metres. Table-local axes: x runs along the
// length (baulk end at -x, black end at +x), z across the width, y up.
export const R = 0.02625;            // ball radius (52.5 mm ball)
export const L = 1.7845;             // half length of the playing area (3569 mm)
export const W = 0.889;              // half width of the playing area (1778 mm)
export const BED_Y = 0.82;           // cloth height above the floor
export const BALL_Y = BED_Y + R;
export const CW = 0.045;             // cushion depth, nose to wooden rail
export const RAIL_TOP = BED_Y + 0.042;
export const RAIL_W = 0.115;         // wooden rail width
export const CORNER_CUT = 0.075;     // cushion cut back from each corner
export const MID_GAP = 0.062;        // half width of a middle pocket mouth
export const BAULK_X = -L + 0.737;
export const D_R = 0.292;

export const SPOTS = {
  yellow: [BAULK_X, D_R],
  green: [BAULK_X, -D_R],
  brown: [BAULK_X, 0],
  blue: [0, 0],
  pink: [L / 2, 0],
  black: [L - 0.324, 0],
};

export const COLOURS = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];
export const VALUE = { red: 1, yellow: 2, green: 3, brown: 4, blue: 5, pink: 6, black: 7 };

export const BALL_COLOR = {
  cue: 0xf3eedb,
  red: 0xa80c14,
  yellow: 0xf0c20c,
  green: 0x0a6e36,
  brown: 0x5e3217,
  blue: 0x1240ad,
  pink: 0xee86a6,
  black: 0x0a0a0c,
};

// Pocket centres and capture radius. The same circles cut the cloth, so a ball
// drops exactly where the cloth visibly ends.
export const POCKETS = [
  { x: -(L + 0.012), z: -(W + 0.012), r: 0.052, corner: true },
  { x: -(L + 0.012), z: W + 0.012, r: 0.052, corner: true },
  { x: L + 0.012, z: -(W + 0.012), r: 0.052, corner: true },
  { x: L + 0.012, z: W + 0.012, r: 0.052, corner: true },
  { x: 0, z: -(W + 0.045), r: 0.06, corner: false },
  { x: 0, z: W + 0.045, r: 0.06, corner: false },
];

export const CUE_LENGTH = 1.47;
