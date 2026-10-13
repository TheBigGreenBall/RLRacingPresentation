import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";
import { type Track, type Pt, fallbackTrack, fitTo, edges, polyline, sampleAt, trackLength, bandMarkup } from "./trackdraw";

const T_TOTAL = 13;        // animation seconds per loop of the episode
const SIM = 2;             // simulated seconds per animation second
const V = 15;              // m/s: progress per 50 Hz step is 0.30 m
const DT = 0.02;
const T_WALL0 = 6.0, T_WALL1 = 6.5, T_DRIFT0 = 9.5, T_DRIFT1 = 11.0;
// a shaped reward: the default plus a speed bonus and a centering penalty (both 0.0 in configs/baseline.yaml)
const W = { progress: 1.0, speed: 0.5, smoothness: 0.05, centering: 0.2, wall: 0.5, off_track: 20, flip: 20, lap_bonus: 0.0 } as const;
type TermKey = keyof typeof W;
const TERMS = Object.keys(W) as TermKey[];
const f1 = (v: number) => v.toFixed(1);
const smooth = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Deterministic per-step jitter in [0, 1) so the smoothness term flickers the same way on every loop. */
const jitter = (k: number) => { let x = (k * 1103515245 + 12345) >>> 0; x = (x ^ (x >>> 13)) * 2654435761 >>> 0; return (x >>> 8) / 16777216; };

// ------------------------------------------------------------------ the episode script (pure function of t)

interface Scene {
  s: number; lat: number; dead: boolean; wall: boolean; off: boolean; lap: boolean;
  terms: Record<TermKey, number>; step: number; sum: number; phase: "clean" | "wall" | "drift" | "end"; caption: string;
}

interface Geometry { L: number; hw: (s: number) => number }

interface Pose { s: number; lat: number; hw: number; dead: boolean; tc: number; tOff: number }

/** Where the car is at scripted time t (frozen once the episode has ended). */
function pose(t: number, g: Geometry): Pose {
  const sOf = (tt: number) => V * SIM * tt;
  const hwDrift = g.hw(sOf(T_DRIFT0));
  const l0 = 1.2 * Math.sin(1.1 * (T_DRIFT0 - 7.2));
  // the drift ends the episode when |lateral| passes half_width + 0.5 m (racing_env.off_track_margin)
  const uOff = (hwDrift + 0.5 + l0) / (hwDrift + 1.6 + l0);
  const tOff = T_DRIFT0 + uOff * (T_DRIFT1 - T_DRIFT0);
  const dead = t >= tOff;
  const tc = dead ? tOff : t;
  const s = sOf(tc), hw = g.hw(s);

  let lat: number;
  if (tc < 5.5) lat = 2 * Math.sin(1.1 * tc);
  else if (tc < T_WALL0) lat = lerp(2 * Math.sin(1.1 * 5.5), hw - 0.9, smooth((tc - 5.5) / 0.5));
  else if (tc < T_WALL1) lat = hw - 0.9;
  else if (tc < 7.2) lat = lerp(hw - 0.9, 0, smooth((tc - T_WALL1) / 0.7));
  else if (tc < T_DRIFT0) lat = 1.2 * Math.sin(1.1 * (tc - 7.2));
  else lat = lerp(l0, -(hwDrift + 1.6), (tc - T_DRIFT0) / (T_DRIFT1 - T_DRIFT0));
  return { s, lat, hw, dead, tc, tOff };
}

/** Every reward term and the running episode total at scripted time t. Mirrors rlracing/env/rewards.py. */
function scene(t: number, g: Geometry): Scene {
  const { s, lat, hw, dead, tc } = pose(t, g);
  const wall = tc >= T_WALL0 && tc < T_WALL1;
  const tLap = g.L / (V * SIM);
  const lap = tc >= tLap && tc < tLap + 0.5;
  const k = Math.floor((tc * SIM) / DT);
  const busy = wall || tc >= T_DRIFT0 || (tc >= 5.5 && tc < 7.2);
  const dA2 = 0.1 + 0.15 * jitter(k) + (busy ? 0.25 : 0);

  const terms: Record<TermKey, number> = {
    progress: W.progress * V * DT,
    speed: W.speed * V * DT,
    smoothness: -W.smoothness * dA2,
    centering: -W.centering * (lat / hw) ** 2,
    wall: wall ? -W.wall : 0,
    off_track: dead ? -W.off_track : 0,
    flip: 0,
    lap_bonus: lap ? W.lap_bonus : 0,
  };
  const step = TERMS.reduce((a, key) => a + terms[key], 0);
  // centering has no closed form: integrate (lat / half_width)² one simulated step at a time
  let cent = 0;
  for (let tt = 0; tt < tc; tt += DT / SIM) { const q = pose(tt, g); cent += (q.lat / q.hw) ** 2; }
  const sum = W.progress * s
    + W.speed * V * DT * 50 * SIM * tc
    - W.smoothness * 0.175 * 50 * SIM * tc
    - W.centering * cent
    - W.wall * 50 * SIM * Math.max(0, Math.min(tc, T_WALL1) - T_WALL0)
    - (dead ? W.off_track : 0);

  let phase: Scene["phase"], caption: string;
  if (dead) { phase = "end"; caption = "Leaving the track (0.5 m past the edge) or flipping: −20 and the episode is over."; }
  else if (wall) { phase = "wall"; caption = "Touching a wall costs 0.5 every step: one second of scraping is −25, as much as 80 m of progress."; }
  else if (tc >= T_DRIFT0) { phase = "drift"; caption = "Running wide: the centering penalty grows with (lateral / half_width)², but −20 is what really ends it."; }
  else if (tc >= 7.2) { phase = "clean"; caption = "Back on line: progress and the speed bonus dominate again; lap_completed is still a lever at 0.0."; }
  else { phase = "clean"; caption = "Each step: metres gained plus a speed bonus, minus a little for jerky inputs and for straying off centre."; }
  return { s, lat, dead, wall, off: dead, lap, terms, step, sum, phase, caption };
}

// ------------------------------------------------------------------ mount

/** "Reward shaping": a car drives one episode on the loop track while the default-reward formula lights up term by term; three tiles loop classic reward hacks. */
export function mountReward(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const trackSvg = root.querySelector(".rw-track") as SVGSVGElement;
  const stepEl = root.querySelector(".rw-step") as HTMLElement;
  const sumEl = root.querySelector(".rw-sum") as HTMLElement;
  const badge = root.querySelector(".rw-badge") as HTMLElement;
  const caption = root.querySelector(".rw-caption") as HTMLElement;
  const total = root.querySelector(".rw-total") as HTMLElement;
  const rows = new Map<TermKey, { row: HTMLElement; val: HTMLElement; fill: HTMLElement }>();
  for (const key of TERMS) {
    const row = root.querySelector<HTMLElement>(`.rw-row[data-term="${key}"]`);
    if (row) rows.set(key, { row, val: row.querySelector(".rw-val") as HTMLElement, fill: row.querySelector(".rw-fill") as HTMLElement });
  }
  const loops: JSAnimation[] = [];
  const state = { t: 0 };

  // ---- track
  let track = fallbackTrack();
  let geo: Geometry = { L: 1, hw: () => 9 };
  let fit = fitTo([], 1, 1, 0);
  let liveG: SVGGElement;
  function buildTrack(tr: Track) {
    track = tr;
    const L = trackLength(tr), n = tr.centerline.length;
    geo = { L, hw: (s) => tr.half_width[Math.round((((s / L) % 1 + 1) % 1) * n) % n] };
    const { left, right } = edges(tr, tr.centerline.map((_, i) => i));
    fit = fitTo([...left, ...right], 1040, 470, 12);
    const l0 = fit.to(left[0][0], left[0][1]), r0 = fit.to(right[0][0], right[0][1]);
    trackSvg.innerHTML = bandMarkup(tr, fit) +
      `<line x1="${f1(l0[0])}" y1="${f1(l0[1])}" x2="${f1(r0[0])}" y2="${f1(r0[1])}" stroke="#fff" stroke-width="6" stroke-dasharray="6 6"/>` +
      `<g class="rw-live"></g>`;
    liveG = trackSvg.querySelector(".rw-live") as SVGGElement;
  }
  buildTrack(track);

  function carPoint(sc: Pick<Scene, "s" | "lat">): { p: Pt; deg: number } {
    const c = sampleAt(track, sc.s, geo.L);
    const nx = -Math.sin(c.heading), ny = Math.cos(c.heading);
    return { p: fit.to(c.x + nx * sc.lat, c.y + ny * sc.lat), deg: (-c.heading * 180) / Math.PI };
  }

  const fmtVal = (v: number, w: number) => (w === 0 ? "0.00" : Math.abs(v) >= 10 ? `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(1)}` : Math.abs(v) < 0.005 ? "0.00" : `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}`);
  const fmtSigned = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}`;

  function render() {
    const t = state.t, sc = scene(t, geo);
    // trail from the last 30 samples (frozen once the episode has ended)
    const trail: Pt[] = [];
    for (let k = 30; k >= 1; k--) { const tk = t - k * 0.06; if (tk >= 0) trail.push(carPoint(pose(tk, geo)).p); }
    const { p: [X, Y], deg } = carPoint(sc);
    const fill = sc.dead ? "#5a6472" : "var(--rlr-accent)";
    const tag = sc.wall ? `<text x="${f1(X)}" y="${f1(Y - 30)}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="22" font-weight="800" fill="var(--rlr-bad)">−0.5 / step</text>` : "";
    const flash = sc.dead ? `<text x="${f1(X)}" y="${f1(Y - 40)}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="32" font-weight="800" fill="var(--rlr-bad)">−20 · episode ends</text>` : "";
    const lapTag = sc.lap ? `<text x="${f1(X)}" y="${f1(Y - 30)}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="22" font-weight="800" fill="var(--rlr-warn)">lap_completed = 1 · weight 0.0</text>` : "";
    liveG.innerHTML =
      (trail.length > 1 ? `<path class="rw-trail" d="${polyline([...trail, [X, Y]])}" fill="none" stroke="${fill}" stroke-width="4" stroke-linecap="round"/>` : "") +
      `<g transform="translate(${f1(X)} ${f1(Y)}) rotate(${f1(deg)})"><rect x="-15" y="-8" width="30" height="16" rx="5" fill="${fill}" stroke="#fff" stroke-width="1.5"/><rect x="2" y="-5" width="7" height="10" rx="2" fill="#262a30"/></g>` +
      tag + flash + lapTag;

    stepEl.textContent = fmtSigned(sc.step);
    stepEl.className = `rw-step mono ${sc.step < 0 ? "bad" : "good"}`;
    sumEl.textContent = f1(sc.sum);
    badge.textContent = sc.dead ? "OFF TRACK · EPISODE OVER" : sc.wall ? "WALL CONTACT" : sc.phase === "drift" ? "RUNNING WIDE" : "ON TRACK";
    badge.className = `rw-badge ${sc.dead ? "off" : sc.wall ? "wall" : sc.phase === "drift" ? "wall" : "ok"}`;
    caption.textContent = sc.caption;

    for (const key of TERMS) {
      const r = rows.get(key); if (!r) continue;
      const v = sc.terms[key], w = W[key];
      r.val.textContent = fmtVal(v, w);
      const active = Math.abs(v) > 1e-3 || (key === "lap_bonus" && sc.lap);
      r.row.classList.toggle("active", active);
      r.row.classList.toggle("flag", key === "lap_bonus" && sc.lap);
      r.val.className = `rw-val mono ${Math.abs(v) <= 1e-3 ? "muted" : v < 0 ? "bad" : "good"}`;
      const wpx = Math.min(1, Math.abs(v) / 0.6) * 50;
      r.fill.style.width = `${wpx.toFixed(1)}px`;
      r.fill.style.left = v < 0 ? `${(50 - wpx).toFixed(1)}px` : "50px";
      r.fill.className = `rw-fill ${v < 0 ? "bad" : "good"}${Math.abs(v) > 0.6 ? " clip" : ""}`;
    }
    total.innerHTML = `step r = <span class="${sc.step < 0 ? "bad" : "good"}">${fmtSigned(sc.step)}</span> &nbsp;·&nbsp; episode Σ = <span class="good">${f1(sc.sum)}</span>`;
  }
  render();

  fetch("data/tracks.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: { tracks: Track[] }) => {
      const loop = json.tracks.find((t) => t.name === "loop");
      if (loop) buildTrack(loop);
      render();
    })
    .catch(() => { /* keep the fallback track */ });

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".rw-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.96, 1], delay: stagger(160) }, 300)
    .add(q(".chip, .a-footer"), { opacity: [0, 1], delay: stagger(100) }, 1400);

  function start() {
    stop();
    loops.push(animate(state, { t: [0, T_TOTAL], duration: T_TOTAL * 1000, ease: "linear", loop: true, onUpdate: render }));
    // reward-hacking tiles
    loops.push(animate(q(".rw-spin"), { rotate: [0, 360], duration: 1600, ease: "linear", loop: true }));
    loops.push(animate(q(".rw-bounce"), {
      translateX: [0, 104],
      translateY: [{ to: -13, duration: 400 }, { to: 13, duration: 400 }, { to: -13, duration: 400 }, { to: 13, duration: 400 }, { to: -13, duration: 400 }, { to: 13, duration: 400 }],
      rotate: [{ to: -22, duration: 400 }, { to: 22, duration: 400 }, { to: -22, duration: 400 }, { to: 22, duration: 400 }, { to: -22, duration: 400 }, { to: 22, duration: 400 }],
      duration: 2400, ease: "linear", loop: true,
    }));
    loops.push(animate(q(".rw-crawl"), { translateX: [0, 76], duration: 4200, ease: "linear", loop: true }));
  }
  function stop() {
    for (const a of loops) a.pause();
    loops.length = 0;
    state.t = 0;
    render();
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
