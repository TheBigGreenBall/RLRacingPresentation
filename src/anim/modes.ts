import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

/** Two scripted mini races on the same oval: ghost mode (solo runs overlaid) and collision mode (one shared world). */

const CARS = [
  { name: "red", color: "#ff4d3d" },
  { name: "blue", color: "#36c3ff" },
  { name: "yellow", color: "#ffc857" },
];
const CYCLE = 12000; // ms per scripted loop
const CX = 400, CY = 250, RX = 300, RY = 160, HALF_W = 40;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** linear ramp from a to b while t goes t0 -> t1 (smoothstepped) */
const ramp = (t: number, t0: number, t1: number, a: number, b: number) => lerp(a, b, smooth((t - t0) / (t1 - t0)));

// centerline: start on the bottom of the oval, clockwise in screen coordinates
const CENTER = `M ${CX} ${CY + RY} A ${RX} ${RY} 0 1 1 ${CX} ${CY - RY} A ${RX} ${RY} 0 1 1 ${CX} ${CY + RY} Z`;

function trackSvg(kind: "ghost" | "collision"): string {
  const slots = kind === "collision" ? [0, 1, 2].map((i) => `<rect class="slot" data-i="${i}" x="-17" y="-11" width="34" height="22" rx="3" fill="none" stroke="#9aa7b6" stroke-width="2" stroke-dasharray="4 3"/>`).join("") : "";
  const cars = CARS.map((c, i) =>
    `<g class="car" data-i="${i}"><rect x="-15" y="-9" width="30" height="18" rx="4" fill="${c.color}"/><rect x="-6" y="-5" width="12" height="10" rx="2" fill="#262a30"/></g>`).join("");
  return `
<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="checker-${kind}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fff"/><rect x="4" y="4" width="4" height="4" fill="#fff"/><rect x="4" width="4" height="4" fill="#111"/><rect y="4" width="4" height="4" fill="#111"/></pattern></defs>
  <ellipse cx="${CX}" cy="${CY}" rx="${RX + HALF_W}" ry="${RY + HALF_W}" fill="#2b2f35" stroke="#dddddd" stroke-width="4"/>
  <ellipse cx="${CX}" cy="${CY}" rx="${RX - HALF_W}" ry="${RY - HALF_W}" fill="var(--rlr-bg)" stroke="#dddddd" stroke-width="4"/>
  <path class="centerline" d="${CENTER}" fill="none" stroke="#6b7786" stroke-width="2" stroke-dasharray="10 10"/>
  <rect x="${CX - 4}" y="${CY + RY - HALF_W}" width="8" height="${2 * HALF_W}" fill="url(#checker-${kind})"/>
  ${slots}
  <text class="flag" x="${CX}" y="${CY + RY - 56}" font-size="26" font-weight="800" fill="#fff" text-anchor="middle" font-family="var(--rlr-font)" opacity="0"></text>
  <text class="bang" font-size="30" font-weight="900" fill="var(--rlr-warn)" text-anchor="middle" font-family="var(--rlr-font)" opacity="0">BUMP</text>
  ${cars}
</svg>`;
}

interface Panel { path: SVGPathElement; len: number; cars: SVGGElement[]; rows: HTMLElement[]; flag: SVGTextElement; bang: SVGTextElement; slots: SVGRectElement[]; }

function setup(host: HTMLElement, kind: "ghost" | "collision"): Panel {
  const svgHost = host.querySelector(".race-svg") as HTMLElement;
  svgHost.innerHTML = trackSvg(kind);
  const svg = svgHost.querySelector("svg") as SVGSVGElement;
  const path = svg.querySelector(".centerline") as SVGPathElement;
  return {
    path, len: path.getTotalLength(),
    cars: Array.from(svg.querySelectorAll<SVGGElement>(".car")),
    rows: Array.from(host.querySelectorAll<HTMLElement>(".race-board li")),
    flag: svg.querySelector(".flag") as SVGTextElement,
    bang: svg.querySelector(".bang") as SVGTextElement,
    slots: Array.from(svg.querySelectorAll<SVGRectElement>(".slot")),
  };
}

/** World pose at lap-fraction `s` and lateral offset (+ = toward the outside wall). */
function pose(p: Panel, s: number, lateral: number) {
  const d = (((s % 1) + 1) % 1) * p.len;
  const a = p.path.getPointAtLength(d), b = p.path.getPointAtLength((d + 2) % p.len);
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const rx = (a.x - CX) / RX, ry = (a.y - CY) / RY, rn = Math.hypot(rx, ry) || 1; // radial direction ~ outward normal
  return { x: a.x + (rx / rn) * lateral, y: a.y + (ry / rn) * lateral, ang };
}
function placeEl(el: SVGElement, p: Panel, s: number, lateral: number, extraRot = 0, opacity = 1) {
  const q = pose(p, s, lateral);
  el.setAttribute("transform", `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${(q.ang + extraRot).toFixed(1)})`);
  el.setAttribute("opacity", String(opacity));
  return q;
}

export function mountModes(root: HTMLElement): SlideAnim {
  const ghost = setup(root.querySelector(".mode-ghost") as HTMLElement, "ghost");
  const coll = setup(root.querySelector(".mode-collision") as HTMLElement, "collision");
  const loops: JSAnimation[] = [];
  const clock = { t: 0 };

  // ---- ghost mode: three solo runs start on top of each other on the line and diverge by pace
  const ghostSpeed = [1 / 3.6, 1 / 4.1, 1 / 4.6]; // laps per second
  const ghostLap = ["41.8 s", "47.6 s", "53.4 s"];
  ghost.rows.forEach((row, i) => {
    row.querySelector(".sw")!.setAttribute("style", `background: ${CARS[i].color}`);
    row.querySelector(".name")!.textContent = CARS[i].name;
  });
  function ghostFrame(t: number) {
    // draw the slowest car last so the overlap reads as "ghosts" rather than one car hiding another
    ghost.cars.forEach((car, i) => placeEl(car, ghost, t * ghostSpeed[i], 0, 0, 0.62));
    ghost.rows.forEach((row, i) => {
      const done = t * ghostSpeed[i] >= 1;
      row.querySelector(".val")!.textContent = done ? `best lap ${ghostLap[i]}` : `lap 1 … ${Math.min(99, t * ghostSpeed[i] * 100).toFixed(0)} %`;
      row.classList.toggle("done", done);
    });
  }

  // ---- collision mode: staggered grid, yellow cuts across into blue at turn 1, gets spun and shoved to the wall
  const T0 = 0.6; // go
  const GRID = [
    { s: -0.012, lat: -14 }, // red, pole, inside
    { s: -0.030, lat: 14 },  // blue, outside
    { s: -0.048, lat: -14 }, // yellow, inside, row 2
  ];
  coll.slots.forEach((slot, i) => placeEl(slot, coll, GRID[i].s, GRID[i].lat));
  const T_BUMP = 1.45;
  function red(t: number) { return { s: GRID[0].s + Math.max(0, t - T0) * 0.36, lat: ramp(t, 0.8, 2.2, -14, -4), rot: 0 }; }
  function blue(t: number) {
    const slow = 0.05 * smooth((t - T_BUMP) / 0.6);
    return {
      s: GRID[1].s + Math.max(0, t - T0) * 0.30 - slow,
      lat: t < T_BUMP ? 14 : ramp(t, T_BUMP, T_BUMP + 0.35, 14, 4) + ramp(t, T_BUMP + 0.35, T_BUMP + 1.1, 0, 8),
      rot: t > T_BUMP && t < T_BUMP + 0.8 ? 16 * Math.sin((t - T_BUMP) * 20) * (1 - (t - T_BUMP) / 0.8) : 0,
    };
  }
  const T_WALL = 5.6;
  function yellow(t: number) {
    const run = Math.min(t, T_WALL);
    const base = GRID[2].s + Math.max(0, run - T0) * 0.345;
    const lost = 0.10 * smooth((run - T_BUMP) / 0.9) + Math.max(0, run - (T_BUMP + 0.9)) * 0.16; // spin, then limps
    const lat = t < 1.0 ? -14 : t < T_BUMP ? ramp(t, 1.0, T_BUMP, -14, 6) : t < T_BUMP + 0.9 ? ramp(t, T_BUMP, T_BUMP + 0.9, 6, 22) : t < T_WALL ? 22 : ramp(t, T_WALL, T_WALL + 0.4, 22, 30);
    const spin = t > T_BUMP && t < T_BUMP + 1.0 ? 360 * smooth((t - T_BUMP) / 1.0) : 0;
    const wallRot = t > T_WALL ? ramp(t, T_WALL, T_WALL + 0.4, 0, -28) : 0;
    return { s: base - lost, lat, rot: spin + wallRot };
  }
  function collisionFrame(t: number) {
    const r = red(t), b = blue(t), y = yellow(t);
    const yellowDQ = t >= T_WALL;
    const redDone = r.s >= 3;
    placeEl(coll.cars[0], coll, Math.min(r.s, 3), r.lat, r.rot, 1);
    placeEl(coll.cars[1], coll, b.s, b.lat, b.rot, 1);
    const yp = placeEl(coll.cars[2], coll, y.s, y.lat, y.rot, yellowDQ ? ramp(t, T_WALL, T_WALL + 0.6, 1, 0.35) : 1);
    coll.slots.forEach((sl) => sl.setAttribute("opacity", String(t < T0 + 0.8 ? 1 : ramp(t, T0 + 0.8, T0 + 1.6, 1, 0.25))));
    if (t > T_BUMP && t < T_BUMP + 0.9) {
      const k = smooth((t - T_BUMP) / 0.9);
      coll.bang.setAttribute("opacity", String(1 - k));
      coll.bang.setAttribute("transform", `translate(${yp.x.toFixed(0)} ${(yp.y - 30 - 30 * k).toFixed(0)})`);
    } else coll.bang.setAttribute("opacity", "0");
    coll.flag.setAttribute("opacity", redDone ? "1" : "0");
    coll.flag.textContent = redDone ? "FINISH: red, 3 laps" : "";
    const entries = [
      { i: 0, finished: redDone, dq: false, laps: Math.floor(Math.max(0, Math.min(r.s, 3))), prog: r.s, time: (3.012 / 0.36) * 10 },
      { i: 1, finished: false, dq: false, laps: Math.floor(Math.max(0, b.s)), prog: b.s, time: 0 },
      { i: 2, finished: false, dq: yellowDQ, laps: Math.floor(Math.max(0, y.s)), prog: y.s, time: 0 },
    ].sort((a, c) => {
      const ka = a.finished ? 0 : a.dq ? 2 : 1, kc = c.finished ? 0 : c.dq ? 2 : 1;
      return ka - kc || (ka === 0 ? a.time - c.time : c.laps - a.laps || c.prog - a.prog);
    });
    entries.forEach((e, rank) => {
      const row = coll.rows[rank];
      row.querySelector(".sw")!.setAttribute("style", `background: ${CARS[e.i].color}`);
      row.querySelector(".name")!.textContent = CARS[e.i].name;
      row.querySelector(".val")!.textContent = e.finished ? `finished ${e.time.toFixed(1)} s`
        : e.dq ? `DQ, hit the wall (${e.laps} lap${e.laps === 1 ? "" : "s"})`
        : t < T0 ? "on the grid" : `running, lap ${Math.min(e.laps + 1, 3)} of 3`;
      row.classList.toggle("done", e.finished);
      row.classList.toggle("dq", e.dq);
    });
  }

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(Array.from(root.querySelectorAll<HTMLElement>(".mode-card")), { opacity: [0, 1], translateY: [40, 0], delay: stagger(200) }, 0)
    .add(Array.from(root.querySelectorAll<HTMLElement>(".mode-note")), { opacity: [0, 1] }, 900);

  function start() {
    stop();
    clock.t = 0;
    loops.push(animate(clock, {
      t: [0, CYCLE / 1000], duration: CYCLE, ease: "linear", loop: true,
      onUpdate: () => { ghostFrame(clock.t); collisionFrame(clock.t); },
    }));
  }
  function stop() { for (const a of loops) a.pause(); loops.length = 0; }
  ghostFrame(0); collisionFrame(0);

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
