import { Panel, GOLD, SERIF, SANS, roundRect } from './ui.js';
import { CLUBS } from './environments.js';
import { BALL_COLOR } from './config.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// game: the object main.js exposes (state, options, settings, rules, actions).
export function makePanels(game) {
  const A = game.actions;

  const lobby = new Panel(2.0, 1.2, 1600, (g, W, H, p) => {
    p.frame(g, W, H);
    g.fillStyle = GOLD; g.font = `700 76px ${SERIF}`;
    g.fillText(game.clubName.toUpperCase(), W / 2, 84, W - 120);
    g.fillStyle = '#f3ead6'; g.font = `400 32px ${SANS}`;
    g.fillText(game.banner || 'Welcome back, boss. The club is yours tonight. Pick a room and break off.', W / 2, 146, W - 120);
    g.strokeStyle = 'rgba(217,182,90,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(120, 182); g.lineTo(W - 120, 182); g.stroke();

    // the four rooms of your club
    const cw = 340, ch = 250, gap = 28, x0 = (W - (4 * cw + 3 * gap)) / 2, y0 = 208;
    CLUBS.forEach((c, i) => {
      const x = x0 + i * (cw + gap), sel = game.options.club === c.id, hot = p.hover === 'club' + i;
      roundRect(g, x, y0, cw, ch, 20);
      const gr = g.createLinearGradient(x, y0, x + cw, y0 + ch);
      gr.addColorStop(0, c.colors[0]); gr.addColorStop(1, '#050505');
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.globalAlpha = 0.9; g.fillStyle = c.colors[1];
      g.beginPath(); g.ellipse(x + cw / 2, y0 + 44, 90, 10, 0, 0, 7); g.fill();           // lamp
      const cone = g.createLinearGradient(0, y0 + 44, 0, y0 + 150);
      cone.addColorStop(0, c.colors[1]); cone.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.22; g.fillStyle = cone;
      g.beginPath(); g.moveTo(x + cw / 2 - 80, y0 + 44); g.lineTo(x + cw / 2 + 80, y0 + 44); g.lineTo(x + cw / 2 + 150, y0 + 150); g.lineTo(x + cw / 2 - 150, y0 + 150); g.fill();
      g.globalAlpha = 1; g.fillStyle = '#0d6b3a';
      g.beginPath(); g.moveTo(x + 70, y0 + 118); g.lineTo(x + cw - 70, y0 + 118); g.lineTo(x + cw - 30, y0 + 160); g.lineTo(x + 30, y0 + 160); g.fill();   // table
      g.fillStyle = '#2a160a'; g.fillRect(x + 30, y0 + 160, cw - 60, 12);
      g.restore();
      roundRect(g, x, y0, cw, ch, 20);
      g.lineWidth = sel ? 6 : hot ? 4 : 1.5; g.strokeStyle = sel || hot ? GOLD : 'rgba(217,182,90,0.4)'; g.stroke();
      g.fillStyle = '#f7efdc'; g.font = `600 28px ${SANS}`; g.fillText(c.name, x + cw / 2, y0 + 198, cw - 20);
      g.fillStyle = 'rgba(243,234,214,0.7)'; g.font = `400 22px ${SANS}`; g.fillText(c.tag, x + cw / 2, y0 + 228, cw - 20);
      if (sel) { g.fillStyle = GOLD; g.font = `700 20px ${SANS}`; g.fillText('YOU ARE HERE', x + cw / 2, y0 + 22); }
      p.buttons.push({ id: 'club' + i, x, y: y0, w: cw, h: ch, onClick: () => A.setClub(c.id) });
    });

    const label = (t, x, y) => { g.fillStyle = 'rgba(243,234,214,0.65)'; g.font = `600 27px ${SANS}`; g.textAlign = 'left'; g.fillText(t, x, y); g.textAlign = 'center'; };
    const row = (title, y, key, items) => {
      label(title, 110, y + 34);
      items.forEach(([val, text, sub], i) => {
        p.button(key + val, 330 + i * 300, y, 280, 68, text, { on: game.options[key] === val, font: 30, sub, onClick: () => { game.options[key] = val; A.refresh(); } });
      });
    };
    row('OPPONENT', 500, 'mode', [['ai', 'House Pro'], ['solo', 'Solo practice'], ['duo', 'Two players']]);
    row('FRAME', 590, 'reds', [[6, 'Quick', '6 reds'], [10, 'Club', '10 reds'], [15, 'Full', '15 reds']]);
    if (game.options.mode === 'ai') row('HOUSE PRO', 680, 'level', [['rookie', 'Rookie'], ['club', 'Club player'], ['pro', 'Professional']]);
    p.button('start', 330, 790, 600, 104, 'BREAK OFF', { primary: true, font: 46, onClick: A.startFrame });
    p.button('help', 950, 790, 320, 104, 'How to play', { font: 32, onClick: A.toggleHelp });
    g.fillStyle = 'rgba(243,234,214,0.55)'; g.font = `400 24px ${SANS}`;
    g.fillText(game.xr ? 'Point and pinch to choose.  Then reach out and grab your cue.' : 'Desktop preview: click to choose.  In play: push the mouse through the ball to strike.  A / D walk round, M menu, P pause, H help.', W / 2, H - 46);
  });

  const help = new Panel(1.6, 0.9, 1600, (g, W, H, p) => {
    p.frame(g, W, H);
    g.fillStyle = GOLD; g.font = `700 48px ${SANS}`; g.fillText('How to play', W / 2, 64);
    const col = (title, x, lines) => {
      g.textAlign = 'left';
      g.fillStyle = 'rgba(243,234,214,0.6)'; g.font = `600 24px ${SANS}`; g.fillText(title, x, 130);
      g.fillStyle = '#f3ead6'; g.font = `400 27px ${SANS}`;
      lines.forEach((t, i) => g.fillText(t, x, 184 + i * 46, W / 2 - 110));
      g.textAlign = 'center';
    };
    col('CONTROLS', 70, game.xr ? [
      'Reach out and close your hand on the cue to take it.',
      'One hand: point the cue at the white and push through.',
      'Two hands: rest the cue over your other hand for spin.',
      'Pinch the air and drag to walk round the table.',
      'Hold a palm up for the table menu. Point and pinch.',
      'Ball in hand: pinch the white and drop it in the D.',
    ] : [
      'Aim by moving the mouse behind the white ball.',
      'Push the mouse through the white to strike.',
      'A faster push is a harder shot.',
      'Ball in hand: drag the white anywhere inside the D.',
      'A and D walk round the table.  M opens the menu.',
      'P pauses.  H shows this help.  F toggles fullscreen.',
    ]);
    col('THE RULES', W / 2 + 40, [
      'Pot a red (1 point), then any colour, then a red again.',
      'Colours return to their spots while reds remain.',
      'Yellow 2, green 3, brown 4, blue 5, pink 6, black 7.',
      'Once the reds are gone, pot the colours in that order.',
      'Fouls: a miss, wrong ball first, or potting the white.',
      "A foul gives away 4 points, or the ball's value if more.",
      'Most points when the black is potted wins the frame.',
    ]);
    p.button('close', W / 2 - 160, H - 110, 320, 72, 'Close', { primary: true, font: 32, onClick: A.toggleHelp });
  });

  const score = new Panel(0.84, 0.3, 1008, (g, W, H, p) => {
    p.frame(g, W, H, 28);
    const r = game.rules;
    if (!r) return;
    const two = r.players === 2;
    const side = (i, x, align) => {
      const active = r.turn === i && !r.over;
      g.textAlign = align;
      g.fillStyle = active ? GOLD : 'rgba(243,234,214,0.6)'; g.font = `600 33px ${SANS}`;
      g.fillText((active ? '▸ ' : '') + r.names[i], x, 58, 300);
      g.fillStyle = '#ffffff'; g.font = `700 104px ${SERIF}`;
      g.fillText(String(r.scores[i]), x, 148);
      g.textAlign = 'center';
    };
    if (two) { side(0, 60, 'left'); side(1, W - 60, 'right'); } else side(0, 60, 'left');
    const cx = two ? W / 2 : W * 0.66;
    g.fillStyle = 'rgba(243,234,214,0.6)'; g.font = `600 25px ${SANS}`; g.fillText('BALL ON', cx, 46);
    const on = r.over ? null : r.freeBall ? 'free' : r.on;
    const bx = cx, by = 104;
    if (on === 'colour' || on === 'free') {
      ['yellow', 'green', 'brown', 'blue', 'pink', 'black'].forEach((c, i) => { g.fillStyle = hex(BALL_COLOR[c]); g.beginPath(); g.arc(bx - 75 + i * 30, by, 12, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.stroke(); });
    } else if (on) {
      g.fillStyle = hex(BALL_COLOR[on]); g.beginPath(); g.arc(bx, by, 28, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(bx - 9, by - 10, 6, 0, 7); g.fill();
    }
    g.fillStyle = '#f3ead6'; g.font = `600 31px ${SANS}`; g.fillText(r.onLabel(), cx, 158);
    g.fillStyle = 'rgba(243,234,214,0.6)'; g.font = `400 25px ${SANS}`;
    g.fillText(`Break ${r.break}   ·   ${r.pointsRemaining()} on the table`, cx, 196);
    g.fillStyle = game.statusColor || GOLD; g.font = `600 29px ${SANS}`;
    g.fillText(game.status || '', W / 2, 252, W - 80);
  });

  const toast = new Panel(1.3, 0.2, 1300, (g, W, H) => {
    if (!game.toastText) return;
    roundRect(g, 6, 6, W - 12, H - 12, 40);
    g.fillStyle = 'rgba(8,6,4,0.86)'; g.fill();
    g.strokeStyle = game.toastColor || GOLD; g.lineWidth = 4; g.stroke();
    g.fillStyle = game.toastColor || GOLD; g.font = `700 64px ${SERIF}`;
    g.fillText(game.toastText, W / 2, game.toastSub ? 78 : H / 2, W - 80);
    if (game.toastSub) { g.fillStyle = '#f3ead6'; g.font = `400 38px ${SANS}`; g.fillText(game.toastSub, W / 2, 148, W - 80); }
  });

  const dock = new Panel(0.46, 0.11, 920, (g, W, H, p) => {
    p.frame(g, W, H, 30);
    p.button('turnL', 24, 24, 190, H - 48, '⟲  Walk left', { font: 34, onClick: () => A.orbit(0.35) });
    p.button('menu', 230, 24, 300, H - 48, game.settingsOpen ? 'Close menu' : '☰  Menu', { font: 36, on: game.settingsOpen, onClick: A.toggleSettings });
    p.button('pause', 546, 24, 144, H - 48, game.paused ? 'Resume' : 'Pause', { font: 34, on: game.paused, onClick: A.togglePause, disabled: game.state === 'over' });
    p.button('turnR', 706, 24, 190, H - 48, 'Walk right  ⟳', { font: 34, onClick: () => A.orbit(-0.35) });
  });

  const settings = new Panel(0.78, 1.15, 1014, (g, W, H, p) => {
    p.frame(g, W, H);
    const s = game.settings, r = game.rules;
    g.fillStyle = GOLD; g.font = `700 48px ${SANS}`; g.fillText('Your table', W / 2, 62);
    let y = 110;
    const head = (t) => { g.fillStyle = 'rgba(243,234,214,0.6)'; g.font = `600 28px ${SANS}`; g.textAlign = 'left'; g.fillText(t, 50, y + 16); g.textAlign = 'center'; y += 42; };
    const btns = (items, h = 80) => {
      const w = (W - 100 - (items.length - 1) * 16) / items.length;
      items.forEach(([id, text, on, fn, dis], i) => p.button(id, 50 + i * (w + 16), y, w, h, text, { on: !!on, font: 31, onClick: fn, disabled: !!dis }));
      y += h + 18;
    };
    const over = game.state === 'over' || !r || r.over;
    head('GAME');
    btns([['pause', game.paused ? 'Resume' : 'Pause', game.paused, A.togglePause, over], ['concede', r && r.players === 2 ? 'Concede frame' : 'End frame', false, A.concede, over], ['help', 'How to play', false, A.toggleHelp]]);
    head('HOW YOU SIT AT THE TABLE');
    btns([['sit', 'Seated', s.posture === 'sit', () => A.posture('sit')], ['stand', 'Standing', s.posture === 'stand', () => A.posture('stand')], ['recenter', 'Recentre me', false, A.recenter]]);
    btns([['hUp', 'Table higher', false, () => A.adjust('eyeH', -0.03)], ['hDn', 'Table lower', false, () => A.adjust('eyeH', 0.03)], ['dIn', 'Closer', false, () => A.adjust('dist', -0.05)], ['dOut', 'Further', false, () => A.adjust('dist', 0.05)]]);
    head('AIMING HELP');
    btns([['g0', 'Off', s.guide === 'off', () => A.set('guide', 'off')], ['g1', 'Subtle', s.guide === 'subtle', () => A.set('guide', 'subtle')], ['g2', 'Beginner line', s.guide === 'beginner', () => A.set('guide', 'beginner')]]);
    head('CUE POWER');
    btns([['p0', 'Gentle', s.power === 0.7, () => A.set('power', 0.7)], ['p1', 'Natural', s.power === 1, () => A.set('power', 1)], ['p2', 'Strong', s.power === 1.4, () => A.set('power', 1.4)]]);
    head('LOOK AROUND');
    const play = game.state === 'aiming';
    btns([['v0', 'Whole table', game.viewKind === 'overview', () => A.view('overview'), !play], ['v1', 'Close-up', game.viewKind === 'closeup', () => A.view('closeup'), !play], ['v2', 'Back to shot', false, () => A.view('stance'), !play]]);
    head('REPLAY LAST SHOT');
    const rp = !play || !game.hasReplay;
    btns([['r0', 'From here', false, () => A.replay('first'), rp], ['r1', 'Overhead', false, () => A.replay('overhead'), rp], ['r2', 'Cinematic', false, () => A.replay('cinematic'), rp]]);
    head('SOUND');
    btns([['snd', s.sound ? 'Sound on' : 'Sound off', s.sound, () => A.setSound(!s.sound)], ['room', s.roomTone ? 'Room tone on' : 'Room tone off', s.roomTone, () => A.setRoomTone(!s.roomTone)]]);
    head('CLUB');
    btns([['shadow', s.shadows ? 'Shadows on' : 'Shadows off', s.shadows, () => A.set('shadows', !s.shadows)], ['newf', 'New frame', false, A.startFrame], ['lobby', 'Change room', false, A.toLobby]]);
    head('LEAVE');
    btns(game.xr ? [['exit', 'Leave the club', false, A.exitClub]] : [['full', 'Fullscreen', false, A.fullscreen], ['exit', 'Exit to start screen', false, A.exitClub]]);
  });

  return { lobby, score, toast, dock, settings, help };
}

// Big screen in the tournament hall.
export function drawBigScreen(screen, game) {
  if (!screen) return;
  const c = screen.canvas, g = c.getContext('2d'), W = c.width, H = c.height, r = game.rules;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1a5a'); bg.addColorStop(1, '#030718');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#e0c060'; g.font = `700 54px ${SERIF}`;
  g.fillText(`${game.clubName.toUpperCase()} MASTERS`, W / 2, 60, W - 60);
  if (r) {
    g.fillStyle = '#ffffff'; g.font = `700 190px ${SERIF}`;
    if (r.players === 2) {
      g.fillText(String(r.scores[0]), W * 0.25, 250); g.fillText(String(r.scores[1]), W * 0.75, 250);
      g.font = `600 40px ${SANS}`; g.fillStyle = '#cfd8ff';
      g.fillText(r.names[0], W * 0.25, 390); g.fillText(r.names[1], W * 0.75, 390);
    } else { g.fillText(String(r.scores[0]), W / 2, 250); }
    g.fillStyle = '#e0c060'; g.font = `600 38px ${SANS}`;
    g.fillText(r.over ? 'FRAME OVER' : `BREAK ${r.break}`, W / 2, 460);
  } else {
    g.fillStyle = '#ffffff'; g.font = `italic 400 60px ${SERIF}`; g.fillText('Tonight: the owner plays', W / 2, 270);
  }
  screen.texture.needsUpdate = true;
}
