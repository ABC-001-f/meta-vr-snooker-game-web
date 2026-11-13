# CueVerse VR

First-person, hand-tracked snooker for Meta Quest, running in the browser with WebXR. Name your club, pick one of four rooms, reach out, take the cue and break off. A desktop preview lets you play with a mouse on any computer.

Built with [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). Everything on screen is generated at runtime: the table, the rooms, the textures and the sound. There are no image or audio assets to ship.

## Features

- **Hand tracking.** Grab the cue with one hand and push through the white to strike. Rest it over your other hand to add top, back or side spin. Controllers work as a fallback.
- **Real snooker.** Full-size table, 15 reds, colours re-spotted, fouls, free balls, re-spotted black, and a 147 if you can make one.
- **Physics with spin.** Balls slide, roll, swerve and take side off the cushions.
- **House Pro opponent** at three skill levels, plus solo practice and two-player mode.
- **Four clubs.** A private luxury club, an underground lounge, a tournament hall with a crowd, and a cyber arena floating above a city.
- **Replays** from where you stood, overhead, or slow motion from the pocket.
- **Spatial audio.** Ball clicks, cushions, pocket drops and room tone, synthesised and positioned in 3D.

## Play it

### On a Meta Quest

1. Run `npm run dev` on a computer on the same Wi-Fi. Vite prints an address like `https://192.168.1.20:5173/`.
2. Open that address in the Quest Browser. Accept the self-signed certificate warning once.
3. Name your club and press **Enter your club**. Put the controllers down and play with your hands.

The published GitHub Pages build (see below) also works directly in the Quest Browser with no setup.

### On a desktop

Open the page and press **Desktop preview**.

| Control | Action |
|---|---|
| Mouse | Aim. Push the mouse through the white to strike; a faster push hits harder. |
| Drag the white | Place the cue ball when you have ball in hand |
| A / D | Walk round the table |
| M | Table menu |
| P | Pause |
| H | How to play |
| F | Fullscreen |
| Esc | Close a panel, otherwise pause |

### In the headset

- Reach out and close your hand on the cue to take it.
- Pinch the air and drag to walk round the table.
- Hold a palm up to open the table menu. Point and pinch to choose.
- Pinch the white and drop it in the D when you have ball in hand.

## Development

```sh
npm install
npm run dev        # https dev server on port 5173, reachable from the Quest
npm test           # physics, rules, AI and cue-stroke tests
npm run build      # production build in dist/
npm run preview    # serve the build on port 4173
```

Set `NO_SSL=1` to serve plain http, which is fine for localhost or `adb reverse`.

Handy query flags for the desktop preview: `?desktop` skips the start screen, `?desktop=play` also breaks off, `&menu=1` opens the table menu and `&help=1` opens the help panel.

## Project layout

| File | What it does |
|---|---|
| `src/main.js` | Game loop, views, input routing, panel layout, actions |
| `src/physics.js` | Ball motion with 3D spin, cushions, pockets |
| `src/rules.js` | Snooker rules: scoring, fouls, free ball, frame end |
| `src/rack.js` | Racking and re-spotting |
| `src/ai.js` | The House Pro's shot selection |
| `src/cue.js` | Hand-tracked cue stroke, aim guide |
| `src/hands.js` | WebXR hand and controller input, hand rendering |
| `src/table.js` | Table geometry and ball meshes |
| `src/environments.js` | The four clubs |
| `src/textures.js` | Procedural textures |
| `src/screens.js` | Menu panels painted on canvases |
| `src/ui.js` | Panel and pointer handling |
| `src/audio.js` | Synthesised, spatialised sound |
| `tests/` | Node tests, no browser needed |

## Publishing

The workflow in `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. In the repository settings, under **Pages**, set the source to **GitHub Actions**. The site is served over https, so the Quest Browser can open it straight away.

## Licence

MIT. See `LICENSE`.
