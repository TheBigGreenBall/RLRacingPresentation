# RL Racing League: rules presentation

A slide deck that explains the RL Racing hackathon league: what the event is, the RL vocabulary needed to follow
it, the contest rules, and the car with its 60-float observation. Everything needed to build and render the deck
lives in this directory.

| Piece | Tech | Where |
|---|---|---|
| Slides (30, with speaker notes) | reveal.js 6 served by Vite | `index.html`, `src/main.ts`, `src/slides.css` |
| Infographic clips (3) | Remotion 4 (React) | `remotion/`, rendered to `public/videos/*.mp4` + `public/posters/*.png` |
| In-slide animations (scoring, DQ rules, observation layout) | anime.js 4 timelines over live DOM/SVG | `src/anim/*.ts`, replayed on every slide entry |
| 3D car + observation scene | three.js (vanilla ES modules) | `car3d.html`, `three/*.js`; embedded in the deck as iframes |
| Real platform data | exported from the hackathon repo | `scripts/export_assets.py` -> `public/data/*.json` |
| Shared colours / fonts | `theme/theme.ts` (Remotion) and `theme/theme.css` (deck + 3D page) |
| Logo | copied from the hackathon repo `rlracing/dashboard/static/brand/` | `public/brand/logo.svg` (title slide), `public/brand/logo-mark.svg` (favicon) |

## Run it

```bash
npm install                 # also downloads Remotion's headless Chrome on first render
npm run dev                 # http://localhost:5173  (press S for speaker notes)
npm run build && npm run preview   # production build in dist/, served on :4173
```

The rendered videos, posters and data JSON are committed, so the deck works without re-rendering anything.
The scoring, DQ and observation-layout slides are animated live with anime.js (timeline restarts each time the slide is shown), so there is nothing to render for them.

## Rebuild the generated parts

```bash
npm run export:assets       # tracks.json / car.json / obs_contract.json from the hackathon repo's .venv
npm run render:videos       # the three Remotion clips (~1 min each); or: bash scripts/render_videos.sh RLLoop
npm run remotion:studio     # live-edit the compositions
node scripts/screenshot.mjs "http://localhost:5173/#/27" out.png --wait 4000   # headless check of one slide
```

`export:assets` points at `/Users/devichen/workplace/hackathon/src/CXBTRLRacingHackathon/.venv/bin/python`; change
the path in `package.json` if the repo moves.

## The 3D scene (`car3d.html`)

URL parameters: `track=oval|loop|serpent`, `camera=chase|overhead|free`, `panel=0|1` (observation readout),
`block=0..7` (highlight one observation block), `info=0` (hide the text overlay), `hud=0` (clean scene for backgrounds), `speed=1.5`.
Keys: `1`-`8` highlight a block, `0` all, `c` cycle camera, `t` cycle track, `p` toggle panel, space pause.
The deck drives it with `postMessage({type: "rlr", block, camera, visible})` from `src/main.ts`; fragments on
the "block by block" slide carry `data-obs-block`.

The ego car follows the real benchmark centerline with a scripted lateral wobble; `three/obs.js` is a port of
`rlracing/env/obs.py` + `track_math.lookahead`, so the readout shows exactly what a policy would receive.

## Facts come from

The hackathon repo (`README.md`, `docs/PARTICIPANTS.md`, `rlracing/env/obs.py`, `rlracing/judge/judge.py`,
`rlracing/leaderboard/page.py`, `rlracing/cars/config.py`, `rlracing/cars/template.py`, `rlracing/tracks/`,
`configs/baseline.yaml`). Observation contract is v2. The open class is intentionally not covered.
