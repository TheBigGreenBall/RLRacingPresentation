import { animate, createTimeline, stagger, svg, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

import { type Track, type Pt, type Fit, fallbackTrack, fitTo, levelRotation, edges, polyline, mod, wrapAngle } from "./trackdraw";

const N_SAMPLES = 14;
const MAX_STARTS = 12;
const SPAWN_MS = 450;
const STD_LOOP_MS = 6000;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Deterministic PRNG so every replay of the slide draws the same fans and sparklines. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// ------------------------------------------------------------------ corner: mean line + sampled fan

interface Corner { pts: Pt[]; normals: Pt[]; hw: number[]; mean: number[]; fit: Fit; left: Pt[]; right: Pt[] }

/** The sharpest corner of a track: +-half points around the largest heading change, with an out-in-out mean line. */
function cornerOf(track: Track, half = 55): Corner {
  const n = track.centerline.length;
  let best = 0, bestK = -1;
  for (let i = 0; i < n; i++) {
    const k = Math.abs(wrapAngle(track.heading[mod(i + 1, n)] - track.heading[mod(i - 1, n)]));
    if (k > bestK) { bestK = k; best = i; }
  }
  const sign = Math.sign(wrapAngle(track.heading[mod(best + 1, n)] - track.heading[mod(best - 1, n)])) || 1; // +1 = left turn
  const idx = Array.from({ length: 2 * half + 1 }, (_, j) => mod(best - half + j, n));
  const pts = idx.map((i) => track.centerline[i] as Pt);
  const normals = idx.map((i) => [-Math.sin(track.heading[i]), Math.cos(track.heading[i])] as Pt);
  const hw = idx.map((i) => track.half_width[i]);
  const mean = idx.map((_, j) => {
    const u = (j - half) / half, g = Math.exp(-4 * u * u);
    return sign * hw[j] * (0.6 * g - 0.45 * (1 - g)); // inside at the apex, outside on entry and exit
  });
  const { left, right } = edges(track, idx);
  const fit = fitTo([...left, ...right], 820, 220, 8, levelRotation(pts));
  return { pts, normals, hw, mean, fit, left, right };
}

/** Per-sample smooth noise: two sines with fixed random phase and frequency, in units of half-width. */
const SAMPLE_NOISE = (() => {
  const rnd = lcg(7);
  return Array.from({ length: N_SAMPLES }, () => ({
    f1: 0.6 + rnd() * 0.8, p1: rnd() * 2 * Math.PI, f2: 1.8 + rnd() * 1.4, p2: rnd() * 2 * Math.PI, gain: 0.55 + rnd() * 0.45,
  }));
})();

function samplePath(c: Corner, k: number, std: number): string {
  const nz = SAMPLE_NOISE[k], last = c.pts.length - 1;
  return polyline(c.pts.map((p, j) => {
    const t = j / last;
    const wobble = 0.65 * Math.sin(2 * Math.PI * nz.f1 * t + nz.p1) + 0.35 * Math.sin(2 * Math.PI * nz.f2 * t + nz.p2);
    const off = Math.max(-0.92 * c.hw[j], Math.min(0.92 * c.hw[j], c.mean[j] + std * nz.gain * 0.8 * c.hw[j] * wobble));
    return c.fit.to(p[0] + c.normals[j][0] * off, p[1] + c.normals[j][1] * off);
  }));
}

function renderCorner(el: SVGSVGElement, c: Corner) {
  const mean = polyline(c.pts.map((p, j) => c.fit.to(p[0] + c.normals[j][0] * c.mean[j], p[1] + c.normals[j][1] * c.mean[j])));
  const band = polyline([...c.left.map((p) => c.fit.to(p[0], p[1])), ...c.right.map((p) => c.fit.to(p[0], p[1])).reverse()], true);
  el.innerHTML =
    `<path d="${band}" fill="#2b2f35"/>` +
    `<path d="${polyline(c.left.map((p) => c.fit.to(p[0], p[1])))}" fill="none" stroke="#ddd" stroke-width="3"/>` +
    `<path d="${polyline(c.right.map((p) => c.fit.to(p[0], p[1])))}" fill="none" stroke="#ddd" stroke-width="3"/>` +
    Array.from({ length: N_SAMPLES }, () => `<path class="xp-sample" d="" fill="none" stroke="var(--rlr-accent2)" stroke-width="2.5"/>`).join("") +
    `<path class="xp-mean" d="${mean}" fill="none" stroke="var(--rlr-accent)" stroke-width="5" stroke-linecap="round"/>`;
}

// ------------------------------------------------------------------ overhead map with random starts

interface MapGeo { track: Track; fit: Fit; starts: SVGGElement }

function renderMap(el: SVGSVGElement, track: Track): MapGeo {
  const idx = track.centerline.map((_, i) => i);
  const { left, right } = edges(track, idx);
  const fit = fitTo([...left, ...right], 760, 220, 10);
  const L = left.map((p) => fit.to(p[0], p[1])), R = right.map((p) => fit.to(p[0], p[1]));
  el.innerHTML =
    `<path d="${polyline(L, true)} ${polyline([...R].reverse(), true)}" fill="#2b2f35" fill-rule="evenodd"/>` +
    `<path d="${polyline(L, true)}" fill="none" stroke="#ddd" stroke-width="2.5"/>` +
    `<path d="${polyline(R, true)}" fill="none" stroke="#ddd" stroke-width="2.5"/>` +
    `<line x1="${L[0][0]}" y1="${L[0][1]}" x2="${R[0][0]}" y2="${R[0][1]}" stroke="#fff" stroke-width="6" stroke-dasharray="6 6"/>` +
    `<g class="xp-starts"></g>`;
  return { track, fit, starts: el.querySelector(".xp-starts") as SVGGElement };
}

function makeStart(g: MapGeo, rnd: () => number): SVGGElement {
  const t = g.track, n = t.centerline.length, i = Math.floor(rnd() * n);
  const lat = (rnd() * 2 - 1) * 0.6 * t.half_width[i], yaw = (rnd() * 2 - 1) * 25, h = t.heading[i], c = t.centerline[i];
  const [X, Y] = g.fit.to(c[0] - Math.sin(h) * lat, c[1] + Math.cos(h) * lat);
  const el = document.createElementNS(SVG_NS, "g");
  el.setAttribute("class", "xp-start");
  el.setAttribute("transform", `translate(${X.toFixed(1)} ${Y.toFixed(1)}) rotate(${(-h * 180 / Math.PI + yaw).toFixed(1)})`);
  el.innerHTML =
    `<line x1="0" y1="0" x2="24" y2="0" stroke="var(--rlr-warn)" stroke-width="3" stroke-linecap="round"/>` +
    `<polygon points="32,0 22,-6 22,6" fill="var(--rlr-warn)"/>` +
    `<circle r="7" fill="var(--rlr-warn)" stroke="var(--rlr-bg)" stroke-width="2"/>`;
  return el;
}

// ------------------------------------------------------------------ sparklines

function renderSpark(el: SVGSVGElement, kind: string) {
  const rnd = lcg(kind === "much" ? 11 : kind === "little" ? 3 : 5);
  const N = 60, W = 500, H = 100, pad = 8;
  const rew: number[] = [], std: number[] = [];
  for (let t = 0; t < N; t++) {
    let r: number, s: number;
    if (kind === "little") { r = 0.45 * (1 - Math.exp(-t / 6)) + (rnd() - 0.5) * 0.02; s = Math.exp(-t / 4); }
    else if (kind === "much") { r = 0.6 * (1 - Math.exp(-t / 35)) + (rnd() - 0.5) * 0.3; s = 0.8 + (rnd() - 0.5) * 0.12; }
    else { r = 0.95 * (1 - Math.exp(-t / 22)) + (rnd() - 0.5) * 0.04; s = 0.85 * Math.exp(-t / 30) + 0.12; }
    rew.push(Math.max(0, Math.min(1, r)));
    std.push(Math.max(0, Math.min(1, s)));
  }
  const x = (i: number) => pad + (i / (N - 1)) * (W - 2 * pad), y = (v: number) => H - pad - v * (H - 2 * pad);
  const d = (arr: number[]) => polyline(arr.map((v, i) => [x(i), y(v)] as Pt));
  el.innerHTML =
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--rlr-panel-border)" stroke-width="2"/>` +
    `<path class="xp-line" d="${d(std)}" fill="none" stroke="var(--rlr-warn)" stroke-width="3" stroke-linecap="round" opacity="0.9"/>` +
    `<path class="xp-line" d="${d(rew)}" fill="none" stroke="var(--rlr-good)" stroke-width="4" stroke-linecap="round"/>`;
}

// ------------------------------------------------------------------ mount

/** "Exploration versus exploitation": a sampled-action fan that narrows as policy std decays, random starts spawning on a real track, three reward/std sparklines. */
export function mountExplore(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const loops: JSAnimation[] = [];
  let spawnTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const cornerSvg = root.querySelector(".xp-corner") as SVGSVGElement;
  const mapSvg = root.querySelector(".xp-map") as SVGSVGElement;
  const stdFill = root.querySelector(".xp-std-fill") as HTMLElement;
  const stdVal = root.querySelector(".xp-std-val") as HTMLElement;
  root.querySelectorAll<SVGSVGElement>(".xp-spark").forEach((el) => renderSpark(el, el.dataset.kind ?? "healthy"));

  const state = { std: 1 };
  let corner = cornerOf(fallbackTrack());
  let map = renderMap(mapSvg, fallbackTrack());
  const live: SVGGElement[] = [];
  renderCorner(cornerSvg, corner);

  function renderStd(std: number) {
    const paths = cornerSvg.querySelectorAll<SVGPathElement>(".xp-sample");
    paths.forEach((p, k) => p.setAttribute("d", samplePath(corner, k, std)));
    stdFill.style.width = `${(std * 100).toFixed(1)}%`;
    stdVal.textContent = std.toFixed(2);
  }
  renderStd(1);

  // real geometry: the serpent's tightest corner and the loop as the overhead map
  fetch("data/tracks.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: { tracks: Track[] }) => {
      const by = (name: string) => json.tracks.find((t) => t.name === name);
      const serpent = by("serpent"), loop = by("loop");
      if (serpent) { corner = cornerOf(serpent); renderCorner(cornerSvg, corner); renderStd(state.std); }
      if (loop) { live.length = 0; map = renderMap(mapSvg, loop); }
      if (running) start();
    })
    .catch(() => { /* keep the fallback track */ });

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".xp-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.95, 1], delay: stagger(160) }, 300)
    .add(svg.createDrawable(q(".xp-line")), { draw: ["0 0", "0 1"], duration: 1400, ease: "inOutSine", delay: stagger(120) }, 1100)
    .add(q(".chip, .a-footer"), { opacity: [0, 1], delay: stagger(120) }, 2000);

  function spawn() {
    const el = makeStart(map, Math.random);
    map.starts.appendChild(el);
    live.push(el);
    animate(el, { opacity: [0, 1], duration: 350, ease: "outQuad" });
    while (live.length > MAX_STARTS) {
      const old = live.shift()!;
      animate(old, { opacity: 0, duration: 300, ease: "linear", onComplete: () => old.remove() });
    }
  }

  function start() {
    stop();
    running = true;
    // policy std decays over training; the fan of sampled lines narrows with it, then the cycle restarts
    loops.push(animate(state, { std: [1, 0.15], duration: STD_LOOP_MS, ease: "inOutSine", loop: true, loopDelay: 800, onUpdate: () => renderStd(state.std) }));
    loops.push(animate(q(".xp-mean"), { opacity: [0.7, 1], duration: 900, ease: "inOutSine", loop: true, alternate: true }));
    spawn();
    spawnTimer = setInterval(spawn, SPAWN_MS);
  }
  function stop() {
    running = false;
    for (const a of loops) a.pause();
    loops.length = 0;
    if (spawnTimer !== null) { clearInterval(spawnTimer); spawnTimer = null; }
    for (const el of live) el.remove();
    live.length = 0;
    state.std = 1;
    renderStd(1);
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
